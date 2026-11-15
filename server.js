// Sonora — serveur local (aucune dépendance npm requise, Node 18+)
// - Sert l'interface web (dossier /public), installable sur téléphone (PWA)
// - Audius : artistes indépendants, titres complets (gratuit, sans clé)
// - Deezer : catalogue officiel (recherche, pochettes, recommandations ; sans clé)
// - YouTube : lecture des titres officiels en entier (clé API gratuite)
// - Données perso dans /data (bibliothèque, goûts appris, caches)

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const createRecommender = require('./recommender');

const PORT = process.env.PORT || 3000;
const APP_NAME = 'sonora-local-player';
const AUDIUS = 'https://api.audius.co/v1';
const DEEZER = 'https://api.deezer.com';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const YT_CONFIG_FILE = path.join(DATA_DIR, 'youtube.json');
const YT_CACHE_FILE = path.join(DATA_DIR, 'youtube-cache.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

// ---------- Fichiers JSON ----------
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // écriture atomique
}
function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function readLibrary() {
  const lib = readJSON(LIBRARY_FILE, {});
  return {
    liked: Array.isArray(lib.liked) ? lib.liked : [],
    playlists: Array.isArray(lib.playlists) ? lib.playlists : [],
  };
}

// ---------- Audius ----------
async function audius(endpoint, params = {}) {
  const url = new URL(AUDIUS + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  url.searchParams.set('app_name', APP_NAME);
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Audius a répondu ${res.status}`);
  return (await res.json()).data;
}

function normTrack(t) {
  return {
    id: t.id,
    title: (t.title || 'Sans titre').trim(),
    artist: t.user?.name || 'Artiste inconnu',
    artwork: t.artwork?.['480x480'] || t.artwork?.['150x150'] || null,
    duration: t.duration || 0,
    genre: t.genre || '',
    source: 'audius',
  };
}
const playable = (t) => t && t.id && t.is_streamable !== false && !t.is_delete;

function normPlaylist(p) {
  return {
    id: p.id,
    name: (p.playlist_name || 'Playlist').trim(),
    artist: p.user?.name || '',
    artwork: p.artwork?.['480x480'] || p.artwork?.['150x150'] || null,
    trackCount: p.track_count || 0,
  };
}

// ---------- Deezer (catalogue officiel) ----------
async function deezer(endpoint, attempt = 0) {
  const res = await fetch(DEEZER + endpoint, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Deezer a répondu ${res.status}`);
  const json = await res.json();
  if (json.error) {
    // Code 4 = limite de débit (50 requêtes / 5 s) : on patiente puis on réessaie
    if (json.error.code === 4 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return deezer(endpoint, attempt + 1);
    }
    throw new Error(json.error.message || 'Erreur Deezer');
  }
  return json;
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

const reco = createRecommender({
  deezer, normDeezer, readLibrary,
  store: {
    read: (name, fallback) => readJSON(path.join(DATA_DIR, name + '.json'), fallback),
    write: (name, data) => writeJSON(path.join(DATA_DIR, name + '.json'), data),
  },
});

// ---------- YouTube (lecture complète via le lecteur officiel intégrable) ----------
const ytKey = () => readJSON(YT_CONFIG_FILE, {}).apiKey || process.env.YOUTUBE_API_KEY || '';

async function youtubeSearch(q) {
  const key = ytKey();
  if (!key) throw httpError('Clé YouTube non configurée', 400);
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.search = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', videoCategoryId: '10',
    maxResults: '6', q, key,
  });
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = j.error?.errors?.[0]?.reason || '';
    if (reason === 'quotaExceeded') throw httpError('Quota YouTube du jour atteint (environ 100 nouveaux titres par jour). Réessaie demain.', 429);
    if (res.status === 400 || res.status === 403) throw httpError('Clé YouTube refusée : ' + (j.error?.message || reason), 403);
    throw httpError(`YouTube a répondu ${res.status}`, 502);
  }
  // Classement : audio officiel des labels (chaînes « - Topic ») d'abord, puis « official audio », puis le reste
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

// ---------- Réseau local (accès depuis le téléphone) ----------
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback/i.test(name)) continue;
      out.push({ name, url: `http://${a.address}:${PORT}`, tailscale: a.address.startsWith('100.') });
    }
  }
  return out;
}

// ---------- HTTP helpers ----------
function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(httpError('Corps de requête trop volumineux', 413)); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const readJSONBody = async (req) => JSON.parse((await readBody(req)) || '{}');

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return sendJSON(res, 403, { error: 'Interdit' });
  fs.readFile(file, (err, buf) => {
    if (err) {
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
        if (e2) return sendJSON(res, 404, { error: 'Introuvable' });
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        res.end(html);
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// ---------- Routes API ----------
async function handleApi(req, res, url) {
  const p = url.pathname;
  const q = url.searchParams;
  const GET = req.method === 'GET', POST = req.method === 'POST';

  if (p === '/api/trending' && GET) {
    const data = await audius('/tracks/trending', { genre: q.get('genre'), time: q.get('time') || 'week', limit: 40 });
    return sendJSON(res, 200, (data || []).filter(playable).map(normTrack));
  }

  if (p === '/api/search' && GET) {
    const query = (q.get('q') || '').trim();
    if (!query) return sendJSON(res, 200, { tracks: [], playlists: [], catalog: [] });
    const [tracks, playlists, dz] = await Promise.all([
      audius('/tracks/search', { query, limit: 30 }).catch(() => []),
      audius('/playlists/search', { query, limit: 12 }).catch(() => []),
      deezer(`/search?limit=20&q=${encodeURIComponent(query)}`).catch(() => ({ data: [] })),
    ]);
    return sendJSON(res, 200, {
      tracks: (tracks || []).filter(playable).map(normTrack),
      playlists: (playlists || []).map(normPlaylist),
      catalog: (dz.data || []).filter((t) => t.readable !== false).map(normDeezer),
    });
  }

  let m = p.match(/^\/api\/playlist\/([\w-]+)$/);
  if (m && GET) {
    const [info, tracks] = await Promise.all([audius(`/playlists/${m[1]}`), audius(`/playlists/${m[1]}/tracks`)]);
    const meta = Array.isArray(info) ? info[0] : info;
    return sendJSON(res, 200, {
      playlist: meta ? normPlaylist(meta) : { id: m[1], name: 'Playlist' },
      tracks: (tracks || []).filter(playable).map(normTrack),
    });
  }

  m = p.match(/^\/api\/stream\/([\w-]+)$/);
  if (m && GET) {
    if (m[1].startsWith('dz-')) {
      // Extrait Deezer : l'URL signée expire, on la redemande à chaque lecture
      const t = await deezer(`/track/${encodeURIComponent(m[1].slice(3))}`);
      if (!t.preview) return sendJSON(res, 404, { error: 'Extrait indisponible' });
      res.writeHead(302, { Location: t.preview, 'Cache-Control': 'no-store' });
      return res.end();
    }
    res.writeHead(302, { Location: `${AUDIUS}/tracks/${m[1]}/stream?app_name=${APP_NAME}` });
    return res.end();
  }

  // --- Recommandations ---
  if (p === '/api/recommendations' && GET) return sendJSON(res, 200, await reco.recommendations(30));
  if (p === '/api/mixes' && GET) return sendJSON(res, 200, await reco.mixes());
  m = p.match(/^\/api\/mix\/([\w-]+)$/);
  if (m && GET) {
    const r = await reco.mixTracks(m[1], q.get('refresh') === '1');
    return r ? sendJSON(res, 200, r) : sendJSON(res, 404, { error: 'Mix introuvable' });
  }
  if (p === '/api/weekly' && GET) return sendJSON(res, 200, await reco.weekly());

  if (p === '/api/radio' && GET) {
    // Radio d'artiste : titres de l'artiste et d'artistes proches
    const name = (q.get('artist') || '').split(',')[0].trim();
    if (!name) return sendJSON(res, 400, { error: 'Artiste manquant' });
    const id = await reco.artistId(name, q.get('trackId'));
    if (!id) return sendJSON(res, 404, { error: `Artiste « ${name} » introuvable` });
    const r = await deezer(`/artist/${id}/radio?limit=40`);
    const tracks = reco.filterBanned((r.data || []).filter((t) => t.readable !== false).map(normDeezer));
    return sendJSON(res, 200, { artist: name, tracks });
  }

  // --- Apprentissage des goûts ---
  if (p === '/api/signal' && POST) {
    const { track, type } = await readJSONBody(req);
    reco.recordSignal(track, type);
    return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/feedback' && POST) {
    const { track, scope } = await readJSONBody(req);
    if (!track?.id) return sendJSON(res, 400, { error: 'Titre manquant' });
    reco.ban(track, scope === 'artist' ? 'artist' : 'track');
    return sendJSON(res, 200, { ok: true });
  }
  if (p === '/api/taste' && GET) return sendJSON(res, 200, reco.tasteSummary());
  if (p === '/api/taste/unban' && POST) {
    const { kind, key } = await readJSONBody(req);
    reco.unban(kind, key);
    return sendJSON(res, 200, { ok: true });
  }

  // --- YouTube ---
  if (p === '/api/youtube/status' && GET) return sendJSON(res, 200, { configured: !!ytKey() });

  if (p === '/api/youtube/config' && POST) {
    const { apiKey } = await readJSONBody(req);
    const key = String(apiKey || '').trim();
    if (!/^[\w-]{30,60}$/.test(key)) return sendJSON(res, 400, { error: 'Clé invalide : elle commence généralement par « AIza ».' });
    const previous = readJSON(YT_CONFIG_FILE, {});
    writeJSON(YT_CONFIG_FILE, { apiKey: key });
    try {
      await youtubeSearch('test music'); // vérifie la clé tout de suite
    } catch (e) {
      writeJSON(YT_CONFIG_FILE, previous);
      throw e;
    }
    return sendJSON(res, 200, { ok: true });
  }

  if (p === '/api/youtube/resolve' && GET) {
    const title = (q.get('title') || '').trim();
    const artist = (q.get('artist') || '').trim();
    if (!title) return sendJSON(res, 400, { error: 'Titre manquant' });
    const cacheKey = `${artist}|${title}`.toLowerCase();
    const cache = readJSON(YT_CACHE_FILE, {});
    if (cache[cacheKey] && q.get('refresh') !== '1') return sendJSON(res, 200, { ids: cache[cacheKey], cached: true });
    const ids = await youtubeSearch(`${artist.split(',')[0].trim()} - ${title}`);
    if (!ids.length) return sendJSON(res, 404, { error: 'Introuvable sur YouTube' });
    cache[cacheKey] = ids;
    writeJSON(YT_CACHE_FILE, cache);
    return sendJSON(res, 200, { ids, cached: false });
  }

  // --- Divers ---
  if (p === '/api/server-info' && GET) return sendJSON(res, 200, { port: PORT, addresses: lanAddresses() });

  // --- Bibliothèque ---
  if (p === '/api/library' && GET) return sendJSON(res, 200, readLibrary());

  if (p === '/api/library' && req.method === 'PUT') {
    const body = await readJSONBody(req);
    if (!Array.isArray(body.liked) || !Array.isArray(body.playlists)) {
      return sendJSON(res, 400, { error: 'Format de bibliothèque invalide' });
    }
    writeJSON(LIBRARY_FILE, { liked: body.liked, playlists: body.playlists });
    return sendJSON(res, 200, { ok: true });
  }

  return sendJSON(res, 404, { error: 'Route inconnue' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, url);
    } catch (err) {
      console.error('[API]', url.pathname, err.message);
      if (err.status) sendJSON(res, err.status, { error: err.message });
      else if (err instanceof SyntaxError) sendJSON(res, 400, { error: 'Requête invalide' });
      else sendJSON(res, 502, { error: 'Impossible de joindre le service musical. Vérifie ta connexion Internet.' });
    }
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`\n  ♪ Sonora est lancé : http://localhost:${PORT}`);
  const lan = lanAddresses();
  if (lan.length) {
    console.log('  Sur ton téléphone :');
    lan.forEach((a) => console.log(`    ${a.url}   (${a.tailscale ? 'Tailscale, partout' : 'même Wi-Fi'})`));
  }
  console.log('  (Ctrl+C pour arrêter)\n');
});
