// Maire de Paris : contenu « fait main » du jeu, séparé des règles (moteur.js) pour être facile à enrichir et à équilibrer.
// Personnages récurrents, objets à collectionner, bâtiments secrets, combos, projets démesurés, missions surprises,
// décisions historiques, événements rares et légendaires, répliques de Léon, titres de réputation et défis du jour.
//
// Effets (champ e) : bud (M€) · pop · bon (humeur) · coh · pil {pilier: ±} (immédiat) · base {pilier: ±} (durable)
//   eco (dynamisme économique) · rec {m: M€ par trimestre, n: trimestres} · chaos · objet · secret · flag · perso {id: ±}
//   suite {id, n} (un autre événement de ce fichier revient n trimestres plus tard) · mod {entretien: ×, recettes: ±}
//   condition {k: pilier, v: seuil, pen: popularité perdue si non tenu à la prochaine élection}
// Un choix peut avoir un risque { p: probabilité, e: effets en plus, r: texte qui remplace le résultat }.
(function (root) {
  "use strict";

  var PERSONNAGES = {
    gaspard: { nom: "Gaspard Mallet", ico: "💰", txt: "Milliardaire excentrique, toujours un projet sous le bras." },
    agathe: { nom: "Agathe Plume", ico: "📰", txt: "Journaliste d’investigation à La Gazette de Paris." },
    momo: { nom: "Momo Benali", ico: "🥖", txt: "Boulanger du 11e et porte-parole des commerçants." },
    iris: { nom: "Iris Vasseur", ico: "📐", txt: "Architecte star : aucun projet n’est trop grand pour elle." },
    theo: { nom: "Théo Lambert", ico: "📣", txt: "Militant associatif infatigable." },
    monique: { nom: "Monique Dubreuil", ico: "🗂️", txt: "Fonctionnaire depuis 1987, elle sait où sont rangés tous les secrets." },
    kevin: { nom: "Kevin Start", ico: "🚀", txt: "Entrepreneur pressé : une start-up par semaine." },
    valentin: { nom: "Monsieur Valentin", ico: "🎩", txt: "Personne ne sait d’où il vient. Il a toujours un jeu de cartes sur lui." }
  };

  // ---------- Bureau des objets trouvés ----------
  var OBJETS = {
    cle: { nom: "Clé mystérieuse de l’Hôtel de Ville", ico: "🗝️", txt: "Elle ouvre une porte que personne n’avait remarquée.", secret: "coffre" },
    ticket: { nom: "Ticket de métro de 1900", ico: "🎫", txt: "Valable sur une ligne qui n’existe plus… officiellement.", secret: "metroFantome" },
    pigeon: { nom: "Pigeon en or", ico: "🕊️", txt: "Offert par l’Amicale des pigeons de Paris.", secret: "parcPigeons" },
    mallette: { nom: "Mystérieuse mallette administrative", ico: "💼", txt: "Contient 4 000 formulaires et un plan d’architecte.", secret: "tourAdmin" },
    echarpe: { nom: "Écharpe tricolore usée", ico: "🎗️", txt: "Elle a vu passer trois élections.", secret: "palais" },
    bonnet: { nom: "Bonnet d’âne municipal", ico: "🤦", txt: "Remis aux maires qui ont connu de grands échecs.", secret: "museeCata" },
    statue: { nom: "Statue miniature", ico: "🗽", txt: "Souvenir d’un jumelage oublié." },
    medaille: { nom: "Médaille de la Ville", ico: "🏅", txt: "Pour services rendus (lesquels ? mystère)." },
    carte: { nom: "Carte ancienne de Paris", ico: "🗺️", txt: "On y voit des carrières que personne n’a jamais visitées." },
    maquette: { nom: "Maquette de métro", ico: "🚇", txt: "Échelle 1/87, avec des voyageurs grognons." },
    trophee: { nom: "Trophée offert par un opposant", ico: "🏆", txt: "Gravé « Au meilleur adversaire ». Ironique ?" },
    jeton: { nom: "Jeton de Monsieur Valentin", ico: "🪙", txt: "Il porte une inscription : « La maison gagne toujours »." },
    casque: { nom: "Casque de chantier doré", ico: "⛑️", txt: "Pour l’inauguration d’un projet démesuré." },
    baguette: { nom: "Baguette record", ico: "🥖", txt: "Trop longue pour entrer dans le bureau." }
  };

  // ---------- Bâtiments secrets (découverts grâce aux objets, puis disponibles dans toutes les parties) ----------
  var SECRETS = {
    tourAdmin: { nom: "Tour des Administrations", ico: "🏛️", cout: 200, ent: 12, rev: 10, pop: 2, e: { securite: 1 }, txt: "Bonus financier modéré, entretien élevé." },
    museeCata: { nom: "Musée des Décisions Catastrophiques", ico: "🤦", cout: 150, ent: 4, rev: 12, e: { cadre: 2 }, chaos: 10, txt: "Les touristes adorent les mauvaises idées." },
    parcPigeons: { nom: "Parc des Pigeons Diplomatiques", ico: "🕊️", cout: 60, ent: 1, e: { cadre: 4 }, chaos: 6, txt: "Un parc… très particulier." },
    metroFantome: { nom: "Métro Fantôme", ico: "👻", cout: 400, ent: 6, e: { transports: 6 }, chaos: 15, txt: "Une ligne mystérieuse : surprises garanties." },
    palais: { nom: "Palais du Maire", ico: "👑", cout: 300, ent: 15, pop: 4, e: { securite: 1 }, txt: "Prestigieux… mais gare au scandale si la ville va mal." },
    coffre: { nom: "Coffre municipal secret", ico: "🔐", cout: 100, ent: 2, e: {}, txt: "Les investisseurs se bousculent à ta porte." }
  };

  // ---------- Combos de bâtiments ----------
  var COMBOS = {
    vivant: { nom: "Quartier vivant", ico: "🧺", besoin: { marche: 1, parc: 1, logements: 1 }, e: { cadre: 2 }, rev: 4, indice: "Un marché, un parc et des logements… quelque chose se prépare." },
    culture: { nom: "Pôle culturel", ico: "🎭", besoin: { musee: 1, parc: 1, transport: 1 }, e: { cadre: 2 }, rev: 8, indice: "Un grand musée gagne à être entouré de verdure et bien desservi." },
    eco: { nom: "Quartier écologique", ico: "🌿", besoin: { parc: 2, tram: 1, quartier: 1 }, e: { cadre: 3, transports: 2 }, ent: 2, indice: "Des parcs, un tram et un écoquartier forment un tout." },
    affaires: { nom: "Quartier des affaires", ico: "💼", besoin: { metro: 1, musee: 1, marche: 2 }, e: { logement: -2 }, rev: 15, indice: "Métro, culture et commerces attirent les entreprises." }
  };

  // ---------- Projets démesurés : chantiers de plusieurs trimestres ----------
  // niv : niveau du joueur requis · duree : trimestres de chantier · e/rev/pop/eco : effets à l'inauguration
  // risque : probabilité d'un incident de chantier à chaque trimestre
  var PROJETS = {
    grandParc: { nom: "Parc urbain géant", ico: "🌲", niv: 6, cout: 300, duree: 6, ent: 6, e: { cadre: 10 }, pop: 4, risque: 0.15, txt: "Des hectares de verdure en pleine ville." },
    pieton: { nom: "Quartier entièrement piéton", ico: "🚶", niv: 7, cout: 250, duree: 5, ent: 3, e: { cadre: 7, transports: -1 }, pop: 3, risque: 0.2, txt: "Plus de voitures : les commerçants râlent, les familles adorent." },
    renovation: { nom: "Plan massif de rénovation", ico: "🏗️", niv: 8, cout: 600, duree: 8, ent: 5, e: { logement: 11 }, pop: 3, risque: 0.2, txt: "Des milliers de logements remis à neuf." },
    telepherique: { nom: "Téléphérique urbain expérimental", ico: "🚡", niv: 9, cout: 350, duree: 6, ent: 6, e: { transports: 7 }, rev: 6, pop: 3, risque: 0.35, txt: "Révolutionnaire… ou ridicule. Les paris sont ouverts." },
    metroRevo: { nom: "Métro automatique révolutionnaire", ico: "🚝", niv: 9, cout: 900, duree: 10, ent: 12, e: { transports: 14 }, eco: 6, pop: 5, risque: 0.25, txt: "Une ligne entière, sans conducteur, ouverte jour et nuit." },
    jo: { nom: "Village olympique", ico: "🏟️", niv: 10, cout: 1200, duree: 8, ent: 10, e: { logement: 10, transports: 4, cadre: 4 }, eco: 6, pop: 10, risque: 0.2, txt: "Les Jeux, puis des logements pour tous." },
    gpe: { nom: "Grand Paris Express", ico: "🚄", niv: 10, cout: 1500, duree: 12, ent: 15, e: { transports: 18 }, eco: 8, pop: 8, risque: 0.25, txt: "Le plus grand chantier d’Europe." },
    seine: { nom: "Seine baignable", ico: "🏊", niv: 10, cout: 900, duree: 8, ent: 8, e: { cadre: 12 }, eco: 2, pop: 12, risque: 0.2, txt: "Se baigner dans la Seine : le rêve d’un siècle." },
    museeMondial: { nom: "Musée mondialement connu", ico: "🖼️", niv: 11, cout: 700, duree: 8, ent: 6, e: { cadre: 4 }, rev: 30, eco: 4, pop: 6, risque: 0.2, txt: "Une collection unique au monde… et des files d’attente immenses." },
    toboggan: { nom: "Toboggan géant de Montmartre", ico: "🛝", niv: 12, cout: 200, duree: 4, ent: 3, e: { cadre: 1 }, rev: 18, pop: 2, risque: 0.4, txt: "Idée absurde. Succès touristique… ou fiasco planétaire ?" }
  };

  // ---------- 41 bâtiments supplémentaires : chacun a un rôle (pilier, recettes, ou un atout qui change la partie) ----------
  // niv : niveau du joueur · si : objectif de la partie en cours (t : trimestres tenus, reel : réélections) · cat : rayon de la boutique
  // Atouts : popT (popularité par trimestre), vote (points au sondage), usure (un pilier s'use moins vite), entretienPct (% d'entretien
  // économisé sur toute la ville), interet (part des intérêts de la dette effacée), cata (part des dégâts de catastrophe évitée), chaosT
  var BATIMENTS2 = {
    residenceEtudiante: { nom: "Résidence étudiante", ico: "🎓", cat: "logement", niv: 2, cout: 55, ent: 3, e: { logement: 2, cadre: 1 }, eco: 1, ali: { g: 1, c: 1, d: 0, e: 1 }, txt: "Des chambres abordables : la jeunesse reste à Paris." },
    foyerJeunes: { nom: "Foyer de jeunes travailleurs", ico: "🛏️", cat: "logement", niv: 3, si: { t: 4 }, cout: 45, ent: 2, e: { logement: 2 }, popT: 0.08, ali: { g: 2, c: 0, d: 0, e: 0 }, txt: "Un premier toit pour les apprentis." },
    renovThermique: { nom: "Rénovation thermique", ico: "🧱", cat: "logement", niv: 4, si: { t: 4 }, cout: 90, ent: 0, e: { logement: 2, cadre: 1 }, entretienPct: 3, ali: { g: 1, c: 1, d: 0, e: 2 }, txt: "Moins de chauffage gaspillé dans les bâtiments de la ville." },
    intergeneration: { nom: "Habitat intergénérationnel", ico: "👵", cat: "logement", niv: 5, si: { t: 6 }, cout: 70, ent: 2, e: { logement: 3 }, popT: 0.08, ali: { g: 1, c: 1, d: 1, e: 1 }, txt: "Étudiants et retraités sous le même toit." },
    hebergementUrgence: { nom: "Centre d’hébergement d’urgence", ico: "🛟", cat: "logement", niv: 6, si: { t: 8 }, cout: 80, ent: 5, e: { logement: 3, securite: 1 }, cata: 0.1, ali: { g: 2, c: 1, d: -1, e: 1 }, txt: "Personne dehors pendant les crises." },
    cooperative: { nom: "Coopérative d’habitants", ico: "🤝", cat: "logement", niv: 8, si: { t: 10 }, cout: 120, ent: 3, e: { logement: 4, cadre: 1 }, vote: 0.5, ali: { g: 2, c: 0, d: -1, e: 2 }, txt: "Les habitants conçoivent leur immeuble." },
    tourBois: { nom: "Tour en bois écologique", ico: "🌲", cat: "logement", niv: 10, si: { t: 12 }, cout: 260, ent: 6, e: { logement: 7, cadre: 2 }, pop: 2, ali: { g: 1, c: 1, d: 0, e: 2 }, txt: "Trente étages de bois : une première mondiale." },
    villageVertical: { nom: "Village vertical", ico: "🏙️", cat: "logement", niv: 14, si: { reel: 1 }, cout: 420, ent: 9, e: { logement: 11, cadre: 2 }, ali: { g: 1, c: 1, d: 0, e: 1 }, txt: "Logements, écoles et jardins empilés dans une seule tour." },
    velib: { nom: "Stations Vélib’", ico: "🚴", cat: "transports", niv: 3, si: { t: 2 }, cout: 35, ent: 2, e: { transports: 2 }, rev: 1, ali: { g: 1, c: 1, d: 0, e: 2 }, txt: "Des vélos en libre-service à chaque coin de rue." },
    covoiturage: { nom: "Plateforme de covoiturage", ico: "📲", cat: "transports", niv: 4, si: { t: 4 }, cout: 40, ent: 1, e: { transports: 2 }, vote: 0.3, ali: { g: 0, c: 2, d: 1, e: 1 }, txt: "Moins de voitures vides aux heures de pointe." },
    busElec: { nom: "Bus électriques", ico: "🚌", cat: "transports", niv: 4, si: { t: 4 }, cout: 80, ent: 4, e: { transports: 3, cadre: 1 }, ali: { g: 1, c: 1, d: 0, e: 2 }, txt: "Silencieux et propres." },
    parkingRelais: { nom: "Parking relais", ico: "🅿️", cat: "transports", niv: 5, si: { t: 6 }, cout: 65, ent: 2, e: { transports: 2 }, rev: 2, ali: { g: 0, c: 1, d: 2, e: -1 }, txt: "On laisse la voiture aux portes de Paris." },
    navette: { nom: "Navettes fluviales", ico: "⛴️", cat: "transports", niv: 7, si: { t: 8 }, cout: 110, ent: 4, e: { transports: 3 }, rev: 3, eco: 1, ali: { g: 1, c: 1, d: 1, e: 1 }, txt: "La Seine devient une ligne de transport." },
    rer: { nom: "Gare RER modernisée", ico: "🚆", cat: "transports", niv: 9, si: { t: 10 }, cout: 230, ent: 7, e: { transports: 7 }, eco: 2, ali: { g: 1, c: 1, d: 1, e: 1 }, txt: "Des quais neufs, des trains à l’heure (presque)." },
    tramTrain: { nom: "Tram-train express", ico: "🚈", cat: "transports", niv: 12, si: { t: 14 }, cout: 300, ent: 8, e: { transports: 8, logement: 1 }, ali: { g: 1, c: 1, d: 0, e: 2 }, txt: "Paris relié à la banlieue en quelques minutes." },
    poleEchanges: { nom: "Pôle d’échanges multimodal", ico: "🔀", cat: "transports", niv: 16, si: { reel: 1 }, cout: 450, ent: 10, e: { transports: 12 }, eco: 3, ali: { g: 1, c: 2, d: 1, e: 1 }, txt: "Métro, train, bus et vélos sous un même toit." },
    jardinsPartages: { nom: "Jardins partagés", ico: "🥕", cat: "cadre", niv: 2, cout: 25, ent: 1, e: { cadre: 2 }, popT: 0.05, ali: { g: 1, c: 1, d: 0, e: 2 }, txt: "Des tomates au pied des immeubles." },
    fontaines: { nom: "Fontaines et brumisateurs", ico: "⛲", cat: "cadre", niv: 3, si: { t: 2 }, cout: 30, ent: 1, e: { cadre: 2 }, cata: 0.05, ali: { g: 1, c: 1, d: 1, e: 1 }, txt: "Indispensables pendant les canicules." },
    cinePleinAir: { nom: "Cinéma en plein air", ico: "🎬", cat: "cadre", niv: 3, si: { t: 4 }, cout: 35, ent: 2, e: { cadre: 2 }, pop: 1, ali: { g: 1, c: 1, d: 1, e: 1 }, txt: "Des films sous les étoiles, gratuits tout l’été." },
    mediatheque: { nom: "Médiathèque", ico: "📚", cat: "cadre", niv: 4, si: { t: 4 }, cout: 75, ent: 4, e: { cadre: 3 }, vote: 0.5, ali: { g: 1, c: 1, d: 0, e: 1 }, txt: "Livres, jeux et ateliers pour tous les âges." },
    piscine: { nom: "Piscine municipale", ico: "🏊", cat: "cadre", niv: 5, si: { t: 6 }, cout: 110, ent: 6, e: { cadre: 4 }, pop: 1, ali: { g: 1, c: 1, d: 1, e: 0 }, txt: "Enfin des créneaux le dimanche matin." },
    centreSante: { nom: "Centre de santé", ico: "🩺", cat: "cadre", niv: 6, si: { t: 6 }, cout: 95, ent: 5, e: { cadre: 3, securite: 1 }, usure: { cadre: 0.1 }, ali: { g: 2, c: 1, d: 0, e: 0 }, txt: "Des médecins sans rendez-vous à trois mois." },
    foretUrbaine: { nom: "Forêt urbaine", ico: "🌳", cat: "cadre", niv: 7, si: { t: 8 }, cout: 130, ent: 3, e: { cadre: 5 }, cata: 0.1, ali: { g: 1, c: 1, d: 0, e: 3 }, txt: "Des milliers d’arbres : la ville respire et se rafraîchit." },
    stade: { nom: "Stade de quartier", ico: "🏟️", cat: "cadre", niv: 8, si: { t: 10 }, cout: 160, ent: 6, e: { cadre: 4 }, rev: 4, pop: 1, ali: { g: 1, c: 1, d: 1, e: 0 }, txt: "Le club du quartier joue enfin à domicile." },
    conservatoire: { nom: "Conservatoire de musique", ico: "🎻", cat: "cadre", niv: 9, si: { t: 10 }, cout: 140, ent: 5, e: { cadre: 4 }, vote: 0.5, ali: { g: 1, c: 1, d: 1, e: 0 }, txt: "Cours de violon pour tous les enfants." },
    toitsVegetaux: { nom: "Toits végétalisés", ico: "🌿", cat: "cadre", niv: 11, si: { t: 12 }, cout: 180, ent: 2, e: { cadre: 4, logement: 1 }, usure: { cadre: 0.15 }, ali: { g: 1, c: 1, d: 0, e: 3 }, txt: "Les toits de Paris deviennent des jardins." },
    eclairageLed: { nom: "Éclairage public LED", ico: "💡", cat: "securite", niv: 2, si: { t: 2 }, cout: 30, ent: 1, e: { securite: 2 }, entretienPct: 2, ali: { g: 1, c: 1, d: 1, e: 1 }, txt: "Des rues mieux éclairées pour moins cher." },
    mediateurs: { nom: "Médiateurs de nuit", ico: "🌙", cat: "securite", niv: 4, si: { t: 4 }, cout: 45, ent: 3, e: { securite: 2, cadre: 1 }, chaosT: -0.6, ali: { g: 2, c: 1, d: 0, e: 1 }, txt: "Ils apaisent les tensions : le chaos parisien monte moins vite." },
    pompiers: { nom: "Caserne de pompiers", ico: "🚒", cat: "securite", niv: 5, si: { t: 6 }, cout: 120, ent: 6, e: { securite: 4 }, cata: 0.2, ali: { g: 1, c: 1, d: 1, e: 1 }, txt: "Les catastrophes font beaucoup moins de dégâts." },
    videoprotection: { nom: "Vidéoprotection", ico: "📹", cat: "securite", niv: 6, si: { t: 6 }, cout: 85, ent: 3, e: { securite: 3 }, ali: { g: -2, c: 1, d: 3, e: -1 }, txt: "Efficace… mais ne plaît pas à tout le monde." },
    policeProximite: { nom: "Police municipale de proximité", ico: "👮", cat: "securite", niv: 7, si: { t: 8 }, cout: 140, ent: 7, e: { securite: 5 }, ali: { g: 0, c: 1, d: 2, e: 0 }, txt: "Des agents qui connaissent chaque rue." },
    prevention: { nom: "Maison de la prévention", ico: "🧑‍🤝‍🧑", cat: "securite", niv: 8, si: { t: 10 }, cout: 90, ent: 4, e: { securite: 3, cadre: 1 }, usure: { securite: 0.15 }, ali: { g: 2, c: 1, d: 0, e: 1 }, txt: "Agir avant les problèmes : la sécurité s’use moins vite." },
    centreCrise: { nom: "Centre de gestion de crise", ico: "🛰️", cat: "securite", niv: 10, si: { t: 12 }, cout: 220, ent: 6, e: { securite: 4 }, cata: 0.25, ali: { g: 1, c: 2, d: 1, e: 1 }, txt: "Une salle de crise prête à tout : catastrophes bien moins graves." },
    incubateur: { nom: "Incubateur de start-up", ico: "🚀", cat: "economie", niv: 4, si: { t: 4 }, cout: 90, ent: 2, e: {}, rev: 5, eco: 2, ali: { g: 0, c: 2, d: 2, e: 0 }, txt: "Les entreprises de demain naissent ici." },
    halleGourmande: { nom: "Halle gourmande", ico: "🧀", cat: "economie", niv: 5, si: { t: 6 }, cout: 100, ent: 2, e: { cadre: 1 }, rev: 6, eco: 1, ali: { g: 1, c: 1, d: 1, e: 1 }, txt: "Fromages, pains et touristes affamés." },
    officeTourisme: { nom: "Office du tourisme", ico: "🗺️", cat: "economie", niv: 6, si: { t: 8 }, cout: 70, ent: 2, e: {}, rev: 4, ali: { g: 0, c: 2, d: 1, e: 0 }, txt: "Les visiteurs dépensent plus quand on les guide." },
    maisonEmploi: { nom: "Maison de l’emploi", ico: "💼", cat: "economie", niv: 7, si: { t: 8 }, cout: 85, ent: 3, e: { logement: 1 }, eco: 3, popT: 0.08, ali: { g: 2, c: 1, d: 0, e: 0 }, txt: "Un emploi trouvé, un électeur content." },
    antiGaspi: { nom: "Cellule anti-gaspillage", ico: "🧾", cat: "economie", niv: 8, si: { t: 10 }, cout: 120, ent: 0, e: {}, entretienPct: 8, ali: { g: 0, c: 2, d: 2, e: 1 }, txt: "Elle traque chaque euro dépensé pour rien : −8 % d’entretien." },
    caisseCredit: { nom: "Caisse municipale de crédit", ico: "🏦", cat: "economie", niv: 9, si: { reel: 1 }, cout: 150, ent: 2, e: {}, interet: 0.3, ali: { g: 1, c: 2, d: 1, e: 0 }, txt: "La ville emprunte à elle-même : −30 % d’intérêts sur la dette." },
    parcExpositions: { nom: "Parc des expositions", ico: "🎪", cat: "economie", niv: 11, si: { t: 12 }, cout: 280, ent: 5, e: {}, rev: 14, eco: 3, ali: { g: 0, c: 2, d: 2, e: 0 }, txt: "Salons et congrès du monde entier." },
    quartierAffaires: { nom: "Quartier d’affaires", ico: "🏢", cat: "economie", niv: 13, si: { reel: 1 }, cout: 400, ent: 8, e: { logement: -1 }, rev: 20, eco: 4, ali: { g: -2, c: 1, d: 3, e: -1 }, txt: "Des tours de bureaux : beaucoup de recettes, un peu moins de logements." }
  };
  // Bâtiments de prestige : uniques, ils se gagnent aux enchères contre une ville voisine (cout = prix moyen de vente)
  var ENCHERES = {
    tourDeFrance: { nom: "Arrivée d’une course cycliste mythique", ico: "🚵", niv: 6, si: { t: 8 }, cout: 140, ent: 0, e: { transports: 2 }, rev: 6, pop: 3, txt: "Chaque été, le monde entier regarde Paris." },
    impressionnistes: { nom: "Collection impressionniste", ico: "🖼️", niv: 7, si: { t: 8 }, cout: 160, ent: 2, e: { cadre: 3 }, rev: 8, pop: 2, vote: 1, txt: "Des chefs-d’œuvre légués par un collectionneur." },
    grandeRoue: { nom: "Grande roue géante", ico: "🎡", niv: 7, si: { t: 10 }, cout: 200, ent: 3, e: { cadre: 3 }, rev: 10, pop: 2, txt: "La plus haute d’Europe, avec vue sur toute la ville." },
    festival: { nom: "Festival international de musique", ico: "🎤", niv: 8, si: { t: 12 }, cout: 220, ent: 0, e: { cadre: 4 }, rev: 12, popT: 0.15, txt: "Trois jours de concerts : toute la ville en parle encore." },
    studios: { nom: "Studios de cinéma", ico: "🎥", niv: 9, si: { t: 12 }, cout: 300, ent: 4, e: { cadre: 2 }, rev: 16, eco: 3, txt: "Hollywood-sur-Seine." },
    rechercheMedicale: { nom: "Centre de recherche médicale", ico: "🧬", niv: 11, si: { reel: 1 }, cout: 350, ent: 6, e: { cadre: 6, securite: 2 }, rev: 6, eco: 2, txt: "Des chercheurs du monde entier, des soins de pointe." },
    aquarium: { nom: "Aquarium géant", ico: "🐠", niv: 12, si: { reel: 1 }, cout: 320, ent: 4, e: { cadre: 4 }, rev: 18, pop: 2, txt: "Des requins sous la Seine (dans des bassins, rassurez-vous)." },
    siegeInternational: { nom: "Siège d’une organisation internationale", ico: "🌐", niv: 10, si: { reel: 1 }, cout: 380, ent: 2, e: {}, rev: 20, eco: 4, vote: 1, txt: "Diplomates, congrès et prestige mondial." }
  };
  // Bâtiments exclusifs : pass de combat (paliers 8, 18 et 30) et série de 7 jours
  var PASS_BATIMENTS = {
    kiosque: { nom: "Kiosque à musique", ico: "🎺", cat: "cadre", cout: 60, ent: 1, e: { cadre: 3 }, popT: 0.1, txt: "Concerts gratuits le dimanche : exclusivité du pass de combat." },
    fontaineMonumentale: { nom: "Fontaine monumentale", ico: "🌊", cat: "cadre", cout: 150, ent: 2, e: { cadre: 4 }, rev: 5, pop: 2, vote: 0.5, txt: "Des jets d’eau de 30 mètres : exclusivité du pass de combat." },
    statueAssidu: { nom: "Statue du maire assidu", ico: "🗽", cat: "cadre", cout: 80, ent: 1, e: { cadre: 2, securite: 1 }, vote: 0.5, obtenu: "Récompense de la série de 7 jours.", txt: "Pour ceux qui reviennent chaque jour : récompense de la série de 7 jours." },
    arcLumieres: { nom: "Arc de lumières", ico: "🌈", cat: "economie", cout: 250, ent: 3, e: { cadre: 3 }, rev: 12, vote: 1, popT: 0.1, txt: "Il illumine la ville chaque soir : récompense ultime du pass." }
  };
  // Les villes voisines qui enchérissent contre Paris
  var VOISINES = ["Boulogne-Billancourt", "Saint-Denis", "Montreuil", "Vincennes", "Neuilly-sur-Seine", "Issy-les-Moulineaux", "Levallois-Perret", "Ivry-sur-Seine"];

  // ---------- Missions surprises (« défis improbables ») : une à la fois, courtes ----------
  // depart(st) : mémorise ce qu'il faut ; ok(st, m) : réussie ? · si(st) : peut-elle apparaître ?
  var MISSIONS = {
    sansDette: { t: "Termine les 4 prochains trimestres sans que la dette augmente.", n: 4, xp: 50, depart: function (st) { return { d: st.dette }; }, ok: function (st, m) { return st.t >= m.fin && st.dette <= m.d.d; }, finAuTerme: 1 },
    troisParcs: { t: "Achète 3 parcs dans les 6 prochains trimestres.", n: 6, xp: 50, depart: function (st) { return { n: st.bat.parc || 0 }; }, ok: function (st, m) { return (st.bat.parc || 0) >= m.d.n + 3; } },
    remonte: { t: "Remonte ton pilier le plus faible de 6 points en 6 trimestres.", n: 6, xp: 70, depart: function (st, PK) { var k = PK.slice().sort(function (a, b) { return st.piliers[a] - st.piliers[b]; })[0]; return { k: k, v: st.piliers[k] }; }, ok: function (st, m) { return st.piliers[m.d.k] >= m.d.v + 6; } },
    bonheur: { t: "Garde le bonheur au-dessus de 50 pendant 4 trimestres.", n: 4, xp: 60, si: function (st, b) { return b >= 52; }, depart: function () { return {}; }, ok: function (st, m, b) { return st.t >= m.fin && b >= 50; }, echec: function (st, m, b) { return b < 50; }, finAuTerme: 1 },
    reduire: { t: "Réduis la dette de 100 M€ en 6 trimestres.", n: 6, xp: 80, si: function (st) { return st.dette >= 150; }, depart: function (st) { return { d: st.dette }; }, ok: function (st, m) { return st.dette <= m.d.d - 100; } },
    popularite: { t: "Gagne 5 points de popularité en 4 trimestres.", n: 4, xp: 60, depart: function (st) { return { p: st.pop }; }, ok: function (st, m) { return st.pop >= m.d.p + 5; } },
    epargne: { t: "Mets 250 M€ de côté en 6 trimestres.", n: 6, xp: 60, depart: function (st) { return { tr: st.tresor }; }, ok: function (st, m) { return st.tresor >= m.d.tr + 250; } },
    combo: { t: "Active un combo de bâtiments en 8 trimestres.", n: 8, xp: 90, si: function (st) { return st.meca.boutique2; }, depart: function (st, PK, combos) { return { c: combos.length }; }, ok: function (st, m, b, combos) { return combos.length > m.d.c; } },
    investir: { t: "Investis 200 M€ en bâtiments en 4 trimestres.", n: 4, xp: 50, depart: function (st) { return { i: st.stats.investi }; }, ok: function (st, m) { return st.stats.investi >= m.d.i + 200; } },
    projet: { t: "Inaugure le projet démesuré en cours dans les délais.", n: 12, xp: 120, si: function (st) { return st.chantiers.length > 0; }, depart: function (st) { return { p: st.chantiers[0].id }; }, ok: function (st, m) { return !!st.bat[m.d.p]; } }
  };

  // ---------- Décisions historiques : une par mandat, elles changent durablement la partie ----------
  var HISTORIQUES = [
    { id: "h-admin", titre: "La grande réforme de l’administration", desc: "Monique Dubreuil a un plan : réorganiser toute la mairie. Les syndicats grondent déjà.",
      choix: [
        { t: "Réforme totale : −20 % d’entretien pour toujours", r: "La mairie tourne mieux, mais la grève de trois semaines a laissé des traces.", e: { mod: { entretien: 0.8 }, pop: -6 } },
        { t: "Réforme douce : −10 % d’entretien", r: "Un compromis qui ne fait de vagues nulle part.", e: { mod: { entretien: 0.9 }, pop: -2 } },
        { t: "Enterrer le projet", r: "Monique range son plan dans un tiroir. Avec les autres.", e: { pop: 1 } }] },
    { id: "h-velo", titre: "Le plan vélo total", desc: "Faut-il transformer Paris en capitale mondiale du vélo, quitte à fâcher les automobilistes ?",
      choix: [
        { t: "Tout pour le vélo (180 M€)", r: "Des pistes partout. Les automobilistes hurlent, les cyclistes chantent.", e: { bud: -180, base: { transports: 6, cadre: 3 }, pop: -3 } },
        { t: "Un plan raisonnable (80 M€)", r: "De belles pistes sur les grands axes.", e: { bud: -80, base: { transports: 3, cadre: 1 } } },
        { t: "La voiture d’abord", r: "Les bouchons restent… mais personne ne crie.", e: { pop: 2, base: { cadre: -2 } } }] },
    { id: "h-parkings", titre: "Privatiser les parkings ?", desc: "Un groupe privé propose de racheter tous les parkings municipaux. Une fortune immédiate… et des recettes en moins pour toujours.",
      choix: [
        { t: "Vendre (+400 M€, −10 M€ par trimestre pour toujours)", r: "Les caisses débordent. Les tarifs des parkings, eux, explosent.", e: { bud: 400, mod: { recettes: -10 }, base: { transports: -3 }, pop: -3 } },
        { t: "Louer pour 20 ans (+150 M€)", r: "Un bon compromis, signé en grande pompe.", e: { bud: 150, mod: { recettes: -3 } } },
        { t: "Refuser", r: "Les parkings restent publics. Et toujours aussi pleins.", e: { pop: 1 } }] },
    { id: "h-nuit", titre: "Paris ouverte 24 heures sur 24", desc: "Commerces, métro et musées ouverts toute la nuit : l’économie s’envole, mais le calme s’en va.",
      choix: [
        { t: "Paris ne dort plus", r: "La ville vibre jour et nuit. Les riverains, eux, ne dorment plus non plus.", e: { eco: 12, mod: { recettes: 8 }, base: { securite: -4, cadre: -2 } } },
        { t: "Seulement le week-end", r: "Les samedis deviennent légendaires.", e: { eco: 5, mod: { recettes: 3 }, base: { securite: -1 } } },
        { t: "Garder les nuits calmes", r: "Paris dort. Les fêtards vont à Berlin.", e: { base: { cadre: 1 } } }] },
    { id: "h-budget", titre: "Le budget participatif géant", desc: "Et si les Parisiens décidaient eux-mêmes d’une partie du budget, chaque année ?",
      choix: [
        { t: "Un quart du budget d’investissement (−8 M€ par trimestre)", r: "Les Parisiens votent pour des bancs, des fontaines… et un toboggan.", e: { mod: { recettes: -8 }, pop: 6, base: { cadre: 2 } } },
        { t: "Une petite enveloppe", r: "Une belle initiative, sans révolution.", e: { mod: { recettes: -2 }, pop: 2 } },
        { t: "Garder la main", r: "Le budget reste l’affaire du maire.", e: { coh: 2 } }] },
    { id: "h-energie", titre: "La ville se met au solaire", desc: "Couvrir tous les toits municipaux de panneaux solaires : cher au départ, rentable un jour.",
      choix: [
        { t: "Tous les toits (250 M€, +12 M€ par trimestre ensuite)", r: "Paris brille. Les factures baissent enfin.", e: { bud: -250, mod: { recettes: 12 }, base: { cadre: 2 } } },
        { t: "Quelques bâtiments (80 M€, +4 M€)", r: "Un début prometteur.", e: { bud: -80, mod: { recettes: 4 } } },
        { t: "Pas maintenant", r: "Le soleil attendra.", e: {} }] }
  ];

  // ---------- Événements rares et légendaires ----------
  // rar : "politique" (assez fréquent), "rare", "legendaire" (très rare) · cond(st, prof) : peut-il sortir ? · unique : une fois par partie
  var EVENEMENTS = [
    { id: "x-pigeons", rar: "politique", titre: "Le scandale des pigeons", desc: "Une vidéo montrant un pigeon attaquant un touriste devient virale. Une pétition exige que la mairie agisse.", unique: 1,
      choix: [
        { t: "Plan municipal anti-pigeons (12 M€)", r: "Les pigeons reculent. Les défenseurs des animaux, eux, avancent.", e: { bud: -12, pil: { cadre: 2 }, pop: 1 }, risque: { p: 0.35, e: { pop: -3 }, r: "Les méthodes du plan font scandale : « On a vu un agent poursuivre un pigeon en trottinette ! »" } },
        { t: "Déclarer les pigeons patrimoine historique", r: "Les médias se moquent, mais une partie de Paris adore. Les pigeons, eux, paradent.", e: { pop: 1, flag: "amiPigeons", chaos: 10, suite: { id: "x-pigeons2", n: 6 } }, absurde: 1 },
        { t: "Ignorer l’affaire", r: "L’affaire s’éteint… pour l’instant.", e: {}, risque: { p: 0.5, e: { pop: -3 }, r: "La pétition dépasse 200 000 signatures : « Le maire préfère les pigeons aux Parisiens ! »" } }] },
    { id: "x-pigeons2", rar: "suite", titre: "L’Amicale des pigeons de Paris", desc: "Grâce à ton décret historique, une association de passionnés veut faire de Paris la capitale mondiale du pigeon. Ils t’offrent un pigeon en or.",
      choix: [
        { t: "Accepter avec émotion", r: "Le pigeon en or trône sur ton bureau. Léon l’évite du regard.", e: { objet: "pigeon", pop: 2 } },
        { t: "Accepter et organiser un défilé de pigeons", r: "Un défilé surréaliste, vu par 30 millions d’internautes.", e: { objet: "pigeon", pop: 3, bud: -10, chaos: 10 }, absurde: 1 },
        { t: "Refuser poliment", r: "L’Amicale est vexée. Un pigeon te suit désormais partout.", e: { pop: -1 } }] },
    { id: "x-casino", rar: "rare", titre: "Un casino clandestin à l’Hôtel de Ville", desc: "Le service technique découvre une salle de jeux clandestine… dans les sous-sols de l’Hôtel de Ville. Personne ne sait depuis quand elle existe.",
      choix: [
        { t: "Fermer et porter plainte", r: "La salle est fermée. Agathe Plume en fait sa une : « Le maire fait le ménage ».", e: { pop: 3, perso: { agathe: 1 } } },
        { t: "La légaliser et la taxer", r: "Les caisses de la ville se remplissent discrètement…", e: { bud: 120, chaos: 15 }, risque: { p: 0.45, e: { pop: -8, perso: { agathe: -1 } }, r: "Agathe Plume publie tout : « Le maire de Paris, croupier en chef ». Scandale national." }, absurde: 1 },
        { t: "Faire comme si de rien n’était", r: "La salle reste ouverte. Monsieur Valentin te salue d’un clin d’œil.", e: { flag: "casino", chaos: 20, suite: { id: "x-casino2", n: 8 } } }] },
    { id: "x-casino2", rar: "suite", titre: "Agathe Plume a des photos", desc: "La journaliste Agathe Plume a des photos de la salle de jeux de l’Hôtel de Ville. Elle te laisse une chance de t’expliquer avant de publier.",
      choix: [
        { t: "Tout avouer et fermer la salle", r: "L’article est dur, mais ton honnêteté est saluée.", e: { pop: -3, perso: { agathe: 1 } } },
        { t: "Nier en bloc", r: "Tu nies…", e: {}, risque: { p: 0.6, e: { pop: -10, perso: { agathe: -2 } }, r: "Les photos sont publiées. Une semaine de une de journaux. Catastrophique." } },
        { t: "Lui offrir un autre scoop", r: "Agathe accepte le marché… et publie une enquête sur un ministre à la place.", e: { coh: -5, perso: { agathe: -1 } } }] },
    { id: "x-ticket-gagnant", rar: "legendaire", titre: "Le ticket gagnant de la mairie", desc: "Monique Dubreuil retrouve dans un carton un contrat municipal de 1974, oublié de tous. Elle a un drôle de sourire.",
      choix: [
        { t: "Le faire exécuter", r: "Le contrat oblige un groupe privé à verser une compensation colossale à la ville !", e: { bud: 350, objet: "medaille" }, risque: { p: 0.35, e: { bud: -470 }, r: "Mauvaise surprise : le contrat révèle une vieille dette de la ville… que les avocats réclament aussitôt." } },
        { t: "En faire un investissement", r: "Les droits du contrat sont placés : ils rapporteront pendant des années.", e: { rec: { m: 15, n: 20 } } },
        { t: "Le remettre dans le carton", r: "Monique soupire et range le carton. « Comme en 1974 », dit-elle.", e: { perso: { monique: -1 } } }] },
    { id: "x-mallette", rar: "rare", titre: "La mallette oubliée", desc: "Une mystérieuse mallette administrative est retrouvée dans un ascenseur. Elle porte l’étiquette « Ne pas ouvrir avant 2040 ».",
      choix: [
        { t: "L’ouvrir", r: "4 000 formulaires… et les plans d’une tour administrative extravagante !", e: { objet: "mallette", chaos: 5 } },
        { t: "La confier à Monique", r: "Monique la range « au bon endroit ». Personne ne la reverra.", e: { perso: { monique: 1 } } },
        { t: "La rendre aux objets trouvés", r: "Le service des objets trouvés la classe soigneusement… avec une étiquette au nom du maire.", e: { objet: "mallette" } }] },
    { id: "x-cle", rar: "rare", titre: "La clé des sous-sols", desc: "En rénovant une cave de l’Hôtel de Ville, des ouvriers trouvent une clé ancienne gravée aux armes de Paris.",
      cond: function (st) { return st.t > 6; },
      choix: [
        { t: "Garder la clé", r: "Une clé mystérieuse rejoint ta collection. Que peut-elle bien ouvrir ?", e: { objet: "cle" } },
        { t: "Faire fouiller les sous-sols (20 M€)", r: "On découvre une vieille salle… et la porte qui va avec la clé.", e: { objet: "cle", bud: -20, chaos: 5 } },
        { t: "La donner au musée Carnavalet", r: "La clé est exposée. Elle attire même quelques curieux.", e: { pop: 1 } }] },
    { id: "x-ticket1900", rar: "rare", titre: "Un ticket de métro de 1900", desc: "Un habitant rapporte un ticket de métro de 1900 trouvé dans un mur. Il donne accès à une station qui ne figure sur aucun plan.",
      choix: [
        { t: "Ouvrir une enquête", r: "Le ticket est authentique. La station aussi, apparemment…", e: { objet: "ticket", chaos: 8 } },
        { t: "L’acheter pour la collection municipale (5 M€)", r: "Un souvenir unique pour la ville.", e: { objet: "ticket", bud: -5 } },
        { t: "Haussement d’épaules", r: "Le ticket finit sur un site d’enchères.", e: {} }] },
    { id: "x-gaspard", rar: "rare", perso: "gaspard", titre: "Gaspard Mallet veut investir", desc: "Le milliardaire Gaspard Mallet débarque sans rendez-vous : il veut « mettre beaucoup d’argent dans Paris ». Avec lui, il y a toujours une contrepartie.",
      desc2: "Gaspard Mallet est de retour. « Vous m’aviez dit non la dernière fois. J’ai une meilleure offre. »",
      choix: [
        { t: "Accepter un don modeste (+60 M€)", r: "Un chèque, une photo, une poignée de main. Simple.", e: { bud: 60, perso: { gaspard: 1 } } },
        { t: "Un gros investissement (+250 M€, −20 M€ par trimestre pendant 4 ans)", r: "L’argent arrive vite. Les remboursements, eux, arriveront longtemps.", e: { bud: 250, rec: { m: -20, n: 16 }, perso: { gaspard: 2 } } },
        { t: "Refuser", r: "Gaspard repart en souriant. « Nous nous reverrons. »", e: { perso: { gaspard: -1 }, flag: "gaspardRefus" } }] },
    { id: "x-friche", rar: "rare", perso: "iris", titre: "Coup de génie : la friche événementielle", desc: "Iris Vasseur propose de transformer une immense friche ferroviaire en quartier événementiel. « Ça va être énorme. Ou un désastre. Probablement énorme. »",
      choix: [
        { t: "Foncer (200 M€)", r: "Le quartier ouvre : concerts, marchés, foule immense. Un triomphe !", e: { bud: -200, rec: { m: 14, n: 40 }, base: { cadre: 4 }, pop: 3 }, risque: { p: 0.35, e: { rec: { m: -14, n: 40 }, pop: -6, pil: { cadre: -4 } }, r: "Le chantier s’enlise, les festivals sont annulés. La friche devient « le gouffre d’Iris »." }, genie: 1 },
        { t: "Version prudente (70 M€)", r: "Un petit quartier sympathique, sans folie.", e: { bud: -70, rec: { m: 4, n: 30 }, base: { cadre: 1 } } },
        { t: "Laisser la friche aux herbes folles", r: "Les herbes folles, au moins, sont gratuites.", e: {} }] },
    { id: "x-musee-impossible", rar: "rare", perso: "iris", titre: "Le grand musée impossible", desc: "Un mécène veut financer un musée spectaculaire dessiné par Iris Vasseur : un bâtiment en forme de croissant géant.",
      choix: [
        { t: "Accepter tel quel (100 M€)", r: "Le Croissant ouvre ses portes : un succès planétaire.", e: { bud: -100, rec: { m: 12, n: 40 }, pop: 3 }, risque: { p: 0.5, e: { rec: { m: -20, n: 8 }, pop: -2 }, r: "Le chantier devient interminable : chaque trimestre, une nouvelle facture arrive." }, genie: 1 },
        { t: "Renégocier (150 M€, plus sûr)", r: "Moins spectaculaire, mais solide : le musée attire du monde.", e: { bud: -150, rec: { m: 8, n: 40 }, pop: 1 }, risque: { p: 0.15, e: { pop: -2 }, r: "Le musée ouvre en retard, mais il ouvre." } },
        { t: "Refuser", r: "Iris est vexée. Elle dessinera ailleurs.", e: { perso: { iris: -1 } } }] },
    { id: "x-kevin", rar: "rare", perso: "kevin", titre: "Kevin Start et ses trottinettes volantes", desc: "L’entrepreneur Kevin Start veut lancer à Paris des trottinettes… volantes. Il demande juste « un petit coup de pouce ».",
      choix: [
        { t: "Investir 50 M€ dans l’aventure", r: "Contre toute attente, ça marche ! Les touristes font la queue.", e: { bud: -50, rec: { m: 9, n: 24 }, perso: { kevin: 1 } }, risque: { p: 0.7, e: { rec: { m: -9, n: 24 }, pop: -3 }, r: "Les trottinettes volantes ne volent pas. Elles tombent. Dans la Seine, surtout." }, absurde: 1 },
        { t: "Un permis d’essai gratuit", r: "Kevin teste sur l’esplanade. Personne n’est blessé, c’est déjà ça.", e: { chaos: 8, perso: { kevin: 1 } } },
        { t: "Non merci", r: "Kevin part lancer sa start-up à Lyon.", e: { perso: { kevin: -1 } } }] },
    { id: "x-baguette", rar: "politique", perso: "momo", titre: "La plus longue baguette du monde", desc: "Momo Benali veut battre le record du monde de la plus longue baguette sur le parvis de l’Hôtel de Ville.",
      choix: [
        { t: "Soutenir le record (5 M€)", r: "1,2 kilomètre de baguette ! Record battu, Paris en liesse.", e: { bud: -5, pop: 3, objet: "baguette", perso: { momo: 2 } } },
        { t: "Prêter le parvis, sans plus", r: "Record raté de 3 mètres. Momo promet de recommencer.", e: { pop: 1, perso: { momo: 1 } } },
        { t: "Refuser : sécurité oblige", r: "Les boulangers boudent. Les croissants aussi, on dirait.", e: { pop: -1, perso: { momo: -2 } } }] },
    { id: "x-influenceur", rar: "politique", titre: "« La mairie a interdit les pigeons ! »", desc: "Un influenceur affirme, sans preuve, que la mairie a interdit les pigeons. La rumeur fait le tour des réseaux.",
      cond: function (st) { return !st.flags.amiPigeons; },
      choix: [
        { t: "Démentir avec humour en vidéo", r: "Ta vidéo avec un pigeon sur l’épaule fait 10 millions de vues.", e: { pop: 3, chaos: 5 }, absurde: 1 },
        { t: "Publier un communiqué officiel", r: "Personne ne lit le communiqué, mais la rumeur s’essouffle.", e: { pop: 0.5 } },
        { t: "Porter plainte", r: "L’influenceur se pose en victime. Ses abonnés doublent.", e: { pop: -2 } }] },
    { id: "x-archeo", rar: "rare", titre: "Une découverte archéologique", desc: "Sur un chantier, on découvre les vestiges d’un théâtre gallo-romain. Les archéologues exigent l’arrêt des travaux.",
      cond: function (st) { return st.chantiers.length > 0; },
      choix: [
        { t: "Fouiller et intégrer les vestiges au projet", r: "Le projet prend du retard, mais il gagne un trésor historique.", e: { chantier: { retard: 2 }, pop: 2, pil: { cadre: 2 } } },
        { t: "Fouilles express (40 M€)", r: "Les archéologues travaillent jour et nuit. Le chantier repart vite.", e: { bud: -40 } },
        { t: "Recouvrir discrètement", r: "Le chantier continue…", e: {}, risque: { p: 0.5, e: { pop: -6 }, r: "Agathe Plume l’apprend : « Le maire a enterré l’histoire de Paris ». Scandale." } }] },
    { id: "x-celebrite", rar: "rare", titre: "Une star veut tourner à Paris", desc: "Une star hollywoodienne (fictive) veut tourner un film dans les rues de Paris pendant un mois.",
      choix: [
        { t: "Dérouler le tapis rouge", r: "Le film fait le tour du monde : les touristes affluent.", e: { pop: 2, eco: 4, rec: { m: 6, n: 12 } } },
        { t: "Accepter avec des règles strictes", r: "Le tournage se passe bien, les riverains aussi.", e: { pop: 1, rec: { m: 3, n: 8 } } },
        { t: "Refuser : Paris n’est pas un décor", r: "La star tourne à Rome. Rome remercie.", e: { coh: 1 } }] },
    { id: "x-theo", rar: "politique", perso: "theo", titre: "Théo Lambert occupe un bâtiment vide", desc: "Le militant Théo Lambert et son association occupent un bâtiment municipal vide pour y héberger des sans-abri.",
      desc2: "Théo Lambert recommence ! « La dernière fois, vous nous aviez écoutés. Cette fois, on occupe un immeuble entier. »",
      choix: [
        { t: "Négocier et transformer le lieu en foyer", r: "Le foyer ouvre. Théo te serre la main devant les caméras.", e: { bud: -25, pil: { logement: 3 }, pop: 2, perso: { theo: 2 } } },
        { t: "Leur laisser un an", r: "Un an de tolérance. Le quartier s’habitue.", e: { pil: { logement: 1 }, perso: { theo: 1 } } },
        { t: "Faire évacuer", r: "L’évacuation est filmée. Les images circulent beaucoup.", e: { pil: { securite: 1 }, pop: -3, perso: { theo: -2 } } }] },
    { id: "x-retraite-monique", rar: "rare", perso: "monique", titre: "Monique part à la retraite", desc: "Après 38 ans de service, Monique Dubreuil part à la retraite. Elle te laisse un carton « à n’ouvrir qu’en cas d’urgence ».",
      cond: function (st) { return st.t > 20; },
      choix: [
        { t: "Ouvrir le carton maintenant", r: "Une carte ancienne de Paris… avec des annotations très étranges.", e: { objet: "carte", chaos: 6 } },
        { t: "Lui organiser un pot mémorable (2 M€)", r: "Monique pleure, Léon aussi. Elle te lègue le carton.", e: { bud: -2, objet: "carte", perso: { monique: 2 }, pop: 1 } },
        { t: "La convaincre de rester", r: "Monique reste « encore un an ». Elle le dit depuis 2009.", e: { mod: { entretien: 0.97 } } }] },
    { id: "x-trophee", rar: "rare", titre: "Un geste de ton opposant", desc: "Ton opposant te fait parvenir un trophée gravé « Au meilleur adversaire ». Hommage sincère ou piège ?",
      cond: function (st) { return st.opposant && st.mandat >= 2; },
      choix: [
        { t: "Le remercier publiquement", r: "Un beau moment de politique apaisée.", e: { objet: "trophee", pop: 2 } },
        { t: "Lui offrir un trophée en retour", r: "Le duel de trophées amuse tout Paris.", e: { objet: "trophee", pop: 1, chaos: 5 } },
        { t: "Le soupçonner d’un piège", r: "Le trophée était… juste un trophée. Tu passes pour un paranoïaque.", e: { pop: -2 } }] },
    { id: "x-erreur", rar: "legendaire", titre: "La virgule mal placée", desc: "Une erreur administrative a décalé une virgule dans un contrat de l’État : la ville doit recevoir dix fois plus que prévu. Personne n’a encore remarqué.",
      choix: [
        { t: "Encaisser en silence", r: "Les millions arrivent. Léon ne dort plus.", e: { bud: 300 }, risque: { p: 0.4, e: { bud: -330, pop: -5 }, r: "L’État remarque l’erreur. Il faut rembourser… avec des pénalités." } },
        { t: "Signaler l’erreur", r: "L’État te remercie et accorde une prime d’honnêteté.", e: { bud: 40, pop: 3 } },
        { t: "Négocier un partage", r: "L’État accepte de couper la poire en deux.", e: { bud: 120, coh: -2 } }] },
    { id: "x-grandjour", rar: "legendaire", grandJour: 1, titre: "Le Grand Jour de Paris", desc: "Paris est choisie pour accueillir un événement mondial dans trois mois : un festival international qui sera vu par un milliard de personnes.",
      choix: [
        { t: "Voir très grand (150 M€)", r: "", e: { bud: -150 }, grandJour: 3 },
        { t: "Une version modeste (50 M€)", r: "", e: { bud: -50 }, grandJour: 1 },
        { t: "Décliner l’honneur", r: "L’événement part à Londres. Londres jubile.", e: { pop: -2 } }] },
    { id: "x-greve-annonce", rar: "politique", titre: "Rumeurs de grève générale", desc: "Les syndicats municipaux menacent d’une grève générale le trimestre prochain si leurs revendications ne sont pas entendues.",
      choix: [
        { t: "Négocier tout de suite (30 M€)", r: "Accord trouvé : la grève n’aura pas lieu.", e: { bud: -30, pop: 1 } },
        { t: "Proposer une prime symbolique (10 M€)", r: "Les syndicats hésitent…", e: { bud: -10 }, risque: { p: 0.5, e: { pil: { cadre: -4, transports: -3 }, pop: -3 }, r: "La prime ne suffit pas : la grève paralyse Paris pendant deux semaines." } },
        { t: "Ne rien céder", r: "La grève éclate : poubelles débordantes, métros à l’arrêt.", e: { pil: { cadre: -5, transports: -4 }, pop: -4 } }] },
    { id: "x-pari-tour", rar: "rare", titre: "Une Tour Eiffel en verre ?", desc: "Un promoteur propose de construire une réplique de la Tour Eiffel… entièrement en verre, à côté de l’originale. Il paierait la ville pour le terrain.",
      choix: [
        { t: "Accepter (+90 M€ et des loyers)", r: "La tour de verre brille de mille feux. Les touristes adorent, les Parisiens moins.", e: { bud: 90, rec: { m: 5, n: 24 }, pil: { cadre: -3 } }, risque: { p: 0.3, e: { pop: -6 }, r: "Une pétition mondiale dénonce « le crime esthétique du siècle »." }, absurde: 1 },
        { t: "Contre-proposer un jardin", r: "Le promoteur finance un jardin à la place. Moins drôle, plus vert.", e: { bud: 20, pil: { cadre: 2 } } },
        { t: "Refuser net", r: "Le promoteur part à Las Vegas. Évidemment.", e: { coh: 1 } }] }
  ];

  // ---------- Léon, ton directeur de cabinet : des répliques courtes, aux moments importants ----------
  var LEON = {
    debut: ["Bienvenue à l’Hôtel de Ville. Les dossiers s’empilent déjà, je vous préviens.", "Premier jour, Monsieur le Maire. Le café est froid, mais l’ambition est chaude."],
    faillite: ["Monsieur le Maire, j’ai trois nouvelles. La première : nous avons un problème de trésorerie. La deuxième : nous avons aussi un problème de dette. La troisième : le service communication vient de tweeter que tout va très bien."],
    detteHaute: ["La dette grimpe, Monsieur le Maire. Les banquiers commencent à m’appeler par mon prénom.", "Si la dette dépasse 1,5 milliard, c’est la faillite. Nous n’en sommes plus très loin."],
    reelu: ["Félicitations, Monsieur le Maire. Vous êtes réélu. Je vais pouvoir recommander du papier pour les six prochaines années.", "Réélu ! Je savais que nous y arriverions. Enfin… je l’espérais très fort."],
    battu: ["C’est fini, Monsieur le Maire. Je range vos affaires… et le pigeon en or, je le garde ?", "Les Parisiens ont parlé. Ils ont eu tort, évidemment."],
    absurde: ["Je préfère ne pas inscrire cette décision dans le compte rendu officiel.", "Audacieux. C’est le mot poli, je crois.", "Je vais prévenir le service communication. Et peut-être un psychologue."],
    genieOk: ["Je dois reconnaître que votre idée était excellente. Je l’avais pourtant déconseillée avec beaucoup de conviction."],
    genieKo: ["Je ne dirai pas « je vous l’avais dit ». Je le penserai très fort."],
    pari: ["Monsieur le Maire, je vous rappelle que les finances municipales ne sont pas un établissement de jeux. Cela dit… j’ai trouvé quelqu’un qui prétend pouvoir nous sortir de cette situation. Je ne vous recommande absolument pas de l’écouter."],
    pariGagne: ["Je n’ai rien vu. Je n’étais pas là. Mais bravo.", "Gagné ?! Je vais faire comme si c’était prévu dans le budget."],
    pariPerdu: ["La maison gagne toujours, Monsieur le Maire. Même quand la maison, c’est Paris.", "Je vais classer cette soirée dans le dossier « À oublier »."],
    combo: ["Tiens, ces bâtiments fonctionnent à merveille ensemble. Je l’avais presque prévu.", "Un combo ! Le quartier entier en profite."],
    secret: ["Un bâtiment qui n’existe sur aucun plan officiel… Je n’ai rien signé, n’est-ce pas ?"],
    objet: ["Encore un objet bizarre pour votre bureau. Je vais devoir agrandir l’étagère.", "Je l’ajoute au bureau des objets trouvés. C’est-à-dire votre bureau."],
    projetOk: ["Inauguration réussie ! Les ciseaux étaient émoussés, mais le ruban a cédé.", "Le projet est terminé, et presque dans les temps. C’est historique."],
    projetKo: ["Le chantier a… quelques soucis. Rien qu’un petit milliard ne puisse régler."],
    election: ["Plus que deux trimestres avant l’élection. C’est le moment de briller.", "L’élection approche. Évitez les trottinettes volantes, s’il vous plaît."],
    mission: ["J’ai une petite idée pour les prochains mois…", "Un défi, Monsieur le Maire ? Vous adorez ça."],
    missionOk: ["Mission accomplie ! Je l’ajoute à votre légende.", "Défi relevé. Je suis presque impressionné."],
    alerte: ["Les services météo s’inquiètent : préparez-vous, le trimestre prochain s’annonce agité."],
    historique: ["Cette décision restera dans les livres d’histoire. En bien ou en mal, on verra."]
  };

  // ---------- Réputation : l'historique du joueur à travers toutes ses parties (titres, sans pouvoir en plus) ----------
  var REPUTATION = [[0, "Inconnu au bataillon"], [50, "Élu de quartier"], [150, "Figure parisienne"], [350, "Personnalité nationale"], [700, "Star de la politique"], [1200, "Légende vivante"]];

  // ---------- Défis du jour : un départ imposé, un objectif, une courte partie (12 trimestres) ----------
  var DEFIS_JOUR = [
    { id: "dette", titre: "Sauver une ville surendettée", txt: "La ville commence avec 1 milliard de dette. Termine sans faillite et avec le moins de dette possible.", depart: { dette: 1000, tresor: 100 }, score: function (st, b) { return Math.round(2000 - st.dette + b * 5); } },
    { id: "impopulaire", titre: "Faire réélire un maire impopulaire", txt: "Tu pars avec 35 de popularité, et l’élection arrive dans 12 trimestres. Sois réélu avec le meilleur score possible.", depart: { pop: 35, elec: 12 }, score: function (st) { var e = st.elections[st.elections.length - 1]; return e ? Math.round(e.pct * 20) : 0; } },
    { id: "ecolo", titre: "Une ville verte sans faillite", txt: "Fais monter le Cadre de vie le plus haut possible en 12 trimestres sans faire faillite.", depart: {}, score: function (st) { return Math.round(st.piliers.cadre * 20); } },
    { id: "impots", titre: "Le bonheur sans impôts", txt: "Impôts bloqués à 90 %. Fais monter le bonheur le plus haut possible en 12 trimestres.", depart: { taux: 0.9, tauxBloque: 1 }, score: function (st, b) { return Math.round(b * 20); } },
    { id: "crise", titre: "Surmonter la crise", txt: "Tous les piliers sont à 35. Remonte-les en 12 trimestres : le score est le bonheur final.", depart: { piliers: 35 }, score: function (st, b) { return Math.round(b * 20); } },
    { id: "tresor", titre: "Le grand argentier", txt: "Termine 12 trimestres avec la plus grosse trésorerie possible, sans laisser le bonheur passer sous 45.", depart: {}, score: function (st, b) { return b < 45 ? 0 : Math.round(st.tresor - st.dette); } }
  ];

  var API = { PERSONNAGES: PERSONNAGES, OBJETS: OBJETS, SECRETS: SECRETS, COMBOS: COMBOS, PROJETS: PROJETS, MISSIONS: MISSIONS,
    HISTORIQUES: HISTORIQUES, EVENEMENTS: EVENEMENTS, BATIMENTS2: BATIMENTS2, ENCHERES: ENCHERES, VOISINES: VOISINES, PASS_BATIMENTS: PASS_BATIMENTS, LEON: LEON, REPUTATION: REPUTATION, DEFIS_JOUR: DEFIS_JOUR };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MaireContenu = API;
})(this);
