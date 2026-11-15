/* ===== Sonora — logique de l'application ===== */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const isMobile = () => matchMedia('(max-width: 720px)').matches;

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtTotal(tracks) {
  const sec = tracks.reduce((a, t) => a + (t.duration || 0), 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min ${sec % 60} s`;
}
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function hue(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('sonora.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sonora.' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

async function api(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

/* ===== Icônes ===== */
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" ${extra}><path d="${d}"/></svg>`;
const HEART_D = 'M12 20.7 10.6 19.4C5.4 14.7 2 11.6 2 7.8 2 4.7 4.4 2.3 7.5 2.3c1.7 0 3.4.8 4.5 2.1a6 6 0 0 1 4.5-2.1c3.1 0 5.5 2.4 5.5 5.5 0 3.8-3.4 6.9-8.6 11.6L12 20.7Z';
const I = {
  play: svg('M8 5v14l11-7L8 5Z'),
  pause: svg('M6 5h4v14H6V5Zm8 0h4v14h-4V5Z'),
  heart: `<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="${HEART_D}"/></svg>`,
  heartFill: svg(HEART_D),
  dots: svg('M5 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z'),
  plus: svg('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z'),
  plusCircle: svg('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2Z'),
  checkCircle: svg('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2 15-5-5 1.4-1.4 3.6 3.6 7.6-7.6L19 8l-9 9Z'),
  note: svg('M12 3v10.6A4 4 0 1 0 14 17V7h4V3h-6Z'),
  pencil: svg('M3 17.3V21h3.7L17.8 9.9l-3.7-3.7L3 17.3ZM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7L20.7 7Z'),
  trash: svg('M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z'),
  queue: svg('M3 5h14v2H3V5Zm0 6h14v2H3v-2Zm0 6h8v2H3v-2Zm12 0 6-3.5v7L15 17Z'),
  minus: svg('M5 11h14v2H5v-2Z'),
  search: svg('M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.8 4.8-1.4 1.4-4.8-4.8A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z'),
  shuffle: svg('M17 3l4 4-4 4V8h-2.3l-3.2 4 3.2 4H17v-3l4 4-4 4v-3h-3.3l-3.5-4.4L6.7 18H3v-2h2.7l3.2-4-3.2-4H3V6h3.7l3.5 4.4L13.7 6H17V3Z'),
  volHigh: svg('M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z'),
  volLow: svg('M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4Z'),
  volMute: svg('M3 9v6h4l5 5V4L7 9H3Zm15.4 3 2.3-2.3-1.4-1.4-2.3 2.3-2.3-2.3-1.4 1.4 2.3 2.3-2.3 2.3 1.4 1.4 2.3-2.3 2.3 2.3 1.4-1.4-2.3-2.3Z'),
};
const img = (src) => `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">`;

function coverHTML(o, cls = '') {
  if (o.kind === 'liked') return `<div class="cover liked ${cls}">${I.heartFill}</div>`;
  if (o.kind === 'my') {
    const arts = [...new Set(o.tracks.map((t) => t.artwork).filter(Boolean))];
    if (arts.length >= 4) return `<div class="cover mosaic ${cls}">${arts.slice(0, 4).map(img).join('')}</div>`;
    return `<div class="cover ${cls}">${arts.length ? img(arts[0]) : I.note}</div>`;
  }
  return `<div class="cover ${cls}">${o.artwork ? img(o.artwork) : I.note}</div>`;
}

/* ===== Genres ===== */
const GENRES = [
  ['Electronic', 'Électro', '#d84000'], ['Hip-Hop/Rap', 'Hip-Hop / Rap', '#bc5900'], ['Pop', 'Pop', '#8d67ab'],
  ['R&B/Soul', 'R&B / Soul', '#dc148c'], ['Lo-Fi', 'Lo-Fi', '#477d95'], ['House', 'House', '#1e3264'],
  ['Alternative', 'Alternative', '#e8115b'], ['Rock', 'Rock', '#e91429'], ['Jazz', 'Jazz', '#8c1932'],
  ['Reggae', 'Reggae', '#148a08'], ['Latin', 'Latino', '#e1118c'], ['Ambient', 'Ambient', '#503750'],
  ['Trap', 'Trap', '#ba5d07'], ['Techno', 'Techno', '#7358ff'], ['Classical', 'Classique', '#7d4b32'],
  ['Dancehall', 'Dancehall', '#27856a'], ['Acoustic', 'Acoustique', '#a56752'], ['Soundtrack', 'Bandes originales', '#2d46b9'],
];
const genreLabel = (g) => (GENRES.find((x) => x[0] === g) || [g, g])[1];

/* ===== Bibliothèque (favoris + playlists, sauvegardées sur le serveur local) ===== */
let lib = { liked: [], playlists: [] };
const LISTS = {}; // listes de titres affichées, indexées par clé de contexte

function getList(key) {
  if (key === 'liked') return lib.liked;
  if (key && key.startsWith('my:')) return getPlaylist(key.slice(3))?.tracks || [];
  return LISTS[key] || [];
}
const getPlaylist = (id) => lib.playlists.find((p) => p.id === id);
const isLiked = (id) => lib.liked.some((t) => t.id === id);

let saveTimer;
function saveLibrary() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const r = await fetch('/api/library', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lib) });
      if (!r.ok) throw new Error();
    } catch {
      toast('Échec de la sauvegarde. Le serveur est-il lancé ?');
    }
  }, 250);
}

function libraryChanged({ rerender = true } = {}) {
  saveLibrary();
  renderSidebar();
  updateNowPlaying();
  const r = parseRoute();
  if (rerender && ['home', 'liked', 'my', 'library'].includes(r.name)) render();
  else updatePlayingUI();
}

function toggleLike(track) {
  if (!track) return;
  const i = lib.liked.findIndex((t) => t.id === track.id);
  if (i >= 0) { lib.liked.splice(i, 1); toast('Retiré des titres likés'); }
  else { lib.liked.unshift({ ...track, addedAt: Date.now() }); toast('Ajouté aux titres likés'); }
  // Met à jour les cœurs visibles sans tout redessiner
  $$(`[data-act="like"][data-id="${CSS.escape(track.id)}"]`).forEach((b) => {
    b.classList.add('pop');
    setTimeout(() => b.classList.remove('pop'), 300);
  });
  libraryChanged({ rerender: parseRoute().name === 'liked' });
  refreshHearts();
}

function refreshHearts() {
  $$('[data-act="like"]').forEach((b) => {
    const on = isLiked(b.dataset.id);
    b.classList.toggle('on', on);
    b.innerHTML = on ? I.heartFill : I.heart;
    b.setAttribute('aria-label', on ? 'Retirer des titres likés' : 'Ajouter aux titres likés');
  });
}

function newId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function createPlaylist({ tracks = [], name, go = true } = {}) {
  if (!name) {
    name = await openModal({ title: 'Créer une playlist', value: `Ma playlist n° ${lib.playlists.length + 1}`, okLabel: 'Créer' });
    if (!name) return null;
  }
  const pl = { id: newId(), name, tracks: tracks.map((t) => ({ ...t })), createdAt: Date.now() };
  lib.playlists.unshift(pl);
  libraryChanged();
  if (go) location.hash = `#/my/${pl.id}`;
  return pl;
}

function addToPlaylist(plId, track) {
  const pl = getPlaylist(plId);
  if (!pl) return;
  if (pl.tracks.some((t) => t.id === track.id)) return toast(`Déjà dans « ${pl.name} »`);
  pl.tracks.push({ ...track, addedAt: Date.now() });
  toast(`Ajouté à « ${pl.name} »`);
  libraryChanged({ rerender: parseRoute().arg === plId });
}

function removeFromPlaylist(plId, index) {
  const pl = getPlaylist(plId);
  if (!pl) return;
  const [t] = pl.tracks.splice(index, 1);
  toast(`« ${t.title} » retiré de la playlist`);
  libraryChanged();
}

async function renamePlaylist(plId) {
  const pl = getPlaylist(plId);
  if (!pl) return;
  const name = await openModal({ title: 'Renommer la playlist', value: pl.name });
  if (!name || name === pl.name) return;
  pl.name = name;
  libraryChanged();
}

async function deletePlaylist(plId) {
  const pl = getPlaylist(plId);
  if (!pl) return;
  const ok = await openModal({
    title: 'Supprimer de la bibliothèque ?',
    text: `La playlist « ${pl.name} » sera supprimée définitivement.`,
    input: false, okLabel: 'Supprimer',
  });
  if (!ok) return;
  lib.playlists = lib.playlists.filter((p) => p.id !== plId);
  toast('Playlist supprimée');
  if (parseRoute().arg === plId) location.hash = '#/home';
  libraryChanged();
}

/* ===== Lecteur ===== */
const audio = $('#audio');
const P = {
  original: [], queue: [], pos: -1, context: null,
  shuffle: store.get('shuffle', false), repeat: store.get('repeat', 'off'),
  errors: 0, seeking: false,
};
const current = () => P.queue[P.pos] || null;

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function playFrom(tracks, index = 0, context = null) {
  if (!tracks || !tracks.length) return toast('Aucun titre à lire');
  P.original = tracks.slice();
  P.context = context;
  const start = P.original[index] || P.original[0];
  if (P.shuffle) {
    P.queue = [start, ...shuffled(P.original.filter((t) => t !== start))];
    P.pos = 0;
  } else {
    P.queue = P.original.slice();
    P.pos = P.queue.indexOf(start);
  }
  loadCurrent(true);
}

/* --- Moteurs de lecture : audio HTML (Audius, extraits) ou YouTube (titres officiels complets) --- */
const YTS = { enabled: false, player: null, ready: false, readyWaiters: [], candidates: [], tryIndex: 0, track: null };

const engines = {
  html: {
    async load(t, autoplay) {
      audio.src = await streamUrl(t);
      if (autoplay) await audio.play().catch(() => {});
    },
    play: () => audio.play(),
    pause: () => audio.pause(),
    seek: (s) => { try { audio.currentTime = s; } catch { /* pas encore chargé */ } },
    get paused() { return audio.paused; },
    get time() { return audio.currentTime || 0; },
    get duration() { return isFinite(audio.duration) ? audio.duration : 0; },
  },
  yt: {
    async load(t, autoplay) {
      await ensureYouTube();
      YTS.track = t;
      YTS.candidates = await resolveYouTube(t);
      YTS.tryIndex = 0;
      const pref = YTS.candidates.indexOf(t.yt);
      if (pref > 0) YTS.tryIndex = pref;
      const id = YTS.candidates[YTS.tryIndex];
      if (autoplay) YTS.player.loadVideoById(id); else YTS.player.cueVideoById(id);
      applyVolume();
    },
    play: () => YTS.player?.playVideo(),
    pause: () => YTS.player?.pauseVideo(),
    seek: (s) => YTS.player?.seekTo(s, true),
    get paused() {
      const s = YTS.player?.getPlayerState?.();
      return !(s === 1 || s === 3); // 1 = lecture, 3 = mise en mémoire tampon
    },
    get time() { return YTS.player?.getCurrentTime?.() || 0; },
    get duration() { return YTS.player?.getDuration?.() || 0; },
  },
};
// Adresse audio : via le serveur local, ou résolue dans le navigateur (version en ligne)
async function streamUrl(t) {
  if (window.SONORA_STATIC) return (await api('/api/stream-url/' + encodeURIComponent(t.id))).url;
  return `/api/stream/${encodeURIComponent(t.id)}`;
}

let active = 'html';
const eng = () => engines[active];
const isPlaying = () => P.loaded && !!current() && !eng().paused;
// Un titre du catalogue officiel (extrait Deezer) est lu en entier via YouTube si la clé est configurée
const usesYouTube = (t) => !!t && t.source !== 'audius' && !!(t.preview || t.source === 'deezer') && YTS.enabled;
const isPreviewOnly = (t) => !!t?.preview && !YTS.enabled;

/* --- Apprentissage : écouté jusqu'au bout (≥ 80 %) ou passé (< 30 s) --- */
const slim = (t) => ({ id: t.id, title: t.title, artist: t.artist });

function flushListen() {
  const L = P.listen;
  P.listen = null;
  if (!L || !L.track || isPreviewOnly(L.track)) return;
  const dur = L.track.duration || 0;
  let type = null;
  if (L.ended || (dur > 60 && L.maxT >= dur * 0.8)) type = 'complete';
  else if (L.maxT > 0.5 && L.maxT < 30) type = 'skip';
  if (!type) return;
  fetch('/api/signal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ track: slim(L.track), type }),
  }).catch(() => {});
}

function trackListen() {
  const L = P.listen;
  if (!L || L.track !== current() || !isPlaying()) return;
  const tm = eng().time;
  // On ne compte pas plus que le temps réellement écoulé (évite les sauts en avant et l'ancien titre)
  if (tm <= (Date.now() - L.since) / 1000 + 2) L.maxT = Math.max(L.maxT, tm);
}
const markEnded = () => { if (P.listen) P.listen.ended = true; };

async function loadCurrent(autoplay) {
  const t = current();
  if (!t) return;
  if (P.listen?.track !== t) {
    flushListen();
    P.listen = { track: t, maxT: 0, ended: false, since: Date.now() };
  }
  const kind = usesYouTube(t) ? 'yt' : 'html';
  if (kind !== active) { try { eng().pause(); } catch { /* rien */ } active = kind; }
  $('#yt-dock').hidden = kind !== 'yt';
  P.loaded = true;
  updateNowPlaying();
  updatePlayingUI();
  saveSession();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist, album: 'Sonora',
      artwork: t.artwork ? [{ src: t.artwork, sizes: '480x480', type: 'image/jpeg' }] : [],
    });
  }
  if (parseRoute().name === 'queue') render();
  try {
    await eng().load(t, autoplay);
  } catch (e) {
    if (active === 'yt' && t.preview && current() === t) {
      // YouTube indisponible (quota, réseau…) : on se rabat sur l'extrait
      toast((e.message || 'YouTube indisponible') + ' — lecture de l\'extrait.');
      active = 'html';
      $('#yt-dock').hidden = true;
      await engines.html.load(t, autoplay);
    } else {
      P.loaded = false;
      toast(e.message || 'Lecture impossible');
    }
  }
  updatePlayingUI();
}

function togglePlay() {
  if (!current()) {
    // Rien en cours : on lance la liste affichée s'il y en a une
    const btn = $('.big-play[data-list]');
    if (btn) btn.click();
    return;
  }
  if (!P.loaded) return loadCurrent(true);
  if (eng().paused) Promise.resolve(eng().play()).catch(() => toast('Lecture impossible'));
  else eng().pause();
}

function next(auto = false) {
  if (!current()) return;
  if (auto && P.repeat === 'one') { eng().seek(0); eng().play(); return; }
  if (P.pos < P.queue.length - 1) P.pos++;
  else if (P.repeat === 'all' || (!auto && P.queue.length)) {
    if (P.shuffle) P.queue = shuffled(P.queue);
    P.pos = 0;
    if (auto && P.repeat !== 'all') { loadCurrent(false); return; }
  } else {
    eng().pause();
    eng().seek(0);
    return;
  }
  loadCurrent(true);
}

function prev() {
  if (!current()) return;
  if (eng().time > 3 || P.pos === 0) { eng().seek(0); return; }
  P.pos--;
  loadCurrent(true);
}

function playNext(track) {
  if (!current()) return playFrom([track], 0, null);
  P.queue.splice(P.pos + 1, 0, { ...track });
  const oi = P.original.indexOf(current());
  P.original.splice(oi + 1, 0, P.queue[P.pos + 1]);
  toast('Ajouté à la file d\'attente');
  saveSession();
  if (parseRoute().name === 'queue') render();
}

function jumpTo(pos) {
  if (pos < 0 || pos >= P.queue.length) return;
  P.pos = pos;
  loadCurrent(true);
}

function setShuffle(on) {
  P.shuffle = on;
  store.set('shuffle', on);
  const cur = current();
  if (cur) {
    if (on) { P.queue = [cur, ...shuffled(P.original.filter((t) => t !== cur))]; P.pos = 0; }
    else { P.queue = P.original.slice(); P.pos = Math.max(0, P.queue.indexOf(cur)); }
    saveSession();
  }
  updateControls();
  if (parseRoute().name === 'queue') render();
}

function cycleRepeat() {
  P.repeat = { off: 'all', all: 'one', one: 'off' }[P.repeat];
  store.set('repeat', P.repeat);
  updateControls();
  toast({ off: 'Répétition désactivée', all: 'Répéter la liste', one: 'Répéter le titre' }[P.repeat]);
}

function saveSession() {
  store.set('session', { queue: P.queue.slice(0, 300), original: P.original.slice(0, 300), pos: P.pos, context: P.context });
}

function restoreSession() {
  const s = store.get('session', null);
  if (!s || !Array.isArray(s.queue) || !s.queue[s.pos]) return;
  P.queue = s.queue;
  // On rattache les objets de "original" à ceux de la file pour que le mode aléatoire fonctionne
  const byId = new Map(P.queue.map((t) => [t.id, t]));
  P.original = (s.original || s.queue).map((t) => byId.get(t.id) || t);
  P.pos = s.pos;
  P.context = s.context;
  P.loaded = false; // chargé au premier appui sur Lecture
  updateNowPlaying();
}

/* --- YouTube : lecteur officiel intégré (IFrame API) --- */
function loadYouTubeAPI() {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => reject(new Error('Impossible de charger le lecteur YouTube. Vérifie ta connexion.'));
    document.head.appendChild(s);
  });
}

async function ensureYouTube() {
  if (YTS.ready) return;
  if (!YTS.player) {
    await loadYouTubeAPI();
    YTS.player = new window.YT.Player('yt-player', {
      width: '100%', height: '100%',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
      events: {
        onReady: () => { YTS.ready = true; applyVolume(); YTS.readyWaiters.splice(0).forEach((f) => f()); },
        onStateChange: onYouTubeState,
        onError: onYouTubeError,
      },
    });
  }
  if (YTS.ready) return;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Le lecteur YouTube ne répond pas. Recharge la page.')), 15000);
    YTS.readyWaiters.push(() => { clearTimeout(t); resolve(); });
  });
}

async function resolveYouTube(t, refresh = false) {
  const qs = new URLSearchParams({ title: t.title, artist: t.artist });
  if (refresh) qs.set('refresh', '1');
  const { ids } = await api('/api/youtube/resolve?' + qs);
  return ids;
}

function rememberYouTubeId(t, id) {
  // Mémorise la vidéo qui fonctionne dans la bibliothèque (évite de rechercher à nouveau)
  let changed = false;
  for (const list of [lib.liked, ...lib.playlists.map((p) => p.tracks)]) {
    for (const x of list) if (x.id === t.id && x.yt !== id) { x.yt = id; changed = true; }
  }
  t.yt = id;
  if (changed) saveLibrary();
}

function onYouTubeState(e) {
  if (active !== 'yt') return;
  if (e.data === 1 && YTS.track) rememberYouTubeId(YTS.track, YTS.candidates[YTS.tryIndex]);
  if (e.data === 0) { markEnded(); next(true); return; } // fin du titre
  updatePlayingUI();
  updateProgress();
}

function onYouTubeError() {
  if (active !== 'yt') return;
  // Vidéo bloquée ou non intégrable : on essaie la suivante
  YTS.tryIndex++;
  if (YTS.tryIndex < YTS.candidates.length) {
    YTS.player.loadVideoById(YTS.candidates[YTS.tryIndex]);
  } else {
    toast('Titre introuvable sur YouTube, passage au suivant…');
    setTimeout(() => next(false), 800);
  }
}

// Suivi de la progression YouTube (pas d'événement continu dans l'API)
setInterval(() => { if (active === 'yt' && YTS.ready) updateProgress(); }, 500);

async function refreshYouTubeStatus() {
  try { YTS.enabled = (await api('/api/youtube/status')).configured; }
  catch { YTS.enabled = false; }
  return YTS.enabled;
}

/* --- Interface du lecteur --- */
function setSliderFill(el) {
  const p = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.setProperty('--p', p + '%');
}

function updateNowPlaying() {
  const t = current();
  const like = $('#np-like');
  if (!t) return;
  $('#np-art').innerHTML = t.artwork ? img(t.artwork) : '';
  $('#np-title').textContent = t.title;
  $('#np-artist').textContent = isPreviewOnly(t) ? `${t.artist} · extrait 30 s` : t.artist;
  like.hidden = false;
  like.dataset.act = 'like';
  like.dataset.id = t.id;
  const on = isLiked(t.id);
  like.classList.toggle('on', on);
  like.innerHTML = on ? I.heartFill : I.heart;
  $('#time-dur').textContent = fmtTime(t.duration);
  document.title = `${t.title} • ${t.artist}`;
}

function updateControls() {
  const playing = isPlaying();
  $('#btn-play').innerHTML = playing ? I.pause : I.play;
  $('#btn-play').setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
  $('#btn-shuffle').classList.toggle('on', P.shuffle);
  const rep = $('#btn-repeat');
  rep.classList.toggle('on', P.repeat !== 'off');
  rep.classList.toggle('one', P.repeat === 'one');
  const v = effectiveVolume();
  $('#btn-mute').innerHTML = v === 0 ? I.volMute : v < 0.5 ? I.volLow : I.volHigh;
}

function updatePlayingUI() {
  const t = current();
  const playing = isPlaying();
  $$('.track').forEach((row) => {
    const match = t && row.dataset.id === t.id && (row.dataset.list === P.context || row.dataset.list === 'queue-now');
    row.classList.toggle('playing', !!match);
    row.classList.toggle('is-playing', !!match && playing);
  });
  $$('.card[data-id]').forEach((c) => c.classList.toggle('playing', !!t && c.dataset.id === t.id));
  $$('.lib-item').forEach((li) => li.classList.toggle('playing', playing && li.dataset.ctx === P.context));
  $$('[data-act="play-list"]').forEach((b) => {
    const mine = playing && b.dataset.list === P.context;
    b.innerHTML = mine ? I.pause : I.play;
  });
  $$('.track [data-act="play-track"]').forEach((b) => {
    const row = b.closest('.track');
    b.innerHTML = row.classList.contains('is-playing') ? I.pause : I.play;
  });
  updateControls();
}

/* ===== Routage ===== */
function parseRoute() {
  const h = location.hash.slice(1) || '/home';
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  return { name: parts[0] || 'home', arg: parts[1], params: new URLSearchParams(qs || ''), path };
}

const view = $('#view');
const main = $('#main');
let renderId = 0;
let lastPath = null;

async function render() {
  const r = parseRoute();
  const id = ++renderId;
  const alive = () => id === renderId;
  closeMenu();

  const navKey = r.name === 'search' || r.name === 'genre' ? 'search' : ['library', 'home', 'settings'].includes(r.name) ? r.name : '';
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
  $('#search-box').hidden = r.name !== 'search';
  $$('.lib-item').forEach((li) => li.classList.toggle('active', li.dataset.href === '#' + r.path));
  if (r.path !== lastPath) { main.scrollTop = 0; lastPath = r.path; }
  if (r.name !== 'search' && !current()) document.title = 'Sonora';

  try {
    switch (r.name) {
      case 'search': await viewSearch(r.params.get('q') || ''); break;
      case 'genre': await viewGenre(r.arg, alive); break;
      case 'liked': viewLiked(); break;
      case 'my': viewMyPlaylist(r.arg); break;
      case 'playlist': await viewRemotePlaylist(r.arg, alive); break;
      case 'library': viewLibrary(); break;
      case 'queue': viewQueue(); break;
      case 'settings': viewSettings(); break;
      case 'mix': await viewMix(r.arg, alive); break;
      case 'weekly': await viewWeekly(alive); break;
      default: await viewHome(alive);
    }
  } catch (e) {
    if (alive()) view.innerHTML = errorHTML(e);
  }
  if (alive()) { refreshHearts(); updatePlayingUI(); }
}

const loadingHTML = '<div class="loading"><div class="spinner"></div></div>';
const errorHTML = (e) => `<div class="error-box">${esc(e.message || e)} &nbsp;<button class="btn ghost" data-act="retry">Réessayer</button></div>`;

/* ===== Composants ===== */
function trackRowsHTML(key, tracks, { removable = false, startNum = 1, header = true, reasons = false } = {}) {
  LISTS[key] = tracks;
  const head = header ? `<div class="tl-head"><span style="text-align:right">#</span><span>Titre</span><span class="col-genre">${reasons ? 'Pourquoi' : 'Genre'}</span><span style="text-align:right;padding-right:34px">Durée</span></div>` : '';
  const rows = tracks.map((t, i) => `
    <div class="track" data-list="${esc(key)}" data-index="${i}" data-id="${esc(t.id)}" ${removable ? 'data-removable="1"' : ''}>
      <div class="track-num"><span class="num">${i + startNum}</span><span class="eq"><i></i><i></i><i></i></span>
        <button class="play-icon" data-act="play-track" aria-label="Lire">${I.play}</button></div>
      <div class="track-main">${coverHTML(t)}
        <div class="track-text"><div class="track-title">${esc(t.title)}</div><div class="track-artist">${isPreviewOnly(t) ? '<span class="badge" title="Extrait officiel de 30 secondes">Extrait</span>' : ''}${esc(t.artist)}</div></div></div>
      <div class="track-genre col-genre ${reasons ? 'reason' : ''}" title="${esc(reasons ? t.reason || '' : '')}">${esc(reasons ? t.reason || '' : genreLabel(t.genre))}</div>
      <div class="track-end">
        <button class="icon-btn heart" data-act="like" data-id="${esc(t.id)}" aria-label="J'aime"></button>
        <span class="duration">${fmtTime(t.duration)}</span>
        <button class="icon-btn" data-act="menu" aria-label="Plus d'options">${I.dots}</button>
      </div>
    </div>`).join('');
  return `<div class="tracklist">${head}${rows}</div>`;
}

function trackCardsHTML(key, tracks) {
  LISTS[key] = tracks;
  return `<div class="cards">${tracks.map((t, i) => `
    <div class="card" data-act="play-track" data-list="${esc(key)}" data-index="${i}" data-id="${esc(t.id)}">
      <div class="card-art">${coverHTML(t)}<button class="card-play" data-act="play-track" data-list="${esc(key)}" data-index="${i}" aria-label="Lire">${I.play}</button>
        ${t.reason ? `<button class="card-dismiss" data-act="not-for-me" data-list="${esc(key)}" data-index="${i}" title="Pas pour moi" aria-label="Pas pour moi">✕</button>` : ''}</div>
      <div class="card-title">${esc(t.title)}</div>
      <div class="card-sub">${esc(t.artist)}</div>
      ${t.reason ? `<div class="card-reason">${esc(t.reason)}</div>` : ''}
    </div>`).join('')}</div>`;
}

function playlistCardsHTML(pls) {
  return `<div class="cards">${pls.map((p) => `
    <div class="card" data-act="nav" data-href="#/playlist/${encodeURIComponent(p.id)}">
      <div class="card-art">${coverHTML(p)}<button class="card-play" data-act="play-remote" data-pid="${esc(p.id)}" data-list="pl:${esc(p.id)}" aria-label="Lire">${I.play}</button></div>
      <div class="card-title">${esc(p.name)}</div>
      <div class="card-sub">${esc(p.artist ? 'De ' + p.artist : '')}${p.trackCount ? ' · ' + plural(p.trackCount, 'titre') : ''}</div>
    </div>`).join('')}</div>`;
}

function heroHTML({ cover, kind, title, meta, color, titleAct = '' }) {
  return `<section class="hero" style="--hero:${color}">
    ${cover}
    <div class="hero-text">
      <div class="hero-kind">${esc(kind)}</div>
      <h1 class="hero-title" ${titleAct}>${esc(title)}</h1>
      <div class="hero-meta">${meta}</div>
    </div>
  </section>`;
}

function libItemHTML(o) {
  const liked = o.kind === 'liked';
  const href = liked ? '#/liked' : `#/my/${o.pl.id}`;
  const ctx = liked ? 'liked' : `my:${o.pl.id}`;
  const tracks = liked ? lib.liked : o.pl.tracks;
  const name = liked ? 'Titres likés' : o.pl.name;
  return `<li class="lib-item" data-act="nav" data-href="${esc(href)}" data-ctx="${esc(ctx)}" ${liked ? '' : `data-pl="${esc(o.pl.id)}"`}>
    ${coverHTML(liked ? { kind: 'liked' } : { kind: 'my', tracks })}
    <div class="lib-item-text"><div class="lib-item-name">${esc(name)}</div>
    <div class="lib-item-sub">Playlist · ${plural(tracks.length, 'titre')}</div></div></li>`;
}

function renderSidebar() {
  $('#library-list').innerHTML = [libItemHTML({ kind: 'liked' }), ...lib.playlists.map((pl) => libItemHTML({ kind: 'my', pl }))].join('');
  const path = '#' + parseRoute().path;
  $$('.lib-item').forEach((li) => li.classList.toggle('active', li.dataset.href === path));
  updatePlayingUI();
}

/* ===== Vues ===== */
let homeGenre = '';
const trendingCache = {};

async function viewHome(alive) {
  const h = new Date().getHours();
  const greet = h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
  const quick = [{ kind: 'liked' }, ...lib.playlists.slice(0, 7).map((pl) => ({ kind: 'my', pl }))];
  const mixesSection = `
    <div class="section-head"><h2>Tes mixes</h2></div>
    <p class="section-sub">Tes favoris et des découvertes, regroupés par style. Les Découvertes de la semaine sont renouvelées chaque lundi.</p>
    <div id="mixes">${loadingHTML}</div>`;
  view.innerHTML = `
    <h1 class="greeting">${greet}</h1>
    <div class="quick-grid">${quick.map((q) => {
      const liked = q.kind === 'liked';
      const key = liked ? 'liked' : `my:${q.pl.id}`;
      return `<div class="quick" data-act="nav" data-href="${liked ? '#/liked' : '#/my/' + esc(q.pl.id)}">
        ${coverHTML(liked ? { kind: 'liked' } : { kind: 'my', tracks: q.pl.tracks })}
        <span>${esc(liked ? 'Titres likés' : q.pl.name)}</span>
        <button class="card-play" data-act="play-list" data-list="${esc(key)}" aria-label="Lire">${I.play}</button></div>`;
    }).join('')}</div>
    ${mixesSection}
    <div class="section-head"><h2>Découvertes pour toi</h2>
      <div class="head-actions">
        <button class="chip" data-act="reco-refresh">↻ Nouveau mix</button>
        <button class="big-play small" data-act="play-list" data-list="reco" aria-label="Tout lire">${I.play}</button>
      </div></div>
    <p class="section-sub">Des artistes proches de ceux que tu aimes, que tu n'écoutes pas encore.</p>
    <div id="reco">${loadingHTML}</div>
    <div class="section-head"><h2>Tendances de la semaine</h2></div>
    <div class="chips" id="genre-chips">
      ${[['', 'Tout'], ...GENRES.slice(0, 10)].map(([g, l]) => `<button class="chip ${g === homeGenre ? 'active' : ''}" data-act="home-genre" data-genre="${esc(g)}">${esc(l)}</button>`).join('')}
    </div>
    <div id="trending" style="margin-top:16px">${loadingHTML}</div>`;
  await Promise.all([loadMixes(alive), loadReco(false, alive), loadTrending(alive)]);
}

/* --- Mixes par style & Découvertes de la semaine --- */
let mixesCache = store.get('mixes', null);
const mixCache = {};
let weeklyCache = null;

async function loadMixes(alive = () => true) {
  const box = $('#mixes');
  if (!box) return;
  if (!mixesCache || Date.now() - mixesCache.at > 6 * 3600 * 1000) {
    try {
      mixesCache = { at: Date.now(), list: await api('/api/mixes') };
      store.set('mixes', mixesCache);
    } catch (e) {
      if (alive() && $('#mixes')) $('#mixes').innerHTML = errorHTML(e);
      return;
    }
  }
  if (!alive() || !$('#mixes')) return;
  const weeklyCard = `<div class="card" data-act="nav" data-href="#/weekly">
      <div class="card-art"><div class="cover weekly-cover"><span>Découvertes<br>de la semaine</span></div>
      <button class="card-play" data-act="play-mix" data-mix="weekly" data-list="weekly" aria-label="Lire">${I.play}</button></div>
      <div class="card-title">Découvertes de la semaine</div><div class="card-sub">30 nouveautés pour toi, chaque lundi</div></div>`;
  $('#mixes').innerHTML = `<div class="cards">${weeklyCard}${mixesCache.list.map((m) => `
    <div class="card" data-act="nav" data-href="#/mix/${encodeURIComponent(m.id)}">
      <div class="card-art">${mixCoverHTML(m)}
      <button class="card-play" data-act="play-mix" data-mix="${esc(m.id)}" data-list="mix:${esc(m.id)}" aria-label="Lire">${I.play}</button></div>
      <div class="card-title">${esc(m.name)}</div><div class="card-sub">${esc(m.subtitle)}</div></div>`).join('')}</div>`;
  updatePlayingUI();
}

function mixCoverHTML(m) {
  return `<div class="cover mix-cover" style="--mix:hsl(${hue(m.id)} 55% 45%)">${m.cover ? img(m.cover) : ''}<span>${esc(m.name.replace(/^Mix /, ''))}</span></div>`;
}

async function fetchMix(id, refresh = false) {
  if (!refresh && mixCache[id]) return mixCache[id];
  mixCache[id] = await api(`/api/mix/${encodeURIComponent(id)}${refresh ? '?refresh=1' : ''}`);
  return mixCache[id];
}
async function fetchWeekly() {
  return weeklyCache || (weeklyCache = await api('/api/weekly'));
}

async function viewMix(id, alive) {
  view.innerHTML = loadingHTML;
  const { mix, tracks } = await fetchMix(id);
  if (!alive()) return;
  const key = `mix:${id}`;
  view.innerHTML = heroHTML({
    cover: mixCoverHTML(mix), kind: 'Mix', title: mix.name, color: `hsl(${hue(id)} 45% 30%)`,
    meta: `${esc(mix.subtitle)} · ${plural(tracks.length, 'titre')}`,
  }) + `<div class="actions">
      <button class="big-play" data-act="play-list" data-list="${esc(key)}" aria-label="Lire">${I.play}</button>
      <button class="action-btn" data-act="mix-refresh" data-mix="${esc(id)}" title="Générer un nouveau mix">↻ <span>Nouveau mix</span></button>
      <button class="action-btn" data-act="save-list" data-list="${esc(key)}" data-name="${esc(mix.name)}" title="Copier dans ma bibliothèque">${I.plusCircle}<span>Enregistrer en playlist</span></button>
    </div>${trackRowsHTML(key, tracks, { reasons: true })}`;
}

async function viewWeekly(alive) {
  view.innerHTML = loadingHTML;
  const w = await fetchWeekly();
  if (!alive()) return;
  const since = new Date(w.week + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  view.innerHTML = heroHTML({
    cover: '<div class="cover weekly-cover"><span>Découvertes<br>de la semaine</span></div>',
    kind: 'Playlist', title: 'Découvertes de la semaine', color: '#1d6b57',
    meta: `Semaine du ${esc(since)} · ${plural(w.tracks.length, 'titre')} jamais proposés auparavant · renouvelée chaque lundi`,
  }) + `<div class="actions">
      <button class="big-play" data-act="play-list" data-list="weekly" aria-label="Lire">${I.play}</button>
      <button class="action-btn" data-act="save-list" data-list="weekly" data-name="Découvertes du ${esc(since)}" title="Copier dans ma bibliothèque">${I.plusCircle}<span>Enregistrer en playlist</span></button>
    </div>${w.tracks.length ? trackRowsHTML('weekly', w.tracks, { reasons: true }) : '<div class="empty">Like quelques titres pour recevoir tes Découvertes de la semaine.</div>'}`;
}

/* --- « Pas pour moi » --- */
const firstArtist = (t) => String(t.artist || '').split(',')[0].trim().toLowerCase();

async function notForMe(track, scope) {
  try {
    const r = await fetch('/api/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track: slim(track), scope }),
    });
    if (!r.ok) throw new Error();
  } catch {
    return toast('Impossible d\'enregistrer ton choix');
  }
  const drop = (t) => (scope === 'artist' ? firstArtist(t) === firstArtist(track) : t.id === track.id);
  const clean = (arr) => { for (let i = arr.length - 1; i >= 0; i--) if (drop(arr[i])) arr.splice(i, 1); };
  if (recoCache) { clean(recoCache.tracks); store.set('reco', recoCache); }
  Object.values(mixCache).forEach((m) => clean(m.tracks));
  if (weeklyCache) clean(weeklyCache.tracks);
  mixesCache = null; // les mixes seront recalculés sans cet artiste
  toast(scope === 'artist'
    ? `${track.artist.split(',')[0]} ne te sera plus recommandé (annulable dans Réglages)`
    : 'Ce titre ne te sera plus recommandé (annulable dans Réglages)');
  // Retire aussi ce titre / cet artiste de la file à venir
  const cur = current();
  P.queue = P.queue.filter((t, i) => i <= P.pos || !drop(t));
  if (cur && drop(cur)) next(false);
  render();
}

function notForMeMenu(track, anchor, point) {
  openMenu([
    { label: 'Pas pour moi' },
    { label: 'Ne plus me recommander ce titre', icon: I.minus, run: () => notForMe(track, 'track') },
    { label: `Ne plus me recommander ${track.artist.split(',')[0]}`, icon: I.minus, danger: true, run: () => notForMe(track, 'artist') },
  ], anchor, point);
}

// Recommandations : gardées pendant la session, régénérées avec « Nouveau mix »
let recoCache = store.get('reco', null);
async function loadReco(force = false, alive = () => true) {
  const box = $('#reco');
  if (!box) return;
  if (!lib.liked.length && !lib.playlists.some((p) => p.tracks.length)) {
    box.innerHTML = '<div class="empty" style="padding:24px">Like quelques titres pour recevoir des recommandations.</div>';
    return;
  }
  const fresh = recoCache && Date.now() - recoCache.at < 6 * 3600 * 1000;
  if (force || !fresh) {
    box.innerHTML = loadingHTML;
    try {
      const r = await api('/api/recommendations');
      recoCache = { at: Date.now(), tracks: r.tracks };
      store.set('reco', recoCache);
    } catch (e) {
      if (alive() && $('#reco')) $('#reco').innerHTML = errorHTML(e);
      return;
    }
  }
  if (!alive() || !$('#reco')) return;
  $('#reco').innerHTML = recoCache.tracks.length
    ? trackCardsHTML('reco', recoCache.tracks)
    : '<div class="empty" style="padding:24px">Aucune recommandation pour le moment. Réessaie avec « Nouveau mix ».</div>';
  updatePlayingUI();
}

async function startRadio(track) {
  toast(`Préparation de la radio ${track.artist.split(',')[0]}…`);
  try {
    const qs = new URLSearchParams({ artist: track.artist, trackId: track.id });
    const r = await api('/api/radio?' + qs);
    const key = `radio:${r.artist}`;
    LISTS[key] = r.tracks;
    playFrom(r.tracks, 0, key);
    toast(`Radio ${r.artist} : ${r.tracks.length} titres`);
  } catch (e) {
    toast(e.message);
  }
}

async function loadTrending(alive = () => true) {
  const box = $('#trending');
  if (!box) return;
  const g = homeGenre;
  try {
    const tracks = trendingCache[g] || (trendingCache[g] = await api('/api/trending?genre=' + encodeURIComponent(g)));
    if (!alive() || g !== homeGenre || !$('#trending')) return;
    box.innerHTML = tracks.length ? trackCardsHTML(`trending:${g}`, tracks) : '<div class="empty">Aucun titre pour ce genre cette semaine.</div>';
  } catch (e) {
    delete trendingCache[g];
    if (alive()) box.innerHTML = errorHTML(e);
  }
  updatePlayingUI();
}

let searchToken = 0;
async function viewSearch(q) {
  const input = $('#search-input');
  input.value = q;
  if (!isMobile() || !q) setTimeout(() => input.focus(), 0);
  view.innerHTML = '<div id="search-results"></div>';
  await runSearch(q);
}

async function runSearch(q) {
  const el = $('#search-results');
  if (!el) return;
  const token = ++searchToken;
  q = q.trim();
  if (!q) {
    el.innerHTML = `<div class="section-head"><h2>Parcourir tout</h2></div>
      <div class="genre-tiles">${GENRES.map(([g, l, c]) => `<button class="genre-tile" style="background:${c}" data-act="nav" data-href="#/genre/${encodeURIComponent(g)}">${esc(l)}</button>`).join('')}</div>`;
    return;
  }
  el.innerHTML = loadingHTML;
  try {
    const r = await api('/api/search?q=' + encodeURIComponent(q));
    if (token !== searchToken || !$('#search-results')) return;
    const catalog = r.catalog || [];
    if (!r.tracks.length && !r.playlists.length && !catalog.length) {
      el.innerHTML = `<div class="empty">${I.search}<h3>Aucun résultat pour « ${esc(q)} »</h3><p>Vérifie l'orthographe ou essaie d'autres mots-clés.</p></div>`;
      return;
    }
    el.innerHTML = `
      ${catalog.length ? `<div class="section-head"><h2>Catalogue officiel <small class="muted">· ${YTS.enabled ? 'lecture complète' : 'extraits de 30 s'}</small></h2></div>${fullPlayBanner()}${trackRowsHTML(`catalog:${q}`, catalog)}` : ''}
      ${r.tracks.length ? `<div class="section-head"><h2>Titres complets <small class="muted">· artistes indépendants</small></h2></div>${trackRowsHTML(`search:${q}`, r.tracks)}` : ''}
      ${r.playlists.length ? `<div class="section-head"><h2>Playlists</h2></div>${playlistCardsHTML(r.playlists)}` : ''}`;
    refreshHearts();
    updatePlayingUI();
  } catch (e) {
    if (token === searchToken) el.innerHTML = errorHTML(e);
  }
}

async function viewGenre(genre, alive) {
  view.innerHTML = loadingHTML;
  const tracks = trendingCache[genre] || (trendingCache[genre] = await api('/api/trending?genre=' + encodeURIComponent(genre)));
  if (!alive()) return;
  const color = (GENRES.find((g) => g[0] === genre) || [0, 0, '#444'])[2];
  const key = `genre:${genre}`;
  view.innerHTML = heroHTML({
    cover: `<div class="cover" style="background:${color};color:#fff">${I.note}</div>`,
    kind: 'Genre', title: genreLabel(genre), color,
    meta: `Tendances de la semaine · ${plural(tracks.length, 'titre')}`,
  }) + `<div class="actions"><button class="big-play" data-act="play-list" data-list="${esc(key)}" aria-label="Lire">${I.play}</button></div>
    ${tracks.length ? trackRowsHTML(key, tracks) : '<div class="empty">Aucun titre trouvé.</div>'}`;
}

function viewLiked() {
  const tracks = lib.liked;
  view.innerHTML = heroHTML({
    cover: coverHTML({ kind: 'liked' }), kind: 'Playlist', title: 'Titres likés', color: '#5038a0',
    meta: `${plural(tracks.length, 'titre')}${tracks.length ? ' · ' + fmtTotal(tracks) : ''}`,
  }) + (tracks.length
    ? `<div class="actions"><button class="big-play" data-act="play-list" data-list="liked" aria-label="Lire">${I.play}</button></div>${tracks.some((t) => t.preview) ? fullPlayBanner() : ''}${trackRowsHTML('liked', tracks)}`
    : `<div class="empty">${I.heart}<h3>Les titres que tu aimes s'afficheront ici</h3><p>Clique sur le cœur à côté d'un titre pour l'enregistrer.</p><button class="btn primary" data-act="nav" data-href="#/search">Rechercher des titres</button></div>`);
}

function viewMyPlaylist(id) {
  const pl = getPlaylist(id);
  if (!pl) { view.innerHTML = `<div class="empty"><h3>Playlist introuvable</h3><button class="btn primary" data-act="nav" data-href="#/home">Retour à l'accueil</button></div>`; return; }
  const key = `my:${id}`;
  view.innerHTML = heroHTML({
    cover: coverHTML({ kind: 'my', tracks: pl.tracks }), kind: 'Playlist', title: pl.name,
    color: `hsl(${hue(pl.id)} 40% 32%)`, titleAct: `data-act="rename-playlist" data-pid="${esc(id)}" style="cursor:pointer" title="Renommer"`,
    meta: `${plural(pl.tracks.length, 'titre')}${pl.tracks.length ? ' · ' + fmtTotal(pl.tracks) : ''}`,
  }) + `<div class="actions">
      ${pl.tracks.length ? `<button class="big-play" data-act="play-list" data-list="${esc(key)}" aria-label="Lire">${I.play}</button>` : ''}
      <button class="action-btn" data-act="rename-playlist" data-pid="${esc(id)}" title="Renommer">${I.pencil}</button>
      <button class="action-btn" data-act="delete-playlist" data-pid="${esc(id)}" title="Supprimer">${I.trash}</button>
    </div>
    ${pl.tracks.length ? trackRowsHTML(key, pl.tracks, { removable: true })
      : `<div class="empty">${I.note}<h3>Ta playlist est vide</h3><p>Trouve des titres, puis utilise le menu « ⋯ » pour les ajouter ici.</p><button class="btn primary" data-act="nav" data-href="#/search">Rechercher des titres</button></div>`}`;
}

const remoteCache = {};
async function fetchRemote(id) {
  return remoteCache[id] || (remoteCache[id] = await api('/api/playlist/' + encodeURIComponent(id)));
}

async function viewRemotePlaylist(id, alive) {
  view.innerHTML = loadingHTML;
  const { playlist, tracks } = await fetchRemote(id);
  if (!alive()) return;
  const key = `pl:${id}`;
  view.innerHTML = heroHTML({
    cover: coverHTML(playlist), kind: 'Playlist publique', title: playlist.name, color: `hsl(${hue(id)} 40% 30%)`,
    meta: `${playlist.artist ? esc(playlist.artist) + ' · ' : ''}${plural(tracks.length, 'titre')}${tracks.length ? ' · ' + fmtTotal(tracks) : ''}`,
  }) + `<div class="actions">
      <button class="big-play" data-act="play-list" data-list="${esc(key)}" aria-label="Lire">${I.play}</button>
      <button class="action-btn" data-act="save-remote" data-pid="${esc(id)}" title="Copier dans ma bibliothèque">${I.plusCircle}<span>Enregistrer dans ma bibliothèque</span></button>
    </div>
    ${tracks.length ? trackRowsHTML(key, tracks) : '<div class="empty">Cette playlist ne contient aucun titre disponible.</div>'}`;
}

const fullPlayBanner = () => YTS.enabled ? '' : `<div class="info-banner">
  <span><strong>Ces titres sont des extraits de 30 s.</strong> Active la lecture complète gratuite via YouTube (5 minutes, une seule fois).</span>
  <button class="btn primary" data-act="nav" data-href="#/settings">Activer</button></div>`;

function viewSettings() {
  view.innerHTML = `<h1 class="greeting">Réglages</h1>
  <section class="settings-card">
    <h2>Lecture complète des titres (YouTube)</h2>
    <p class="status ${YTS.enabled ? 'ok' : ''}">${YTS.enabled
      ? '✓ Activée : les titres du catalogue officiel sont lus en entier.'
      : 'Désactivée : les titres du catalogue officiel sont limités à des extraits de 30 s.'}</p>
    <p class="muted">Sonora retrouve chaque titre sur YouTube (audio officiel des labels en priorité) et le lit en entier dans le lecteur intégré. C'est gratuit, sans abonnement. Il faut seulement une clé API Google gratuite, créée une seule fois.</p>
    <ol class="steps">
      <li>Ouvre la <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud Console</a> (avec ton compte Gmail) et crée un projet nommé par exemple « Sonora ». <em>Aucune carte bancaire n'est demandée.</em></li>
      <li>Active l'API <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">YouTube Data API v3</a> avec le bouton « Activer ».</li>
      <li>Va dans <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Identifiants</a>, puis « Créer des identifiants » → « Clé API ». Copie la clé, qui commence par <code>AIza</code>.</li>
      <li>Colle-la ci-dessous et enregistre.</li>
    </ol>
    <form class="key-form" id="yt-form">
      <input id="yt-key" type="password" placeholder="${YTS.enabled ? 'Clé enregistrée (colle une nouvelle clé pour la remplacer)' : 'AIza…'}" autocomplete="off" spellcheck="false">
      <button class="btn primary" type="submit">Enregistrer</button>
    </form>
    <p class="muted small">${window.SONORA_STATIC ? 'La clé est gardée dans cet appareil.' : 'La clé reste sur ton PC (data/youtube.json).'} Le quota gratuit permet de trouver environ 100 nouveaux titres par jour ; un titre déjà trouvé ne consomme plus rien.</p>
  </section>

  <section class="settings-card">
    <h2>Ton profil musical</h2>
    <p class="muted">Sonora apprend en t'écoutant : un titre écouté jusqu'au bout renforce l'artiste, un titre passé dans les 30 premières secondes l'affaiblit. « Pas pour moi » exclut définitivement un titre ou un artiste des recommandations.</p>
    <div id="taste-box">${loadingHTML}</div>
  </section>

  <section class="settings-card" id="phone">
    <h2>Sonora sur ton téléphone</h2>
    <div id="phone-box">${loadingHTML}</div>
  </section>`;
  loadTaste();
  loadPhoneInfo();
  $('#yt-form').onsubmit = async (e) => {
    e.preventDefault();
    const apiKey = $('#yt-key').value.trim();
    if (!apiKey) return;
    const btn = e.submitter;
    btn.disabled = true;
    btn.textContent = 'Vérification…';
    try {
      const r = await fetch('/api/youtube/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Clé refusée');
      YTS.enabled = true;
      P.loaded = false; // le titre en cours sera relu en entier
      toast('Lecture complète activée !');
      render();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = 'Enregistrer';
    }
  };
}

async function loadTaste() {
  const box = $('#taste-box');
  if (!box) return;
  try {
    const t = await api('/api/taste');
    const chips = (list, cls) => list.length
      ? `<div class="chips">${list.map((a) => `<span class="chip static ${cls}">${esc(a.name)}</span>`).join('')}</div>`
      : '<p class="muted small">Rien pour l\'instant.</p>';
    const banned = [
      ...t.banned.artists.map((a) => ({ label: a.name, sub: 'Artiste', kind: 'artist', key: a.key })),
      ...t.banned.tracks.map((x) => ({ label: x.title, sub: x.artist, kind: 'track', key: x.key })),
    ];
    if (!$('#taste-box')) return;
    $('#taste-box').innerHTML = `
      <p class="stats"><strong>${t.completes}</strong> écoute${t.completes > 1 ? 's' : ''} complète${t.completes > 1 ? 's' : ''} · <strong>${t.skips}</strong> titre${t.skips > 1 ? 's' : ''} passé${t.skips > 1 ? 's' : ''}</p>
      <h3>Artistes renforcés par ton écoute</h3>${chips(t.loved, 'up')}
      <h3>Artistes que tu passes souvent</h3>${chips(t.disliked, 'down')}
      <h3>Exclus des recommandations</h3>
      ${banned.length ? `<ul class="ban-list">${banned.map((b) => `<li><span><strong>${esc(b.label)}</strong> <small>${esc(b.sub)}</small></span>
        <button class="btn ghost" data-act="unban" data-kind="${b.kind}" data-key="${esc(b.key)}">Rétablir</button></li>`).join('')}</ul>`
        : '<p class="muted small">Aucun. Utilise « ✕ » sur une recommandation ou le menu « ⋯ » → Pas pour moi.</p>'}`;
  } catch (e) {
    box.innerHTML = errorHTML(e);
  }
}

function loadQRLib() {
  return new Promise((resolve, reject) => {
    if (window.QRCode) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function loadPhoneInfo() {
  const box = $('#phone-box');
  if (!box) return;
  if (window.SONORA_STATIC) {
    box.innerHTML = `
      <h3>Installer l'application</h3>
      <p class="muted">Sur Android, dans Chrome : menu <strong>⋮</strong> → <strong>Installer l'application</strong> (ou <strong>Ajouter à l'écran d'accueil</strong>). Sur iPhone, dans Safari : <strong>Partager</strong> → <strong>Sur l'écran d'accueil</strong>.</p>
      <p class="muted">Tout fonctionne depuis ce téléphone, en Wi-Fi comme en 4G, sans ordinateur allumé.</p>
      <h3>Sauvegarde</h3>
      <p class="muted">Ta bibliothèque et tes goûts appris sont gardés dans cet appareil. Fais une sauvegarde de temps en temps : elle te permet de tout retrouver sur un nouveau téléphone ou après avoir effacé les données du navigateur.</p>
      <div class="key-form">
        <button class="btn primary" data-act="backup">Télécharger une sauvegarde</button>
        <button class="btn ghost" data-act="restore">Restaurer une sauvegarde…</button>
        <input type="file" id="restore-file" accept="application/json,.json" hidden>
      </div>
      <p class="muted small">Bon à savoir : la musique lue via YouTube se met en général en pause quand l'écran s'éteint ou que tu changes d'application (limite des lecteurs YouTube intégrés). Garde Sonora au premier plan pendant l'écoute.</p>`;
    $('#restore-file').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const r = await fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        toast('Sauvegarde restaurée');
        setTimeout(() => location.reload(), 800);
      } catch (err) {
        toast(err.message || 'Fichier illisible');
      }
    };
    return;
  }
  const onPhone = !['localhost', '127.0.0.1'].includes(location.hostname);
  if (onPhone) {
    box.innerHTML = `<p class="status ok">✓ Tu utilises déjà Sonora depuis un autre appareil.</p>
      <p class="muted">Pour l'installer comme une vraie application : dans Chrome, menu <strong>⋮</strong> → <strong>Ajouter à l'écran d'accueil</strong> (sur iPhone, dans Safari : <strong>Partager</strong> → <strong>Sur l'écran d'accueil</strong>).</p>`;
    return;
  }
  try {
    const { addresses } = await api('/api/server-info');
    const wifi = addresses.filter((a) => !a.tailscale);
    const ts = addresses.filter((a) => a.tailscale);
    box.innerHTML = `
      <h3>1. À la maison (même Wi-Fi que ce PC)</h3>
      ${wifi.length ? `<div class="qr-row">${wifi.map((a, i) => `<div class="qr-item"><div class="qr" id="qr-${i}"></div><code>${esc(a.url)}</code></div>`).join('')}</div>
      <p class="muted">Scanne ce QR code avec l'appareil photo de ton téléphone (connecté au même Wi-Fi), puis dans Chrome : menu <strong>⋮</strong> → <strong>Ajouter à l'écran d'accueil</strong>. Sur iPhone, dans Safari : <strong>Partager</strong> → <strong>Sur l'écran d'accueil</strong>.</p>
      <p class="muted small">Si la page ne s'ouvre pas, le pare-feu Windows bloque l'accès : voir le README, section « Téléphone ».</p>`
        : '<p class="muted">Ce PC n\'est connecté à aucun réseau Wi-Fi ou Ethernet.</p>'}
      <h3>2. Partout (4G, hors de chez toi)</h3>
      ${ts.length ? `<div class="qr-row">${ts.map((a, i) => `<div class="qr-item"><div class="qr" id="qr-ts-${i}"></div><code>${esc(a.url)}</code></div>`).join('')}</div>
      <p class="muted">Tailscale est actif : cette adresse fonctionne depuis ton téléphone n'importe où, tant que ce PC est allumé.</p>`
        : `<p class="muted">Installe <a href="https://tailscale.com/download" target="_blank" rel="noopener">Tailscale</a> (gratuit) sur ce PC et sur ton téléphone, connecte-les au même compte, puis reviens ici : une deuxième adresse apparaîtra. Ton PC doit rester allumé avec Sonora lancé.</p>`}
      <p class="muted small">Bon à savoir : sur téléphone, la musique lue via YouTube se met en général en pause quand l'écran s'éteint ou que tu changes d'application (limite des lecteurs YouTube intégrés). Garde Sonora au premier plan pendant l'écoute.</p>`;
    await loadQRLib();
    [...wifi.map((a, i) => [`qr-${i}`, a.url]), ...ts.map((a, i) => [`qr-ts-${i}`, a.url])].forEach(([id, url]) => {
      const el = document.getElementById(id);
      if (el) new window.QRCode(el, { text: url, width: 148, height: 148, colorDark: '#000000', colorLight: '#ffffff' });
    });
  } catch {
    box.querySelectorAll('.qr').forEach((q) => { q.remove(); });
  }
}

function viewLibrary() {
  view.innerHTML = `<div class="section-head" style="margin-top:8px"><h2>Ma bibliothèque</h2>
      <button class="icon-btn" data-act="new-playlist" aria-label="Créer une playlist">${I.plus}</button></div>
    <ul class="library-list" style="padding:0">${[libItemHTML({ kind: 'liked' }), ...lib.playlists.map((pl) => libItemHTML({ kind: 'my', pl }))].join('')}</ul>`;
}

function viewQueue() {
  const t = current();
  if (!t) {
    view.innerHTML = `<div class="empty">${I.queue}<h3>Ta file d'attente est vide</h3><p>Lance un titre pour la remplir.</p></div>`;
    return;
  }
  const upcoming = P.queue.slice(P.pos + 1);
  view.innerHTML = `<h1 class="greeting">File d'attente</h1>
    <div class="queue-label">En cours de lecture</div>
    <div class="queue-now">${trackRowsHTML('queue-now', [t], { header: false })}</div>
    ${upcoming.length ? `<div class="queue-label">À suivre</div>${trackRowsHTML('queue-up', upcoming, { header: false, startNum: 2 })}` : ''}`;
}

/* ===== Menu contextuel ===== */
const menu = $('#menu');
let menuItems = [];

function openMenu(items, anchor, point) {
  menuItems = items;
  menu.innerHTML = items.map((it, i) => {
    if (it === '-') return '<hr>';
    if (it.label && !it.run) return `<div class="menu-label">${esc(it.label)}</div>`;
    return `<button data-mi="${i}" class="${it.danger ? 'danger' : ''}">${it.icon || ''}<span>${esc(it.label)}</span></button>`;
  }).join('');
  menu.hidden = false;
  const r = point ? { left: point.x, right: point.x, top: point.y, bottom: point.y } : anchor.getBoundingClientRect();
  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let x = r.right - mw, y = r.bottom + 4;
  if (point) x = point.x;
  if (x + mw > innerWidth - 8) x = innerWidth - mw - 8;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
  menu.style.left = Math.max(8, x) + 'px';
  menu.style.top = y + 'px';
}
function closeMenu() { menu.hidden = true; }

menu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mi]');
  if (!b) return;
  const it = menuItems[+b.dataset.mi];
  closeMenu();
  it.run();
});

function trackMenu(track, key, index, anchor, point) {
  const liked = isLiked(track.id);
  const items = [
    { label: 'Lire ensuite', icon: I.queue, run: () => playNext(track) },
    { label: `Radio ${track.artist.split(',')[0]}`, icon: I.note, run: () => startRadio(track) },
    { label: liked ? 'Retirer des titres likés' : 'Ajouter aux titres likés', icon: liked ? I.heartFill : I.heart, run: () => toggleLike(track) },
    '-',
    { label: 'Ajouter à une playlist' },
    { label: 'Nouvelle playlist', icon: I.plus, run: async () => { const pl = await createPlaylist({ go: false }); if (pl) addToPlaylist(pl.id, track); } },
    ...lib.playlists.filter((p) => `my:${p.id}` !== key).map((p) => ({ label: p.name, icon: I.note, run: () => addToPlaylist(p.id, track) })),
  ];
  if (!lib.liked.some((t) => t.id === track.id)) {
    items.push('-', { label: 'Pas pour moi' },
      { label: 'Ne plus me recommander ce titre', icon: I.minus, run: () => notForMe(track, 'track') },
      { label: `Ne plus me recommander ${track.artist.split(',')[0]}`, icon: I.minus, run: () => notForMe(track, 'artist') });
  }
  const ytQuery = encodeURIComponent(`${track.title} ${track.artist}`);
  items.push('-', { label: 'Écouter en entier' });
  if (track.link) items.push({ label: 'Sur Deezer', icon: I.play, run: () => window.open(track.link, '_blank', 'noopener') });
  items.push({ label: 'Sur YouTube', icon: I.play, run: () => window.open(`https://www.youtube.com/results?search_query=${ytQuery}`, '_blank', 'noopener') });
  if (key && key.startsWith('my:')) {
    items.push('-', { label: 'Retirer de cette playlist', icon: I.minus, danger: true, run: () => removeFromPlaylist(key.slice(3), index) });
  }
  openMenu(items, anchor, point);
}

/* ===== Modale & toast ===== */
function openModal({ title, text = '', value = '', input = true, okLabel = 'Enregistrer' }) {
  const modal = $('#modal'), form = $('#modal-form'), inp = $('#modal-input');
  $('#modal-title').textContent = title;
  $('#modal-text').textContent = text;
  $('#modal-text').hidden = !text;
  $('#modal-ok').textContent = okLabel;
  inp.hidden = !input;
  inp.value = value;
  modal.hidden = false;
  if (input) setTimeout(() => { inp.focus(); inp.select(); }, 0);
  else setTimeout(() => $('#modal-ok').focus(), 0);
  return new Promise((resolve) => {
    const done = (v) => {
      modal.hidden = true;
      form.onsubmit = modal.onclick = document.onkeydown = $('#modal-cancel').onclick = null;
      resolve(v);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!input) return done(true);
      const v = inp.value.trim();
      if (v) done(v); else inp.focus();
    };
    $('#modal-cancel').onclick = () => done(null);
    modal.onclick = (e) => { if (e.target === modal) done(null); };
    document.onkeydown = (e) => { if (e.key === 'Escape') done(null); };
  });
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ===== Événements ===== */
document.addEventListener('click', async (e) => {
  if (!e.target.closest('#menu') && !e.target.closest('[data-act="menu"]')) closeMenu();
  const el = e.target.closest('[data-act]');
  const row = e.target.closest('.track');

  if (!el) {
    // Clic simple sur une ligne : sélection (ou lecture sur mobile)
    if (row) {
      if (isMobile()) return playRow(row);
      $$('.track.selected').forEach((r) => r.classList.remove('selected'));
      row.classList.add('selected');
    }
    return;
  }

  const act = el.dataset.act;
  switch (act) {
    case 'nav': location.hash = el.dataset.href; break;
    case 'retry': render(); break;
    case 'play-track': {
      e.stopPropagation();
      const src = el.dataset.list ? el : el.closest('[data-list]');
      const key = src.dataset.list, idx = +src.dataset.index;
      if (key === 'queue-up') return jumpTo(P.pos + 1 + idx);
      if (key === 'queue-now') return togglePlay();
      const list = getList(key);
      const cur = current();
      if (cur && P.context === key && cur.id === list[idx]?.id) togglePlay();
      else playFrom(list, idx, key);
      break;
    }
    case 'play-list': {
      e.stopPropagation();
      const key = el.dataset.list;
      if (current() && P.context === key) togglePlay();
      else playFrom(getList(key), 0, key);
      break;
    }
    case 'play-remote': {
      e.stopPropagation();
      const id = el.dataset.pid, key = `pl:${id}`;
      if (current() && P.context === key) return togglePlay();
      try {
        const { tracks } = await fetchRemote(id);
        LISTS[key] = tracks;
        playFrom(tracks, 0, key);
      } catch (err) { toast(err.message); }
      break;
    }
    case 'like': {
      const id = el.dataset.id;
      const r = el.closest('.track');
      const track = r ? getList(r.dataset.list)[+r.dataset.index] : current();
      if (track && track.id === id) toggleLike(track);
      break;
    }
    case 'menu': {
      const r = el.closest('.track');
      if (!menu.hidden) { closeMenu(); break; }
      trackMenu(getList(r.dataset.list)[+r.dataset.index], r.dataset.list, +r.dataset.index, el);
      break;
    }
    case 'home-genre':
      homeGenre = el.dataset.genre;
      $$('#genre-chips .chip').forEach((c) => c.classList.toggle('active', c === el));
      $('#trending').innerHTML = loadingHTML;
      loadTrending();
      break;
    case 'reco-refresh': loadReco(true); break;
    case 'backup': {
      try {
        const data = await api('/api/backup');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sonora-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        toast('Sauvegarde téléchargée');
      } catch (err) { toast(err.message); }
      break;
    }
    case 'restore': $('#restore-file')?.click(); break;
    case 'not-for-me': {
      e.stopPropagation();
      if (!menu.hidden) { closeMenu(); break; }
      notForMeMenu(getList(el.dataset.list)[+el.dataset.index], el);
      break;
    }
    case 'play-mix': {
      e.stopPropagation();
      const id = el.dataset.mix, key = el.dataset.list;
      if (current() && P.context === key) return togglePlay();
      try {
        const { tracks } = id === 'weekly' ? await fetchWeekly() : await fetchMix(id);
        LISTS[key] = tracks;
        playFrom(tracks, 0, key);
      } catch (err) { toast(err.message); }
      break;
    }
    case 'mix-refresh': {
      el.disabled = true;
      try { await fetchMix(el.dataset.mix, true); toast('Nouveau mix prêt'); render(); }
      catch (err) { toast(err.message); el.disabled = false; }
      break;
    }
    case 'save-list': {
      const tracks = getList(el.dataset.list);
      if (!tracks.length) break;
      const pl = await createPlaylist({ name: el.dataset.name, tracks: tracks.map(({ reason, ...t }) => t), go: false });
      toast(`« ${pl.name} » enregistrée dans ta bibliothèque`);
      break;
    }
    case 'unban': {
      try {
        await fetch('/api/taste/unban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: el.dataset.kind, key: el.dataset.key }) });
        mixesCache = null;
        toast('Rétabli dans les recommandations');
        loadTaste();
      } catch { toast('Action impossible'); }
      break;
    }
    case 'new-playlist': createPlaylist(); break;
    case 'rename-playlist': renamePlaylist(el.dataset.pid); break;
    case 'delete-playlist': deletePlaylist(el.dataset.pid); break;
    case 'save-remote': {
      const { playlist, tracks } = await fetchRemote(el.dataset.pid);
      const pl = await createPlaylist({ name: playlist.name, tracks, go: false });
      toast(`« ${pl.name} » enregistrée dans ta bibliothèque`);
      break;
    }
  }
});

function playRow(row) {
  const key = row.dataset.list, idx = +row.dataset.index;
  if (key === 'queue-up') return jumpTo(P.pos + 1 + idx);
  if (key === 'queue-now') return togglePlay();
  playFrom(getList(key), idx, key);
}

document.addEventListener('dblclick', (e) => {
  const row = e.target.closest('.track');
  if (row && !e.target.closest('button')) playRow(row);
});

document.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.track');
  const li = e.target.closest('.lib-item[data-pl]');
  if (row) {
    e.preventDefault();
    trackMenu(getList(row.dataset.list)[+row.dataset.index], row.dataset.list, +row.dataset.index, null, { x: e.clientX, y: e.clientY });
  } else if (li) {
    e.preventDefault();
    const id = li.dataset.pl;
    openMenu([
      { label: 'Lire', icon: I.play, run: () => playFrom(getList(`my:${id}`), 0, `my:${id}`) },
      { label: 'Renommer', icon: I.pencil, run: () => renamePlaylist(id) },
      '-',
      { label: 'Supprimer', icon: I.trash, danger: true, run: () => deletePlaylist(id) },
    ], null, { x: e.clientX, y: e.clientY });
  }
});

main.addEventListener('scroll', () => {
  closeMenu();
  $('#topbar').classList.toggle('scrolled', main.scrollTop > 10);
});
window.addEventListener('resize', closeMenu);
window.addEventListener('hashchange', render);

$('#search-input').addEventListener('input', debounce((e) => {
  const q = e.target.value;
  history.replaceState(null, '', '#/search' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : ''));
  runSearch(q);
}, 350));

$('#btn-new-playlist').addEventListener('click', () => createPlaylist());

// Lecteur
$('#btn-play').addEventListener('click', togglePlay);
$('#btn-next').addEventListener('click', () => next(false));
$('#btn-prev').addEventListener('click', prev);
$('#btn-shuffle').addEventListener('click', () => setShuffle(!P.shuffle));
$('#btn-repeat').addEventListener('click', cycleRepeat);
$('#btn-queue').addEventListener('click', () => {
  location.hash = parseRoute().name === 'queue' ? '#/home' : '#/queue';
});
$('#now-playing').addEventListener('click', (e) => {
  if (isMobile() && !e.target.closest('button')) location.hash = '#/queue';
});

const seek = $('#seek');
seek.addEventListener('input', () => {
  P.seeking = true;
  setSliderFill(seek);
  const d = audio.duration || current()?.duration || 0;
  $('#time-cur').textContent = fmtTime((seek.value / 1000) * d);
});
seek.addEventListener('change', () => {
  const d = eng().duration || 0;
  if (d && P.loaded) eng().seek((seek.value / 1000) * d);
  P.seeking = false;
});

// Volume commun aux deux moteurs (audio HTML et YouTube)
const vol = $('#volume');
let volume = store.get('volume', 0.8);
let muted = false;
function effectiveVolume() { return muted ? 0 : volume; }
function applyVolume() {
  audio.volume = effectiveVolume();
  if (YTS.ready) YTS.player.setVolume(Math.round(effectiveVolume() * 100));
}
vol.value = Math.round(volume * 100);
setSliderFill(vol);
applyVolume();
vol.addEventListener('input', () => {
  volume = vol.value / 100;
  muted = false;
  store.set('volume', volume);
  applyVolume();
  setSliderFill(vol);
  updateControls();
});
$('#btn-mute').addEventListener('click', () => {
  if (muted || volume === 0) { muted = false; if (volume === 0) volume = 0.5; }
  else muted = true;
  vol.value = Math.round(effectiveVolume() * 100);
  applyVolume();
  setSliderFill(vol);
  updateControls();
});

function updateProgress() {
  trackListen();
  if (P.seeking) return;
  const d = eng().duration || current()?.duration || 0;
  const tm = eng().time;
  seek.value = d ? Math.round((tm / d) * 1000) : 0;
  setSliderFill(seek);
  $('#time-cur').textContent = fmtTime(tm);
  if (eng().duration) $('#time-dur').textContent = fmtTime(eng().duration);
}

audio.addEventListener('timeupdate', () => { if (active === 'html') updateProgress(); });
audio.addEventListener('playing', () => { P.errors = 0; });
audio.addEventListener('play', updatePlayingUI);
audio.addEventListener('pause', updatePlayingUI);
audio.addEventListener('ended', () => { if (active === 'html') { markEnded(); next(true); } });
audio.addEventListener('error', () => {
  if (active !== 'html' || !audio.src || !current()) return;
  P.errors++;
  if (P.errors >= 3) { toast('Plusieurs titres sont indisponibles. Vérifie ta connexion.'); P.errors = 0; updatePlayingUI(); return; }
  toast('Titre indisponible, passage au suivant…');
  setTimeout(() => next(false), 800);
});

// Raccourcis clavier
document.addEventListener('keydown', (e) => {
  if (!$('#modal').hidden) return;
  if (e.target.matches('input, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowRight' && e.ctrlKey) next(false);
  else if (e.key === 'ArrowLeft' && e.ctrlKey) prev();
  else if (e.key === 'Escape') closeMenu();
});

// Touches multimédia du clavier / écran de verrouillage
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => togglePlay());
  ms.setActionHandler('pause', () => eng().pause());
  ms.setActionHandler('previoustrack', prev);
  ms.setActionHandler('nexttrack', () => next(false));
  try { ms.setActionHandler('seekto', (d) => eng().seek(d.seekTime)); } catch { /* non supporté */ }
}

/* ===== Démarrage ===== */
(async function init() {
  try {
    lib = await api('/api/library');
  } catch {
    toast('Impossible de charger ta bibliothèque');
  }
  // Application installable (le service worker exige HTTPS ou localhost)
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  await refreshYouTubeStatus();
  restoreSession();
  renderSidebar();
  updateControls();
  render();
})();
