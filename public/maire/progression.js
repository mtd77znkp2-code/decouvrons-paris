// Maire de Paris : progression du joueur. XP et niveaux (qui débloquent les mécaniques du jeu), l'histoire racontée
// par Léon en 9 chapitres, le guide intégré au jeu, 100 succès, le défi du jour et 3 quêtes du jour.
// Succès, quêtes et chapitres sont vérifiés en pleine partie (suivrePartie) et l'XP est versée au profil aussitôt ;
// la fin de partie (terminer) ne compte que ce qui reste. Le profil est gardé dans le navigateur.
(function (root) {
  "use strict";
  var MO = (typeof module !== "undefined" && module.exports) ? require("./moteur.js") : root.Maire;
  var CLE = "maire_profil_v1";
  var RANG = { facile: 0, moyen: 1, difficile: 2 };
  var NOM_NIV = { facile: "Facile", moyen: "Moyen", difficile: "Réaliste" };
  var XP_ELECTION = { facile: 60, moyen: 120, difficile: 200 }, XP_TIER = [0, 10, 25, 50, 100], XP_CHAPITRE = 100;
  var XP_DEFI = 150, XP_DEFI_BONUS = 50, NIV_MAX = MO.NIV_MAX, NIV_DEFI = 8, NIV_QUETES = 2;
  var TITRES = [[1, "Maire débutant"], [3, "Maire en rodage"], [6, "Maire aguerri"], [10, "Maire de Paris"],
    [15, "Maire emblématique"], [20, "Bâtisseur de Paris"], [30, "Visionnaire"], [40, "Icône de la capitale"], [50, "Légende de l’Hôtel de Ville"]];

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
  var xpPour = MO.xpPour;
  function niveau(xp) {
    var n = 1; while (n < NIV_MAX && xp >= xpPour(n + 1)) n++;
    var t = TITRES[0][1]; TITRES.forEach(function (x) { if (n >= x[0]) t = x[1]; });
    var a = xpPour(n), b = n < NIV_MAX ? xpPour(n + 1) : a;
    return { n: n, titre: t, xp: xp, depuis: xp - a, besoin: b - a, pct: n < NIV_MAX ? Math.round((xp - a) / (b - a) * 100) : 100, max: n >= NIV_MAX };
  }

  // ---------- L'histoire : un chapitre par mécanique débloquée ----------
  // titre, phrase de Léon (ton directeur de cabinet), objectif du chapitre (récompensé une fois)
  var HISTOIRE = {
    base: { num: 1, titre: "Le premier jour", recit: "Bienvenue ! Je suis Léon, ton directeur de cabinet. Ensemble, rendons Paris plus agréable d’ici 2040.",
      objectif: "Gagne ta première élection.", ok: function (R) { return R.mandats >= 1; } },
    budget: { num: 2, titre: "Le nerf de la guerre", recit: "Le Conseil te laisse fixer les impôts : à manier avec précaution !",
      objectif: "Gagne une élection sans aucune dette.", ok: function (R) { return R.el.some(function (e) { return e.dette === 0; }); } },
    opposant: { num: 3, titre: "L’opposition se réveille", recit: "Ton succès agace : un adversaire se dresse contre toi.",
      objectif: "Pousse un opposant à renoncer.", ok: function (R) { return R.x.elimines >= 1; } },
    boutique2: { num: 4, titre: "Voir plus grand", recit: "Les services techniques te proposent de nouveaux équipements.",
      objectif: "Gagne une élection en Moyen.", ok: function (R) { return R.mandats >= 1 && R.rang >= 1; } },
    cata: { num: 5, titre: "Paris face aux éléments", recit: "Crues, incendies, pannes géantes… Paris doit être prête à tout.",
      objectif: "Gagne une élection après avoir affronté une catastrophe.", ok: function (R) { return R.mandats >= 1 && R.x.catastrophes >= 1; } },
    promesses: { num: 6, titre: "Tenir parole", recit: "Cette fois, tu fais campagne sur deux promesses.",
      objectif: "Gagne une élection en tenant tes deux promesses.", ok: function (R) { return R.el.some(function (e) { return e.amb.length === 2; }); } },
    ligne: { num: 7, titre: "Garder le cap", recit: "Ton camp attend que tu restes fidèle à tes idées.",
      objectif: "Gagne une élection avec une cohérence d’au moins 70.", ok: function (R) { return R.el.some(function (e) { return e.coh >= 70; }); } },
    boutique3: { num: 8, titre: "Les grands chantiers", recit: "Paris voit grand : métro, hôpital, écoquartier…",
      objectif: "Gagne une élection en Réaliste.", ok: function (R) { return R.mandats >= 1 && R.rang >= 2; } },
    projets: { num: 9, titre: "Paris 2040", recit: "Les trois grands projets de Paris 2040 sont sur la table.",
      objectif: "Réalise les trois grands projets de Paris 2040 dans une même partie.", ok: function (R) { return R.bat.jo && R.bat.gpe && R.bat.seine; } }
  };

  // ---------- Profil (navigateur) ----------
  function profilVide() {
    return { v: 3, xp: 0, parties: 0, mandats: 0, mandatsNiv: { facile: 0, moyen: 0, difficile: 0 }, mandatsLigne: {}, meilleurMandats: 0,
      achats: 0, bats: {}, elims: 0, contres: 0, catas: 0, chances: 0, defis: 0, defiJours: {}, quetesTot: 0, quetesJour: {}, succes: {},
      scoreMax: 0, pertes: {}, chapitres: {}, tutos: {},
      objets: {}, secrets: {}, combos: {}, rep: 0, missions: 0, historiques: 0, defiMeilleur: {}, verse: null };
  }
  function lire() {
    try {
      var p = JSON.parse(localStorage.getItem(CLE) || "null");
      if (p && p.v === 3) return Object.assign(profilVide(), p);
      // Profil d'une ancienne version : on garde l'XP et les quêtes accomplies
      if (p && p.xp) { var n = profilVide(); n.xp = p.xp; n.quetesTot = p.quetesTot || 0; n.defis = p.defis || 0; return n; }
    } catch (e) {}
    return profilVide();
  }
  function ecrire(p) { try { localStorage.setItem(CLE, JSON.stringify(p)); } catch (e) {} }
  function nivJoueur() { return niveau(lire().xp).n; }
  // Réservé à l'administrateur : se placer directement à un niveau (les tutoriels déjà vus restent vus)
  function fixerNiveau(n) { var P = lire(); P.xp = xpPour(Math.max(1, Math.min(NIV_MAX, n))); ecrire(P); return P; }
  function oublierTutos() { var P = lire(); P.tutos = {}; ecrire(P); }
  // Le guide du jeu (bulles qui montrent quoi faire) : chaque séquence ne s'affiche qu'une fois
  function guideVu(id) { return !!lire().tutos[id]; }
  function marquerGuide(id) { var P = lire(); P.tutos[id] = 1; ecrire(P); }
  // Découvertes faites pendant une partie (objets, bâtiments secrets, combos) : rangées dans le profil tout de suite,
  // pour qu'elles restent acquises même si la partie n'est jamais terminée
  function synchroniser(st) {
    var P = lire(), nouv = [];
    (st.decouvertes || []).forEach(function (d) {
      var t = d.type === "objet" ? P.objets : d.type === "secret" ? P.secrets : P.combos;
      if (!t[d.id]) { t[d.id] = jour(); nouv.push(d); P.rep = (P.rep || 0) + (d.type === "objet" ? 5 : 10); }
    });
    if (nouv.length) ecrire(P);
    return nouv;
  }
  function reputation(rep, C) { var t = C.REPUTATION[0][1]; C.REPUTATION.forEach(function (x) { if (rep >= x[0]) t = x[1]; }); return t; }
  function chapitre(M, n) { var c = null; M.MECANIQUES.forEach(function (m) { if (n >= m.niv) c = m.id; }); return c; }

  // ---------- Résumé d'une partie terminée ----------
  var FAM = { finances: "budget", economie: "budget", securite: "securite", logement: "logement", transports: "transports", proprete: "cadre", ecologie: "cadre",
    services: "cadre", culture: "cadre", quotidien: "cadre", institutions: "politique", crise: "crise" };
  function resume(st, M) {
    var b = M.bilan(st), x = M.stats(st), gagnees = (st.elections || []).filter(function (e) { return e.gagne; }), fam = {};
    Object.keys(x.cats).forEach(function (c) { var f = FAM[c]; if (f) fam[f] = (fam[f] || 0) + x.cats[c]; });
    return { niveau: st.niveau || "moyen", rang: RANG[st.niveau || "moyen"], ligne: st.ligne, ambitions: st.ambitions, meca: st.meca,
      mandats: gagnees.length, t: st.fin ? st.fin.t : st.t, perte: st.fin ? st.fin.raison.type : null, score: b.score, x: x, fam: fam,
      el: gagnees, bat: st.bat || {}, defi: st.defi != null ? st.defi : null, flags: st.flags || {}, persos: st.persos || {},
      missions: st.missionsOk || [], objets: st.objets || [], combos: st.combos || [], scenario: st.scenario, finDefi: st.fin && st.fin.raison.type === "defi" };
  }
  function une(R, f) { return R.el.some(f); }

  // ---------- Quêtes : chaque type sait vérifier un résumé de partie ----------
  function nmin(q, R) { return R.rang >= (q.nmin || 0); }
  var QUETE = {
    mandats: function (q, R) { return R.mandats >= q.n && nmin(q, R) && (!q.ligne || R.ligne === q.ligne); },
    annees: function (q, R) { return R.t >= q.n * 4 && nmin(q, R); },
    voix: function (q, R) { return une(R, function (e) { return e.pct >= q.v; }) && nmin(q, R); },
    achat: function (q, R) { return (R.x.bats[q.b] || 0) >= q.n; },
    achats: function (q, R) { return R.x.achats >= q.n; },
    investi: function (q, R) { return R.x.investi >= q.v; },
    tresor: function (q, R) { return R.x.tresorMax >= q.v; },
    sansDette: function (q, R) { return R.mandats >= 1 && R.x.detteMax === 0 && nmin(q, R); },
    detteMax: function (q, R) { return R.mandats >= 1 && R.x.detteMax <= q.v; },
    taux: function (q, R) { return une(R, function (e) { return q.max ? e.taux <= q.v : e.taux >= q.v; }); },
    pilier: function (q, R) { return une(R, function (e) { return e.piliers[q.p] >= q.v; }) && nmin(q, R); },
    tousPiliers: function (q, R) { return une(R, function (e) { return Object.keys(e.piliers).every(function (k) { return e.piliers[k] >= q.v; }); }) && nmin(q, R); },
    jauge: function (q, R) { return une(R, function (e) { return e[q.j] >= q.v; }) && nmin(q, R); },
    promesse: function (q, R) { return une(R, function (e) { return e.amb.indexOf(q.p) >= 0; }) && nmin(q, R); },
    deuxPromesses: function (q, R) { return une(R, function (e) { return e.amb.length === 2; }) && nmin(q, R); },
    famille: function (q, R) { return (R.fam[q.f] || 0) >= q.n; },
    catastrophes: function (q, R) { return R.x.catastrophes >= q.n; },
    chance: function (q, R) { return R.x.chances >= q.n; },
    opp: function (q, R) { return (q.s === "contre" ? R.x.contre + R.x.mobilise : R.x[q.s]) >= q.n; },
    oppIntact: function (q, R) { return R.mandats >= 1 && R.x.subi === 0 && R.x.nuireKo === 0; },
    score: function (q, R) { return R.score >= q.v && nmin(q, R); },
    fidele: function (q, R) { return R.mandats >= 1 && R.x.trahisons <= q.n && (!q.ligne || R.ligne === q.ligne); },
    projets: function (q, R) { return ["jo", "gpe", "seine"].filter(function (k) { return R.bat[k]; }).length >= q.n; }
  };
  function queteFaite(q, R) { var f = QUETE[q.k]; return !!(f && f(q, R)); }
  // Trois quêtes par jour, choisies parmi celles que le niveau du joueur permet de réussir
  function quetesDuJour(j, liste, nivJ) {
    var ok = (liste || []).filter(function (q) { return (q.niv || 1) <= (nivJ || NIV_MAX); });
    if (ok.length < 3 || (nivJ || NIV_MAX) < NIV_QUETES) return [];
    var ordre = melange(ok.map(function (q, i) { return i; }), generateur(20251)), k = (j * 3) % ordre.length;
    return [0, 1, 2].map(function (d) { return ok[ordre[(k + d) % ordre.length]]; });
  }

  // ---------- Défi du jour : un scénario imposé, identique pour tout le monde, en 12 trimestres ----------
  function defiDuJour(j, M, lots, minEvts) {
    var r = generateur(graine(j)), L = Object.keys(M.LIGNES), D = Object.keys(M.PILIERS), sc = M.C.DEFIS_JOUR[j % M.C.DEFIS_JOUR.length];
    var amb = melange(D, r).slice(0, 2), ligne = L[Math.floor(r() * L.length)];
    var choisis = [], n = 0;
    melange(lots, r).forEach(function (l) { if (n < (minEvts || 600)) { choisis.push(l.f); n += l.n; } });
    return { jour: j, graine: graine(j * 7 + 3) || 1, niveau: "moyen", ligne: ligne, ambitions: amb, lots: choisis, nivJoueur: NIV_DEFI,
      scenario: sc.id, titre: sc.titre, txt: sc.txt };
  }

  // ---------- 100 succès ----------
  var S = [];
  function s(id, nom, desc, t, f) { S.push({ id: id, nom: nom, desc: desc, t: t, f: f }); }
  [[1, 1, "Premier mandat", "Termine ta première partie."], [5, 1, "Habitué de l’Hôtel de Ville", "Joue 5 parties."], [10, 2, "Vieux routier", "Joue 10 parties."],
    [25, 2, "Pilier du Conseil", "Joue 25 parties."], [50, 3, "Institution parisienne", "Joue 50 parties."], [100, 4, "Inamovible", "Joue 100 parties."]]
    .forEach(function (a) { s("parties" + a[0], a[2], a[3], a[1], function (R, P) { return P.parties >= a[0]; }); });
  [[1, 1, "Réélu !", "Gagne ta première élection."], [2, 2, "Le retour", "Gagne 2 élections dans une même partie."], [3, 2, "Indéboulonnable", "Gagne 3 élections dans une même partie."],
    [5, 3, "Maire à vie", "Gagne 5 élections dans une même partie."], [8, 4, "Dynastie", "Gagne 8 élections dans une même partie."]]
    .forEach(function (a) { s("mandats" + a[0], a[2], a[3], a[1], function (R) { return R.mandats >= a[0]; }); });
  [[10, 2, "Élu en série", "Gagne 10 élections au total."], [25, 3, "Bête politique", "Gagne 25 élections au total."]]
    .forEach(function (a) { s("mandatsTot" + a[0], a[2], a[3], a[1], function (R, P) { return P.mandats >= a[0]; }); });
  s("eFacile", "Premiers pas", "Gagne une élection en Facile.", 1, function (R) { return R.mandats >= 1 && R.niveau === "facile"; });
  s("eMoyen", "Maire confirmé", "Gagne une élection en Moyen.", 2, function (R) { return R.mandats >= 1 && R.niveau === "moyen"; });
  s("eReal", "Réaliste et réélu", "Gagne une élection en Réaliste.", 3, function (R) { return R.mandats >= 1 && R.niveau === "difficile"; });
  s("eReal3", "Dompteur de Paris", "Gagne 3 élections dans une partie en Réaliste.", 4, function (R) { return R.mandats >= 3 && R.niveau === "difficile"; });
  var LG = { gauche: "Gauche", centre: "Centre", droite: "Droite", ecologie: "Écologie" };
  Object.keys(LG).forEach(function (l) {
    s("eL_" + l, "Réélu : " + LG[l], "Gagne une élection avec la ligne " + LG[l] + ".", 2, function (R) { return R.meca.ligne && R.mandats >= 1 && R.ligne === l; });
  });
  s("eToutes", "Caméléon", "Gagne une élection avec chacune des quatre lignes politiques.", 3, function (R, P) { return Object.keys(LG).every(function (l) { return P.mandatsLigne[l]; }); });
  [[55, 1, "Victoire nette"], [60, 2, "Large victoire"], [65, 3, "Raz-de-marée"], [70, 4, "Plébiscite"]].forEach(function (a) {
    s("voix" + a[0], a[2], "Gagne une élection avec au moins " + a[0] + " % des voix.", a[1], function (R) { return une(R, function (e) { return e.pct >= a[0]; }); });
  });
  s("battu", "Défaite électorale", "Perds une élection.", 1, function (R) { return R.perte === "election"; });
  s("ruine", "Ruiné", "Perds une partie par faillite.", 1, function (R) { return R.perte === "faillite"; });
  s("prom1", "Promesse tenue", "Gagne une élection en tenant au moins une promesse.", 2, function (R) { return une(R, function (e) { return e.amb.length >= 1; }); });
  s("prom2", "Parole d’honneur", "Gagne une élection en tenant tes deux promesses.", 2, function (R) { return une(R, function (e) { return e.amb.length === 2; }); });
  s("prom2Real", "Promesses de fer", "Gagne une élection en Réaliste en tenant tes deux promesses.", 4, function (R) { return R.niveau === "difficile" && une(R, function (e) { return e.amb.length === 2; }); });
  var PIL = { logement: ["Toit pour tous", "🏠 Logement"], transports: ["Ville fluide", "🚇 Transports"], cadre: ["Capitale verte", "🌳 Cadre de vie"], securite: ["Ville sûre", "🛡️ Sécurité"] };
  Object.keys(PIL).forEach(function (p) {
    s("p70_" + p, PIL[p][0], "Gagne une élection avec le pilier " + PIL[p][1] + " à 70 ou plus.", 2, function (R) { return une(R, function (e) { return e.piliers[p] >= 70; }); });
    s("p85_" + p, PIL[p][0] + " (or)", "Gagne une élection avec le pilier " + PIL[p][1] + " à 85 ou plus.", 3, function (R) { return une(R, function (e) { return e.piliers[p] >= 85; }); });
  });
  s("harmonie", "Ville harmonieuse", "Gagne une élection avec les 4 piliers à 60 ou plus.", 3, function (R) { return une(R, function (e) { return Object.keys(e.piliers).every(function (k) { return e.piliers[k] >= 60; }); }); });
  s("bon70", "Ville heureuse", "Gagne une élection avec un bonheur d’au moins 70.", 2, function (R) { return une(R, function (e) { return e.bon >= 70; }); });
  s("bon80", "Paradis parisien", "Gagne une élection avec un bonheur d’au moins 80.", 3, function (R) { return une(R, function (e) { return e.bon >= 80; }); });
  s("pop70", "Chouchou des Parisiens", "Gagne une élection avec une popularité d’au moins 70.", 2, function (R) { return une(R, function (e) { return e.popu >= 70; }); });
  s("coh90", "Droit dans tes bottes", "Gagne une élection avec une cohérence d’au moins 90.", 3, function (R) { return R.meca.ligne && une(R, function (e) { return e.coh >= 90; }); });
  [[1, 1, "Première pierre", "Achète ton premier bâtiment."], [10, 1, "Bâtisseur", "Achète 10 bâtiments dans une partie."], [25, 2, "Grand bâtisseur", "Achète 25 bâtiments dans une partie."],
    [50, 3, "Haussmann moderne", "Achète 50 bâtiments dans une partie."], [100, 4, "Architecte de légende", "Achète 100 bâtiments dans une partie."]]
    .forEach(function (a) { s("ach" + a[0], a[2], a[3], a[1], function (R) { return R.x.achats >= a[0]; }); });
  var BATS = { parc: ["Poumon vert", "Aménage 8 parcs dans une partie.", 8], logements: ["Bailleur social", "Construis 8 ensembles de logements sociaux dans une partie.", 8],
    police: ["Ordre public", "Ouvre 6 commissariats dans une partie.", 6],
    ecole: ["Ministre de l’éducation", "Construis 6 écoles dans une partie.", 6], tram: ["Tramway nommé désir", "Ouvre 4 lignes de tramway dans une partie.", 4],
    marche: ["Halles de Paris", "Ouvre 5 marchés couverts dans une partie.", 5], metro: ["Ligne 15", "Ouvre 4 stations de métro dans une partie.", 4],
    hopital: ["Paris en bonne santé", "Construis 3 hôpitaux dans une partie.", 3] };
  Object.keys(BATS).forEach(function (id) { s("b_" + id, BATS[id][0], BATS[id][1], BATS[id][2] <= 4 ? 3 : 2, function (R) { return (R.x.bats[id] || 0) >= BATS[id][2]; }); });
  s("jo", "Les Jeux de Paris", "Réalise le Village olympique.", 3, function (R) { return !!R.bat.jo; });
  s("gpe", "Grand Paris Express", "Réalise le Grand Paris Express.", 3, function (R) { return !!R.bat.gpe; });
  s("seine", "Baignade dans la Seine", "Rends la Seine baignable.", 3, function (R) { return !!R.bat.seine; });
  s("paris2040", "Paris 2040", "Réalise les trois grands projets dans une même partie.", 4, function (R) { return R.bat.jo && R.bat.gpe && R.bat.seine; });
  s("tresor1000", "Bas de laine", "Accumule 1 milliard en caisse.", 2, function (R) { return R.x.tresorMax >= 1000; });
  s("sansDette", "Zéro dette", "Gagne une élection sans jamais avoir emprunté.", 2, function (R) { return R.mandats >= 1 && R.x.detteMax === 0; });
  s("sansDetteReal", "Rigueur réaliste", "Gagne une élection en Réaliste sans jamais avoir emprunté.", 4, function (R) { return R.mandats >= 1 && R.niveau === "difficile" && R.x.detteMax === 0; });
  s("impotsBas", "Robin des bois", "Gagne une élection avec des impôts à 90 % ou moins.", 3, function (R) { return une(R, function (e) { return e.taux <= 0.9; }); });
  s("opp1", "Riposte", "Contre une attaque de ton opposant.", 1, function (R) { return R.x.contre + R.x.mobilise >= 1; });
  s("oppNuire", "Coup de maître", "Réussis à faire tomber ton opposant.", 1, function (R) { return R.x.nuireOk >= 1; });
  s("oppElim", "Place nette", "Pousse un opposant à renoncer.", 2, function (R) { return R.x.elimines >= 1; });
  s("oppElim3", "Faiseur de rois", "Pousse 3 opposants à renoncer dans une partie.", 3, function (R) { return R.x.elimines >= 3; });
  s("opp25", "Mur de l’Hôtel de Ville", "Contre 25 attaques au total.", 3, function (R, P) { return P.contres >= 25; });
  s("oppIntact", "Téflon", "Gagne une élection sans qu’aucune attaque ne t’ait atteint.", 3, function (R) { return R.meca.opposant && R.mandats >= 1 && R.x.subi === 0 && R.x.nuireKo === 0; });
  s("cata1", "Baptême du feu", "Affronte une catastrophe.", 1, function (R) { return R.x.catastrophes >= 1; });
  s("cata3", "Gardien de la ville", "Affronte 3 catastrophes dans une partie.", 2, function (R) { return R.x.catastrophes >= 3; });
  s("chance1", "Bonne étoile", "Profite d’un coup de chance.", 1, function (R) { return R.x.chances >= 1; });
  s("ans12", "Douze ans de règne", "Tiens 12 ans à l’Hôtel de Ville.", 2, function (R) { return R.t >= 48; });
  s("ans24", "Une génération", "Tiens 24 ans à l’Hôtel de Ville.", 3, function (R) { return R.t >= 96; });
  s("eclair", "Mandat éclair", "Fais faillite avant ta première élection.", 1, function (R) { return R.perte === "faillite" && R.mandats === 0; });
  [[500, 1], [1000, 2], [1500, 2], [2500, 3], [4000, 4]].forEach(function (a) {
    s("score" + a[0], "Score de " + a[0], "Atteins un score d’au moins " + a[0] + ".", a[1], function (R) { return R.score >= a[0]; });
  });
  s("defi1", "Défi relevé", "Réussis un défi du jour.", 2, function (R, P) { return P.defis >= 1; });
  s("defi7", "Semaine parfaite", "Réussis 7 défis du jour.", 3, function (R, P) { return P.defis >= 7; });
  s("defi30", "Mois de défis", "Réussis 30 défis du jour.", 4, function (R, P) { return P.defis >= 30; });
  [[1, 1, "Première quête", "Accomplis une quête du jour."], [10, 1, "Aventurier", "Accomplis 10 quêtes."], [50, 2, "Chasseur de quêtes", "Accomplis 50 quêtes."], [100, 3, "Centurion", "Accomplis 100 quêtes."]]
    .forEach(function (a) { s("quetes" + a[0], a[2], a[3], a[1], function (R, P) { return P.quetesTot >= a[0]; }); });
  s("quetes3", "Journée parfaite", "Accomplis les 3 quêtes d’une même journée.", 2, function (R, P) { return (P.quetesJour[jour()] || []).length >= 3; });
  [[3, 1], [5, 1], [8, 2], [10, 2], [20, 3], [50, 4]].forEach(function (a) {
    s("niv" + a[0], "Niveau " + a[0], "Atteins le niveau " + a[0] + ".", a[1], function (R, P) { return niveau(P.xp).n >= a[0]; });
  });
  s("histoire", "Toute l’histoire", "Accomplis les objectifs des 9 chapitres.", 4, function (R, P) { return Object.keys(HISTOIRE).every(function (k) { return P.chapitres[k]; }); });
  s("fidele", "Fidèle", "Gagne une élection sans jamais avoir renié ta ligne.", 2, function (R) { return R.meca.ligne && R.mandats >= 1 && R.x.trahisons === 0; });
  s("dossiers50", "Bourreau de travail", "Traite 50 dossiers dans une partie.", 2, function (R) { return R.x.dossiers >= 50; });
  s("crise", "Gestionnaire de crise", "Traite 5 dossiers de crise dans une partie.", 2, function (R) { return (R.fam.crise || 0) >= 5; });
  // ---------- Succès des nouvelles mécaniques (dont des succès secrets, cachés tant qu'ils ne sont pas obtenus) ----------
  function s2(id, cat, nom, desc, t, f, secret) { s(id, nom, desc, t, f); S[S.length - 1].cat = cat; if (secret) S[S.length - 1].secret = 1; }
  s2("comptable", "Finances", "Comptable du dimanche", "Termine un trimestre sans que la dette augmente.", 1, function (R) { return R.x.trimSansDette >= 1; });
  s2("banquier", "Finances", "Le banquier fou", "Accumule 3 milliards en caisse.", 3, function (R) { return R.x.tresorMax >= 3000; });
  s2("detteTradition", "Finances", "La dette est une tradition", "Gagne une élection avec plus d’un milliard de dette.", 3, function (R) { return une(R, function (e) { return e.dette >= 1000; }); });
  s2("dernierRecours", "Prise de risque", "Le dernier recours", "Sauve la ville alors que la faillite semblait imminente.", 3, function (R) { return R.x.sauvetage >= 1; });
  s2("vingtEtUn", "Prise de risque", "Vingt-et-un", "Gagne au dernier pari de Monsieur Valentin.", 2, function (R) { return R.x.pariGain > 0; });
  s2("maisonGagne", "Prise de risque", "La maison gagne toujours", "Perds au moins 100 M€ au dernier pari.", 2, function (R) { return R.x.pariPerte >= 100; }, 1);
  s2("zero", "Prise de risque", "Le zéro magique", "Gagne à la roulette en misant sur le zéro.", 4, function (R) { return !!R.x.zero; }, 1);
  s2("toutVaBien", "Gestion", "Tout va bien, Monsieur le Maire", "Encaisse trois mauvaises nouvelles d’affilée sans tomber.", 2, function (R) { return R.x.negSerieMax >= 3 && R.t >= 8; });
  s2("visionnaire", "Construction", "Visionnaire", "Fais réussir un coup de génie risqué.", 2, function (R) { return R.x.genieOk >= 1; });
  s2("chantier1", "Construction", "Premier coup de pioche", "Inaugure un projet démesuré.", 2, function (R) { return R.x.projetsOk >= 1; });
  s2("chantier3", "Construction", "Bâtisseur de l’impossible", "Inaugure 3 projets démesurés dans une même partie.", 3, function (R) { return R.x.projetsOk >= 3; });
  s2("posterite", "Exploration", "C’est pour la postérité", "Construis un bâtiment secret.", 2, function (R) { return R.x.secretsBatis >= 1; });
  s2("parisSecret", "Exploration", "Paris secret", "Découvre les 6 bâtiments secrets.", 4, function (R, P) { return Object.keys(P.secrets || {}).length >= 6; }, 1);
  s2("combo1", "Construction", "Effet combo", "Active un combo de bâtiments.", 1, function (R) { return R.x.combos >= 1; });
  s2("combosTous", "Construction", "Urbaniste de génie", "Découvre les 4 combos de bâtiments.", 3, function (R, P) { return Object.keys(P.combos || {}).length >= 4; });
  s2("objet1", "Exploration", "Bureau des objets trouvés", "Trouve ton premier objet insolite.", 1, function (R) { return R.x.objets >= 1; });
  s2("objets10", "Exploration", "Collectionneur", "Rassemble 10 objets insolites.", 3, function (R, P) { return Object.keys(P.objets || {}).length >= 10; });
  s2("objetsTous", "Exploration", "Le grenier de Paris", "Rassemble tous les objets insolites.", 4, function (R, P) { return Object.keys(P.objets || {}).length >= 14; }, 1);
  s2("amiPigeons", "Humour", "Ami des pigeons", "Vis toute l’histoire des pigeons de Paris.", 2, function (R) { return R.x.pigeons >= 2; }, 1);
  s2("casino", "Humour", "Croupier en chef", "Laisse le casino clandestin de l’Hôtel de Ville ouvert.", 2, function (R) { return !!R.flags.casino; }, 1);
  s2("absurde", "Humour", "Le maire le plus absurde de l’histoire", "Prends 5 décisions que Léon refuse d’inscrire au compte rendu.", 3, function (R) { return R.x.absurdes >= 5; }, 1);
  s2("legende1", "Événements rares", "Témoin de l’histoire", "Vis un événement légendaire.", 2, function (R) { return R.x.legendaires >= 1; });
  s2("legende3", "Événements rares", "Aimant à légendes", "Vis 3 événements légendaires dans une même partie.", 4, function (R) { return R.x.legendaires >= 3; }, 1);
  s2("grandJour", "Événements rares", "Le Grand Jour", "Réussis le Grand Jour de Paris.", 3, function (R) { return R.x.grandJourOk >= 1; });
  s2("mission1", "Défis", "Défi improbable", "Réussis une mission surprise de Léon.", 1, function (R) { return R.x.missionsOk >= 1; });
  s2("missions10", "Défis", "Homme ou femme de mission", "Réussis 10 missions surprises au total.", 3, function (R, P) { return P.missions >= 10; });
  s2("historiques3", "Gestion", "Main de l’histoire", "Prends 3 décisions historiques au total.", 2, function (R, P) { return P.historiques >= 3; });
  s2("gaspard", "Exploration", "Ami des milliardaires", "Gagne la confiance de Gaspard Mallet.", 2, function (R) { return (R.persos.gaspard || 0) >= 2; }, 1);
  s2("reputation", "Exploration", "Personnalité nationale", "Atteins 350 points de réputation.", 3, function (R, P) { return (P.rep || 0) >= 350; });

  // ---------- Progression affichée en pleine partie (« 12 / 25 ») ----------
  // Seuls les compteurs qui avancent par étapes nettes sont suivis (pas le trésor ni le score, qui bougent sans cesse)
  function suivi(ids, fam, f) { ids.forEach(function (a) { var x = S.filter(function (y) { return y.id === a[0]; })[0]; if (x) { x.fam = fam; x.prog = f; x.but = a[1]; } }); }
  suivi([["mandats1", 1], ["mandats2", 2], ["mandats3", 3], ["mandats5", 5], ["mandats8", 8]], "mandats", function (R) { return R.mandats; });
  suivi([["ach1", 1], ["ach10", 10], ["ach25", 25], ["ach50", 50], ["ach100", 100]], "achats", function (R) { return R.x.achats; });
  Object.keys(BATS).forEach(function (id) { suivi([["b_" + id, BATS[id][2]]], "b_" + id, function (R) { return R.x.bats[id] || 0; }); });
  suivi([["oppElim", 1], ["oppElim3", 3]], "elim", function (R) { return R.x.elimines; });
  suivi([["cata1", 1], ["cata3", 3]], "cata", function (R) { return R.x.catastrophes; });
  suivi([["crise", 5]], "crise", function (R) { return R.fam.crise || 0; });
  suivi([["chantier1", 1], ["chantier3", 3]], "chantier", function (R) { return R.x.projetsOk; });
  suivi([["combo1", 1]], "combo", function (R) { return R.x.combos; });
  suivi([["objet1", 1]], "objet", function (R) { return R.x.objets; });
  suivi([["objets10", 10], ["objetsTous", 14]], "objets", function (R, P) { return Object.keys(P.objets || {}).length; });
  suivi([["combosTous", 4]], "combos", function (R, P) { return Object.keys(P.combos || {}).length; });
  suivi([["mission1", 1]], "mission", function (R) { return R.x.missionsOk; });
  suivi([["legende1", 1]], "legende", function (R) { return R.x.legendaires; });
  // Les quêtes du jour qui se comptent : [valeur actuelle, objectif]
  var QPROG = {
    mandats: function (q, R) { return nmin(q, R) && (!q.ligne || R.ligne === q.ligne) ? [R.mandats, q.n] : null; },
    annees: function (q, R) { return nmin(q, R) ? [Math.floor(R.t / 4), q.n] : null; },
    achat: function (q, R) { return [R.x.bats[q.b] || 0, q.n]; },
    achats: function (q, R) { return [R.x.achats, q.n]; },
    investi: function (q, R) { return [Math.round(R.x.investi), q.v]; },
    famille: function (q, R) { return [R.fam[q.f] || 0, q.n]; },
    catastrophes: function (q, R) { return [R.x.catastrophes, q.n]; },
    chance: function (q, R) { return [R.x.chances, q.n]; },
    opp: function (q, R) { return [q.s === "contre" ? R.x.contre + R.x.mobilise : R.x[q.s] || 0, q.n]; },
    projets: function (q, R) { return [["jo", "gpe", "seine"].filter(function (k) { return R.bat[k]; }).length, q.n]; }
  };
  function queteProgres(q, R) { var f = QPROG[q.k], v = f ? f(q, R) : null; return v ? { cur: Math.min(v[0], v[1]), but: v[1] } : null; }

  // ---------- XP : versée au profil au fil de la partie, une seule fois ----------
  // Le profil retient combien d'XP de CETTE partie (pid) il a déjà reçue : recharger ou rejouer un écran ne la double jamais
  function crediter(st, P) {
    var deja = P.verse && P.verse.pid === st.pid ? P.verse.xp : 0;
    if (st.xp > deja) { P.xp += st.xp - deja; P.verse = { pid: st.pid, xp: st.xp }; }
  }
  // Chapitres, quêtes et succès réussis : rangés dans le profil, XP ajoutée à la partie (st est modifié)
  function evaluer(st, M, P, j, quetesJ) {
    var out = { succes: [], quetes: [], chapitres: [] };
    function xp(txt, n) { M.gagnerXP(st, txt, n); crediter(st, P); }
    for (var tour = 0; tour < 3; tour++) {
      var R = resume(st, M), n0 = out.succes.length + out.quetes.length + out.chapitres.length;
      M.MECANIQUES.forEach(function (m) {
        var c = HISTOIRE[m.id]; if (!c || P.chapitres[m.id] || !R.meca[m.id]) return;
        var ok = false; try { ok = c.ok(R); } catch (e) { ok = false; }
        if (ok) { P.chapitres[m.id] = j; out.chapitres.push(c); xp("Chapitre " + c.num + " accompli : " + c.titre, XP_CHAPITRE); }
      });
      var faites = P.quetesJour[j] || [];
      (quetesJ || []).forEach(function (q) {
        if (faites.indexOf(q.id) < 0 && queteFaite(q, R)) { faites.push(q.id); P.quetesTot++; out.quetes.push(q); xp("Quête : " + q.t, q.xp); }
      });
      P.quetesJour = {}; P.quetesJour[j] = faites;
      S.forEach(function (x) {
        if (P.succes[x.id]) return;
        var ok = false; try { ok = x.f(R, P); } catch (e) { ok = false; }
        if (ok) { P.succes[x.id] = j; out.succes.push(x); st.succesPartie.push(x.id); xp("Succès : " + x.nom, XP_TIER[x.t]); }
      });
      if (out.succes.length + out.quetes.length + out.chapitres.length === n0) break;
    }
    return out;
  }
  // Appelé par l'interface après chaque action : renvoie la partie mise à jour et ce qu'il faut afficher
  // (succès et quêtes réussis, progression des succès et quêtes qui avancent)
  function suivrePartie(st0, M, opts) {
    opts = opts || {};
    var vide = { st: st0, succes: [], quetes: [], chapitres: [], progres: [] };
    if (!st0 || st0.prog || st0.phase === "fin") return vide;
    var st = JSON.parse(JSON.stringify(st0)), P = lire(), j = opts.jour != null ? opts.jour : jour();
    var out = evaluer(st, M, P, j, opts.quetes);
    crediter(st, P);
    // Ce qui a avancé depuis le dernier affichage (la première mesure sert de point de départ)
    var R = resume(st, M), progres = [], vus = {}, faits = {};
    out.succes.forEach(function (x) { if (x.fam) faits[x.fam] = 1; });
    S.filter(function (x) { return x.prog && !x.secret && !P.succes[x.id]; }).sort(function (a, b) { return a.but - b.but; }).forEach(function (x) {
      if (vus[x.fam]) return; vus[x.fam] = 1;                  // dans une famille (1, 10, 25 achats…), seul le prochain palier compte
      var v = 0; try { v = x.prog(R, P); } catch (e) { v = 0; }
      var k = "s:" + x.fam, avant = st.suivi[k]; st.suivi[k] = v;
      if (avant != null && v > avant && !faits[x.fam]) progres.push({ type: "succes", ico: "🏅", nom: x.nom, desc: x.desc, cur: v, but: x.but });
    });
    var fq = P.quetesJour[j] || [];
    (opts.quetes || []).forEach(function (q) {
      if (fq.indexOf(q.id) >= 0) return;
      var p = queteProgres(q, R); if (!p) return;
      var k = "q:" + q.id, avant = st.suivi[k]; st.suivi[k] = p.cur;
      if (avant != null && p.cur > avant) progres.push({ type: "quete", ico: "🎯", nom: q.t, cur: p.cur, but: p.but });
    });
    progres.sort(function (a, b) { return b.cur / b.but - a.cur / a.but; });
    ecrire(P);
    return { st: st, succes: out.succes, quetes: out.quetes, chapitres: out.chapitres, progres: progres };
  }

  // ---------- Fin de partie : ce qui ne se décide qu'à la fin, et le récapitulatif de toute l'XP gagnée ----------
  function terminer(st0, M, opts) {
    opts = opts || {};
    var st = JSON.parse(JSON.stringify(M.migrer(st0))), P = lire(), R = resume(st, M), j = opts.jour != null ? opts.jour : jour();
    var avant = niveau(st.xp0 != null ? st.xp0 : P.xp);
    P.parties++; if (R.score > P.scoreMax) P.scoreMax = R.score;
    P.mandats += R.mandats; P.mandatsNiv[R.niveau] += R.mandats; P.meilleurMandats = Math.max(P.meilleurMandats, R.mandats);
    if (R.mandats && R.meca.ligne) P.mandatsLigne[R.ligne] = (P.mandatsLigne[R.ligne] || 0) + R.mandats;
    if (R.perte) P.pertes[R.perte] = (P.pertes[R.perte] || 0) + 1;
    P.achats += R.x.achats; Object.keys(R.x.bats).forEach(function (k) { P.bats[k] = (P.bats[k] || 0) + R.x.bats[k]; });
    P.elims += R.x.elimines; P.contres += R.x.contre + R.x.mobilise; P.catas += R.x.catastrophes; P.chances += R.x.chances;
    P.missions += R.missions.length; P.historiques += R.x.historiques || 0;
    R.objets.forEach(function (o) { if (!P.objets[o]) P.objets[o] = j; }); R.combos.forEach(function (c) { if (!P.combos[c]) P.combos[c] = j; });
    Object.keys(st.secrets || {}).forEach(function (k) { if (!P.secrets[k]) P.secrets[k] = j; });
    var repAvant = P.rep || 0;
    P.rep = repAvant + R.mandats * 20 + R.missions.length * 5 + R.x.projetsOk * 10 + R.x.secretsBatis * 5 + R.x.legendaires * 5 + (R.finDefi ? 10 : 0);
    if (R.defi != null && R.defi === j && !P.defiJours[j]) {
      P.defiJours[j] = { score: R.score, ok: R.finDefi };
      if (R.finDefi) { P.defis++; M.gagnerXP(st, "Défi du jour terminé", XP_DEFI); if (R.score >= 1200) M.gagnerXP(st, "Défi du jour : excellent score", XP_DEFI_BONUS); }
    }
    Object.keys(P.defiJours).forEach(function (k) { if (+k < j - 60) delete P.defiJours[k]; });
    crediter(st, P);
    var out = evaluer(st, M, P, j, opts.quetes);
    crediter(st, P);
    ecrire(P);
    var apres = niveau(P.xp), debloque = M.MECANIQUES.concat(M.EXTRAS).filter(function (m) { return m.niv > avant.n && m.niv <= apres.n; });
    var nouveaux = S.filter(function (x) { return st.succesPartie.indexOf(x.id) >= 0; });
    var quetesOk = (opts.quetes || []).filter(function (q) { return st.xpLog.some(function (g) { return g.txt === "Quête : " + q.t; }); });
    return { st: st, gains: st.xpLog.slice(), total: st.xp, nouveaux: nouveaux, quetes: quetesOk, chapitres: out.chapitres,
      avant: avant, apres: apres, debloque: debloque, profil: P, rep: P.rep - repAvant };
  }

  var API = { jour: jour, niveau: niveau, xpPour: xpPour, lire: lire, ecrire: ecrire, profilVide: profilVide, resume: resume, terminer: terminer, suivrePartie: suivrePartie, queteProgres: queteProgres,
    nivJoueur: nivJoueur, fixerNiveau: fixerNiveau, synchroniser: synchroniser, reputation: reputation, oublierTutos: oublierTutos, guideVu: guideVu, marquerGuide: marquerGuide, chapitre: chapitre,
    HISTOIRE: HISTOIRE, quetesDuJour: quetesDuJour, queteFaite: queteFaite, TYPES_QUETES: Object.keys(QUETE), defiDuJour: defiDuJour,
    SUCCES: S, XP_TIER: XP_TIER, NOM_NIV: NOM_NIV, TITRES: TITRES, NIV_DEFI: NIV_DEFI, NIV_QUETES: NIV_QUETES, NIV_MAX: NIV_MAX };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MaireProg = API;
})(this);
