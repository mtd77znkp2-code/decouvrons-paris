// Sessions du Maire de Paris : 21 places, des 20 maires d'arrondissement (du moins puissant au plus puissant) jusqu'au trône de Maire de Paris.
// Module pur et déterministe : la session est un objet JSON (partagé en ligne), chaque fonction renvoie une nouvelle session.
// Place 0 = l'arrondissement le moins puissant (on y commence), place 19 = le plus puissant, place 20 = Maire de Paris.
// Le rival d'une place est la place au-dessus (on l'attaque, on le défie aux élections) ; l'opposant est la place au-dessous (il nous attaque).
(function (root) {
  "use strict";
  var NB = 21, TRONE = 20, MANDAT_MS = 10 * 60 * 1000, ABSENT_MS = 5 * 60 * 1000;

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
  // Puissance : plus la place est haute, plus les impôts rapportent (×0,8 en bas, ×1,2 au trône)
  function puissance(p) { return Math.round((0.8 + Math.min(p, TRONE) * 0.02) * 100) / 100; }
  function habitants(p) { return p >= TRONE ? 2100000 : ARR[arr(p)].hab; }

  // ---------- Hasard déterministe (graine de la session + élection + place) ----------
  function hache(a, b, c) { var h = (a | 0) ^ Math.imul(b + 1, 0x9E3779B1) ^ Math.imul(c + 7, 0x85EBCA77); h = Math.imul(h ^ (h >>> 16), 0x7FEB352D); h = Math.imul(h ^ (h >>> 15), 0x846CA68B); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  // ---------- Bots ----------
  var PRENOMS = ["Bernard", "Sylvie", "Gérard", "Nadia", "Philippe", "Catherine", "Rachid", "Isabelle", "Thierry", "Monique", "Karim", "Brigitte", "Jean-Pierre", "Sandrine", "Didier", "Fatima", "Michel", "Valérie", "Olivier", "Martine", "Patrick", "Hélène"];
  var NOMS = ["Delaunay", "Morel", "Benali", "Lefèvre", "Garnier", "Rousseau", "Chevalier", "Mercier", "Diallo", "Fontaine", "Lambert", "Bonnet", "Perrin", "Girard", "Moreau", "Haddad", "Roux", "Fournier", "Blanc", "Nguyen", "Leroy", "Faure"];
  var ICOS = ["🎩", "👩‍💼", "🧔", "👩‍🦳", "👨‍💼", "👩", "🧑‍🦱", "👨‍🦳", "👩‍🦰", "🧓", "🧑", "👱‍♀️"];
  function bot(graine, i) {
    var a = hache(graine, 999, i), b = hache(graine, 998, i), c = hache(graine, 997, i);
    return { type: "bot", id: "bot" + i, nom: PRENOMS[Math.floor(a * PRENOMS.length)] + " " + NOMS[Math.floor(b * NOMS.length)], ico: ICOS[Math.floor(c * ICOS.length)],
      talent: Math.round((0.25 + hache(graine, 996, i) * 0.6) * 100) / 100 };
  }
  // Score électoral d'un bot : son talent, la puissance de sa place, un aléa différent à chaque élection (comme un sondage, 0-100)
  function scoreBot(s, pl, p) { return Math.round((40 - ((s.malus || {})[pl.id] || 0) + pl.talent * 22 + p * 0.55 + (hache(s.graine, s.election, p * 31 + (parseInt(String(pl.id).replace(/\D/g, ""), 10) || 0)) - 0.5) * 12) * 10) / 10; }
  // Ce qu'on voit du profil d'un bot : popularité, bonheur, habitants, bâtiments… (stable pendant un mandat)
  function statsBot(s, pl, p) {
    var sc = scoreBot(s, pl, p), h = function (k) { return hache(s.graine, s.election * 7 + k, p); };
    return { score: sc, pop: Math.round(sc + (h(1) - 0.5) * 8), bon: Math.round(sc - 4 + (h(2) - 0.5) * 10), hab: Math.round(habitants(p) * (0.95 + h(3) * 0.1)),
      bats: Math.round(4 + p * 2.5 + pl.talent * 12 + h(4) * 4), niv: Math.max(1, Math.round(3 + p * 1.6 + pl.talent * 10)), mandats: s.election };
  }

  // ---------- Session ----------
  function copie(o) { return JSON.parse(JSON.stringify(o)); }
  function nouvelleSession(graine, maintenant) {
    var s = { v: 1, graine: graine | 0, debut: maintenant, prochaine: maintenant + MANDAT_MS, election: 0, places: [], votes: {}, resultats: [] };
    for (var i = 0; i < NB; i++) s.places.push(bot(graine, i));
    return s;
  }
  function joueurs(s) { return s.places.filter(function (x) { return x.type === "joueur"; }); }
  function placeDe(s, uid) { for (var i = 0; i < NB; i++) if (s.places[i].type === "joueur" && s.places[i].uid === uid) return i; return -1; }
  // Un joueur arrive : il prend la place de bot la plus basse (on commence en bas de l'échelle)
  function rejoindre(s0, uid, nom, ico, maintenant) {
    if (placeDe(s0, uid) >= 0) return s0;
    var s = copie(s0), p = -1;
    for (var i = 0; i < NB; i++) if (s.places[i].type === "bot") { p = i; break; }
    if (p < 0) return s0;   // session pleine
    s.places[p] = { type: "joueur", uid: uid, nom: nom || "Un maire", ico: ico || "🙂", score: 45, stats: null, vu: maintenant, arrive: maintenant };
    return s;
  }
  function pleine(s) { return s.places.every(function (x) { return x.type === "joueur"; }); }
  // Le joueur envoie son état (sondage et chiffres clés) à chaque trimestre
  function signaler(s0, uid, stats, maintenant) {
    var p = placeDe(s0, uid); if (p < 0) return s0;
    var s = copie(s0); s.places[p].score = stats.score; s.places[p].stats = stats; s.places[p].vu = maintenant; return s;
  }
  // Un joueur parti depuis longtemps est remplacé par un bot (sa place est conservée par le bot)
  function nettoyer(s0, maintenant) {
    var s = copie(s0), ch = false;
    s.places.forEach(function (x, p) { if (x.type === "joueur" && maintenant - (x.vu || 0) > 30 * 60 * 1000) { s.places[p] = bot(s.graine, 100 + p + s.election * 21); delete s.votes[x.uid]; ch = true; } });
    return ch ? s : s0;
  }

  // ---------- Attaques : on attaque son rival (au-dessus) ou son opposant (au-dessous) ----------
  // Chaque attaque retire des points au sondage de la cible jusqu'à la prochaine élection (malus, 15 au plus).
  // Un service de communication (bouclier) arrête la prochaine attaque reçue. Les bots attaquent aussi.
  var ATTAQUES = {
    presse: { nom: "Campagne de presse", ico: "📰", cout: 30, pts: 2, cd: 60000, txt: "Des tribunes et des unes peu flatteuses : −2 points à son sondage." },
    manif: { nom: "Manifestation organisée", ico: "📣", cout: 50, pts: 3, cd: 90000, txt: "Des pancartes devant sa mairie : −3 points." },
    scandale: { nom: "Dossier compromettant", ico: "🕵️", cout: 80, pts: 5, risque: 0.35, retour: 3, cd: 150000, txt: "−5 points… mais une fois sur trois, l’affaire se retourne contre toi (−3)." },
    debat: { nom: "Débat télévisé", ico: "🎤", cout: 0, pts: 3, duel: true, cd: 180000, txt: "Gratuit : le mieux placé dans les sondages fait perdre 3 points à l’autre." }
  };
  var BOUCLIER = { nom: "Service de communication", ico: "🛡️", cout: 40, cd: 120000, txt: "Arrête la prochaine attaque reçue (jusqu’à l’élection)." };
  var MALUS_MAX = 15;
  function cle(x) { return x.type === "joueur" ? x.uid : x.id; }
  function qui(s, p) { var x = s.places[p]; return { nom: x.nom, ico: x.ico, court: court(p), uid: x.uid || null, bot: x.type === "bot" }; }
  function malusDe(s, p) { return ((s.malus || {})[cle(s.places[p])]) || 0; }
  function attente(s, k, maintenant) { return Math.max(0, ((s.cd || {})[k] || 0) - maintenant); }
  function noter(s, e) { s.journal = (s.journal || []).concat([e]).slice(-30); }
  // Applique une attaque de la place a vers la place c (alea entre 0 et 1, donné par l'appelant)
  function frapper(s, a, c, type, maintenant, alea) {
    var A = ATTAQUES[type], kc = cle(s.places[c]), ka = cle(s.places[a]), e = { q: maintenant, type: type, de: qui(s, a), vers: qui(s, c), res: "ok", pts: A.pts };
    s.malus = s.malus || {}; s.boucliers = s.boucliers || {};
    if (s.boucliers[kc]) { delete s.boucliers[kc]; e.res = "bloque"; e.pts = 0; }
    else if (A.duel) {
      var sc = scores(s, maintenant);
      if (sc[a] >= sc[c]) s.malus[kc] = Math.min(MALUS_MAX, (s.malus[kc] || 0) + A.pts);
      else { s.malus[ka] = Math.min(MALUS_MAX, (s.malus[ka] || 0) + A.pts); e.res = "perdu"; }
    } else if (A.risque && alea < A.risque) { s.malus[ka] = Math.min(MALUS_MAX, (s.malus[ka] || 0) + A.retour); e.res = "rate"; e.pts = A.retour; }
    else s.malus[kc] = Math.min(MALUS_MAX, (s.malus[kc] || 0) + A.pts);
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
  // Une vente s'ouvre toutes les 2 minutes et dure 6 minutes : il y en a toujours 3 en même temps.
  // cat = { ids: [...], cout: { id: prix moyen } } : les bâtiments de prestige (fournis par le moteur).
  // Chaque vente a un bot enchérisseur (une place de la session) avec un prix maximum secret ; les offres des joueurs sont gardées dans la session.
  var VENTE_P = 2 * 60000, VENTE_D = 6 * 60000;
  function pasDe(cout) { return Math.max(5, Math.round(cout * 0.05 / 5) * 5); }
  function idVente(s, cat, k) {
    var n = cat.ids.length, i = Math.floor(hache(s.graine, 5000, k) * n), pris = {};
    for (var j = 1; j <= 2; j++) if (k - j >= 0) pris[cat.ids[Math.floor(hache(s.graine, 5000, k - j) * n)]] = 1;
    while (pris[cat.ids[i]]) i = (i + 1) % n;
    return cat.ids[i];
  }
  function vente(s, cat, k, maintenant) {
    if (k < 0) return null;
    var id = idVente(s, cat, k), cout = cat.cout[id], debut = s.debut + k * VENTE_P, fin = debut + VENTE_D, pas = pasDe(cout);
    var depart = Math.round(cout * 0.5 / 5) * 5;
    // Le bot enchérisseur : une place tenue par un bot, et son prix maximum (parfois sous le prix moyen : bonne affaire possible)
    var b = Math.floor(hache(s.graine, 5001, k) * NB), tours = 0;
    while (s.places[b].type !== "bot" && tours++ < NB) b = (b + 1) % NB;
    var botMax = Math.round(cout * (0.6 + hache(s.graine, 5002, k) * 0.65) / 5) * 5;
    // Sa courbe : il monte peu à peu jusqu'à un plafond, avant la dernière minute
    var plafond = Math.min(botMax, Math.round(cout * (0.55 + hache(s.graine, 5003, k) * 0.35) / 5) * 5);
    var avance = Math.max(0, Math.min(1, (Math.min(maintenant, fin) - debut) / (VENTE_D - 60000)));
    var courbe = Math.max(depart, Math.floor((depart + (plafond - depart) * avance) / pas) * pas);
    var offres = ((s.ventes || {})[k] || []), h = offres.length ? offres[offres.length - 1] : null, H = h ? h.m : 0;
    var B = courbe;
    if (H) B = botMax >= H + pas ? Math.min(botMax, Math.max(courbe, H + pas)) : Math.min(courbe, H - pas);
    var botTete = !H || B > H;
    var meneur = botTete ? { nom: s.places[b].nom, ico: s.places[b].ico, court: court(b), bot: true, uid: null } : { nom: h.nom, ico: h.ico, court: h.court, bot: false, uid: h.uid };
    return { k: k, id: id, cout: cout, debut: debut, fin: fin, pas: pas, prix: botTete ? B : H, meneur: meneur, fini: maintenant >= fin, nb: offres.length + 1,
      affaire: (botTete ? B : H) <= cout * 0.7 && fin - maintenant <= VENTE_D / 2,   // sous-évaluée : encore loin de sa valeur à mi-vente bientot: fin - maintenant <= 60000 && maintenant < fin };
  }
  function ventesEnCours(s, cat, maintenant) {
    var k = Math.floor((maintenant - s.debut) / VENTE_P), l = [];
    for (var j = k - 2; j <= k; j++) { var v = vente(s, cat, j, maintenant); if (v && !v.fini) l.push(v); }
    return l;
  }
  function venteSuivante(s, maintenant) { var k = Math.floor((maintenant - s.debut) / VENTE_P) + 1; return s.debut + k * VENTE_P; }
  // Ventes terminées récemment (pour que le gagnant récupère son bâtiment)
  function ventesFinies(s, cat, maintenant) {
    var k = Math.floor((maintenant - s.debut) / VENTE_P), l = [];
    for (var j = k - 8; j <= k - 3; j++) { var v = vente(s, cat, j, maintenant); if (v && v.fini) l.push(v); }
    return l;
  }
  function encherir(s0, uid, cat, k, montant, maintenant) {
    var p = placeDe(s0, uid), v = vente(s0, cat, k, maintenant);
    if (p < 0 || !v || v.fini || maintenant < v.debut || montant < v.prix + v.pas || (!v.meneur.bot && v.meneur.uid === uid)) return s0;
    var s = copie(s0); s.ventes = s.ventes || {};
    var kmin = Math.floor((maintenant - s.debut) / VENTE_P) - 10;
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
      if (x.type === "bot") return scoreBot(s, x, p);
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
    // Ce que chaque joueur doit savoir : d'où il part, où il arrive, contre qui il a gagné ou perdu
    s.resultats = [];
    avant.forEach(function (x, pAvant) {
      if (x.type !== "joueur") return;
      var pApres = placeDe(s, x.uid), d = duels.filter(function (y) { return y.bas === pAvant || y.haut === pAvant; });
      s.resultats.push({ uid: x.uid, avant: pAvant, apres: pApres, duel: d.length ? d[0] : null });
    });
    s.election++; s.prochaine = maintenant + MANDAT_MS; s.votes = {}; s.derniere = maintenant; s.malus = {}; s.boucliers = {};
    return s;
  }
  function resultatDe(s, uid) { return (s.resultats || []).filter(function (r) { return r.uid === uid; })[0] || null; }

  // Fiche d'une place (joueur ou bot), pour le classement et la comparaison
  function fiche(s, p) {
    var x = s.places[p], st = x.type === "bot" ? statsBot(s, x, p) : (x.stats || { score: x.score || 45 });
    return { p: p, titre: titre(p), court: court(p), arr: arr(p), type: x.type, nom: x.nom, ico: x.ico, uid: x.uid || null, stats: st, puissance: puissance(p), hab: st.hab || habitants(p) };
  }

  var API = { NB: NB, TRONE: TRONE, MANDAT_MS: MANDAT_MS, ARR: ARR, ORDRE: ORDRE, arr: arr, nomArr: nomArr, titre: titre, court: court, puissance: puissance, habitants: habitants,
    nouvelleSession: nouvelleSession, rejoindre: rejoindre, attaquer: attaquer, proteger: proteger, ripostes: ripostes, ATTAQUES: ATTAQUES, BOUCLIER: BOUCLIER, malusDe: malusDe, attente: attente,
    ventesEnCours: ventesEnCours, ventesFinies: ventesFinies, venteSuivante: venteSuivante, vente: vente, encherir: encherir, VENTE_P: VENTE_P, VENTE_D: VENTE_D, pleine: pleine, signaler: signaler, nettoyer: nettoyer, voter: voter, votesRequis: votesRequis, nbVotes: nbVotes,
    electionDue: electionDue, scores: scores, elire: elire, resultatDe: resultatDe, placeDe: placeDe, joueurs: joueurs, fiche: fiche, statsBot: statsBot, scoreBot: scoreBot };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MaireSession = API;
})(this);
