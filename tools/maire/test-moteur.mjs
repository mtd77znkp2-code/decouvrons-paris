// Tests du moteur Maire de Paris + simulation d'équilibrage sur de nombreuses parties.
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
  while (st.phase !== "fin" && st.t < (maxMois || 200)) {
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

test("mécaniques débloquées selon le niveau du joueur", () => {
  const debutant = M.nouvellePartie({ ligne: "gauche", ambitions: [], niveau: "difficile", nivJoueur: 1, graine: 1 });
  assert.equal(debutant.niveau, "facile");                         // le niveau Réaliste n'est pas encore ouvert
  assert.equal(debutant.ligne, "centre"); assert.deepEqual(debutant.ambitions, []); assert.equal(debutant.opposant, null);
  assert.ok(M.peutAcheter(debutant, "tram")); assert.equal(M.peutAcheter(debutant, "parc"), "");
  assert.deepEqual(M.regler(debutant, { taux: 1.2 }), debutant);   // impôts pas encore débloqués
  assert.throws(() => M.nouvellePartie({ ligne: "gauche", ambitions: ["logement"], nivJoueur: 10 }));
  const expert = M.nouvellePartie({ ligne: "gauche", ambitions: ["logement", "cadre"], niveau: "difficile", nivJoueur: 10, graine: 1 });
  assert.equal(expert.niveau, "difficile"); assert.ok(expert.opposant); assert.equal(M.peutAcheter(expert, "jo") === "Se débloque plus tard.", false);
});

test("pas de double application (rechargement, double clic)", () => {
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["transports", "cadre"], graine: 7, nivJoueur: 10 });
  st = M.debutTour(st, base);
  assert.equal(st.phase, "evenement");
  const copie = JSON.parse(JSON.stringify(st));
  assert.deepEqual(M.debutTour(copie, base), copie);
  const apres = M.choisir(st, base, 0);
  assert.deepEqual(M.choisir(apres, base, 1), apres);
  assert.equal(apres.phase, "gestion");
});

test("parties reproductibles avec la même graine, et sauvegarde JSON fidèle", () => {
  const partie = (sauver) => {
    let st = M.nouvellePartie({ ligne: "ecologie", ambitions: ["cadre", "transports"], graine: 42, nivJoueur: 10 });
    for (let t = 0; t < 80 && st.phase !== "fin"; t++) {
      if (st.phase === "election") st = M.continuer(st, base);
      else if (st.phase === "evenement") st = M.choisir(st, base, t % 3);
      else { if (t % 3 === 0) st = M.acheter(st, "parc"); st = M.debutTour(st, base); }
      if (sauver) st = JSON.parse(JSON.stringify(st));
    }
    return st;
  };
  assert.equal(JSON.stringify(partie(false)), JSON.stringify(partie(true)));
});

test("boutique : prix croissant, effet sur le pilier, grands projets uniques ; impôts bornés", () => {
  let st = M.nouvellePartie({ ligne: "droite", ambitions: ["securite", "cadre"], graine: 3, nivJoueur: 10 });
  const t0 = st.tresor, p1 = M.prix(st, "police");
  st = M.acheter(st, "police");
  assert.equal(st.tresor, t0 - p1); assert.equal(st.bat.police, 1); assert.ok(M.prix(st, "police") > p1);
  assert.ok(M.cible(st).securite > st.piliers.securite);
  st.tresor = 5000; st = M.acheter(st, "seine"); assert.equal(st.bat.seine, 1); assert.equal(M.peutAcheter(st, "seine"), "Déjà réalisé.");
  st = M.regler(st, { taux: 2 }); assert.equal(st.taux, 1.3);
});

test("opposant une fois par an, élection tous les 6 ans, fin de partie si battu", () => {
  for (let g = 1; g <= 15; g++) {
    let st = M.nouvellePartie({ ligne: "gauche", ambitions: ["logement", "cadre"], graine: g, niveau: ["facile", "moyen", "difficile"][g % 3], nivJoueur: 10 });
    while (st.phase !== "fin" && st.t < 120) {
      const actif = st.opposant.actif, mandat = st.mandat;
      if (st.phase === "election") { st = M.continuer(st, base); continue; }
      if (st.phase === "evenement") { st = M.choisir(st, base, st.evPerso ? g % st.evPerso.choix.length : g % 3); continue; }
      if (g % 2) st = M.acheter(st, ["parc", "logements", "police", "velo"][st.t % 4]);
      st = M.debutTour(st, base);
      if (st.phase === "fin" || st.phase === "election") {
        if (st.t % M.MANDAT === 0) {
          const e = st.elections[st.elections.length - 1];
          assert.equal(e.gagne, e.pct > 50); assert.equal(st.phase === "fin", !e.gagne);
          if (e.gagne) assert.equal(st.mandat, mandat + 1);
        }
        continue;
      }
      assert.equal(!!st.evPerso, actif && M.trimMandat(st) % 4 === 0 && M.trimMandat(st) > 0, "trimestre " + st.t);
    }
    if (st.phase === "fin") { const a = M.analyse(st); assert.ok(a.phrase.length > 20 && a.conseil.length > 20); }
  }
});

test("faillite quand la dette dépasse le plafond", () => {
  let st = M.nouvellePartie({ ligne: "centre", ambitions: [], graine: 9, nivJoueur: 1 });
  st.tresor = -M.PLAFOND_DETTE - 300; st.phase = "gestion";
  st = M.debutTour(st, base);
  assert.equal(st.phase, "fin"); assert.equal(st.fin.raison.type, "faillite");
});

test("progression : niveaux, chapitres, 100 succès, 400 quêtes adaptées au niveau, défi du jour", () => {
  assert.equal(G.SUCCES.length, 100); assert.equal(new Set(G.SUCCES.map(x => x.id)).size, 100);
  M.MECANIQUES.forEach(m => { const c = G.HISTOIRE[m.id]; assert.ok(c && c.etapes.length && c.objectif && c.recit, m.id); });
  const Q = JSON.parse(readFileSync(new URL("quetes.json", DATA)));
  assert.equal(Q.length, 400); assert.equal(new Set(Q.map(q => q.id)).size, 400); assert.equal(new Set(Q.map(q => q.t)).size, 400);
  for (const q of Q) { assert.ok(G.TYPES_QUETES.includes(q.k), q.id + " : type " + q.k); assert.ok(q.xp >= 10 && q.xp <= 300, q.id + " : xp"); }
  for (const q of Q) if (q.k === "achat") assert.ok(M.BATIMENTS[q.b], q.id);
  assert.deepEqual(G.quetesDuJour(20000, Q, 1), []);
  for (const n of [2, 5, 10]) { const a = G.quetesDuJour(20000, Q, n); assert.equal(a.length, 3); a.forEach(q => assert.ok(q.niv <= n)); }
  assert.notDeepEqual(G.quetesDuJour(20000, Q, 10), G.quetesDuJour(20001, Q, 10));
  assert.deepEqual(G.defiDuJour(20000, M, idx.lots, 600), G.defiDuJour(20000, M, idx.lots, 600));
  const faites = new Set(), succes = new Set();
  for (let g = 1; g <= 6; g++) {
    let st = M.nouvellePartie({ ligne: ["gauche", "centre", "droite", "ecologie"][g % 4], ambitions: ["logement", "transports"], graine: g, niveau: ["facile", "moyen", "difficile"][g % 3], nivJoueur: 10 });
    st = jouer(st, (s, ev) => g % ev.choix.length, s => M.acheter(s, ["parc", "ecole", "logements", "marche", "police", "tram"][s.t % 6]), 80);
    if (st.phase !== "fin") { st.fin = { gagne: false, raison: { type: "election", txt: "" }, t: st.t }; st.phase = "fin"; }
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
const LIGNES = Object.keys(M.LIGNES), PK = Object.keys(M.PILIERS), IDS = Object.keys(M.BATIMENTS);
const code = { gauche: "g", centre: "c", droite: "d", ecologie: "e" };
const VERS = { securite: "securite", proprete: "cadre", logement: "logement", transports: "transports", ecologie: "cadre", achat: "logement", services: "cadre" };
let graineSim = 1;
const alea = () => { graineSim = (graineSim + 0x6d2b79f5) | 0; let t = Math.imul(graineSim ^ (graineSim >>> 15), 1 | graineSim); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// Valeur d'une décision pour un joueur réfléchi (sans connaître l'aléa)
function valeur(st, c, prudence) {
  const e = c.e, a = st.meca.ligne ? (c.ali && c.ali[code[st.ligne]]) || 0 : 0;
  let v = (e.pop || 0) * (st.pop < 45 ? 2 : 1.2) + (e.bon || 0) * 1.2 + a * 0.9;
  for (const k in e.dom || {}) v += e.dom[k] * (st.ambitions.includes(VERS[k]) ? 0.9 : 0.4);
  v += ((e.bud || 0) + (e.rec ? e.rec.m * e.rec.n : 0)) / (st.dette > 500 || st.tresor < 100 ? 6 : 20) * prudence;
  return v;
}
// Achat réfléchi : ce qui remonte le plus les piliers faibles pour son prix, en gardant une réserve
function acheteMalin(st, reserve, essais) {
  for (let t = 0; t < essais; t++) {
    let best = null, bv = 0;
    for (const id of IDS) {
      const B = M.BATIMENTS[id]; if (M.peutAcheter(st, id)) continue;
      const px = M.prix(st, id); if (st.tresor - px < reserve) continue;
      let v = 0; for (const k in B.e) v += B.e[k] * Math.max(0, 75 - st.piliers[k]) / 20 * (st.ambitions.includes(k) ? 1.5 : 1);
      v = v / (px + B.ent * 16) * 100 + (B.rev || 0) * 16 / px * (st.tresor < 300 ? 3 : 1) + (B.pop || 0) / 3;
      if (v > bv) { bv = v; best = id; }
    }
    if (!best) return st;
    st = M.acheter(st, best);
  }
  return st;
}
const STRATS = {
  "passif": { choix: (st, ev) => Math.floor(alea() * ev.choix.length), gere: st => st },
  "hasard": { choix: (st, ev) => Math.floor(alea() * ev.choix.length), gere: st => alea() < 0.3 ? M.acheter(st, IDS[Math.floor(alea() * IDS.length)]) : st },
  "réfléchi": { choix: (st, ev) => ev.choix.map((c, i) => [valeur(st, c, 1), i]).sort((a, b) => b[0] - a[0])[0][1],
    gere: st => {
      if (st.meca.budget) { const s = M.solde(st); if (s < -15 && st.taux < 1.1) st = M.regler(st, { taux: st.taux + 0.05 }); else if (s > 40 && st.taux > 0.95) st = M.regler(st, { taux: st.taux - 0.05 }); }
      return acheteMalin(st, 150, 1);
    } },
  "dépensier": { choix: (st, ev) => ev.choix.map((c, i) => [valeur(st, c, 0), i]).sort((a, b) => b[0] - a[0])[0][1], gere: st => acheteMalin(st, -3000, 3) },
};
function simuler(niveau, nivJoueur) {
  console.log(`Simulation niveau ${M.NIVEAUX[niveau].nom}, joueur de niveau ${nivJoueur} : ${N} parties par stratégie`);
  const T = {};
  for (const [nom, S] of Object.entries(STRATS)) {
    graineSim = 1; let r1 = 0, mandats = 0, t = 0, fa = 0, ach = 0, sc = 0;
    for (let p = 0; p < N; p++) {
      const a = PK.slice().sort(() => alea() - 0.5).slice(0, 2);
      const st = jouer(M.nouvellePartie({ ligne: LIGNES[p % 4], ambitions: a, graine: p * 7919 + 1, niveau, nivJoueur }), S.choix, S.gere, 200);
      const w = st.elections.filter(e => e.gagne).length;
      if (w >= 1) r1++; mandats += w; t += st.t; ach += M.stats(st).achats; sc += M.bilan(st).score;
      if (st.fin && st.fin.raison.type === "faillite") fa++;
    }
    T[nom] = { r1: r1 / N, mandats: mandats / N, faillite: fa / N };
    console.log(`  ${nom.padEnd(10)} 1re réélection ${Math.round(r1 / N * 100).toString().padStart(3)} % · élections gagnées ${(mandats / N).toFixed(1)} · ` +
      `durée ${(t / N / 4).toFixed(1)} ans · faillites ${Math.round(fa / N * 100)} % · achats ${Math.round(ach / N)} · score ${Math.round(sc / N)}`);
  }
  return T;
}
const T = { debutant: simuler("facile", 1), facile: simuler("facile", 10), moyen: simuler("moyen", 10), difficile: simuler("difficile", 10) };
const bornes = [
  ["débutant (niveau 1, Facile) : en achetant intelligemment, on gagne sa 1re élection (≥ 90 %)", T.debutant["réfléchi"].r1 >= 0.9],
  ["débutant : sans rien acheter, on perd (≤ 20 % de réélection)", T.debutant["passif"].r1 <= 0.2],
  ["moyen : un joueur réfléchi gagne sa 1re élection (≥ 85 %) et en moyenne plus d’une", T.moyen["réfléchi"].r1 >= 0.85 && T.moyen["réfléchi"].mandats >= 1.3],
  ["moyen : sans rien acheter, on perd (≤ 10 %)", T.moyen["passif"].r1 <= 0.1],
  ["moyen : acheter sans compter mène souvent à la faillite (≥ 50 %)", T.moyen["dépensier"].faillite >= 0.5],
  ["réaliste : un joueur réfléchi gagne sa 1re élection au moins une fois sur deux", T.difficile["réfléchi"].r1 >= 0.5],
  ["réaliste : sans rien acheter, on perd presque toujours (≤ 5 %)", T.difficile["passif"].r1 <= 0.05],
  ["réaliste : acheter sans compter mène presque toujours à la faillite (≥ 70 %)", T.difficile["dépensier"].faillite >= 0.7],
  ["chaque niveau est plus dur que le précédent pour un joueur réfléchi", T.facile["réfléchi"].mandats > T.moyen["réfléchi"].mandats && T.moyen["réfléchi"].mandats > T.difficile["réfléchi"].mandats],
];
let echec = 0;
for (const [t, v] of bornes) { console.log((v ? "  ✓ " : "  ✗ ") + t); if (!v) echec++; }
if (echec) process.exit(1);
