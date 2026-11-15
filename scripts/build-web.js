// Fabrique la version en ligne de Sonora (sans serveur) dans le dossier docs/, publié par GitHub Pages.
// Usage : node scripts/build-web.js
//
// - Copie l'interface (public/), le moteur de recommandation et le « serveur de poche » (web/backend.js)
// - Ajoute la bibliothèque de départ (data/library.json) et la configuration (clé YouTube « web »,
//   lue dans data/youtube-web.json — clé limitée au site GitHub Pages)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, 'public'), OUT);
fs.copyFileSync(path.join(ROOT, 'recommender.js'), path.join(OUT, 'recommender.js'));
fs.copyFileSync(path.join(ROOT, 'web', 'backend.js'), path.join(OUT, 'backend.js'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

// Configuration
const ytKey = process.env.SONORA_WEB_YT_KEY || readJSON(path.join(ROOT, 'data', 'youtube-web.json'), {}).apiKey || '';
fs.writeFileSync(path.join(OUT, 'config.js'),
  `// Clé YouTube limitée au site de Sonora (inutilisable ailleurs)\nwindow.SONORA_CONFIG = ${JSON.stringify({ youtubeKey: ytKey })};\n`);

// Bibliothèque de départ (titres likés et playlists)
const lib = readJSON(path.join(ROOT, 'data', 'library.json'), { liked: [], playlists: [] });
fs.writeFileSync(path.join(OUT, 'seed-library.json'), JSON.stringify({ liked: lib.liked || [], playlists: lib.playlists || [] }));

// Scripts du mode en ligne, chargés avant l'application
const indexFile = path.join(OUT, 'index.html');
const html = fs.readFileSync(indexFile, 'utf8');
if (!html.includes('<script src="app.js"></script>')) throw new Error('index.html : balise app.js introuvable');
fs.writeFileSync(indexFile, html.replace('<script src="app.js"></script>',
  '<script src="config.js"></script>\n  <script src="recommender.js"></script>\n  <script src="backend.js"></script>\n  <script src="app.js"></script>'));

// Nouveau nom de cache à chaque version (les téléphones récupèrent la mise à jour)
const swFile = path.join(OUT, 'sw.js');
fs.writeFileSync(swFile, fs.readFileSync(swFile, 'utf8').replace('__BUILD__', Date.now().toString(36)));

console.log(`Version en ligne générée dans docs/ (${lib.liked?.length || 0} titres likés, clé YouTube ${ytKey ? 'présente' : 'ABSENTE'}).`);
