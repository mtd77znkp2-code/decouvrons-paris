# Découvrons Paris

Site de @decouvronsparis1 : Découvre ! (vidéos et carte), quiz, devine où c'est, devine le prix.

- `public/` : le site.
  - `index.html` (pages), `css/site.css` (style), `img/` (images)
  - `js/app.js` (bases : Firebase, classement, navigation, connexions), `js/carte.js` (cartes), `js/jeux.js` (3 jeux), `js/decouvre.js` (vidéos et carte Découvre)
  - chargés seulement pour l'admin : `js/admin.js`, `css/admin.css`, `js/donnees.js` (données de départ)
  - `mentions-legales.html`, `confidentialite.html` : pages légales (à compléter : nom et e-mail de contact)
- Hébergement : **Firebase Hosting** (projet `decouvrons-paris`), adresse https://decouvrons-paris.web.app.
  - Chaque modification de `main` est mise en ligne par GitHub Actions (`.github/workflows/firebase.yml`),
    avec le secret GitHub `FIREBASE_SERVICE_ACCOUNT` (clé JSON d'un compte de service du projet).
  - `firebase.json` : pages (`public/`), fonctions (`functions/`) et règles de la base (`firestore.rules`).
- Base de données : Firestore (classements, quiz, prix, lieux, vidéos, carte Découvre).
  - L'administration se fait avec « Se connecter avec Google » (compte indiqué dans `firestore.rules` et `index.html`).
- Vidéos Instagram : fonction `insta` (`/api/insta`) et renouvellement quotidien `instaRefresh`.
  - Le token se colle dans l'admin → « Mes Reels » → « Connexion Instagram » (rangé dans `prive/instagram`, illisible depuis le site).
- `public/spots.json` : lieux de départ de la carte Découvre (importés dans la base à la première ouverture de l'admin).
