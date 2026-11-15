/* Sonora — « serveur de poche »
 * Dans la version en ligne (sans PC), ce fichier remplace server.js : il répond, directement dans le
 * navigateur, aux mêmes adresses /api/... que l'interface utilise. Les données (bibliothèque, goûts
 * appris, caches) sont gardées dans le stockage du navigateur de l'appareil.
 */
(function () {
  'use strict';

  const CFG = window.SONORA_CONFIG || {};
  const APP_NAME = 'sonora-web-player';
  const AUDIUS = 'https://api.audius.co/v1';
  const realFetch = window.fetch.bind(window);
  window.SONORA_STATIC = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const httpError = (message, status) => Object.assign(new Error(message), { status });

  // ---------- Stockage local ----------
  const PREFIX = 'sonora.data.';
  const CACHE_KEYS = ['deezer-related', 'deezer-artists', 'youtube-cache'];
  const store = {
    read(name, fallback) {
      try {
        const v = localStorage.getItem(PREFIX + name);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    write(name, data) {
      const s = JSON.stringify(data);
      try {
        localStorage.setItem(PREFIX + name, s);
      } catch {
        // Stockage plein : on libère les caches (reconstructibles), jamais les données perso
        CACHE_KEYS.filter((k) => k !== name).forEach((k) => localStorage.removeItem(PREFIX + k));
        try { localStorage.setItem(PREFIX + name, s); } catch { /* abandon silencieux pour un cache */ }
      }
    },
  };

  function readLibrary() {
    const lib = store.read('library', null) || {};
    return {
      liked: Array.isArray(lib.liked) ? lib.liked : [],
      playlists: Array.isArray(lib.playlists) ? lib.playlists : [],
    };
  }

  // Premier lancement : on charge la bibliothèque de départ (tes titres likés)
  const ready = (async () => {
    if (store.read('library', null)) return;
    try {
      const r = await realFetch('seed-library.json', { cache: 'no-store' });
      store.write('library', r.ok ? await r.json() : { liked: [], playlists: [] });
    } catch {
      store.write('library', { liked: [], playlists: [] });
    }
  })();

  // ---------- Deezer (JSONP : l'API n'autorise pas les appels directs depuis un navigateur) ----------
  let jsonpN = 0;
  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = `__sonora_dz${++jsonpN}`;
      const s = document.createElement('script');
      const done = () => { clearTimeout(timer); window[cb] = () => {}; s.remove(); };
      const timer = setTimeout(() => { done(); reject(new Error('Deezer ne répond pas. Vérifie ta connexion.')); }, 12000);
      window[cb] = (data) => { done(); resolve(data); };
      s.onerror = () => { done(); reject(new Error('Deezer est injoignable. Vérifie ta connexion.')); };
      s.src = url + (url.includes('?') ? '&' : '?') + 'output=jsonp&callback=' + cb;
      document.head.appendChild(s);
    });
  }

  async function deezer(endpoint, attempt = 0) {
    const j = await jsonp('https://api.deezer.com' + endpoint);
    if (j && j.error) {
      if (j.error.code === 4 && attempt < 3) { // limite de débit
        await sleep(1500 * (attempt + 1));
        return deezer(endpoint, attempt + 1);
      }
      throw new Error(j.error.message || 'Erreur Deezer');
    }
    return j;
  }

  function normDeezer(t) {
    return {
      id: 'dz-' + t.id,
      title: (t.title || 'Sans titre').trim(),
      artist: t.artist?.name || 'Artiste inconnu',
      artwork: t.album?.cover_big || t.album?.cover_medium || null,
      duration: t.duration || 30,
      genre: '',
      source: 'deezer',
      preview: true,
      link: t.link || `https://www.deezer.com/track/${t.id}`,
    };
  }

  // ---------- Audius ----------
  async function audius(endpoint, params = {}) {
    const url = new URL(AUDIUS + endpoint);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    url.searchParams.set('app_name', APP_NAME);
    const res = await realFetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`Audius a répondu ${res.status}`);
    return (await res.json()).data;
  }
  const normTrack = (t) => ({
    id: t.id,
    title: (t.title || 'Sans titre').trim(),
    artist: t.user?.name || 'Artiste inconnu',
    artwork: t.artwork?.['480x480'] || t.artwork?.['150x150'] || null,
    duration: t.duration || 0,
    genre: t.genre || '',
    source: 'audius',
  });
  const playable = (t) => t && t.id && t.is_streamable !== false && !t.is_delete;
  const normPlaylist = (p) => ({
    id: p.id,
    name: (p.playlist_name || 'Playlist').trim(),
    artist: p.user?.name || '',
    artwork: p.artwork?.['480x480'] || p.artwork?.['150x150'] || null,
    trackCount: p.track_count || 0,
  });

  // ---------- YouTube ----------
  const ytKey = () => store.read('youtube', {}).apiKey || CFG.youtubeKey || '';

  async function youtubeSearch(q, key = ytKey()) {
    if (!key) throw httpError('Clé YouTube non configurée', 400);
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.search = new URLSearchParams({
      part: 'snippet', type: 'video', videoEmbeddable: 'true', videoCategoryId: '10', maxResults: '6', q, key,
    });
    const res = await realFetch(url, { signal: AbortSignal.timeout(12000) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = j.error?.errors?.[0]?.reason || '';
      if (reason === 'quotaExceeded') throw httpError('Quota YouTube du jour atteint (environ 100 nouveaux titres par jour). Réessaie demain.', 429);
      if (res.status === 400 || res.status === 403) throw httpError('Clé YouTube refusée : ' + (j.error?.message || reason), 403);
      throw httpError(`YouTube a répondu ${res.status}`, 502);
    }
    const score = (it) => {
      const ch = it.snippet.channelTitle || '';
      const ti = (it.snippet.title || '').toLowerCase();
      let s = 0;
      if (/ - topic$/i.test(ch)) s += 4;
      if (/official audio|audio officiel/.test(ti)) s += 3;
      if (/vevo/i.test(ch)) s += 2;
      if (/official/.test(ti)) s += 1;
      if (/live|cover|karaoke|slowed|sped up|reverb|8d|lyrics?/.test(ti)) s -= 3;
      return s;
    };
    return (j.items || [])
      .filter((it) => it.id?.videoId)
      .map((it, i) => ({ id: it.id.videoId, s: score(it) - i * 0.1 }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.id);
  }

  // ---------- Recommandations (même moteur que le serveur) ----------
  const reco = window.createRecommender({ deezer, normDeezer, readLibrary, store });

  // ---------- Routes ----------
  async function route(method, path, q, body) {
    await ready;
    const GET = method === 'GET', POST = method === 'POST';
    let m;

    if (path === '/api/library' && GET) return readLibrary();
    if (path === '/api/library' && method === 'PUT') {
      if (!Array.isArray(body?.liked) || !Array.isArray(body?.playlists)) throw httpError('Format de bibliothèque invalide', 400);
      store.write('library', { liked: body.liked, playlists: body.playlists });
      return { ok: true };
    }

    if (path === '/api/trending' && GET) {
      const data = await audius('/tracks/trending', { genre: q.get('genre'), time: q.get('time') || 'week', limit: 40 });
      return (data || []).filter(playable).map(normTrack);
    }

    if (path === '/api/search' && GET) {
      const query = (q.get('q') || '').trim();
      if (!query) return { tracks: [], playlists: [], catalog: [] };
      const [tracks, playlists, dz] = await Promise.all([
        audius('/tracks/search', { query, limit: 30 }).catch(() => []),
        audius('/playlists/search', { query, limit: 12 }).catch(() => []),
        deezer(`/search?limit=20&q=${encodeURIComponent(query)}`).catch(() => ({ data: [] })),
      ]);
      return {
        tracks: (tracks || []).filter(playable).map(normTrack),
        playlists: (playlists || []).map(normPlaylist),
        catalog: (dz.data || []).filter((t) => t.readable !== false).map(normDeezer),
      };
    }

    if ((m = path.match(/^\/api\/playlist\/([\w-]+)$/)) && GET) {
      const [info, tracks] = await Promise.all([audius(`/playlists/${m[1]}`), audius(`/playlists/${m[1]}/tracks`)]);
      const meta = Array.isArray(info) ? info[0] : info;
      return {
        playlist: meta ? normPlaylist(meta) : { id: m[1], name: 'Playlist' },
        tracks: (tracks || []).filter(playable).map(normTrack),
      };
    }

    if ((m = path.match(/^\/api\/stream-url\/([\w-]+)$/)) && GET) {
      if (m[1].startsWith('dz-')) {
        const t = await deezer(`/track/${encodeURIComponent(m[1].slice(3))}`);
        if (!t.preview) throw httpError('Extrait indisponible', 404);
        return { url: t.preview };
      }
      return { url: `${AUDIUS}/tracks/${m[1]}/stream?app_name=${APP_NAME}` };
    }

    // Recommandations
    if (path === '/api/recommendations' && GET) return reco.recommendations(30);
    if (path === '/api/mixes' && GET) return reco.mixes();
    if ((m = path.match(/^\/api\/mix\/([\w-]+)$/)) && GET) {
      const r = await reco.mixTracks(m[1], q.get('refresh') === '1');
      if (!r) throw httpError('Mix introuvable', 404);
      return r;
    }
    if (path === '/api/weekly' && GET) return reco.weekly();
    if (path === '/api/radio' && GET) {
      const name = (q.get('artist') || '').split(',')[0].trim();
      if (!name) throw httpError('Artiste manquant', 400);
      const id = await reco.artistId(name, q.get('trackId'));
      if (!id) throw httpError(`Artiste « ${name} » introuvable`, 404);
      const r = await deezer(`/artist/${id}/radio?limit=40`);
      return { artist: name, tracks: reco.filterBanned((r.data || []).filter((t) => t.readable !== false).map(normDeezer)) };
    }

    // Apprentissage
    if (path === '/api/signal' && POST) { reco.recordSignal(body?.track, body?.type); return { ok: true }; }
    if (path === '/api/feedback' && POST) {
      if (!body?.track?.id) throw httpError('Titre manquant', 400);
      reco.ban(body.track, body.scope === 'artist' ? 'artist' : 'track');
      return { ok: true };
    }
    if (path === '/api/taste' && GET) return reco.tasteSummary();
    if (path === '/api/taste/unban' && POST) { reco.unban(body?.kind, body?.key); return { ok: true }; }

    // YouTube
    if (path === '/api/youtube/status' && GET) return { configured: !!ytKey() };
    if (path === '/api/youtube/config' && POST) {
      const key = String(body?.apiKey || '').trim();
      if (!/^[\w-]{30,60}$/.test(key)) throw httpError('Clé invalide : elle commence généralement par « AIza ».', 400);
      await youtubeSearch('test music', key); // vérifie la clé
      store.write('youtube', { apiKey: key });
      return { ok: true };
    }
    if (path === '/api/youtube/resolve' && GET) {
      const title = (q.get('title') || '').trim();
      const artist = (q.get('artist') || '').trim();
      if (!title) throw httpError('Titre manquant', 400);
      const cacheKey = `${artist}|${title}`.toLowerCase();
      const cache = store.read('youtube-cache', {});
      if (cache[cacheKey] && q.get('refresh') !== '1') return { ids: cache[cacheKey], cached: true };
      const ids = await youtubeSearch(`${artist.split(',')[0].trim()} - ${title}`);
      if (!ids.length) throw httpError('Introuvable sur YouTube', 404);
      cache[cacheKey] = ids;
      store.write('youtube-cache', cache);
      return { ids, cached: false };
    }

    // Sauvegarde / restauration (changement de téléphone, données effacées…)
    if (path === '/api/backup' && GET) {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(PREFIX) && k !== PREFIX + 'deezer-related') data[k.slice(PREFIX.length)] = store.read(k.slice(PREFIX.length), null);
      }
      return { app: 'sonora', version: 1, exportedAt: new Date().toISOString(), data };
    }
    if (path === '/api/restore' && POST) {
      if (body?.app !== 'sonora' || typeof body.data !== 'object') throw httpError('Ce fichier n\'est pas une sauvegarde Sonora', 400);
      if (!body.data.library) throw httpError('Sauvegarde incomplète (bibliothèque absente)', 400);
      for (const [k, v] of Object.entries(body.data)) store.write(k, v);
      return { ok: true };
    }

    if (path === '/api/server-info' && GET) return { static: true, addresses: [] };

    throw httpError('Route inconnue', 404);
  }

  // Intercepte les appels /api/... de l'interface ; le reste passe normalement
  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, init);
    const u = new URL(url, location.href);
    let body = null;
    if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = null; } }
    const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    try {
      return json(200, await route((init.method || 'GET').toUpperCase(), u.pathname, u.searchParams, body));
    } catch (e) {
      console.warn('[Sonora]', u.pathname, e.message);
      return json(e.status || 502, { error: e.message || 'Erreur' });
    }
  };
})();
