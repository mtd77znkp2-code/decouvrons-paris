# Découvrons Paris

Site de @decouvronsparis1 : carte de Paris, quiz, devine où c'est, devine le prix.

- `index.html` : tout le site dans un seul fichier.
- Hébergement : Netlify, relié à ce dépôt (chaque modification met le site à jour).
- Base de données : Firebase (projet `decouvrons-paris`), pour les classements, les questions du quiz et les prix.
  - Les joueurs sont connectés automatiquement en anonyme pour enregistrer leurs scores.
  - L'administration se fait avec le bouton « Se connecter avec Google » (compte administrateur indiqué dans `firestore.rules` et `index.html`).
- `firestore.rules` : règles de sécurité à copier dans Firebase > Firestore Database > Règles.
