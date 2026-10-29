// Maire de Paris : moteur du jeu, sans interface (utilisable dans le navigateur et dans Node pour les tests).
// Chaque clic fait passer un trimestre : l'argent rentre et sort, un dossier arrive, et tu achètes des bâtiments
// qui font progresser les 4 piliers de la ville. Tous les 6 ans (24 trimestres), les Parisiens votent :
// la partie continue tant que tu es réélu, ou jusqu'à la faillite.
// Le joueur gagne de l'XP pendant la partie (trimestres, achats, élections, succès…) : chaque niveau débloque un bâtiment
// ou une mécanique tout de suite (voir MECANIQUES et le champ niv des bâtiments). On commence avec deux bâtiments.
// L'état est un objet simple, sauvegardable tel quel ; chaque étape produit un nouvel état, si bien que recharger
// la page ne rejoue jamais un effet déjà appliqué.
(function (root) {
  "use strict";
  // Contenu fait main (personnages, objets, secrets, combos, projets, événements rares…) : voir contenu.js
  var C = (typeof module !== "undefined" && module.exports) ? require("./contenu.js") : root.MaireContenu;
  var POKER = null;   // poker (poker.js), chargé à la demande
  function poker() { return POKER || (POKER = (typeof module !== "undefined" && module.exports) ? require("./poker.js") : root.Poker); }

  var MANDAT = 24, PLAFOND_DETTE = 1500, TAUX = 0.012;   // 24 trimestres = 6 ans ; dette autorisée (M€) ; intérêts par trimestre
  var DEPART = { pop: 58, coh: 70 };

  // Réglages d'équilibrage (vérifiés par tools/maire/test-moteur.mjs)
  var P = {
    impot: 620, fonct: 540, vit: 0.3, usure: 0.4, plancher: 15, rendement: 0.85, inflation: 1.22, evtBase: 0.4,
    popVit: 0.2, usurePop: 0.45, detteImpop: 200, humeurVit: 0.7, aliPlus: 0.8, aliMoins: 1.6,
    ambSeuil: 60, retombees: 0.16, cata: 0.09, chance: 0.05, usureMandat: 3, ecoRecettes: 250, gain: 2, foule: 0.94,
    fort: 2, objVote: 3, cadence: 2
  };

  // ---------- Les 4 piliers de la ville ----------
  var PILIERS = { logement: "Logement", transports: "Transports", cadre: "Cadre de vie", securite: "Sécurité" };
  var ICO = { logement: "🏠", transports: "🚇", cadre: "🌳", securite: "🛡️" };
  var PK = Object.keys(PILIERS);
  // Les dossiers sont écrits avec 8 domaines : chacun rejoint un pilier (l'économie, elle, fait varier les recettes)
  var DOMAINES = {
    securite: "Sécurité", proprete: "Propreté", logement: "Logement", transports: "Transports",
    ecologie: "Écologie", achat: "Pouvoir d’achat", economie: "Économie", services: "Services publics"
  };
  var VERS = { securite: "securite", proprete: "cadre", logement: "logement", transports: "transports", ecologie: "cadre", achat: "logement", services: "cadre", economie: "eco" };

  // ---------- Mécaniques débloquées par niveau du joueur ----------
  var MECANIQUES = [
    { id: "base", niv: 1, nom: "Dossiers, boutique et élections" },
    { id: "budget", niv: 2, nom: "Le budget : régler les impôts" },
    { id: "opposant", niv: 3, nom: "L’opposition" },
    { id: "boutique2", niv: 4, nom: "Des bâtiments plus ambitieux" },
    { id: "cata", niv: 5, nom: "Catastrophes et coups de chance" },
    { id: "promesses", niv: 6, nom: "Les promesses de campagne" },
    { id: "ligne", niv: 7, nom: "La ligne politique" },
    { id: "boutique3", niv: 8, nom: "Le défi du jour" },
    { id: "projets", niv: 10, nom: "Les grands projets de Paris 2040" }
  ];
  // Mécaniques supplémentaires (sans chapitre d'histoire) : elles s'ajoutent en chemin
  var EXTRAS = [
    { id: "missions", niv: 3, nom: "Les missions surprises de Léon" },
    { id: "combos", niv: 4, nom: "Les combos de bâtiments" },
    { id: "pari", niv: 4, nom: "Le dernier pari, quand tout va mal" },
    { id: "historiques", niv: 5, nom: "Les décisions historiques" },
    { id: "grandsProjets", niv: 6, nom: "Les projets démesurés (chantiers de plusieurs trimestres)" }
  ];
  // Ce qui se choisit en créant la partie (promesses, ligne, difficulté) n'arrive qu'à la partie suivante ;
  // le reste s'active dès que le niveau est atteint, en pleine partie (l'opposant, lui, entre en scène au mandat suivant)
  var EN_COURS = { budget: 1, opposant: 1, cata: 1, projets: 1, missions: 1, combos: 1, pari: 1, historiques: 1, grandsProjets: 1 };
  function mecaniques(nivJoueur) { var m = {}; MECANIQUES.concat(EXTRAS).forEach(function (x) { m[x.id] = nivJoueur >= x.niv; }); return m; }

  // ---------- Boutique ----------
  // cout : prix du premier exemplaire (chaque achat suivant coûte 15 % de plus) · ent : entretien par trimestre
  // e : gain sur les piliers (rendement décroissant) · rev : recette par trimestre · eco : dynamisme économique · pop : popularité à l'inauguration
  var BATIMENTS = {
    parc: { niv: 1, nom: "Parc", ico: "🌳", tier: 1, cout: 40, ent: 2, e: { cadre: 3 }, ali: { g: 0, c: 1, d: 0, e: 2 } },
    logements: { niv: 1, nom: "Logements sociaux", ico: "🏢", tier: 1, cout: 60, ent: 3, e: { logement: 3 }, ali: { g: 2, c: 0, d: -1, e: 1 } },
    police: { niv: 6, nom: "Commissariat", ico: "🚓", tier: 1, cout: 50, ent: 4, e: { securite: 3 }, ali: { g: -1, c: 1, d: 2, e: 0 } },
    velo: { niv: 2, nom: "Pistes cyclables", ico: "🚲", tier: 1, cout: 30, ent: 1, e: { transports: 2, cadre: 1 }, ali: { g: 1, c: 0, d: -1, e: 2 } },
    ecole: { niv: 7, nom: "École", ico: "🏫", tier: 2, cout: 70, ent: 4, e: { cadre: 3, logement: 1 }, ali: { g: 1, c: 1, d: 0, e: 0 } },
    tram: { niv: 18, nom: "Ligne de tramway", ico: "🚋", tier: 2, cout: 150, ent: 6, e: { transports: 6 }, ali: { g: 1, c: 1, d: 0, e: 2 } },
    proprete: { niv: 13, nom: "Brigade de propreté", ico: "🧹", tier: 2, cout: 60, ent: 5, e: { cadre: 3, securite: 1 }, ali: { g: 1, c: 1, d: 1, e: 1 } },
    marche: { niv: 11, nom: "Marché couvert", ico: "🧺", tier: 2, cout: 80, ent: 1, rev: 6, e: { logement: 1 }, eco: 2, ali: { g: 1, c: 1, d: 1, e: 1 } },
    metro: { niv: 23, nom: "Station de métro", ico: "🚇", tier: 3, cout: 350, ent: 10, e: { transports: 9, logement: 1 }, eco: 2, ali: { g: 1, c: 2, d: 1, e: 1 } },
    hopital: { niv: 25, nom: "Hôpital", ico: "🏥", tier: 3, cout: 300, ent: 12, e: { cadre: 6, securite: 2 }, ali: { g: 2, c: 1, d: 0, e: 0 } },
    quartier: { niv: 32, nom: "Écoquartier", ico: "🏘️", tier: 3, cout: 400, ent: 8, e: { logement: 8, cadre: 2 }, ali: { g: 1, c: 1, d: 0, e: 2 } },
    musee: { niv: 28, nom: "Grand musée", ico: "🎭", tier: 3, cout: 250, ent: 4, rev: 14, e: { cadre: 2 }, eco: 3, ali: { g: 0, c: 1, d: 1, e: 0 } }
  };
  // Projets démesurés (chantiers) et bâtiments secrets rejoignent la même boutique, avec les mêmes règles d'effets
  Object.keys(C.PROJETS).forEach(function (id) { BATIMENTS[id] = Object.assign({ projet: 1, unique: 1, ali: { g: 1, c: 1, d: 1, e: 1 } }, C.PROJETS[id]); });
  Object.keys(C.SECRETS).forEach(function (id) { BATIMENTS[id] = Object.assign({ secret: 1, unique: 1, ali: {} }, C.SECRETS[id]); });
  // Rayon de la boutique et objectif de partie (si : t = trimestres tenus, reel = réélections) des bâtiments d'origine et des projets
  var RANGEMENT = { parc: ["cadre"], logements: ["logement"], police: ["securite"], velo: ["transports"], ecole: ["cadre"], tram: ["transports", { t: 4 }],
    proprete: ["cadre"], marche: ["economie"], metro: ["transports", { t: 8 }], hopital: ["cadre", { t: 8 }], quartier: ["logement", { t: 12 }], musee: ["economie", { t: 8 }],
    grandParc: ["projet", { t: 4 }], pieton: ["projet", { t: 6 }], renovation: ["projet", { t: 8 }], telepherique: ["projet", { t: 10 }], metroRevo: ["projet", { t: 12 }],
    jo: ["projet", { reel: 1 }], gpe: ["projet", { reel: 1 }], seine: ["projet", { reel: 1 }], museeMondial: ["projet", { reel: 1 }], toboggan: ["projet", { reel: 2 }] };
  Object.keys(RANGEMENT).forEach(function (id) { BATIMENTS[id].cat = RANGEMENT[id][0]; if (RANGEMENT[id][1]) BATIMENTS[id].si = RANGEMENT[id][1]; });
  Object.keys(C.SECRETS).forEach(function (id) { BATIMENTS[id].cat = "secret"; });
  Object.keys(C.BATIMENTS2).forEach(function (id) { BATIMENTS[id] = Object.assign({ ali: {} }, C.BATIMENTS2[id]); });
  Object.keys(C.ENCHERES).forEach(function (id) { BATIMENTS[id] = Object.assign({ enchere: 1, unique: 1, cat: "enchere", ali: {} }, C.ENCHERES[id]); });
  // Prérequis de construction : il faut déjà posséder certains bâtiments (le métro suppose un tram, l'hôpital un centre de santé…)
  var APRES = { metro: { tram: 1 }, hopital: { centreSante: 1 }, quartier: { logements: 2 }, musee: { mediatheque: 1 }, rer: { metro: 1 }, tramTrain: { tram: 2 },
    poleEchanges: { rer: 1 }, centreCrise: { pompiers: 1 }, policeProximite: { police: 2 }, villageVertical: { tourBois: 1 }, tourBois: { renovThermique: 1 },
    quartierAffaires: { incubateur: 2 }, parcExpositions: { halleGourmande: 1 }, toitsVegetaux: { jardinsPartages: 2 }, conservatoire: { mediatheque: 1 },
    stade: { piscine: 1 }, caisseCredit: { antiGaspi: 1 }, telepherique: { tram: 1 }, metroRevo: { metro: 1 }, gpe: { metro: 1 }, seine: { foretUrbaine: 1 },
    jo: { stade: 1 }, museeMondial: { musee: 1 }, studios: { cinePleinAir: 1 }, rechercheMedicale: { hopital: 1 }, festival: { mediatheque: 1 } };
  Object.keys(APRES).forEach(function (id) { BATIMENTS[id].si = Object.assign({}, BATIMENTS[id].si || {}, { apres: APRES[id] }); });
  // Bâtiments exclusifs du pass de combat : gagnés une fois, disponibles pour toujours
  Object.keys(C.PASS_BATIMENTS).forEach(function (id) { BATIMENTS[id] = Object.assign({ pass: 1, unique: 1, niv: 1, ali: {} }, C.PASS_BATIMENTS[id]); });
  var RAYONS = [{ id: "logement", nom: "Logement", ico: "🏠" }, { id: "transports", nom: "Transports", ico: "🚇" }, { id: "cadre", nom: "Cadre de vie", ico: "🌳" },
    { id: "securite", nom: "Sécurité", ico: "🛡️" }, { id: "economie", nom: "Économie", ico: "💶" }, { id: "enchere", nom: "Enchères", ico: "🔨" },
    { id: "projet", nom: "Projets", ico: "🏗️" }, { id: "secret", nom: "Secrets", ico: "🔐" }];

  // ---------- XP et niveaux (la courbe est partagée avec progression.js) ----------
  var NIV_MAX = 50;
  function xpPour(n) { return n <= 1 ? 0 : Math.round(100 * Math.pow(n - 1, 1.75)); }
  function niveauXP(xp) { var n = 1; while (n < NIV_MAX && xp >= xpPour(n + 1)) n++; return n; }
  // Ce que rapporte la partie elle-même (les succès, quêtes et chapitres s'y ajoutent : voir progression.js)
  var XP = { trimestre: 2, trimestreMax: 100, achat: 2, achatMax: 50, election: { facile: 60, moyen: 120, difficile: 200 }, projet: 40, rare: 10, legendaire: 30, raresMax: 120,
    // Tenir ses engagements rapporte : décisions pour ses promesses, bâtiments qui les servent, décisions fidèles à sa ligne, promesses tenues le jour du vote
    promesse: 8, promesseMax: 200, batPromesse: 3, batPromesseMax: 90, ligne: 4, ligneMax: 120, promesseTenue: 40, objectif: 40, mandatReussi: 150,
    // Mini-jeu gagné pour décrocher le meilleur choix d'un dossier
    miniJeu: 12, miniJeuMax: 240 };

  // ---------- Opposants (personnages fictifs) : un nouveau tirage à chaque mandat, une attaque par an ----------
  var OPPOSANTS = [
    { nom: "Victor Delaunay", ico: "🎩", txt: "Ancien ministre, orateur redoutable qui rêve de l’Hôtel de Ville." },
    { nom: "Claire Montfort", ico: "🏛️", txt: "Sénatrice aux réseaux immenses, patiente et méthodique." },
    { nom: "Hugo Valmy", ico: "📱", txt: "Jeune influenceur politique suivi par deux millions de personnes." },
    { nom: "Mathilde Ferrand", ico: "📢", txt: "Présidente du premier groupe d’opposition au Conseil de Paris." },
    { nom: "Bernard Castagne", ico: "📰", txt: "Patron de presse qui fait et défait les réputations." },
    { nom: "Inès Haddad", ico: "✊", txt: "Syndicaliste charismatique, capable de remplir les rues." },
    { nom: "Paul-Émile Roux", ico: "🏘️", txt: "Maire d’arrondissement frondeur, très populaire dans son quartier." },
    { nom: "Sophie Laborde", ico: "🗂️", txt: "Ton ancienne adjointe : elle connaît tous tes dossiers." },
    { nom: "Marc Ollivier", ico: "💼", txt: "Homme d’affaires fortuné, candidat déclaré à ta succession." },
    { nom: "Léa Brunet", ico: "🌱", txt: "Militante associative adorée des jeunes Parisiens." },
    { nom: "Antoine Mercier", ico: "♟️", txt: "Député et stratège, il ne laisse rien au hasard." },
    { nom: "Nadia Kessler", ico: "⚖️", txt: "Avocate médiatique qui traque la moindre irrégularité." }
  ];
  var FORCE_OPP = { facile: [25, 55], moyen: [35, 70], difficile: [50, 85] };
  var ATTAQUES = [
    { titre: "publie une tribune assassine", desc: "Dans un grand quotidien, {nom} démolit ta gestion point par point.", cible: "pop" },
    { titre: "mobilise ses soutiens dans la rue", desc: "{nom} appelle à manifester contre ta politique ; les cortèges grossissent.", cible: "bon" },
    { titre: "dépose une motion de défiance", desc: "Au Conseil de Paris, {nom} tente de retourner tes propres élus contre toi.", cible: "pop" },
    { titre: "enchaîne les plateaux télé", desc: "Toute la semaine, {nom} occupe les écrans pour dénoncer tes choix.", cible: "pop" },
    { titre: "lance une pétition contre ton projet phare", desc: "La pétition de {nom} dépasse les 100 000 signatures en trois jours.", cible: "bon" },
    { titre: "organise un grand meeting", desc: "Salle comble pour {nom}, qui se pose en recours face à ton échec.", cible: "pop" }
  ];
  var SEUIL_OPP = 15;

  var LIGNES = {
    gauche: { nom: "Gauche", txt: "Services publics, solidarité et réduction des inégalités." },
    centre: { nom: "Centre", txt: "Compromis, équilibre budgétaire et réformes pragmatiques." },
    droite: { nom: "Droite", txt: "Sécurité, maîtrise des dépenses et attractivité économique." },
    ecologie: { nom: "Écologie", txt: "Environnement, mobilités douces et transition écologique." }
  };
  var CODE_LIGNE = { g: "gauche", c: "centre", d: "droite", e: "ecologie" }, LETTRE = { gauche: "g", centre: "c", droite: "d", ecologie: "e" };
  var CATS = {
    finances: "Finances", securite: "Sécurité", proprete: "Propreté", logement: "Logement",
    transports: "Transports", ecologie: "Écologie", economie: "Économie", services: "Services publics",
    culture: "Culture et tourisme", quotidien: "Vie quotidienne", institutions: "Relations institutionnelles",
    crise: "Crises exceptionnelles"
  };
  // Ce que le joueur voit sur un dossier : 6 familles au lieu de 12 catégories
  var FAMILLE = { finances: "💶 Budget", economie: "💶 Budget", securite: "🛡️ Sécurité", logement: "🏠 Logement", transports: "🚇 Transports",
    proprete: "🌳 Cadre de vie", ecologie: "🌳 Cadre de vie", services: "🌳 Cadre de vie", culture: "🌳 Cadre de vie", quotidien: "🌳 Cadre de vie",
    institutions: "🏛️ Politique", crise: "🚨 Crise", catastrophe: "🚨 Catastrophe", chance: "🍀 Coup de chance", opposition: "⚔️ Opposition" };
  var CAT_PILIER = { securite: "securite", logement: "logement", transports: "transports", proprete: "cadre", ecologie: "cadre", services: "cadre", culture: "cadre", quotidien: "cadre" };
  var SPECIAUX = { catastrophe: "Catastrophe", chance: "Coup de chance" };
  var COND = ["popMin", "popMax", "bonMin", "bonMax", "cohMin", "cohMax", "tresorMin", "tresorMax", "detteMin",
    "apres", "avant", "ligne", "amb", "flag", "sansFlag"];

  // ---------- Difficulté : elle monte de mandat en mandat (1er mandat « facile », 2e « moyen », puis « difficile ») ----------
  // (le défi du jour reste au palier moyen, pour que tout le monde joue dans les mêmes conditions)
  var NIVEAUX = {
    facile: { nom: "Facile", txt: "Caisses pleines et Parisiens indulgents.", meca: "base", tresor: 800, recettes: 1.04, elec: 2, usure: 0.3, pariMax: 250 },
    moyen: { nom: "Moyen", txt: "Chaque euro compte, chaque élection se prépare.", meca: "boutique2", tresor: 500, recettes: 1, elec: 0, usure: P.usure, pariMax: 200 },
    difficile: { nom: "Réaliste", txt: "Caisses presque vides, Parisiens exigeants.", meca: "boutique3", tresor: 350, recettes: 0.99, elec: -1, usure: 0.45, pariMax: 150 }
  };
  function palier(st) {
    if (!st) return "moyen";
    if (st.scenario) return "moyen";
    return ["facile", "moyen", "difficile"][Math.max(0, Math.min(2, (st.mandat || 1) - 1))];
  }
  // Réglages concrets de chaque mandat : le 1er est indulgent, puis chaque mandat serre la vis (au-delà du 5e, on reste au plus dur)
  var PALIERS = [
    { tresor: 650, recettes: 1.02, elec: -0.3, usure: 0.36, pariMax: 250 },
    { tresor: 500, recettes: 1, elec: 0, usure: 0.4, pariMax: 200 },
    { tresor: 350, recettes: 0.98, elec: -1.5, usure: 0.45, pariMax: 150 },
    { tresor: 350, recettes: 0.96, elec: -3, usure: 0.5, pariMax: 150 },
    { tresor: 350, recettes: 0.94, elec: -4.5, usure: 0.55, pariMax: 120 }];
  function niv(st) { return PALIERS[st && !st.scenario ? Math.max(0, Math.min(4, (st.mandat || 1) - 1)) : 1]; }

  // ---------- Hasard reproductible (sauvegardé dans l'état) ----------
  function rnd(st) {
    st.rng = (st.rng + 0x6D2B79F5) | 0;
    var t = Math.imul(st.rng ^ (st.rng >>> 15), 1 | st.rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rndT(st) { var o = { rng: st.rngT }, r = rnd(o); st.rngT = o.rng; return r; }   // tirage des dossiers (défi du jour)
  function copie(o) { return JSON.parse(JSON.stringify(o)); }
  function borne(x) { return Math.max(0, Math.min(100, Math.round(x * 10) / 10)); }
  function arrondi(x) { return Math.round(x * 10) / 10; }
  function varie(st, v) {
    if (!v) return 0;
    var r = v * (0.75 + 0.5 * rnd(st));
    var n = Math.abs(v) >= 3 ? Math.round(r) : Math.round(r * 10) / 10;
    return n === 0 ? (v > 0 ? 1 : -1) : n;
  }

  // ---------- Validation d'un événement ----------
  function num(x, a, b) { return typeof x === "number" && isFinite(x) && x >= a && x <= b; }
  function validerEffets(e, err, ou) {
    if (!e || typeof e !== "object") { err.push(ou + " : effets absents"); return 0; }
    var n = 0;
    ["pop", "bon", "coh"].forEach(function (k) { if (e[k] != null) { if (!num(e[k], -20, 20)) err.push(ou + " : " + k + " hors limites"); else if (e[k]) n++; } });
    if (e.bud != null) { if (!num(e.bud, -800, 800)) err.push(ou + " : budget hors limites"); else if (e.bud) n++; }
    if (e.rec) {
      if (!num(e.rec.m, -40, 40) || !num(e.rec.n, 1, 80) || e.rec.n % 1) err.push(ou + " : dépense récurrente invalide"); else n++;
    }
    if (e.dom) Object.keys(e.dom).forEach(function (k) {
      if (!DOMAINES[k]) err.push(ou + " : domaine inconnu « " + k + " »");
      else if (!num(e.dom[k], -25, 25)) err.push(ou + " : domaine " + k + " hors limites"); else n++;
    });
    Object.keys(e).forEach(function (k) { if (["pop", "bon", "coh", "bud", "rec", "dom"].indexOf(k) < 0) err.push(ou + " : clé inconnue « " + k + " »"); });
    return n;
  }
  function valider(ev, ids) {
    var err = [];
    if (!ev || typeof ev !== "object") return ["événement vide"];
    var id = ev.id || "?";
    if (!/^[a-z]{2,6}-\d{3,5}$/.test(ev.id || "")) err.push(id + " : identifiant invalide");
    if (!CATS[ev.cat] && !SPECIAUX[ev.cat]) err.push(id + " : catégorie inconnue");
    if (!ev.titre || ev.titre.length < 6 || ev.titre.length > 90) err.push(id + " : titre manquant ou de mauvaise longueur");
    if (!ev.desc || ev.desc.length < 30 || ev.desc.length > 420) err.push(id + " : description manquante ou de mauvaise longueur");
    if (ev.cond) Object.keys(ev.cond).forEach(function (k) {
      if (COND.indexOf(k) < 0) err.push(id + " : condition inconnue « " + k + " »");
      if (k === "ligne" && (!Array.isArray(ev.cond.ligne) || ev.cond.ligne.some(function (l) { return !LIGNES[l]; }))) err.push(id + " : condition de ligne invalide");
      if (k === "amb" && !DOMAINES[ev.cond.amb]) err.push(id + " : condition d’ambition invalide");
      if (/Min$|Max$|^apres$|^avant$/.test(k) && !num(ev.cond[k], -5000, 5000)) err.push(id + " : condition " + k + " invalide");
    });
    if (!Array.isArray(ev.choix) || ev.choix.length !== 3) { err.push(id + " : il faut exactement trois choix"); return err; }
    var titres = {};
    ev.choix.forEach(function (c, i) {
      var ou = id + " choix " + "ABC"[i];
      if (!c.t || c.t.length < 4 || c.t.length > 90) err.push(ou + " : titre manquant ou trop long");
      if (!c.d || c.d.length < 5 || c.d.length > 240) err.push(ou + " : indice manquant ou trop long");
      if (!c.r || c.r.length < 15 || c.r.length > 420) err.push(ou + " : résultat manquant ou trop long");
      var k = (c.t || "").toLowerCase(); if (titres[k]) err.push(ou + " : même titre qu’un autre choix"); titres[k] = 1;
      var n = validerEffets(c.e, err, ou);
      if (c.ali) Object.keys(c.ali).forEach(function (l) { if (!CODE_LIGNE[l] || !num(c.ali[l], -5, 5)) err.push(ou + " : alignement invalide"); });
      else err.push(ou + " : alignement politique absent");
      (c.dif || []).forEach(function (d) { if (!num(d.n, 1, 30) || !d.txt) err.push(ou + " : effet différé invalide"); n += validerEffets(d.e, err, ou + " (différé)"); });
      if (c.alea) { if (!num(c.alea.p, 5, 60) || !c.alea.txt) err.push(ou + " : aléa invalide"); validerEffets(c.alea.e, err, ou + " (aléa)"); }
      if (c.suite) { if (!num(c.suite.n, 1, 30) || (ids && !ids[c.suite.id])) err.push(ou + " : suite vers un événement introuvable (" + c.suite.id + ")"); }
      if (!n) err.push(ou + " : aucun effet");
    });
    return err;
  }

  // ---------- Création de partie ----------
  // o : { ligne, ambitions (2 piliers), niveau, nivJoueur, graine, lots, secrets (bâtiments secrets déjà découverts), scenario (défi du jour) }
  function nouvellePartie(o) {
    var nj = o.nivJoueur || (o.xpJoueur != null ? niveauXP(o.xpJoueur) : 99);
    var nv = o.scenario ? "moyen" : "facile", m = mecaniques(nj);
    var maire = o.maire && C.MAIRES[o.maire] ? o.maire : null;
    var ligne = maire ? C.MAIRES[maire].ligne : m.ligne ? o.ligne : "centre";
    if (!LIGNES[ligne]) throw new Error("Ligne politique inconnue");
    var amb = m.promesses ? (o.ambitions || []).filter(function (a, i, t) { return PILIERS[a] && t.indexOf(a) === i; }) : [];
    if (m.promesses && amb.length !== 2) throw new Error("Il faut choisir exactement deux promesses");
    var st = {
      v: 8, niveau: "progressif", maire: maire, meca: m, nivJ: nj, rng: (o.graine >>> 0) || ((Math.random() * 4294967296) >>> 0), lots: o.lots || [],
      ligne: ligne, ambitions: amb, t: 0, mandat: 1, debutMandat: 0, phase: "pret",
      tresor: o.scenario ? PALIERS[1].tresor : PALIERS[0].tresor, dette: 0, pop: DEPART.pop, coh: DEPART.coh, humeur: 0, taux: 1, eco: 50,
      piliers: {}, base: {}, bat: {}, prevus: [], recurrents: [], suites: [], vus: {}, flags: {}, nid: 1,
      journal: [], historique: [], evenement: null, resultat: null, fin: null, cats: [], special: null, evPerso: null,
      elections: [], rapport: null, notes: [], opposant: null,
      // XP : celle du profil au départ, celle gagnée dans la partie ; le défi du jour garde les mêmes bâtiments pour tous
      xp0: o.xpJoueur != null ? o.xpJoueur : xpPour(Math.min(nj, NIV_MAX)), nivFixe: nj >= 99 || !!o.scenario,
      // Réservé à l'administrateur : tous les bâtiments sans attendre (la partie ne compte alors pas au classement)
      sansLimite: !!o.sansLimite, triche: !!o.sansLimite,
      sansMissions: o.missions === false                     // l'interface peut se passer des missions surprises
    };
    migrer(st);
    st.pid = o.pid ? String(o.pid) : "p" + (st.rng >>> 0).toString(36);
    st.passBats = {}; Object.keys(o.passBats || {}).forEach(function (id) { if (C.PASS_BATIMENTS[id]) st.passBats[id] = 1; });
    marquerConnus(st);
    // Bonus du pass de combat utilisés en début de partie (jamais pendant le défi du jour)
    var bo = o.scenario ? {} : (o.bonus || {});
    if (bo.tresor) st.tresor += Math.min(200, bo.tresor);
    if (bo.pop) st.pop = borne(st.pop + Math.min(8, bo.pop));
    if (bo.assurance) st.assurance = 1;
    st.bonus = { tresor: bo.tresor || 0, pop: bo.pop || 0, assurance: bo.assurance ? 1 : 0 };
    Object.keys(o.secrets || {}).forEach(function (id) { if (C.SECRETS[id]) st.secrets[id] = 1; });
    st.rngT = (st.rng ^ 0x5bd1e995) | 0;
    PK.forEach(function (k) { st.base[k] = borne(46 + Math.round((rnd(st) - 0.5) * 10)); st.piliers[k] = st.base[k]; });
    if (m.opposant) tirerOpposant(st);
    var sc = o.scenario && C.DEFIS_JOUR.filter(function (d) { return d.id === o.scenario; })[0];
    if (sc) {
      var dp = sc.depart; st.scenario = { id: sc.id, fin: 12, tauxBloque: !!dp.tauxBloque };
      if (dp.dette) st.dette = dp.dette; if (dp.tresor != null) st.tresor = dp.tresor; if (dp.pop) st.pop = dp.pop; if (dp.taux) st.taux = dp.taux;
      if (dp.piliers) PK.forEach(function (k) { st.base[k] = dp.piliers; st.piliers[k] = dp.piliers; });
      if (dp.elec) st.debutMandat = dp.elec - MANDAT;
    }
    stats(st);
    var bm = bonusMaire(st);
    if (bm.tresor) st.tresor += bm.tresor;
    if (bm.pop) st.pop = borne(st.pop + bm.pop);
    if (!st.scenario) tirerMandat(st);
    leon(st, "debut");
    return st;
  }
  // Sauvegardes : les parties des versions précédentes reçoivent les nouveaux champs, sans rien perdre
  function migrer(st) {
    if (!st || st.v > 8) return st;
    var ancien = st.v < 5, d = { chaos: 10, chantiers: [], incidents: [], messages: [], offre: null, bj: null, pariRes: null, mission: null, missionCd: 0, missionsOk: [],
      combos: [], decouvertes: [], objets: [], secrets: {}, persos: {}, mods: { entretien: 1, recettes: 0 }, conditions: [], suitesSpe: [],
      histoMandat: 0, alerte: null, repit: 0, pariMandat: 0, pariCd: 0, leon: null, uniques: {}, emprunts: 0, ampleur: {}, scenario: null, passBats: {}, assurance: 0,
      maire: null, crise: null, objectifs: [], prochainDossier: 0, anticipee: null, mandatBats: {}, mandatTypes: {}, mandatBase: {},
      xp: 0, xpLog: [], xpSrc: {}, montees: [], succesPartie: [], suivi: {}, enchere: null, encheresCd: {}, hab: HAB0, habDelta: 0 };
    Object.keys(d).forEach(function (k) { if (st[k] == null) st[k] = d[k]; });
    if (st.nivJ == null) st.nivJ = 99;
    if (!st.meca) st.meca = mecaniques(st.nivJ);
    EXTRAS.forEach(function (x) { if (st.meca[x.id] == null) st.meca[x.id] = st.nivJ >= x.niv; });
    stats(st);
    if (st.xp0 == null) st.xp0 = xpPour(Math.min(st.nivJ, NIV_MAX));
    if (st.nivFixe == null) st.nivFixe = st.nivJ >= 99 || !!st.scenario;
    if (!st.pid) st.pid = "p" + (st.rng >>> 0).toString(36) + "-" + st.t;
    // Partie d'une version précédente : l'XP déjà méritée est comptée (sauf si la partie a déjà été soldée)
    if (ancien && !st.prog) xpRetro(st);
    if (!st.connus) { st.connus = {}; marquerConnus(st); }
    // Partie d'avant les objectifs de mandat : deux objectifs, sans crise (le mandat est déjà commencé)
    if (st.v < 7 && !st.scenario && !st.objectifs.length && st.phase !== "fin") tirerMandat(st, true);
    st.v = 8;
    return st;
  }
  function xpRetro(st) {
    var x = stats(st), nv = palier(st);
    gagnerXP(st, "Trimestres à l’Hôtel de Ville", st.t * XP.trimestre, XP.trimestreMax);
    gagnerXP(st, "Bâtiments achetés", x.achats * XP.achat, XP.achatMax);
    (st.elections || []).forEach(function (e) { if (e.gagne) gagnerXP(st, "Élections gagnées", XP.election[nv]); });
    (st.missionsOk || []).forEach(function (m) { gagnerXP(st, "Missions surprises réussies", m.xp); });
    gagnerXP(st, "Projets démesurés inaugurés", x.projetsOk * XP.projet);
    gagnerXP(st, "Événements rares vécus", x.rares * XP.rare + x.legendaires * XP.legendaire, XP.raresMax);
  }
  // Coffre de la victoire : une surprise à chaque élection gagnée (le contenu est tiré et appliqué tout de suite,
  // l'interface le révèle quand le joueur l'ouvre) ; une fois sur dix, le jackpot
  function ouvrirCoffre(st) {
    var r = rnd(st), c;
    if (r < 0.1) { c = { type: "jackpot", txt: "JACKPOT ! +300 M€, +5 popularité et +100 XP", m: 300, pop: 5, xp: 100 }; stats(st).jackpots = (stats(st).jackpots || 0) + 1; }
    else if (r < 0.5) { var m = 80 + Math.round(rnd(st) * 12) * 10; c = { type: "argent", txt: "+" + m + " M€ pour la ville", m: m }; }
    else if (r < 0.75) { var p = 3 + Math.floor(rnd(st) * 3); c = { type: "pop", txt: "+" + p + " popularité", pop: p }; }
    else { var x = 60 + Math.round(rnd(st) * 9) * 10; c = { type: "xp", txt: "+" + x + " XP", xp: x }; }
    if (c.m) mouvement(st, c.m, "Coffre de la victoire");
    if (c.pop) st.pop = borne(st.pop + c.pop);
    if (c.xp) gagnerXP(st, "Coffres de la victoire", c.xp);
    st.coffre = Object.assign(c, { mandat: st.mandat, vu: false });
    stats(st).coffres = (stats(st).coffres || 0) + 1;
  }
  // Plan de la ville : chaque bâtiment construit occupe un emplacement du plan de Paris, du centre vers l'extérieur.
  // Les exemplaires sont répartis à tour de rôle (1er parc, 1er commissariat… puis 2e parc…) pour mélanger les quartiers.
  function planVille(st) {
    var ids = Object.keys(st.bat).filter(function (id) { return BATIMENTS[id] && st.bat[id] > 0; }), l = [], k = 0, reste = true;
    while (reste && l.length < C.PLAN.length) {
      reste = false;
      ids.forEach(function (id) {
        if (st.bat[id] > k && l.length < C.PLAN.length) {
          var B = BATIMENTS[id], p = C.PLAN[l.length];
          l.push({ id: id, k: k, ico: B.ico, nom: B.nom, x: p[0], y: p[1], gros: !!(B.projet || B.enchere || B.pass || B.secret) });
          reste = true;
        }
      });
      k++;
    }
    return l;
  }
  function voirCoffre(st0) { if (!st0.coffre || st0.coffre.vu) return st0; var st = copie(st0); st.coffre.vu = true; return st; }
  // Bâtiments qui viennent d'arriver en boutique (niveau atteint, trimestres tenus, réélection) : annoncés une seule fois
  function nouveaux(st) {
    var l = Object.keys(BATIMENTS).filter(function (id) { return !BATIMENTS[id].secret && !st.connus[id] && disponible(st, id); });
    l.forEach(function (id) { st.connus[id] = 1; });
    return l;
  }
  function annoncer(st) { var l = nouveaux(st); if (l.length) st.montees.push({ n: 0, bats: l, meca: [], plusTard: [] }); }
  function marquerConnus(st) { Object.keys(BATIMENTS).forEach(function (id) { if (!BATIMENTS[id].secret && disponible(st, id)) st.connus[id] = 1; }); }
  // Gagner de l'XP en pleine partie ; plafond : total maximum pour cette source dans la partie
  function gagnerXP(st, txt, n, plafond) {
    n = Math.round(n || 0);
    if (plafond != null) { var deja = st.xpSrc[txt] || 0; n = Math.min(n, plafond - deja); if (n > 0) st.xpSrc[txt] = deja + n; }
    if (n <= 0) return 0;
    st.xp += n;
    var g = st.xpLog.filter(function (y) { return y.txt === txt; })[0];
    if (g) g.xp += n; else st.xpLog.push({ txt: txt, xp: n });
    monterNiveau(st);
    return n;
  }
  // Nouveau niveau : ses bâtiments arrivent tout de suite en boutique (l'interface le fête grâce à st.montees)
  function monterNiveau(st) {
    if (st.nivFixe || st.phase === "fin") return;
    var cible = niveauXP(st.xp0 + st.xp);
    while (st.nivJ < cible) {
      var n = ++st.nivJ, m = { n: n, bats: [], meca: [], plusTard: [] };
      MECANIQUES.concat(EXTRAS).forEach(function (x) {
        if (x.niv !== n || st.meca[x.id]) return;
        if (EN_COURS[x.id]) { st.meca[x.id] = true; m.meca.push(x.nom); } else m.plusTard.push(x.nom);
      });
      m.bats = nouveaux(st);
      st.montees.push(m);
    }
  }
  function tirerOpposant(st) {
    var fo = FORCE_OPP[palier(st)], avant = st.opposant ? st.opposant.i : -1, i;
    do { i = Math.floor(rnd(st) * OPPOSANTS.length); } while (i === avant);
    st.opposant = { i: i, force: Math.round(fo[0] + rnd(st) * (fo[1] - fo[0]) + (st.mandat - 1) * 4), actif: true, contres: 0 };
    if (bonusMaire(st).opp) st.opposant.force = Math.max(10, st.opposant.force + bonusMaire(st).opp);
    st.opposant.depart = st.opposant.force;
  }
  function stats(st) {
    var d = { trahisons: 0, depenses: 0, detteMax: 0, popMin: st.pop, contre: 0, mobilise: 0, nuireOk: 0, nuireKo: 0,
      subi: 0, elimines: 0, catastrophes: 0, chances: 0, cats: {}, retombees: 0, achats: 0, bats: {}, investi: 0, dossiers: 0, tresorMax: st.tresor,
      rares: 0, legendaires: 0, crisesOk: 0, bonheurMax: 0, paris: 0, pariGain: 0, pariPerte: 0, projetsOk: 0, missionsOk: 0, combos: 0,
      secretsBatis: 0, absurdes: 0, genieOk: 0, genieKo: 0, hantises: 0, objets: 0, grandJour: 0, grandJourOk: 0, negSerie: 0, negSerieMax: 0,
      trimSansDette: 0, sauvetage: 0, pigeons: 0, persos: 0, financements: 0,
      encheres: 0, encheresPerdues: 0, bonnesAffaires: 0, lances: 0 };
    if (!st.stats) st.stats = {};
    Object.keys(d).forEach(function (k) { if (st.stats[k] == null) st.stats[k] = d[k]; });
    return st.stats;
  }
  function suivre(st) {
    var x = stats(st);
    x.detteMax = Math.max(x.detteMax, st.dette); x.popMin = Math.min(x.popMin, st.pop); x.tresorMax = Math.max(x.tresorMax, st.tresor);
    x.bonheurMax = Math.max(x.bonheurMax, bonheur(st));
  }
  function opposant(st) { return st.opposant ? Object.assign({}, OPPOSANTS[st.opposant.i], st.opposant) : null; }
  function humeurOpp(f) { return f < 40 ? "tiède" : f < 60 ? "combatif" : f < 75 ? "redoutable" : "brûlant"; }
  // Léon ne parle qu'aux moments importants ; le téléphone garde une trace des messages
  function leon(st, k) {
    var l = C.LEON[k]; if (!l) return;
    st.leon = { t: st.t, k: k, txt: l[Math.floor(rnd(st) * l.length)] };
  }
  function message(st, ico, titre, txt, type) {
    st.messages.push({ id: st.nid++, t: st.t, ico: ico, titre: titre, txt: txt, type: type || "info", lu: false });
    if (st.messages.length > 15) st.messages.splice(0, st.messages.length - 15);
  }
  function lireMessages(st0) { var st = copie(st0); st.messages.forEach(function (m) { m.lu = true; }); return st; }

  // ---------- Calculs ----------
  function bonheur(st) { var t = 0; PK.forEach(function (k) { t += st.piliers[k]; }); return borne(t / PK.length + st.humeur); }
  function trimMandat(st) { return st.t - st.debutMandat; }
  // Élection prévue : fin du mandat, ou plus tôt si des élections anticipées ont été annoncées
  function prochaineElection(st) { return st.anticipee || st.debutMandat + MANDAT; }
  function nbTransports(st) { return (st.bat.tram || 0) + (st.bat.metro || 0) + (st.bat.metroRevo || 0) + (st.bat.gpe || 0) + (st.bat.telepherique || 0); }
  // Combos : certains bâtiments fonctionnent mieux ensemble (débloqué au niveau 4)
  function combosActifs(st) {
    if (!st.meca.combos) return [];
    return Object.keys(C.COMBOS).filter(function (id) {
      var b = C.COMBOS[id].besoin;
      return Object.keys(b).every(function (k) { return (k === "transport" ? nbTransports(st) : (st.bat[k] || 0)) >= b[k]; });
    });
  }
  // ---------- Personnage joué et crise du mandat ----------
  function bonusMaire(st) { return (st.maire && C.MAIRES[st.maire] && C.MAIRES[st.maire].bonus) || {}; }
  function criseEnCours(st) { return st.crise && C.CRISES[st.crise.id] || null; }
  // Prix de base d'un bâtiment, après la remise du personnage sur son rayon
  function coutBat(st, id) { var B = BATIMENTS[id], r = (bonusMaire(st).remise || {})[B.cat] || 0; return Math.round(B.cout * (1 - r)); }

  // ---------- Objectifs de mandat ----------
  // Cibles selon la difficulté : facile, moyen, réaliste
  // (réglées sur ce qu'atteint un joueur appliqué au moment du vote : le Réaliste part de plus bas, ses cibles aussi)
  var CIBLES = { pilier: [61, 58, 55], bonheur: [60, 56, 53], pop: [56, 52, 48], dette: [250, 200, 150], tresor: [500, 280, 220], rayon: [4, 4, 4], rayonCrise: [3, 3, 3], diversite: [6, 6, 6], coherence: [56, 50, 45] };
  var RAYON_NOM = { logement: "de logement", transports: "de transports", cadre: "de cadre de vie", securite: "de sécurité", economie: "d’économie" };
  function cibleObj(k, st) { return CIBLES[k][{ facile: 0, moyen: 1, difficile: 2 }[palier(st)]]; }
  function creerObjectif(st, o, crise) {
    var x = { k: o.k }; if (o.p) x.p = o.p; if (o.r) x.r = o.r;
    // Les objectifs imposés par la crise partent de plus loin : cibles un peu plus basses
    if (o.k === "pilier") { x.but = cibleObj("pilier", st) - (crise ? 4 : 0); x.ico = ICO[o.p]; x.txt = "Monte " + ({ logement: "le logement", transports: "les transports", cadre: "le cadre de vie", securite: "la sécurité" })[o.p] + " à " + x.but; }
    else if (o.k === "bonheur") { x.but = cibleObj("bonheur", st); x.ico = "😊"; x.txt = "Bonheur des Parisiens à " + x.but; }
    else if (o.k === "pop") { x.but = cibleObj("pop", st); x.ico = "📣"; x.txt = "Popularité à " + x.but; }
    else if (o.k === "dette") { x.but = cibleObj("dette", st); x.ico = "💸"; x.txt = x.but ? "Dette sous " + x.but + " M€ le jour du vote" : "Aucune dette le jour du vote"; }
    else if (o.k === "tresor") { x.but = cibleObj("tresor", st) - (crise ? 80 : 0); x.ico = "💰"; x.txt = "Au moins " + x.but + " M€ en caisse le jour du vote"; }
    else if (o.k === "rayon") { x.but = cibleObj(crise ? "rayonCrise" : "rayon", st); x.ico = "🏗️"; x.txt = "Construis " + x.but + " bâtiments " + RAYON_NOM[o.r]; }
    else if (o.k === "diversite") { x.but = cibleObj("diversite", st); x.ico = "🧩"; x.txt = "Construis " + x.but + " bâtiments différents"; }
    else if (o.k === "projet") { x.but = 1; x.ico = "✂️"; x.txt = "Inaugure un projet démesuré"; }
    else if (o.k === "opposant") { x.but = 1; x.ico = "⚔️"; x.txt = "Pousse ton opposant à renoncer"; }
    else if (o.k === "coherence") { x.but = cibleObj("coherence", st); x.ico = "🧭"; x.txt = "Garde une cohérence de " + x.but; }
    else if (o.k === "enchere") { x.but = 1; x.ico = "🔨"; x.txt = "Remporte une enchère"; }
    if (crise) x.crise = 1;
    return x;
  }
  // Où en est un objectif : cur / but, ok ; « garde » : à tenir jusqu'au vote (sinon, une fois atteint, c'est acquis)
  function etatObjectif(st, o) {
    var x = stats(st), b = st.mandatBase || {}, cur = 0, ok = false, garde = true;
    if (o.k === "pilier") cur = Math.round(st.piliers[o.p]);
    else if (o.k === "bonheur") cur = Math.round(bonheur(st));
    else if (o.k === "pop") cur = Math.round(st.pop);
    else if (o.k === "coherence") cur = Math.round(st.coh);
    else if (o.k === "tresor") cur = Math.round(st.tresor);
    else if (o.k === "dette") { cur = Math.round(st.dette); ok = cur <= o.but; }
    else { garde = false;
      cur = o.k === "rayon" ? (st.mandatBats[o.r] || 0) : o.k === "diversite" ? Object.keys(st.mandatTypes).length : o.k === "projet" ? x.projetsOk - (b.projetsOk || 0)
        : o.k === "enchere" ? (x.encheres || 0) - (b.encheres || 0) : (st.opposant && !st.opposant.actif ? 1 : 0); }
    if (o.k !== "dette") ok = cur >= o.but;
    return { k: o.k, ico: o.ico, txt: o.txt, but: o.but, cur: cur, ok: ok, garde: garde, crise: !!o.crise, inverse: o.k === "dette" };
  }
  function objectifs(st) { return (st.objectifs || []).map(function (o) { return etatObjectif(st, o); }); }
  function objectifsOk(st) { return objectifs(st).filter(function (o) { return o.ok; }).length; }
  // Nouveau mandat : une crise (différente de la précédente) et trois objectifs, dont celui de la crise
  function tirerMandat(st, sansCrise) {
    var ids = Object.keys(C.CRISES).filter(function (id) { return !st.crise || st.crise.id !== id; }), cr = null;
    if (!sansCrise) {
      var id = ids[Math.floor(rnd(st) * ids.length)]; cr = C.CRISES[id];
      st.crise = { id: id, mandat: st.mandat };
      var d = cr.depart || {};
      Object.keys(d.pil || {}).forEach(function (k) { st.base[k] = Math.max(P.plancher, st.base[k] + d.pil[k]); st.piliers[k] = borne(st.piliers[k] + d.pil[k]); });
      if (d.dette) st.dette = Math.min(PLAFOND_DETTE * 0.8, st.dette + d.dette);
      if (d.pop) st.pop = borne(st.pop + d.pop);
      if (d.opp && st.opposant) st.opposant.force = Math.min(100, st.opposant.force + d.opp);
    } else st.crise = null;
    // (« garder de l'argent » ou « ne pas s'endetter » ne sont tirés que par les crises qui les imposent : sinon, ne rien faire suffirait)
    var liste = [], pris = {};
    if (cr) { liste.push(creerObjectif(st, cr.obj, true)); pris[cr.obj.k + (cr.obj.p || cr.obj.r || "")] = 1; }
    var pool = PK.map(function (k) { return { k: "pilier", p: k }; }).concat([{ k: "bonheur" }, { k: "pop" }, { k: "diversite" }],
      ["logement", "transports", "cadre", "securite", "economie"].map(function (r) { return { k: "rayon", r: r }; }));
    if (st.meca.grandsProjets) pool.push({ k: "projet" });
    if (st.meca.opposant && st.opposant) pool.push({ k: "opposant" });
    if (st.meca.ligne) pool.push({ k: "coherence" });
    if ((st.nivJ || 99) >= 7) pool.push({ k: "enchere" });
    while (liste.length < 3 && pool.length) {
      var o = pool.splice(Math.floor(rnd(st) * pool.length), 1)[0], cle = o.k + (o.p || o.r || "");
      if (pris[cle] || (o.k === "rayon" && liste.some(function (y) { return y.k === "rayon"; }))) continue;
      pris[cle] = 1; liste.push(creerObjectif(st, o, false));
    }
    st.objectifs = liste;
    st.mandatBats = {}; st.mandatTypes = {};
    var x = stats(st); st.mandatBase = { projetsOk: x.projetsOk, encheres: x.encheres || 0 };
  }
  // Fin de partie choisie après une réélection : on part en vainqueur
  function retraite(st0) {
    if (st0.phase !== "election") return st0;
    var st = copie(st0), r = (stats(st).mandatsReussis || 0);
    st.fin = { gagne: true, raison: { type: "retraite", txt: "Tu quittes l’Hôtel de Ville par la grande porte après " + (st.mandat - 1) + " mandat" + (st.mandat > 2 ? "s" : "") + (r ? ", dont " + r + " réussi" + (r > 1 ? "s" : "") : "") + "." }, t: st.t };
    st.phase = "fin";
    return st;
  }

  // Atouts des bâtiments (au plus 3 exemplaires comptent) ; chaque atout a un plafond pour rester raisonnable
  function atout(st, k) { var t = 0; Object.keys(st.bat).forEach(function (id) { var B = BATIMENTS[id]; if (B && B[k] && st.bat[id]) t += B[k] * Math.min(st.bat[id], 3); }); return t; }
  function usurePilier(st, k) {
    var r = 0; Object.keys(st.bat).forEach(function (id) { var B = BATIMENTS[id]; if (B && B.usure && B.usure[k] && st.bat[id]) r += B.usure[k] * Math.min(st.bat[id], 3); });
    var cr = criseEnCours(st);
    return niv(st).usure * (1 - Math.min(0.5, r)) * ((cr && cr.usure && cr.usure[k]) || 1);
  }
  function interets(st) { return arrondi(st.dette * TAUX * (1 - Math.min(0.6, atout(st, "interet") + (bonusMaire(st).interet || 0)))); }
  function protection(st) { return Math.min(0.5, atout(st, "cata")); }
  // Effet des bâtiments sur les piliers : chaque exemplaire d'un même bâtiment rapporte un peu moins (rendement),
  // et plus un pilier compte de bâtiments, moins chacun pèse (foule) : varier aide, mais ne suffit pas à tout gagner
  function foule(n) { return n <= 1 ? 1 : (1 - Math.pow(P.foule, n)) / ((1 - P.foule) * n); }
  function bonusBat(st, plus) {
    var b = {}, pos = {}, nb = {}, neg = {}, compte = Object.assign({}, st.bat);
    if (plus) compte[plus] = (compte[plus] || 0) + 1;
    Object.keys(compte).forEach(function (id) {
      var B = BATIMENTS[id], n = compte[id], m = 0; if (!B || !n) return;
      for (var j = 0; j < n; j++) m += Math.pow(P.rendement, j);
      m *= (st.ampleur && st.ampleur[id]) || 1;
      Object.keys(B.e).forEach(function (k) {
        if (B.e[k] > 0) { pos[k] = (pos[k] || 0) + B.e[k] * m; nb[k] = (nb[k] || 0) + n; } else neg[k] = (neg[k] || 0) + B.e[k] * m;
      });
    });
    PK.forEach(function (k) { if (pos[k] || neg[k]) b[k] = ((pos[k] || 0) * foule(nb[k] || 0) + (neg[k] || 0)) * P.gain; });
    combosActifs(st).forEach(function (id) { var e = C.COMBOS[id].e; Object.keys(e).forEach(function (k) { b[k] = (b[k] || 0) + e[k] * P.gain; }); });
    return b;
  }
  // Ce qu'un exemplaire de plus ajouterait réellement à chaque pilier (affiché en boutique)
  function gainAchat(st, id) {
    var a = bonusBat(st), b = bonusBat(st, id), g = {};
    Object.keys(BATIMENTS[id].e).forEach(function (k) { g[k] = arrondi((b[k] || 0) - (a[k] || 0)); });
    return g;
  }
  function cible(st) {
    var b = bonusBat(st), c = {};
    PK.forEach(function (k) { c[k] = borne(st.base[k] + (b[k] || 0) - (k === "logement" ? Math.max(0, st.taux - 1) * 25 : 0)); });
    return c;
  }
  function prix(st, id) { return Math.round(coutBat(st, id) * Math.pow(P.inflation, st.bat[id] || 0)); }
  // ---------- Habitants : plus Paris est peuplé, plus les impôts rapportent ----------
  // La population suit la tendance électorale : popularité qui monte = arrivées ; popularité qui baisse ou sous 50 % = départs ; sinon elle stagne.
  // Les mauvaises décisions font aussi partir des Parisiens.
  var HAB0 = 2100000;
  function facteurHab(st) { return Math.max(0.8, Math.min(1.2, (st.hab || HAB0) / HAB0)); }
  function bougerHab(st, pct) { var a = st.hab || HAB0, n = Math.round(a * (1 + pct / 100)); n = Math.max(Math.round(HAB0 * 0.75), Math.min(Math.round(HAB0 * 1.3), n)); st.hab = n; return n - a; }
  function demographie(st, popAvant) {
    var tend = st.pop - popAvant, pct = 0;
    if (st.pop < 50) pct = -(50 - st.pop) * 0.02 + Math.min(0, tend + 0.5) * 0.08;
    else if (tend < -0.8) pct = (tend + 0.8) * 0.12;
    else if (tend > 0.4) pct = tend * 0.15;
    st.habDelta = pct ? bougerHab(st, pct) : 0;
  }
  function recettes(st) {
    var cr = criseEnCours(st), r = P.impot * st.taux * (0.8 + st.eco / P.ecoRecettes) * niv(st).recettes * (bonusMaire(st).recettes || 1) * ((cr && cr.recettes) || 1) * facteurHab(st);
    // Un même commerce rapporte un peu moins à chaque exemplaire (la clientèle se partage)
    Object.keys(st.bat).forEach(function (id) { var R = BATIMENTS[id].rev || 0; if (R) r += R * ((1 - Math.pow(P.rendement, st.bat[id])) / (1 - P.rendement)) * ((st.ampleur && st.ampleur[id]) || 1); });
    combosActifs(st).forEach(function (id) { r += C.COMBOS[id].rev || 0; });
    return arrondi(r + ((st.mods && st.mods.recettes) || 0));
  }
  function entretien(st) {
    var t = 0;
    Object.keys(st.bat).forEach(function (id) { t += BATIMENTS[id].ent * st.bat[id]; });
    combosActifs(st).forEach(function (id) { t += C.COMBOS[id].ent || 0; });
    return arrondi(t * ((st.mods && st.mods.entretien) || 1) * (1 - Math.min(0.25, atout(st, "entretienPct") / 100)));
  }
  function depenses(st) { return arrondi(P.fonct + entretien(st)); }
  function chantierTranches(st) { var t = 0; (st.chantiers || []).forEach(function (c) { if (!c.susp) t += Math.round(c.du / Math.max(1, c.reste)); }); return t; }
  function solde(st) { var r = 0; st.recurrents.forEach(function (x) { r += x.m; }); return arrondi(recettes(st) - depenses(st) + r - interets(st) - chantierTranches(st)); }
  function promessesTenues(st) { return st.ambitions.filter(function (k) { return st.piliers[k] >= P.ambSeuil; }); }
  // Sondage : ce que donnerait l'élection aujourd'hui (sans le petit aléa du jour du vote)
  function sondage(st) {
    var o = st.opposant, f = o ? (o.actif ? o.force : 0) : 45;
    var pct = 50 + (bonheur(st) - 50) * 0.45 + (st.pop - 50) * 0.55 + (st.ambitions.length ? (promessesTenues(st).length - 1) * 3 : 0)
      - (f - 45) * 0.1 + niv(st).elec - (st.mandat - 1) * P.usureMandat - (st.dette / P.detteImpop * 2 + Math.max(0, st.dette - 900) / 60) * (bonusMaire(st).detteImpop || 1) + objectifsOk(st) * (bonusMaire(st).objVote || P.objVote) + (st.bat.palais && bonheur(st) >= 55 ? 2 : 0) + Math.min(3, atout(st, "vote"));
    return Math.max(10, Math.min(90, arrondi(pct)));
  }

  // ---------- Argent ----------
  function mouvement(st, montant, libelle) {
    if (!montant) return;
    montant = arrondi(montant);
    st.tresor = arrondi(st.tresor + montant);
    st.journal.push({ t: st.t, m: montant, l: libelle });
    if (st.journal.length > 60) st.journal.splice(0, st.journal.length - 60);
  }
  function financement(st) {
    if (st.tresor < 0) {
      var besoin = -st.tresor, possible = PLAFOND_DETTE - st.dette;
      if (besoin > possible) return false;
      st.dette = arrondi(st.dette + besoin); st.tresor = 0;
      st.journal.push({ t: st.t, m: besoin, l: "Emprunt pour couvrir les paiements" });
    } else if (st.dette > 0 && st.tresor > 300) {
      var r = Math.min(st.dette, 150, st.tresor - 300);
      st.dette = arrondi(st.dette - r); st.tresor = arrondi(st.tresor - r);
      st.journal.push({ t: st.t, m: -r, l: "Remboursement de la dette" });
    }
    return true;
  }
  function engagements(st) { var t = 0; st.recurrents.forEach(function (r) { t += r.m * r.n; }); return arrondi(t); }

  // ---------- Appliquer des effets ----------
  // pop : popularité · bon : humeur passagère · coh : cohérence · bud : argent · dom : les 8 domaines des dossiers, ramenés aux piliers
  function appliquer(st, e, libelle, d) {
    d = d || { pop: 0, bon: 0, coh: 0, bud: 0, pil: {} };
    if (!e) return d;
    if (e.pop) { var a0 = st.pop; st.pop = borne(st.pop + e.pop); d.pop = arrondi(d.pop + st.pop - a0); }
    if (e.coh && st.meca.ligne) { var c0 = st.coh; st.coh = borne(st.coh + e.coh); d.coh = arrondi(d.coh + st.coh - c0); }
    if (e.bon) { var h0 = st.humeur; st.humeur = Math.max(-20, Math.min(20, arrondi(st.humeur + e.bon))); d.bon = arrondi(d.bon + st.humeur - h0); }
    if (e.bud) { mouvement(st, e.bud, libelle); d.bud = arrondi(d.bud + e.bud); }
    if (e.dom) Object.keys(e.dom).forEach(function (k) {
      var p = VERS[k]; if (!p) return;
      if (p === "eco") { st.eco = borne(st.eco + e.dom[k]); return; }
      var v = e.dom[k] * (st.ambitions.indexOf(p) >= 0 ? 1.3 : 1);
      st.piliers[p] = borne(st.piliers[p] + v); st.base[p] = borne(st.base[p] + v * P.evtBase);
      d.pil[p] = arrondi((d.pil[p] || 0) + v);
    });
    return d;
  }
  // Effets des événements spéciaux (contenu.js) : tout ce qu'appliquer() sait faire, plus objets, secrets, chantiers…
  function appliquerTout(st, e, lib, d, ctx) {
    d = appliquer(st, e && { pop: e.pop, bon: e.bon, coh: e.coh, bud: e.bud }, lib, d);
    if (!e) return d;
    if (e.pil) Object.keys(e.pil).forEach(function (k) { var a = st.piliers[k]; st.piliers[k] = borne(a + e.pil[k]); d.pil[k] = arrondi((d.pil[k] || 0) + st.piliers[k] - a); });
    if (e.base) Object.keys(e.base).forEach(function (k) { var a = st.piliers[k]; st.base[k] = borne(st.base[k] + e.base[k]); st.piliers[k] = borne(a + e.base[k]); d.pil[k] = arrondi((d.pil[k] || 0) + st.piliers[k] - a); });
    if (e.eco) st.eco = borne(st.eco + e.eco);
    if (e.rec) { st.recurrents.push({ id: st.nid++, m: e.rec.m, n: e.rec.n, l: lib }); d.rec = (d.rec || []).concat([e.rec]); }
    if (e.chaos) st.chaos = Math.max(0, Math.min(100, st.chaos + e.chaos));
    if (e.flag) st.flags[e.flag] = st.t;
    if (e.perso) Object.keys(e.perso).forEach(function (k) { st.persos[k] = (st.persos[k] || 0) + e.perso[k]; });
    if (e.suite) st.suitesSpe.push({ id: e.suite.id, t: st.t + e.suite.n });
    if (e.mod) { if (e.mod.entretien) st.mods.entretien = arrondi2(st.mods.entretien * e.mod.entretien); if (e.mod.recettes) st.mods.recettes += e.mod.recettes; d.mod = e.mod; }
    if (e.condition) st.conditions.push(e.condition);
    if (e.objet) gagnerObjet(st, e.objet);
    if (e.secret) debloquerSecret(st, e.secret);
    if (e.chantier && ctx && ctx.cid) {
      var ch = st.chantiers.filter(function (c) { return c.id === ctx.cid; })[0];
      if (ch) {
        if (e.chantier.retard) ch.reste += e.chantier.retard;
        if (e.chantier.avance) ch.reste = Math.max(1, ch.reste - e.chantier.avance);
        if (e.chantier.cout) ch.du += e.chantier.cout;
        if (e.chantier.reduire) { ch.ampleur = arrondi2(ch.ampleur * 0.7); ch.du = Math.round(ch.du * 0.8); }
        if (e.chantier.suspendre) ch.susp = (ch.susp || 0) + e.chantier.suspendre;
      }
    } else if (e.chantier && e.chantier.retard && st.chantiers.length) st.chantiers[0].reste += e.chantier.retard;
    if (e.perteBat && st.bat[e.perteBat]) { st.bat[e.perteBat]--; if (!st.bat[e.perteBat]) delete st.bat[e.perteBat]; }
    return d;
  }
  function arrondi2(x) { return Math.round(x * 100) / 100; }
  function gagnerObjet(st, id) {
    if (!C.OBJETS[id] || st.objets.indexOf(id) >= 0) return;
    st.objets.push(id); stats(st).objets++;
    st.decouvertes.push({ type: "objet", id: id });
    message(st, C.OBJETS[id].ico, "Objet trouvé : " + C.OBJETS[id].nom, C.OBJETS[id].txt);
    if (C.OBJETS[id].secret) debloquerSecret(st, C.OBJETS[id].secret);
  }
  function debloquerSecret(st, id) {
    if (!C.SECRETS[id] || st.secrets[id]) return;
    st.secrets[id] = 1; st.decouvertes.push({ type: "secret", id: id });
    message(st, C.SECRETS[id].ico, "Bâtiment secret découvert : " + C.SECRETS[id].nom, C.SECRETS[id].txt + " Il est maintenant dans ta boutique.");
    leon(st, "secret");
  }
  function varier(st, e) {
    if (!e) return null;
    var o = {};
    ["pop", "bon", "coh", "bud"].forEach(function (k) { if (e[k]) o[k] = varie(st, e[k]); });
    if (e.dom) { o.dom = {}; Object.keys(e.dom).forEach(function (k) { o.dom[k] = varie(st, e.dom[k]); }); }
    if (e.rec) o.rec = { m: e.rec.m, n: e.rec.n };
    return o;
  }

  // ---------- Tirage des dossiers ordinaires ----------
  function possible(st, ev) {
    var c = ev.cond; if (!c) return true;
    var t = trimMandat(st) * 100 / MANDAT;   // les conditions de date sont écrites sur 100 semaines
    if (c.popMin != null && st.pop < c.popMin) return false;
    if (c.popMax != null && st.pop > c.popMax) return false;
    if (c.bonMin != null && bonheur(st) < c.bonMin) return false;
    if (c.bonMax != null && bonheur(st) > c.bonMax) return false;
    if (c.cohMin != null && st.coh < c.cohMin) return false;
    if (c.cohMax != null && st.coh > c.cohMax) return false;
    if (c.tresorMin != null && st.tresor < c.tresorMin) return false;
    if (c.tresorMax != null && st.tresor > c.tresorMax) return false;
    if (c.detteMin != null && st.dette < c.detteMin) return false;
    if (c.apres != null && t < c.apres) return false;
    if (c.avant != null && t > c.avant) return false;
    if (c.ligne && c.ligne.indexOf(st.ligne) < 0) return false;
    if (c.amb) return false;                                   // anciennes ambitions à 8 domaines : plus utilisées
    if (c.flag && !st.flags[c.flag]) return false;
    if (c.sansFlag && st.flags[c.sansFlag]) return false;
    return true;
  }
  function tirer(st, base, cat) {
    for (var i = 0; !cat && i < st.suites.length; i++) {
      var s = st.suites[i];
      if (s.t <= st.t && base.parId[s.id] && !st.vus[s.id]) { st.suites.splice(i, 1); return base.parId[s.id]; }
    }
    st.suites = st.suites.filter(function (s) { return s.t > st.t || (base.parId[s.id] && !st.vus[s.id]); });
    var der = st.cats.slice(-2), total = 0, cand = [];
    base.liste.forEach(function (ev) {
      if (st.vus[ev.id] || ev.suiteSeulement || !possible(st, ev)) return;
      if (cat ? ev.cat !== cat : SPECIAUX[ev.cat]) return;
      var w = ev.poids || 1;
      if (!cat) {
        var p = CAT_PILIER[ev.cat];
        if (p && st.ambitions.indexOf(p) >= 0) w *= 1.5;
        if (p && st.piliers[p] < 40) w *= 1.5;
        if (ev.cond && ev.cond.ligne) w *= 1.5;
        if (ev.cat === "crise") w *= st.meca.cata ? 0.4 : 0.1;
        if (der.indexOf(ev.cat) >= 0) w *= der[0] === der[1] && der[0] === ev.cat ? 0.05 : 0.35;
      }
      cand.push([ev, w]); total += w;
    });
    if (!cand.length) { if (cat) return null; st.vus = {}; return tirer(st, base); }
    var x = rndT(st) * total;
    for (var j = 0; j < cand.length; j++) { x -= cand[j][1]; if (x <= 0) return cand[j][0]; }
    return cand[cand.length - 1][0];
  }

  // ---------- Événements spéciaux : rares, légendaires, suites, chantiers, décisions historiques ----------
  var SPE = {}; C.EVENEMENTS.forEach(function (ev) { SPE[ev.id] = ev; });
  function versEvenement(st, ev, kind, extra) {
    var o = { id: "spe-" + ev.id + "-" + st.t, src: ev.id, kind: kind || "special", cat: ev.rar === "legendaire" ? "legendaire" : ev.rar === "rare" ? "rare" : ev.rar === "politique" ? "politique" : kind || "rare",
      perso: ev.perso || null, titre: ev.titre, desc: ev.desc2 && ev.perso && st.persos[ev.perso] != null ? ev.desc2 : ev.desc, choix: copie(ev.choix), grandJour: !!ev.grandJour };
    return Object.assign(o, extra || {});
  }
  function tirerSpe(st, rar) {
    var c = C.EVENEMENTS.filter(function (ev) { return ev.rar === rar && !st.uniques[ev.id] && (!ev.cond || ev.cond(st)); });
    return c.length ? c[Math.floor(rnd(st) * c.length)] : null;
  }
  function lancerSpe(st, ev, kind, extra) {
    st.evPerso = versEvenement(st, ev, kind, extra); st.evenement = st.evPerso.id; st.uniques[ev.id] = st.t;
    st.special = kind === "chantier" ? "chantier" : kind === "historique" ? "historique" : ev.rar === "legendaire" ? "legendaire" : ev.rar === "rare" ? "rare" : "politique";
    if (ev.rar === "rare") stats(st).rares++; else if (ev.rar === "legendaire") stats(st).legendaires++;
    if (ev.rar === "rare" || ev.rar === "legendaire") gagnerXP(st, "Événements rares vécus", ev.rar === "rare" ? XP.rare : XP.legendaire, XP.raresMax);
    if (ev.perso && st.persos[ev.perso] == null) { st.persos[ev.perso] = 0; stats(st).persos++; }
    if (ev.id.indexOf("pigeons") >= 0) stats(st).pigeons++;
    st.phase = "evenement";
    return st;
  }
  // Incidents de chantier, pannes : construits à partir de la situation réelle
  function evIncident(st, inc) {
    var B = BATIMENTS[inc.cid || inc.bid] || {}, ch = st.chantiers.filter(function (c) { return c.id === inc.cid; })[0], nom = B.nom || "", reste = ch ? Math.round(ch.du) : 0;
    var p15 = Math.round((B.cout || 100) * 0.15), p25 = Math.round((B.cout || 100) * 0.25);
    if (inc.type === "panne") {
      var rep = Math.round(B.cout * 0.5);
      return { titre: "Panne : " + nom.toLowerCase() + " à l’arrêt", desc: "Faute d’entretien (la ville emprunte depuis plusieurs trimestres pour payer ses factures), un équipement « " + nom + " » tombe en panne.",
        choix: [{ t: "Réparer correctement (" + rep + " M€)", r: "Réparé, et pour longtemps.", e: { bud: -rep } },
          { t: "Rafistoler (" + p15 + " M€)", r: "Ça tient… pour l’instant.", e: { bud: -p15 }, risque: { p: 0.5, e: { perteBat: inc.bid, pop: -1 }, r: "Le rafistolage lâche : l’équipement ferme définitivement." } },
          { t: "Laisser fermé", r: "L’équipement ferme. Les habitants du quartier ne sont pas contents.", e: { perteBat: inc.bid, pop: -2 } }] };
    }
    if (inc.type === "rallonge") return { titre: "Le chantier " + nom + " réclame une rallonge", desc: "Lancé sans réserves suffisantes, le chantier « " + nom + " » manque d’argent. Les entreprises menacent d’arrêter les travaux.",
      choix: [{ t: "Payer la rallonge (" + p25 + " M€)", r: "Les travaux reprennent à plein régime.", e: { bud: -p25 } },
        { t: "Réduire l’ampleur du projet", r: "Le projet sera plus modeste… et moins efficace.", e: { chantier: { reduire: 1 } } },
        { t: "Suspendre les travaux 4 trimestres", r: "Les grues s’immobilisent. Les riverains respirent, les ouvriers moins.", e: { chantier: { suspendre: 4 }, pop: -2 } }] };
    if (inc.type === "retard") return { titre: "Retard sur le chantier " + nom, desc: "Le chantier « " + nom + " » prend du retard : intempéries, livraisons bloquées, grue en panne.",
      choix: [{ t: "Payer pour rattraper le retard (" + p15 + " M€)", r: "Équipes de nuit : le planning est tenu.", e: { bud: -p15 } },
        { t: "Accepter 2 trimestres de retard", r: "Patience : le projet sera livré plus tard.", e: { chantier: { retard: 2 } } },
        { t: "Mettre la pression sur les entreprises", r: "Les entreprises promettent de tenir les délais…", e: {}, risque: { p: 0.5, e: { chantier: { retard: 3 } }, r: "Vexées, les entreprises ralentissent encore : 3 trimestres de retard." } }] };
    if (inc.type === "depassement") return { titre: "Dépassement de budget : " + nom, desc: "Le devis du chantier « " + nom + " » explose. Il reste " + reste + " M€ à payer… et il en faudrait " + p25 + " de plus.",
      choix: [{ t: "Payer le surcoût (+" + p25 + " M€ étalés)", r: "Le surcoût est absorbé dans les prochaines tranches.", e: { chantier: { cout: p25 } } },
        { t: "Réduire l’ampleur du projet", r: "Un projet plus modeste, mais dans le budget.", e: { chantier: { reduire: 1 } } },
        { t: "Renégocier avec les entreprises", r: "Après des semaines de négociation…", e: { chantier: { retard: 1 } }, risque: { p: 0.5, e: { chantier: { cout: p25 } }, r: "La négociation échoue : il faut payer quand même, avec un trimestre de retard." } }] };
    if (inc.type === "succes") return { titre: "Bonne nouvelle sur le chantier " + nom, desc: "Le chantier « " + nom + " » avance plus vite que prévu. Les équipes sont motivées.",
      choix: [{ t: "Accélérer encore (" + p15 + " M€)", r: "Deux trimestres d’avance !", e: { bud: -p15, chantier: { avance: 2 } } },
        { t: "Garder le rythme", r: "Un trimestre d’avance, sans frais.", e: { chantier: { avance: 1 } } },
        { t: "Organiser une visite publique du chantier", r: "Les Parisiens découvrent le projet. Enthousiasme général.", e: { pop: 2 } }] };
    return { titre: "Les riverains contre le chantier " + nom, desc: "Une association de riverains manifeste contre le chantier « " + nom + " » : bruit, poussière, circulation.",
      choix: [{ t: "Négocier des compensations (20 M€)", r: "Les riverains obtiennent des murs anti-bruit. Le calme revient.", e: { bud: -20 } },
        { t: "Passer en force", r: "Les travaux continuent, sous les huées.", e: { pop: -3 } },
        { t: "Modifier le projet", r: "Un trimestre de retard, mais des riverains apaisés.", e: { chantier: { retard: 1 }, pop: 1 } }] };
  }
  function lancerIncident(st, inc) {
    var ev = evIncident(st, inc);
    st.evPerso = { id: "inc-" + st.t, kind: "chantier", cat: "chantier", cid: inc.cid || null, titre: ev.titre, desc: ev.desc, choix: ev.choix };
    st.evenement = st.evPerso.id; st.special = "chantier"; st.phase = "evenement";
    return st;
  }

  // ---------- Élection ----------
  function election(st) {
    var pct = Math.max(10, Math.min(90, arrondi(sondage(st) + (rnd(st) - 0.5) * 6)));
    var piliers = {}; PK.forEach(function (k) { piliers[k] = st.piliers[k]; });
    var ob = objectifs(st), nok = ob.filter(function (o) { return o.ok; }).length;
    return { mandat: st.mandat, t: st.t, pct: pct, gagne: pct > 50, opposant: st.opposant ? OPPOSANTS[st.opposant.i].nom : "l’opposition",
      objectifs: ob, nok: nok, reussi: ob.length > 0 && nok >= 2, parfait: ob.length > 0 && nok === ob.length, crise: st.crise ? st.crise.id : null,
      popu: st.pop, bon: bonheur(st), coh: st.coh, taux: st.taux, amb: promessesTenues(st), piliers: piliers, tresor: st.tresor, dette: st.dette };
  }
  function faillite(st) {
    st.fin = { gagne: false, raison: { type: "faillite", txt: "Faillite municipale : la ville ne peut plus payer ses dépenses, même en empruntant au maximum autorisé." }, t: st.t };
    st.phase = "fin"; gagnerObjet(st, "bonnet");
    leon(st, "faillite");
  }
  function finDefi(st) {
    st.fin = { gagne: true, raison: { type: "defi", txt: "Fin du défi du jour : " + st.scenario.fin + " trimestres se sont écoulés." }, t: st.t };
    st.phase = "fin";
  }

  // ---------- Trimestre suivant ----------
  function debutTour(st0, base) {
    if (st0.phase !== "pret" && st0.phase !== "gestion") return st0;    // un dossier attend une décision : rien à rejouer
    if (st0.bj && !st0.bj.fini) return st0;                              // une partie de cartes est en cours
    if (st0.enchere && !st0.enchere.fini) return st0;                    // une enchère est en cours
    var st = copie(st0), notes = [], x = stats(st), dette0 = st.dette;
    st.t++; st.resultat = null; st.evPerso = null; st.special = null; st.evenement = null; st.pariRes = null;
    if (st.bj && st.bj.fini) st.bj = null;
    if (st.enchere && st.enchere.fini) st.enchere = null;
    if (st.offre && st.offre.t < st.t) { st.offre = null; message(st, "📵", "Offre expirée", "Monsieur Valentin est reparti. « Une autre fois, peut-être. »"); }
    var r0 = recettes(st), d0 = depenses(st);
    mouvement(st, r0, "Impôts et recettes de la ville");
    mouvement(st, -d0, "Fonctionnement et entretien des bâtiments");
    var rec = 0; st.recurrents.forEach(function (r) { rec += r.m; r.n--; });
    if (st.recurrents.length) mouvement(st, rec, "Engagements récurrents (" + st.recurrents.length + ")");
    st.recurrents = st.recurrents.filter(function (r) { return r.n > 0; });
    if (st.dette > 0) mouvement(st, -interets(st), "Intérêts de la dette");
    // Chantiers : une tranche par trimestre, des incidents possibles, l'inauguration au bout
    var finis = [];
    st.chantiers.forEach(function (ch) {
      if (ch.susp) { ch.susp--; return; }
      var tr = Math.round(ch.du / Math.max(1, ch.reste)); ch.du = arrondi(ch.du - tr); ch.reste--;
      mouvement(st, -tr, "Chantier : " + BATIMENTS[ch.id].nom);
      if (ch.reste <= 0) finis.push(ch);
      else if (!st.incidents.length && rnd(st) < BATIMENTS[ch.id].risque * 0.6) {
        var r = rnd(st), type = r < 0.3 ? "retard" : r < 0.55 ? "depassement" : r < 0.8 ? "riverains" : "succes";
        st.incidents.push({ t: st.t, cid: ch.id, type: type });
      }
    });
    finis.forEach(function (ch) { inaugurer(st, ch, notes); });
    var restants = [];
    st.prevus.forEach(function (p) {
      if (p.t <= st.t) { var d = appliquer(st, p.e, p.l); notes.push({ txt: p.txt, d: d }); } else restants.push(p);
    });
    st.prevus = restants;
    // La ville vit : sans entretien, chaque pilier recule ; les bâtiments le tirent vers le haut
    PK.forEach(function (k) { st.base[k] = Math.max(P.plancher, Math.round((st.base[k] - usurePilier(st, k)) * 100) / 100); });
    var c = cible(st);
    PK.forEach(function (k) { st.piliers[k] = borne(st.piliers[k] + (c[k] - st.piliers[k]) * P.vit); });
    st.eco = borne(st.eco + (50 - st.eco) * 0.05 - Math.max(0, st.taux - 1) * 3);
    st.humeur = arrondi(st.humeur * P.humeurVit);
    var cib = bonheur(st) * 0.6 + st.coh * 0.2 + 14 - Math.max(0, trimMandat(st)) * P.usurePop * (bonusMaire(st).usurePop || 1) - st.dette / P.detteImpop * (bonusMaire(st).detteImpop || 1) - (st.coh < 40 ? 4 : 0) - Math.max(0, st.taux - 1) * 30;
    var popAvant = st.pop;
    st.pop = borne(st.pop + (cib - st.pop) * P.popVit + Math.min(0.6, atout(st, "popT")));
    demographie(st, popAvant);
    if (st.meca.ligne) st.coh = borne(st.coh + (50 - st.coh) * 0.03);
    // Le Palais du Maire fait scandale quand la ville va mal
    if (st.bat.palais && (st.dette > 800 || bonheur(st) < 45)) { st.pop = borne(st.pop - 0.8); notes.push({ txt: "👑 Le Palais du Maire fait jaser : « Il vit dans le luxe pendant que la ville souffre ! »", d: { pop: -0.8, bon: 0, coh: 0, bud: 0, pil: {} } }); }
    // Le chaos parisien monte avec le temps (et les bâtiments étranges), et redescend après un événement extraordinaire
    var chaosBat = 0; Object.keys(st.bat).forEach(function (id) { if (BATIMENTS[id].chaos) chaosBat += BATIMENTS[id].chaos / 10; });
    st.chaos = Math.max(0, Math.min(100, st.chaos + 3 + chaosBat + Math.max(-2, atout(st, "chaosT"))));
    var ok = financement(st); suivre(st);
    if (st.dette > dette0 + 0.5) st.emprunts++; else { st.emprunts = 0; x.trimSansDette++; }
    st.rapport = { t: st.t, recettes: r0, depenses: d0, solde: arrondi((st.tresor - st.dette) - (st0.tresor - st0.dette)), dette: arrondi(st.dette - dette0) };
    st.notes = notes;
    if (!ok) { faillite(st); return st; }
    gagnerXP(st, "Trimestres à l’Hôtel de Ville", XP.trimestre, XP.trimestreMax);
    annoncer(st);
    // Objectifs remplis (2 sur 3) : élections anticipées 3 trimestres plus tard, sauf si le vote est déjà proche
    if (!st.anticipee && !st.scenario && st.objectifs && st.objectifs.length && objectifsOk(st) >= 2 && st.debutMandat + MANDAT - st.t >= 5) {
      st.anticipee = st.t + 3;
      notes.push({ txt: "🗳️ Objectifs remplis ! Des élections anticipées auront lieu dans 3 trimestres : tiens bon jusque-là.", d: { pop: 0, bon: 0, coh: 0, bud: 0, pil: {} } });
      message(st, "🗳️", "Élections anticipées", "Tes objectifs sont remplis : les Parisiens votent dans 3 trimestres. Garde le cap jusqu’au vote.");
    }
    // Léon prévient quand la dette devient dangereuse
    if (st.dette > 1000 && dette0 <= 1000) leon(st, "detteHaute");
    // Dernier pari : une proposition risquée quand la ville est au bord du gouffre
    if (st.meca.pari && !st.offre && st.t >= st.pariCd && st.pariMandat < 2 && (st.dette > PLAFOND_DETTE * 0.55 || (st.tresor < 40 && solde(st) < 0 && st.dette > 200))) {
      st.offre = { t: st.t, max: pariMise(st) };
      message(st, "🎩", "Une proposition très risquée", "Monsieur Valentin propose de sauver les finances de la ville. Réponds avant la fin du trimestre.", "pari");
      leon(st, "pari");
    }
    // Entretien négligé : à force d'emprunter pour payer les factures, un équipement finit par lâcher
    if (st.emprunts >= 3 && !st.incidents.length) {
      var ids = Object.keys(st.bat).filter(function (id) { var B = BATIMENTS[id]; return !B.projet && !B.secret && st.bat[id] > 0; });
      if (ids.length >= 2 && rnd(st) < 0.35) st.incidents.push({ t: st.t, bid: ids[Math.floor(rnd(st) * ids.length)], type: "panne" });
    }
    // Missions surprises
    suivreMission(st);
    if (st.meca.missions && !st.sansMissions && !st.mission && st.t >= 4 && st.t >= st.missionCd && rnd(st) < 0.2) lancerMission(st);
    // Élection
    if (st.t >= prochaineElection(st)) {
      st.conditions.forEach(function (cd) {
        if (st.piliers[cd.k] < cd.v) { st.pop = borne(st.pop - cd.pen); notes.push({ txt: "📜 Le contrat de Gaspard Mallet n’est pas respecté (" + PILIERS[cd.k] + " sous " + cd.v + ") : scandale juste avant le vote !", d: { pop: -cd.pen, bon: 0, coh: 0, bud: 0, pil: {} } }); }
      });
      st.conditions = [];
      var el = election(st); st.elections.push(el);
      if (!el.gagne) { if (el.pct < 35) gagnerObjet(st, "bonnet"); st.fin = { gagne: false, raison: { type: "election", txt: "Les Parisiens ont choisi " + el.opposant + " : tu n’obtiens que " + String(el.pct).replace(".", ",") + " % des voix." }, t: st.t }; st.phase = "fin"; leon(st, "battu"); return st; }
      if (st.scenario && st.t >= st.scenario.fin) { finDefi(st); return st; }
      gagnerXP(st, "Élections gagnées", XP.election[palier(st)]);
      if (el.nok) { x.objectifsOk = (x.objectifsOk || 0) + el.nok; gagnerXP(st, "Objectifs de mandat atteints", XP.objectif * el.nok); }
      if (el.reussi) { x.mandatsReussis = (x.mandatsReussis || 0) + 1; gagnerXP(st, "Mandats réussis", XP.mandatReussi); }
      if (el.parfait) x.mandatsParfaits = (x.mandatsParfaits || 0) + 1;
      if (el.amb && el.amb.length) gagnerXP(st, "Promesses tenues le jour du vote", XP.promesseTenue * el.amb.length);
      if (st.anticipee) x.anticipees = (x.anticipees || 0) + 1;
      st.mandat++; st.debutMandat = st.t; st.anticipee = null; st.pop = borne(st.pop + 5); st.pariMandat = 0;
      annoncer(st);
      ouvrirCoffre(st);
      if (st.mandat >= 3) gagnerObjet(st, "echarpe");
      if (st.meca.opposant) tirerOpposant(st);
      if (!st.scenario) tirerMandat(st);
      st.prochainDossier = 0;
      leon(st, "reelu");
      if (bonheur(st) < 50 || st.dette > 1000) x.sauvetage++;
      st.phase = "election"; return st;
    }
    if (st.scenario && st.t >= st.scenario.fin) { finDefi(st); return st; }
    if (prochaineElection(st) - st.t === 2) leon(st, "election");
    return tirerDossier(st, base);
  }
  function continuer(st0, base) { if (st0.phase !== "election") return st0; return tirerDossier(copie(st0), base); }
  // Un dossier tous les 2 ou 3 trimestres ; les urgences (catastrophe annoncée, attaque, chantiers, suites) n'attendent pas
  function tirerDossier(st, base) {
    var r = tirerDossier0(st, base);
    if (r.phase === "evenement") st.prochainDossier = st.t + P.cadence + (rnd(st) < 0.5 ? 1 : 0);
    return r;
  }
  function tirerDossier0(st, base) {
    var o = st.opposant, ev = null, tm = trimMandat(st);
    // 1. La catastrophe annoncée le trimestre précédent arrive
    if (st.alerte && st.alerte.t <= st.t) {
      st.alerte = null; ev = tirer(st, base, "catastrophe");
      if (ev) { st.special = "catastrophe"; st.repit = st.t + 6; return lancerOrdinaire(st, ev); }
    }
    // 2. L'opposant attaque une fois par an
    if (st.meca.opposant && o && o.actif && tm % 4 === 0 && tm > 0) {
      st.evPerso = attaque(st); st.evenement = st.evPerso.id; st.special = "opposition"; st.phase = "evenement"; return st;
    }
    // 3. Les décisions passées reviennent (suites d'événements spéciaux)
    for (var i = 0; i < st.suitesSpe.length; i++) {
      var s = st.suitesSpe[i];
      if (s.t <= st.t && SPE[s.id]) { st.suitesSpe.splice(i, 1); stats(st).hantises++; return lancerSpe(st, SPE[s.id], "suite"); }
    }
    // 4. Chantiers et pannes
    if (st.incidents.length) { var inc = st.incidents.shift(); return lancerIncident(st, inc); }
    // 5. Une décision historique par mandat, à mi-parcours
    if (st.meca.historiques && st.histoMandat < st.mandat && tm === 10) {
      var dispo = C.HISTORIQUES.filter(function (h) { return !st.uniques[h.id]; });
      if (dispo.length) { st.histoMandat = st.mandat; leon(st, "historique"); return lancerSpe(st, dispo[Math.floor(rnd(st) * dispo.length)], "historique"); }
    }
    // Entre deux dossiers : un trimestre de gestion, sans décision à prendre
    if (st.t < (st.prochainDossier || 0)) { st.phase = "gestion"; st.evenement = null; return st; }
    // 6. Le chaos parisien : plus il monte, plus l'extraordinaire devient probable
    var ch = st.chaos, r = rnd(st), pL = ch >= 40 ? 0.006 + ch / 5000 : 0, pR = 0.03 + ch / 800 + (st.bat.coffre ? 0.03 : 0), pP = 0.05;
    var rar = r < pL ? "legendaire" : r < pL + pR ? "rare" : r < pL + pR + pP ? "politique" : null;
    if (rar && st.t > 1) {
      var spe = tirerSpe(st, rar) || (rar === "legendaire" ? tirerSpe(st, "rare") : null);
      if (spe) { st.chaos = Math.max(0, st.chaos - (rar === "politique" ? 10 : 35)); return lancerSpe(st, spe, "special"); }
    }
    // 7. Catastrophes (annoncées un trimestre à l'avance) et coups de chance
    if (st.meca.cata) {
      var rc = rnd(st);
      var crc = criseEnCours(st);
      if (rc < P.cata * ((crc && crc.cata) || 1) && st.t >= st.repit && !st.alerte) {
        st.alerte = { t: st.t + 1 };
        message(st, "⚠️", "Alerte pour le trimestre prochain", "Les services de la ville s’attendent à un coup dur. Garde de l’argent de côté.");
        leon(st, "alerte");
      } else if (rc > 1 - P.chance) { ev = tirer(st, base, "chance"); if (ev) { st.special = "chance"; return lancerOrdinaire(st, ev); } }
    }
    return lancerOrdinaire(st, tirer(st, base));
  }
  function lancerOrdinaire(st, ev) {
    st.vus[ev.id] = st.t; st.cats.push(ev.cat); if (st.cats.length > 6) st.cats.shift();
    if (st.special === "catastrophe") stats(st).catastrophes++; else if (st.special === "chance") stats(st).chances++;
    st.evenement = ev.id; st.phase = "evenement";
    return st;
  }

  // ---------- Projets démesurés ----------
  function inaugurer(st, ch, notes) {
    var B = BATIMENTS[ch.id];
    st.chantiers = st.chantiers.filter(function (c) { return c !== ch; });
    st.bat[ch.id] = 1; st.ampleur[ch.id] = ch.ampleur;
    if (st.mandatTypes) st.mandatTypes[ch.id] = 1;
    if (B.eco) st.eco = borne(st.eco + B.eco * ch.ampleur);
    st.pop = borne(st.pop + (B.pop || 0) * ch.ampleur);
    stats(st).projetsOk++; gagnerXP(st, "Projets démesurés inaugurés", XP.projet);
    notes.push({ txt: "✂️ Inauguration : " + B.ico + " " + B.nom + " ! " + (ch.ampleur < 1 ? "(version réduite)" : "Les Parisiens sont venus en foule."), d: { pop: arrondi((B.pop || 0) * ch.ampleur), bon: 0, coh: 0, bud: 0, pil: {} } });
    message(st, B.ico, "Inauguration : " + B.nom, "Le chantier est terminé. Ses effets s’appliquent dès maintenant.");
    leon(st, "projetOk");
    gagnerObjet(st, "casque");
    verifierCombos(st);
  }

  // ---------- Combos et missions ----------
  function verifierCombos(st) {
    combosActifs(st).forEach(function (id) {
      if (st.combos.indexOf(id) >= 0) return;
      st.combos.push(id); stats(st).combos++; st.decouvertes.push({ type: "combo", id: id });
      message(st, C.COMBOS[id].ico, "Combo découvert : " + C.COMBOS[id].nom, "Ces bâtiments fonctionnent mieux ensemble : bonus permanent.");
      leon(st, "combo");
    });
  }
  function lancerMission(st) {
    var b = bonheur(st), ids = Object.keys(C.MISSIONS).filter(function (id) { var m = C.MISSIONS[id]; return !m.si || m.si(st, b); });
    if (!ids.length) return;
    var id = ids[Math.floor(rnd(st) * ids.length)], m = C.MISSIONS[id];
    st.mission = { id: id, debut: st.t, fin: st.t + m.n, d: m.depart(st, PK, combosActifs(st)) };
    message(st, "🎯", "Mission surprise", m.t + " Récompense : " + m.xp + " XP.");
    leon(st, "mission");
  }
  function suivreMission(st) {
    var m = st.mission; if (!m) return;
    var def = C.MISSIONS[m.id], b = bonheur(st), cb = combosActifs(st);
    if (def.ok(st, m, b, cb)) {
      st.missionsOk.push({ id: m.id, xp: def.xp }); stats(st).missionsOk++; gagnerXP(st, "Missions surprises réussies", def.xp); st.mission = null; st.missionCd = st.t + 4;
      message(st, "✅", "Mission accomplie !", def.t + " (+" + def.xp + " XP)");
      leon(st, "missionOk");
      if (rnd(st) < 0.35) {
        var o = Object.keys(C.OBJETS).filter(function (k) { return !C.OBJETS[k].secret && st.objets.indexOf(k) < 0 && ["statue", "medaille", "maquette", "carte"].indexOf(k) >= 0; });
        if (o.length) gagnerObjet(st, o[Math.floor(rnd(st) * o.length)]);
      }
    } else if (st.t >= m.fin || (def.echec && def.echec(st, m, b))) {
      st.mission = null; st.missionCd = st.t + 4;
      message(st, "❌", "Mission ratée", def.t);
    }
  }

  // ---------- Le dernier pari (monnaie fictive du jeu uniquement) ----------
  // Monsieur Valentin avance la mise : si la ville gagne, elle l'empoche ; si elle perd, elle la lui doit.
  function pariMise(st) { return Math.max(0, Math.min(niv(st).pariMax, Math.floor((PLAFOND_DETTE - st.dette - 120) / 10) * 10)); }
  function finPari(st, gain, type, txt) {
    var x = stats(st);
    if (gain) { mouvement(st, gain, "Dernier pari (" + type + ")"); }
    st.offre = null; st.pariCd = st.t + 8; st.pariMandat++;
    if (type === "blackjack" || type === "roulette") {
      x.paris++; if (gain > 0) x.pariGain += gain; else if (gain < 0) x.pariPerte += -gain;
      gagnerObjet(st, "jeton"); leon(st, gain > 0 ? "pariGagne" : gain < 0 ? "pariPerdu" : "pari");
    } else x.financements = (x.financements || 0) + 1;
    if (st.dette > PLAFOND_DETTE * 0.55 && gain > 0) x.sauvetage++;
    st.historique.push({ t: st.t, titre: "🎩 Dernier pari : " + type, choix: txt, d: { pop: 0, bon: 0, coh: 0, bud: gain, pil: {} }, c: "pari" });
    if (!financement(st)) faillite(st); suivre(st);
  }
  function refuserPari(st0) { if (!st0.offre) return st0; var st = copie(st0); st.offre = null; st.pariCd = st.t + 4; message(st, "🙅", "Proposition refusée", "Léon respire. « Vous avez bien fait. »"); return st; }
  // Blackjack : vrai paquet de 52 cartes mélangé par le moteur, croupier qui tire jusqu'à 17
  function valeurMain(m) { var t = 0, as = 0; m.forEach(function (c) { var v = c % 13 + 1; if (v === 1) { as++; t += 11; } else t += Math.min(10, v); }); while (t > 21 && as) { t -= 10; as--; } return t; }
  function bjCommencer(st0, mise) {
    if (!st0.offre || st0.bj || st0.phase === "fin" || !(mise > 0) || mise > pariMise(st0)) return st0;
    var st = copie(st0), deck = [];
    for (var i = 0; i < 52; i++) deck.push(i);
    for (var j = deck.length - 1; j > 0; j--) { var k = Math.floor(rnd(st) * (j + 1)), t = deck[j]; deck[j] = deck[k]; deck[k] = t; }
    st.bj = { mise: mise, deck: deck, j: [deck.pop(), deck.pop()], c: [deck.pop(), deck.pop()], fini: false, res: null };
    if (valeurMain(st.bj.j) === 21 || valeurMain(st.bj.c) === 21) resoudreBJ(st);
    return st;
  }
  function bjTirer(st0) {
    if (!st0.bj || st0.bj.fini) return st0;
    var st = copie(st0); st.bj.j.push(st.bj.deck.pop());
    if (valeurMain(st.bj.j) >= 21) jouerCroupier(st);
    return st;
  }
  function bjRester(st0) { if (!st0.bj || st0.bj.fini) return st0; var st = copie(st0); jouerCroupier(st); return st; }
  function bjDoubler(st0) {
    if (!st0.bj || st0.bj.fini || st0.bj.j.length !== 2 || st0.bj.mise * 2 > pariMise(st0)) return st0;
    var st = copie(st0); st.bj.mise *= 2; st.bj.double = true; st.bj.j.push(st.bj.deck.pop()); jouerCroupier(st);
    return st;
  }
  function jouerCroupier(st) {
    if (valeurMain(st.bj.j) <= 21) while (valeurMain(st.bj.c) < 17) st.bj.c.push(st.bj.deck.pop());
    resoudreBJ(st);
  }
  function resoudreBJ(st) {
    var b = st.bj, vj = valeurMain(b.j), vc = valeurMain(b.c), nat = vj === 21 && b.j.length === 2, natC = vc === 21 && b.c.length === 2, g, txt;
    if (nat && !natC) { g = Math.round(b.mise * 1.5); txt = "Blackjack ! La ville empoche " + g + " M€."; }
    else if (vj > 21) { g = -b.mise; txt = "Tu dépasses 21 (" + vj + ") : la ville doit " + b.mise + " M€ à Monsieur Valentin."; }
    else if (natC && !nat) { g = -b.mise; txt = "Le croupier a un blackjack : la ville doit " + b.mise + " M€."; }
    else if (vc > 21 || vj > vc) { g = b.mise; txt = "Gagné (" + vj + " contre " + vc + ") : la ville empoche " + b.mise + " M€ !"; }
    else if (vj === vc) { g = 0; txt = "Égalité (" + vj + ") : personne ne gagne, personne ne perd."; }
    else { g = -b.mise; txt = "Perdu (" + vj + " contre " + vc + ") : la ville doit " + b.mise + " M€ à Monsieur Valentin."; }
    b.fini = true; b.res = { gain: g, txt: txt };
    finPari(st, g, "blackjack", txt);
  }
  // Roulette européenne (0 à 36) : rouge/noir ×2, une douzaine ×3, le zéro ×36. Le moteur tire le numéro avant l'animation.
  var ROUGES = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  function roulette(st0, mise, pari) {
    if (!st0.offre || st0.bj || st0.phase === "fin" || !(mise > 0) || mise > pariMise(st0) || ["rouge", "noir", "d1", "d2", "d3", "zero"].indexOf(pari) < 0) return st0;
    var st = copie(st0), n = Math.floor(rnd(st) * 37), rouge = ROUGES.indexOf(n) >= 0;
    var ok = pari === "zero" ? n === 0 : pari === "rouge" ? n > 0 && rouge : pari === "noir" ? n > 0 && !rouge : n > 0 && Math.ceil(n / 12) === +pari.slice(1);
    var mult = pari === "zero" ? 36 : pari[0] === "d" ? 3 : 2, g = ok ? mise * (mult - 1) : -mise;
    if (ok && pari === "zero") stats(st).zero = 1;
    var txt = "La bille s’arrête sur le " + n + (n ? (rouge ? " rouge" : " noir") : " vert") + ". " + (ok ? "Gagné : la ville empoche " + g + " M€ !" : "Perdu : la ville doit " + mise + " M€ à Monsieur Valentin.");
    st.pariRes = { type: "roulette", n: n, rouge: rouge, pari: pari, gain: g, txt: txt };
    finPari(st, g, "roulette", txt);
    return st;
  }
  // L'investisseur mystérieux et le fonds de secours : de l'argent maintenant, une contrepartie affichée avant d'accepter
  function offresFinancement(st) {
    var faible = PK.slice().sort(function (a, b) { return st.piliers[a] - st.piliers[b]; })[0], v = Math.min(80, Math.round(st.piliers[faible] + 8));
    return {
      investisseur: [
        { t: "Un don modeste", g: 80, txt: "+80 M€, sans contrepartie." },
        { t: "Un gros investissement", g: 300, rec: { m: -25, n: 16 }, txt: "+300 M€ maintenant, puis −25 M€ par trimestre pendant 4 ans (400 M€ au total)." },
        { t: "Un financement colossal", g: 600, cond: { k: faible, v: v, pen: 12 }, txt: "+600 M€, à condition que le pilier " + PILIERS[faible] + " atteigne " + v + " d’ici la prochaine élection. Sinon : scandale, −12 de popularité." }],
      fonds: [
        { t: "Accepter le prêt de secours", g: 250, rec: { m: -20, n: 16 }, txt: "+250 M€ maintenant, remboursés 20 M€ par trimestre pendant 4 ans (320 M€)." },
        { t: "Négocier de meilleures conditions", g: 250, rec: { m: -16, n: 16 }, txt: "Une chance sur deux d’obtenir 250 M€ remboursés 16 M€ par trimestre (256 M€). Sinon, le fonds se retire." }]
    };
  }
  function financer(st0, type, k) {
    if (!st0.offre || st0.phase === "fin") return st0;
    var o = offresFinancement(st0)[type]; if (!o || !o[k]) return st0;
    var st = copie(st0), c = o[k], txt;
    if (type === "fonds" && k === 1 && rnd(st) < 0.5) { txt = "Le fonds de secours refuse de négocier et se retire."; st.pariRes = { type: type, txt: txt, gain: 0 }; finPari(st, 0, "fonds de secours", txt); return st; }
    if (c.rec) st.recurrents.push({ id: st.nid++, m: c.rec.m, n: c.rec.n, l: type === "fonds" ? "Remboursement du fonds de secours" : "Remboursement à Gaspard Mallet" });
    if (c.cond) st.conditions.push(c.cond);
    txt = c.t + " : " + c.txt;
    st.pariRes = { type: type, txt: txt, gain: c.g };
    finPari(st, c.g, type === "fonds" ? "fonds de secours" : "investisseur mystérieux", txt);
    return st;
  }

  // ---------- Attaques de l'opposant ----------
  function attaque(st) {
    var o = opposant(st), a = ATTAQUES[(Math.floor(st.t / 4) + st.opposant.i) % ATTAQUES.length];
    var m = Math.round(2 + o.force / 14);
    var cher = 1 + 0.1 * st.opposant.contres;
    var px = Math.round((15 + o.force * 0.6) * cher);
    var e = {}; e[a.cible] = -m;
    var nom = { pop: "popularité", bon: "humeur des Parisiens" }[a.cible];
    var choix = [{ t: "Riposter par une campagne de communication (−" + px + " M€)", r: "Ta riposte éteint l’incendie : l’attaque fait pschitt.", e: { bud: -px }, k: "contre", prix: px }];
    if (st.meca.ligne) { var cc = Math.round((3 + o.force / 15) * cher); choix.push({ t: "Mobiliser ton camp pour répondre (−" + cc + " cohérence)", r: "Tes élus montent au créneau : l’attaque est repoussée.", e: { coh: -cc }, k: "mobilise", coh: cc }); }
    choix.push({ t: "Chercher à le faire tomber (−40 M€, une chance sur deux)", r: "", e: { bud: -40 }, k: "nuire" });
    choix.push({ t: "Ne rien faire", r: "Tu laisses passer l’orage. " + o.nom + " en sort renforcé et reviendra.", e: e, k: "subir" });
    return { id: "opp-" + st.t, kind: "opposition", cat: "opposition", titre: o.nom + " " + a.titre, attaque: e,
      desc: a.desc.replace("{nom}", o.nom) + " Influence actuelle : " + Math.round(o.force) + "/100 (" + humeurOpp(o.force) + "). Si tu laisses faire : −" + m + " " + nom + ".", choix: choix };
  }
  function choisirOpposition(st, i) {
    var ev = st.evPerso, c = ev.choix[i], o = st.opposant, x = stats(st), lib = ev.titre + " : " + c.t;
    var d = { pop: 0, bon: 0, coh: 0, bud: 0, pil: {} }, txt = c.r, extra = [], nom = OPPOSANTS[o.i].nom;
    if (c.k === "contre") { d = appliquer(st, { bud: -c.prix }, lib, d); o.force = Math.max(0, o.force - 6); o.contres++; x.contre++; }
    else if (c.k === "mobilise") { d = appliquer(st, { coh: -c.coh }, lib, d); o.force = Math.max(0, o.force - 6); o.contres++; x.mobilise++; }
    else if (c.k === "nuire") {
      d = appliquer(st, { bud: -40 }, lib, d);
      if (rnd(st) < 0.5) { o.force = arrondi(o.force / 2); x.nuireOk++; txt = "Coup réussi : des révélations font chuter " + nom + ", dont l’influence est divisée par deux."; }
      else { d = appliquer(st, ev.attaque, lib, d); d = appliquer(st, { pop: -2 }, lib, d); o.force = Math.min(100, o.force + 3); x.nuireKo++;
        txt = "L’opération est éventée : " + nom + " crie au complot et son attaque porte en plein."; }
    }
    else { d = appliquer(st, ev.attaque, lib, d); o.force = Math.min(100, o.force + 6); x.subi++; }
    if (o.force < SEUIL_OPP) { o.actif = false; x.elimines++; extra.push("🏳️ " + nom + " renonce : plus aucune attaque jusqu’à la prochaine élection."); }
    else extra.push("Influence de " + nom + " : " + Math.round(o.force) + "/100 (" + humeurOpp(o.force) + ").");
    return { d: d, txt: txt, extra: extra };
  }
  // Événements spéciaux, incidents de chantier, décisions historiques
  function choisirSpe(st, i) {
    var ev = st.evPerso, c = ev.choix[i], lib = ev.titre + " : " + c.t, x = stats(st), extra = [], txt = c.r, rate = false;
    var d = appliquerTout(st, c.e, lib, null, { cid: ev.cid });
    if (c.risque && rnd(st) < c.risque.p) { d = appliquerTout(st, c.risque.e, lib + " (imprévu)", d, { cid: ev.cid }); txt = c.risque.r; rate = true; }
    if (c.grandJour) {
      var infra = (st.bat.musee || 0) + (st.bat.museeMondial ? 2 : 0) + Math.min(3, nbTransports(st)) + (st.bat.jo ? 2 : 0) + (st.bat.seine ? 1 : 0);
      var q = bonheur(st) / 20 + infra * 0.5 + c.grandJour + rnd(st) * 3; x.grandJour++;
      if (q >= 6.5) { x.grandJourOk++; d = appliquerTout(st, { bud: 70 * c.grandJour, rec: { m: 4 * c.grandJour, n: 8 }, pop: 2 * c.grandJour, eco: 3 * c.grandJour, objet: "statue" }, lib, d);
        txt = c.grandJour >= 3 ? "Un triomphe planétaire ! Paris rayonne, les touristes affluent, les recettes explosent." : "Une belle réussite, à la mesure de Paris."; leon(st, "genieOk"); }
      else { d = appliquerTout(st, { pop: -2 * c.grandJour, chaos: 10 }, lib, d); rate = true;
        txt = c.grandJour >= 3 ? "Fiasco mondial : files d’attente géantes, transports saturés, fiasco en direct à la télévision." : "Une version modeste… un peu trop modeste. Les médias se moquent."; leon(st, "genieKo"); }
    }
    if (c.absurde) { st.chaos = Math.min(100, st.chaos + 8); x.absurdes++; if (!c.grandJour) leon(st, "absurde"); }
    if (c.genie) { if (rate) { x.genieKo++; leon(st, "genieKo"); } else { x.genieOk++; leon(st, "genieOk"); } }
    if (ev.kind === "historique") x.historiques = (x.historiques || 0) + 1;
    if (ev.kind === "historique") extra.push("📜 Décision historique : elle pèsera sur tout le reste de la partie.");
    var neg = (d.pop || 0) + (d.bon || 0) < 0 || (d.bud || 0) < -100;
    x.negSerie = neg ? x.negSerie + 1 : 0; x.negSerieMax = Math.max(x.negSerieMax, x.negSerie);
    return { d: d, txt: txt, extra: extra };
  }

  // ---------- Décision sur le dossier du trimestre ----------
  // ---------- Casino des dossiers : chaque réponse se joue au blackjack ou à la roulette, sauf la réponse « rien » ----------
  // Valeur d'un choix : popularité, bonheur, piliers de la ville, argent (immédiat et récurrent)
  function valeurChoix(c) {
    var e = c.e || {}, v = (e.pop || 0) + (e.bon || 0) + (e.bud || 0) / 40;
    Object.keys(e.dom || {}).forEach(function (k) { v += e.dom[k] * 1.5; });
    if (e.rec) v += e.rec.m * Math.min(e.rec.n, 104) / 13 / 40;
    return v;
  }
  // Réponse libre (sans casino) : « Rien », « Ne rien faire », « Refuser », « Laisser faire »… ; à défaut, la plus faible
  var PASSIF = /^(rien|ne rien|ne pas |refuser|laisser|attendre|statu quo)/i;
  function choixLibre(ev) {
    var l = []; ev.choix.forEach(function (c, i) { if (PASSIF.test(c.t)) l.push(i); });
    if (l.length) return l;
    var v = ev.choix.map(valeurChoix), m = 0; v.forEach(function (x, i) { if (x < v[m]) m = i; });
    return [m];
  }
  // Index du meilleur choix du dossier en cours (null s'il n'y en a pas de nettement meilleur)
  function meilleurChoix(st, base) {
    if (st.phase !== "evenement" || st.evPerso) return null;
    var ev = base.parId[st.evenement]; if (!ev || !ev.choix || ev.choix.length < 2) return null;
    var v = ev.choix.map(valeurChoix), m = 0;
    v.forEach(function (x, i) { if (x > v[m]) m = i; });
    var deux = v.slice().sort(function (a, b) { return b - a; })[1];
    return v[m] > 0 && v[m] - deux >= 0.5 ? m : null;
  }
  // Prépare le casino du dossier (une fois par dossier) : un jeu tiré au sort pour chaque réponse qui n'est pas libre
  function preparerMiniJeu(st0, base) {
    if (st0.mj && st0.mj.t === st0.t && st0.mj.ev === st0.evenement) return st0;
    var ev = st0.phase === "evenement" && !st0.evPerso ? base.parId[st0.evenement] : null;
    if (!ev || !ev.choix || ev.choix.length < 2) return st0.mj ? Object.assign(copie(st0), { mj: null }) : st0;
    var st = copie(st0), libres = choixLibre(ev);
    st.mj = { t: st.t, ev: st.evenement, best: meilleurChoix(st0, base), jeux: ev.choix.map(function (c, i) {
      if (libres.indexOf(i) >= 0) return null;
      var r = rnd(st); return { jeu: r < 1 / 3 ? "bj" : r < 2 / 3 ? "roulette" : "poker", etat: "a_jouer", bj: null, roue: null, pk: null };
    }) };
    return st;
  }
  function jeuDe(st, i) { var m = st.mj; return m && m.t === st.t && m.ev === st.evenement && m.jeux ? m.jeux[i] || null : null; }
  function finMiniJeu(st, j, gagne) {
    j.etat = gagne ? "gagne" : "perdu";
    var x = stats(st); x.miniJeux = (x.miniJeux || 0) + 1; if (gagne) x.miniJeuxOk = (x.miniJeuxOk || 0) + 1;
    if (gagne) j.xp = gagnerXP(st, "Mini-jeux des dossiers", XP.miniJeu, XP.miniJeuMax);
  }
  // Blackjack sans mise : battre le croupier (qui tire jusqu'à 17). Égalité : on redistribue.
  function mjDonne(st, j) {
    var deck = []; for (var i = 0; i < 52; i++) deck.push(i);
    for (var k2 = deck.length - 1; k2 > 0; k2--) { var k = Math.floor(rnd(st) * (k2 + 1)), t = deck[k2]; deck[k2] = deck[k]; deck[k] = t; }
    j.bj = { deck: deck, j: [deck.pop(), deck.pop()], c: [deck.pop(), deck.pop()], fini: false, res: null };
    if (valeurMain(j.bj.j) === 21 || valeurMain(j.bj.c) === 21) mjCroupier(st, j);
  }
  function mjCroupier(st, j) {
    var b = j.bj;
    if (valeurMain(b.j) <= 21) while (valeurMain(b.c) < 17) b.c.push(b.deck.pop());
    var vj = valeurMain(b.j), vc = valeurMain(b.c), nat = vj === 21 && b.j.length === 2, natC = vc === 21 && b.c.length === 2;
    b.fini = true;
    if (vj > 21) b.res = "perdu"; else if (nat && !natC) b.res = "gagne"; else if (natC && !nat) b.res = "perdu";
    else if (vc > 21 || vj > vc) b.res = "gagne"; else if (vj === vc) b.res = "egal"; else b.res = "perdu";
    if (b.res !== "egal") finMiniJeu(st, j, b.res === "gagne");
  }
  function mjBlackjack(st0, i, action) {
    var j0 = jeuDe(st0, i); if (!j0 || j0.jeu !== "bj" || j0.etat !== "a_jouer" || st0.phase !== "evenement") return st0;
    var st = copie(st0), j = st.mj.jeux[i], b = j.bj;
    if (action === "donner") { if (!b || (b.fini && b.res === "egal")) { mjDonne(st, j); return st; } return st0; }
    if (!b || b.fini) return st0;
    if (action === "tirer") { b.j.push(b.deck.pop()); if (valeurMain(b.j) >= 21) mjCroupier(st, j); }
    else if (action === "rester") mjCroupier(st, j);
    else return st0;
    return st;
  }
  // Roulette : rouge ou noir (le zéro fait perdre)
  function mjRoulette(st0, i, pari) {
    var j0 = jeuDe(st0, i); if (!j0 || j0.jeu !== "roulette" || j0.etat !== "a_jouer" || st0.phase !== "evenement" || (pari !== "rouge" && pari !== "noir")) return st0;
    var st = copie(st0), j = st.mj.jeux[i], n = Math.floor(rnd(st) * 37), rouge = ROUGES.indexOf(n) >= 0;
    j.roue = { n: n, rouge: rouge, pari: pari };
    finMiniJeu(st, j, n > 0 && (pari === "rouge") === rouge);
    return st;
  }
  // Poker contre le bot : 100 jetons chacun, blindes 10/20, jusqu'à ce qu'un des deux n'ait plus rien.
  // Le joueur est au siège 0 ; après son action, le bot joue jusqu'à ce que ce soit de nouveau au joueur ou que la main soit finie.
  function mjPoker(st0, i, action, montant) {
    var j0 = jeuDe(st0, i), Pk = poker(); if (!j0 || j0.jeu !== "poker" || j0.etat !== "a_jouer" || st0.phase !== "evenement" || !Pk) return st0;
    var st = copie(st0), j = st.mj.jeux[i], t = j.pk;
    if (action === "commencer") { if (t) return st0; t = Pk.nouvelleTable(Math.floor(rnd(st) * 2147483647)); }
    else if (!t || t.fini) return st0;
    else if (action === "donner") { if (!t.main.fini) return st0; t = Pk.donner(t); }
    else { var t2 = Pk.agir(t, 0, action, montant); if (t2 === t) return st0; t = t2; }
    for (var k = 0; k < 20 && !t.fini && !t.main.fini && t.main.aQui === 1; k++) t = Pk.botAgir(t, 1);
    j.pk = t;
    if (t.fini) finMiniJeu(st, j, t.gagnant === 0);
    return st;
  }
  // Poker contre un autre maire : la table vit en ligne ; la partie retient où la retrouver, puis son résultat
  function mjPokerLigne(st0, i, ligne) {
    var j0 = jeuDe(st0, i); if (!j0 || j0.jeu !== "poker" || j0.etat !== "a_jouer" || j0.pk || j0.ligne || !ligne || !ligne.id) return st0;
    var st = copie(st0); st.mj.jeux[i].ligne = { id: String(ligne.id), siege: ligne.siege ? 1 : 0, nom: ligne.nom || "" }; return st;
  }
  function mjPokerResultat(st0, i, gagne) {
    var j0 = jeuDe(st0, i); if (!j0 || !j0.ligne || j0.etat !== "a_jouer") return st0;
    var st = copie(st0), j = st.mj.jeux[i]; finMiniJeu(st, j, !!gagne); if (gagne) stats(st).pokerHumain = (stats(st).pokerHumain || 0) + 1; return st;
  }
  function choisir(st0, base, i) {
    if (st0.phase !== "evenement") return st0;
    // Une réponse jouée au casino ne se prend qu'après avoir gagné sa partie
    var jc = jeuDe(st0, i); if (jc && jc.etat !== "gagne") return st0;
    if (st0.evPerso) {
      if (!st0.evPerso.choix[i]) return st0;
      var so = copie(st0), kind = so.evPerso.kind || "opposition", ro = kind === "opposition" ? choisirOpposition(so, i) : choisirSpe(so, i), co = so.evPerso.choix[i];
      so.historique.push({ t: so.t, titre: so.evPerso.titre, choix: co.t, d: ro.d, sp: so.special || kind, c: kind });
      so.resultat = { i: i, d: ro.d, extra: ro.extra, txt: ro.txt };
      so.phase = "gestion"; so.resultatVu = false;
      if (!financement(so)) faillite(so); suivre(so); verifierCombos(so); suivreMission(so);
      return so;
    }
    var ev = base.parId[st0.evenement]; if (!ev || !ev.choix[i]) return st0;
    var st = copie(st0), c = ev.choix[i], lib = ev.titre + " : " + c.t;
    var e = varier(st, c.e), extra = [];
    // Dossiers ordinaires : moins fréquents (tous les 2 ou 3 trimestres), donc plus marquants
    if (e && !st.special) { ["pop", "bon", "bud"].forEach(function (k) { if (e[k]) e[k] = arrondi(e[k] * P.fort); }); if (e.dom) Object.keys(e.dom).forEach(function (k) { e.dom[k] = arrondi(e.dom[k] * P.fort); }); if (e.rec) e.rec = { m: e.rec.m * P.fort, n: e.rec.n }; }
    // Pompiers, centre de crise, forêt urbaine… : une partie des dégâts d'une catastrophe est évitée
    var prot = st.special === "catastrophe" ? protection(st) : 0;
    if (st.special === "catastrophe" && st.assurance) { prot = Math.min(0.75, prot + 0.5); st.assurance = 0; extra.push("🛡️ Ton assurance catastrophe a joué : elle est maintenant utilisée."); }
    if (prot && e) {
      ["pop", "bon", "bud"].forEach(function (k) { if (e[k] < 0) e[k] = arrondi(e[k] * (1 - prot)); });
      if (e.dom) Object.keys(e.dom).forEach(function (k) { if (e.dom[k] < 0) e.dom[k] = arrondi(e.dom[k] * (1 - prot)); });
      extra.push("🚒 Tes équipements de secours ont évité " + Math.round(prot * 100) + " % des dégâts.");
    }
    var d = appliquer(st, e, lib);
    var a = st.meca.ligne ? (c.ali && c.ali[LETTRE[st.ligne]]) || 0 : 0;
    if (a) {
      var urgence = ev.cat === "crise" || ev.cat === "catastrophe";
      if (a <= -3 && !urgence) stats(st).trahisons++;
      d = appliquer(st, { coh: arrondi(a > 0 ? a * P.aliPlus : a * (urgence ? 0.8 : P.aliMoins) * (bonusMaire(st).aliDoux || 1)) }, lib, d);
      if (a <= -3 && !urgence && rnd(st) < 0.6) { d = appliquer(st, { pop: -2 }, lib, d); extra.push("Une partie de ton électorat se sent trahie."); }
      if (a >= 2) { var gl = gagnerXP(st, "Décisions fidèles à ta ligne", XP.ligne, XP.ligneMax); if (gl) extra.push("🧭 Décision fidèle à ta ligne : +" + gl + " XP."); }
    }
    var tenues = [];
    if (e && e.dom) Object.keys(e.dom).forEach(function (k) {
      if (st.ambitions.indexOf(VERS[k]) >= 0 && e.dom[k] > 0 && tenues.indexOf(VERS[k]) < 0) { tenues.push(VERS[k]); d = appliquer(st, { pop: 1 }, lib, d); extra.push("Les Parisiens voient que tu tiens ta promesse sur « " + PILIERS[VERS[k]] + " »."); }
    });
    if (tenues.length) { var gp = gagnerXP(st, "Mesures pour tes promesses", XP.promesse * tenues.length, XP.promesseMax); if (gp) extra.push("🎯 Engagement tenu : +" + gp + " XP."); }
    if (e && e.rec) st.recurrents.push({ id: st.nid++, m: e.rec.m * 3, n: Math.max(1, Math.round(e.rec.n / 13)), l: lib });
    var surprise = null;
    if (c.alea && rnd(st) * 100 < c.alea.p) { d = appliquer(st, varier(st, c.alea.e), lib + " (imprévu)", d); surprise = c.alea.txt; }
    (c.dif || []).forEach(function (y) { st.prevus.push({ id: st.nid++, t: st.t + Math.max(1, Math.round(y.n / 13)), e: varier(st, y.e), l: lib + " (effet différé)", txt: y.txt }); });
    if (c.suite) st.suites.push({ id: c.suite.id, t: st.t + Math.max(1, Math.round(c.suite.n / 13)) });
    if (c.flag) st.flags[c.flag] = st.t;
    if (rnd(st) < P.retombees) {
      var sens = (e && (e.pop || 0) + (e.bon || 0)) < 0 ? -1 : 1; if (rnd(st) < 0.35) sens = -sens;
      st.prevus.push({ id: st.nid++, t: st.t + 1 + Math.floor(rnd(st) * 2), e: { pop: sens * (1 + Math.floor(rnd(st) * 2)), bon: sens * (1 + Math.floor(rnd(st) * 2)) },
        l: lib + " (retombées)", txt: (sens > 0 ? "Bonne surprise : ta décision « " : "Retour de bâton : ta décision « ") + c.t + " » fait encore parler d’elle." });
      stats(st).retombees++;
    }
    var x = stats(st); x.cats[ev.cat] = (x.cats[ev.cat] || 0) + 1; x.dossiers++;
    if (ev.cat === "catastrophe" || ev.cat === "crise") x.crisesOk++;
    if (e && e.bud < 0) x.depenses += -e.bud;
    var neg = (d.pop || 0) + (d.bon || 0) < 0; x.negSerie = neg ? x.negSerie + 1 : 0; x.negSerieMax = Math.max(x.negSerieMax, x.negSerie);
    // Une mauvaise décision fait partir des Parisiens
    var mauvais = (d.pop || 0) + (d.bon || 0);
    if (mauvais <= -2) { var dep = bougerHab(st, Math.max(-1.2, mauvais * 0.12)); if (dep < 0) extra.push("🧳 " + Math.abs(dep).toLocaleString("fr-FR") + " Parisiens quittent la ville après cette décision."); }
    st.resultat = { i: i, d: d, surprise: surprise, extra: extra, rec: e && e.rec ? e.rec : null, dif: (c.dif || []).length };
    st.historique.push({ t: st.t, titre: ev.titre, choix: c.t, d: d, sp: st.special || "", c: ev.cat });
    if (st.historique.length > 300) st.historique.splice(0, st.historique.length - 300);
    st.phase = "gestion"; st.resultatVu = false;
    if (!financement(st)) faillite(st); suivre(st); suivreMission(st);
    return st;
  }

  // ---------- Boutique et budget ----------
  // Objectif de la partie à remplir avant de pouvoir construire (null s'il est rempli)
  // Tous les prérequis d'un bâtiment, remplis ou non : niveau, trimestres tenus, réélections, bâtiments déjà construits
  function prerequis(st, id) {
    var B = BATIMENTS[id], c = B.si || {}, l = [], re = st.mandat - 1;
    if ((B.niv || 1) > 1) l.push({ k: "niv", ok: (st.nivJ || 99) >= B.niv, txt: "Niveau " + B.niv, cur: Math.min(st.nivJ || 99, B.niv), but: B.niv });
    if (c.t) l.push({ k: "t", ok: st.t >= c.t, txt: st.t >= c.t ? c.t + " trimestres tenus" : "Tiens encore " + (c.t - st.t) + " trimestre" + (c.t - st.t > 1 ? "s" : ""), cur: Math.min(st.t, c.t), but: c.t });
    if (c.reel) l.push({ k: "reel", ok: re >= c.reel, txt: c.reel === 1 ? "Après ta 1re réélection" : "Après ta " + c.reel + "e réélection", cur: Math.min(re, c.reel), but: c.reel });
    Object.keys(c.apres || {}).forEach(function (b) {
      var n = c.apres[b], a = st.bat[b] || 0, A = BATIMENTS[b];
      l.push({ k: "apres", ok: a >= n, txt: "Construis d’abord " + (n > 1 ? n + " × " : "") + A.ico + " " + A.nom, cur: Math.min(a, n), but: n });
    });
    return l;
  }
  // Premier objectif de partie non rempli (null s'ils le sont tous)
  function objectif(st, id) {
    if (!BATIMENTS[id] || !BATIMENTS[id].si || st.sansLimite) return null;
    return prerequis(st, id).filter(function (x) { return x.k !== "niv" && !x.ok; })[0] || null;
  }
  function disponible(st, id) {
    var B = BATIMENTS[id]; if (!B) return false;
    if (st.sansLimite) return true;
    if (B.secret) return !!(st.secrets && st.secrets[id]);
    if (B.pass) return !!(st.passBats && st.passBats[id]);
    if (B.projet && !st.meca.grandsProjets) return false;
    return (st.nivJ || 99) >= (B.niv || 1) && !objectif(st, id);
  }
  function verrou(st, id) {
    var B = BATIMENTS[id];
    if (B.pass && !st.sansLimite && !(st.passBats && st.passBats[id])) return B.obtenu || "Récompense du pass de combat.";
    if (B.projet && !st.meca.grandsProjets && !st.sansLimite) return "Se débloque au niveau " + Math.max(B.niv, 6) + ".";
    if ((st.nivJ || 99) < (B.niv || 1) && !st.sansLimite) return "Se débloque au niveau " + B.niv + ".";
    var o = objectif(st, id); return o ? o.txt + "." : "";
  }
  function enChantier(st, id) { return (st.chantiers || []).some(function (c) { return c.id === id; }); }
  function peutAcheter(st, id) {
    var B = BATIMENTS[id];
    if (!B || st.phase === "fin") return "Impossible pour l’instant.";
    if (!disponible(st, id)) return verrou(st, id) || "Se débloque plus tard.";
    if (B.unique && st.bat[id]) return "Déjà réalisé.";
    if (B.enchere) return "Aux enchères uniquement.";
    if ((bonusMaire(st).interdit || []).indexOf(id) >= 0) return "Ton personnage refuse de construire ça.";
    if (enChantier(st, id)) return "Chantier en cours.";
    if (B.projet && st.chantiers.length >= 2) return "Deux chantiers à la fois, pas plus.";
    var px = B.projet ? Math.round(coutBat(st, id) * 0.3) : prix(st, id);
    if (px > st.tresor + (PLAFOND_DETTE - st.dette) * 0.5) return "Pas assez d’argent, même en empruntant.";
    return "";
  }
  function acheter(st0, id) {
    if (peutAcheter(st0, id)) return st0;
    var st = copie(st0), B = BATIMENTS[id], x = stats(st);
    if (B.projet) {
      // Projet démesuré : 30 % tout de suite, le reste par tranches pendant le chantier
      var cb = coutBat(st, id), avance = Math.round(cb * 0.3);
      mouvement(st, -avance, "Lancement du chantier : " + B.nom);
      st.chantiers.push({ id: id, reste: B.duree, du: cb - avance, ampleur: 1, susp: 0, debut: st.t });
      x.investi += cb; x.lances++;
      if (st.tresor < 0) st.incidents.push({ t: st.t + 3, cid: id, type: "rallonge" });   // lancé sans réserves : la facture reviendra
      st.historique.push({ t: st.t, titre: B.ico + " Chantier lancé : " + B.nom, choix: "Avance de " + avance + " M€, " + B.duree + " trimestres de travaux", d: { pop: 0, bon: 0, coh: 0, bud: -avance, pil: {} }, c: "achat" });
      st.pop = borne(st.pop + 1);
      if (!financement(st)) faillite(st); suivre(st);
      return st;
    }
    return construire(st, id, prix(st0, id), B.nom);
  }
  // Un bâtiment rejoint la ville (achat en boutique ou enchère remportée)
  function construire(st, id, px, libelle) {
    var B = BATIMENTS[id], x = stats(st);
    st.bat[id] = (st.bat[id] || 0) + 1;
    if (st.mandatBats) { st.mandatBats[B.cat] = (st.mandatBats[B.cat] || 0) + 1; st.mandatTypes[id] = 1; }
    mouvement(st, -px, libelle);
    x.achats++; x.bats[id] = (x.bats[id] || 0) + 1; x.investi += px;
    if (B.secret) x.secretsBatis++;
    if (B.eco) st.eco = borne(st.eco + B.eco);
    if (B.chaos) st.chaos = Math.min(100, st.chaos + B.chaos);
    var al = st.meca.ligne ? (B.ali && B.ali[LETTRE[st.ligne]]) || 0 : 0;
    if (al) st.coh = borne(st.coh + (al > 0 ? al * 0.5 : al));
    st.pop = borne(st.pop + (B.pop || Math.min(1, Math.max(0.1, px / 200))));
    if (!financement(st)) faillite(st); suivre(st);
    gagnerXP(st, "Bâtiments achetés", XP.achat, XP.achatMax);
    if (st.ambitions.some(function (k) { return (B.e[k] || 0) > 0; })) gagnerXP(st, "Bâtiments pour tes promesses", XP.batPromesse, XP.batPromesseMax);
    st.historique.push({ t: st.t, titre: B.ico + " " + B.nom, choix: "Acheté pour " + px + " M€", d: { pop: 0, bon: 0, coh: 0, bud: -px, pil: {} }, c: "achat" });
    verifierCombos(st); suivreMission(st);
    return st;
  }
  // ---------- Enchères : les bâtiments de prestige se disputent avec une ville voisine ----------
  // La ville voisine a un prix maximum secret, autour du prix moyen de vente : elle surenchérit tant qu'elle peut.
  // L'interface donne 30 secondes ; à la fin, la meilleure offre l'emporte.
  function budgetEnchere(st) { return Math.max(0, Math.floor(st.tresor + (PLAFOND_DETTE - st.dette) * 0.5)); }
  function peutEncherir(st, id) {
    var B = BATIMENTS[id];
    if (!B || !B.enchere || st.phase === "fin") return "Impossible pour l’instant.";
    if (!disponible(st, id)) return verrou(st, id) || "Se débloque plus tard.";
    if (st.bat[id]) return "Déjà à toi.";
    var cd = (st.encheresCd || {})[id] || 0;
    if (cd > st.t) return "De retour aux enchères dans " + (cd - st.t) + " trimestre" + (cd - st.t > 1 ? "s" : "") + ".";
    if (st.phase !== "gestion" || (st.enchere && !st.enchere.fini) || (st.bj && !st.bj.fini)) return "Termine d’abord ce que tu as en cours.";
    if (budgetEnchere(st) < Math.round(B.cout * 0.7)) return "Pas assez d’argent pour enchérir.";
    return "";
  }
  function ouvrirEnchere(st0, id) {
    if (peutEncherir(st0, id)) return st0;
    var st = copie(st0), B = BATIMENTS[id], moyen = B.cout, pas = Math.max(5, Math.round(moyen * 0.05 / 5) * 5);
    var e = { id: id, ville: C.VOISINES[Math.floor(rnd(st) * C.VOISINES.length)], moyen: moyen, pas: pas, j: 0,
      v: Math.round(moyen * 0.55 / 5) * 5, max: Math.round(moyen * (0.8 + rnd(st) * 0.45)), offres: [], fini: false, res: null };
    e.offres.push({ qui: "v", m: e.v });
    st.enchere = e;
    return st;
  }
  function encherir(st0, montant) {
    var e = st0.enchere; montant = Math.round(montant);
    if (!e || e.fini || montant < Math.max(e.v, e.j) + e.pas || montant > budgetEnchere(st0)) return st0;
    var st = copie(st0), x = st.enchere;
    x.j = montant; x.offres.push({ qui: "j", m: montant });
    if (montant < x.max) { var r = Math.min(x.max, montant + x.pas * (1 + Math.floor(rnd(st) * 2))); x.v = r; x.offres.push({ qui: "v", m: r }); }
    return st;
  }
  // Fin du temps (ou abandon) : la meilleure offre l'emporte ; perdu, le bâtiment revient aux enchères 4 trimestres plus tard
  function finirEnchere(st0) {
    var e = st0.enchere; if (!e || e.fini) return st0;
    var st = copie(st0), x = st.enchere, B = BATIMENTS[x.id], s = stats(st);
    x.fini = true;
    if (x.j > x.v) {
      x.res = { gagne: true, prix: x.j };
      construire(st, x.id, x.j, "Enchère remportée : " + B.nom);
      s.encheres++; if (x.j <= x.moyen) s.bonnesAffaires++;
      gagnerXP(st, "Enchères remportées", 20);
      message(st, "🔨", "Adjugé : " + B.nom, "Paris l’emporte face à " + x.ville + " pour " + x.j + " M€ (prix moyen : " + x.moyen + " M€).");
    } else {
      x.res = { gagne: false, prix: x.v };
      st.encheresCd[x.id] = st.t + 4; s.encheresPerdues++;
      message(st, "🔨", x.ville + " remporte l’enchère", B.nom + " part à " + x.ville + " pour " + x.v + " M€. Il reviendra aux enchères dans 4 trimestres.");
    }
    return st;
  }
  function fermerEnchere(st0) { if (!st0.enchere || !st0.enchere.fini) return st0; var st = copie(st0); st.enchere = null; return st; }
  // Administrateur : passer les limites (niveau, trimestres, réélections) pour tous les bâtiments
  // Récompense du pass gagnée en pleine partie : le bâtiment exclusif arrive tout de suite en boutique
  function ajouterPassBat(st, id) { if (!C.PASS_BATIMENTS[id]) return; st.passBats = st.passBats || {}; st.passBats[id] = 1; annoncer(st); }
  function limites(st0, sans) {
    var st = copie(st0); st.sansLimite = !!sans; if (sans) st.triche = true;
    marquerConnus(st);
    return st;
  }
  function duree(t) { return t < 4 ? t + " trimestre" + (t > 1 ? "s" : "") : String(Math.round(t / 4 * 10) / 10).replace(".", ",") + " ans"; }
  // Démission : la partie s'arrête tout de suite (le bilan et l'XP sont comptés comme pour une fin normale)
  function demissionner(st0) {
    if (st0.phase === "fin") return st0;
    var st = copie(st0);
    st.fin = { gagne: false, raison: { type: "demission", txt: "Tu as remis ta démission au Conseil de Paris au bout de " + duree(st.t) + "." }, t: st.t };
    st.phase = "fin"; st.evPerso = null; st.bj = null; st.offre = null;
    return st;
  }
  function regler(st0, o) {
    if (st0.phase === "fin" || !st0.meca.budget || (st0.scenario && st0.scenario.tauxBloque)) return st0;
    var st = copie(st0);
    if (o.taux != null) st.taux = Math.max(0.8, Math.min(1.3, Math.round(o.taux * 100) / 100));
    return st;
  }
  // L'interface récupère ici les découvertes (objets, secrets, combos) pour les ranger dans le profil du joueur
  function viderMontees(st0) { if (!st0.montees || !st0.montees.length) return st0; var st = copie(st0); st.montees = []; return st; }
  function ajouterXP(st0, txt, n) { var st = copie(st0); gagnerXP(st, txt, n); return st; }
  function viderDecouvertes(st0) { if (!st0.decouvertes || !st0.decouvertes.length) return st0; var st = copie(st0); st.decouvertes = []; return st; }

  // ---------- Reprise d'une sauvegarde ----------
  function reprendre(st0, base) {
    st0 = migrer(copie(st0));
    if (st0.phase !== "evenement" || st0.evPerso || base.parId[st0.evenement]) return st0;
    var st = copie(st0), ev = tirer(st, base);
    st.vus[ev.id] = st.t; st.evenement = ev.id; st.special = null;
    return st;
  }

  // ---------- Bilan, explications et récit de la partie ----------
  function scoreDefi(st) {
    if (!st.scenario) return null;
    if (st.fin && st.fin.raison.type === "faillite") return 0;
    var d = C.DEFIS_JOUR.filter(function (x) { return x.id === st.scenario.id; })[0];
    return d ? Math.max(0, d.score(st, bonheur(st))) : 0;
  }
  function bilan(st) {
    var gagnes = st.elections.filter(function (e) { return e.gagne; }).length, t = st.fin ? st.fin.t : st.t, x = stats(st);
    var score = Math.round(t * 12 + gagnes * 150 + (x.mandatsReussis || 0) * 150 + (x.objectifsOk || 0) * 40 + bonheur(st) * 2 + x.achats * 3 + x.projetsOk * 40 + (st.missionsOk || []).length * 15 + Math.max(-100, Math.min(100, (st.tresor - st.dette) / 10)));
    var poids = st.historique.filter(function (h) { return h.c !== "achat" && h.c !== "pari"; }).map(function (h) { return { t: h.t, titre: h.titre, choix: h.choix, v: h.d.pop + h.d.bon }; })
      .sort(function (a, b) { return a.v - b.v; });
    return { score: st.scenario ? scoreDefi(st) : Math.max(0, score), mandats: gagnes, t: t, annees: t / 4, bonheur: bonheur(st), pires: poids.slice(0, 5), meilleures: poids.slice(-5).reverse(),
      stats: x, objets: st.objets.slice(), combos: st.combos.slice(), recit: recit(st), style: style(st), meilleur: meilleurMandat(st) };
  }
  // Le titre qui résume ta façon de jouer (le premier qui correspond, du plus marquant au plus courant)
  function style(st) {
    var x = stats(st), gagnes = st.elections.filter(function (e) { return e.gagne; }).length, fin = st.fin ? st.fin.raison.type : null;
    var fort = PK.slice().sort(function (a, b) { return st.piliers[b] - st.piliers[a]; })[0];
    var NOMS = { logement: "Le maire du logement", transports: "Le maire des transports", cadre: "Le maire jardinier", securite: "Le shérif de Paris" };
    var l = [
      [fin === "faillite", "Le maire banqueroute", "La ville a fini sans le sou : on en parlera longtemps."],
      [(x.mandatsParfaits || 0) >= 2, "Le maire exemplaire", "Plusieurs mandats sans faute : du jamais-vu."],
      [x.projetsOk >= 3, "Le Grand Bâtisseur", "Tes chantiers démesurés ont changé la face de Paris."],
      [x.detteMax > 1000 && gagnes >= 1, "Le maire endetté mais adoré", "Des caisses vides, mais des Parisiens qui te réélisent."],
      [x.detteMax === 0 && gagnes >= 1, "Le gardien des finances", "Pas un euro emprunté de toute ta carrière."],
      [x.elimines >= 2, "Le tombeur d’opposants", "Tes adversaires ont appris à se méfier de toi."],
      [x.absurdes >= 3, "Le maire imprévisible", "Léon n’a jamais su ce que tu allais décider."],
      [x.achats >= 45, "Le maire bétonneur", "Pas un trottoir sans un nouveau bâtiment."],
      [st.piliers[fort] >= 75, NOMS[fort], "Ton pilier préféré a atteint des sommets."],
      [gagnes >= 3, "Le maire indéboulonnable", "Les Parisiens ne voulaient plus te voir partir."],
      [gagnes >= 1, "Le maire qui a tenu bon", "Au moins une réélection : pas si simple à Paris."],
      [true, "Le maire éphémère", "Un passage éclair à l’Hôtel de Ville."]];
    var r = l.filter(function (y) { return y[0]; })[0];
    return { titre: r[1], txt: r[2] };
  }
  // Le meilleur mandat : le plus d'objectifs atteints, puis le meilleur score au vote
  function meilleurMandat(st) {
    var l = st.elections.filter(function (e) { return e.gagne; }); if (!l.length) return null;
    var e = l.slice().sort(function (a, b) { return (b.nok || 0) - (a.nok || 0) || b.pct - a.pct; })[0];
    return { mandat: e.mandat, pct: e.pct, nok: e.nok || 0, nb: (e.objectifs || []).length, crise: e.crise && C.CRISES[e.crise] ? C.CRISES[e.crise] : null };
  }
  // Un résumé à raconter, construit uniquement à partir de ce qui s'est vraiment passé dans la partie
  function recit(st) {
    var x = stats(st), t = st.fin ? st.fin.t : st.t, gagnes = st.elections.filter(function (e) { return e.gagne; }).length, p = [];
    var top = Object.keys(x.bats).sort(function (a, b) { return x.bats[b] - x.bats[a]; })[0];
    p.push("Après " + t + " trimestre" + (t > 1 ? "s" : "") + " à l’Hôtel de Ville" + (gagnes ? " et " + gagnes + " réélection" + (gagnes > 1 ? "s" : "") : "") + ", ton aventure s’achève sur un bilan " + (gagnes >= 2 ? "remarquable" : gagnes ? "honorable" : "mouvementé") + ".");
    var faits = [];
    if (top && x.bats[top] >= 3) faits.push("construit " + x.bats[top] + " × « " + BATIMENTS[top].nom.toLowerCase() + " »");
    if (x.projetsOk) faits.push("inauguré " + x.projetsOk + " projet" + (x.projetsOk > 1 ? "s" : "") + " démesuré" + (x.projetsOk > 1 ? "s" : ""));
    if (x.crisesOk) faits.push("traversé " + x.crisesOk + " crise" + (x.crisesOk > 1 ? "s" : ""));
    if (x.combos) faits.push("découvert " + x.combos + " combo" + (x.combos > 1 ? "s" : "") + " de bâtiments");
    if (x.secretsBatis) faits.push("bâti " + x.secretsBatis + " bâtiment" + (x.secretsBatis > 1 ? "s" : "") + " secret" + (x.secretsBatis > 1 ? "s" : ""));
    if (x.elimines) faits.push("poussé " + x.elimines + " opposant" + (x.elimines > 1 ? "s" : "") + " à renoncer");
    if (faits.length) p.push("En chemin, tu as " + faits.slice(0, 4).join(", ").replace(/, ([^,]*)$/, " et $1") + ".");
    if (x.paris) p.push(x.pariGain > x.pariPerte ? "Monsieur Valentin se souvient encore de toi : tu lui as pris " + Math.round(x.pariGain - x.pariPerte) + " M€ au dernier pari." : "Le dernier pari a coûté " + Math.round(x.pariPerte - x.pariGain) + " M€ à la ville. La maison gagne toujours.");
    if (x.pigeons >= 2) p.push("Les pigeons de Paris te doivent beaucoup.");
    if (x.absurdes >= 3) p.push("Léon a refusé d’inscrire " + x.absurdes + " de tes décisions au compte rendu officiel.");
    if (x.legendaires) p.push("Tu as vécu " + x.legendaires + " événement" + (x.legendaires > 1 ? "s" : "") + " légendaire" + (x.legendaires > 1 ? "s" : "") + ".");
    if (st.fin) {
      var r = st.fin.raison.type;
      p.push(r === "election" ? (st.dette > 600 ? "Malgré ces résultats, la dette a fragilisé ta dernière campagne." : "Mais les Parisiens ont fini par vouloir changer de maire.") :
        r === "faillite" ? "Hélas, la ville a fait faillite avec " + Math.round(st.dette) + " M€ de dette." :
        r === "demission" ? "Tu as préféré rendre ton écharpe avant la fin." : r === "retraite" ? "Tu as choisi de partir au sommet, sous les applaudissements." : "Défi terminé : il ne reste plus qu’à comparer ton score.");
    }
    return p.join(" ");
  }
  function analyse(st) {
    if (!st.fin || st.fin.raison.type === "demission" || st.fin.raison.type === "defi" || st.fin.raison.type === "retraite") return null;
    if (st.fin.raison.type === "election") {
      var el = st.elections[st.elections.length - 1], o = opposant(st), raisons = [];
      if (st.pop < 50) raisons.push("ta popularité (" + Math.round(st.pop) + ") était trop basse");
      if (bonheur(st) < 50) raisons.push("les Parisiens n’étaient pas assez heureux (" + Math.round(bonheur(st)) + ")");
      if (st.ambitions.length && promessesTenues(st).length < 2) raisons.push("tes promesses n’ont pas toutes été tenues");
      if (o && o.actif && o.force >= 55) raisons.push(o.nom + " était très influent (" + Math.round(o.force) + "/100)");
      if (st.dette > 600) raisons.push("la dette de la ville inquiétait");
      var faible = PK.slice().sort(function (p, q) { return st.piliers[p] - st.piliers[q]; })[0];
      return { phrase: "Battu avec " + String(el.pct).replace(".", ",") + " % des voix : " + (raisons.length ? raisons.join(", ") : "il t’a manqué un petit élan") + ".",
        conseil: "Surveille le sondage en haut de l’écran : s’il passe sous 50 %, achète des bâtiments pour ton pilier le plus faible (" + ICO[faible] + " " + PILIERS[faible].toLowerCase() + ") avant l’élection." };
    }
    return { phrase: "La ville a fait faillite au bout de " + duree(st.t) + " avec " + Math.round(st.dette) + " M€ de dette.",
      conseil: entretien(st) > 60 ? "L’entretien de tes bâtiments (" + Math.round(entretien(st)) + " M€ par trimestre) pèse lourd : achète aussi ce qui rapporte (marchés, musées)." :
        st.taux < 1 ? "Baisser les impôts coûte cher : remonte-les un peu quand les caisses se vident." :
        "Regarde le solde du trimestre sous ta trésorerie : s’il est négatif plusieurs fois de suite, arrête d’acheter un moment." };
  }
  function evenementCourant(st, base) { return st.evPerso || (st.evenement ? base.parId[st.evenement] : null); }

  // ---------- Base d'événements ----------
  function indexer(liste) {
    var parId = {}, valides = liste.filter(function (ev) { return ev && ev.id; }), rejets = [], encore = true;
    while (encore) {
      encore = false; parId = {};
      valides.forEach(function (ev) { parId[ev.id] = ev; });
      valides = valides.filter(function (ev) { var e = valider(ev, parId); if (e.length) { rejets.push({ id: ev.id, err: e }); encore = true; return false; } return true; });
    }
    var p = {}; valides.forEach(function (ev) { p[ev.id] = ev; });
    return { liste: valides, parId: p, rejets: rejets };
  }

  var API = { MANDAT: MANDAT, PLAFOND_DETTE: PLAFOND_DETTE, TAUX: TAUX, P: P, NIVEAUX: NIVEAUX, PILIERS: PILIERS, ICO: ICO, DOMAINES: DOMAINES,
    MECANIQUES: MECANIQUES, EXTRAS: EXTRAS, mecaniques: mecaniques, BATIMENTS: BATIMENTS, OPPOSANTS: OPPOSANTS, SEUIL_OPP: SEUIL_OPP, LIGNES: LIGNES, CATS: CATS,
    FAMILLE: FAMILLE, SPECIAUX: SPECIAUX, C: C,
    nouvellePartie: nouvellePartie, migrer: migrer, debutTour: debutTour, continuer: continuer, choisir: choisir, acheter: acheter, peutAcheter: peutAcheter,
    disponible: disponible, enChantier: enChantier, prix: prix, regler: regler, demissionner: demissionner, duree: duree, reprendre: reprendre, bilan: bilan, analyse: analyse, recit: recit,
    valider: valider, indexer: indexer, engagements: engagements, evenementCourant: evenementCourant, stats: stats, opposant: opposant, humeurOpp: humeurOpp, bonheur: bonheur,
    cible: cible, recettes: recettes, depenses: depenses, entretien: entretien, solde: solde, sondage: sondage, trimMandat: trimMandat,
    prochaineElection: prochaineElection, promessesTenues: promessesTenues, combosActifs: combosActifs, lireMessages: lireMessages, viderDecouvertes: viderDecouvertes,
    pariMise: pariMise, refuserPari: refuserPari, bjCommencer: bjCommencer, bjTirer: bjTirer, bjRester: bjRester, bjDoubler: bjDoubler, valeurMain: valeurMain,
    roulette: roulette, HAB0: HAB0, facteurHab: facteurHab, meilleurChoix: meilleurChoix, valeurChoix: valeurChoix, choixLibre: choixLibre, jeuDe: jeuDe, mjPoker: mjPoker, mjPokerLigne: mjPokerLigne, mjPokerResultat: mjPokerResultat, preparerMiniJeu: preparerMiniJeu, mjBlackjack: mjBlackjack, mjRoulette: mjRoulette, offresFinancement: offresFinancement, financer: financer, chantierTranches: chantierTranches, scoreDefi: scoreDefi,
    palier: palier, PALIERS: PALIERS, RAYONS: RAYONS, gainAchat: gainAchat, coutBat: coutBat, objectifs: objectifs, objectifsOk: objectifsOk, retraite: retraite, criseEnCours: criseEnCours, bonusMaire: bonusMaire, objectif: objectif, prerequis: prerequis, verrou: verrou, atout: atout, interets: interets, protection: protection,
    ajouterPassBat: ajouterPassBat, voirCoffre: voirCoffre, planVille: planVille, budgetEnchere: budgetEnchere, peutEncherir: peutEncherir, ouvrirEnchere: ouvrirEnchere, encherir: encherir, finirEnchere: finirEnchere, fermerEnchere: fermerEnchere, limites: limites,
    NIV_MAX: NIV_MAX, XP: XP, xpPour: xpPour, niveauXP: niveauXP, gagnerXP: gagnerXP, ajouterXP: ajouterXP, viderMontees: viderMontees, EN_COURS: EN_COURS };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Maire = API;
})(this);
