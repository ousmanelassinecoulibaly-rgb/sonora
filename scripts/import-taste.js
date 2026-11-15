// Importe la liste data/my-taste.json ([titre, artistes]) dans « Titres likés ».
// Chaque titre est retrouvé dans le catalogue Deezer (extrait officiel 30 s + pochette).
// Usage : node scripts/import-taste.js   (relançable sans créer de doublons)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIST = path.join(ROOT, 'data', 'my-taste.json');
const LIBRARY = path.join(ROOT, 'data', 'library.json');

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\$/g, 's').replace(/[^a-z0-9]/g, '');
const baseTitle = (t) => t.replace(/\s*[([].*?[)\]]\s*/g, ' ').trim();

async function find(title, artists, deezerId) {
  if (deezerId) {
    // Correspondance forcée : 3e élément de la ligne = identifiant de piste Deezer
    const t = await fetch(`https://api.deezer.com/track/${deezerId}`, { signal: AbortSignal.timeout(12000) }).then((r) => r.json());
    return t && !t.error && t.preview ? t : null;
  }
  const main = artists.split(',')[0].trim();
  const base = baseTitle(title);
  const url = `https://api.deezer.com/search?limit=15&q=${encodeURIComponent(base + ' ' + main)}`;
  const { data = [] } = await fetch(url, { signal: AbortSignal.timeout(12000) }).then((r) => r.json());
  const artistOk = (t) => norm(t.artist.name).includes(norm(main)) || norm(main).includes(norm(t.artist.name));
  const titleOk = (t) => norm(t.title).includes(norm(base));
  const wantsRemix = /remix/i.test(title);
  const cands = data.filter((t) => t.preview && artistOk(t) && titleOk(t));
  // Préfère la bonne version (remix ou non)
  return cands.find((t) => /remix/i.test(t.title) === wantsRemix) || cands[0] || null;
}

(async () => {
  const list = JSON.parse(fs.readFileSync(LIST, 'utf8'));
  let lib = { liked: [], playlists: [] };
  try { lib = JSON.parse(fs.readFileSync(LIBRARY, 'utf8')); } catch { /* nouvelle bibliothèque */ }

  const found = [], missing = [];
  for (const [title, artists, deezerId] of list) {
    try {
      const t = await find(title, artists, deezerId);
      if (!t) { missing.push(`${title} — ${artists}`); continue; }
      found.push({
        id: 'dz-' + t.id,
        title,
        artist: artists,
        artwork: t.album?.cover_big || null,
        duration: t.duration,
        genre: '',
        source: 'deezer',
        preview: true,
        link: t.link,
        addedAt: Date.now() - found.length * 1000,
      });
      console.log(`✓ ${title} — ${artists}`);
    } catch (e) {
      missing.push(`${title} — ${artists} (${e.message})`);
    }
  }

  const ids = new Set(found.map((t) => t.id));
  lib.liked = [...found, ...lib.liked.filter((t) => !ids.has(t.id))];
  fs.mkdirSync(path.dirname(LIBRARY), { recursive: true });
  fs.writeFileSync(LIBRARY, JSON.stringify(lib, null, 2));

  console.log(`\n${found.length}/${list.length} titres ajoutés aux Titres likés.`);
  if (missing.length) console.log('Introuvables :\n  - ' + missing.join('\n  - '));
})();
