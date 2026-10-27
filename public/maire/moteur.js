// Maire de Paris : moteur du jeu (mode « tycoon »), sans interface, utilisable dans le navigateur et dans Node pour les tests.
// Paris est découpé en 20 arrondissements. Chaque clic fait avancer d'un mois : l'argent rentre et sort, les quartiers
// évoluent, un dossier arrive souvent sur ton bureau, et tu construis où tu veux. Tous les 6 ans, une élection :
// la partie continue tant que tu es réélu (ou jusqu'à la faillite).
// L'état de partie est un objet simple, sauvegardable tel quel ; chaque étape produit un nouvel état à partir du précédent,
// si bien que recharger la page ne rejoue jamais un effet déjà appliqué.
(function (root) {
  "use strict";

  var MANDAT = 72, SIEGES = 163, MAJORITE = 82;          // 6 ans par mandat, sièges du Conseil de Paris
  var PLAFOND_DETTE = 2500, TAUX = 0.004;                 // emprunt autorisé (M€) et intérêts par mois
  var DEPART = { pop: 58, coh: 70 };

  // Réglages d'équilibrage (vérifiés par tools/maire/test-moteur.mjs)
  var P = {
    impot: 0.36, fonct: 0.322, budProprete: 30, budSecurite: 25,       // M€ par mois (impôts et dépenses par millier d'habitants)
    domVit: 0.12, usure: 0.09, plancher: 15, voisins: 0.35, rendement: 0.7, evtBase: 0.4,
    croissance: 0.006, attrait: 45, popVit: 0.08, usurePop: 0.16, detteImpop: 250, humeurVit: 0.85,
    aliPlus: 0.8, aliMoins: 1.6, ambMult: 1.5, ambSeuil: 55, dossier: 0.8, retombees: 0.16, usureMandat: 3
  };

  // ---------- Les 20 arrondissements ----------
  // Population en milliers d'habitants et état de départ des 8 domaines (sécurité, propreté, logement, transports,
  // écologie, pouvoir d'achat, économie, services publics)
  var ARR = [
    [16, [55, 55, 35, 75, 45, 40, 70, 55]], [21, [55, 50, 35, 70, 40, 40, 70, 50]], [34, [55, 55, 40, 70, 45, 40, 60, 55]],
    [28, [60, 60, 35, 70, 50, 40, 60, 55]], [58, [65, 60, 35, 65, 55, 40, 55, 60]], [40, [70, 65, 30, 65, 55, 35, 60, 60]],
    [50, [75, 70, 30, 60, 60, 35, 60, 60]], [36, [65, 65, 35, 70, 45, 35, 75, 55]], [59, [55, 55, 40, 70, 40, 40, 65, 55]],
    [86, [40, 40, 45, 70, 40, 50, 55, 50]], [144, [50, 45, 45, 65, 45, 50, 55, 55]], [140, [55, 55, 50, 60, 60, 50, 50, 55]],
    [178, [50, 50, 55, 60, 50, 55, 50, 55]], [134, [60, 55, 45, 60, 55, 45, 50, 60]], [229, [60, 60, 45, 55, 50, 45, 50, 60]],
    [162, [70, 65, 35, 50, 65, 35, 50, 55]], [164, [55, 55, 45, 55, 50, 45, 55, 55]], [190, [35, 35, 50, 55, 40, 55, 45, 45]],
    [180, [40, 40, 55, 50, 50, 55, 40, 45]], [190, [40, 40, 50, 50, 45, 55, 40, 50]]
  ];
  var VOISINS = [[2, 3, 4, 6, 7, 8], [1, 3, 9, 10], [1, 2, 4, 10, 11], [1, 3, 5, 11, 12], [4, 6, 12, 13, 14], [1, 5, 7, 14, 15],
    [1, 6, 8, 15, 16], [1, 7, 9, 16, 17], [2, 8, 10, 17, 18], [2, 3, 9, 11, 18, 19], [3, 4, 10, 12, 19, 20], [4, 5, 11, 13, 20],
    [5, 12, 14], [5, 6, 13, 15], [6, 7, 14, 16], [7, 8, 15, 17], [8, 9, 16, 18], [9, 10, 17, 19], [10, 11, 18, 20], [11, 12, 19]];
  // Position sur la carte simplifiée (colonne, ligne) : une grille de 5 colonnes qui suit à peu près la géographie
  var GRILLE = [[1, 2], [2, 2], [3, 2], [2, 3], [2, 4], [1, 3], [0, 2], [1, 1], [2, 1], [3, 1], [4, 2], [3, 3],
    [3, 4], [1, 4], [0, 3], [0, 1], [1, 0], [2, 0], [3, 0], [4, 1]];

  var DOMAINES = {
    securite: "Sécurité", proprete: "Propreté", logement: "Logement", transports: "Transports",
    ecologie: "Écologie", achat: "Pouvoir d’achat", economie: "Économie", services: "Services publics"
  };
  var DK = Object.keys(DOMAINES);

  // ---------- Bâtiments ----------
  // cout : prix de construction · ent : entretien par mois · rev : recette par mois · e : effets sur les domaines de l'arrondissement
  // (et un peu sur les voisins) · cap : milliers d'habitants en plus · ali : réaction de chaque ligne politique · max : par arrondissement
  var BATIMENTS = {
    logements: { nom: "Logements sociaux", ico: "🏢", cout: 60, ent: 1.5, e: { logement: 6, achat: 2 }, cap: 8, ali: { g: 2, c: 0, d: -1, e: 1 }, max: 4 },
    creche: { nom: "Crèche", ico: "🧸", cout: 15, ent: 0.8, e: { services: 4, achat: 1 }, ali: { g: 1, c: 1, d: 0, e: 1 }, max: 3 },
    ecole: { nom: "École", ico: "🏫", cout: 30, ent: 1.2, e: { services: 6 }, cap: 1, ali: { g: 1, c: 1, d: 0, e: 0 }, max: 3 },
    sante: { nom: "Centre de santé", ico: "🩺", cout: 35, ent: 1.5, e: { services: 6, achat: 1 }, ali: { g: 2, c: 1, d: 0, e: 0 }, max: 2 },
    parc: { nom: "Parc", ico: "🌳", cout: 20, ent: 0.5, e: { ecologie: 6, logement: 1 }, ali: { g: 0, c: 1, d: 0, e: 2 }, max: 3 },
    velo: { nom: "Pistes cyclables", ico: "🚲", cout: 12, ent: 0.2, e: { transports: 3, ecologie: 3 }, ali: { g: 1, c: 0, d: -1, e: 2 }, max: 3 },
    tram: { nom: "Ligne de tramway", ico: "🚋", cout: 120, ent: 2, e: { transports: 10, ecologie: 3, economie: 1 }, ali: { g: 1, c: 1, d: 0, e: 2 }, max: 1, an: 2 },
    metro: { nom: "Station de métro", ico: "🚇", cout: 300, ent: 3, e: { transports: 15, economie: 4, logement: -1 }, cap: 3, ali: { g: 1, c: 2, d: 1, e: 1 }, max: 1, an: 4 },
    police: { nom: "Commissariat", ico: "🚓", cout: 40, ent: 2, e: { securite: 8 }, ali: { g: -1, c: 1, d: 2, e: 0 }, max: 2 },
    cameras: { nom: "Caméras de surveillance", ico: "📹", cout: 10, ent: 0.3, e: { securite: 3 }, ali: { g: -2, c: 0, d: 2, e: -1 }, max: 3 },
    proprete: { nom: "Centre de propreté", ico: "🧹", cout: 25, ent: 1.5, e: { proprete: 8 }, ali: { g: 1, c: 1, d: 1, e: 1 }, max: 2 },
    marche: { nom: "Marché couvert", ico: "🧺", cout: 25, ent: 0.5, rev: 0.8, e: { achat: 5, economie: 2 }, ali: { g: 1, c: 1, d: 1, e: 1 }, max: 2 },
    pepiniere: { nom: "Pépinière d’entreprises", ico: "💼", cout: 50, ent: 1, rev: 3, e: { economie: 8 }, ali: { g: 0, c: 2, d: 2, e: 0 }, max: 2 },
    culture: { nom: "Salle de spectacle", ico: "🎭", cout: 60, ent: 1, rev: 2, e: { economie: 3, services: 2 }, ali: { g: 1, c: 1, d: 0, e: 0 }, max: 2 },
    piscine: { nom: "Piscine", ico: "🏊", cout: 45, ent: 2, e: { services: 4, ecologie: 1 }, ali: { g: 1, c: 1, d: 0, e: 0 }, max: 1 },
    bureaux: { nom: "Tour de bureaux (privée)", ico: "🏙️", cout: -60, ent: 0, rev: 4, e: { economie: 7, ecologie: -4, logement: -2 }, ali: { g: -2, c: 1, d: 2, e: -3 }, max: 1, an: 2 }
  };

  // ---------- Opposants (personnages fictifs) : un nouveau tirage à chaque mandat, une attaque tous les 6 mois ----------
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
  var FORCE_OPP = { facile: [25, 60], moyen: [35, 75], difficile: [50, 90] };
  var ATTAQUES = [
    { titre: "publie une tribune assassine", desc: "Dans un grand quotidien, {nom} démolit ta gestion point par point.", cible: "pop" },
    { titre: "mobilise ses soutiens dans la rue", desc: "{nom} appelle à manifester contre ta politique ; les cortèges grossissent.", cible: "bon" },
    { titre: "dépose une motion de défiance", desc: "Au Conseil de Paris, {nom} tente de retourner tes propres élus contre toi.", cible: "coh" },
    { titre: "enchaîne les plateaux télé", desc: "Toute la semaine, {nom} occupe les écrans pour dénoncer tes choix.", cible: "pop" },
    { titre: "lance une pétition contre ton projet phare", desc: "La pétition de {nom} dépasse les 100 000 signatures en trois jours.", cible: "bon" },
    { titre: "débauche un de tes adjoints", desc: "{nom} convainc un de tes proches de claquer la porte avec fracas.", cible: "coh" },
    { titre: "saisit la justice sur un marché public", desc: "{nom} accuse la mairie de favoritisme et alerte la presse.", cible: "pop" },
    { titre: "organise un grand meeting", desc: "Salle comble pour {nom}, qui se pose en recours face à ton échec.", cible: "pop" },
    { titre: "révèle un rapport embarrassant", desc: "{nom} publie un rapport interne qui pointe les retards de tes chantiers.", cible: "bon" }
  ];
  var SEUIL_OPP = 15;   // sous cette influence, l'opposant renonce jusqu'à la prochaine élection

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
  var SPECIAUX = { catastrophe: "Catastrophe", chance: "Coup de chance" };
  var CAT_DOM = { securite: "securite", proprete: "proprete", logement: "logement", transports: "transports",
    ecologie: "ecologie", economie: "economie", services: "services", finances: "achat", quotidien: "achat" };
  var COND = ["popMin", "popMax", "bonMin", "bonMax", "cohMin", "cohMax", "tresorMin", "tresorMax", "detteMin",
    "apres", "avant", "ligne", "amb", "flag", "sansFlag"];

  // ---------- Niveaux de difficulté (le niveau « difficile » s'affiche « Réaliste ») ----------
  var NIVEAUX = {
    facile: { nom: "Facile", txt: "Caisses pleines, impôts plus rentables, peu de catastrophes.",
      tresor: 1500, recettes: 1.04, cata: 0.025, elec: 0, usure: 0.055 },
    moyen: { nom: "Moyen", txt: "L’équilibre classique : chaque euro compte, chaque élection se prépare.",
      tresor: 1000, recettes: 1, cata: 0.04, elec: 0, usure: P.usure },
    difficile: { nom: "Réaliste", txt: "Caisses presque vides, Parisiens exigeants, catastrophes fréquentes.",
      tresor: 500, recettes: 0.96, cata: 0.06, elec: -2, usure: 0.1 }
  };
  function niv(st) { return NIVEAUX[st && st.niveau] || NIVEAUX.moyen; }

  // ---------- Hasard reproductible (sauvegardé dans l'état) ----------
  function rnd(st) {
    st.rng = (st.rng + 0x6D2B79F5) | 0;
    var t = Math.imul(st.rng ^ (st.rng >>> 15), 1 | st.rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // Second générateur, réservé au tirage des dossiers (défi du jour : mêmes dossiers pour tous tant que les conditions sont les mêmes)
  function rndT(st) { var o = { rng: st.rngT }, r = rnd(o); st.rngT = o.rng; return r; }
  function copie(o) { return JSON.parse(JSON.stringify(o)); }
  function borne(x) { return Math.max(0, Math.min(100, Math.round(x * 10) / 10)); }
  function arrondi(x) { return Math.round(x * 10) / 10; }
  // Les effets annoncés varient de ±25 % : on ne peut pas tout calculer à l'avance
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
  function nouvellePartie(o) {
    if (!LIGNES[o.ligne]) throw new Error("Ligne politique inconnue");
    var amb = (o.ambitions || []).filter(function (a, i, t) { return DOMAINES[a] && t.indexOf(a) === i; });
    if (amb.length !== 2) throw new Error("Il faut choisir exactement deux ambitions");
    var nv = NIVEAUX[o.niveau] ? o.niveau : "moyen";
    var st = {
      v: 2, niveau: nv, rng: (o.graine >>> 0) || ((Math.random() * 4294967296) >>> 0), lots: o.lots || [],
      ligne: o.ligne, ambitions: amb, mois: 0, mandat: 1, debutMandat: 0, phase: "pret",
      tresor: NIVEAUX[nv].tresor, dette: 0, pop: DEPART.pop, coh: DEPART.coh, humeur: 0, taux: 1, budgets: { proprete: 1, securite: 1 },
      arr: [], prevus: [], recurrents: [], suites: [], vus: {}, flags: {}, nid: 1,
      journal: [], historique: [], evenement: null, resultat: null, fin: null, cats: [], special: null, evPerso: null, lieu: null,
      elections: [], rapport: null, notes: []
    };
    st.rngT = (st.rng ^ 0x5bd1e995) | 0;
    ARR.forEach(function (a, i) {
      var dom = {}, base = {};
      DK.forEach(function (k, j) { base[k] = borne(a[1][j] + Math.round((rnd(st) - 0.5) * 8)); dom[k] = base[k]; });
      st.arr.push({ n: i + 1, pop: a[0], cap: Math.round(a[0] * 1.03), dom: dom, base: base, bat: {} });
    });
    tirerOpposant(st);
    stats(st);
    return st;
  }
  function tirerOpposant(st) {
    var fo = FORCE_OPP[st.niveau] || FORCE_OPP.moyen, avant = st.opposant ? st.opposant.i : -1, i;
    do { i = Math.floor(rnd(st) * OPPOSANTS.length); } while (i === avant);
    st.opposant = { i: i, force: Math.round(fo[0] + rnd(st) * (fo[1] - fo[0]) + (st.mandat - 1) * 4), actif: true, contres: 0 };
    st.opposant.depart = st.opposant.force;
  }
  // Compteurs de la partie (succès, quêtes, analyse de la défaite)
  function stats(st) {
    if (!st.stats) st.stats = { trahisons: 0, depenses: 0, detteMax: 0, popMin: st.pop, contre: 0, mobilise: 0, nuireOk: 0, nuireKo: 0,
      subi: 0, elimines: 0, catastrophes: 0, chances: 0, cats: {}, retombees: 0, construits: 0, bats: {}, investi: 0, habMax: habitants(st), dossiers: 0, tresorMax: st.tresor };
    return st.stats;
  }
  function suivre(st) {
    var x = stats(st);
    x.detteMax = Math.max(x.detteMax, st.dette); x.popMin = Math.min(x.popMin, st.pop); x.habMax = Math.max(x.habMax, habitants(st)); x.tresorMax = Math.max(x.tresorMax || 0, st.tresor);
  }
  function opposant(st) { return st.opposant ? Object.assign({}, OPPOSANTS[st.opposant.i], st.opposant) : null; }
  function humeurOpp(f) { return f < 40 ? "tiède" : f < 60 ? "combatif" : f < 75 ? "redoutable" : "brûlant"; }

  // ---------- Calculs sur la ville ----------
  function habitants(st) { var t = 0; (st.arr || []).forEach(function (a) { t += a.pop; }); return Math.round(t); }
  function bonheurArr(st, a) { var t = 0; DK.forEach(function (k) { t += a.dom[k]; }); return borne(t / DK.length + st.humeur); }
  function bonheur(st) { var t = 0, p = 0; st.arr.forEach(function (a) { t += bonheurArr(st, a) * a.pop; p += a.pop; }); return borne(t / p); }
  function domVille(st, k) { var t = 0, p = 0; st.arr.forEach(function (a) { t += a.dom[k] * a.pop; p += a.pop; }); return borne(t / p); }
  function moisMandat(st) { return st.mois - st.debutMandat; }
  function prochaineElection(st) { return st.debutMandat + MANDAT; }
  // Effet des bâtiments d'un arrondissement et de ses voisins sur ses domaines (rendements décroissants)
  function bonusBat(st, i) {
    var b = {};
    function ajouter(a, f) {
      Object.keys(a.bat).forEach(function (id) {
        var B = BATIMENTS[id], n = a.bat[id], m = 0; if (!B || !n) return;
        for (var j = 0; j < n; j++) m += Math.pow(P.rendement, j);
        Object.keys(B.e).forEach(function (k) { b[k] = (b[k] || 0) + B.e[k] * m * f; });
      });
    }
    ajouter(st.arr[i], 1);
    VOISINS[i].forEach(function (v) { ajouter(st.arr[v - 1], P.voisins); });
    return b;
  }
  function cible(st, i) {
    var a = st.arr[i], b = bonusBat(st, i), c = {};
    DK.forEach(function (k) { c[k] = a.base[k] + (b[k] || 0); });
    c.proprete += (st.budgets.proprete - 1) * 14;
    c.securite += (st.budgets.securite - 1) * 12;
    c.achat -= (st.taux - 1) * 40;
    c.economie -= Math.max(0, st.taux - 1) * 15;
    DK.forEach(function (k) { c[k] = borne(c[k]); });
    return c;
  }
  function recettes(st) {
    var r = 0;
    st.arr.forEach(function (a) { r += a.pop * P.impot * st.taux * (0.85 + a.dom.economie / 333); });
    r *= niv(st).recettes;
    st.arr.forEach(function (a) { Object.keys(a.bat).forEach(function (id) { r += (BATIMENTS[id].rev || 0) * a.bat[id]; }); });
    return arrondi(r);
  }
  function entretien(st) {
    var t = 0;
    st.arr.forEach(function (a) { Object.keys(a.bat).forEach(function (id) { t += BATIMENTS[id].ent * a.bat[id]; }); });
    return arrondi(t);
  }
  function depenses(st) {
    return arrondi(habitants(st) * P.fonct + entretien(st) + P.budProprete * st.budgets.proprete + P.budSecurite * st.budgets.securite);
  }
  function solde(st) {
    var r = 0; st.recurrents.forEach(function (x) { r += x.m; });
    return arrondi(recettes(st) - depenses(st) + r - st.dette * TAUX);
  }

  // ---------- Argent ----------
  function mouvement(st, montant, libelle) {
    if (!montant) return;
    montant = arrondi(montant);
    st.tresor = arrondi(st.tresor + montant);
    st.journal.push({ mois: st.mois, m: montant, l: libelle });
    if (st.journal.length > 80) st.journal.splice(0, st.journal.length - 80);
  }
  // Trésorerie négative : on emprunte jusqu'au plafond autorisé, au-delà c'est la faillite
  function financement(st) {
    if (st.tresor < 0) {
      var besoin = -st.tresor, possible = PLAFOND_DETTE - st.dette;
      if (besoin > possible) return false;
      st.dette = arrondi(st.dette + besoin); st.tresor = 0;
      st.journal.push({ mois: st.mois, m: besoin, l: "Emprunt pour couvrir les paiements" });
    } else if (st.dette > 0 && st.tresor > 500) {
      var r = Math.min(st.dette, 150, st.tresor - 500);
      st.dette = arrondi(st.dette - r); st.tresor = arrondi(st.tresor - r);
      st.journal.push({ mois: st.mois, m: -r, l: "Remboursement de la dette" });
    }
    return true;
  }
  function engagements(st) {
    var t = 0;
    st.recurrents.forEach(function (r) { t += r.m * r.n; });
    st.prevus.forEach(function (p) { if (p.e && p.e.bud) t += p.e.bud; });
    return arrondi(t);
  }

  // ---------- Appliquer des effets ----------
  // pop : popularité · bon : humeur passagère des Parisiens · dom : toute la ville (et durablement, en partie) · lieu : un arrondissement
  function appliquer(st, e, libelle, d, lieu) {
    d = d || { pop: 0, bon: 0, coh: 0, bud: 0, dom: {} };
    if (!e) return d;
    if (e.pop) { var a0 = st.pop; st.pop = borne(st.pop + e.pop); d.pop = arrondi(d.pop + st.pop - a0); }
    if (e.coh) { var c0 = st.coh; st.coh = borne(st.coh + e.coh); d.coh = arrondi(d.coh + st.coh - c0); }
    if (e.bon) { var h0 = st.humeur; st.humeur = Math.max(-25, Math.min(25, arrondi(st.humeur + e.bon))); d.bon = arrondi(d.bon + st.humeur - h0); }
    if (e.bud) { mouvement(st, e.bud, libelle); d.bud = arrondi(d.bud + e.bud); }
    if (e.dom) Object.keys(e.dom).forEach(function (k) {
      if (!DOMAINES[k]) return;
      var v = e.dom[k] * (st.ambitions.indexOf(k) >= 0 ? P.ambMult : 1);
      st.arr.forEach(function (a, i) {
        var f = lieu == null ? 1 : i === lieu ? 2.5 : 0.3;
        a.dom[k] = borne(a.dom[k] + v * f); a.base[k] = borne(a.base[k] + v * f * P.evtBase);
      });
      d.dom[k] = arrondi((d.dom[k] || 0) + v);
    });
    return d;
  }
  function varier(st, e) {
    if (!e) return null;
    var o = {};
    ["pop", "bon", "coh", "bud"].forEach(function (k) { if (e[k]) o[k] = varie(st, e[k]); });
    if (e.dom) { o.dom = {}; Object.keys(e.dom).forEach(function (k) { o.dom[k] = varie(st, e.dom[k]); }); }
    if (e.rec) o.rec = { m: e.rec.m, n: e.rec.n };
    return o;
  }

  // ---------- Conditions d'apparition et tirage des dossiers ----------
  function possible(st, ev) {
    var c = ev.cond; if (!c) return true;
    var t = moisMandat(st) * 100 / MANDAT, bon = bonheur(st);   // les conditions de date sont écrites sur 100 semaines
    if (c.popMin != null && st.pop < c.popMin) return false;
    if (c.popMax != null && st.pop > c.popMax) return false;
    if (c.bonMin != null && bon < c.bonMin) return false;
    if (c.bonMax != null && bon > c.bonMax) return false;
    if (c.cohMin != null && st.coh < c.cohMin) return false;
    if (c.cohMax != null && st.coh > c.cohMax) return false;
    if (c.tresorMin != null && st.tresor < c.tresorMin) return false;
    if (c.tresorMax != null && st.tresor > c.tresorMax) return false;
    if (c.detteMin != null && st.dette < c.detteMin) return false;
    if (c.apres != null && t < c.apres) return false;
    if (c.avant != null && t > c.avant) return false;
    if (c.ligne && c.ligne.indexOf(st.ligne) < 0) return false;
    if (c.amb && st.ambitions.indexOf(c.amb) < 0) return false;
    if (c.flag && !st.flags[c.flag]) return false;
    if (c.sansFlag && st.flags[c.sansFlag]) return false;
    return true;
  }
  function tirer(st, base, cat) {
    for (var i = 0; i < st.suites.length; i++) {
      var s = st.suites[i];
      if (!cat && s.mois <= st.mois && base.parId[s.id] && !st.vus[s.id]) { st.suites.splice(i, 1); return base.parId[s.id]; }
    }
    st.suites = st.suites.filter(function (s) { return s.mois > st.mois || (base.parId[s.id] && !st.vus[s.id]); });
    var der = st.cats.slice(-2), total = 0, cand = [];
    base.liste.forEach(function (ev) {
      if (st.vus[ev.id] || ev.suiteSeulement || !possible(st, ev)) return;
      if (cat ? ev.cat !== cat : SPECIAUX[ev.cat]) return;
      var w = ev.poids || 1;
      if (!cat) {
        if (CAT_DOM[ev.cat] && st.ambitions.indexOf(CAT_DOM[ev.cat]) >= 0) w *= 1.8;
        if (CAT_DOM[ev.cat] && domVille(st, CAT_DOM[ev.cat]) < 40) w *= 1.6;           // les domaines en souffrance font parler d'eux
        if (ev.cond && (ev.cond.amb || ev.cond.ligne)) w *= 1.5;
        if (ev.cat === "crise") w *= 0.4;
        if (der.indexOf(ev.cat) >= 0) w *= der[0] === der[1] && der[0] === ev.cat ? 0.05 : 0.35;
      }
      cand.push([ev, w]); total += w;
    });
    if (!cand.length) {
      if (cat) return null;
      st.vus = {}; return tirer(st, base);       // base épuisée (très longues parties) : les dossiers reviennent
    }
    var x = rndT(st) * total;
    for (var j = 0; j < cand.length; j++) { x -= cand[j][1]; if (x <= 0) return cand[j][0]; }
    return cand[cand.length - 1][0];
  }
  // Arrondissement concerné par un dossier : celui où le domaine du dossier va le plus mal (avec du hasard)
  function lieuPour(st, ev) {
    // Un dossier qui cite un arrondissement (« dans le 18e ») s'y déroule
    var m = ((ev.titre || "") + " " + (ev.desc || "")).match(/\b([1-9]|1[0-9]|20)(?:e|er|ème)\b/);
    if (m) return +m[1] - 1;
    var k = CAT_DOM[ev.cat], best = 0, bw = -1;
    st.arr.forEach(function (a, i) { var w = (k ? 100 - a.dom[k] : 50) * (0.5 + rnd(st)) * Math.sqrt(a.pop); if (w > bw) { bw = w; best = i; } });
    return best;
  }

  // ---------- Élection municipale ----------
  function promessesTenues(st) { return st.ambitions.filter(function (k) { return domVille(st, k) >= P.ambSeuil; }); }
  function election(st) {
    var ok = promessesTenues(st).length, o = st.opposant, f = o && o.actif ? o.force : 0, res = [], sieges = 0, voix = 0, hab = habitants(st);
    st.arr.forEach(function (a) {
      var pct = 50 + (bonheurArr(st, a) - 50) * 0.45 + (st.pop - 50) * 0.55 + (ok - 1) * 3 - (f - 45) * 0.1 + niv(st).elec - (st.mandat - 1) * P.usureMandat - st.dette / P.detteImpop * 2 + (rnd(st) - 0.5) * 6;
      pct = Math.max(10, Math.min(90, arrondi(pct)));
      res.push(pct); voix += pct * a.pop;
    });
    // Sièges : chaque arrondissement en a selon sa population ; la liste en tête y gagne la moitié des sièges
    // plus sa part du reste (prime majoritaire, comme à Paris)
    var total = 0;
    st.arr.forEach(function (a, i) {
      var n = Math.max(1, Math.round(a.pop / hab * SIEGES)), prime = res[i] > 50 ? Math.ceil(n / 2) : 0;
      total += n; sieges += prime + Math.round((n - Math.ceil(n / 2)) * res[i] / 100);
    });
    var doms = {}; DK.forEach(function (k) { doms[k] = domVille(st, k); });
    return { mandat: st.mandat, mois: st.mois, arr: res, sieges: sieges, pct: arrondi(voix / hab), total: total, gagne: sieges > total / 2, opposant: o ? OPPOSANTS[o.i].nom : "",
      popu: st.pop, bon: bonheur(st), coh: st.coh, taux: st.taux, amb: promessesTenues(st), dom: doms,
      bonMin: Math.min.apply(null, st.arr.map(function (a) { return bonheurArr(st, a); })), arrGagnes: res.filter(function (p) { return p > 50; }).length };
  }

  // ---------- Fin de partie ----------
  function verifierFin(st, raisonFaillite) {
    if (!raisonFaillite) return false;
    st.fin = { gagne: false, raison: { type: "faillite", txt: "Faillite municipale : la ville ne peut plus payer ses dépenses, même en empruntant au maximum autorisé." }, mois: st.mois };
    st.phase = "fin";
    return true;
  }

  // ---------- Mois suivant ----------
  function debutTour(st0, base) {
    if (st0.phase !== "pret" && st0.phase !== "gestion") return st0;   // un dossier attend une décision : rien à rejouer
    var st = copie(st0), notes = [], x = stats(st);
    st.mois++; st.resultat = null; st.evPerso = null; st.special = null; st.lieu = null; st.evenement = null;
    var h0 = habitants(st), r0 = recettes(st), d0 = depenses(st);
    // 1. Argent du mois
    mouvement(st, r0, "Impôts et recettes de la ville");
    mouvement(st, -d0, "Fonctionnement, entretien et budgets");
    var rec = 0; st.recurrents.forEach(function (r) { rec += r.m; r.n--; });
    if (st.recurrents.length) mouvement(st, rec, "Engagements récurrents (" + st.recurrents.length + ")");
    st.recurrents = st.recurrents.filter(function (r) { return r.n > 0; });
    if (st.dette > 0) mouvement(st, -arrondi(st.dette * TAUX), "Intérêts de la dette");
    // 2. Effets différés
    var restants = [];
    st.prevus.forEach(function (p) {
      if (p.mois <= st.mois) { var d = appliquer(st, p.e, p.l, null, p.lieu); notes.push({ txt: p.txt, d: d }); }
      else restants.push(p);
    });
    st.prevus = restants;
    // 3. Les quartiers vivent : usure, effet des bâtiments et des budgets, habitants qui arrivent ou partent
    st.arr.forEach(function (a, i) {
      DK.forEach(function (k) { a.base[k] = Math.max(P.plancher, Math.round((a.base[k] - niv(st).usure) * 100) / 100); });
      var c = cible(st, i);
      DK.forEach(function (k) { a.dom[k] = borne(a.dom[k] + (c[k] - a.dom[k]) * P.domVit); });
      var attr = (bonheurArr(st, a) + a.dom.logement) / 2;
      var cap = a.cap + (a.bat.logements ? capBat(a) : 0) + (a.bat.ecole || 0) + (a.bat.metro ? 3 : 0);
      a.pop = arrondi(a.pop + (a.pop < cap || attr < P.attrait ? a.pop * P.croissance * (attr - P.attrait) / 50 : 0) - (a.pop > cap ? (a.pop - cap) * 0.05 : 0));
      a.pop = Math.max(5, a.pop);
    });
    st.humeur = arrondi(st.humeur * P.humeurVit);
    // 4. Popularité : elle suit le bonheur, s'use avec le temps et souffre de la dette
    var bon = bonheur(st);
    var cib = bon * 0.6 + st.coh * 0.2 + 14 - moisMandat(st) * P.usurePop - st.dette / P.detteImpop - (st.coh < 40 ? 4 : 0) - Math.max(0, st.taux - 1) * 30;
    st.pop = borne(st.pop + (cib - st.pop) * P.popVit);
    st.coh = borne(st.coh + (50 - st.coh) * 0.01);
    var ok = financement(st); suivre(st);
    st.rapport = { mois: st.mois, recettes: r0, depenses: d0, solde: arrondi(r0 - d0 + rec), hab: arrondi(habitants(st) - h0) };
    st.notes = notes;
    if (verifierFin(st, !ok)) return st;
    // 5. Élection tous les 6 ans
    if (st.mois >= prochaineElection(st)) {
      var el = election(st); st.elections.push(el);
      if (!el.gagne) { st.fin = { gagne: false, raison: { type: "election", txt: "Les Parisiens ont choisi " + el.opposant + " : tu perds l’élection avec " + el.sieges + " sièges sur " + el.total + "." }, mois: st.mois }; st.phase = "fin"; return st; }
      st.mandat++; st.debutMandat = st.mois; st.pop = borne(st.pop + 5); st.coh = borne(st.coh + 5);
      tirerOpposant(st);
      st.phase = "election"; return st;
    }
    return tirerDossier(st, base);
  }
  // Après l'écran d'élection gagnée : on reprend le cours des mois
  function continuer(st0, base) {
    if (st0.phase !== "election") return st0;
    var st = copie(st0); return tirerDossier(st, base);
  }
  function tirerDossier(st, base) {
    var ev = null, o = st.opposant;
    // L'opposant attaque tous les 6 mois ; catastrophes et coups de chance arrivent au hasard ; sinon, souvent un dossier
    if (o && o.actif && moisMandat(st) % 6 === 0 && moisMandat(st) > 0) {
      st.evPerso = attaque(st); st.evenement = st.evPerso.id; st.special = "opposition"; st.phase = "evenement"; return st;
    }
    var r = rnd(st);
    if (r < niv(st).cata) { ev = tirer(st, base, "catastrophe"); if (ev) st.special = "catastrophe"; }
    else if (r < niv(st).cata + 0.02) { ev = tirer(st, base, "chance"); if (ev) st.special = "chance"; }
    if (!ev && rnd(st) < P.dossier) ev = tirer(st, base);
    if (!ev) { st.phase = "gestion"; return st; }
    st.vus[ev.id] = st.mois; st.cats.push(ev.cat); if (st.cats.length > 6) st.cats.shift();
    if (st.special === "catastrophe") stats(st).catastrophes++; else if (st.special === "chance") stats(st).chances++;
    st.lieu = lieuPour(st, ev);
    if (st.special === "catastrophe") { var a = st.arr[st.lieu]; DK.forEach(function (k) { if (rnd(st) < 0.4) a.dom[k] = borne(a.dom[k] - 8); }); }
    st.evenement = ev.id; st.phase = "evenement";
    return st;
  }

  // ---------- Attaques de l'opposant ----------
  function attaque(st) {
    var o = opposant(st), a = ATTAQUES[(Math.floor(st.mois / 6) + st.opposant.i) % ATTAQUES.length];
    var m = Math.round(2 + o.force / 14) * (a.cible === "coh" ? 2 : 1);
    var cher = 1 + 0.1 * st.opposant.contres;
    var prix = Math.round((15 + o.force * 0.6) * cher), coh = Math.round((3 + o.force / 15) * cher);
    var e = {}; e[a.cible] = -m;
    var nom = { pop: "popularité", bon: "bonheur", coh: "cohérence" }[a.cible];
    return { id: "opp-" + st.mois, cat: "opposition", titre: o.nom + " " + a.titre, attaque: e,
      desc: a.desc.replace("{nom}", o.nom) + " Influence actuelle : " + Math.round(o.force) + "/100 (" + humeurOpp(o.force) + "). Si tu laisses faire : −" + m + " " + nom + ".",
      choix: [
        { t: "Riposter par une campagne de communication (−" + prix + " M€)", r: "Ta riposte éteint l’incendie : l’attaque fait pschitt.", e: { bud: -prix }, k: "contre", prix: prix },
        { t: "Mobiliser ton camp pour répondre (−" + coh + " cohérence)", r: "Tes élus montent au créneau : l’attaque est repoussée, mais ton camp a dû avaler des couleuvres.", e: { coh: -coh }, k: "mobilise", coh: coh },
        { t: "Chercher à le faire tomber (−40 M€, une chance sur deux)", r: "", e: { bud: -40 }, k: "nuire" },
        { t: "Ne rien faire", r: "Tu laisses passer l’orage. " + o.nom + " en sort renforcé et reviendra.", e: e, k: "subir" }
      ] };
  }
  function choisirOpposition(st, i) {
    var ev = st.evPerso, c = ev.choix[i], o = st.opposant, x = stats(st), lib = ev.titre + " : " + c.t;
    var d = { pop: 0, bon: 0, coh: 0, bud: 0, dom: {} }, txt = c.r, extra = [], nom = OPPOSANTS[o.i].nom;
    if (c.k === "contre") { d = appliquer(st, { bud: -c.prix }, lib, d); o.force = Math.max(0, o.force - 6); o.contres++; x.contre++; }
    else if (c.k === "mobilise") { d = appliquer(st, { coh: -c.coh }, lib, d); o.force = Math.max(0, o.force - 6); o.contres++; x.mobilise++; }
    else if (c.k === "nuire") {
      d = appliquer(st, { bud: -40 }, lib, d);
      if (rnd(st) < 0.5) { o.force = arrondi(o.force / 2); x.nuireOk++; txt = "Coup réussi : des révélations font chuter " + nom + ", dont l’influence est divisée par deux."; }
      else { d = appliquer(st, ev.attaque, lib, d); d = appliquer(st, { pop: -2 }, lib, d); o.force = Math.min(100, o.force + 3); x.nuireKo++;
        txt = "L’opération est éventée : " + nom + " crie au complot et son attaque porte en plein."; }
    }
    else { d = appliquer(st, ev.attaque, lib, d); o.force = Math.min(100, o.force + 6); x.subi++; }
    if (o.force < SEUIL_OPP) { o.actif = false; x.elimines++; extra.push("🏳️ " + nom + " renonce : plus aucune attaque jusqu’à la prochaine élection, où tu affronteras un adversaire affaibli."); }
    else extra.push("Influence de " + nom + " : " + Math.round(o.force) + "/100 (" + humeurOpp(o.force) + ").");
    return { d: d, txt: txt, extra: extra };
  }

  // ---------- Décision sur le dossier du mois ----------
  function choisir(st0, base, i) {
    if (st0.phase !== "evenement") return st0;                           // déjà choisi : rien à rejouer
    if (st0.evPerso) {
      if (!st0.evPerso.choix[i]) return st0;
      var so = copie(st0), ro = choisirOpposition(so, i), co = so.evPerso.choix[i];
      so.historique.push({ mois: so.mois, ev: so.evPerso.id, titre: so.evPerso.titre, choix: co.t, d: ro.d, sp: "opposition", c: "opposition" });
      so.resultat = { ev: so.evPerso.id, i: i, d: ro.d, surprise: null, extra: ro.extra, rec: null, dif: 0, txt: ro.txt };
      so.phase = "gestion";
      verifierFin(so, !financement(so)); suivre(so);
      return so;
    }
    var ev = base.parId[st0.evenement]; if (!ev || !ev.choix[i]) return st0;
    var st = copie(st0), c = ev.choix[i], lib = ev.titre + " : " + c.t, lieu = st.lieu;
    var e = varier(st, c.e), d = appliquer(st, e, lib, null, lieu), extra = [];
    var a = (c.ali && c.ali[LETTRE[st.ligne]]) || 0;
    if (a) {
      var urgence = ev.cat === "crise" || ev.cat === "catastrophe";
      var dc = a > 0 ? a * P.aliPlus : a * (urgence ? 0.8 : P.aliMoins);
      if (a <= -3 && !urgence) stats(st).trahisons++;
      d = appliquer(st, { coh: arrondi(dc) }, lib, d);
      if (a <= -3 && !urgence && rnd(st) < 0.6) { d = appliquer(st, { pop: -2 }, lib, d); extra.push("Une partie de ton électorat se sent trahie."); }
      if (a >= 3 && st.coh > 75 && rnd(st) < 0.3) { d = appliquer(st, { pop: 1 }, lib, d); extra.push("Tes soutiens saluent une décision fidèle à tes engagements."); }
    }
    if (e && e.dom) Object.keys(e.dom).forEach(function (k) {
      if (st.ambitions.indexOf(k) >= 0 && e.dom[k] > 0) { d = appliquer(st, { pop: 1 }, lib, d); extra.push("Les Parisiens voient que tu tiens ta promesse sur « " + DOMAINES[k] + " »."); }
    });
    if (e && e.bud < -20 && (st.dette > 800 || st.tresor < 150)) { d = appliquer(st, { pop: -1 }, lib, d); extra.push("Avec des finances tendues, cette dépense inquiète."); }
    if (e && e.rec) st.recurrents.push({ id: st.nid++, m: e.rec.m, n: e.rec.n, l: lib });
    var surprise = null;
    if (c.alea && rnd(st) * 100 < c.alea.p) { d = appliquer(st, varier(st, c.alea.e), lib + " (imprévu)", d, lieu); surprise = c.alea.txt; }
    (c.dif || []).forEach(function (y) { st.prevus.push({ id: st.nid++, mois: st.mois + Math.max(1, Math.round(y.n / 4)), e: varier(st, y.e), l: lib + " (effet différé)", txt: y.txt, lieu: lieu }); });
    if (c.suite) st.suites.push({ id: c.suite.id, mois: st.mois + Math.max(1, Math.round(c.suite.n / 4)) });
    if (c.flag) st.flags[c.flag] = st.mois;
    // Retombées cachées : une décision sur six revient quelques mois plus tard, en bien ou en mal
    if (rnd(st) < P.retombees) {
      var sens = (e && (e.pop || 0) + (e.bon || 0)) < 0 ? -1 : 1; if (rnd(st) < 0.35) sens = -sens;
      var re = { pop: sens * (1 + Math.floor(rnd(st) * 2)), bon: sens * (1 + Math.floor(rnd(st) * 2)) };
      st.prevus.push({ id: st.nid++, mois: st.mois + 1 + Math.floor(rnd(st) * 3), e: re, l: lib + " (retombées)", cache: 1,
        txt: (sens > 0 ? "Bonne surprise : ta décision « " : "Retour de bâton : ta décision « ") + c.t + " » (" + ev.titre + ") fait encore parler d’elle." });
      stats(st).retombees++;
    }
    var x = stats(st); x.cats[ev.cat] = (x.cats[ev.cat] || 0) + 1; x.dossiers++;
    if (e && e.bud < 0) x.depenses += -e.bud;
    st.resultat = { ev: ev.id, i: i, d: d, surprise: surprise, extra: extra, rec: e && e.rec ? e.rec : null, dif: (c.dif || []).length };
    st.historique.push({ mois: st.mois, ev: ev.id, titre: ev.titre, choix: c.t, d: d, sp: st.special || undefined, c: ev.cat, lieu: lieu });
    if (st.historique.length > 400) st.historique.splice(0, st.historique.length - 400);
    st.phase = "gestion";
    verifierFin(st, !financement(st)); suivre(st);
    return st;
  }

  // ---------- Construire et régler le budget (possible à tout moment, sauf partie finie) ----------
  function capBat(a) { var m = 0; for (var j = 0; j < (a.bat.logements || 0); j++) m += BATIMENTS.logements.cap * Math.pow(0.85, j); return m; }
  function peutConstruire(st, i, id) {
    var B = BATIMENTS[id], a = st.arr[i];
    if (!B || !a || st.phase === "fin") return "Impossible pour l’instant.";
    if ((a.bat[id] || 0) >= B.max) return "Déjà au maximum dans cet arrondissement.";
    if (B.an && st.mois < (B.an - 1) * 12) return "Disponible à partir de l’année " + B.an + ".";
    if (B.cout > 0 && B.cout > st.tresor + (PLAFOND_DETTE - st.dette) * 0.5) return "Pas assez d’argent, même en empruntant.";
    return "";
  }
  function construire(st0, i, id) {
    if (peutConstruire(st0, i, id)) return st0;
    var st = copie(st0), B = BATIMENTS[id], a = st.arr[i], x = stats(st);
    a.bat[id] = (a.bat[id] || 0) + 1;
    mouvement(st, -B.cout, B.nom + " (" + nomArr(i) + ")");
    x.construits++; x.bats[id] = (x.bats[id] || 0) + 1; if (B.cout > 0) x.investi += B.cout;
    var al = (B.ali && B.ali[LETTRE[st.ligne]]) || 0;
    if (al) st.coh = borne(st.coh + (al > 0 ? al * 0.5 : al));
    st.pop = borne(st.pop + (B.cout >= 100 ? 1.5 : 0.3));                 // inaugurer, ça plaît
    financement(st); suivre(st);
    st.historique.push({ mois: st.mois, ev: "bat-" + id, titre: B.ico + " " + B.nom + " · " + nomArr(i), choix: B.cout > 0 ? "Construit pour " + B.cout + " M€" : "Terrain vendu " + -B.cout + " M€", d: { pop: 0, bon: 0, coh: 0, bud: -B.cout, dom: {} }, c: "construction", lieu: i });
    return st;
  }
  function regler(st0, o) {
    if (st0.phase === "fin") return st0;
    var st = copie(st0);
    if (o.taux != null) st.taux = Math.max(0.8, Math.min(1.3, Math.round(o.taux * 100) / 100));
    ["proprete", "securite"].forEach(function (k) { if (o[k] != null) st.budgets[k] = Math.max(0.5, Math.min(1.5, Math.round(o[k] * 100) / 100)); });
    return st;
  }
  function nomArr(i) { return (i + 1) + (i === 0 ? "er" : "e"); }

  // ---------- Reprise d'une sauvegarde ----------
  function reprendre(st0, base) {
    if (st0.phase !== "evenement" || st0.evPerso || base.parId[st0.evenement]) return st0;
    var st = copie(st0), ev = tirer(st, base);
    st.vus[ev.id] = st.mois; st.evenement = ev.id; st.special = null; st.lieu = lieuPour(st, ev);
    return st;
  }

  // ---------- Bilan ----------
  function bilan(st) {
    var gagnes = st.elections.filter(function (e) { return e.gagne; }).length, mois = st.fin ? st.fin.mois : st.mois;
    var score = Math.round(mois * 4 + gagnes * 150 + habitants(st) / 10 + bonheur(st) + Math.max(-100, Math.min(100, (st.tresor - st.dette) / 20)));
    var poids = st.historique.filter(function (h) { return h.c !== "construction"; }).map(function (h) { return { mois: h.mois, titre: h.titre, choix: h.choix, v: h.d.pop + h.d.bon }; })
      .sort(function (a, b) { return a.v - b.v; });
    return { score: Math.max(0, score), mandats: gagnes, mois: mois, habitants: habitants(st), bonheur: bonheur(st),
      ambitions: st.ambitions.map(function (k) { var v = domVille(st, k); return { k: k, nom: DOMAINES[k], niveau: Math.round(v), ok: v >= P.ambSeuil }; }),
      pires: poids.slice(0, 5), meilleures: poids.slice(-5).reverse(), engagements: engagements(st) };
  }

  // ---------- Pourquoi ça s'est mal passé ----------
  function analyse(st) {
    if (!st.fin) return null;
    var x = stats(st);
    if (st.fin.raison.type === "election") {
      var el = st.elections[st.elections.length - 1], o = opposant(st), raisons = [];
      var pires = el.arr.map(function (p, i) { return [p, i]; }).sort(function (a, b) { return a[0] - b[0]; }).slice(0, 3).map(function (z) { return nomArr(z[1]) + " (" + Math.round(z[0]) + " %)"; });
      if (st.pop < 50) raisons.push("ta popularité (" + Math.round(st.pop) + ") était trop basse");
      var b = bonheur(st); if (b < 50) raisons.push("les Parisiens n’étaient pas assez heureux (" + Math.round(b) + ")");
      if (promessesTenues(st).length < 2) raisons.push("tes promesses n’ont pas toutes été tenues");
      if (o && o.actif && o.force >= 55) raisons.push(o.nom + " était très influent (" + Math.round(o.force) + "/100)");
      if (st.dette > 800) raisons.push("la dette de la ville inquiétait");
      var faible = DK.slice().sort(function (p, q) { return domVille(st, p) - domVille(st, q); })[0];
      return { phrase: "Battu avec " + el.sieges + " sièges sur " + el.total + " : " + (raisons.length ? raisons.join(", ") : "il t’a manqué un petit élan") + ". Tes pires arrondissements : " + pires.join(", ") + ".",
        conseil: "Avant une élection, soigne les arrondissements les plus peuplés et ton point faible, « " + DOMAINES[faible].toLowerCase() + " » : un bâtiment bien placé y change tout. Et affaiblis ton opposant." };
    }
    var cons = st.historique.filter(function (h) { return h.c === "construction" && h.mois > st.mois - 24; }).reduce(function (t, h) { return t + Math.max(0, -h.d.bud); }, 0);
    var rec = st.recurrents.reduce(function (t, r) { return t + r.m * r.n; }, 0);
    return { phrase: "La ville a fait faillite au mois " + st.mois + " avec " + Math.round(st.dette) + " M€ de dette" + (cons ? ", après " + Math.round(cons) + " M€ de constructions en deux ans" : "") + ".",
      conseil: entretien(st) > 60 ? "L’entretien de tes bâtiments (" + Math.round(entretien(st)) + " M€ par mois) pèse lourd : construis ce qui rapporte (marchés, pépinières) avant le reste." :
        rec < -300 ? "Les dépenses récurrentes t’ont étranglé : une petite dépense chaque mois finit par coûter très cher." :
        st.taux < 1 ? "Baisser les impôts coûte cher : remonte-les un peu quand les caisses se vident." :
        "Surveille le solde mensuel dans l’onglet Budget : s’il est négatif plusieurs mois, freine les dépenses ou remonte les impôts." };
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

  var API = { MANDAT: MANDAT, SIEGES: SIEGES, MAJORITE: MAJORITE, PLAFOND_DETTE: PLAFOND_DETTE, TAUX: TAUX, P: P, NIVEAUX: NIVEAUX,
    ARR: ARR, VOISINS: VOISINS, GRILLE: GRILLE, BATIMENTS: BATIMENTS, OPPOSANTS: OPPOSANTS, SEUIL_OPP: SEUIL_OPP,
    LIGNES: LIGNES, DOMAINES: DOMAINES, CATS: CATS, SPECIAUX: SPECIAUX,
    nouvellePartie: nouvellePartie, debutTour: debutTour, continuer: continuer, choisir: choisir, construire: construire, peutConstruire: peutConstruire,
    regler: regler, reprendre: reprendre, bilan: bilan, analyse: analyse, valider: valider, indexer: indexer, engagements: engagements,
    evenementCourant: evenementCourant, stats: stats, opposant: opposant, humeurOpp: humeurOpp, habitants: habitants, bonheur: bonheur,
    bonheurArr: bonheurArr, domVille: domVille, cible: cible, recettes: recettes, depenses: depenses, entretien: entretien, solde: solde,
    moisMandat: moisMandat, prochaineElection: prochaineElection, promessesTenues: promessesTenues, nomArr: nomArr };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Maire = API;
})(this);
