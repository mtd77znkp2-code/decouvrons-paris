# Maire de Paris : écrire des événements

Les événements s'écrivent dans `tools/maire/sources/*.txt` (un fichier par lot ou par catégorie).
`node tools/maire/construire.mjs` les vérifie un par un et produit les données du jeu (`public/maire/data/`).
Le jeu n'utilise **que** les événements valides, et affiche leur nombre exact.

## Format

```
=== fin-001 | finances | Titre de l'événement
Description courte (une ou plusieurs lignes).
? bonMax=60 amb=logement ligne=gauche,ecologie apres=10 flag=x sansFlag=y poids=2 suite
A) Titre du choix :: indice affiché au joueur
   pop-4 bon+1 bud-15 rec+6x20 economie-2 | g+2 c+1 d-4 e+1
   > Texte du résultat.
   ~25 pop-3 > Texte d'une surprise (25 % de chances).
   +4 bon+2 > Texte d'un effet qui arrive 4 semaines plus tard.
   => fin-014 @6
   ! drapeau
B) ...
C) ...
```

- **Identifiant** : 2 à 6 lettres, un tiret, 3 à 5 chiffres (`fin-001`). Unique.
- **Catégories** : finances, securite, proprete, logement, transports, ecologie, economie, services, culture, quotidien, institutions, crise.
- **Conditions** (ligne `?`, facultative) : `popMin`, `popMax`, `bonMin`, `bonMax`, `cohMin`, `cohMax`, `tresorMin`, `tresorMax`, `detteMin`, `apres` / `avant` (numéro de tour), `ligne=…`, `amb=<domaine>`, `flag`, `sansFlag`, `poids` (fréquence), `suite` (n'apparaît que comme suite d'une décision).
- **Effets** (première ligne sous le choix, avant le `|`) :
  - `pop`, `bon`, `coh` : popularité, bonheur, cohérence, en points (−20 à +20) ;
  - `bud` : argent immédiat en millions d'euros (négatif = dépense) ;
  - `rec+6x20` : 6 M€ par semaine pendant 20 semaines (négatif = dépense récurrente) ;
  - domaines : `securite`, `proprete`, `logement`, `transports`, `ecologie`, `achat` (pouvoir d'achat), `economie`, `services`.
- **Alignement** (après le `|`) : effet sur la cohérence politique selon la ligne du maire, de −5 à +5.
  `g` gauche, `c` centre, `d` droite, `e` écologie. Obligatoire (au moins `| g0`).
- **Lignes facultatives** : `>` résultat (obligatoire), `~P` surprise, `+N` effet différé, `=> id @N` événement de suite N semaines plus tard, `! nom` drapeau pour conditionner d'autres événements.

Les valeurs annoncées varient de ±25 % en jeu : le joueur ne peut pas tout prévoir.

## Contrôles automatiques

Trois choix exactement, identifiant unique, textes complets et de bonne longueur, effets et conditions valides,
valeurs dans les limites, au moins un effet par choix, suites existantes, pas de doublon manifeste (titres identiques ou
descriptions presque identiques). Un événement rejeté n'est jamais publié.

## Lots et chargement

Les événements valides sont répartis en lots de 250 (`lot-NNN.json`), mélangés pour que chaque lot couvre toutes les
catégories ; un événement et ses suites restent toujours dans le même lot. Une partie ne charge que quelques lots
(au moins 550 événements), ce qui garde le jeu léger même avec 5 000 événements. Le nombre affiché dans le jeu
et dans l'administration est le total réel d'événements valides (`index.json`).

## Tests et équilibrage

`node tools/maire/test-moteur.mjs [parties]` vérifie le moteur (pas de double application au rechargement, sauvegarde
fidèle, parties reproductibles, finances cohérentes) puis simule des centaines de parties avec quatre stratégies
(hasard, réfléchi, dépensier, populiste). Les réglages d'équilibrage sont dans `P` en haut de `public/maire/moteur.js`.
Ces deux vérifications tournent automatiquement avant chaque mise en ligne : si l'une échoue, rien n'est publié.

## Catastrophes et coups de chance

Deux catégories spéciales, hors des 12 catégories et hors du compteur des événements ordinaires :
`catastrophe` (fichier `20-catastrophes.txt`, identifiants `cat-NNN`) et `chance` (`21-chances.txt`, `cha-NNN`).
Elles sont rangées dans `public/maire/data/speciaux.json`, chargé dans toutes les parties.
Chaque partie a exactement 3 catastrophes (une par tiers du mandat) et une chance sur deux d'avoir un coup de chance ;
le calendrier est tiré au hasard au début de la partie. Ils s'affichent en pop-up.
