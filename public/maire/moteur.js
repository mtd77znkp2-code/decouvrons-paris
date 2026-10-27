// Maire de Paris : moteur du jeu, sans interface (utilisable dans le navigateur et dans Node pour les tests).
// Chaque clic fait passer un trimestre : l'argent rentre et sort, un dossier arrive, et tu achètes des bâtiments
// qui font progresser les 4 piliers de la ville. Tous les 6 ans (24 trimestres), les Parisiens votent :
// la partie continue tant que tu es réélu, ou jusqu'à la faillite.
// Les mécaniques se débloquent avec le niveau du joueur (voir MECANIQUES) : une partie garde celles qu'elle avait au départ.
// L'état est un objet simple, sauvegardable tel quel ; chaque étape produit un nouvel état, si bien que recharger
// la page ne rejoue jamais un effet déjà appliqué.
(function (root) {
  "use strict";

  var MANDAT = 24, PLAFOND_DETTE = 1500, TAUX = 0.012;   // 24 trimestres = 6 ans ; dette autorisée (M€) ; intérêts par trimestre
  var DEPART = { pop: 58, coh: 70 };

  // Réglages d'équilibrage (vérifiés par tools/maire/test-moteur.mjs)
  var P = {
    impot: 620, fonct: 540, vit: 0.3, usure: 0.4, plancher: 15, rendement: 0.85, inflation: 1.15, evtBase: 0.4,
    popVit: 0.2, usurePop: 0.45, detteImpop: 250, humeurVit: 0.7, aliPlus: 0.8, aliMoins: 1.6,
    ambSeuil: 60, retombees: 0.16, cata: 0.09, chance: 0.05, usureMandat: 3, ecoRecettes: 250, gain: 2
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
    { id: "boutique2", niv: 4, nom: "Nouveaux bâtiments et niveau Moyen" },
    { id: "cata", niv: 5, nom: "Catastrophes et coups de chance" },
    { id: "promesses", niv: 6, nom: "Les promesses de campagne" },
    { id: "ligne", niv: 7, nom: "La ligne politique" },
    { id: "boutique3", niv: 8, nom: "Grands équipements, niveau Réaliste et défi du jour" },
    { id: "projets", niv: 10, nom: "Les grands projets de Paris 2040" }
  ];
  function mecaniques(nivJoueur) { var m = {}; MECANIQUES.forEach(function (x) { m[x.id] = nivJoueur >= x.niv; }); return m; }

  // ---------- Boutique ----------
  // cout : prix du premier exemplaire (chaque achat suivant coûte 15 % de plus) · ent : entretien par trimestre
  // e : gain sur les piliers (rendement décroissant) · rev : recette par trimestre · eco : dynamisme économique · pop : popularité à l'inauguration
  var BATIMENTS = {
    parc: { nom: "Parc", ico: "🌳", tier: 1, cout: 40, ent: 2, e: { cadre: 3 }, ali: { g: 0, c: 1, d: 0, e: 2 } },
    logements: { nom: "Logements sociaux", ico: "🏢", tier: 1, cout: 60, ent: 3, e: { logement: 3 }, ali: { g: 2, c: 0, d: -1, e: 1 } },
    police: { nom: "Commissariat", ico: "🚓", tier: 1, cout: 50, ent: 4, e: { securite: 3 }, ali: { g: -1, c: 1, d: 2, e: 0 } },
    velo: { nom: "Pistes cyclables", ico: "🚲", tier: 1, cout: 30, ent: 1, e: { transports: 2, cadre: 1 }, ali: { g: 1, c: 0, d: -1, e: 2 } },
    ecole: { nom: "École", ico: "🏫", tier: 2, cout: 70, ent: 4, e: { cadre: 3, logement: 1 }, ali: { g: 1, c: 1, d: 0, e: 0 } },
    tram: { nom: "Ligne de tramway", ico: "🚋", tier: 2, cout: 150, ent: 6, e: { transports: 6 }, ali: { g: 1, c: 1, d: 0, e: 2 } },
    proprete: { nom: "Brigade de propreté", ico: "🧹", tier: 2, cout: 60, ent: 5, e: { cadre: 3, securite: 1 }, ali: { g: 1, c: 1, d: 1, e: 1 } },
    marche: { nom: "Marché couvert", ico: "🧺", tier: 2, cout: 80, ent: 1, rev: 6, e: { logement: 1 }, eco: 2, ali: { g: 1, c: 1, d: 1, e: 1 } },
    metro: { nom: "Station de métro", ico: "🚇", tier: 3, cout: 350, ent: 10, e: { transports: 9, logement: 1 }, eco: 2, ali: { g: 1, c: 2, d: 1, e: 1 } },
    hopital: { nom: "Hôpital", ico: "🏥", tier: 3, cout: 300, ent: 12, e: { cadre: 6, securite: 2 }, ali: { g: 2, c: 1, d: 0, e: 0 } },
    quartier: { nom: "Écoquartier", ico: "🏘️", tier: 3, cout: 400, ent: 8, e: { logement: 8, cadre: 2 }, ali: { g: 1, c: 1, d: 0, e: 2 } },
    musee: { nom: "Grand musée", ico: "🎭", tier: 3, cout: 250, ent: 4, rev: 14, e: { cadre: 2 }, eco: 3, ali: { g: 0, c: 1, d: 1, e: 0 } },
    jo: { nom: "Village olympique", ico: "🏟️", tier: 4, unique: 1, cout: 1200, ent: 10, e: { logement: 10, transports: 4, cadre: 4 }, eco: 6, pop: 10, ali: { g: 1, c: 2, d: 1, e: 0 } },
    gpe: { nom: "Grand Paris Express", ico: "🚄", tier: 4, unique: 1, cout: 1500, ent: 15, e: { transports: 18 }, eco: 8, pop: 8, ali: { g: 1, c: 2, d: 1, e: 1 } },
    seine: { nom: "Seine baignable", ico: "🏊", tier: 4, unique: 1, cout: 900, ent: 8, e: { cadre: 12 }, eco: 2, pop: 12, ali: { g: 1, c: 1, d: 0, e: 3 } }
  };
  var TIER_MECA = { 1: "base", 2: "boutique2", 3: "boutique3", 4: "projets" };

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

  // ---------- Niveaux de difficulté (« difficile » s'affiche « Réaliste ») ----------
  var NIVEAUX = {
    facile: { nom: "Facile", txt: "Caisses pleines et Parisiens indulgents.", meca: "base", tresor: 800, recettes: 1.04, elec: 2, usure: 0.3 },
    moyen: { nom: "Moyen", txt: "Chaque euro compte, chaque élection se prépare.", meca: "boutique2", tresor: 500, recettes: 1, elec: 0, usure: P.usure },
    difficile: { nom: "Réaliste", txt: "Caisses presque vides, Parisiens exigeants.", meca: "boutique3", tresor: 350, recettes: 0.99, elec: -1, usure: 0.45 }
  };
  function niv(st) { return NIVEAUX[st && st.niveau] || NIVEAUX.moyen; }

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
  // o : { ligne, ambitions (2 piliers), niveau, nivJoueur, graine, lots }
  function nouvellePartie(o) {
    var nv = NIVEAUX[o.niveau] ? o.niveau : "moyen", m = mecaniques(o.nivJoueur || 99);
    if (!m[NIVEAUX[nv].meca]) nv = "facile";
    var ligne = m.ligne ? o.ligne : "centre";
    if (!LIGNES[ligne]) throw new Error("Ligne politique inconnue");
    var amb = m.promesses ? (o.ambitions || []).filter(function (a, i, t) { return PILIERS[a] && t.indexOf(a) === i; }) : [];
    if (m.promesses && amb.length !== 2) throw new Error("Il faut choisir exactement deux promesses");
    var st = {
      v: 3, niveau: nv, meca: m, rng: (o.graine >>> 0) || ((Math.random() * 4294967296) >>> 0), lots: o.lots || [],
      ligne: ligne, ambitions: amb, t: 0, mandat: 1, debutMandat: 0, phase: "pret",
      tresor: NIVEAUX[nv].tresor, dette: 0, pop: DEPART.pop, coh: DEPART.coh, humeur: 0, taux: 1, eco: 50,
      piliers: {}, base: {}, bat: {}, prevus: [], recurrents: [], suites: [], vus: {}, flags: {}, nid: 1,
      journal: [], historique: [], evenement: null, resultat: null, fin: null, cats: [], special: null, evPerso: null,
      elections: [], rapport: null, notes: [], opposant: null
    };
    st.rngT = (st.rng ^ 0x5bd1e995) | 0;
    PK.forEach(function (k) { st.base[k] = borne(46 + Math.round((rnd(st) - 0.5) * 10)); st.piliers[k] = st.base[k]; });
    if (m.opposant) tirerOpposant(st);
    stats(st);
    return st;
  }
  function tirerOpposant(st) {
    var fo = FORCE_OPP[st.niveau] || FORCE_OPP.moyen, avant = st.opposant ? st.opposant.i : -1, i;
    do { i = Math.floor(rnd(st) * OPPOSANTS.length); } while (i === avant);
    st.opposant = { i: i, force: Math.round(fo[0] + rnd(st) * (fo[1] - fo[0]) + (st.mandat - 1) * 4), actif: true, contres: 0 };
    st.opposant.depart = st.opposant.force;
  }
  function stats(st) {
    if (!st.stats) st.stats = { trahisons: 0, depenses: 0, detteMax: 0, popMin: st.pop, contre: 0, mobilise: 0, nuireOk: 0, nuireKo: 0,
      subi: 0, elimines: 0, catastrophes: 0, chances: 0, cats: {}, retombees: 0, achats: 0, bats: {}, investi: 0, dossiers: 0, tresorMax: st.tresor };
    return st.stats;
  }
  function suivre(st) {
    var x = stats(st);
    x.detteMax = Math.max(x.detteMax, st.dette); x.popMin = Math.min(x.popMin, st.pop); x.tresorMax = Math.max(x.tresorMax, st.tresor);
  }
  function opposant(st) { return st.opposant ? Object.assign({}, OPPOSANTS[st.opposant.i], st.opposant) : null; }
  function humeurOpp(f) { return f < 40 ? "tiède" : f < 60 ? "combatif" : f < 75 ? "redoutable" : "brûlant"; }

  // ---------- Calculs ----------
  function bonheur(st) { var t = 0; PK.forEach(function (k) { t += st.piliers[k]; }); return borne(t / PK.length + st.humeur); }
  function trimMandat(st) { return st.t - st.debutMandat; }
  function prochaineElection(st) { return st.debutMandat + MANDAT; }
  function bonusBat(st) {
    var b = {};
    Object.keys(st.bat).forEach(function (id) {
      var B = BATIMENTS[id], n = st.bat[id], m = 0; if (!B || !n) return;
      for (var j = 0; j < n; j++) m += Math.pow(P.rendement, j);
      Object.keys(B.e).forEach(function (k) { b[k] = (b[k] || 0) + B.e[k] * m * P.gain; });
    });
    return b;
  }
  function cible(st) {
    var b = bonusBat(st), c = {};
    PK.forEach(function (k) { c[k] = borne(st.base[k] + (b[k] || 0) - (k === "logement" ? Math.max(0, st.taux - 1) * 25 : 0)); });
    return c;
  }
  function prix(st, id) { var B = BATIMENTS[id]; return Math.round(B.cout * Math.pow(P.inflation, st.bat[id] || 0)); }
  function recettes(st) {
    var r = P.impot * st.taux * (0.8 + st.eco / P.ecoRecettes) * niv(st).recettes;
    Object.keys(st.bat).forEach(function (id) { r += (BATIMENTS[id].rev || 0) * st.bat[id]; });
    return arrondi(r);
  }
  function entretien(st) { var t = 0; Object.keys(st.bat).forEach(function (id) { t += BATIMENTS[id].ent * st.bat[id]; }); return arrondi(t); }
  function depenses(st) { return arrondi(P.fonct + entretien(st)); }
  function solde(st) { var r = 0; st.recurrents.forEach(function (x) { r += x.m; }); return arrondi(recettes(st) - depenses(st) + r - st.dette * TAUX); }
  function promessesTenues(st) { return st.ambitions.filter(function (k) { return st.piliers[k] >= P.ambSeuil; }); }
  // Sondage : ce que donnerait l'élection aujourd'hui (sans le petit aléa du jour du vote)
  function sondage(st) {
    var o = st.opposant, f = o && o.actif ? o.force : (st.meca.opposant ? 0 : 45);
    var pct = 50 + (bonheur(st) - 50) * 0.45 + (st.pop - 50) * 0.55 + (st.ambitions.length ? (promessesTenues(st).length - 1) * 3 : 0)
      - (f - 45) * 0.1 + niv(st).elec - (st.mandat - 1) * P.usureMandat - st.dette / P.detteImpop * 2;
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
  function varier(st, e) {
    if (!e) return null;
    var o = {};
    ["pop", "bon", "coh", "bud"].forEach(function (k) { if (e[k]) o[k] = varie(st, e[k]); });
    if (e.dom) { o.dom = {}; Object.keys(e.dom).forEach(function (k) { o.dom[k] = varie(st, e.dom[k]); }); }
    if (e.rec) o.rec = { m: e.rec.m, n: e.rec.n };
    return o;
  }

  // ---------- Tirage des dossiers ----------
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

  // ---------- Élection ----------
  function election(st) {
    var pct = Math.max(10, Math.min(90, arrondi(sondage(st) + (rnd(st) - 0.5) * 6)));
    var piliers = {}; PK.forEach(function (k) { piliers[k] = st.piliers[k]; });
    return { mandat: st.mandat, t: st.t, pct: pct, gagne: pct > 50, opposant: st.opposant ? OPPOSANTS[st.opposant.i].nom : "l’opposition",
      popu: st.pop, bon: bonheur(st), coh: st.coh, taux: st.taux, amb: promessesTenues(st), piliers: piliers, tresor: st.tresor, dette: st.dette };
  }
  function faillite(st) {
    st.fin = { gagne: false, raison: { type: "faillite", txt: "Faillite municipale : la ville ne peut plus payer ses dépenses, même en empruntant au maximum autorisé." }, t: st.t };
    st.phase = "fin";
  }

  // ---------- Trimestre suivant ----------
  function debutTour(st0, base) {
    if (st0.phase !== "pret" && st0.phase !== "gestion") return st0;    // un dossier attend une décision : rien à rejouer
    var st = copie(st0), notes = [];
    st.t++; st.resultat = null; st.evPerso = null; st.special = null; st.evenement = null;
    var r0 = recettes(st), d0 = depenses(st);
    mouvement(st, r0, "Impôts et recettes de la ville");
    mouvement(st, -d0, "Fonctionnement et entretien des bâtiments");
    var rec = 0; st.recurrents.forEach(function (r) { rec += r.m; r.n--; });
    if (st.recurrents.length) mouvement(st, rec, "Engagements récurrents (" + st.recurrents.length + ")");
    st.recurrents = st.recurrents.filter(function (r) { return r.n > 0; });
    if (st.dette > 0) mouvement(st, -arrondi(st.dette * TAUX), "Intérêts de la dette");
    var restants = [];
    st.prevus.forEach(function (p) {
      if (p.t <= st.t) { var d = appliquer(st, p.e, p.l); notes.push({ txt: p.txt, d: d }); } else restants.push(p);
    });
    st.prevus = restants;
    // La ville vit : sans entretien, chaque pilier recule ; les bâtiments le tirent vers le haut
    var c = cible(st);
    PK.forEach(function (k) { st.base[k] = Math.max(P.plancher, Math.round((st.base[k] - niv(st).usure) * 100) / 100); });
    c = cible(st);
    PK.forEach(function (k) { st.piliers[k] = borne(st.piliers[k] + (c[k] - st.piliers[k]) * P.vit); });
    st.eco = borne(st.eco + (50 - st.eco) * 0.05 - Math.max(0, st.taux - 1) * 3);
    st.humeur = arrondi(st.humeur * P.humeurVit);
    var cib = bonheur(st) * 0.6 + st.coh * 0.2 + 14 - trimMandat(st) * P.usurePop - st.dette / P.detteImpop - (st.coh < 40 ? 4 : 0) - Math.max(0, st.taux - 1) * 30;
    st.pop = borne(st.pop + (cib - st.pop) * P.popVit);
    if (st.meca.ligne) st.coh = borne(st.coh + (50 - st.coh) * 0.03);
    var ok = financement(st); suivre(st);
    st.rapport = { t: st.t, recettes: r0, depenses: d0, solde: arrondi(r0 - d0 + rec) };
    st.notes = notes;
    if (!ok) { faillite(st); return st; }
    if (st.t >= prochaineElection(st)) {
      var el = election(st); st.elections.push(el);
      if (!el.gagne) { st.fin = { gagne: false, raison: { type: "election", txt: "Les Parisiens ont choisi " + el.opposant + " : tu n’obtiens que " + String(el.pct).replace(".", ",") + " % des voix." }, t: st.t }; st.phase = "fin"; return st; }
      st.mandat++; st.debutMandat = st.t; st.pop = borne(st.pop + 5);
      if (st.meca.opposant) tirerOpposant(st);
      st.phase = "election"; return st;
    }
    return tirerDossier(st, base);
  }
  function continuer(st0, base) { if (st0.phase !== "election") return st0; return tirerDossier(copie(st0), base); }
  function tirerDossier(st, base) {
    var o = st.opposant, ev = null;
    if (st.meca.opposant && o && o.actif && trimMandat(st) % 4 === 0 && trimMandat(st) > 0) {
      st.evPerso = attaque(st); st.evenement = st.evPerso.id; st.special = "opposition"; st.phase = "evenement"; return st;
    }
    if (st.meca.cata) {
      var r = rnd(st);
      if (r < P.cata) { ev = tirer(st, base, "catastrophe"); if (ev) st.special = "catastrophe"; }
      else if (r < P.cata + P.chance) { ev = tirer(st, base, "chance"); if (ev) st.special = "chance"; }
    }
    if (!ev) ev = tirer(st, base);
    st.vus[ev.id] = st.t; st.cats.push(ev.cat); if (st.cats.length > 6) st.cats.shift();
    if (st.special === "catastrophe") stats(st).catastrophes++; else if (st.special === "chance") stats(st).chances++;
    st.evenement = ev.id; st.phase = "evenement";
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
    return { id: "opp-" + st.t, cat: "opposition", titre: o.nom + " " + a.titre, attaque: e,
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

  // ---------- Décision sur le dossier du trimestre ----------
  function choisir(st0, base, i) {
    if (st0.phase !== "evenement") return st0;
    if (st0.evPerso) {
      if (!st0.evPerso.choix[i]) return st0;
      var so = copie(st0), ro = choisirOpposition(so, i), co = so.evPerso.choix[i];
      so.historique.push({ t: so.t, titre: so.evPerso.titre, choix: co.t, d: ro.d, sp: "opposition", c: "opposition" });
      so.resultat = { i: i, d: ro.d, extra: ro.extra, txt: ro.txt };
      so.phase = "gestion"; so.resultatVu = false;
      if (!financement(so)) faillite(so); suivre(so);
      return so;
    }
    var ev = base.parId[st0.evenement]; if (!ev || !ev.choix[i]) return st0;
    var st = copie(st0), c = ev.choix[i], lib = ev.titre + " : " + c.t;
    var e = varier(st, c.e), d = appliquer(st, e, lib), extra = [];
    var a = st.meca.ligne ? (c.ali && c.ali[LETTRE[st.ligne]]) || 0 : 0;
    if (a) {
      var urgence = ev.cat === "crise" || ev.cat === "catastrophe";
      if (a <= -3 && !urgence) stats(st).trahisons++;
      d = appliquer(st, { coh: arrondi(a > 0 ? a * P.aliPlus : a * (urgence ? 0.8 : P.aliMoins)) }, lib, d);
      if (a <= -3 && !urgence && rnd(st) < 0.6) { d = appliquer(st, { pop: -2 }, lib, d); extra.push("Une partie de ton électorat se sent trahie."); }
    }
    if (e && e.dom) Object.keys(e.dom).forEach(function (k) {
      if (st.ambitions.indexOf(VERS[k]) >= 0 && e.dom[k] > 0) { d = appliquer(st, { pop: 1 }, lib, d); extra.push("Les Parisiens voient que tu tiens ta promesse sur « " + PILIERS[VERS[k]] + " »."); }
    });
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
    if (e && e.bud < 0) x.depenses += -e.bud;
    st.resultat = { i: i, d: d, surprise: surprise, extra: extra, rec: e && e.rec ? e.rec : null, dif: (c.dif || []).length };
    st.historique.push({ t: st.t, titre: ev.titre, choix: c.t, d: d, sp: st.special || "", c: ev.cat });
    if (st.historique.length > 300) st.historique.splice(0, st.historique.length - 300);
    st.phase = "gestion"; st.resultatVu = false;
    if (!financement(st)) faillite(st); suivre(st);
    return st;
  }

  // ---------- Boutique et budget ----------
  function disponible(st, id) { var B = BATIMENTS[id]; return !!(B && st.meca[TIER_MECA[B.tier]]); }
  function peutAcheter(st, id) {
    var B = BATIMENTS[id];
    if (!B || st.phase === "fin") return "Impossible pour l’instant.";
    if (!disponible(st, id)) return "Se débloque plus tard.";
    if (B.unique && st.bat[id]) return "Déjà réalisé.";
    if (prix(st, id) > st.tresor + (PLAFOND_DETTE - st.dette) * 0.5) return "Pas assez d’argent, même en empruntant.";
    return "";
  }
  function acheter(st0, id) {
    if (peutAcheter(st0, id)) return st0;
    var st = copie(st0), B = BATIMENTS[id], px = prix(st0, id), x = stats(st);
    st.bat[id] = (st.bat[id] || 0) + 1;
    mouvement(st, -px, B.nom);
    x.achats++; x.bats[id] = (x.bats[id] || 0) + 1; x.investi += px;
    if (B.eco) st.eco = borne(st.eco + B.eco);
    var al = st.meca.ligne ? (B.ali && B.ali[LETTRE[st.ligne]]) || 0 : 0;
    if (al) st.coh = borne(st.coh + (al > 0 ? al * 0.5 : al));
    st.pop = borne(st.pop + (B.pop || (px >= 150 ? 1 : 0.3)));
    if (!financement(st)) faillite(st); suivre(st);
    st.historique.push({ t: st.t, titre: B.ico + " " + B.nom, choix: "Acheté pour " + px + " M€", d: { pop: 0, bon: 0, coh: 0, bud: -px, pil: {} }, c: "achat" });
    return st;
  }
  function duree(t) { return t < 4 ? t + " trimestre" + (t > 1 ? "s" : "") : String(Math.round(t / 4 * 10) / 10).replace(".", ",") + " ans"; }
  // Démission : la partie s'arrête tout de suite (le bilan et l'XP sont comptés comme pour une fin normale)
  function demissionner(st0) {
    if (st0.phase === "fin") return st0;
    var st = copie(st0);
    st.fin = { gagne: false, raison: { type: "demission", txt: "Tu as remis ta démission au Conseil de Paris au bout de " + duree(st.t) + "." }, t: st.t };
    st.phase = "fin"; st.evPerso = null;
    return st;
  }
  function regler(st0, o) {
    if (st0.phase === "fin" || !st0.meca.budget) return st0;
    var st = copie(st0);
    if (o.taux != null) st.taux = Math.max(0.8, Math.min(1.3, Math.round(o.taux * 100) / 100));
    return st;
  }

  // ---------- Reprise d'une sauvegarde ----------
  function reprendre(st0, base) {
    if (st0.phase !== "evenement" || st0.evPerso || base.parId[st0.evenement]) return st0;
    var st = copie(st0), ev = tirer(st, base);
    st.vus[ev.id] = st.t; st.evenement = ev.id; st.special = null;
    return st;
  }

  // ---------- Bilan et explications ----------
  function bilan(st) {
    var gagnes = st.elections.filter(function (e) { return e.gagne; }).length, t = st.fin ? st.fin.t : st.t;
    var score = Math.round(t * 12 + gagnes * 150 + bonheur(st) * 2 + stats(st).achats * 3 + Math.max(-100, Math.min(100, (st.tresor - st.dette) / 10)));
    var poids = st.historique.filter(function (h) { return h.c !== "achat"; }).map(function (h) { return { t: h.t, titre: h.titre, choix: h.choix, v: h.d.pop + h.d.bon }; })
      .sort(function (a, b) { return a.v - b.v; });
    return { score: Math.max(0, score), mandats: gagnes, t: t, annees: t / 4, bonheur: bonheur(st), pires: poids.slice(0, 5), meilleures: poids.slice(-5).reverse() };
  }
  function analyse(st) {
    if (!st.fin || st.fin.raison.type === "demission") return null;
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
    MECANIQUES: MECANIQUES, mecaniques: mecaniques, BATIMENTS: BATIMENTS, OPPOSANTS: OPPOSANTS, SEUIL_OPP: SEUIL_OPP, LIGNES: LIGNES, CATS: CATS,
    FAMILLE: FAMILLE, SPECIAUX: SPECIAUX,
    nouvellePartie: nouvellePartie, debutTour: debutTour, continuer: continuer, choisir: choisir, acheter: acheter, peutAcheter: peutAcheter,
    disponible: disponible, prix: prix, regler: regler, demissionner: demissionner, duree: duree, reprendre: reprendre, bilan: bilan, analyse: analyse, valider: valider, indexer: indexer,
    engagements: engagements, evenementCourant: evenementCourant, stats: stats, opposant: opposant, humeurOpp: humeurOpp, bonheur: bonheur,
    cible: cible, recettes: recettes, depenses: depenses, entretien: entretien, solde: solde, sondage: sondage, trimMandat: trimMandat,
    prochaineElection: prochaineElection, promessesTenues: promessesTenues };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Maire = API;
})(this);
