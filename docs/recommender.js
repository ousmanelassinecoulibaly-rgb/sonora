// Sonora — moteur de recommandation
//
// Principe : tes artistes (likes + écoute) → artistes similaires Deezer (niveau 1 et 2)
// → on écarte ce que tu connais déjà et ce que tu as banni → score → meilleurs titres et pépites.
//
// Apprentissage :
//   - titre écouté jusqu'au bout (≥ 80 %)   → artiste +0,5
//   - titre passé dans les 30 premières s   → artiste −0,5
//   - « Pas pour moi »                       → titre ou artiste banni des recommandations
// Mixes par style : regroupement automatique de tes artistes selon leurs liens de similarité.
// Découvertes de la semaine : renouvelées chaque lundi, sans jamais reproposer un titre déjà suggéré.

// Fonctionne côté serveur (Node) ET dans le navigateur (version en ligne) :
// le stockage est fourni par l'appelant via store.read(nom, défaut) / store.write(nom, données).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.createRecommender = factory();
})(typeof self !== 'undefined' ? self : this, function () {

const DAY = 24 * 3600 * 1000;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\$/g, 's').replace(/[^a-z0-9]/g, '');
const splitArtists = (s) => String(s || '').split(/,|&| feat\.? | ft\.? | x /i).map((x) => x.trim()).filter(Boolean);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Tirage pondéré sans remise (les poids forts ont plus de chances, les autres passent parfois)
function weightedSample(items, n, weightOf) {
  return items
    .map((it) => ({ it, r: Math.random() ** (1 / Math.max(0.05, weightOf(it))) }))
    .sort((a, b) => b.r - a.r)
    .slice(0, n)
    .map((x) => x.it);
}

// Concurrence limitée (Deezer : ~50 requêtes / 5 s)
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]).catch(() => null);
    }
  }));
  return out;
}

// Lundi de la semaine en cours (clé des Découvertes de la semaine)
function weekKey(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

// Empreinte simple d'une chaîne (détecte un changement de bibliothèque)
function hashString(s) {
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
    h2 = (h2 * 31 + s.charCodeAt(i)) | 0;
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

return function createRecommender({ deezer, normDeezer, readLibrary, store }) {
  const ARTISTS_FILE = 'deezer-artists';
  const RELATED_FILE = 'deezer-related';
  const SIGNALS_FILE = 'taste-signals';
  const readJSON = (name, fallback) => store.read(name, fallback);
  const writeJSON = (name, data) => store.write(name, data);

  // ---------- Caches persistants (chargés une fois, écrits en différé) ----------
  let artistIds = null, relatedCache = null, saveTimer = null;
  const loadCaches = () => {
    if (!artistIds) artistIds = readJSON(ARTISTS_FILE, {});
    if (!relatedCache) relatedCache = readJSON(RELATED_FILE, {});
  };
  const saveCaches = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      writeJSON(ARTISTS_FILE, artistIds);
      writeJSON(RELATED_FILE, relatedCache);
    }, 500);
  };
  const memo = new Map();
  async function cached(endpoint, ttl = 12 * 3600 * 1000) {
    const hit = memo.get(endpoint);
    if (hit && Date.now() - hit.at < ttl) return hit.data;
    const data = await deezer(endpoint);
    memo.set(endpoint, { at: Date.now(), data });
    return data;
  }

  async function artistId(name, trackId) {
    loadCaches();
    const key = norm(name);
    if (!key) return null;
    if (artistIds[key]) return artistIds[key];
    let id = null;
    if (trackId && String(trackId).startsWith('dz-')) {
      const t = await cached(`/track/${String(trackId).slice(3)}`).catch(() => null);
      if (t?.artist && norm(t.artist.name) === key) id = t.artist.id;
      // L'artiste peut être un invité du titre
      if (!id) id = (t?.contributors || []).find((c) => norm(c.name) === key)?.id || null;
    }
    if (!id) {
      const r = await cached(`/search/artist?limit=3&q=${encodeURIComponent(name)}`);
      const a = (r.data || []).find((x) => norm(x.name) === key)
        || (r.data || []).find((x) => norm(x.name).includes(key) || key.includes(norm(x.name)));
      if (a) id = a.id;
    }
    if (id) { artistIds[key] = id; saveCaches(); }
    return id;
  }

  async function related(id) {
    loadCaches();
    const hit = relatedCache[id];
    if (hit && Date.now() - hit.at < 7 * DAY) return hit.list;
    const r = await deezer(`/artist/${id}/related?limit=20`);
    const list = (r.data || []).map((a) => ({ id: a.id, name: a.name }));
    relatedCache[id] = { at: Date.now(), list };
    saveCaches();
    return list;
  }

  const topTracks = (id) => cached(`/artist/${id}/top?limit=25`).then((r) => r.data || []);

  // ---------- Signaux de goût ----------
  function readSignals() {
    const s = readJSON(SIGNALS_FILE, {});
    return {
      artists: s.artists || {},
      tracks: s.tracks || {},
      banned: { artists: s.banned?.artists || {}, tracks: s.banned?.tracks || {} },
      history: s.history || {},
      weekly: s.weekly || null,
      mixes: s.mixes || null,
    };
  }
  const writeSignals = (s) => writeJSON(SIGNALS_FILE, s);

  function recordSignal(track, type) {
    if (!track?.id || !['complete', 'skip'].includes(type)) return;
    const s = readSignals();
    const t = s.tracks[track.id] || { title: track.title, artist: track.artist, completes: 0, skips: 0 };
    t[type === 'complete' ? 'completes' : 'skips']++;
    t.last = Date.now();
    s.tracks[track.id] = t;
    const delta = type === 'complete' ? 0.5 : -0.5;
    splitArtists(track.artist).forEach((name, i) => {
      const k = norm(name);
      if (!k) return;
      const a = s.artists[k] || { name, score: 0 };
      a.score = clamp(a.score + delta * (i === 0 ? 1 : 0.5), -5, 10);
      s.artists[k] = a;
    });
    writeSignals(s);
  }

  function ban(track, scope) {
    const s = readSignals();
    if (scope === 'artist') {
      const name = splitArtists(track.artist)[0] || track.artist;
      s.banned.artists[norm(name)] = { name, at: Date.now() };
    } else {
      s.banned.tracks[track.id] = { title: track.title, artist: track.artist, at: Date.now() };
    }
    s.mixes = null; // les mixes seront recalculés
    writeSignals(s);
  }

  function unban(kind, key) {
    const s = readSignals();
    delete s.banned[kind === 'artist' ? 'artists' : 'tracks'][key];
    s.mixes = null;
    writeSignals(s);
  }

  function tasteSummary() {
    const s = readSignals();
    const tr = Object.values(s.tracks);
    const arts = Object.values(s.artists).filter((a) => a.score !== 0).sort((a, b) => b.score - a.score);
    return {
      completes: tr.reduce((n, t) => n + t.completes, 0),
      skips: tr.reduce((n, t) => n + t.skips, 0),
      loved: arts.filter((a) => a.score > 0).slice(0, 12).map((a) => ({ name: a.name, score: a.score })),
      disliked: arts.filter((a) => a.score < 0).reverse().slice(0, 12).map((a) => ({ name: a.name, score: a.score })),
      banned: {
        artists: Object.entries(s.banned.artists).map(([key, v]) => ({ key, name: v.name })),
        tracks: Object.entries(s.banned.tracks).map(([key, v]) => ({ key, title: v.title, artist: v.artist })),
      },
    };
  }

  // ---------- Profil : likes + écoute − bannis ----------
  function profile() {
    const lib = readLibrary();
    const sig = readSignals();
    const all = [...lib.liked, ...lib.playlists.flatMap((p) => p.tracks)];
    const mine = new Map(); // clé → { name, trackId, weight }
    for (const t of all) {
      splitArtists(t.artist).forEach((name, i) => {
        const k = norm(name);
        if (!k) return;
        const e = mine.get(k) || { name, trackId: null, weight: 0 };
        e.weight += i === 0 ? 1 : 0.5;
        if (!e.trackId) e.trackId = t.id;
        mine.set(k, e);
      });
    }
    // Ce que l'écoute a appris : ajuste les poids, et intègre les artistes découverts et adoptés
    for (const [k, a] of Object.entries(sig.artists)) {
      if (mine.has(k)) mine.get(k).weight += a.score;
      else if (a.score >= 1) mine.set(k, { name: a.name, trackId: null, weight: a.score, discovered: true });
    }
    for (const k of Object.keys(sig.banned.artists)) mine.delete(k);

    const known = new Set([...mine.keys(), ...Object.keys(sig.banned.artists)]);
    return {
      all, mine, known, sig,
      likedIds: new Set(all.map((t) => t.id)),
      likedTitles: new Set(all.map((t) => norm(t.title))),
    };
  }

  // ---------- Générateur commun ----------
  // seeds : [{ name, trackId, weight }] ; explore : part de « pépites » (titres moins connus)
  async function generate(P, seeds, { limit = 30, explore = 0.25, depth2 = true, exclude = new Set() } = {}) {
    const ids = await pool(seeds, 4, (e) => artistId(e.name, e.trackId));
    const S = seeds.map((e, i) => ({ ...e, id: ids[i] })).filter((s) => s.id);
    if (!S.length) return [];
    const rel = await pool(S, 4, (s) => related(s.id));

    const cand = new Map(); // id → { id, name, score, because:Set, via }
    const add = (a, score, because, via) => {
      const k = norm(a.name);
      if (!k || P.known.has(k)) return;
      const c = cand.get(a.id) || { id: a.id, name: a.name, score: 0, because: new Set(), via };
      c.score += score;
      because.forEach((b) => c.because.add(b));
      cand.set(a.id, c);
    };
    S.forEach((s, i) => {
      const w = clamp(0.5 + s.weight / 4, 0.4, 2);
      (rel[i] || []).forEach((a, rank) => add(a, (1 + (20 - rank) / 40) * w, [s.name], null));
    });
    // Ce que tu as déjà écouté parmi les recommandations (passé ou adopté) ajuste le score
    for (const c of cand.values()) c.score += P.sig.artists[norm(c.name)]?.score || 0;

    // Niveau 2 : les artistes similaires aux meilleurs candidats (exploration plus lointaine)
    if (depth2) {
      const top = [...cand.values()].sort((a, b) => b.score - a.score).slice(0, 6);
      const rel2 = await pool(top, 4, (c) => related(c.id));
      top.forEach((c, i) => (rel2[i] || []).slice(0, 10).forEach((a, rank) => {
        if (cand.has(a.id)) { cand.get(a.id).score += 0.3; return; }
        add(a, (0.5 + (10 - rank) / 40) * 0.6, [...c.because].slice(0, 1), c.name);
      }));
    }

    // ~80 % d'artistes proches, ~20 % réservés à l'exploration lointaine (niveau 2)
    const nPicks = Math.ceil(limit / 1.3);
    const ranked = [...cand.values()]
      .filter((c) => c.score > 0)
      .map((c) => ({ ...c, r: c.score * (0.6 + Math.random() * 0.8) }))
      .sort((a, b) => b.r - a.r);
    const far = depth2 ? ranked.filter((c) => c.via).slice(0, Math.round(nPicks * 0.2)) : [];
    const near = ranked.filter((c) => !c.via).slice(0, nPicks - far.length);
    const picks = [...near, ...far];
    const tops = await pool(picks, 4, (c) => topTracks(c.id));

    const out = [];
    picks.forEach((c, i) => {
      const ok = (tops[i] || []).filter((t) => t.readable !== false
        && !P.known.has(norm(t.artist?.name))
        && !P.likedIds.has('dz-' + t.id) && !P.likedTitles.has(norm(t.title))
        && !P.sig.banned.tracks['dz-' + t.id] && !exclude.has('dz-' + t.id));
      if (!ok.length) return;
      const n = c.score >= 2.5 ? 2 : 1;
      const because = [...c.because].slice(0, 2).join(' et ');
      const used = new Set();
      for (let k = 0; k < n; k++) {
        const deep = Math.random() < explore && ok.length > 5;
        const range = deep ? ok.slice(5) : ok.slice(0, 5);
        const choice = shuffle(range.filter((t) => !used.has(t.id)))[0];
        if (!choice) continue;
        used.add(choice.id);
        let reason = c.via ? `Proche de ${c.via}, que tu pourrais aimer (via ${because})` : `Parce que tu aimes ${because}`;
        if (deep) reason = 'Pépite · ' + reason;
        out.push({ ...normDeezer(choice), reason });
      }
    });
    return shuffle(out).slice(0, limit);
  }

  // ---------- 1) Découvertes pour toi ----------
  async function recommendations(limit = 30) {
    const P = profile();
    const seeds = weightedSample([...P.mine.values()].filter((e) => e.weight > 0), 16, (e) => e.weight);
    if (!seeds.length) return { tracks: [] };
    return { tracks: await generate(P, seeds, { limit, explore: 0.25 }) };
  }

  // ---------- 2) Mixes par style (regroupement par similarité) ----------
  function libHash(P) {
    const ids = [...P.likedIds].sort().join('|') + '#' + Object.keys(P.sig.banned.artists).sort().join('|');
    return hashString(ids);
  }

  async function mixes() {
    const P = profile();
    const hash = libHash(P);
    if (P.sig.mixes && P.sig.mixes.hash === hash && Date.now() - P.sig.mixes.at < DAY) return P.sig.mixes.list;

    const nodes0 = [...P.mine.entries()].map(([key, e]) => ({ key, ...e }))
      .filter((e) => e.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 60);
    const ids = await pool(nodes0, 4, (e) => artistId(e.name, e.trackId));
    const nodes = nodes0.map((e, i) => ({ ...e, id: ids[i] })).filter((e) => e.id);
    if (nodes.length < 6) return [];
    const rels = await pool(nodes, 4, (n) => related(n.id));
    const relSets = rels.map((l) => new Set((l || []).map((a) => a.id)));

    // Graphe pondéré entre mes artistes
    const N = nodes.length;
    const W = Array.from({ length: N }, () => new Map());
    const link = (i, j, w) => {
      if (i === j || w <= 0) return;
      W[i].set(j, (W[i].get(j) || 0) + w);
      W[j].set(i, (W[j].get(i) || 0) + w);
    };
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let w = 0;
        if (relSets[i].has(nodes[j].id)) w += 2;
        if (relSets[j].has(nodes[i].id)) w += 2;
        let shared = 0;
        for (const x of relSets[i]) if (relSets[j].has(x)) shared++;
        w += shared * 0.5;
        link(i, j, w);
      }
    }
    // Collaborations (featurings) dans mes titres
    const index = new Map(nodes.map((n, i) => [n.key, i]));
    for (const t of P.all) {
      const idx = [...new Set(splitArtists(t.artist).map((n) => index.get(norm(n))).filter((x) => x !== undefined))];
      for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) link(idx[a], idx[b], 1.5);
    }

    // Propagation d'étiquettes : chaque artiste adopte le groupe majoritaire de ses voisins
    const label = nodes.map((_, i) => i);
    for (let it = 0; it < 30; it++) {
      let changed = false;
      for (const i of shuffle([...Array(N).keys()])) {
        const sums = new Map();
        for (const [j, w] of W[i]) sums.set(label[j], (sums.get(label[j]) || 0) + w);
        if (!sums.size) continue;
        const best = Math.max(...sums.values());
        if ((sums.get(label[i]) || 0) >= best) continue;
        const cands = [...sums].filter(([, v]) => v === best).map(([l]) => l);
        label[i] = Math.min(...cands);
        changed = true;
      }
      if (!changed) break;
    }

    const groups = new Map();
    nodes.forEach((n, i) => { if (!groups.has(label[i])) groups.set(label[i], []); groups.get(label[i]).push(n); });
    const list = [...groups.values()]
      .filter((g) => g.length >= 3)
      .map((g) => g.sort((a, b) => b.weight - a.weight))
      .sort((a, b) => b.reduce((s, x) => s + x.weight, 0) - a.reduce((s, x) => s + x.weight, 0))
      .slice(0, 5)
      .map((g) => {
        const cover = P.all.find((t) => norm(splitArtists(t.artist)[0]) === g[0].key && t.artwork)?.artwork || null;
        return {
          id: 'mix-' + g[0].key,
          name: `Mix ${g[0].name}`,
          subtitle: `${g.slice(0, 3).map((x) => x.name).join(', ')} et plus`,
          artists: g.map((x) => ({ key: x.key, name: x.name, trackId: x.trackId, weight: x.weight })),
          cover,
        };
      });

    P.sig.mixes = { at: Date.now(), hash, list };
    writeSignals(P.sig);
    return list;
  }

  // Un mix = environ 1/3 de tes titres de ce style + 2/3 de découvertes proches
  const mixMemo = new Map();
  async function mixTracks(id, refresh = false) {
    const hit = mixMemo.get(id);
    if (!refresh && hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.data;
    const list = await mixes();
    const mix = list.find((m) => m.id === id);
    if (!mix) return null;
    const P = profile();
    const keys = new Set(mix.artists.map((a) => a.key));
    const seeds = weightedSample(mix.artists, 12, (a) => a.weight);
    const fresh = await generate(P, seeds, { limit: 20, explore: 0.2 });
    const knownTracks = shuffle(P.all.filter((t) => keys.has(norm(splitArtists(t.artist)[0]))))
      .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
      .slice(0, 10)
      .map((t) => ({ ...t, reason: 'Dans tes favoris' }));
    const tracks = [];
    while (fresh.length || knownTracks.length) {
      if (knownTracks.length) tracks.push(knownTracks.shift());
      tracks.push(...fresh.splice(0, 2));
    }
    const data = { mix, tracks };
    mixMemo.set(id, { at: Date.now(), data });
    return data;
  }

  // ---------- 3) Découvertes de la semaine ----------
  async function weekly() {
    const key = weekKey();
    const sig = readSignals();
    if (sig.weekly?.week === key && sig.weekly.tracks?.length) return sig.weekly;
    const P = profile();
    const seeds = weightedSample([...P.mine.values()].filter((e) => e.weight > 0), 20, (e) => e.weight);
    const exclude = new Set(Object.keys(sig.history));
    const tracks = seeds.length ? await generate(P, seeds, { limit: 30, explore: 0.45, exclude }) : [];
    const s = readSignals();
    for (const t of tracks) s.history[t.id] = key;
    s.weekly = { week: key, createdAt: Date.now(), tracks };
    writeSignals(s);
    return s.weekly;
  }

  // Filtre commun (radio, etc.)
  function filterBanned(tracks) {
    const s = readSignals();
    return tracks.filter((t) => !s.banned.tracks[t.id] && !s.banned.artists[norm(splitArtists(t.artist)[0])]);
  }

  return { artistId, recordSignal, ban, unban, tasteSummary, recommendations, mixes, mixTracks, weekly, filterBanned };
};
});
