# Découvrons Paris

Site de @decouvronsparis1 : carte de Paris, quiz, devine où c'est, devine le prix.

- `public/index.html` : tout le site dans un seul fichier (`public/_redirects` : connexion Google via l'adresse du site).
- Hébergement : Netlify, relié à ce dépôt (chaque modification met le site à jour).
- Base de données : Firebase (projet `decouvrons-paris`), pour les classements, les questions du quiz et les prix.
  - Les joueurs sont connectés automatiquement en anonyme pour enregistrer leurs scores.
  - L'administration se fait avec le bouton « Se connecter avec Google » (compte administrateur indiqué dans `firestore.rules` et `index.html`).
- `firestore.rules` : règles de sécurité à copier dans Firebase > Firestore Database > Règles.
- Vidéos Instagram (section « Découvre ! ») : fonctions Netlify dans `netlify/functions` (`/api/insta` et un renouvellement quotidien).
  - Il faut la variable d'environnement Netlify `IG_TOKEN` (jeton « Instagram API with Instagram Login » du compte @decouvronsparis1).
  - Le jeton est ensuite renouvelé automatiquement et rangé dans Netlify Blobs.
