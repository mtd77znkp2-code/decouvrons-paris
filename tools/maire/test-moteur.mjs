// Tests du moteur Maire de Paris + simulation d'équilibrage sur de nombreuses parties.
// Usage : node tools/maire/test-moteur.mjs [nombre de parties par stratégie, défaut 400]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const M = require("../../public/maire/moteur.js");
const G = require("../../public/maire/progression.js");
const DATA = new URL("../../public/maire/data/", import.meta.url);
const idx = JSON.parse(readFileSync(new URL("index.json", DATA)));
const tous = idx.lots.flatMap(l => JSON.parse(readFileSync(new URL(l.f, DATA)))).concat(JSON.parse(readFileSync(new URL(idx.speciaux.f, DATA))));
const NSP = idx.speciaux.catastrophe + idx.speciaux.chance;
const base = M.indexer(tous);
const N = process.argv[2] != null ? +process.argv[2] : 400;

let ok = 0;
function test(nom, f) { f(); ok++; console.log("  ✓ " + nom); }
console.log("Tests du moteur");

test("la base publiée est entièrement valide et le compteur est exact", () => {
  assert.equal(base.rejets.length, 0, JSON.stringify(base.rejets.slice(0, 3)));
  assert.equal(base.liste.length, idx.total + NSP);
  assert.equal(new Set(base.liste.map(e => e.id)).size, idx.total + NSP);
  assert.ok(idx.speciaux.catastrophe >= 30 && idx.speciaux.chance >= 30);
});

test("un événement invalide est rejeté", () => {
  const ev = JSON.parse(JSON.stringify(base.liste[0]));
  ev.choix.pop();
  assert.ok(M.valider(ev).length > 0);
  const ev2 = JSON.parse(JSON.stringify(base.liste[0]));
  ev2.choix[0].e = {};
  assert.ok(M.valider(ev2).length > 0);
  const r = M.indexer([ev, base.liste[1]]);
  assert.equal(r.liste.length, 1);
});

test("création : ligne connue et exactement deux ambitions", () => {
  assert.throws(() => M.nouvellePartie({ ligne: "x", ambitions: ["logement", "securite"] }));
  assert.throws(() => M.nouvellePartie({ ligne: "gauche", ambitions: ["logement"] }));
  assert.throws(() => M.nouvellePartie({ ligne: "gauche", ambitions: ["logement", "logement"] }));
  const st = M.nouvellePartie({ ligne: "gauche", ambitions: ["logement", "securite"], graine: 1 });
  assert.equal(st.tresor, 1000); assert.equal(st.tour, 0);
});

test("pas de double application (rechargement, double clic)", () => {
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["transports", "economie"], graine: 7 });
  st = M.debutTour(st, base);
  const copie = JSON.parse(JSON.stringify(st));
  assert.deepEqual(M.debutTour(copie, base), copie);          // début de tour rejoué : aucun effet
  const apres = M.choisir(st, base, 0);
  assert.deepEqual(M.choisir(apres, base, 1), apres);         // second clic : aucun effet
  const recharge = JSON.parse(JSON.stringify(apres));          // sauvegarde puis reprise
  assert.deepEqual(M.choisir(recharge, base, 0), recharge);
  assert.equal(st.phase, "evenement"); assert.equal(apres.phase, "resultat");
});

test("parties reproductibles avec la même graine, et sauvegarde JSON fidèle", () => {
  const jouer = (sauver) => {
    let st = M.nouvellePartie({ ligne: "ecologie", ambitions: ["ecologie", "transports"], graine: 42 });
    for (let t = 0; t < 30 && st.phase !== "fin"; t++) {
      st = M.debutTour(st, base); if (st.phase === "fin") break;
      if (sauver) st = JSON.parse(JSON.stringify(st));
      st = M.choisir(st, base, t % 3);
    }
    return st;
  };
  assert.deepEqual(jouer(false), jouer(true));
});

test("journal des finances cohérent avec la trésorerie", () => {
  let st = M.nouvellePartie({ ligne: "droite", ambitions: ["securite", "proprete"], graine: 3 });
  st = M.debutTour(st, base);
  const t0 = st.tresor, d0 = st.dette, n0 = st.journal.length;
  st = M.choisir(st, base, 0);
  const somme = st.journal.slice(n0).reduce((s, j) => s + (j.l.startsWith("Emprunt") || j.l.startsWith("Remboursement") ? 0 : j.m), 0);
  assert.ok(Math.abs(st.tresor - st.dette - (t0 - d0 + somme)) < 0.5);
});

test("aucun événement deux fois dans une partie, suites respectées", () => {
  let st = M.nouvellePartie({ ligne: "gauche", ambitions: ["logement", "services"], graine: 11 });
  const vus = new Set();
  while (st.phase !== "fin") {
    st = M.debutTour(st, base); if (st.phase === "fin") break;
    if (st.evPerso) { st = M.choisir(st, base, 0); continue; }
    assert.ok(!vus.has(st.evenement), "doublon " + st.evenement); vus.add(st.evenement);
    st = M.choisir(st, base, 0);
  }
});

test("3 catastrophes par partie, un coup de chance une fois sur deux, jamais hors pop-up", () => {
  let chances = 0;
  for (let g = 0; g < 200; g++) {
    let st = M.nouvellePartie({ ligne: "centre", ambitions: ["logement", "transports"], graine: g + 1 });
    const vu = { catastrophe: 0, chance: 0 };
    while (st.phase !== "fin") {
      st = M.debutTour(st, base); if (st.phase === "fin") break;
      const ev = M.evenementCourant(st, base);
      if (M.SPECIAUX[ev.cat]) { assert.equal(st.special, ev.cat); vu[ev.cat]++; }
      else if (ev.cat === "opposition") assert.equal(st.special, "opposition");
      else assert.equal(st.special, null);
      st = M.choisir(st, base, 1);
    }
    const prevues = st.speciaux.filter(s => s.tour <= st.tour);
    assert.equal(vu.catastrophe, prevues.filter(s => s.type === "catastrophe").length);
    if (st.fin.gagne) assert.equal(vu.catastrophe, 3);
    if (st.speciaux.some(s => s.type === "chance")) chances++;
  }
  assert.ok(chances > 70 && chances < 130, "coups de chance : " + chances + "/200");
});

test("niveaux : catastrophes prévues, trésorerie de départ, anciennes sauvegardes au niveau moyen", () => {
  for (const [n, nb] of [["facile", 2], ["moyen", 3], ["difficile", 4]]) {
    const st = M.nouvellePartie({ ligne: "centre", ambitions: ["logement", "transports"], graine: 5, niveau: n });
    assert.equal(st.niveau, n); assert.equal(st.tresor, M.NIVEAUX[n].tresor);
    const c = st.speciaux.filter(s => s.type === "catastrophe").map(s => s.tour);
    assert.equal(c.length, nb); assert.ok(c.every(t => t >= 8 && t < 100));
  }
  const ancien = M.nouvellePartie({ ligne: "centre", ambitions: ["logement", "transports"], graine: 5 });
  delete ancien.niveau; assert.equal(M.seuil(ancien), 30);
});

test("opposant : une attaque toutes les 10 semaines tant qu'il est actif, élection à la fin, analyse des défaites", () => {
  for (let g = 1; g <= 40; g++) {
    let st = M.nouvellePartie({ ligne: "gauche", ambitions: ["logement", "services"], graine: g, niveau: ["facile", "moyen", "difficile"][g % 3] });
    const f0 = M.opposant(st).force; assert.ok(f0 >= 25 && f0 <= 90);
    while (st.phase !== "fin") {
      const actif = st.opposant.actif;
      st = M.debutTour(st, base); if (st.phase === "fin") break;
      assert.equal(!!st.evPerso, actif && st.tour % 10 === 0 && st.tour < M.TOURS, "semaine " + st.tour);
      if (st.evPerso) { assert.equal(st.evPerso.choix.length, 4); const avant = JSON.parse(JSON.stringify(st)); st = M.choisir(st, base, g % 4); assert.deepEqual(M.choisir(st, base, 0), st); assert.notDeepEqual(avant, st); }
      else st = M.choisir(st, base, g % 3);
    }
    if (st.fin.gagne) { assert.ok(st.election && st.election.pct >= 15 && st.election.pct <= 85); if (!st.election.reelu) assert.ok(M.analyse(st).phrase); }
    else { const a = M.analyse(st); assert.ok(a.phrase.length > 20 && a.conseil.length > 20); }
  }
});

test("progression : 100 succès, 400 quêtes vérifiables, défi du jour identique pour tous", () => {
  assert.equal(G.SUCCES.length, 100); assert.equal(new Set(G.SUCCES.map(x => x.id)).size, 100);
  const Q = JSON.parse(readFileSync(new URL("quetes.json", DATA)));
  assert.equal(Q.length, 400); assert.equal(new Set(Q.map(q => q.id)).size, 400); assert.equal(new Set(Q.map(q => q.t)).size, 400);
  for (const q of Q) { assert.ok(G.TYPES_QUETES.includes(q.k), q.id + " : type " + q.k); assert.ok(q.xp >= 10 && q.xp <= 300, q.id + " : xp"); }
  const j = 20000, a = G.quetesDuJour(j, Q), b = G.quetesDuJour(j + 1, Q);
  assert.equal(a.length, 3); assert.equal(new Set(a.map(q => q.id)).size, 3); assert.notDeepEqual(a, b);
  assert.deepEqual(G.defiDuJour(j, M, idx.lots, 550), G.defiDuJour(j, M, idx.lots, 550));
  // Chaque quête et chaque succès s'évaluent sans erreur sur de vraies fins de partie, et certains sont atteignables
  const faites = new Set(), succes = new Set();
  for (let g = 1; g <= 30; g++) {
    let st = M.nouvellePartie({ ligne: ["gauche", "centre", "droite", "ecologie"][g % 4], ambitions: ["logement", "transports"], graine: g, niveau: ["facile", "moyen", "difficile"][g % 3] });
    while (st.phase !== "fin") { st = M.debutTour(st, base); if (st.phase === "fin") break; st = M.choisir(st, base, g % 3); }
    const R = G.resume(st, M), P = G.profilVide(); P.parties = 1;
    for (const q of Q) if (G.queteFaite(q, R)) faites.add(q.id);
    for (const x of G.SUCCES) if (x.f(R, P)) succes.add(x.id);
  }
  assert.ok(faites.size >= 40, "quêtes atteintes : " + faites.size); assert.ok(succes.size >= 5, "succès atteints : " + succes.size);
  assert.equal(G.niveau(0).n, 1); assert.ok(G.niveau(G.xpPour(10)).n === 10);
});

console.log(ok + " tests réussis.\n");

// ---------- Simulation d'équilibrage ----------
const LIGNES = Object.keys(M.LIGNES), DOMS = Object.keys(M.DOMAINES);
const code = { gauche: "g", centre: "c", droite: "d", ecologie: "e" };
// Estimation de la valeur d'un choix pour un joueur réfléchi (sans connaître l'aléa)
function valeur(st, c, prudence) {
  const e = c.e, a = (c.ali && c.ali[code[st.ligne]]) || 0;
  let v = (e.pop || 0) * (st.pop < 45 ? 2 : 1.2) + (e.bon || 0) * (st.bon < 45 ? 2 : 1.2) + a * 0.9;
  for (const k in e.dom || {}) v += e.dom[k] * (st.ambitions.includes(k) ? 0.9 : 0.35);
  const cout = (e.bud || 0) + (e.rec ? e.rec.m * e.rec.n : 0);
  const serre = st.dette > 600 || st.tresor < 200;
  v += cout / (serre ? 8 : 25) * prudence;
  if (c.alea) v += ((c.alea.e.pop || 0) + (c.alea.e.bon || 0)) * c.alea.p / 100;
  for (const x of c.dif || []) v += ((x.e.pop || 0) + (x.e.bon || 0)) * 0.6;
  return v;
}
// Hasard reproductible : mêmes parties à chaque exécution, donc pas de résultat qui change d’un lancement à l’autre
let graineSim = 1;
const alea = () => { graineSim = (graineSim + 0x6d2b79f5) | 0; let t = Math.imul(graineSim ^ (graineSim >>> 15), 1 | graineSim); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const STRATS = {
  "hasard": (st, ev) => Math.floor(alea() * 3),
  "réfléchi": (st, ev) => ev.choix.map((c, i) => [valeur(st, c, 1), i]).sort((a, b) => b[0] - a[0])[0][1],
  "dépensier": (st, ev) => ev.choix.map((c, i) => [valeur(st, c, 0), i]).sort((a, b) => b[0] - a[0])[0][1],
  "populiste": (st, ev) => ev.choix.map((c, i) => [(c.e.pop || 0) + (c.e.bon || 0), i]).sort((a, b) => b[0] - a[0])[0][1],
};
// Chaque niveau est simulé avec les mêmes parties
function simuler(niveau) {
  console.log(`Simulation niveau ${M.NIVEAUX[niveau].nom} : ${N} parties par stratégie (${idx.total} événements)`);
  const taux = {};
  for (const [nom, f] of Object.entries(STRATS)) {
    const fins = {}; let gagne = 0, tours = 0, amb = 0, score = 0, cats = {}, reelu = 0, elim = 0;
    graineSim = 1;
    for (let p = 0; p < N; p++) {
      const ligne = LIGNES[p % 4], a = DOMS.slice().sort(() => alea() - 0.5).slice(0, 2);
      let st = M.nouvellePartie({ ligne, ambitions: a, graine: p * 7919 + 1, niveau });
      while (st.phase !== "fin") {
        st = M.debutTour(st, base); if (st.phase === "fin") break;
        const ev = M.evenementCourant(st, base); cats[ev.cat] = (cats[ev.cat] || 0) + 1;
        st = M.choisir(st, base, f(st, ev));
      }
      const b = M.bilan(st);
      if (st.fin.gagne) { gagne++; amb += b.ambitions.filter(x => x.ok).length; if (st.election.reelu) reelu++; }
      if (!st.opposant.actif) elim++;
      if (!st.fin.gagne) fins[st.fin.raison.type] = (fins[st.fin.raison.type] || 0) + 1;
      tours += st.tour; score += b.score;
    }
    taux[nom] = { gagne: gagne / N, faillite: (fins.faillite || 0) / N, amb: gagne ? amb / gagne : 0, reelu: gagne ? reelu / gagne : 0 };
    const pct = x => Math.round(x / N * 100) + " %";
    console.log(`  ${nom.padEnd(10)} victoires ${pct(gagne).padStart(5)} · tours moyens ${(tours / N).toFixed(0).padStart(3)} · ` +
      `ambitions tenues ${(gagne ? amb / gagne : 0).toFixed(1)}/2 · réélus ${gagne ? Math.round(reelu / gagne * 100) : 0} % · opposant éliminé ${pct(elim)} · score ${Math.round(score / N)} · défaites ${JSON.stringify(fins)}`);
    if (nom === "réfléchi" && niveau === "moyen") console.log("    catégories tirées : " + Object.entries(cats).map(([k, v]) => k + " " + Math.round(v / N)).join(", "));
  }
  return taux;
}
if (!N) { console.log("Simulation d’équilibrage ignorée (0 partie demandée)."); process.exit(0); }
const T = { facile: simuler("facile"), moyen: simuler("moyen"), difficile: simuler("difficile") };

// Bornes d'équilibrage : jouer au hasard doit souvent perdre, réfléchir doit payer, l'argent doit compter,
// et chaque niveau doit être nettement plus dur que le précédent
const bornes = [
  ["facile : jouer au hasard gagne entre 40 % et 85 % des parties", T.facile["hasard"].gagne >= 0.4 && T.facile["hasard"].gagne <= 0.85],
  ["facile : un joueur réfléchi gagne au moins 95 % des parties", T.facile["réfléchi"].gagne >= 0.95],
  ["moyen : jouer au hasard gagne entre 15 % et 65 % des parties", T.moyen["hasard"].gagne >= 0.15 && T.moyen["hasard"].gagne <= 0.65],
  ["moyen : un joueur réfléchi gagne au moins 80 % des parties", T.moyen["réfléchi"].gagne >= 0.8],
  ["moyen : ignorer le budget mène parfois à la faillite (≥ 5 %)", T.moyen["dépensier"].faillite >= 0.05],
  ["moyen : un joueur réfléchi tient en moyenne au moins 0,8 ambition sur 2", T.moyen["réfléchi"].amb >= 0.8],
  ["moyen : un joueur réfléchi qui finit son mandat est réélu entre 40 % et 90 % du temps", T.moyen["réfléchi"].reelu >= 0.4 && T.moyen["réfléchi"].reelu <= 0.9],
  ["moyen : jouer au hasard mène rarement à la réélection (< 30 % des mandats finis)", T.moyen["hasard"].reelu < 0.3],
  ["réaliste : jouer au hasard gagne moins de 10 % des parties", T.difficile["hasard"].gagne < 0.1],
  ["réaliste : un joueur réfléchi gagne entre 50 % et 90 % des parties", T.difficile["réfléchi"].gagne >= 0.5 && T.difficile["réfléchi"].gagne <= 0.9],
  ["réaliste : ignorer le budget mène souvent à la faillite (≥ 20 %)", T.difficile["dépensier"].faillite >= 0.2],
];
let echec = 0;
for (const [t, v] of bornes) { console.log((v ? "  ✓ " : "  ✗ ") + t); if (!v) echec++; }
if (echec) process.exit(1);
