# Découvrons Paris · notes pour Claude

## Avec l'utilisateur
- Réponds **toujours en français**. L'utilisateur n'est pas développeur : explique simplement, sans jargon.
- Session coûteuse : fais court, évite les captures d'écran inutiles, regroupe les vérifications.
- **Jamais** de clé, de token ou de JSON de compte de service dans le chat ni dans le dépôt (public). Ne demande jamais le token Instagram ni les clés CARTO.
- Ne supprime **aucune donnée Firestore** sans confirmation explicite.
- Les messages de commit se terminent par les lignes d'attribution demandées par le système. Pas d'identifiant de modèle ailleurs (code, commits, PR).

## Mise en ligne
- Pousser sur `main` = mise en ligne automatique (GitHub Actions → Firebase : hosting, functions, firestore:rules).
- Site : https://decouvrons-paris.web.app · jeu : https://decouvrons-paris.web.app/#jouer
- La CI lance `node tools/maire/test-moteur.mjs` : **un test qui échoue bloque la mise en ligne**. Toujours lancer les tests avant de pousser :
  `node tools/maire/test-moteur.mjs 0` (doit afficher « N tests réussis » ; `60` = avec la simulation d'équilibrage, longue).
- Après le push : `gh run list -L1` jusqu'à `completed success`.
- `MVER` / `__VER__` dans `public/js/app.js` : la CI le remplace par le SHA (cache des fichiers).

## Le jeu « Maire de Paris » (`public/maire/`, JavaScript pur, sans build)
Chargé par `public/js/app.js` dans cet ordre : reglages → contenu → poker → session → moteur → progression → tournoi-jeux → tournoi-regles → tournoi-ui → quartier → jeu.
- `reglages.js` : tous les réglages (R.v), modifiables par l'admin (onglet Réglages) ; ajouter un réglage = une ligne ici.
- `contenu.js` : bâtiments illustrés (ILLUSTRES), maires, textes.
- `moteur.js` : moteur **déterministe** (hasard `rnd(st)`), état `st` sauvegardé dans localStorage `maire_partie_v3`. Mode session (`st.session`) = le mode principal : 21 places, saisons en temps réel, travaux, employés, objectifs de mandat jugés à chaque élection, roues de la fortune (5 roues, quête puis 3 min d'attente), `reparer(st, base)` pour réparer une sauvegarde abîmée.
- `session.js` : la session à 21 (bots, attaques, ventes, élections, `fiche`, `signaler`).
- `progression.js` : profil joueur, 50 paliers mensuels séquentiels.
- `jeu.js` : toute l'interface. `jeu()` est protégé (erreur → réparation → réessai, jamais « supprime ta partie »). Écran de jeu en onglets sur téléphone (Ville, Bâtir, Objectifs, Session, Gestion), 3 colonnes sur PC (≥ 1100 px).
- `quartier.js` : quartier isométrique animé (placement auto + déplacement, saisons, jour/nuit, événements, visite des autres maires via `stats.q`).
- `maire.css` : styles (les ajouts récents sont en fin de fichier).
- Images : `public/maire/img/` (bat, deco, ui, tournoi, roue). Découpe des planches IA : `tools/maire/decouper-planche.py`.

## Grand Tournoi des Maires
- Jeux communs navigateur/serveur : `tournoi-jeux.js` (10 mini-jeux rejouables à partir des gestes), `tournoi-regles.js` ; UI : `tournoi-ui.js`.
- Serveur : `functions/tournoi.js` (tournoiOuvrir / Commencer / Terminer / Clore, europe-west1). `tools/maire/copier-partage.sh` copie les fichiers partagés dans `functions/partage` (ignoré par git, fait aussi en CI).
- Test de bout en bout (émulateurs, 17 vérifications) :
  `bash tools/maire/copier-partage.sh && npx -y firebase-tools@15.33.0 emulators:exec --only auth,firestore,functions --project demo-tournoi "node tools/maire/emu/test-tournoi.mjs"`

## Tester dans le navigateur
- Serveur local : `python3 -m http.server 8765 -d public` puis Playwright (déjà installé, `require('playwright')`, `chromium.launch()`).
- Dans la page : `localStorage.maire_invite = "1"` pour jouer en invité ; la session hors ligne est locale (`maire_session_locale`).
- `window.MaireTest` (outils admin) : `reserve()`, `argent(n)`, `niveaux(n)`, `election30()`, `ceremonie()`, `elimine()`.
- Robot qui joue au hasard : `node tools/maire/robot-navigateur.cjs 300000 tel` (ou `pc`) → affiche les erreurs JavaScript et les blocages.

## Idées en attente
- 10 fonds d'écran (5 téléphone, 5 PC) à générer par l'utilisateur ; il avait un « problème » avec les fonds, à éclaircir.
- Planches pixel art pour le quartier (mairie, Parisiens, voitures, rues…) : à proposer.
- Équilibrage de fin de partie en session : vers 25 min l'argent par saison retombe vers 0 et la population cesse de grandir quand le bonheur < 40 — question posée à l'utilisateur, pas encore tranchée.
