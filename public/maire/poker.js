// Poker du maire : Texas Hold'em à deux (heads-up), 100 jetons chacun, petite blinde 10, grosse blinde 20.
// Module pur et déterministe (son propre générateur aléatoire) : utilisé contre le bot dans le moteur, et pour les tables entre joueurs.
// Une table = un objet JSON ; chaque fonction renvoie une nouvelle table sans modifier l'ancienne.
(function (root) {
  "use strict";
  var PILE = 100, PB = 10, GB = 20;

  function copie(o) { return JSON.parse(JSON.stringify(o)); }
  // Générateur mulberry32 : la graine est gardée dans la table, donc une partie rechargée continue à l'identique
  function alea(t) { var a = (t.rng = (t.rng + 0x6D2B79F5) | 0); a = Math.imul(a ^ (a >>> 15), a | 1); a ^= a + Math.imul(a ^ (a >>> 7), a | 61); return ((a ^ (a >>> 14)) >>> 0) / 4294967296; }

  // ---------- Évaluation des mains ----------
  // Une carte = 0..51 ; hauteur = c % 13 (0 = 2 … 12 = As), couleur = floor(c / 13)
  function h(c) { return c % 13; }
  // Score d'une main de 5 cartes : catégorie × 15^5 + départage
  function score5(m) {
    var v = m.map(h).sort(function (a, b) { return b - a; }), coul = m.every(function (c) { return Math.floor(c / 13) === Math.floor(m[0] / 13); });
    var n = {}; v.forEach(function (x) { n[x] = (n[x] || 0) + 1; });
    var g = Object.keys(n).map(Number).sort(function (a, b) { return n[b] - n[a] || b - a; });
    var uniq = g.length === 5, haut = v[0], suite = uniq && v[0] - v[4] === 4;
    if (uniq && v[0] === 12 && v[1] === 3) { suite = true; haut = 3; }   // suite blanche A-2-3-4-5
    function k(cat, l) { var s = cat; for (var i = 0; i < 5; i++) s = s * 15 + (l[i] != null ? l[i] + 1 : 0); return s; }
    if (suite && coul) return k(8, [haut]);
    if (n[g[0]] === 4) return k(7, [g[0], g[1]]);
    if (n[g[0]] === 3 && n[g[1]] === 2) return k(6, [g[0], g[1]]);
    if (coul) return k(5, v);
    if (suite) return k(4, [haut]);
    if (n[g[0]] === 3) return k(3, g);
    if (n[g[0]] === 2 && n[g[1]] === 2) return k(2, g);
    if (n[g[0]] === 2) return k(1, g);
    return k(0, v);
  }
  // Meilleure main de 5 parmi 5 à 7 cartes
  function score(cartes) {
    var best = -1, l = cartes, nb = l.length;
    for (var a = 0; a < nb; a++) for (var b = a + 1; b < nb; b++) {
      if (nb - 2 < 5) { best = Math.max(best, score5(l)); continue; }
      var m = []; for (var i = 0; i < nb; i++) if (i !== a && i !== b) m.push(l[i]);
      if (m.length === 5) best = Math.max(best, score5(m));
      else for (var c = 0; c < m.length; c++) { var m2 = m.slice(0, c).concat(m.slice(c + 1)); best = Math.max(best, score5(m2)); }
    }
    return best;
  }
  var NOMS = ["Hauteur", "Paire", "Double paire", "Brelan", "Suite", "Couleur", "Full", "Carré", "Quinte flush"];
  function nomMain(cartes) { return NOMS[Math.floor(score(cartes) / Math.pow(15, 5))]; }

  // ---------- Table ----------
  function nouvelleTable(graine) {
    var t = { rng: graine | 0, piles: [PILE, PILE], bouton: 1, mains: 0, main: null, fini: false, gagnant: null, log: [] };
    return donner(t);
  }
  // Nouvelle main : le bouton change de joueur ; le bouton est petite blinde et parle en premier avant le flop
  function donner(t0) {
    if (t0.fini || (t0.main && !t0.main.fini)) return t0;
    var t = copie(t0), d = [];
    for (var i = 0; i < 52; i++) d.push(i);
    for (var j = 51; j > 0; j--) { var k = Math.floor(alea(t) * (j + 1)), x = d[j]; d[j] = d[k]; d[k] = x; }
    t.bouton = 1 - t.bouton; t.mains++;
    var b = t.bouton, gb = 1 - b;
    t.main = { deck: d, cartes: [[d.pop(), d.pop()], [d.pop(), d.pop()]], board: [], mises: [0, 0], contrib: [0, 0], pot: 0, tour: "preflop",
      aParle: [false, false], derniereRelance: GB, aQui: b, fini: false, res: null, actions: [] };
    miser(t, b, Math.min(PB, t.piles[b])); miser(t, gb, Math.min(GB, t.piles[gb]));
    t.log = [];
    if (t.piles[b] === 0 && t.piles[gb] === 0) finTour(t);
    return t;
  }
  function miser(t, s, n) { var m = t.main; n = Math.min(n, t.piles[s]); t.piles[s] -= n; m.mises[s] += n; m.contrib[s] += n; }
  function aSuivre(t, s) { var m = t.main; return Math.max(m.mises[0], m.mises[1]) - m.mises[s]; }
  // Ce que le joueur peut faire : se coucher, parler/suivre, relancer (montant total minimum et maximum), tapis
  function options(t, s) {
    var m = t.main; if (!m || m.fini || m.aQui !== s) return null;
    var as = aSuivre(t, s), max = m.mises[s] + t.piles[s], haut = Math.max(m.mises[0], m.mises[1]);
    var min = Math.min(max, haut + Math.max(GB, m.derniereRelance));
    var autreTapis = t.piles[1 - s] === 0;
    return { suivre: Math.min(as, t.piles[s]), coucher: as > 0, relancerMin: autreTapis || max <= haut ? null : min, relancerMax: autreTapis || max <= haut ? null : max };
  }
  function agir(t0, s, action, montant) {
    var o = options(t0, s); if (!o) return t0;
    var t = copie(t0), m = t.main, txt;
    if (action === "coucher") {
      if (!o.coucher) action = "suivre";
      else { m.fini = true; var g = 1 - s; distribuer(t, g === 0 ? [1, 0] : [0, 1]); m.res = { couche: s, gagnant: g }; m.actions.push({ s: s, a: "coucher" }); return finMain(t); }
    }
    if (action === "suivre") { var n = o.suivre; miser(t, s, n); txt = n ? "suivre" : "parler"; m.actions.push({ s: s, a: txt, n: n }); }
    else if (action === "relancer" || action === "tapis") {
      if (o.relancerMin == null) return agir(t0, s, "suivre");
      var cible = action === "tapis" ? o.relancerMax : Math.max(o.relancerMin, Math.min(o.relancerMax, Math.round(montant || 0)));
      var haut = Math.max(m.mises[0], m.mises[1]);
      m.derniereRelance = Math.max(m.derniereRelance, cible - haut);
      miser(t, s, cible - m.mises[s]);
      m.aParle = [false, false];
      m.actions.push({ s: s, a: t.piles[s] === 0 ? "tapis" : "relancer", n: m.mises[s] });
    } else return t0;
    m.aParle[s] = true;
    // Tour d'enchères terminé ? L'adversaire doit répondre s'il lui reste quelque chose à payer et des jetons pour le faire,
    // ou s'il n'a pas encore parlé alors que personne n'est à tapis (ex. : la grosse blinde après un simple « suivre »).
    var o2 = 1 - s, doit = aSuivre(t, o2);
    if (doit > 0 && t.piles[o2] > 0) { m.aQui = o2; return t; }
    if (doit === 0 && !m.aParle[o2] && t.piles[o2] > 0 && t.piles[s] > 0) { m.aQui = o2; return t; }
    return finTour(t);
  }
  // Fin d'un tour d'enchères : cartes suivantes, ou abattage
  function finTour(t) {
    var m = t.main;
    m.pot += m.mises[0] + m.mises[1]; m.mises = [0, 0]; m.aParle = [false, false]; m.derniereRelance = GB;
    var tapis = t.piles[0] === 0 || t.piles[1] === 0;
    do {
      if (m.tour === "preflop") { m.board.push(m.deck.pop(), m.deck.pop(), m.deck.pop()); m.tour = "flop"; }
      else if (m.tour === "flop") { m.board.push(m.deck.pop()); m.tour = "turn"; }
      else if (m.tour === "turn") { m.board.push(m.deck.pop()); m.tour = "river"; }
      else { m.tour = "abattage"; return abattage(t); }
    } while (tapis);
    m.aQui = 1 - t.bouton;   // après le flop, la grosse blinde parle en premier
    return t;
  }
  function abattage(t) {
    var m = t.main, s0 = score(m.cartes[0].concat(m.board)), s1 = score(m.cartes[1].concat(m.board));
    m.fini = true; m.res = { abattage: true, scores: [s0, s1], gagnant: s0 > s1 ? 0 : s1 > s0 ? 1 : -1, noms: [nomMain(m.cartes[0].concat(m.board)), nomMain(m.cartes[1].concat(m.board))] };
    distribuer(t, s0 > s1 ? [1, 0] : s1 > s0 ? [0, 1] : [0.5, 0.5]);
    return finMain(t);
  }
  // Répartit les jetons engagés : un tapis plus petit ne peut gagner que ce qu'il a couvert, le surplus revient à son propriétaire
  function distribuer(t, parts) {
    var m = t.main, c = m.contrib, eff = Math.min(c[0], c[1]), pot = eff * 2;
    m.potFinal = c[0] + c[1];
    [0, 1].forEach(function (s) { t.piles[s] += c[s] - eff; });
    var g0 = Math.round(pot * parts[0]); t.piles[0] += g0; t.piles[1] += pot - g0;
    m.gains = [t.piles[0], t.piles[1]];
    m.mises = [0, 0]; m.pot = 0;
  }
  function finMain(t) {
    if (t.piles[0] <= 0 || t.piles[1] <= 0) { t.fini = true; t.gagnant = t.piles[0] > 0 ? 0 : 1; }
    return t;
  }

  // ---------- Bot ----------
  // Chance de gagner estimée par simulation contre une main au hasard
  function equite(t, s, n) {
    var m = t.main, mien = m.cartes[s], vus = mien.concat(m.board), reste = [], gagne = 0;
    for (var c = 0; c < 52; c++) if (vus.indexOf(c) < 0) reste.push(c);
    var o = { rng: (t.rng ^ (m.board.length * 7919 + s * 104729)) | 0 };
    for (var i = 0; i < n; i++) {
      var r = reste.slice();
      for (var j = 0; j < 2 + 5 - m.board.length; j++) { var k = j + Math.floor(alea(o) * (r.length - j)), x = r[j]; r[j] = r[k]; r[k] = x; }
      var adv = [r[0], r[1]], board = m.board.concat(r.slice(2, 2 + 5 - m.board.length));
      var a = score(mien.concat(board)), b = score(adv.concat(board));
      gagne += a > b ? 1 : a === b ? 0.5 : 0;
    }
    return gagne / n;
  }
  // Le bot (siège s) prend sa décision : force de sa main, cote du pot, un peu de bluff
  function botAgir(t0, s) {
    var o = options(t0, s); if (!o) return t0;
    var t = copie(t0), m = t.main, e = equite(t, s, 160), r = alea(t);
    var pot = m.pot + m.mises[0] + m.mises[1], cote = o.suivre / Math.max(1, pot + o.suivre);
    t0 = Object.assign(copie(t0), { rng: t.rng });
    if (o.relancerMin != null && (e > 0.72 || (e > 0.55 && r < 0.35) || r < 0.06)) {
      var cible = e > 0.8 || t.piles[s] <= GB * 2 ? o.relancerMax : Math.min(o.relancerMax, Math.max(o.relancerMin, Math.round((pot * (0.6 + r * 0.6)) / 10) * 10 + Math.max(m.mises[0], m.mises[1])));
      return agir(t0, s, cible >= o.relancerMax ? "tapis" : "relancer", cible);
    }
    if (o.suivre === 0) return agir(t0, s, "suivre");
    if (e >= cote + 0.04 || (o.suivre <= GB / 2 && e > 0.3)) return agir(t0, s, "suivre");
    return agir(t0, s, "coucher");
  }

  var API = { PILE: PILE, PB: PB, GB: GB, nouvelleTable: nouvelleTable, donner: donner, options: options, agir: agir, botAgir: botAgir, score: score, nomMain: nomMain, equite: equite, aSuivre: aSuivre };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Poker = API;
})(this);
