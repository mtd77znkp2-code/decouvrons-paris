// Tests du moteur Maire de Paris + simulation d'équilibrage sur de nombreuses parties.
// Usage : node tools/maire/test-moteur.mjs [nombre de parties par stratégie, défaut 400]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const M = require("../../public/maire/moteur.js");
const DATA = new URL("../../public/maire/data/", import.meta.url);
const idx = JSON.parse(readFileSync(new URL("index.json", DATA)));
const tous = idx.lots.flatMap(l => JSON.parse(readFileSync(new URL(l.f, DATA)))).concat(JSON.parse(readFileSync(new URL(idx.speciaux.f, DATA))));
const NSP = idx.speciaux.catastrophe + idx.speciaux.chance;
const base = M.indexer(tous);
const N = +process.argv[2] || 400;

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
      const ev = base.parId[st.evenement];
      if (M.SPECIAUX[ev.cat]) { assert.equal(st.special, ev.cat); vu[ev.cat]++; } else assert.equal(st.special, null);
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
    const fins = {}; let gagne = 0, tours = 0, amb = 0, score = 0, cats = {};
    graineSim = 1;
    for (let p = 0; p < N; p++) {
      const ligne = LIGNES[p % 4], a = DOMS.slice().sort(() => alea() - 0.5).slice(0, 2);
      let st = M.nouvellePartie({ ligne, ambitions: a, graine: p * 7919 + 1, niveau });
      while (st.phase !== "fin") {
        st = M.debutTour(st, base); if (st.phase === "fin") break;
        const ev = base.parId[st.evenement]; cats[ev.cat] = (cats[ev.cat] || 0) + 1;
        st = M.choisir(st, base, f(st, ev));
      }
      const b = M.bilan(st);
      if (st.fin.gagne) { gagne++; amb += b.ambitions.filter(x => x.ok).length; }
      else fins[st.fin.raison.type] = (fins[st.fin.raison.type] || 0) + 1;
      tours += st.tour; score += b.score;
    }
    taux[nom] = { gagne: gagne / N, faillite: (fins.faillite || 0) / N };
    const pct = x => Math.round(x / N * 100) + " %";
    console.log(`  ${nom.padEnd(10)} victoires ${pct(gagne).padStart(5)} · tours moyens ${(tours / N).toFixed(0).padStart(3)} · ` +
      `ambitions tenues ${(gagne ? amb / gagne : 0).toFixed(1)}/2 · score ${Math.round(score / N)} · défaites ${JSON.stringify(fins)}`);
    if (nom === "réfléchi" && niveau === "moyen") console.log("    catégories tirées : " + Object.entries(cats).map(([k, v]) => k + " " + Math.round(v / N)).join(", "));
  }
  return taux;
}
const T = { facile: simuler("facile"), moyen: simuler("moyen"), difficile: simuler("difficile") };

// Bornes d'équilibrage : jouer au hasard doit souvent perdre, réfléchir doit payer, l'argent doit compter,
// et chaque niveau doit être nettement plus dur que le précédent
const bornes = [
  ["facile : jouer au hasard gagne entre 40 % et 85 % des parties", T.facile["hasard"].gagne >= 0.4 && T.facile["hasard"].gagne <= 0.85],
  ["facile : un joueur réfléchi gagne au moins 95 % des parties", T.facile["réfléchi"].gagne >= 0.95],
  ["moyen : jouer au hasard gagne entre 15 % et 65 % des parties", T.moyen["hasard"].gagne >= 0.15 && T.moyen["hasard"].gagne <= 0.65],
  ["moyen : un joueur réfléchi gagne au moins 80 % des parties", T.moyen["réfléchi"].gagne >= 0.8],
  ["moyen : ignorer le budget mène parfois à la faillite (≥ 5 %)", T.moyen["dépensier"].faillite >= 0.05],
  ["réaliste : jouer au hasard gagne moins de 10 % des parties", T.difficile["hasard"].gagne < 0.1],
  ["réaliste : un joueur réfléchi gagne entre 50 % et 90 % des parties", T.difficile["réfléchi"].gagne >= 0.5 && T.difficile["réfléchi"].gagne <= 0.9],
  ["réaliste : ignorer le budget mène souvent à la faillite (≥ 20 %)", T.difficile["dépensier"].faillite >= 0.2],
];
let echec = 0;
for (const [t, v] of bornes) { console.log((v ? "  ✓ " : "  ✗ ") + t); if (!v) echec++; }
if (echec) process.exit(1);
