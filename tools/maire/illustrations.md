# Maire de Paris — prompts d'illustrations pour ChatGPT

Mode d'emploi : ouvre une nouvelle conversation ChatGPT, colle d'abord le **bloc STYLE**, puis chaque prompt l'un après l'autre
dans la même conversation (le style reste ainsi identique). Télécharge chaque image en PNG et envoie-les telles quelles :
elles seront découpées et intégrées au jeu (l'ordre des cases compte, ne le change pas).

---

## 1. Bloc STYLE (à coller en premier)

```
Tu vas créer une série d'illustrations pour un jeu mobile de gestion de ville, « Maire de Paris ».
Style à respecter pour TOUTES les images de cette conversation :
- pixel art détaillé et chaleureux, vue isométrique de 3/4 (comme une carte illustrée de Paris vue d'en haut) ;
- toits en zinc gris-bleu, façades haussmanniennes crème, beaucoup de verdure vert vif, touches d'or ;
- contours nets, lumière douce venant d'en haut à gauche, petite ombre portée sous chaque objet ;
- couleurs : bleu marine #1b2550, crème #f7f2e7, or #f5b21a, vert #3fae68, bleu Seine #2b6fb3 ;
- jamais de texte, de lettres, de logos ou de chiffres dans les images ;
- aucune personne réelle ni marque réelle.
Réponds « Style compris » et attends mes demandes.
```

---

## 2. Bâtiments (9 planches de 9)

Prompt modèle (remplace la liste à chaque planche) :

```
Crée une planche de 9 icônes de bâtiments, dans le style défini, disposées en grille 3 × 3 régulière,
image carrée 1536 × 1536, chaque icône centrée dans sa case de 512 × 512 avec de la marge, fond TRANSPARENT.
Chaque icône est un petit bâtiment ou aménagement isolé, vu en isométrique, reconnaissable même en très petit.
De gauche à droite puis de haut en bas :
1. …
2. …
(…jusqu'à 9)
```

**Planche A — Cadre de vie (1)**
1. Parc : petit square parisien avec arbres, pelouse et banc vert
2. École : école primaire en pierre avec cour et préau
3. Brigade de propreté : petit camion-benne vert et balayeuse
4. Hôpital : hôpital moderne blanc avec croix verte (sans texte)
5. Jardins partagés : potager en bacs de bois avec légumes
6. Fontaines et brumisateurs : fontaine Wallace verte et brumisateur
7. Cinéma en plein air : grand écran blanc sur une pelouse avec transats
8. Médiathèque : bâtiment vitré lumineux avec étagères de livres visibles
9. Piscine municipale : piscine couverte avec grand bassin bleu

**Planche B — Cadre de vie (2)**
1. Centre de santé : petit bâtiment avec croix médicale verte
2. Forêt urbaine : bosquet dense de grands arbres au milieu de la ville
3. Stade de quartier : petit terrain de foot avec tribune
4. Conservatoire de musique : bâtiment classique avec un violon doré en façade
5. Toits végétalisés : immeuble haussmannien au toit couvert de plantes
6. Kiosque à musique : kiosque rond à colonnes avec toit doré
7. Fontaine monumentale : grande fontaine à jets d'eau sur une place
8. Statue du maire assidu : statue dorée d'un maire stylisé sur socle de pierre
9. Logements sociaux : immeuble moderne de briques claires avec balcons

**Planche C — Logement**
1. Écoquartier : groupe de petits immeubles en bois avec panneaux solaires
2. Résidence étudiante : immeuble jeune et coloré avec vélos devant
3. Foyer de jeunes travailleurs : petit immeuble simple et accueillant
4. Rénovation thermique : façade d'immeuble avec échafaudage et isolant
5. Habitat intergénérationnel : maison commune avec jardin et bancs
6. Centre d'hébergement d'urgence : bâtiment chaleureux avec bouée de sauvetage en façade
7. Coopérative d'habitants : immeuble aux balcons fleuris tous différents
8. Tour en bois écologique : haute tour en bois clair avec arbres aux étages
9. Village vertical : très haute tour avec jardins suspendus à chaque niveau

**Planche D — Sécurité**
1. Commissariat : poste de police parisien bleu avec gyrophare
2. Éclairage public LED : élégant lampadaire parisien allumé
3. Médiateurs de nuit : petit local avec une lune dorée au-dessus de la porte
4. Caserne de pompiers : caserne rouge avec camion de pompiers
5. Vidéoprotection : mât avec caméras de surveillance
6. Police municipale de proximité : petit poste de quartier avec vélo de police
7. Maison de la prévention : maison accueillante avec mains jointes en enseigne (sans texte)
8. Centre de gestion de crise : bâtiment moderne avec antennes et parabole
9. Pistes cyclables : bout de piste cyclable verte avec un vélo

**Planche E — Transports**
1. Ligne de tramway : tramway blanc et vert sur rails engazonnés
2. Station de métro : entrée de métro Art nouveau verte (style Guimard, sans texte)
3. Stations Vélib' : borne avec vélos de location alignés
4. Plateforme de covoiturage : petite voiture avec smartphone géant à côté
5. Bus électriques : bus électrique avec éclair sur le côté
6. Parking relais : parking à étages
7. Navettes fluviales : bateau-navette sur un morceau de Seine
8. Gare RER modernisée : grande verrière de gare avec un train
9. Tram-train express : tram-train rapide aux lignes aérodynamiques

**Planche F — Transports et économie**
1. Pôle d'échanges multimodal : grande gare moderne en verre
2. Marché couvert : halle à charpente métallique avec étals colorés
3. Grand musée : musée néoclassique à colonnes
4. Incubateur de start-up : loft en briques avec une fusée dorée sur le toit
5. Halle gourmande : halle avec fromages, pains et lampions
6. Office du tourisme : kiosque d'information avec carte dépliée
7. Maison de l'emploi : bâtiment avec une mallette dorée en enseigne
8. Cellule anti-gaspillage : bureau avec loupe et pile de factures
9. Caisse municipale de crédit : petite banque classique avec coffre-fort

**Planche G — Économie et projets**
1. Parc des expositions : grand hall d'exposition avec drapeaux colorés
2. Quartier d'affaires : groupe de tours de bureaux vitrées
3. Arc de lumières : arche moderne illuminée de couleurs arc-en-ciel
4. Parc urbain géant : immense parc avec lac et allées
5. Quartier entièrement piéton : rue pavée animée avec terrasses et sans voitures
6. Plan massif de rénovation : pâté d'immeubles avec grues
7. Téléphérique urbain : cabines de téléphérique au-dessus des toits
8. Métro automatique révolutionnaire : rame de métro futuriste sur viaduc
9. Village olympique : stade et immeubles modernes avec anneaux colorés (sans logo officiel)

**Planche H — Projets et secrets**
1. Grand Paris Express : train rapide sortant d'un tunnel moderne
2. Seine baignable : morceau de Seine avec plage, parasols et baigneurs
3. Musée mondialement connu : pyramide de verre moderne devant un palais (style inspiré, pas une copie exacte)
4. Toboggan géant de Montmartre : immense toboggan coloré descendant une colline
5. Tour des Administrations : tour grise austère couverte de tampons et papiers
6. Musée des Décisions Catastrophiques : musée biscornu et penché, drôle
7. Parc des Pigeons Diplomatiques : parc rempli de pigeons portant de minuscules nœuds papillon
8. Métro Fantôme : entrée de métro abandonnée, brume verte et lumière étrange
9. Palais du Maire : petit palais luxueux et doré

**Planche I — Prestige (enchères)**
1. Coffre municipal secret : coffre-fort ancien ouvert débordant de pièces d'or
2. Arrivée d'une course cycliste mythique : ligne d'arrivée avec arche et cyclistes (sans texte)
3. Collection impressionniste : galerie avec tableaux colorés aux murs
4. Grande roue géante : grande roue illuminée
5. Festival international de musique : scène de concert avec projecteurs
6. Studios de cinéma : studio avec caméra et projecteurs
7. Centre de recherche médicale : laboratoire moderne avec molécule d'ADN dorée
8. Aquarium géant : aquarium avec requin et poissons dans un grand bassin vitré
9. Siège d'une organisation internationale : bâtiment moderne avec rangée de drapeaux colorés (sans vrais drapeaux)

---

## 3. Léon, le directeur de cabinet (1 planche)

```
Crée une planche de 4 portraits du même personnage, grille 2 × 2, image carrée 1536 × 1536, fond TRANSPARENT,
style défini (pixel art détaillé, visage expressif). Personnage : Léon, directeur de cabinet du maire de Paris,
la quarantaine, costume bleu marine, cravate dorée, petite moustache soignée, lunettes rondes, toujours un dossier sous le bras.
Portrait en buste, de face, même cadrage pour les 4 :
1. souriant et confiant
2. inquiet, sourcils froncés
3. paniqué, mains sur la tête
4. triomphant, pouce levé
```

---

## 4. Les 12 opposants (2 planches)

```
Crée une planche de 6 portraits en buste, grille 3 × 2, image 1536 × 1024, fond TRANSPARENT, style défini.
Personnages entièrement fictifs (ne ressemblant à aucune personne réelle), adversaires politiques du maire,
regard déterminé, chacun avec un accessoire qui le caractérise :
1. Victor Delaunay : ancien ministre, la soixantaine, costume trois-pièces, chapeau haut-de-forme
2. Claire Montfort : sénatrice élégante, la cinquantaine, tailleur, collier de perles
3. Hugo Valmy : jeune influenceur, 25 ans, sweat à capuche, smartphone à la main
4. Mathilde Ferrand : femme politique énergique, mégaphone à la main
5. Bernard Castagne : patron de presse, cigare éteint, journal sous le bras
6. Inès Haddad : syndicaliste charismatique, foulard, poing levé
```
```
(même consigne) :
1. Paul-Émile Roux : maire d'arrondissement frondeur, écharpe tricolore, air malicieux
2. Sophie Laborde : ancienne adjointe, lunettes, pile de dossiers
3. Marc Ollivier : homme d'affaires fortuné, montre en or, sourire carnassier
4. Léa Brunet : militante associative, 30 ans, t-shirt vert, pancarte vierge
5. Antoine Mercier : député stratège, échiquier miniature dans la main
6. Nadia Kessler : avocate médiatique, robe d'avocate noire, regard perçant
```

---

## 5. Illustrations des dossiers (3 planches)

```
Crée une planche de 4 illustrations de scène, grille 2 × 2, image 1536 × 1024 (chaque case 768 × 512, format paysage),
style défini, bords arrondis, sans texte. Ce sont les bandeaux qui illustrent les décisions du maire :
1. …
```
- Planche 1 : Finances (bureau du maire, calculatrice, pièces) · Sécurité (rue de nuit, patrouille) · Propreté (agents de propreté, rue qui brille) · Logement (immeubles et grues)
- Planche 2 : Transports (métro, bus et vélos à un carrefour) · Écologie (arbres, panneaux solaires, Seine) · Économie (marché animé, commerces) · Services publics (mairie, guichet accueillant)
- Planche 3 : Culture (théâtre et musée la nuit) · Vie quotidienne (terrasse de café, boulangerie) · Institutions (salle du Conseil de Paris) · Crise (sirènes, ciel orageux, pompiers)

Et une dernière planche :
```
(même consigne) : 1. Catastrophe (crue de la Seine spectaculaire) 2. Coup de chance (feu d'artifice au-dessus des toits)
3. Attaque de l'opposition (unes de journaux qui volent, micros tendus) 4. Événement légendaire (ciel doré magique au-dessus de Paris)
```

---

## 6. Écrans spéciaux (facultatif)

```
Crée 3 illustrations séparées, format paysage 1536 × 1024, style défini, sans texte :
1. Soir d'élection : place de l'Hôtel de Ville en fête, confettis, foule stylisée, ciel doré
2. Défaite : place de l'Hôtel de Ville sous la pluie, affiches qui s'envolent, ambiance mélancolique mais drôle
3. Coffre de la victoire : coffre doré ouvert qui brille, pièces et étoiles qui jaillissent (fond TRANSPARENT)
```
