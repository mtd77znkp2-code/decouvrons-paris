// Maire de Paris : progression du joueur (XP et niveaux, 100 succès, défi du jour et 3 quêtes du jour).
// Tout est calculé à partir du bilan d'une partie terminée ; le profil est gardé dans le navigateur.
(function (root) {
  "use strict";
  var CLE = "maire_profil_v1";
  var RANG = { facile: 0, moyen: 1, difficile: 2 };
  var NOM_NIV = { facile: "Facile", moyen: "Moyen", difficile: "Réaliste" };
  var XP_VICTOIRE = { facile: 40, moyen: 80, difficile: 150 }, XP_TIER = [0, 25, 50, 100, 200];
  var XP_DEFI = 150, XP_DEFI_REELU = 50, NIV_MAX = 50;
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
    return { v: 1, xp: 0, parties: 0, victoires: { facile: 0, moyen: 0, difficile: 0 }, vLigne: {}, vRealLigne: {}, reelus: 0, reelusReal: 0,
      ambTenues: {}, elims: 0, contres: 0, catas: 0, chances: 0, defis: 0, defiJours: {}, quetesTot: 0, quetesJour: {}, succes: {},
      scoreMax: 0, pertes: {}, nuireOk: 0 };
  }
  function lire() {
    try { var p = JSON.parse(localStorage.getItem(CLE) || "null"); if (p && p.v === 1) return Object.assign(profilVide(), p); } catch (e) {}
    return profilVide();
  }
  function ecrire(p) { try { localStorage.setItem(CLE, JSON.stringify(p)); } catch (e) {} }

  // ---------- Résumé d'une partie terminée (tout ce qu'il faut pour les quêtes et les succès) ----------
  function resume(st, M) {
    var b = M.bilan(st), x = M.stats(st), o = M.opposant(st);
    return { niveau: st.niveau || "moyen", rang: RANG[st.niveau || "moyen"], ligne: st.ligne, ambitions: st.ambitions, gagne: !!st.fin.gagne,
      perte: st.fin.gagne ? null : st.fin.raison.type, tour: st.tour, pop: st.pop, bon: st.bon, coh: st.coh, tresor: st.tresor, dette: st.dette,
      score: b.score, reelu: !!(st.election && st.election.reelu), pct: st.election ? st.election.pct : 0,
      ambOk: b.ambitions.filter(function (a) { return a.ok; }).map(function (a) { return a.k; }), dom: st.dom, x: x,
      oppForce0: o ? o.depart : 0, oppElim: !!(o && !o.actif), defi: st.defi != null ? st.defi : null };
  }

  // ---------- Quêtes : chaque type sait vérifier un résumé de partie ----------
  var QUETE = {
    semaine: function (q, R) { return R.tour >= q.n && R.rang >= (q.nmin || 0) && (!q.ligne || R.ligne === q.ligne); },
    victoire: function (q, R) { return R.gagne && R.rang >= (q.nmin || 0) && (!q.ligne || R.ligne === q.ligne) && (!q.amb || R.ambitions.indexOf(q.amb) >= 0); },
    reelu: function (q, R) { return R.reelu && R.rang >= (q.nmin || 0) && R.pct >= (q.pct || 0) && (!q.ligne || R.ligne === q.ligne) && (!q.amb || R.ambitions.indexOf(q.amb) >= 0); },
    tresor: function (q, R) { return R.gagne && R.tresor >= q.v && R.rang >= (q.nmin || 0); },
    sansDette: function (q, R) { return R.gagne && R.dette === 0 && R.rang >= (q.nmin || 0); },
    detteMax: function (q, R) { return R.gagne && R.x.detteMax <= q.v && R.rang >= (q.nmin || 0); },
    jauge: function (q, R) { return R.gagne && R[q.j] >= q.v && R.rang >= (q.nmin || 0) && (!q.ligne || R.ligne === q.ligne); },
    jaugeMin: function (q, R) { return R.gagne && R.x[q.j + "Min"] >= q.v; },
    amb: function (q, R) { return R.gagne && R.ambOk.indexOf(q.d) >= 0 && R.rang >= (q.nmin || 0); },
    deuxAmb: function (q, R) { return R.gagne && R.ambOk.length === 2 && R.rang >= (q.nmin || 0); },
    paire: function (q, R) { return R.gagne && R.ambOk.indexOf(q.a) >= 0 && R.ambOk.indexOf(q.b) >= 0; },
    dom: function (q, R) { return R.gagne && R.dom[q.d] >= q.v && R.rang >= (q.nmin || 0); },
    domMin: function (q, R) { return R.gagne && Object.keys(R.dom).every(function (k) { return R.dom[k] >= q.v; }); },
    cat: function (q, R) { return (R.x.cats[q.c] || 0) >= q.n; },
    catastrophes: function (q, R) { return R.x.catastrophes >= q.n && (!q.gagne || R.gagne); },
    opp: function (q, R) { return (q.s === "contre" ? R.x.contre + R.x.mobilise : R.x[q.s]) >= q.n; },
    oppElim: function (q, R) { return R.oppElim && R.rang >= (q.nmin || 0) && (!q.avant || R.x.elimine <= q.avant); },
    oppIntact: function (q, R) { return R.gagne && R.x.subi === 0 && R.x.nuireKo === 0; },
    oppForce: function (q, R) { return R.gagne && R.oppForce0 >= q.v; },
    score: function (q, R) { return R.score >= q.v && R.rang >= (q.nmin || 0); },
    fidele: function (q, R) { return R.gagne && R.x.trahisons <= q.n && (!q.ligne || R.ligne === q.ligne); },
    econome: function (q, R) { return R.gagne && R.x.depenses <= q.v; },
    genereux: function (q, R) { return R.gagne && R.x.depenses >= q.v; },
    chance: function (q, R) { return R.x.chances >= 1 && (!q.gagne || R.gagne); }
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
    melange(lots, r).forEach(function (l) { if (n < (minEvts || 550)) { choisis.push(l.f); n += l.n; } });
    return { jour: j, graine: graine(j * 7 + 3) || 1, niveau: niv, ligne: ligne, ambitions: amb, lots: choisis };
  }

  // ---------- 100 succès ----------
  // [id, nom, description, palier (1 bronze → 4 platine), test(R, P)]
  var S = [];
  function s(id, nom, desc, t, f) { S.push({ id: id, nom: nom, desc: desc, t: t, f: f }); }
  [[1, 1, "Premier mandat", "Termine ta première partie."], [5, 1, "Habitué de l’Hôtel de Ville", "Joue 5 parties."], [10, 2, "Vieux routier", "Joue 10 parties."],
    [25, 2, "Pilier du Conseil", "Joue 25 parties."], [50, 3, "Institution parisienne", "Joue 50 parties."], [100, 4, "Inamovible", "Joue 100 parties."]]
    .forEach(function (a) { s("parties" + a[0], a[2], a[3], a[1], function (R, P) { return P.parties >= a[0]; }); });
  [[1, 1, "Mandat accompli", "Tiens 100 semaines pour la première fois."], [5, 2, "Gestionnaire solide", "Gagne 5 parties."], [10, 2, "Valeur sûre", "Gagne 10 parties."],
    [25, 3, "Increvable", "Gagne 25 parties."], [50, 4, "Monument de Paris", "Gagne 50 parties."]]
    .forEach(function (a) { s("vict" + a[0], a[2], a[3], a[1], function (R, P) { return totalV(P) >= a[0]; }); });
  s("vFacile", "Premiers pas", "Gagne une partie en Facile.", 1, function (R) { return R.gagne && R.niveau === "facile"; });
  s("vMoyen", "Maire confirmé", "Gagne une partie en Moyen.", 2, function (R) { return R.gagne && R.niveau === "moyen"; });
  s("vReal", "Réaliste et victorieux", "Gagne une partie en Réaliste.", 3, function (R) { return R.gagne && R.niveau === "difficile"; });
  s("vReal5", "Dompteur de Paris", "Gagne 5 parties en Réaliste.", 3, function (R, P) { return P.victoires.difficile >= 5; });
  s("vReal10", "Maître de la ville", "Gagne 10 parties en Réaliste.", 4, function (R, P) { return P.victoires.difficile >= 10; });
  var LG = { gauche: "Gauche", centre: "Centre", droite: "Droite", ecologie: "Écologie" };
  Object.keys(LG).forEach(function (l) {
    s("vL_" + l, "Victoire : " + LG[l], "Gagne une partie avec la ligne " + LG[l] + ".", 1, function (R) { return R.gagne && R.ligne === l; });
    s("vRL_" + l, "Réaliste : " + LG[l], "Gagne en Réaliste avec la ligne " + LG[l] + ".", 3, function (R) { return R.gagne && R.niveau === "difficile" && R.ligne === l; });
  });
  s("vToutes", "Caméléon", "Gagne avec chacune des quatre lignes politiques.", 3, function (R, P) { return Object.keys(LG).every(function (l) { return P.vLigne[l]; }); });
  s("reelu1", "Réélu !", "Remporte l’élection à la fin de ton mandat.", 1, function (R) { return R.reelu; });
  s("reelu5", "Les Parisiens t’adorent", "Sois réélu 5 fois.", 2, function (R, P) { return P.reelus >= 5; });
  s("reelu10", "Indéboulonnable", "Sois réélu 10 fois.", 3, function (R, P) { return P.reelus >= 10; });
  s("reelu60", "Large victoire", "Sois réélu avec au moins 60 % des voix.", 2, function (R) { return R.reelu && R.pct >= 60; });
  s("reelu70", "Plébiscite", "Sois réélu avec au moins 70 % des voix.", 3, function (R) { return R.reelu && R.pct >= 70; });
  s("reeluReal", "Réélu contre vents et marées", "Sois réélu en Réaliste.", 3, function (R) { return R.reelu && R.niveau === "difficile"; });
  s("reeluJuste", "Sur le fil", "Sois réélu avec moins de 51 % des voix.", 2, function (R) { return R.reelu && R.pct < 51; });
  s("amb1", "Promesse tenue", "Tiens au moins une ambition à la fin d’un mandat.", 1, function (R) { return R.gagne && R.ambOk.length >= 1; });
  s("amb2", "Parole d’honneur", "Tiens tes deux ambitions.", 2, function (R) { return R.gagne && R.ambOk.length === 2; });
  s("amb2Real", "Promesses de fer", "Tiens tes deux ambitions en Réaliste.", 4, function (R) { return R.gagne && R.ambOk.length === 2 && R.niveau === "difficile"; });
  var DOMS = { securite: ["Shérif de Paris", "Sécurité"], proprete: ["Paris étincelant", "Propreté"], logement: ["Toit pour tous", "Logement"],
    transports: ["Ville fluide", "Transports"], ecologie: ["Capitale verte", "Écologie"], achat: ["Porte-monnaie des Parisiens", "Pouvoir d’achat"],
    economie: ["Paris qui gagne", "Économie"], services: ["Service public modèle", "Services publics"] };
  Object.keys(DOMS).forEach(function (d) { s("amb_" + d, DOMS[d][0], "Tiens l’ambition « " + DOMS[d][1] + " ».", 2, function (R) { return R.gagne && R.ambOk.indexOf(d) >= 0; }); });
  s("sansDette", "Zéro dette", "Gagne sans jamais avoir emprunté.", 2, function (R) { return R.gagne && R.x.detteMax === 0; });
  s("sansDetteReal", "Rigueur réaliste", "Gagne en Réaliste sans jamais avoir emprunté.", 4, function (R) { return R.gagne && R.niveau === "difficile" && R.x.detteMax === 0; });
  s("tresor500", "Bas de laine", "Termine un mandat avec au moins 500 M€ en caisse.", 2, function (R) { return R.gagne && R.tresor >= 500; });
  s("tresor1000", "Coffre-fort", "Termine un mandat avec au moins 1 milliard en caisse.", 3, function (R) { return R.gagne && R.tresor >= 1000; });
  s("miracule", "Miraculé", "Gagne avec plus de 800 M€ de dette.", 3, function (R) { return R.gagne && R.dette > 800; });
  s("ruine", "Ruiné", "Perds une partie par faillite.", 1, function (R) { return R.perte === "faillite"; });
  s("pop70", "Chouchou des Parisiens", "Termine avec une popularité d’au moins 70.", 2, function (R) { return R.gagne && R.pop >= 70; });
  s("pop80", "Star de la capitale", "Termine avec une popularité d’au moins 80.", 3, function (R) { return R.gagne && R.pop >= 80; });
  s("bon70", "Ville heureuse", "Termine avec un bonheur d’au moins 70.", 2, function (R) { return R.gagne && R.bon >= 70; });
  s("bon80", "Paradis parisien", "Termine avec un bonheur d’au moins 80.", 3, function (R) { return R.gagne && R.bon >= 80; });
  s("coh90", "Droit dans tes bottes", "Termine avec une cohérence d’au moins 90.", 2, function (R) { return R.gagne && R.coh >= 90; });
  s("coh98", "Pureté idéologique", "Termine avec une cohérence d’au moins 98.", 3, function (R) { return R.gagne && R.coh >= 98; });
  s("intouchable", "Intouchable", "Gagne sans que ta popularité passe jamais sous 45.", 3, function (R) { return R.gagne && R.x.popMin >= 45; });
  s("opp1", "Riposte", "Contre une attaque de ton opposant.", 1, function (R) { return R.x.contre + R.x.mobilise >= 1; });
  s("oppNuire", "Coup de maître", "Réussis à faire tomber ton opposant (influence divisée par deux).", 1, function (R) { return R.x.nuireOk >= 1; });
  s("oppRate", "Arroseur arrosé", "Rate une tentative contre ton opposant.", 1, function (R) { return R.x.nuireKo >= 1; });
  s("oppElim", "Place nette", "Pousse ton opposant à quitter la vie politique.", 2, function (R) { return R.oppElim; });
  s("oppElimReal", "Seul en piste", "Élimine ton opposant en Réaliste.", 3, function (R) { return R.oppElim && R.niveau === "difficile"; });
  s("oppElim40", "Éclair", "Élimine ton opposant avant la semaine 40.", 3, function (R) { return R.oppElim && R.x.elimine <= 40; });
  s("oppGeant", "David contre Goliath", "Gagne face à un opposant parti avec une influence d’au moins 80.", 3, function (R) { return R.gagne && R.oppForce0 >= 80; });
  s("oppStoique", "Stoïque", "Gagne en laissant passer toutes les attaques de ton opposant.", 3, function (R) { return R.gagne && R.x.subi >= 9; });
  s("opp25", "Mur de l’Hôtel de Ville", "Contre 25 attaques au total.", 3, function (R, P) { return P.contres >= 25; });
  s("elim5", "Faiseur de rois", "Élimine 5 opposants au total.", 3, function (R, P) { return P.elims >= 5; });
  s("cata3", "Gardien de la ville", "Gagne après avoir affronté 3 catastrophes.", 2, function (R) { return R.gagne && R.x.catastrophes >= 3; });
  s("cata4", "Rien ne t’arrête", "Gagne après avoir affronté 4 catastrophes.", 3, function (R) { return R.gagne && R.x.catastrophes >= 4; });
  s("cata25", "Pompier en chef", "Affronte 25 catastrophes au total.", 3, function (R, P) { return P.catas >= 25; });
  s("chance1", "Bonne étoile", "Profite d’un coup de chance.", 1, function (R) { return R.x.chances >= 1; });
  s("chance10", "Trèfle à quatre feuilles", "Profite de 10 coups de chance au total.", 2, function (R, P) { return P.chances >= 10; });
  s("pertePop", "Désamour", "Perds une partie par impopularité.", 1, function (R) { return R.perte === "popularite"; });
  s("perteBon", "Révolte", "Perds une partie à cause du bonheur des Parisiens.", 1, function (R) { return R.perte === "bonheur"; });
  s("presque", "Si près du but", "Perds une partie à partir de la semaine 95.", 2, function (R) { return !R.gagne && R.tour >= 95; });
  s("eclair", "Mandat éclair", "Perds une partie avant la semaine 15.", 1, function (R) { return !R.gagne && R.tour < 15; });
  [[250, 1], [300, 2], [350, 2], [400, 3], [450, 4]].forEach(function (a) {
    s("score" + a[0], "Score de " + a[0], "Atteins un score d’au moins " + a[0] + ".", a[1], function (R) { return R.score >= a[0]; });
  });
  s("defi1", "Défi relevé", "Réussis un défi du jour.", 1, function (R, P) { return P.defis >= 1; });
  s("defi7", "Semaine parfaite", "Réussis 7 défis du jour.", 2, function (R, P) { return P.defis >= 7; });
  s("defi30", "Mois de défis", "Réussis 30 défis du jour.", 4, function (R, P) { return P.defis >= 30; });
  s("defiReelu", "Défi royal", "Sois réélu lors d’un défi du jour.", 2, function (R) { return R.defi != null && R.reelu; });
  [[1, 1, "Première quête", "Accomplis une quête du jour."], [10, 1, "Aventurier", "Accomplis 10 quêtes."], [50, 2, "Chasseur de quêtes", "Accomplis 50 quêtes."],
    [100, 3, "Centurion", "Accomplis 100 quêtes."], [250, 4, "Légende des quêtes", "Accomplis 250 quêtes."]]
    .forEach(function (a) { s("quetes" + a[0], a[2], a[3], a[1], function (R, P) { return P.quetesTot >= a[0]; }); });
  s("quetes3", "Journée parfaite", "Accomplis les 3 quêtes d’une même journée.", 2, function (R, P) { var j = jour(); return (P.quetesJour[j] || []).length >= 3; });
  [[5, 1], [10, 2], [20, 3], [30, 3], [50, 4]].forEach(function (a) {
    s("niv" + a[0], "Niveau " + a[0], "Atteins le niveau " + a[0] + ".", a[1], function (R, P) { return niveau(P.xp).n >= a[0]; });
  });
  s("fidele", "Fidèle", "Gagne sans jamais renier ta ligne.", 2, function (R) { return R.gagne && R.x.trahisons === 0; });
  s("pompier", "Gestionnaire de crise", "Traite au moins 8 dossiers de crise dans une partie gagnée.", 2, function (R) { return R.gagne && (R.x.cats.crise || 0) >= 8; });
  s("econome", "Fourmi", "Gagne en dépensant moins de 400 M€ en décisions.", 3, function (R) { return R.gagne && R.x.depenses < 400; });
  s("cigale", "Cigale", "Gagne en dépensant plus de 1,5 milliard en décisions.", 2, function (R) { return R.gagne && R.x.depenses > 1500; });
  s("equilibre", "Ville harmonieuse", "Gagne avec tous les domaines de la ville à 50 ou plus.", 3, function (R) { return R.gagne && Object.keys(R.dom).every(function (k) { return R.dom[k] >= 50; }); });
  function totalV(P) { return P.victoires.facile + P.victoires.moyen + P.victoires.difficile; }

  // ---------- Fin de partie : tout ce que la partie rapporte ----------
  // Appelée une seule fois par partie (l'interface marque la partie comme comptée).
  function terminer(st, M, opts) {
    opts = opts || {};
    var P = lire(), R = resume(st, M), j = opts.jour != null ? opts.jour : jour(), avant = niveau(P.xp), gains = [], nouveaux = [], quetes = [];
    function gagne(txt, xp) { if (xp > 0) { gains.push({ txt: txt, xp: xp }); P.xp += xp; } }
    // Compteurs
    P.parties++; if (R.score > P.scoreMax) P.scoreMax = R.score;
    if (R.gagne) { P.victoires[R.niveau]++; P.vLigne[R.ligne] = (P.vLigne[R.ligne] || 0) + 1; if (R.niveau === "difficile") P.vRealLigne[R.ligne] = 1; }
    else P.pertes[R.perte] = (P.pertes[R.perte] || 0) + 1;
    if (R.reelu) P.reelus++;
    R.ambOk.forEach(function (k) { P.ambTenues[k] = (P.ambTenues[k] || 0) + 1; });
    if (R.oppElim) P.elims++;
    P.contres += R.x.contre + R.x.mobilise; P.catas += R.x.catastrophes; P.chances += R.x.chances; P.nuireOk += R.x.nuireOk;
    // XP de la partie
    gagne("Semaines à l’Hôtel de Ville", Math.min(50, Math.round(R.tour / 2)));
    if (R.gagne) gagne("Mandat accompli (" + NOM_NIV[R.niveau] + ")", XP_VICTOIRE[R.niveau]);
    if (R.reelu) gagne("Réélection", R.niveau === "difficile" ? 60 : 40);
    // Défi du jour : récompensé une fois, le jour même
    if (R.defi != null && R.defi === j && !P.defiJours[j]) {
      P.defiJours[j] = { score: R.score, gagne: R.gagne, reelu: R.reelu };
      if (R.gagne) { P.defis++; gagne("Défi du jour réussi", XP_DEFI); if (R.reelu) gagne("Défi du jour : réélu", XP_DEFI_REELU); }
    }
    Object.keys(P.defiJours).forEach(function (k) { if (+k < j - 60) delete P.defiJours[k]; });
    // Quêtes du jour
    var faites = P.quetesJour[j] || [];
    (opts.quetes || []).forEach(function (q) {
      if (faites.indexOf(q.id) < 0 && queteFaite(q, R)) { faites.push(q.id); P.quetesTot++; quetes.push(q); gagne("Quête : " + q.t, q.xp); }
    });
    P.quetesJour = {}; P.quetesJour[j] = faites;    // on ne garde que la journée en cours
    // Succès (les succès de niveau peuvent se débloquer en cascade)
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
