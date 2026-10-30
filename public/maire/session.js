// Sessions du Maire de Paris : 21 places, des 20 maires d'arrondissement (du moins puissant au plus puissant) jusqu'au trône de Maire de Paris.
// Module pur et déterministe : la session est un objet JSON (partagé en ligne), chaque fonction renvoie une nouvelle session.
// Place 0 = l'arrondissement le moins puissant (on y commence), place 19 = le plus puissant, place 20 = Maire de Paris.
// Le rival d'une place est la place au-dessus (on l'attaque, on le défie aux élections) ; l'opposant est la place au-dessous (il nous attaque).
(function (root) {
  "use strict";
  var NB = 21, TRONE = 20, ABSENT_MS = 5 * 60 * 1000;
  // Les durées et forces réglables viennent de reglages.js (modifiables dans l'administration)
  var R = root.MaireReglages || (typeof require === "function" ? require("./reglages.js") : null);
  function mandatMs() { return R.v.mandatMin * 60000; }   // entre deux élections
  function entreeMs() { return R.v.entreeMin * 60000; }   // on n'entre plus à moins de X min d'une élection
  function afkMs() { return R.v.afkMin * 60000; }         // X min sans rien faire = dehors
  function venteMs() { return R.v.venteMin * 60000; }     // une enchère de prestige toutes les X min, qui dure X min

  // Les arrondissements, du moins peuplé au plus peuplé (= du moins puissant au plus puissant).
  // x, y : centre sur la carte stylisée (0-100) ; r : taille de la pastille ; hab : habitants (ordre de grandeur réel)
  var ARR = {
    1: { hab: 16000, x: 50, y: 44, r: 4.2, q: "Louvre" }, 2: { hab: 20000, x: 54, y: 34, r: 3.6, q: "Bourse" },
    3: { hab: 33000, x: 60, y: 37, r: 3.8, q: "Temple" }, 4: { hab: 28000, x: 59, y: 49, r: 4, q: "Hôtel-de-Ville" },
    5: { hab: 57000, x: 56, y: 67, r: 4.8, q: "Panthéon" }, 6: { hab: 40000, x: 46, y: 64, r: 4.4, q: "Luxembourg" },
    7: { hab: 49000, x: 34, y: 53, r: 5.6, q: "Palais-Bourbon" }, 8: { hab: 36000, x: 34, y: 32, r: 5.6, q: "Élysée" },
    9: { hab: 60000, x: 47, y: 27, r: 4.4, q: "Opéra" }, 10: { hab: 85000, x: 63, y: 25, r: 5, q: "Entrepôt" },
    11: { hab: 142000, x: 70, y: 45, r: 5.6, q: "Popincourt" }, 12: { hab: 140000, x: 80, y: 66, r: 7, q: "Reuilly" },
    13: { hab: 178000, x: 66, y: 83, r: 7, q: "Gobelins" }, 14: { hab: 135000, x: 45, y: 85, r: 6.4, q: "Observatoire" },
    15: { hab: 230000, x: 23, y: 70, r: 7.6, q: "Vaugirard" }, 16: { hab: 165000, x: 12, y: 42, r: 8, q: "Passy" },
    17: { hab: 166000, x: 27, y: 16, r: 6.8, q: "Batignolles-Monceau" }, 18: { hab: 190000, x: 52, y: 11, r: 7, q: "Butte-Montmartre" },
    19: { hab: 182000, x: 76, y: 18, r: 7, q: "Buttes-Chaumont" }, 20: { hab: 192000, x: 87, y: 40, r: 7, q: "Ménilmontant" }
  };

  var ORDRE = [1, 2, 4, 3, 8, 6, 7, 5, 9, 10, 14, 12, 11, 16, 17, 13, 19, 18, 20, 15];

  // La place p correspond à l'arrondissement ORDRE[p] (sauf le trône)
  function arr(p) { return p >= TRONE ? null : ORDRE[p]; }
  function nomArr(n) { return n === 1 ? "1er" : n + "e"; }
  function titre(p) { return p >= TRONE ? "Maire de Paris" : "Maire du " + nomArr(arr(p)) + " arrondissement"; }
  function court(p) { return p >= TRONE ? "Paris" : nomArr(arr(p)); }
  // Puissance : plus la place est haute, plus les impôts rapportent (×0,92 en bas, ×1,2 au trône).
  // En bas de l'échelle, les comptes restent légèrement positifs : on ne s'endette pas sans rien faire.
  function puissance(p) { return Math.round((0.92 + Math.min(p, TRONE) * 0.014) * 1000) / 1000; }
  function habitants(p) { return p >= TRONE ? 2100000 : ARR[arr(p)].hab; }

  // ---------- Hasard déterministe (graine de la session + élection + place) ----------
  function hache(a, b, c) { var h = (a | 0) ^ Math.imul(b + 1, 0x9E3779B1) ^ Math.imul(c + 7, 0x85EBCA77); h = Math.imul(h ^ (h >>> 16), 0x7FEB352D); h = Math.imul(h ^ (h >>> 15), 0x846CA68B); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  // ---------- Bots ----------
  // Noms des maires robots : inventés, en jeux de mots (aucun vrai nom de personne)
  var NOMS_BOTS = ["Jean Bonbeurre", "Alain Proviste", "Sarah Croche", "Gérard Menvussa", "Paul Ochon", "Jacques Ouille", "Anne Orak", "Yves Remord",
    "Laurent Outan", "Teddy Fice", "Jean Talu", "Mehdi Cament", "Sam Suffi", "Lara Clette", "Justin Ptipeu", "Cécile Encieux", "Hubert Lu", "Aude Javel",
    "Guy Tare", "Ali Gator", "Pierre Kiroul", "Rémi Fasol", "Otto Mobile", "Larry Golade", "Agathe Zeblouse", "Sacha Touille", "Annie Versaire", "Eva Cuation",
    "Nordine Ateur", "Mélanie Zette", "Thierry Golo", "Lucie Fer", "Ella Fontaine", "Paul Hochon", "Jean Peuplu", "Yvon Tousseul", "Sophie Stiquée", "Marc Hassin",
    "Gilles Ettajaune", "Daisy Dratation", "Odile Igence", "Bob Inard", "Jessica Rabe", "Alex Térieur", "Mylène Fairmé", "Jean Registre", "Henri Tation", "Anna Conda"];
  var ICOS = ["🎩", "👩‍💼", "🧔", "👩‍🦳", "👨‍💼", "👩", "🧑‍🦱", "👨‍🦳", "👩‍🦰", "🧓", "🧑", "👱‍♀️"];
  function bot(graine, i) {
    var c = hache(graine, 997, i);
    return { type: "bot", id: "bot" + i, nom: NOMS_BOTS[(Math.floor(hache(graine, 994, 0) * NOMS_BOTS.length) + i * 7) % NOMS_BOTS.length],   // pas de 7 : 48 noms tous différents ico: ICOS[Math.floor(c * ICOS.length)],
      talent: Math.round((0.25 + hache(graine, 996, i) * 0.6) * 100) / 100,
      forme: Math.round((hache(graine, 995, i) - 0.5) * 120) / 100, xp: 0 };   // forme : -0,6 (en déclin) à +0,6 (en croissance)
  }
  // Les bots vivent : en croissance, leur sondage monte pendant le mandat ; en déclin, il baisse.
  // Leur forme change à chaque élection (victoire = élan, défaite = coup dur) et ils gagnent de l'expérience.
  function avance(s, maintenant) { var t = maintenant == null ? Date.now() : maintenant; return Math.max(0, Math.min(1, (t - (s.prochaine - mandatMs())) / mandatMs())); }
  function tendance(pl) { var f = pl.forme || 0; return f > 0.15 ? "croissance" : f < -0.15 ? "declin" : "stable"; }
  function evoluerBots(s, duels) {
    s.places.forEach(function (x, p) {
      if (x.type !== "bot") return;
      var n = parseInt(String(x.id).replace(/\D/g, ""), 10) || 0, d = duels.filter(function (y) { return y.bas === p || y.haut === p; })[0];
      var choc = d ? (d.monte ? (d.haut === p ? 0.3 : -0.3) : (d.haut === p ? 0.1 : -0.1)) : 0;   // monté = élan, descendu = coup dur (après l'élection, d.haut est la place du gagnant)
      var f = (x.forme || 0) * 0.6 + (hache(s.graine, s.election * 13 + 5, n) - 0.5) * 1.1 + choc;
      x.forme = Math.round(Math.max(-1, Math.min(1, f)) * 100) / 100;
      x.xp = Math.min(R.v.botXpMax, Math.round(((x.xp || 0) + R.v.botXpGain) * 10) / 10);
    });
  }
  // Score électoral d'un bot : son talent, la puissance de sa place, un aléa différent à chaque élection (comme un sondage, 0-100)
  function scoreBot(s, pl, p, maintenant) {
    var elan = (pl.forme || 0) * R.v.botElan * (0.3 + 0.7 * avance(s, maintenant));
    return Math.round((R.v.botBase - ((s.malus || {})[pl.id] || 0) + pl.talent * 22 + p * 0.55 + (pl.xp || 0) + elan + (hache(s.graine, s.election, p * 31 + (parseInt(String(pl.id).replace(/\D/g, ""), 10) || 0)) - 0.5) * 10) * 10) / 10;
  }
  // Ce qu'on voit du profil d'un bot : popularité, bonheur, habitants, bâtiments… (stable pendant un mandat)
  function statsBot(s, pl, p, maintenant) {
    var sc = scoreBot(s, pl, p, maintenant), f = pl.forme || 0, av = avance(s, maintenant), h = function (k) { return hache(s.graine, s.election * 7 + k, p); };
    return { score: sc, pop: Math.round(sc + (h(1) - 0.5) * 8), bon: Math.round(sc - 4 + (h(2) - 0.5) * 10), hab: Math.round(habitants(p) * (0.95 + h(3) * 0.1) * (1 + f * 0.06 * av)),
      bats: Math.round(4 + p * 2.5 + pl.talent * 12 + h(4) * 4 + (pl.xp || 0) * 2 + Math.max(0, f) * 6 * av), niv: Math.min(50, Math.max(1, Math.round(3 + p * 1.6 + pl.talent * 10 + (pl.xp || 0) * 1.5))),
      mandats: s.election, tendance: tendance(pl), forme: f };
  }

  // Note globale du maire et de sa ville, de 0,1 à 5 étoiles (au dixième près) :
  // sondage 35 %, bonheur 35 %, popularité 15 %, finances 15 %
  function note(x) {
    if (!x) return 0;
    var fin = x.tresor == null ? 50 + (x.forme || 0) * 20 : Math.max(0, Math.min(100, 50 + x.tresor / 10));
    var v = (x.score || 0) * 0.35 + (x.bon == null ? x.score || 0 : x.bon) * 0.35 + (x.pop == null ? x.score || 0 : x.pop) * 0.15 + fin * 0.15;
    return Math.max(0.1, Math.min(5, Math.round((v / 100 * 5 * 1.15 - 0.4) * 10) / 10));
  }
  // ---------- Session ----------
  function copie(o) { return JSON.parse(JSON.stringify(o)); }
  function nouvelleSession(graine, maintenant) {
    var s = { v: 1, graine: graine | 0, debut: maintenant, prochaine: maintenant + mandatMs(), election: 0, places: [], votes: {}, resultats: [] };
    for (var i = 0; i < NB; i++) s.places.push(bot(graine, i));
    return s;
  }
  // Les sessions portent le nom d'un auteur français ; « Victor Hugo » est la session de base, ouverte en permanence
  var AUTEURS = ["Victor Hugo", "Émile Zola", "Molière", "Voltaire", "Albert Camus", "Colette", "George Sand", "Alexandre Dumas", "Honoré de Balzac", "Marcel Proust",
    "Jules Verne", "Simone de Beauvoir", "Gustave Flaubert", "Charles Baudelaire", "Jean de La Fontaine", "Guy de Maupassant", "Marguerite Duras", "Antoine de Saint-Exupéry", "Arthur Rimbaud", "Stendhal"];
  var BASE_ID = "victor-hugo";
  function nomLibre(pris) {
    for (var tour = 1; tour <= 5; tour++) for (var i = 1; i < AUTEURS.length; i++) { var n = AUTEURS[i] + ["", "", " II", " III", " IV", " V"][tour]; if (pris.indexOf(n) < 0) return n; }
    return AUTEURS[1 + Math.floor(Math.random() * (AUTEURS.length - 1))] + " " + (6 + Math.floor(Math.random() * 90));
  }
  // Résumé pour la liste des sessions : joueurs présents (inactifs retirés), niveau moyen, élection
  function resume(s, maintenant) {
    var n = nettoyer(s, maintenant), js = joueurs(n), nivs = js.map(function (x) { return x.stats && x.stats.niv; }).filter(function (v) { return v > 0; });
    return { nom: s.nom || AUTEURS[0], joueurs: js.length, bots: NB - js.length, uids: js.map(function (x) { return x.uid; }), pleine: pleine(n),
      niv: nivs.length ? Math.round(nivs.reduce(function (a, v) { return a + v; }, 0) / nivs.length) : 0, prochaine: s.prochaine, ouvre: !js.length || peutEntrer(s, maintenant) };
  }
  function joueurs(s) { return s.places.filter(function (x) { return x.type === "joueur"; }); }
  function placeDe(s, uid) { for (var i = 0; i < NB; i++) if (s.places[i].type === "joueur" && s.places[i].uid === uid) return i; return -1; }
  // Un joueur arrive : il prend la place de bot la plus basse (on commence en bas de l'échelle),
  // seulement s'il reste au moins 3 minutes avant l'élection (sinon une nouvelle session est créée)
  function peutEntrer(s, maintenant) { return s.prochaine - maintenant >= entreeMs(); }
  function rejoindre(s0, uid, nom, ico, maintenant) {
    if (placeDe(s0, uid) >= 0 || !peutEntrer(s0, maintenant)) return s0;
    var s = copie(s0), p = -1;
    for (var i = 0; i < NB; i++) if (s.places[i].type === "bot") { p = i; break; }
    if (p < 0) return s0;   // session pleine
    s.places[p] = { type: "joueur", uid: uid, nom: nom || "Un maire", ico: ico || "🙂", score: 45, stats: null, vu: maintenant, actif: maintenant, arrive: maintenant };
    return s;
  }
  function pleine(s) { return s.places.every(function (x) { return x.type === "joueur"; }); }
  // Le joueur envoie son état (sondage et chiffres clés) à chaque trimestre
  function signaler(s0, uid, stats, maintenant) {
    var p = placeDe(s0, uid); if (p < 0) return s0;
    var s = copie(s0); s.places[p].score = stats.score; s.places[p].stats = stats; s.places[p].vu = maintenant;
    s.places[p].actif = Math.min(maintenant, stats.actif || maintenant); return s;
  }
  // Anti-AFK : un joueur qui n'a rien fait depuis 15 minutes (ou qui est parti) est remplacé par un bot (sa place est conservée par le bot)
  function inactif(x, maintenant) { return maintenant - Math.max(x.actif || x.arrive || 0, 0) > afkMs(); }
  function nettoyer(s0, maintenant) {
    var s = copie(s0), ch = false;
    s.places.forEach(function (x, p) { if (x.type === "joueur" && inactif(x, maintenant)) { s.places[p] = bot(s.graine, 100 + p + s.election * 21); delete s.votes[x.uid]; ch = true; } });
    return ch ? s : s0;
  }
  function quitter(s0, uid) {
    var p = placeDe(s0, uid); if (p < 0) return s0;
    var s = copie(s0); s.places[p] = bot(s.graine, 100 + p + s.election * 21); delete s.votes[uid]; return s;
  }

  // ---------- Attaques : on attaque son rival (au-dessus) ou son opposant (au-dessous) ----------
  // Chaque attaque retire des points au sondage de la cible jusqu'à la prochaine élection (malus, 15 au plus).
  // Un service de communication (bouclier) arrête la prochaine attaque reçue. Les bots attaquent aussi.
  var ATTAQUES = {
    presse: { nom: "Campagne de presse", ico: "📰", cout: 35, pts: 2, cd: 60000, txt: "Des tribunes et des unes peu flatteuses : −2 points à son sondage." },
    manif: { nom: "Manifestation organisée", ico: "📣", cout: 60, pts: 3, cd: 90000, txt: "Des pancartes devant sa mairie : −3 points." },
    scandale: { nom: "Dossier compromettant", ico: "🕵️", cout: 100, pts: 5, risque: 0.35, retour: 3, cd: 150000, txt: "−5 points… mais une fois sur trois, l’affaire se retourne contre toi (−3)." },
    debat: { nom: "Débat télévisé", ico: "🎤", cout: 0, pts: 3, duel: true, cd: 180000, txt: "Gratuit : le mieux placé dans les sondages fait perdre 3 points à l’autre." }
  };
  var BOUCLIER = { nom: "Service de communication", ico: "🛡️", cout: 50, cd: 120000, txt: "Arrête la prochaine attaque reçue (jusqu’à l’élection)." };
    // Prix d'une action selon la place : plus on est puissant (et riche), plus elle coûte cher (×1 en bas, ×3 au trône)
  function prixAction(cout, p) { return Math.round(cout * (1 + Math.min(p, TRONE) * 0.1) / 5) * 5; }
  function cle(x) { return x.type === "joueur" ? x.uid : x.id; }
  function qui(s, p) { var x = s.places[p]; return { nom: x.nom, ico: x.ico, court: court(p), uid: x.uid || null, bot: x.type === "bot" }; }
  function malusDe(s, p) { return ((s.malus || {})[cle(s.places[p])]) || 0; }
  function attente(s, k, maintenant) { return Math.max(0, ((s.cd || {})[k] || 0) - maintenant); }
  function noter(s, e) { s.journal = (s.journal || []).concat([e]).slice(-30); }
  // Applique une attaque de la place a vers la place c (alea entre 0 et 1, donné par l'appelant)
  // Avocats (défense) et attachés de presse (attaque) des joueurs : envoyés avec leur état
  function emp(s, p, k) { var x = s.places[p]; return (x.type === "joueur" && x.stats && x.stats[k]) || 0; }
  function ajouter(s, k, pts) { s.malus[k] = Math.min(R.v.malusMax, Math.round(((s.malus[k] || 0) + pts) * 10) / 10); }
  function frapper(s, a, c, type, maintenant, alea) {
    var A = ATTAQUES[type], kc = cle(s.places[c]), ka = cle(s.places[a]), e = { q: maintenant, type: type, de: qui(s, a), vers: qui(s, c), res: "ok", pts: A.pts };
    var versC = Math.round(A.pts * (1 + emp(s, a, "att")) * (1 - emp(s, c, "def")) * 10) / 10, versA = function (n) { return Math.round(n * (1 + emp(s, c, "att")) * (1 - emp(s, a, "def")) * 10) / 10; };
    s.malus = s.malus || {}; s.boucliers = s.boucliers || {};
    if (s.boucliers[kc]) { delete s.boucliers[kc]; e.res = "bloque"; e.pts = 0; }
    else if (A.duel) {
      var sc = scores(s, maintenant);
      if (sc[a] >= sc[c]) { ajouter(s, kc, versC); e.pts = versC; }
      else { e.pts = versA(A.pts); ajouter(s, ka, e.pts); e.res = "perdu"; }
    } else if (A.risque && alea < A.risque) { e.pts = Math.round(A.retour * (1 - emp(s, a, "def")) * 10) / 10; ajouter(s, ka, e.pts); e.res = "rate"; }
    else { ajouter(s, kc, versC); e.pts = versC; }
    noter(s, e); return e;
  }
  // Un joueur attaque une place voisine (cible = p + 1 ou p - 1)
  function attaquer(s0, uid, cible, type, maintenant, alea) {
    var p = placeDe(s0, uid), A = ATTAQUES[type];
    if (p < 0 || !A || (cible !== p + 1 && cible !== p - 1) || cible < 0 || cible >= NB) return s0;
    if (attente(s0, uid + ":" + type, maintenant)) return s0;
    var s = copie(s0); s.cd = s.cd || {}; s.cd[uid + ":" + type] = maintenant + A.cd;
    frapper(s, p, cible, type, maintenant, alea || 0);
    return s;
  }
  function proteger(s0, uid, maintenant) {
    var p = placeDe(s0, uid); if (p < 0 || attente(s0, uid + ":bouclier", maintenant) || (s0.boucliers || {})[uid]) return s0;
    var s = copie(s0); s.cd = s.cd || {}; s.cd[uid + ":bouclier"] = maintenant + BOUCLIER.cd; s.boucliers = s.boucliers || {}; s.boucliers[uid] = 1;
    noter(s, { q: maintenant, type: "bouclier", de: qui(s, p), vers: null, res: "ok", pts: 0 }); return s;
  }
  // Les bots voisins d'un joueur l'attaquent de temps en temps (appelé quand le joueur envoie son état)
  function ripostes(s0, uid, maintenant, alea) {
    var p = placeDe(s0, uid); if (p < 0) return s0;
    var s = s0;
    [p + 1, p - 1].forEach(function (b, i) {
      if (b < 0 || b >= NB || s.places[b].type !== "bot") return;
      var bt = s.places[b], k = bt.id + ":bot";
      if (attente(s, k, maintenant)) return;
      var a = (alea * 7.31 + i * 0.37) % 1;
      if (a > 0.1 + bt.talent * 0.12) return;
      var types = ["presse", "manif", "scandale", "debat"], type = types[Math.floor(((alea * 13.7 + i) % 1) * types.length)];
      if (s === s0) s = copie(s0);
      s.cd = s.cd || {}; s.cd[k] = maintenant + 100000 + Math.round(a * 80000);
      frapper(s, b, p, type, maintenant, (alea * 3.3) % 1);
    });
    return s;
  }

  // ---------- Salle des ventes : arrondissement contre arrondissement ----------
  // Une seule vente à la fois : elle dure 6 minutes, la suivante commence juste après (on la voit venir, en gris).
  // cat = { ids: [...], cout: { id: prix moyen } } : les bâtiments de prestige (fournis par le moteur).
  // Chaque vente a un bot enchérisseur (une place de la session) avec un prix maximum secret ; les offres des joueurs sont gardées dans la session.
    function pasDe(cout) { return Math.max(5, Math.round(cout * 0.05 / 5) * 5); }
  function idVente(s, cat, k) {
    var n = cat.ids.length, i = Math.floor(hache(s.graine, 5000, k) * n), pris = {};
    for (var j = 1; j <= 2; j++) if (k - j >= 0) pris[cat.ids[Math.floor(hache(s.graine, 5000, k - j) * n)]] = 1;
    while (pris[cat.ids[i]]) i = (i + 1) % n;
    return cat.ids[i];
  }
  function vente(s, cat, k, maintenant) {
    if (k < 0) return null;
    var id = idVente(s, cat, k), cout = cat.cout[id], debut = s.debut + k * venteMs(), fin = debut + venteMs(), pas = pasDe(cout);
    var depart = Math.round(cout * 0.5 / 5) * 5;
    // Le bot enchérisseur : une place tenue par un bot, et son prix maximum (parfois sous le prix moyen : bonne affaire possible)
    var b = Math.floor(hache(s.graine, 5001, k) * NB), tours = 0;
    while (s.places[b].type !== "bot" && tours++ < NB) b = (b + 1) % NB;
    var botMax = Math.round(cout * (0.6 + hache(s.graine, 5002, k) * 0.65) / 5) * 5;
    // Sa courbe : il monte peu à peu jusqu'à un plafond, avant la dernière minute
    var plafond = Math.min(botMax, Math.round(cout * (0.55 + hache(s.graine, 5003, k) * 0.35) / 5) * 5);
    var avance = Math.max(0, Math.min(1, (Math.min(maintenant, fin) - debut) / (venteMs() - 60000)));
    var courbe = Math.max(depart, Math.floor((depart + (plafond - depart) * avance) / pas) * pas);
    var offres = ((s.ventes || {})[k] || []), h = offres.length ? offres[offres.length - 1] : null, H = h ? h.m : 0;
    var B = courbe;
    if (H) B = botMax >= H + pas ? Math.min(botMax, Math.max(courbe, H + pas)) : Math.min(courbe, H - pas);
    var botTete = !H || B > H;
    var meneur = botTete ? { nom: s.places[b].nom, ico: s.places[b].ico, court: court(b), bot: true, uid: null } : { nom: h.nom, ico: h.ico, court: h.court, bot: false, uid: h.uid };
    return { k: k, id: id, cout: cout, debut: debut, fin: fin, pas: pas, prix: botTete ? B : H, meneur: meneur, fini: maintenant >= fin, nb: offres.length + 1,
      affaire: (botTete ? B : H) <= cout * 0.7 && fin - maintenant <= venteMs() / 2, bientot: fin - maintenant <= 60000 && maintenant < fin };
  }
  function ventesEnCours(s, cat, maintenant) {
    var k = Math.floor((maintenant - s.debut) / venteMs()), l = [];
    for (var j = k - Math.ceil(venteMs() / venteMs()) + 1; j <= k; j++) { var v = vente(s, cat, j, maintenant); if (v && !v.fini) l.push(v); }
    return l;
  }
  function venteSuivante(s, maintenant) { var k = Math.floor((maintenant - s.debut) / venteMs()) + 1; return s.debut + k * venteMs(); }
  // La prochaine vente (pas encore ouverte) : le bâtiment et son prix de départ
  function prochaineVente(s, cat, maintenant) { return vente(s, cat, Math.floor((maintenant - s.debut) / venteMs()) + 1, maintenant); }
  // Ventes terminées récemment (pour que le gagnant récupère son bâtiment)
  function ventesFinies(s, cat, maintenant) {
    var k = Math.floor((maintenant - s.debut) / venteMs()), l = [];
    for (var j = k - 6; j <= k; j++) { var v = vente(s, cat, j, maintenant); if (v && v.fini) l.push(v); }
    return l;
  }
  function encherir(s0, uid, cat, k, montant, maintenant) {
    var p = placeDe(s0, uid), v = vente(s0, cat, k, maintenant);
    if (p < 0 || !v || v.fini || maintenant < v.debut || montant < v.prix + v.pas || (!v.meneur.bot && v.meneur.uid === uid)) return s0;
    var s = copie(s0); s.ventes = s.ventes || {};
    var kmin = Math.floor((maintenant - s.debut) / venteMs()) - 10;
    Object.keys(s.ventes).forEach(function (x) { if (+x < kmin) delete s.ventes[x]; });
    s.ventes[k] = (s.ventes[k] || []).concat([{ uid: uid, nom: s.places[p].nom, ico: s.places[p].ico, court: court(p), m: Math.round(montant), q: maintenant }]).slice(-12);
    return s;
  }

  // ---------- Élections anticipées : la moitié des joueurs (humains) doit voter pour ----------
  function voter(s0, uid) { if (placeDe(s0, uid) < 0 || s0.votes[uid]) return s0; var s = copie(s0); s.votes[uid] = 1; return s; }
  function votesRequis(s) { return Math.max(1, Math.ceil(joueurs(s).length / 2)); }
  function nbVotes(s) { return Object.keys(s.votes || {}).filter(function (u) { return placeDe(s, u) >= 0; }).length; }
  function electionDue(s, maintenant) { return maintenant >= s.prochaine || nbVotes(s) >= votesRequis(s) && joueurs(s).length > 0; }

  // ---------- Élection : chacun défie son rival (la place au-dessus) ----------
  // Score : le sondage du joueur (popularité, bonheur, promesses…), un joueur absent perd 10 points.
  // On remonte l'échelle par le bas : qui bat son rival prend sa place (une seule place gagnée par élection).
  function scores(s, maintenant) {
    return s.places.map(function (x, p) {
      if (x.type === "bot") return scoreBot(s, x, p, maintenant);
      return (x.score || 40) - ((s.malus || {})[x.uid] || 0) - (maintenant - (x.vu || 0) > ABSENT_MS ? 10 : 0);
    });
  }
  function elire(s0, maintenant) {
    if (!electionDue(s0, maintenant)) return s0;
    var s = copie(s0), sc = scores(s0, maintenant), avant = s.places.map(function (x) { return x; }), duels = [];
    var p = 0;
    while (p < NB - 1) {
      var gagne = sc[p] > sc[p + 1];
      duels.push({ bas: p, haut: p + 1, sBas: sc[p], sHaut: sc[p + 1], monte: gagne });
      if (gagne) { var t = s.places[p]; s.places[p] = s.places[p + 1]; s.places[p + 1] = t; var u = sc[p]; sc[p] = sc[p + 1]; sc[p + 1] = u; p += 2; }
      else p += 1;
    }
    evoluerBots(s, duels);
    // Ce que chaque joueur doit savoir : d'où il part, où il arrive, contre qui il a gagné ou perdu
    s.resultats = [];
    avant.forEach(function (x, pAvant) {
      if (x.type !== "joueur") return;
      var pApres = placeDe(s, x.uid), d = duels.filter(function (y) { return y.bas === pAvant || y.haut === pAvant; });
      s.resultats.push({ uid: x.uid, avant: pAvant, apres: pApres, duel: d.length ? d[0] : null });
    });
    s.election++; s.prochaine = maintenant + mandatMs(); s.votes = {}; s.derniere = maintenant; s.malus = {}; s.boucliers = {};
    return s;
  }
  function resultatDe(s, uid) { return (s.resultats || []).filter(function (r) { return r.uid === uid; })[0] || null; }

  // Fiche d'une place (joueur ou bot), pour le classement et la comparaison
  function fiche(s, p) {
    var x = s.places[p], st = x.type === "bot" ? statsBot(s, x, p) : (x.stats || { score: x.score || 45 });
    return { p: p, titre: titre(p), court: court(p), arr: arr(p), type: x.type, nom: x.nom, ico: x.ico, uid: x.uid || null, stats: st, puissance: puissance(p), hab: st.hab || habitants(p) };
  }

  var API = { AUTEURS: AUTEURS, BASE_ID: BASE_ID, nomLibre: nomLibre, resume: resume, tendance: tendance, note: note, NB: NB, TRONE: TRONE, peutEntrer: peutEntrer, quitter: quitter, inactif: inactif, ARR: ARR, ORDRE: ORDRE, arr: arr, nomArr: nomArr, titre: titre, court: court, puissance: puissance, habitants: habitants,
    nouvelleSession: nouvelleSession, rejoindre: rejoindre, attaquer: attaquer, proteger: proteger, ripostes: ripostes, ATTAQUES: ATTAQUES, BOUCLIER: BOUCLIER, prixAction: prixAction, malusDe: malusDe, attente: attente,
    ventesEnCours: ventesEnCours, ventesFinies: ventesFinies, venteSuivante: venteSuivante, prochaineVente: prochaineVente, vente: vente, encherir: encherir, pleine: pleine, signaler: signaler, nettoyer: nettoyer, voter: voter, votesRequis: votesRequis, nbVotes: nbVotes,
    electionDue: electionDue, scores: scores, elire: elire, resultatDe: resultatDe, placeDe: placeDe, joueurs: joueurs, fiche: fiche, statsBot: statsBot, scoreBot: scoreBot };
  // Durées réglables, lues en direct (S.MANDAT_MS suit les réglages)
  [["MANDAT_MS", mandatMs], ["ENTREE_MIN", entreeMs], ["AFK_MS", afkMs], ["VENTE_P", venteMs], ["VENTE_D", venteMs], ["MALUS_MAX", function () { return R.v.malusMax; }]].forEach(function (x) { Object.defineProperty(API, x[0], { get: x[1], enumerable: true }); });
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MaireSession = API;
})(this);
