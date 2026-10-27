// Maire de Paris : progression du joueur (XP et niveaux, 100 succès, défi du jour et 3 quêtes du jour).
// Tout est calculé à partir du bilan d'une partie terminée ; le profil est gardé dans le navigateur.
(function (root) {
  "use strict";
  var CLE = "maire_profil_v1";
  var RANG = { facile: 0, moyen: 1, difficile: 2 };
  var NOM_NIV = { facile: "Facile", moyen: "Moyen", difficile: "Réaliste" };
  var XP_ELECTION = { facile: 60, moyen: 120, difficile: 200 }, XP_TIER = [0, 25, 50, 100, 200];
  var XP_DEFI = 150, XP_DEFI_BONUS = 50, NIV_MAX = 50;
  var TITRES = [[1, "Conseiller de quartier"], [3, "Conseiller d’arrondissement"], [6, "Adjoint au maire"], [10, "Maire d’arrondissement"],
    [15, "Premier adjoint"], [20, "Maire de Paris"], [30, "Maire emblématique"], [40, "Bâtisseur de Paris"], [50, "Légende de l’Hôtel de Ville"]];

  // ---------- Jours, hasard reproductible ----------
  function jour(d) { d = d || new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
  function graine(n) { var x = (n * 2654435761) >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x45d9f3b) >>> 0; x ^= x >>> 16; return x >>> 0; }
  function generateur(g) {
    var s = g | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function melange(l, r) { l = l.slice(); for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; } return l; }

  // ---------- XP et niveaux ----------
  function xpPour(n) { return n <= 1 ? 0 : Math.round(50 * Math.pow(n - 1, 1.7)); }
  function niveau(xp) {
    var n = 1; while (n < NIV_MAX && xp >= xpPour(n + 1)) n++;
    var t = TITRES[0][1]; TITRES.forEach(function (x) { if (n >= x[0]) t = x[1]; });
    var a = xpPour(n), b = n < NIV_MAX ? xpPour(n + 1) : a;
    return { n: n, titre: t, xp: xp, depuis: xp - a, besoin: b - a, pct: n < NIV_MAX ? Math.round((xp - a) / (b - a) * 100) : 100, max: n >= NIV_MAX };
  }

  // ---------- Profil (navigateur) ----------
  function profilVide() {
    return { v: 2, xp: 0, parties: 0, mandats: 0, mandatsNiv: { facile: 0, moyen: 0, difficile: 0 }, mandatsLigne: {}, realLigne: {}, meilleurMandats: 0,
      construits: 0, bats: {}, elims: 0, contres: 0, catas: 0, chances: 0, defis: 0, defiJours: {}, quetesTot: 0, quetesJour: {}, succes: {},
      scoreMax: 0, pertes: {}, nuireOk: 0, mois: 0 };
  }
  function lire() {
    try {
      var p = JSON.parse(localStorage.getItem(CLE) || "null");
      if (p && p.v === 2) return Object.assign(profilVide(), p);
      // Profil de l'ancienne version (mandats de 100 semaines) : on garde l'XP, les succès et les quêtes du jour
      if (p && p.v === 1) { var n = profilVide(); n.xp = p.xp || 0; n.succes = p.succes || {}; n.quetesTot = p.quetesTot || 0; n.defis = p.defis || 0; return n; }
    } catch (e) {}
    return profilVide();
  }
  function ecrire(p) { try { localStorage.setItem(CLE, JSON.stringify(p)); } catch (e) {} }

  // ---------- Résumé d'une partie terminée (tout ce qu'il faut pour les quêtes et les succès) ----------
  function resume(st, M) {
    var b = M.bilan(st), x = M.stats(st), gagnees = (st.elections || []).filter(function (e) { return e.gagne; });
    var parArr = st.arr.map(function (a) { var n = 0; Object.keys(a.bat).forEach(function (k) { n += a.bat[k]; }); return n; });
    return { niveau: st.niveau || "moyen", rang: RANG[st.niveau || "moyen"], ligne: st.ligne, ambitions: st.ambitions,
      mandats: gagnees.length, mois: st.fin ? st.fin.mois : st.mois, perte: st.fin ? st.fin.raison.type : null,
      habitants: b.habitants, score: b.score, x: x, el: gagnees, elTous: st.elections || [], parArr: parArr,
      oppForce0: 0, defi: st.defi != null ? st.defi : null };
  }
  function uneElection(R, f) { return R.el.some(f); }

  // ---------- Quêtes : chaque type sait vérifier un résumé de partie ----------
  function nmin(q, R) { return R.rang >= (q.nmin || 0); }
  var QUETE = {
    mandats: function (q, R) { return R.mandats >= q.n && nmin(q, R) && (!q.ligne || R.ligne === q.ligne) && (!q.amb || R.ambitions.indexOf(q.amb) >= 0); },
    annees: function (q, R) { return R.mois >= q.n * 12 && nmin(q, R); },
    sieges: function (q, R) { return uneElection(R, function (e) { return e.sieges >= q.v; }); },
    voix: function (q, R) { return uneElection(R, function (e) { return e.pct >= q.v; }); },
    habitants: function (q, R) { return R.x.habMax >= q.v && nmin(q, R); },
    construire: function (q, R) { return (R.x.bats[q.b] || 0) >= q.n; },
    construits: function (q, R) { return R.x.construits >= q.n; },
    investi: function (q, R) { return R.x.investi >= q.v; },
    arrComplet: function (q, R) { return R.parArr.some(function (n) { return n >= q.n; }); },
    arrPartout: function (q, R) { return R.parArr.every(function (n) { return n >= q.n; }); },
    tresor: function (q, R) { return (R.x.tresorMax || 0) >= q.v; },
    sansDette: function (q, R) { return R.mandats >= 1 && R.x.detteMax === 0 && nmin(q, R); },
    detteMax: function (q, R) { return R.mandats >= 1 && R.x.detteMax <= q.v; },
    jauge: function (q, R) { return uneElection(R, function (e) { return e[q.j] >= q.v; }) && nmin(q, R); },
    amb: function (q, R) { return uneElection(R, function (e) { return e.amb.indexOf(q.d) >= 0; }) && nmin(q, R); },
    deuxAmb: function (q, R) { return uneElection(R, function (e) { return e.amb.length === 2; }) && nmin(q, R); },
    paire: function (q, R) { return uneElection(R, function (e) { return e.amb.indexOf(q.a) >= 0 && e.amb.indexOf(q.b) >= 0; }); },
    dom: function (q, R) { return uneElection(R, function (e) { return e.dom[q.d] >= q.v; }) && nmin(q, R); },
    domMin: function (q, R) { return uneElection(R, function (e) { return Object.keys(e.dom).every(function (k) { return e.dom[k] >= q.v; }); }); },
    arrBon: function (q, R) { return uneElection(R, function (e) { return e.bonMin >= q.v; }); },
    arrGagnes: function (q, R) { return uneElection(R, function (e) { return e.arrGagnes >= q.n; }); },
    taux: function (q, R) { return uneElection(R, function (e) { return q.max ? e.taux <= q.v : e.taux >= q.v; }); },
    cat: function (q, R) { return (R.x.cats[q.c] || 0) >= q.n; },
    catastrophes: function (q, R) { return R.x.catastrophes >= q.n; },
    chance: function (q, R) { return R.x.chances >= q.n; },
    opp: function (q, R) { return (q.s === "contre" ? R.x.contre + R.x.mobilise : R.x[q.s]) >= q.n; },
    oppIntact: function (q, R) { return R.mandats >= 1 && R.x.subi === 0 && R.x.nuireKo === 0; },
    score: function (q, R) { return R.score >= q.v && nmin(q, R); },
    fidele: function (q, R) { return R.mandats >= 1 && R.x.trahisons <= q.n && (!q.ligne || R.ligne === q.ligne); },
    econome: function (q, R) { return R.mandats >= 1 && R.x.depenses <= q.v; },
    genereux: function (q, R) { return R.mandats >= 1 && R.x.depenses >= q.v; }
  };
  function queteFaite(q, R) { var f = QUETE[q.k]; return !!(f && f(q, R)); }
  function quetesDuJour(j, liste) {
    if (!liste || liste.length < 3) return [];
    var ordre = melange(liste.map(function (q, i) { return i; }), generateur(20251)), k = (j * 3) % ordre.length;
    return [0, 1, 2].map(function (d) { return liste[ordre[(k + d) % ordre.length]]; });
  }

  // ---------- Défi du jour : même départ pour tout le monde ----------
  function defiDuJour(j, M, lots, minEvts) {
    var r = generateur(graine(j)), L = Object.keys(M.LIGNES), D = Object.keys(M.DOMAINES);
    var amb = melange(D, r).slice(0, 2), ligne = L[Math.floor(r() * L.length)], niv = ["moyen", "facile", "difficile"][j % 3];
    var choisis = [], n = 0;
    melange(lots, r).forEach(function (l) { if (n < (minEvts || 900)) { choisis.push(l.f); n += l.n; } });
    return { jour: j, graine: graine(j * 7 + 3) || 1, niveau: niv, ligne: ligne, ambitions: amb, lots: choisis };
  }

  // ---------- 100 succès ----------
  var S = [];
  function s(id, nom, desc, t, f) { S.push({ id: id, nom: nom, desc: desc, t: t, f: f }); }
  [[1, 1, "Premier mandat", "Termine ta première partie."], [5, 1, "Habitué de l’Hôtel de Ville", "Joue 5 parties."], [10, 2, "Vieux routier", "Joue 10 parties."],
    [25, 2, "Pilier du Conseil", "Joue 25 parties."], [50, 3, "Institution parisienne", "Joue 50 parties."], [100, 4, "Inamovible", "Joue 100 parties."]]
    .forEach(function (a) { s("parties" + a[0], a[2], a[3], a[1], function (R, P) { return P.parties >= a[0]; }); });
  [[1, 1, "Réélu !", "Gagne ta première élection."], [2, 2, "Deuxième mandat… réussi", "Gagne 2 élections dans une même partie."], [3, 2, "Indéboulonnable", "Gagne 3 élections dans une même partie."],
    [5, 3, "Maire à vie", "Gagne 5 élections dans une même partie."], [8, 4, "Dynastie", "Gagne 8 élections dans une même partie."]]
    .forEach(function (a) { s("mandats" + a[0], a[2], a[3], a[1], function (R) { return R.mandats >= a[0]; }); });
  [[10, 2, "Élu en série", "Gagne 10 élections au total."], [25, 3, "Bête politique", "Gagne 25 élections au total."], [50, 4, "Monument de Paris", "Gagne 50 élections au total."]]
    .forEach(function (a) { s("mandatsTot" + a[0], a[2], a[3], a[1], function (R, P) { return P.mandats >= a[0]; }); });
  s("eFacile", "Premiers pas", "Gagne une élection en Facile.", 1, function (R) { return R.mandats >= 1 && R.niveau === "facile"; });
  s("eMoyen", "Maire confirmé", "Gagne une élection en Moyen.", 2, function (R) { return R.mandats >= 1 && R.niveau === "moyen"; });
  s("eReal", "Réaliste et réélu", "Gagne une élection en Réaliste.", 3, function (R) { return R.mandats >= 1 && R.niveau === "difficile"; });
  s("eReal3", "Dompteur de Paris", "Gagne 3 élections d’affilée en Réaliste.", 4, function (R) { return R.mandats >= 3 && R.niveau === "difficile"; });
  var LG = { gauche: "Gauche", centre: "Centre", droite: "Droite", ecologie: "Écologie" };
  Object.keys(LG).forEach(function (l) {
    s("eL_" + l, "Réélu : " + LG[l], "Gagne une élection avec la ligne " + LG[l] + ".", 1, function (R) { return R.mandats >= 1 && R.ligne === l; });
    s("eRL_" + l, "Réaliste : " + LG[l], "Gagne une élection en Réaliste avec la ligne " + LG[l] + ".", 3, function (R) { return R.mandats >= 1 && R.niveau === "difficile" && R.ligne === l; });
  });
  s("eToutes", "Caméléon", "Gagne une élection avec chacune des quatre lignes politiques.", 3, function (R, P) { return Object.keys(LG).every(function (l) { return P.mandatsLigne[l]; }); });
  s("sieges100", "Large majorité", "Gagne une élection avec au moins 100 sièges.", 2, function (R) { return uneElection(R, function (e) { return e.sieges >= 100; }); });
  s("sieges120", "Raz-de-marée", "Gagne une élection avec au moins 120 sièges.", 3, function (R) { return uneElection(R, function (e) { return e.sieges >= 120; }); });
  s("grandChelem", "Grand chelem", "Arrive en tête dans les 20 arrondissements.", 4, function (R) { return uneElection(R, function (e) { return e.arrGagnes >= 20; }); });
  s("battu", "Défaite électorale", "Perds une élection.", 1, function (R) { return R.perte === "election"; });
  s("ruine", "Ruiné", "Perds une partie par faillite.", 1, function (R) { return R.perte === "faillite"; });
  s("amb1", "Promesse tenue", "Gagne une élection en tenant au moins une ambition.", 1, function (R) { return uneElection(R, function (e) { return e.amb.length >= 1; }); });
  s("amb2", "Parole d’honneur", "Gagne une élection en tenant tes deux ambitions.", 2, function (R) { return uneElection(R, function (e) { return e.amb.length === 2; }); });
  s("amb2Real", "Promesses de fer", "Gagne une élection en Réaliste en tenant tes deux ambitions.", 4, function (R) { return R.niveau === "difficile" && uneElection(R, function (e) { return e.amb.length === 2; }); });
  var DOMS = { securite: ["Shérif de Paris", "Sécurité"], proprete: ["Paris étincelant", "Propreté"], logement: ["Toit pour tous", "Logement"],
    transports: ["Ville fluide", "Transports"], ecologie: ["Capitale verte", "Écologie"], achat: ["Porte-monnaie des Parisiens", "Pouvoir d’achat"],
    economie: ["Paris qui gagne", "Économie"], services: ["Service public modèle", "Services publics"] };
  Object.keys(DOMS).forEach(function (d) { s("amb_" + d, DOMS[d][0], "Gagne une élection en tenant l’ambition « " + DOMS[d][1] + " ».", 2, function (R) { return uneElection(R, function (e) { return e.amb.indexOf(d) >= 0; }); }); });
  [[1, 1, "Première pierre", "Construis ton premier bâtiment."], [25, 1, "Bâtisseur", "Construis 25 bâtiments dans une partie."], [75, 2, "Grand bâtisseur", "Construis 75 bâtiments dans une partie."],
    [150, 3, "Haussmann moderne", "Construis 150 bâtiments dans une partie."], [300, 4, "Architecte de légende", "Construis 300 bâtiments dans une partie."]]
    .forEach(function (a) { s("bat" + a[0], a[2], a[3], a[1], function (R) { return R.x.construits >= a[0]; }); });
  var BATS = { metro: ["Ligne 15", "Ouvre 5 stations de métro dans une partie."], tram: ["Tramway nommé désir", "Construis 5 lignes de tramway dans une partie."],
    parc: ["Poumon vert", "Aménage 15 parcs dans une partie."], logements: ["Bailleur social", "Construis 20 ensembles de logements sociaux dans une partie."],
    police: ["Ordre public", "Ouvre 10 commissariats dans une partie."], ecole: ["Ministre de l’éducation", "Construis 15 écoles dans une partie."],
    marche: ["Halles de Paris", "Ouvre 10 marchés couverts dans une partie."], pepiniere: ["Start-up nation", "Ouvre 10 pépinières d’entreprises dans une partie."] };
  var NB = { metro: 5, tram: 5, parc: 15, logements: 20, police: 10, ecole: 15, marche: 10, pepiniere: 10 };
  Object.keys(BATS).forEach(function (id) { s("b_" + id, BATS[id][0], BATS[id][1], id === "metro" || id === "logements" ? 3 : 2, function (R) { return (R.x.bats[id] || 0) >= NB[id]; }); });
  s("arr10", "Quartier modèle", "Construis 10 bâtiments dans un même arrondissement.", 2, function (R) { return R.parArr.some(function (n) { return n >= 10; }); });
  s("partout", "Maire de tous les quartiers", "Construis au moins 2 bâtiments dans chacun des 20 arrondissements.", 3, function (R) { return R.parArr.every(function (n) { return n >= 2; }); });
  s("hab2300", "Ville attractive", "Atteins 2,3 millions d’habitants.", 2, function (R) { return R.x.habMax >= 2300; });
  s("hab2500", "Métropole", "Atteins 2,5 millions d’habitants.", 3, function (R) { return R.x.habMax >= 2500; });
  s("tresor2000", "Bas de laine", "Accumule 2 milliards en caisse.", 2, function (R) { return R.x.tresorMax >= 2000; });
  s("sansDette", "Zéro dette", "Gagne une élection sans jamais avoir emprunté.", 2, function (R) { return R.mandats >= 1 && R.x.detteMax === 0; });
  s("sansDetteReal", "Rigueur réaliste", "Gagne une élection en Réaliste sans jamais avoir emprunté.", 4, function (R) { return R.mandats >= 1 && R.niveau === "difficile" && R.x.detteMax === 0; });
  s("impots", "Robin des bois", "Gagne une élection avec des impôts à 90 % ou moins.", 3, function (R) { return uneElection(R, function (e) { return e.taux <= 0.9; }); });
  s("pop70", "Chouchou des Parisiens", "Gagne une élection avec une popularité d’au moins 70.", 2, function (R) { return uneElection(R, function (e) { return e.popu >= 70; }); });
  s("bon65", "Ville heureuse", "Gagne une élection avec un bonheur d’au moins 65.", 2, function (R) { return uneElection(R, function (e) { return e.bon >= 65; }); });
  s("bon75", "Paradis parisien", "Gagne une élection avec un bonheur d’au moins 75.", 3, function (R) { return uneElection(R, function (e) { return e.bon >= 75; }); });
  s("harmonie", "Ville harmonieuse", "Gagne une élection avec tous les domaines à 55 ou plus.", 3, function (R) { return uneElection(R, function (e) { return Object.keys(e.dom).every(function (k) { return e.dom[k] >= 55; }); }); });
  s("aucunOublie", "Aucun quartier oublié", "Gagne une élection avec tous les arrondissements à 50 de bonheur ou plus.", 3, function (R) { return uneElection(R, function (e) { return e.bonMin >= 50; }); });
  s("opp1", "Riposte", "Contre une attaque de ton opposant.", 1, function (R) { return R.x.contre + R.x.mobilise >= 1; });
  s("oppNuire", "Coup de maître", "Réussis à faire tomber ton opposant (influence divisée par deux).", 1, function (R) { return R.x.nuireOk >= 1; });
  s("oppElim", "Place nette", "Pousse un opposant à renoncer.", 2, function (R) { return R.x.elimines >= 1; });
  s("oppElim3", "Faiseur de rois", "Pousse 3 opposants à renoncer dans une partie.", 3, function (R) { return R.x.elimines >= 3; });
  s("opp25", "Mur de l’Hôtel de Ville", "Contre 25 attaques au total.", 3, function (R, P) { return P.contres >= 25; });
  s("oppIntact", "Téflon", "Gagne une élection sans qu’aucune attaque ne t’ait atteint.", 3, function (R) { return R.mandats >= 1 && R.x.subi === 0 && R.x.nuireKo === 0; });
  s("cata3", "Gardien de la ville", "Affronte 3 catastrophes dans une partie.", 2, function (R) { return R.x.catastrophes >= 3; });
  s("chance1", "Bonne étoile", "Profite d’un coup de chance.", 1, function (R) { return R.x.chances >= 1; });
  s("ans12", "Douze ans de règne", "Tiens 12 ans à l’Hôtel de Ville.", 2, function (R) { return R.mois >= 144; });
  s("ans24", "Une génération", "Tiens 24 ans à l’Hôtel de Ville.", 3, function (R) { return R.mois >= 288; });
  s("eclair", "Mandat éclair", "Fais faillite avant ta première élection.", 1, function (R) { return R.perte === "faillite" && R.mandats === 0; });
  [[1000, 1], [1500, 2], [2000, 2], [3000, 3], [4000, 4]].forEach(function (a) {
    s("score" + a[0], "Score de " + a[0], "Atteins un score d’au moins " + a[0] + ".", a[1], function (R) { return R.score >= a[0]; });
  });
  s("defi1", "Défi relevé", "Réussis un défi du jour.", 1, function (R, P) { return P.defis >= 1; });
  s("defi7", "Semaine parfaite", "Réussis 7 défis du jour.", 2, function (R, P) { return P.defis >= 7; });
  s("defi30", "Mois de défis", "Réussis 30 défis du jour.", 4, function (R, P) { return P.defis >= 30; });
  [[1, 1, "Première quête", "Accomplis une quête du jour."], [10, 1, "Aventurier", "Accomplis 10 quêtes."], [50, 2, "Chasseur de quêtes", "Accomplis 50 quêtes."],
    [100, 3, "Centurion", "Accomplis 100 quêtes."]]
    .forEach(function (a) { s("quetes" + a[0], a[2], a[3], a[1], function (R, P) { return P.quetesTot >= a[0]; }); });
  s("quetes3", "Journée parfaite", "Accomplis les 3 quêtes d’une même journée.", 2, function (R, P) { return (P.quetesJour[jour()] || []).length >= 3; });
  [[5, 1], [10, 2], [20, 3], [30, 3], [50, 4]].forEach(function (a) {
    s("niv" + a[0], "Niveau " + a[0], "Atteins le niveau " + a[0] + ".", a[1], function (R, P) { return niveau(P.xp).n >= a[0]; });
  });
  s("fidele", "Fidèle", "Gagne une élection sans jamais avoir renié ta ligne.", 2, function (R) { return R.mandats >= 1 && R.x.trahisons === 0; });
  s("dossiers100", "Bourreau de travail", "Traite 100 dossiers dans une partie.", 2, function (R) { return R.x.dossiers >= 100; });

  // ---------- Fin de partie : tout ce que la partie rapporte ----------
  function terminer(st, M, opts) {
    opts = opts || {};
    var P = lire(), R = resume(st, M), j = opts.jour != null ? opts.jour : jour(), avant = niveau(P.xp), gains = [], nouveaux = [], quetes = [];
    function gagne(txt, xp) { if (xp > 0) { gains.push({ txt: txt, xp: xp }); P.xp += xp; } }
    P.parties++; if (R.score > P.scoreMax) P.scoreMax = R.score;
    P.mandats += R.mandats; P.mandatsNiv[R.niveau] += R.mandats; P.meilleurMandats = Math.max(P.meilleurMandats, R.mandats); P.mois += R.mois;
    if (R.mandats) { P.mandatsLigne[R.ligne] = (P.mandatsLigne[R.ligne] || 0) + R.mandats; if (R.niveau === "difficile") P.realLigne[R.ligne] = 1; }
    if (R.perte) P.pertes[R.perte] = (P.pertes[R.perte] || 0) + 1;
    P.construits += R.x.construits; Object.keys(R.x.bats).forEach(function (k) { P.bats[k] = (P.bats[k] || 0) + R.x.bats[k]; });
    P.elims += R.x.elimines; P.contres += R.x.contre + R.x.mobilise; P.catas += R.x.catastrophes; P.chances += R.x.chances; P.nuireOk += R.x.nuireOk;
    gagne("Mois à l’Hôtel de Ville", Math.min(150, Math.round(R.mois / 2)));
    if (R.mandats) gagne(R.mandats + " élection" + (R.mandats > 1 ? "s" : "") + " gagnée" + (R.mandats > 1 ? "s" : "") + " (" + NOM_NIV[R.niveau] + ")", XP_ELECTION[R.niveau] * R.mandats);
    gagne("Bâtiments construits", Math.min(100, Math.round(R.x.construits / 2)));
    // Défi du jour : réussi si tu gagnes au moins une élection ; récompensé une fois, le jour même
    if (R.defi != null && R.defi === j && !P.defiJours[j]) {
      P.defiJours[j] = { score: R.score, mandats: R.mandats };
      if (R.mandats >= 1) { P.defis++; gagne("Défi du jour réussi", XP_DEFI); if (R.mandats >= 2) gagne("Défi du jour : deux élections gagnées", XP_DEFI_BONUS); }
    }
    Object.keys(P.defiJours).forEach(function (k) { if (+k < j - 60) delete P.defiJours[k]; });
    var faites = P.quetesJour[j] || [];
    (opts.quetes || []).forEach(function (q) {
      if (faites.indexOf(q.id) < 0 && queteFaite(q, R)) { faites.push(q.id); P.quetesTot++; quetes.push(q); gagne("Quête : " + q.t, q.xp); }
    });
    P.quetesJour = {}; P.quetesJour[j] = faites;
    for (var tour = 0; tour < 3; tour++) {
      var n0 = nouveaux.length;
      S.forEach(function (x) {
        if (P.succes[x.id]) return;
        var ok = false; try { ok = x.f(R, P); } catch (e) { ok = false; }
        if (ok) { P.succes[x.id] = j; nouveaux.push(x); gagne("Succès : " + x.nom, XP_TIER[x.t]); }
      });
      if (nouveaux.length === n0) break;
    }
    ecrire(P);
    return { gains: gains, total: gains.reduce(function (a, g) { return a + g.xp; }, 0), nouveaux: nouveaux, quetes: quetes, avant: avant, apres: niveau(P.xp), profil: P };
  }

  var API = { jour: jour, niveau: niveau, xpPour: xpPour, lire: lire, ecrire: ecrire, profilVide: profilVide, resume: resume, terminer: terminer,
    quetesDuJour: quetesDuJour, queteFaite: queteFaite, TYPES_QUETES: Object.keys(QUETE), defiDuJour: defiDuJour, SUCCES: S, XP_TIER: XP_TIER,
    NOM_NIV: NOM_NIV, TITRES: TITRES };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MaireProg = API;
})(this);
