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

  // ---------- Attaques : on attaque automatiquement son rival (la place au-dessus) ----------
  // Rival bot : il perd 2 points de score (jusqu'à 8) jusqu'à la prochaine élection. Rival humain : son jeu lui présente l'attaque (son opposant, c'est nous).
  function attaquer(s0, uid) {
    var p = placeDe(s0, uid); if (p < 0 || p >= TRONE) return s0;
    var r = s0.places[p + 1]; if (r.type !== "bot") return s0;
    var s = copie(s0); s.malus = s.malus || {}; s.malus[r.id] = Math.min(8, (s.malus[r.id] || 0) + 2); return s;
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
      return (x.score || 40) - (maintenant - (x.vu || 0) > ABSENT_MS ? 10 : 0);
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
    s.election++; s.prochaine = maintenant + MANDAT_MS; s.votes = {}; s.derniere = maintenant; s.malus = {};
    return s;
  }
  function resultatDe(s, uid) { return (s.resultats || []).filter(function (r) { return r.uid === uid; })[0] || null; }

  // Fiche d'une place (joueur ou bot), pour le classement et la comparaison
  function fiche(s, p) {
    var x = s.places[p], st = x.type === "bot" ? statsBot(s, x, p) : (x.stats || { score: x.score || 45 });
    return { p: p, titre: titre(p), court: court(p), arr: arr(p), type: x.type, nom: x.nom, ico: x.ico, uid: x.uid || null, stats: st, puissance: puissance(p), hab: st.hab || habitants(p) };
  }

  var API = { NB: NB, TRONE: TRONE, MANDAT_MS: MANDAT_MS, ARR: ARR, ORDRE: ORDRE, arr: arr, nomArr: nomArr, titre: titre, court: court, puissance: puissance, habitants: habitants,
    nouvelleSession: nouvelleSession, rejoindre: rejoindre, attaquer: attaquer, pleine: pleine, signaler: signaler, nettoyer: nettoyer, voter: voter, votesRequis: votesRequis, nbVotes: nbVotes,
    electionDue: electionDue, scores: scores, elire: elire, resultatDe: resultatDe, placeDe: placeDe, joueurs: joueurs, fiche: fiche, statsBot: statsBot, scoreBot: scoreBot };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MaireSession = API;
})(this);
