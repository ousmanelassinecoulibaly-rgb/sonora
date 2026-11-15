# Sonora : mon lecteur de musique perso, 100 % gratuit

## 📱 Version en ligne (téléphone, partout, sans PC)
**https://ousmanelassinecoulibaly-rgb.github.io/sonora/**

- Elle tourne entièrement dans le navigateur. Le « serveur de poche » `web/backend.js` remplace le serveur du PC.
- Elle est hébergée gratuitement par GitHub Pages, depuis le dossier `docs/`.
- La bibliothèque et les goûts appris sont gardés **dans le téléphone**. Utilise *Réglages → Sauvegarde* de temps en temps.
- La clé YouTube du site (`docs/config.js`) ne fonctionne que depuis cette adresse.

**Publier une modification de l'app :** `node scripts/build-web.js`, puis `git add -A`, `git commit -m "..."` et `git push`. GitHub met le site à jour en environ une minute.

## 💻 Version locale (PC)

Une alternative à Spotify qui tourne en local : accueil, recherche, titres likés, playlists, file d'attente, mode aléatoire et répétition, **recommandations** et **radios d'artiste**. Aucun abonnement.

## Lancer
- Double-clique sur **`Lancer.bat`**, ou exécute `npm start`
- L'app s'ouvre sur **http://localhost:3000**

Aucune dépendance à installer, il suffit de Node.js 18 ou plus récent.

## Écouter les titres en entier (à faire une fois)
Sans configuration, les titres du catalogue officiel ne sont que des extraits de 30 s.
Va dans **Réglages** et colle une **clé API YouTube gratuite** (le guide pas à pas est sur la page) :
1. Crée un projet sur la [Google Cloud Console](https://console.cloud.google.com/projectcreate). Aucune carte bancaire n'est demandée.
2. Active **YouTube Data API v3**.
3. Va dans **Identifiants**, puis **Créer des identifiants** → **Clé API**.

Sonora retrouve ensuite chaque titre sur YouTube (audio officiel des labels en priorité) et le lit **en entier** dans le lecteur intégré. Les règles de YouTube imposent que ce lecteur reste visible : c'est la petite fenêtre en bas à droite. Chaque titre trouvé est mémorisé, et le quota gratuit permet d'en trouver environ 100 nouveaux par jour.

## Sources
| Source | Rôle | Clé |
|---|---|---|
| Deezer | Catalogue officiel : recherche, pochettes, recommandations, radios | Aucune |
| YouTube | Lecture complète des titres officiels | Clé gratuite |
| Audius | Artistes indépendants (titres complets) et tendances | Aucune |

## Recommandations (`recommender.js`)
- **Découvertes pour toi** : des artistes proches des tiens (niveau 1), plus environ 20 % d'exploration plus lointaine (les artistes similaires aux similaires) et quelques « pépites », c'est-à-dire des titres moins connus.
- **Tes mixes** : tes artistes sont regroupés automatiquement par style selon leurs liens de similarité. Chaque mix contient environ 1/3 de tes favoris et 2/3 de découvertes.
- **Découvertes de la semaine** : 30 titres renouvelés chaque lundi, sans jamais reproposer un titre déjà suggéré.
- **Apprentissage** : un titre écouté jusqu'au bout renforce son artiste, un titre passé dans les 30 premières secondes l'affaiblit.
- **Pas pour moi** : le `✕` sur une recommandation, ou le menu `⋯`, exclut un titre ou un artiste. On peut annuler dans **Réglages → Ton profil musical**.
- **Radio [artiste]** : depuis le menu `⋯` de n'importe quel titre.

## Sur le téléphone
Le PC doit rester allumé avec Sonora lancé : le téléphone se connecte à lui.

**À la maison (même Wi-Fi)**, réglages à faire une seule fois sur le PC :
1. Passe ton Wi-Fi en réseau **Privé** : *Paramètres Windows → Réseau et Internet → Wi-Fi → (ton réseau) → Type de profil réseau : Privé*.
2. Autorise Sonora dans le pare-feu : ouvre **PowerShell en tant qu'administrateur** et exécute :
   ```
   New-NetFirewallRule -DisplayName "Sonora (téléphone)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   ```
3. Dans Sonora, ouvre **Réglages → Sonora sur ton téléphone** et scanne le QR code avec ton téléphone. Ensuite, dans Chrome : `⋮` → **Ajouter à l'écran d'accueil**. Sur iPhone, dans Safari : **Partager** → **Sur l'écran d'accueil**.

**Partout (4G)** : installe [Tailscale](https://tailscale.com/download) (gratuit) sur le PC et sur le téléphone, avec le même compte. L'adresse Tailscale apparaît ensuite dans les Réglages de Sonora.
Pour une vraie application installée, en HTTPS, exécute sur le PC : `tailscale serve --bg 3000`, puis ouvre sur le téléphone l'adresse `https://…ts.net` qu'il affiche.

Limite : sur téléphone, la musique lue via YouTube se met en général en pause quand l'écran s'éteint ou que tu changes d'application. Garde Sonora au premier plan.

## Mes goûts musicaux
`data/my-taste.json` contient la liste `[titre, artistes]` reprise de mes captures Spotify. Pour la réimporter (sans créer de doublons) :
```
node scripts/import-taste.js
```

## Données (restent sur ton PC)
- `data/library.json` : titres likés et playlists
- `data/youtube.json` : clé API (ne pas partager)
- `data/taste-signals.json` : ce que Sonora a appris de ton écoute, tes exclusions, l'historique des Découvertes de la semaine
- `data/youtube-cache.json`, `data/deezer-artists.json`, `data/deezer-related.json` : caches

## Raccourcis
`Espace` : lecture/pause · `Ctrl+→` / `Ctrl+←` : titre suivant/précédent · double-clic sur un titre pour le lire · clic droit sur un titre pour ouvrir le menu.
