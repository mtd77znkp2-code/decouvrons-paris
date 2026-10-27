// Tests du moteur Maire de Paris (mode tycoon) + simulation d'équilibrage sur de nombreuses parties.
// Usage : node tools/maire/test-moteur.mjs [nombre de parties par stratégie et par niveau, défaut 60 ; 0 = tests seuls]
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
const N = process.argv[2] != null ? +process.argv[2] : 60;

let ok = 0;
function test(nom, f) { f(); ok++; console.log("  ✓ " + nom); }
// Fait avancer une partie : les dossiers sont tranchés par `choix`, la gestion du mois par `gere`
function jouer(st, choix, gere, maxMois) {
  while (st.phase !== "fin" && st.mois < (maxMois || 600)) {
    if (st.phase === "election") st = M.continuer(st, base);
    else if (st.phase === "evenement") st = M.choisir(st, base, choix(st, M.evenementCourant(st, base)));
    else { if (gere) st = gere(st); st = M.debutTour(st, base); }
  }
  return st;
}
console.log("Tests du moteur");

test("la base publiée est entièrement valide et le compteur est exact", () => {
  assert.equal(base.rejets.length, 0, JSON.stringify(base.rejets.slice(0, 3)));
  assert.equal(base.liste.length, idx.total + NSP);
  assert.equal(new Set(base.liste.map(e => e.id)).size, idx.total + NSP);
  assert.ok(idx.speciaux.catastrophe >= 30 && idx.speciaux.chance >= 30);
});

test("un événement invalide est rejeté", () => {
  const ev = JSON.parse(JSON.stringify(base.liste[0])); ev.choix.pop();
  assert.ok(M.valider(ev).length > 0);
  const ev2 = JSON.parse(JSON.stringify(base.liste[0])); ev2.choix[0].e = {};
  assert.ok(M.valider(ev2).length > 0);
  assert.equal(M.indexer([ev, base.liste[1]]).liste.length, 1);
});

test("création : ligne connue, deux promesses, 20 arrondissements et 2,1 millions d’habitants", () => {
  assert.throws(() => M.nouvellePartie({ ligne: "x", ambitions: ["logement", "securite"] }));
  assert.throws(() => M.nouvellePartie({ ligne: "gauche", ambitions: ["logement"] }));
  const st = M.nouvellePartie({ ligne: "gauche", ambitions: ["logement", "securite"], graine: 1 });
  assert.equal(st.arr.length, 20); assert.equal(st.mois, 0); assert.equal(st.tresor, M.NIVEAUX.moyen.tresor);
  assert.ok(M.habitants(st) > 2100 && M.habitants(st) < 2200);
  assert.equal(M.VOISINS.length, 20); M.VOISINS.forEach((v, i) => v.forEach(j => assert.ok(M.VOISINS[j - 1].includes(i + 1), "voisins " + (i + 1) + "/" + j)));
  assert.equal(new Set(M.GRILLE.map(g => g.join())).size, 20);
});

test("pas de double application (rechargement, double clic)", () => {
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["transports", "economie"], graine: 7 });
  st = M.debutTour(st, base);
  while (st.phase !== "evenement") st = M.debutTour(st, base);
  const copie = JSON.parse(JSON.stringify(st));
  assert.deepEqual(M.debutTour(copie, base), copie);           // dossier en attente : le mois ne passe pas
  const apres = M.choisir(st, base, 0);
  assert.deepEqual(M.choisir(apres, base, 1), apres);          // second clic : aucun effet
  assert.equal(apres.phase, "gestion");
});

test("parties reproductibles avec la même graine, et sauvegarde JSON fidèle", () => {
  const partie = (sauver) => {
    let st = M.nouvellePartie({ ligne: "ecologie", ambitions: ["ecologie", "transports"], graine: 42 });
    for (let t = 0; t < 60 && st.phase !== "fin"; t++) {
      if (st.phase === "evenement") st = M.choisir(st, base, t % 3);
      else { if (t % 4 === 0) st = M.construire(st, t % 20, "parc"); st = M.debutTour(st, base); }
      if (sauver) st = JSON.parse(JSON.stringify(st));
    }
    return st;
  };
  assert.equal(JSON.stringify(partie(false)), JSON.stringify(partie(true)));
});

test("construire : coût payé, plafond par arrondissement, effet sur le quartier ; réglages bornés", () => {
  let st = M.nouvellePartie({ ligne: "droite", ambitions: ["securite", "proprete"], graine: 3 });
  const t0 = st.tresor, s0 = st.arr[17].dom.securite;
  st = M.construire(st, 17, "police");
  assert.equal(st.tresor, t0 - M.BATIMENTS.police.cout); assert.equal(st.arr[17].bat.police, 1);
  st = M.construire(st, 17, "police"); assert.ok(M.peutConstruire(st, 17, "police"));
  assert.deepEqual(M.construire(st, 17, "police"), st);
  assert.ok(M.peutConstruire(st, 0, "metro"));                  // le métro n'arrive qu'en année 4
  for (let m = 0; m < 12; m++) st = jouer(st, () => 0, null, st.mois + 1);
  assert.ok(st.arr[17].dom.securite > s0, "la sécurité du 18e progresse");
  st = M.regler(st, { taux: 2, proprete: 0.1 }); assert.equal(st.taux, 1.3); assert.equal(st.budgets.proprete, 0.5);
});

test("un dossier qui cite un arrondissement s’y déroule", () => {
  const ev = base.liste.find(e => /\b18e\b/.test(e.titre + " " + e.desc) && !/\b(1[0-7]|19|20|[1-9])(e|er)\b/.test((e.titre + " " + e.desc).replace(/\b18e\b/g, "")));
  let st = M.nouvellePartie({ ligne: "gauche", ambitions: ["logement", "services"], graine: 5 });
  st.mois = 1; st.phase = "gestion";
  const b2 = { liste: [ev], parId: { [ev.id]: ev } };
  st.rngT = 1; st = M.debutTour(st, b2);
  if (st.evenement === ev.id) assert.equal(st.lieu, 17);
});

test("opposant tous les 6 mois, élection tous les 6 ans, fin de partie si battu", () => {
  for (let g = 1; g <= 12; g++) {
    let st = M.nouvellePartie({ ligne: "gauche", ambitions: ["logement", "services"], graine: g, niveau: ["facile", "moyen", "difficile"][g % 3] });
    while (st.phase !== "fin" && st.mois < 200) {
      const actif = st.opposant.actif, mandat = st.mandat;
      if (st.phase === "election") { st = M.continuer(st, base); continue; }
      if (st.phase === "evenement") { st = M.choisir(st, base, st.evPerso ? g % 4 : g % 3); continue; }
      st = M.debutTour(st, base);
      if (st.phase === "fin" || st.phase === "election") {
        if (st.mois % M.MANDAT === 0) {
          const e = st.elections[st.elections.length - 1];
          assert.equal(e.gagne, e.sieges > e.total / 2); assert.equal(st.phase === "fin", !e.gagne);
          if (e.gagne) assert.equal(st.mandat, mandat + 1);
        }
        continue;
      }
      assert.equal(!!st.evPerso, actif && M.moisMandat(st) % 6 === 0 && M.moisMandat(st) > 0, "mois " + st.mois);
    }
    if (st.phase === "fin") { const a = M.analyse(st); assert.ok(a.phrase.length > 20 && a.conseil.length > 20); }
  }
});

test("faillite quand la dette dépasse le plafond", () => {
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["logement", "transports"], graine: 9 });
  st.tresor = -M.PLAFOND_DETTE - 300; st.phase = "gestion";
  st = M.debutTour(st, base);
  assert.equal(st.phase, "fin"); assert.equal(st.fin.raison.type, "faillite");
});

test("progression : 100 succès, 400 quêtes vérifiables, défi du jour identique pour tous", () => {
  assert.equal(G.SUCCES.length, 100); assert.equal(new Set(G.SUCCES.map(x => x.id)).size, 100);
  const Q = JSON.parse(readFileSync(new URL("quetes.json", DATA)));
  assert.equal(Q.length, 400); assert.equal(new Set(Q.map(q => q.id)).size, 400); assert.equal(new Set(Q.map(q => q.t)).size, 400);
  for (const q of Q) { assert.ok(G.TYPES_QUETES.includes(q.k), q.id + " : type " + q.k); assert.ok(q.xp >= 10 && q.xp <= 300, q.id + " : xp"); }
  for (const q of Q) if (q.k === "construire") assert.ok(M.BATIMENTS[q.b], q.id);
  const j = 20000, a = G.quetesDuJour(j, Q), b = G.quetesDuJour(j + 1, Q);
  assert.equal(a.length, 3); assert.equal(new Set(a.map(q => q.id)).size, 3); assert.notDeepEqual(a, b);
  assert.deepEqual(G.defiDuJour(j, M, idx.lots, 900), G.defiDuJour(j, M, idx.lots, 900));
  const faites = new Set(), succes = new Set();
  for (let g = 1; g <= 6; g++) {
    let st = M.nouvellePartie({ ligne: ["gauche", "centre", "droite", "ecologie"][g % 4], ambitions: ["logement", "transports"], graine: g, niveau: ["facile", "moyen", "difficile"][g % 3] });
    st = jouer(st, (s, ev) => g % ev.choix.length, s => M.construire(s, (s.mois * 7) % 20, ["parc", "ecole", "logements", "marche"][s.mois % 4]), 220);
    if (st.phase !== "fin") { st.fin = { gagne: false, raison: { type: "election", txt: "" }, mois: st.mois }; st.phase = "fin"; }
    const R = G.resume(st, M), P = G.profilVide(); P.parties = 1;
    for (const q of Q) if (G.queteFaite(q, R)) faites.add(q.id);
    for (const x of G.SUCCES) if (x.f(R, P)) succes.add(x.id);
  }
  assert.ok(faites.size >= 40, "quêtes atteintes : " + faites.size); assert.ok(succes.size >= 8, "succès atteints : " + succes.size);
  assert.equal(G.niveau(0).n, 1); assert.equal(G.niveau(G.xpPour(10)).n, 10);
});

console.log(ok + " tests réussis.\n");
if (!N) { console.log("Simulation d’équilibrage ignorée (0 partie demandée)."); process.exit(0); }

// ---------- Simulation d'équilibrage ----------
const LIGNES = Object.keys(M.LIGNES), DOMS = Object.keys(M.DOMAINES), IDS = Object.keys(M.BATIMENTS);
const code = { gauche: "g", centre: "c", droite: "d", ecologie: "e" };
let graineSim = 1;
const alea = () => { graineSim = (graineSim + 0x6d2b79f5) | 0; let t = Math.imul(graineSim ^ (graineSim >>> 15), 1 | graineSim); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// Valeur d'une décision pour un joueur réfléchi (sans connaître l'aléa)
function valeur(st, c, prudence) {
  const e = c.e, a = (c.ali && c.ali[code[st.ligne]]) || 0;
  let v = (e.pop || 0) * (st.pop < 45 ? 2 : 1.2) + (e.bon || 0) * 1.2 + a * 0.9;
  for (const k in e.dom || {}) v += e.dom[k] * (st.ambitions.includes(k) ? 0.9 : 0.35);
  const cout = (e.bud || 0) + (e.rec ? e.rec.m * e.rec.n : 0);
  v += cout / (st.dette > 1000 || st.tresor < 200 ? 8 : 25) * prudence;
  return v;
}
// Construction réfléchie : le bâtiment qui remonte le plus les domaines faibles des gros arrondissements, en gardant une réserve
function batir(st, reserve, essais) {
  for (let t = 0; t < essais; t++) {
    let best = null, bv = 0;
    st.arr.forEach((a, i) => {
      for (const id of IDS) {
        const B = M.BATIMENTS[id]; if (M.peutConstruire(st, i, id)) continue;
        if (B.cout > 0 && st.tresor - B.cout < reserve) continue;
        let v = 0; for (const k in B.e) v += B.e[k] * Math.max(0, 70 - a.dom[k]) / 20 * (st.ambitions.includes(k) ? 1.5 : 1);
        v *= Math.sqrt(a.pop) / (Math.max(10, B.cout) + B.ent * 24) * 10;
        if (B.rev) v += B.rev * 24 / Math.max(10, B.cout) * (st.tresor < 600 ? 3 : 1);
        if (v > bv) { bv = v; best = [i, id]; }
      }
    });
    if (!best) return st;
    st = M.construire(st, best[0], best[1]);
  }
  return st;
}
const STRATS = {
  "passif": { choix: (st, ev) => Math.floor(alea() * ev.choix.length), gere: st => st },
  "hasard": { choix: (st, ev) => Math.floor(alea() * ev.choix.length), gere: st => alea() < 0.25 ? M.construire(st, Math.floor(alea() * 20), IDS[Math.floor(alea() * IDS.length)]) : st },
  "réfléchi": { choix: (st, ev) => ev.choix.map((c, i) => [valeur(st, c, 1), i]).sort((a, b) => b[0] - a[0])[0][1],
    gere: st => { const s = M.solde(st); if (s < -20 && st.taux < 1.1) st = M.regler(st, { taux: st.taux + 0.02 }); else if (s > 40 && st.taux > 0.95) st = M.regler(st, { taux: st.taux - 0.02 }); return batir(st, 300, 2); } },
  "dépensier": { choix: (st, ev) => ev.choix.map((c, i) => [valeur(st, c, 0), i]).sort((a, b) => b[0] - a[0])[0][1], gere: st => batir(st, -5000, 3) },
};
function simuler(niveau) {
  console.log(`Simulation niveau ${M.NIVEAUX[niveau].nom} : ${N} parties par stratégie`);
  const T = {};
  for (const [nom, S] of Object.entries(STRATS)) {
    graineSim = 1; let r1 = 0, mandats = 0, mois = 0, fa = 0, cons = 0, habit = 0, sc = 0;
    for (let p = 0; p < N; p++) {
      const a = DOMS.slice().sort(() => alea() - 0.5).slice(0, 2);
      const st = jouer(M.nouvellePartie({ ligne: LIGNES[p % 4], ambitions: a, graine: p * 7919 + 1, niveau }), S.choix, S.gere, 600);
      const w = st.elections.filter(e => e.gagne).length;
      if (w >= 1) r1++; mandats += w; mois += st.mois; cons += M.stats(st).construits; habit += M.habitants(st); sc += M.bilan(st).score;
      if (st.fin && st.fin.raison.type === "faillite") fa++;
    }
    T[nom] = { r1: r1 / N, mandats: mandats / N, faillite: fa / N };
    console.log(`  ${nom.padEnd(10)} 1re réélection ${Math.round(r1 / N * 100).toString().padStart(3)} % · élections gagnées ${(mandats / N).toFixed(1)} · ` +
      `durée ${(mois / N / 12).toFixed(1)} ans · faillites ${Math.round(fa / N * 100)} % · bâtiments ${Math.round(cons / N)} · habitants ${Math.round(habit / N)} k · score ${Math.round(sc / N)}`);
  }
  return T;
}
const T = { facile: simuler("facile"), moyen: simuler("moyen"), difficile: simuler("difficile") };
const bornes = [
  ["facile : un joueur réfléchi gagne sa 1re élection (≥ 95 %)", T.facile["réfléchi"].r1 >= 0.95],
  ["facile : sans rien construire, la réélection n’est pas garantie (≤ 85 %)", T.facile["passif"].r1 <= 0.85],
  ["moyen : un joueur réfléchi gagne sa 1re élection (≥ 90 %) et tient plusieurs mandats (≥ 2 en moyenne)", T.moyen["réfléchi"].r1 >= 0.9 && T.moyen["réfléchi"].mandats >= 2],
  ["moyen : sans rien construire, on est rarement réélu (≤ 40 %)", T.moyen["passif"].r1 <= 0.4],
  ["moyen : construire sans compter mène souvent à la faillite (≥ 30 %)", T.moyen["dépensier"].faillite >= 0.3],
  ["réaliste : un joueur réfléchi gagne sa 1re élection (≥ 70 %)", T.difficile["réfléchi"].r1 >= 0.7],
  ["réaliste : sans rien construire, on est presque toujours battu (≤ 10 %)", T.difficile["passif"].r1 <= 0.1],
  ["réaliste : construire sans compter mène presque toujours à la faillite (≥ 50 %)", T.difficile["dépensier"].faillite >= 0.5],
  ["chaque niveau est plus dur que le précédent pour un joueur réfléchi", T.facile["réfléchi"].mandats > T.moyen["réfléchi"].mandats && T.moyen["réfléchi"].mandats > T.difficile["réfléchi"].mandats],
];
let echec = 0;
for (const [t, v] of bornes) { console.log((v ? "  ✓ " : "  ✗ ") + t); if (!v) echec++; }
if (echec) process.exit(1);
