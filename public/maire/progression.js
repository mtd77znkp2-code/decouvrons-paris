// Maire de Paris : progression du joueur. XP et niveaux (qui débloquent les mécaniques du jeu), l'histoire racontée
// par Léon en 9 chapitres, les tutoriels, 100 succès, le défi du jour et 3 quêtes du jour.
// Tout est calculé à partir du bilan d'une partie terminée ; le profil est gardé dans le navigateur.
(function (root) {
  "use strict";
  var CLE = "maire_profil_v1";
  var RANG = { facile: 0, moyen: 1, difficile: 2 };
  var NOM_NIV = { facile: "Facile", moyen: "Moyen", difficile: "Réaliste" };
  var XP_ELECTION = { facile: 60, moyen: 120, difficile: 200 }, XP_TIER = [0, 25, 50, 100, 200], XP_CHAPITRE = 200;
  var XP_DEFI = 150, XP_DEFI_BONUS = 50, NIV_MAX = 50, NIV_DEFI = 8, NIV_QUETES = 2;
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
  function xpPour(n) { return n <= 1 ? 0 : Math.round(80 * Math.pow(n - 1, 1.6)); }
  function niveau(xp) {
    var n = 1; while (n < NIV_MAX && xp >= xpPour(n + 1)) n++;
    var t = TITRES[0][1]; TITRES.forEach(function (x) { if (n >= x[0]) t = x[1]; });
    var a = xpPour(n), b = n < NIV_MAX ? xpPour(n + 1) : a;
    return { n: n, titre: t, xp: xp, depuis: xp - a, besoin: b - a, pct: n < NIV_MAX ? Math.round((xp - a) / (b - a) * 100) : 100, max: n >= NIV_MAX };
  }

  // ---------- L'histoire : un chapitre par mécanique débloquée ----------
  // titre, récit de Léon (ton directeur de cabinet), étapes du tutoriel, objectif du chapitre (récompensé une fois)
  var HISTOIRE = {
    base: { num: 1, titre: "Le premier jour", recit: "Bienvenue à l’Hôtel de Ville ! Je suis Léon, ton directeur de cabinet. Les Parisiens t’ont élu de justesse, sur une promesse : rendre Paris plus agréable à vivre d’ici 2040. À nous de leur prouver qu’ils ont eu raison.",
      etapes: ["📅 Chaque clic sur « Trimestre suivant » fait passer 3 mois. Les impôts rentrent, la ville dépense pour fonctionner.",
        "📂 Chaque trimestre, un dossier arrive sur ton bureau : choisis une réponse. Certaines coûtent de l’argent, d’autres font plaisir… ou fâchent.",
        "🛒 Avec ta trésorerie, achète des bâtiments dans la boutique. Chacun fait monter un des 4 piliers : 🏠 Logement, 🚇 Transports, 🌳 Cadre de vie, 🛡️ Sécurité.",
        "😊 Le bonheur des Parisiens, c’est la moyenne des 4 piliers. Sans investissement, ils baissent un peu chaque trimestre.",
        "🗳️ Tous les 6 ans (24 trimestres), l’élection. Le sondage en haut de l’écran te dit où tu en es : il te faut plus de 50 %."],
      objectif: "Gagne ta première élection.", ok: function (R) { return R.mandats >= 1; } },
    budget: { num: 2, titre: "Le nerf de la guerre", recit: "Bonne nouvelle : le Conseil de Paris te laisse désormais fixer les impôts locaux. C’est le nerf de la guerre… mais les Parisiens surveillent leur feuille d’impôts.",
      etapes: ["💶 Dans la partie Budget, le curseur « Impôts » va de 80 % à 130 %.", "⬆️ Plus d’impôts : plus d’argent pour acheter, mais la popularité et le logement en pâtissent.",
        "🏦 Si la trésorerie passe sous zéro, la ville emprunte. Au-delà de 1,5 milliard de dette, c’est la faillite et la partie s’arrête."],
      objectif: "Gagne une élection sans aucune dette.", ok: function (R) { return R.el.some(function (e) { return e.dette === 0; }); } },
    opposant: { num: 3, titre: "L’opposition se réveille", recit: "Ton succès agace. Un adversaire va se dresser contre toi à chaque mandat : on le découvre à la roulette, et il ne lâchera rien.",
      etapes: ["🎰 En début de mandat, une roulette tire ton opposant. Son influence (sur 100) pèse sur le sondage.",
        "⚔️ Une fois par an, il attaque. Tu peux riposter (ça coûte de l’argent), tenter de le faire tomber (une chance sur deux) ou ne rien faire : il revient alors plus fort.",
        "🏳️ Si son influence passe sous 15, il renonce jusqu’à la prochaine élection."],
      objectif: "Pousse un opposant à renoncer.", ok: function (R) { return R.x.elimines >= 1; } },
    boutique2: { num: 4, titre: "Voir plus grand", recit: "Les Parisiens commencent à te faire confiance. Les services techniques te proposent de nouveaux équipements, plus chers mais plus efficaces. Et le niveau Moyen t’est ouvert.",
      etapes: ["🏫 Nouveaux bâtiments : école, ligne de tramway, brigade de propreté et marché couvert.",
        "🧺 Le marché couvert rapporte de l’argent chaque trimestre : pratique pour financer le reste.", "🎚️ Le niveau Moyen est débloqué, avec son propre classement."],
      objectif: "Gagne une élection en Moyen.", ok: function (R) { return R.mandats >= 1 && R.rang >= 1; } },
    cata: { num: 5, titre: "Paris face aux éléments", recit: "Crues, incendies, pannes géantes… Une capitale vit aussi des coups durs. Et parfois, de vrais coups de chance.",
      etapes: ["🚨 Des catastrophes peuvent tomber n’importe quel trimestre : garde toujours un peu d’argent de côté.", "🍀 Des coups de chance arrivent aussi au hasard : sache en profiter."],
      objectif: "Gagne une élection après avoir affronté une catastrophe.", ok: function (R) { return R.mandats >= 1 && R.x.catastrophes >= 1; } },
    promesses: { num: 6, titre: "Tenir parole", recit: "Cette fois, tu fais campagne sur deux promesses. Les Parisiens s’en souviendront le jour du vote.",
      etapes: ["🎯 En début de partie, choisis deux piliers à promettre.", "✅ Le jour de l’élection, chaque promesse tenue (pilier à 60 ou plus) te rapporte des voix ; aucune promesse tenue en fait perdre."],
      objectif: "Gagne une élection en tenant tes deux promesses.", ok: function (R) { return R.el.some(function (e) { return e.amb.length === 2; }); } },
    ligne: { num: 7, titre: "Garder le cap", recit: "Ton camp politique attend que tu restes fidèle à tes idées. Gauche, centre, droite ou écologie : à toi de choisir… et de t’y tenir.",
      etapes: ["🧭 Choisis ta ligne politique en début de partie.", "📏 Chaque dossier et chaque bâtiment plaît ou déplaît à ton camp : c’est ta cohérence.",
        "🤝 Une cohérence élevée soutient ta popularité, et tu peux mobiliser ton camp contre l’opposant."],
      objectif: "Gagne une élection avec une cohérence d’au moins 70.", ok: function (R) { return R.el.some(function (e) { return e.coh >= 70; }); } },
    boutique3: { num: 8, titre: "Les grands chantiers", recit: "Paris voit grand. Métro, hôpital, écoquartier, grand musée : les grands équipements sont à ta portée. Le niveau Réaliste et le défi du jour aussi.",
      etapes: ["🚇 Nouveaux équipements : station de métro, hôpital, écoquartier et grand musée.", "🎚️ Le niveau Réaliste est débloqué.", "🎯 Le défi du jour t’attend chaque jour sur l’accueil."],
      objectif: "Gagne une élection en Réaliste.", ok: function (R) { return R.mandats >= 1 && R.rang >= 2; } },
    projets: { num: 9, titre: "Paris 2040", recit: "Nous y sommes. Les trois grands projets qui changeront Paris pour toujours sont sur la table. Réalise-les et ton nom restera dans l’histoire.",
      etapes: ["🏟️ Village olympique, 🚄 Grand Paris Express, 🏊 Seine baignable : très chers, mais immenses.", "🏆 Les trois réunis dans une même partie, c’est la légende."],
      objectif: "Réalise les trois grands projets de Paris 2040 dans une même partie.", ok: function (R) { return R.bat.jo && R.bat.gpe && R.bat.seine; } }
  };

  // ---------- Profil (navigateur) ----------
  function profilVide() {
    return { v: 3, xp: 0, parties: 0, mandats: 0, mandatsNiv: { facile: 0, moyen: 0, difficile: 0 }, mandatsLigne: {}, meilleurMandats: 0,
      achats: 0, bats: {}, elims: 0, contres: 0, catas: 0, chances: 0, defis: 0, defiJours: {}, quetesTot: 0, quetesJour: {}, succes: {},
      scoreMax: 0, pertes: {}, chapitres: {}, tutos: {} };
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
  function tutosAVoir(M) { var P = lire(), n = niveau(P.xp).n; return M.MECANIQUES.filter(function (m) { return n >= m.niv && !P.tutos[m.id]; }).map(function (m) { return m.id; }); }
  function tutoVu(id) { var P = lire(); P.tutos[id] = 1; ecrire(P); }
  function chapitre(M, n) { var c = null; M.MECANIQUES.forEach(function (m) { if (n >= m.niv) c = m.id; }); return c; }

  // ---------- Résumé d'une partie terminée ----------
  var FAM = { finances: "budget", economie: "budget", securite: "securite", logement: "logement", transports: "transports", proprete: "cadre", ecologie: "cadre",
    services: "cadre", culture: "cadre", quotidien: "cadre", institutions: "politique", crise: "crise" };
  function resume(st, M) {
    var b = M.bilan(st), x = M.stats(st), gagnees = (st.elections || []).filter(function (e) { return e.gagne; }), fam = {};
    Object.keys(x.cats).forEach(function (c) { var f = FAM[c]; if (f) fam[f] = (fam[f] || 0) + x.cats[c]; });
    return { niveau: st.niveau || "moyen", rang: RANG[st.niveau || "moyen"], ligne: st.ligne, ambitions: st.ambitions, meca: st.meca,
      mandats: gagnees.length, t: st.fin ? st.fin.t : st.t, perte: st.fin ? st.fin.raison.type : null, score: b.score, x: x, fam: fam,
      el: gagnees, bat: st.bat || {}, defi: st.defi != null ? st.defi : null };
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

  // ---------- Défi du jour : même départ pour tout le monde (toutes les mécaniques jusqu'au niveau 8) ----------
  function defiDuJour(j, M, lots, minEvts) {
    var r = generateur(graine(j)), L = Object.keys(M.LIGNES), D = Object.keys(M.PILIERS);
    var amb = melange(D, r).slice(0, 2), ligne = L[Math.floor(r() * L.length)], niv = ["moyen", "facile", "difficile"][j % 3];
    var choisis = [], n = 0;
    melange(lots, r).forEach(function (l) { if (n < (minEvts || 600)) { choisis.push(l.f); n += l.n; } });
    return { jour: j, graine: graine(j * 7 + 3) || 1, niveau: niv, ligne: ligne, ambitions: amb, lots: choisis, nivJoueur: NIV_DEFI };
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

  // ---------- Fin de partie : tout ce que la partie rapporte ----------
  function terminer(st, M, opts) {
    opts = opts || {};
    var P = lire(), R = resume(st, M), j = opts.jour != null ? opts.jour : jour(), avant = niveau(P.xp), gains = [], nouveaux = [], quetes = [], chapitres = [];
    function gagne(txt, xp) { if (xp > 0) { gains.push({ txt: txt, xp: xp }); P.xp += xp; } }
    P.parties++; if (R.score > P.scoreMax) P.scoreMax = R.score;
    P.mandats += R.mandats; P.mandatsNiv[R.niveau] += R.mandats; P.meilleurMandats = Math.max(P.meilleurMandats, R.mandats);
    if (R.mandats && R.meca.ligne) P.mandatsLigne[R.ligne] = (P.mandatsLigne[R.ligne] || 0) + R.mandats;
    if (R.perte) P.pertes[R.perte] = (P.pertes[R.perte] || 0) + 1;
    P.achats += R.x.achats; Object.keys(R.x.bats).forEach(function (k) { P.bats[k] = (P.bats[k] || 0) + R.x.bats[k]; });
    P.elims += R.x.elimines; P.contres += R.x.contre + R.x.mobilise; P.catas += R.x.catastrophes; P.chances += R.x.chances;
    gagne("Trimestres à l’Hôtel de Ville", Math.min(150, R.t * 2));
    if (R.mandats) gagne(R.mandats + " élection" + (R.mandats > 1 ? "s" : "") + " gagnée" + (R.mandats > 1 ? "s" : "") + " (" + NOM_NIV[R.niveau] + ")", XP_ELECTION[R.niveau] * R.mandats);
    gagne("Bâtiments achetés", Math.min(80, R.x.achats * 2));
    // Objectifs de chapitre accomplis (chaque chapitre déjà ouvert peut être validé dans n'importe quelle partie)
    M.MECANIQUES.forEach(function (m) {
      var h = HISTOIRE[m.id]; if (!h || P.chapitres[m.id] || !R.meca[m.id]) return;
      var ok = false; try { ok = h.ok(R); } catch (e) { ok = false; }
      if (ok) { P.chapitres[m.id] = j; chapitres.push(h); gagne("Chapitre " + h.num + " accompli : " + h.titre, XP_CHAPITRE); }
    });
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
    var apres = niveau(P.xp), debloque = M.MECANIQUES.filter(function (m) { return m.niv > avant.n && m.niv <= apres.n; });
    return { gains: gains, total: gains.reduce(function (a, g) { return a + g.xp; }, 0), nouveaux: nouveaux, quetes: quetes, chapitres: chapitres,
      avant: avant, apres: apres, debloque: debloque, profil: P };
  }

  var API = { jour: jour, niveau: niveau, xpPour: xpPour, lire: lire, ecrire: ecrire, profilVide: profilVide, resume: resume, terminer: terminer,
    nivJoueur: nivJoueur, fixerNiveau: fixerNiveau, oublierTutos: oublierTutos, tutosAVoir: tutosAVoir, tutoVu: tutoVu, chapitre: chapitre,
    HISTOIRE: HISTOIRE, quetesDuJour: quetesDuJour, queteFaite: queteFaite, TYPES_QUETES: Object.keys(QUETE), defiDuJour: defiDuJour,
    SUCCES: S, XP_TIER: XP_TIER, NOM_NIV: NOM_NIV, TITRES: TITRES, NIV_DEFI: NIV_DEFI, NIV_QUETES: NIV_QUETES, NIV_MAX: NIV_MAX };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MaireProg = API;
})(this);
