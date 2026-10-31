// Tests du moteur Maire de Paris + simulation d'équilibrage sur de nombreuses parties.
// Usage : node tools/maire/test-moteur.mjs [nombre de parties par stratégie et par niveau, défaut 60 ; 0 = tests seuls]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

// Profil du joueur en mémoire (le navigateur le garde dans localStorage)
const memoire = {};
globalThis.localStorage = { getItem: k => (k in memoire ? memoire[k] : null), setItem: (k, v) => { memoire[k] = String(v); }, removeItem: k => { delete memoire[k]; } };
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
  assert.equal(M.palier(debutant), "facile");                      // la difficulté ne dépend plus d'un choix : elle suit le mandat
  assert.equal(debutant.ligne, "centre"); assert.deepEqual(debutant.ambitions, []); assert.ok(debutant.opposant);                                    // l’opposant est là dès le départ
  assert.ok(M.peutAcheter(debutant, "tram")); assert.equal(M.peutAcheter(debutant, "parc"), "");
  assert.deepEqual(M.regler(debutant, { taux: 1.2 }), debutant);   // impôts pas encore débloqués
  assert.throws(() => M.nouvellePartie({ ligne: "gauche", ambitions: ["logement"], nivJoueur: 40 }));
  const expert = M.nouvellePartie({ ligne: "gauche", ambitions: ["logement", "cadre"], niveau: "difficile", nivJoueur: 40, graine: 1 });
  assert.equal(M.palier(expert), "facile"); assert.ok(expert.opposant);
  const m2 = JSON.parse(JSON.stringify(expert)); m2.mandat = 2; assert.equal(M.palier(m2), "moyen"); m2.mandat = 5; assert.equal(M.palier(m2), "difficile"); assert.equal(M.peutAcheter(expert, "jo") === "Se débloque plus tard.", false);
});

test("pas de double application (rechargement, double clic)", () => {
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["transports", "cadre"], graine: 7, nivJoueur: 40 });
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
    let st = M.nouvellePartie({ ligne: "ecologie", ambitions: ["cadre", "transports"], graine: 42, nivJoueur: 40 });
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
  let st = M.nouvellePartie({ ligne: "droite", ambitions: ["securite", "cadre"], graine: 3, nivJoueur: 40 });
  const t0 = st.tresor, p1 = M.prix(st, "police");
  st = M.acheter(st, "police");
  assert.equal(st.tresor, t0 - p1); assert.equal(st.bat.police, 1); assert.ok(M.prix(st, "police") > p1);
  assert.ok(M.cible(st).securite > st.piliers.securite);
  st = M.regler(st, { taux: 2 }); assert.equal(st.taux, 1.3);
});

test("projets démesurés : 30 % au lancement, tranches à chaque trimestre, inauguration au bout", () => {
  let st = M.nouvellePartie({ ligne: "gauche", ambitions: ["cadre", "logement"], graine: 5, nivJoueur: 40 });
  st.tresor = 3000; st.phase = "gestion";
  assert.equal(M.peutAcheter(st, "grandParc"), "Tiens encore 4 trimestres.");   // objectif de partie pas encore rempli
  st.t = 4;
  const B = M.BATIMENTS.grandParc, t0 = st.tresor;
  st = M.acheter(st, "grandParc");
  assert.equal(st.chantiers.length, 1); assert.equal(st.tresor, t0 - Math.round(B.cout * 0.3)); assert.ok(!st.bat.grandParc);
  assert.equal(M.peutAcheter(st, "grandParc"), "En travaux.");
  for (let k = 0; k < 40 && !st.bat.grandParc && st.phase !== "fin"; k++) st = jouer(st, () => 0, null, st.t + 1);
  assert.equal(st.bat.grandParc, 1, "le parc est inauguré"); assert.equal(st.chantiers.length, 0); assert.ok(M.stats(st).projetsOk >= 1);
  assert.ok(st.objets.includes("casque"));
  const debutant = M.nouvellePartie({ ligne: "gauche", ambitions: [], graine: 5, nivJoueur: 3 });
  assert.ok(M.peutAcheter(debutant, "grandParc"));                 // pas encore débloqué
});

test("combos de bâtiments : bonus réel une fois les conditions réunies", () => {
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 6, nivJoueur: 40 });
  st.tresor = 2000; st.phase = "gestion";
  const r0 = M.recettes(st);
  st = M.acheter(st, "marche"); st = M.acheter(st, "parc"); assert.deepEqual(M.combosActifs(st), []);
  st = M.acheter(st, "logements");
  assert.deepEqual(M.combosActifs(st), ["vivant"]); assert.ok(st.combos.includes("vivant"));
  assert.ok(M.recettes(st) >= r0 + M.BATIMENTS.marche.rev + M.C.COMBOS.vivant.rev - 0.01);
  assert.ok(st.decouvertes.some(d => d.type === "combo" && d.id === "vivant"));
  assert.deepEqual(M.viderDecouvertes(st).decouvertes, []);
});

test("dernier pari : n'apparaît qu'en crise, blackjack et roulette justes, financements avec contreparties", () => {
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 8, nivJoueur: 40 });
  st.phase = "gestion";
  assert.equal(M.bjCommencer(st, 50), st);                           // pas d'offre : rien
  for (let k = 0; k < 8; k++) st = jouer(st, () => 0, null, st.t + 1);
  assert.equal(st.offre, null, "pas d'offre quand tout va bien");
  st.dette = 1000; st.tresor = 0; st.phase = "gestion"; st.pariCd = 0;
  st = M.debutTour(st, base); while (st.phase === "evenement") st = M.choisir(st, base, 0);
  assert.ok(st.offre, "offre en pleine crise"); const max = M.pariMise(st);
  assert.ok(max > 0 && max <= M.PALIERS[Math.min(4, st.mandat - 1)].pariMax && st.dette + max <= M.PLAFOND_DETTE);
  assert.equal(M.bjCommencer(st, max + 10), st);                     // mise trop haute refusée
  // Blackjack : le gain annoncé est exactement ce qui entre (ou sort) de la trésorerie, dette comprise
  for (let g = 1; g <= 40; g++) {
    let s = JSON.parse(JSON.stringify(st)); s.rng = g;
    const net0 = s.tresor - s.dette;
    s = M.bjCommencer(s, 50);
    while (s.bj && !s.bj.fini) s = M.valeurMain(s.bj.j) < 15 ? M.bjTirer(s) : M.bjRester(s);
    const net1 = s.tresor - s.dette;
    assert.ok(Math.abs(net1 - net0 - s.bj.res.gain) < 0.5, "gain " + s.bj.res.gain + " / variation " + (net1 - net0));
    assert.ok(s.bj.c.length >= 2 && (M.valeurMain(s.bj.j) > 21 || M.valeurMain(s.bj.c) >= 17 || s.bj.j.length === 2));
    assert.equal(s.offre, null); assert.equal(M.bjTirer(s), s);        // une seule partie par offre
  }
  // Roulette : gains conformes aux règles annoncées
  for (let g = 1; g <= 60; g++) {
    let s = JSON.parse(JSON.stringify(st)); s.rng = g * 977;
    const pari = ["rouge", "noir", "d1", "d2", "d3", "zero"][g % 6];
    s = M.roulette(s, 40, pari); const r = s.pariRes;
    const gagne = pari === "zero" ? r.n === 0 : pari === "rouge" ? r.n > 0 && r.rouge : pari === "noir" ? r.n > 0 && !r.rouge : r.n > 0 && Math.ceil(r.n / 12) === +pari[1];
    assert.equal(r.gain, gagne ? 40 * (pari === "zero" ? 35 : pari[0] === "d" ? 2 : 1) : -40);
  }
  // Financement : l'argent arrive, la contrepartie est inscrite
  let f = M.financer(JSON.parse(JSON.stringify(st)), "investisseur", 1);
  assert.ok(f.recurrents.some(r => r.m === -25 && r.n === 16)); assert.equal(f.offre, null);
  f = M.financer(JSON.parse(JSON.stringify(st)), "investisseur", 2); assert.equal(f.conditions.length, 1);
  assert.equal(M.refuserPari(st).offre, null);
});

test("sauvegardes : une partie de la version précédente se reprend sans rien perdre", () => {
  let st = M.nouvellePartie({ ligne: "gauche", ambitions: ["cadre", "logement"], graine: 12, nivJoueur: 40 });
  st = jouer(st, (s, ev) => 0, s => M.acheter(s, "parc"), 10);
  const ancien = JSON.parse(JSON.stringify(st));
  ["chaos", "chantiers", "incidents", "messages", "offre", "bj", "mission", "missionsOk", "combos", "decouvertes", "objets", "secrets", "persos", "mods", "conditions", "suitesSpe", "uniques", "ampleur"].forEach(k => delete ancien[k]);
  ["grandsProjets", "pari", "missions", "combos", "historiques"].forEach(k => delete ancien.meca[k]);
  ["xp", "xp0", "xpLog", "xpSrc", "montees", "succesPartie", "suivi", "nivFixe", "pid", "connus", "enchere", "encheresCd", "sansLimite", "triche", "maire", "crise", "objectifs", "prochainDossier", "mandatBats", "mandatTypes", "mandatBase", "anticipee"].forEach(k => delete ancien[k]);
  ancien.v = 3;
  let r = M.reprendre(ancien, base);
  assert.equal(r.v, 8);
  assert.equal(r.objectifs.length, 3); assert.equal(r.crise, null, "partie en cours : objectifs sans crise ajoutée");
  // L'XP déjà méritée dans l'ancienne partie est comptée une fois (elle n'était versée qu'à la fin auparavant)
  assert.equal(r.xpLog.find(g => /Trimestres/.test(g.txt)).xp, st.t * M.XP.trimestre);
  assert.equal(r.xpLog.find(g => /Bâtiments/.test(g.txt)).xp, Math.min(M.XP.achatMax, M.stats(st).achats * M.XP.achat));
  { const r2 = M.migrer(JSON.parse(JSON.stringify(r))); for (const k of Object.keys(r2)) assert.deepEqual(r2[k], r[k], "migrer deux fois change " + k); }   // migrer deux fois ne change rien assert.equal(r.t, st.t); assert.equal(r.tresor, st.tresor); assert.deepEqual(r.bat, st.bat); assert.deepEqual(r.piliers, st.piliers);
  r = jouer(r, () => 0, null, r.t + 12);
  assert.ok(r.t >= st.t + 1);
});

test("contenu : événements spéciaux, objets, secrets, projets et missions cohérents", () => {
  const C = M.C, ids = new Set(C.EVENEMENTS.map(e => e.id));
  assert.equal(ids.size, C.EVENEMENTS.length);
  C.EVENEMENTS.concat(C.HISTORIQUES).forEach(ev => {
    assert.equal(ev.choix.length, 3, ev.id); assert.ok(ev.titre && ev.desc, ev.id);
    ev.choix.forEach(c => {
      assert.ok(c.t && (c.r || c.grandJour) && c.e, ev.id);
      [c.e, c.risque && c.risque.e].filter(Boolean).forEach(e => {
        if (e.suite) assert.ok(ids.has(e.suite.id), ev.id + " → " + e.suite.id);
        if (e.objet) assert.ok(C.OBJETS[e.objet], ev.id + " objet " + e.objet);
        if (e.secret) assert.ok(C.SECRETS[e.secret], ev.id);
      });
      if (c.risque) assert.ok(c.risque.p > 0 && c.risque.p < 1 && c.risque.r, ev.id);
    });
  });
  Object.values(C.OBJETS).forEach(o => { if (o.secret) assert.ok(C.SECRETS[o.secret]); });
  Object.keys(C.SECRETS).forEach(id => assert.ok(Object.values(C.OBJETS).some(o => o.secret === id), "secret sans objet : " + id));
  // Chaque objet peut réellement être trouvé (sinon le secret qu'il débloque est inaccessible)
  const src = readFileSync(new URL("../../public/maire/moteur.js", import.meta.url), "utf8") + readFileSync(new URL("../../public/maire/contenu.js", import.meta.url), "utf8");
  Object.keys(C.OBJETS).forEach(id => assert.ok(new RegExp('objet: "' + id + '"|gagnerObjet\\(st, "' + id + '"\\)|\\["(?:[a-z]+", ")*' + id + '"').test(src), "objet introuvable en jeu : " + id));
  Object.values(C.COMBOS).forEach(c => Object.keys(c.besoin).forEach(b => assert.ok(b === "transport" || M.BATIMENTS[b], b)));
  // Chaque événement spécial se joue sans erreur, avec ses trois choix
  C.EVENEMENTS.forEach(ev => [0, 1, 2].forEach(i => {
    let st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 3, nivJoueur: 40 });
    st.t = 30; st.phase = "gestion"; st.chantiers = [{ id: "grandParc", reste: 4, du: 100, ampleur: 1, susp: 0 }];
    st.evPerso = { id: "t", kind: "special", cid: "grandParc", titre: ev.titre, desc: ev.desc, choix: JSON.parse(JSON.stringify(ev.choix)) };
    st.evenement = "t"; st.phase = "evenement";
    const r = M.choisir(st, base, i); assert.equal(r.phase === "gestion" || r.phase === "fin", true, ev.id);
  }));
});

test("défi du jour : départ imposé, 12 trimestres, score défini à l'avance", () => {
  for (const d of M.C.DEFIS_JOUR) {
    let st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 4, nivJoueur: 8, scenario: d.id });
    assert.equal(st.scenario.id, d.id);
    if (d.depart.dette) assert.equal(st.dette, d.depart.dette);
    if (d.depart.tauxBloque) assert.deepEqual(M.regler(st, { taux: 1.3 }), st);
    st = jouer(st, () => 0, s => M.acheter(s, "parc"), 40);
    assert.equal(st.phase, "fin", d.id);
    assert.ok(st.t <= 12, d.id + " : " + st.t);
    assert.ok(Number.isFinite(M.bilan(st).score), d.id);
  }
});

test("le récit de fin de partie ne parle que de ce qui s'est vraiment passé", () => {
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 21, nivJoueur: 1 });
  st = jouer(st, () => 0, null, 3); st = M.demissionner(st);
  const r = M.recit(st);
  assert.ok(/3 trimestres/.test(r)); assert.ok(!/pigeon|pari|projet|légendaire|combo/i.test(r), r);
});

test("opposant une fois par an, élection tous les 6 ans, fin de partie si battu", () => {
  for (let g = 1; g <= 15; g++) {
    let st = M.nouvellePartie({ ligne: "gauche", ambitions: ["logement", "cadre"], graine: g, niveau: ["facile", "moyen", "difficile"][g % 3], nivJoueur: 40 });
    while (st.phase !== "fin" && st.t < 120) {
      const actif = st.opposant.actif, mandat = st.mandat;
      if (st.phase === "election") { st = M.continuer(st, base); continue; }
      if (st.phase === "evenement") { st = M.choisir(st, base, st.evPerso ? g % st.evPerso.choix.length : g % 3); continue; }
      if (g % 2) st = M.acheter(st, ["parc", "logements", "police", "velo"][st.t % 4]);
      st = M.debutTour(st, base);
      if (st.phase === "fin" || st.phase === "election") {
        if (st.t % M.MANDAT === 0 && st.elections.length && st.elections[st.elections.length - 1].t === st.t) {
          const e = st.elections[st.elections.length - 1];
          assert.equal(e.gagne, e.pct > 50); assert.equal(st.phase === "fin", !e.gagne);
          if (e.gagne) assert.equal(st.mandat, mandat + 1);
        }
        continue;
      }
      const attendue = actif && M.trimMandat(st) % 4 === 0 && M.trimMandat(st) > 0, opp = !!(st.evPerso && st.evPerso.kind === "opposition");
      if (st.special !== "catastrophe") assert.equal(opp, attendue, "trimestre " + st.t);
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

test("progression : niveaux, chapitres, plus de 120 succès, 400 quêtes adaptées au niveau, défi du jour", () => {
  assert.ok(G.SUCCES.length >= 120); assert.equal(new Set(G.SUCCES.map(x => x.id)).size, G.SUCCES.length);
  assert.ok(G.SUCCES.filter(x => x.secret).length >= 8);
  M.MECANIQUES.forEach(m => { const c = G.HISTOIRE[m.id]; assert.ok(c && c.objectif && c.recit, m.id); });
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
    let st = M.nouvellePartie({ ligne: ["gauche", "centre", "droite", "ecologie"][g % 4], ambitions: ["logement", "transports"], graine: g, niveau: ["facile", "moyen", "difficile"][g % 3], nivJoueur: 40 });
    st = jouer(st, (s, ev) => g % ev.choix.length, s => M.acheter(s, ["parc", "ecole", "logements", "marche", "police", "tram"][s.t % 6]), 80);
    if (st.phase !== "fin") { st.fin = { gagne: false, raison: { type: "election", txt: "" }, t: st.t }; st.phase = "fin"; }
    const R = G.resume(st, M), P = G.profilVide(); P.parties = 1;
    for (const q of Q) if (G.queteFaite(q, R)) faites.add(q.id);
    for (const x of G.SUCCES) if (x.f(R, P)) succes.add(x.id);
  }
  assert.ok(faites.size >= 40, "quêtes atteintes : " + faites.size); assert.ok(succes.size >= 8, "succès atteints : " + succes.size);
  assert.equal(G.niveau(0).n, 1); assert.equal(G.niveau(G.xpPour(10)).n, 10);
});

test("progression en direct : XP pendant la partie, un bâtiment par niveau, succès et quêtes affichés tout de suite, sans double XP", () => {
  localStorage.removeItem("maire_profil_v1");
  let st = M.nouvellePartie({ ligne: "centre", ambitions: [], niveau: "facile", xpJoueur: 0, graine: 77, pid: "test-1" });
  st.phase = "gestion";
  const dispo = Object.keys(M.BATIMENTS).filter(id => M.disponible(st, id));
  assert.deepEqual(dispo, ["parc", "logements"], "on commence avec deux bâtiments");
  assert.equal(M.peutAcheter(st, "velo"), "Se débloque au niveau 2.");
  // Chaque niveau débloque au moins un bâtiment, jusqu'au niveau 12
  for (let n = 2; n <= 35; n++) assert.equal(Object.values(M.BATIMENTS).filter(B => !B.secret && !B.pass && B.cat !== "commerce" && B.niv === n).length, 2, "2 bâtiments débloqués au niveau " + n);
  // Les commerces suivent leur propre rythme : un à la fois, étalés dans la progression
  const com = Object.values(M.BATIMENTS).filter(B => B.cat === "commerce").map(B => B.niv);
  assert.ok(com.length >= 10 && new Set(com).size === com.length && Math.min(...com) >= 2);
  // Premier achat : succès « Première pierre » réussi et affiché, XP versée au profil
  st = M.acheter(st, "parc");
  let r = G.suivrePartie(st, M, {}); st = r.st;
  assert.ok(r.succes.some(x => x.id === "ach1"), "succès affiché dès qu'il est réussi");
  const P1 = G.lire(); assert.ok(P1.succes.ach1); assert.equal(P1.xp, st.xp);
  const vieux = JSON.parse(JSON.stringify(st));
  r = G.suivrePartie(st, M, {}); assert.equal(r.succes.length, 0); assert.equal(G.lire().xp, P1.xp, "rien n'est compté deux fois");
  // Deuxième achat : le succès suivant progresse (affichage « 2 / 10 »)
  st = M.acheter(r.st, "logements"); r = G.suivrePartie(st, M, {}); st = r.st;
  const pr = r.progres.find(p => p.nom === "Bâtisseur"); assert.ok(pr && pr.cur === 2 && pr.but === 10, JSON.stringify(r.progres));
  // Une vieille copie de la partie (rechargement) ne retire ni ne double l'XP
  const xpAvant = G.lire().xp; G.suivrePartie(vieux, M, {}); assert.equal(G.lire().xp, xpAvant);
  // Monter de niveau en pleine partie : le vélo arrive en boutique, les impôts s'activent
  // (assez d'argent pour atteindre le niveau 2 quel que soit le succès du jour, qui change l'XP d'un jour à l'autre)
  st.tresor = 5000;
  for (let k = 0; k < 60 && st.nivJ < 2; k++) { st = M.acheter(st, "parc"); r = G.suivrePartie(st, M, {}); st = r.st; }
  assert.equal(st.montees[0].n, 2); assert.ok(st.montees[0].bats.includes("velo")); assert.ok(!st.montees[0].bats.includes("eclairageLed"), "objectif de 2 trimestres pas encore rempli"); assert.ok(st.meca.budget);
  assert.equal(M.peutAcheter(st, "velo"), ""); assert.deepEqual(M.viderMontees(st).montees, []);
  // Quête du jour : validée en pleine partie, avec sa progression
  const q = { id: "qt", k: "achats", n: 40, t: "Achète 40 bâtiments", xp: 50 };
  r = G.suivrePartie(st, M, { quetes: [q] }); st = r.st;
  st = M.acheter(st, "logements"); r = G.suivrePartie(st, M, { quetes: [q] }); st = r.st;
  assert.ok(r.progres.some(p => p.type === "quete" && p.cur === M.stats(st).achats && p.but === 40));
  // Fin de partie : le récapitulatif reprend toute l'XP gagnée, le profil l'a reçue exactement une fois
  st = M.demissionner(st);
  const res = G.terminer(st, M, { quetes: [] });
  assert.equal(res.total, res.st.xp); assert.equal(res.gains.reduce((a, g) => a + g.xp, 0), res.total);
  assert.equal(G.lire().xp, res.total); assert.equal(res.avant.n, 1);
  // Défi du jour : mêmes bâtiments pour tout le monde, même si l'XP fait monter de niveau
  let d = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 4, nivJoueur: 8, xpJoueur: 0, scenario: M.C.DEFIS_JOUR[0].id, pid: "defi" });
  d = M.ajouterXP(d, "test", 99999); assert.equal(d.nivJ, 8); assert.deepEqual(d.montees, []);
  localStorage.removeItem("maire_profil_v1");
});

test("bâtiments : plus de 50 en boutique, chacun utile, objectifs de trimestres et de réélection, atouts réels", () => {
  const ids = Object.keys(M.BATIMENTS), normaux = ids.filter(id => !M.BATIMENTS[id].projet && !M.BATIMENTS[id].secret);
  assert.ok(normaux.length >= 52, "bâtiments en boutique : " + normaux.length);
  assert.equal(Object.keys(M.C.BATIMENTS2).length + Object.keys(M.C.ENCHERES).length >= 40, true);
  const rayons = M.RAYONS.map(r => r.id), ATOUTS = ["rev", "eco", "pop", "popT", "vote", "usure", "entretienPct", "interet", "cata", "chaosT"];
  for (const id of ids) {
    const B = M.BATIMENTS[id];
    assert.ok(rayons.includes(B.cat), id + " sans rayon");
    if (!B.secret) assert.ok(Object.values(B.e).some(v => v > 0) || ATOUTS.some(k => B[k]), id + " n’apporte rien");
    if (B.si) assert.ok((B.si.t > 0 && B.si.t <= 24) || (B.si.reel >= 1 && B.si.reel <= 3) || B.si.apres, id + " : objectif");
    // Un bâtiment prérequis existe, n'est pas lui-même un bâtiment exclusif, et s'obtient au plus tard au même niveau
    Object.keys((B.si && B.si.apres) || {}).forEach(b => { const A = M.BATIMENTS[b]; assert.ok(A && !A.pass && !A.secret && !A.enchere, id + " → " + b); assert.ok((A.niv || 1) <= (B.niv || 1), id + " exige " + b + " plus tard"); });
    if (!B.secret && !B.seance) assert.ok(B.niv >= 1 && B.niv <= 40, id + " : niveau");
  }
  // Objectif de trimestres, puis annonce de l'arrivée en boutique
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 31, nivJoueur: 40 });
  assert.equal(M.peutAcheter(st, "metro"), "Tiens encore 8 trimestres.");
  assert.equal(M.peutAcheter(st, "caisseCredit"), "Après ta 1re réélection.");
  while (st.t < 8) { st = jouer(st, () => 0, null, st.t + 1); }
  // Les trimestres sont tenus, mais le métro exige un tram : tous les prérequis s'affichent, cochés ou non
  assert.equal(M.peutAcheter(st, "metro"), "Construis d’abord 🚋 Ligne de tramway.");
  assert.deepEqual(M.prerequis(st, "metro").map(x => [x.k, x.ok]), [["niv", true], ["t", true], ["apres", false]]);
  st.tresor = 2000; st = M.acheter(st, "tram"); st = jouer(st, () => 0, null, st.t + 1);
  assert.ok(M.disponible(st, "metro")); assert.ok(st.montees.some(m => m.n === 0 && m.bats.includes("metro")), "arrivée annoncée");
  // Atouts : entretien, intérêts, sondage, catastrophes, usure
  let a = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 32, nivJoueur: 40, sansLimite: true });
  a.tresor = 5000; a.phase = "gestion"; a = M.acheter(a, "parc"); a = M.acheter(a, "police");
  const ent0 = M.entretien(a); a.dette = 1000; const int0 = M.interets(a);
  a = M.acheter(a, "antiGaspi"); assert.ok(M.entretien(a) < ent0, "anti-gaspillage");
  a = M.acheter(a, "caisseCredit"); assert.ok(M.interets(a) < int0 * 0.75, "caisse de crédit");
  const son1 = M.sondage(a); a = M.acheter(a, "cooperative"); assert.ok(M.sondage(a) > son1, "vote");
  a = M.acheter(a, "pompiers"); a = M.acheter(a, "centreCrise"); assert.ok(M.protection(a) >= 0.45);
  // Catastrophe : les dégâts sont réduits d'autant
  const cata = base.liste.find(e => e.cat === "catastrophe" && e.choix[0].e.pop < 0);
  const prot = JSON.parse(JSON.stringify(a)); prot.phase = "evenement"; prot.evenement = cata.id; prot.special = "catastrophe"; prot.evPerso = null;
  const nu = JSON.parse(JSON.stringify(prot)); nu.bat = { parc: 1 };
  const dp = M.choisir(prot, base, 0).resultat.d.pop, dn = M.choisir(nu, base, 0).resultat.d.pop;
  assert.ok(dn < 0 && dp > dn, "protection catastrophe : " + dp + " / " + dn);
  // Administrateur : tout est disponible tout de suite, la partie est marquée
  const adm = M.nouvellePartie({ ligne: "centre", ambitions: [], graine: 33, nivJoueur: 1, sansLimite: true });
  assert.ok(ids.filter(id => !M.BATIMENTS[id].secret && !M.BATIMENTS[id].seance).every(id => M.disponible(adm, id))); assert.ok(adm.triche);
  const off = M.limites(adm, false); assert.ok(!M.disponible(off, "metro")); assert.ok(M.disponible(M.limites(off, true), "metro"));
});

test("enchères : 30 secondes face à une ville voisine, la meilleure offre gagne, prix moyen affiché", () => {
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 40, nivJoueur: 40, sansLimite: true });
  st.tresor = 2000; st.phase = "gestion";
  assert.equal(M.peutAcheter(st, "grandeRoue"), "Aux enchères uniquement."); assert.equal(M.acheter(st, "grandeRoue"), st);
  let gagnees = 0, perdues = 0;
  for (let g = 1; g <= 60; g++) {
    let s = JSON.parse(JSON.stringify(st)); s.rng = g * 977;
    s = M.ouvrirEnchere(s, "grandeRoue");
    const e = s.enchere, B = M.BATIMENTS.grandeRoue;
    assert.equal(e.moyen, B.cout); assert.ok(e.max >= B.cout * 0.8 - 1 && e.max <= B.cout * 1.25 + 1); assert.ok(e.v < e.moyen);
    assert.equal(M.debutTour(s, base), s, "pas de trimestre pendant une enchère");
    assert.equal(M.encherir(s, e.v + 1), s, "il faut dépasser d'au moins un pas");
    // Le joueur monte de pas en pas jusqu'à une limite qu'il s'est fixée
    const limite = Math.round(B.cout * (0.85 + (g % 5) * 0.08));
    while (s.enchere.v >= s.enchere.j && s.enchere.v + s.enchere.pas <= limite) {
      const v0 = s.enchere.v; s = M.encherir(s, v0 + s.enchere.pas);
      assert.ok(s.enchere.v <= s.enchere.max, "la ville voisine ne dépasse jamais son maximum");
    }
    const j = s.enchere.j, v = s.enchere.v, t0 = s.tresor, d0 = s.dette, max = s.enchere.max;
    s = M.finirEnchere(s);
    if (j > v) {
      gagnees++; assert.ok(j >= max, "on ne gagne qu'en dépassant le maximum de la ville voisine");
      assert.equal(s.bat.grandeRoue, 1); assert.equal(Math.round((t0 - d0) - (s.tresor - s.dette)), j, "on paie exactement son offre");
      assert.equal(M.peutEncherir(s, "grandeRoue"), "Déjà à toi.");
    } else {
      perdues++; assert.ok(!s.bat.grandeRoue); assert.equal(s.tresor, t0);
      assert.ok(/4 trimestres/.test(M.peutEncherir(s, "grandeRoue")));
    }
    assert.equal(M.fermerEnchere(s).enchere, null);
  }
  assert.ok(gagnees > 5 && perdues > 5, gagnees + " gagnées / " + perdues + " perdues");
});

test("succès journaliers : 5 défis par jour en pleine partie", () => {
  localStorage.removeItem("maire_profil_v1");
  const J = 20390;                                                // un jour fixe (octobre 2025)
  assert.ok(G.JOURS.length >= 30); assert.equal(new Set(G.JOURS.map(d => d.id)).size, G.JOURS.length);
  const a1 = G.journaliers(J), a2 = G.journaliers(J);
  assert.equal(a1.length, 5); assert.deepEqual(a1, a2, "fixés pour la journée");
  a1.forEach(d => assert.ok(G.JOURS.find(x => x.id === d.id).niv <= 1, "adaptés au niveau du joueur"));
  let P = G.lire(); P.journaliers = { j: J, ids: ["j_ach5", "j_t8", "j_log2", "j_cad3", "j_dos5"], faits: [] }; localStorage.setItem("maire_profil_v1", JSON.stringify(P));
  let st = M.nouvellePartie({ ligne: "centre", ambitions: [], niveau: "facile", xpJoueur: 0, graine: 90, pid: "jour" }); st.phase = "gestion";
  for (const id of ["parc", "logements", "parc", "logements", "parc"]) st = M.acheter(st, id);
  let r = G.suivrePartie(st, M, { jour: J }); st = r.st;
  assert.deepEqual(r.journaliers.map(d => d.id).sort(), ["j_ach5", "j_cad3", "j_log2"]);
  assert.ok(st.xpLog.some(g => /Succès du jour/.test(g.txt)));
  r = G.suivrePartie(st, M, { jour: J }); assert.equal(r.journaliers.length, 0, "pas de double comptage");
  const etat = G.journaliersPartie(st, M); assert.equal(etat.length, 5);
  st = jouer(st, () => 0, s => s, 16); r = G.suivrePartie(st, M, { jour: J }); st = r.st;
  assert.ok(r.parfait, "journée parfaite"); assert.equal(G.lire().parfaites, 1);
  // Sac à dos : un coup de pouce utilisé est retiré du profil et appliqué au départ, jamais pendant le défi du jour
  P = G.lire(); P.sac = { coupDePouce: 2 }; localStorage.setItem("maire_profil_v1", JSON.stringify(P));
  const bo = G.utiliserSac(["coupDePouce"]); assert.equal(bo.tresor, 100); assert.equal(G.lire().sac.coupDePouce, 1);
  const avec = M.nouvellePartie({ ligne: "centre", ambitions: [], niveau: "facile", graine: 92, nivJoueur: 3, bonus: bo });
  assert.equal(avec.tresor, M.PALIERS[0].tresor + 100);
  const defi = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 92, nivJoueur: 8, scenario: M.C.DEFIS_JOUR[0].id, bonus: bo });
  assert.deepEqual(defi.bonus, { tresor: 0, pop: 0, assurance: 0 });
  localStorage.removeItem("maire_profil_v1");
});
test("les 20 paliers du mois : objectifs cumulés d'une partie à l'autre, un bâtiment chacun, remise à zéro le mois suivant", () => {
  localStorage.removeItem("maire_profil_v1");
  const J = 20390;
  assert.equal(G.PALIERS.length, 20); G.PALIERS.forEach(p => assert.ok(M.BATIMENTS[p.bat] && M.BATIMENTS[p.bat].pass, p.bat));
  assert.equal(new Set(G.PALIERS.map(p => p.bat)).size, 20);
  let st = M.nouvellePartie({ maire: "tribun", graine: 5, niveauPartie: true }); st.phase = "gestion"; st.t = 1;
  assert.ok(!M.disponible(st, "bancsConnectes"));
  let r = G.suivrePartie(st, M, { jour: J }); st = r.st;
  assert.equal(G.paliersMois(J).palier, 1, "palier 1 : jouer une partie"); assert.equal(r.pass.length, 1); assert.ok(M.disponible(st, "bancsConnectes"), "le bâtiment arrive tout de suite");
  // Les dossiers s'additionnent d'une partie à l'autre, sans double comptage
  M.stats(st).dossiers = 6; st = G.suivrePartie(st, M, { jour: J }).st; st = G.suivrePartie(st, M, { jour: J }).st;
  let st2 = M.nouvellePartie({ maire: "tribun", graine: 6, niveauPartie: true, passBats: G.batsExclusifs(J) }); st2.phase = "gestion"; st2.t = 1;
  assert.ok(M.disponible(st2, "bancsConnectes"), "disponible dans les parties suivantes du mois");
  M.stats(st2).dossiers = 5; r = G.suivrePartie(st2, M, { jour: J });
  const pm = G.paliersMois(J); assert.equal(pm.paliers[1].cur, 10); assert.ok(pm.paliers[1].ok, "10 dossiers sur deux parties");
  assert.equal(pm.paliers[0].cur, 1, "objectif atteint : le compteur affiché s'arrête au but");
  // Niveau : le meilleur d'une partie
  st2 = r.st; st2.nivJ = 6; st2 = G.suivrePartie(st2, M, { jour: J }).st; assert.ok(G.paliersMois(J).paliers[3].ok);
  // Mois suivant : tout repart de zéro
  assert.equal(G.paliersMois(J + 40).palier, 0); assert.ok(!G.batsExclusifs(J + 40).bancsConnectes);
  localStorage.removeItem("maire_profil_v1");
});

test("engagements : décisions et bâtiments au service des promesses, fidélité à sa ligne et promesses tenues rapportent de l'XP", () => {
  const VERS = { proprete: "cadre", ecologie: "cadre", services: "cadre", logement: "logement", achat: "logement" };
  const ev = base.liste.find(e => !e.cond && e.choix.some(c => c.e && c.e.dom && Object.keys(c.e.dom).some(k => VERS[k] && c.e.dom[k] > 0)));
  const i = ev.choix.findIndex(c => c.e && c.e.dom && Object.keys(c.e.dom).some(k => VERS[k] && c.e.dom[k] > 0));
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 50, nivJoueur: 40 });
  st.phase = "evenement"; st.evenement = ev.id; st.special = null; st.evPerso = null;
  const r = M.choisir(st, base, i);
  const g = r.xpLog.find(x => x.txt === "Mesures pour tes promesses");
  assert.ok(g && g.xp >= M.XP.promesse, JSON.stringify(r.xpLog)); assert.ok(r.resultat.extra.some(t => /Engagement tenu/.test(t)));
  // Plafond par partie
  let s2 = JSON.parse(JSON.stringify(st)); for (let k = 0; k < 60; k++) { s2.phase = "evenement"; s2.evenement = ev.id; s2 = M.choisir(s2, base, i); }
  assert.ok(s2.xpSrc["Mesures pour tes promesses"] <= M.XP.promesseMax);
  // Un bâtiment qui sert une promesse
  st.phase = "gestion"; st.tresor = 1000; const b = M.acheter(st, "parc");
  assert.ok(b.xpLog.some(x => x.txt === "Bâtiments pour tes promesses"));
  assert.ok(!M.acheter(st, "police").xpLog.some(x => x.txt === "Bâtiments pour tes promesses"));
  // Le jour du vote : chaque promesse tenue rapporte
  let e = JSON.parse(JSON.stringify(st)); e.t = M.MANDAT - 1; e.phase = "gestion";
  ["cadre", "logement", "transports", "securite"].forEach(k => { e.piliers[k] = 80; e.base[k] = 80; }); e.pop = 80;
  e = M.debutTour(e, base);
  assert.equal(e.phase, "election"); assert.ok(e.xpLog.some(x => x.txt === "Promesses tenues le jour du vote" && x.xp === 2 * M.XP.promesseTenue));
});

test("addiction : coffre de la victoire, série de jours avec jokers, roue hebdomadaire, ligues avec montée et descente", () => {
  // Coffre de la victoire : à chaque élection gagnée, contenu appliqué tout de suite et révélé ensuite
  const types = new Set();
  for (let g = 1; g <= 40; g++) {
    let e = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 300 + g, nivJoueur: 40 }); e.t = M.MANDAT - 1; e.phase = "gestion";
    ["cadre", "logement", "transports", "securite"].forEach(k => { e.piliers[k] = 85; e.base[k] = 85; }); e.pop = 85;
    const t0 = e.tresor; e = M.debutTour(e, base);
    assert.equal(e.phase, "election"); assert.ok(e.coffre && !e.coffre.vu && e.coffre.mandat === e.mandat, "coffre du nouveau mandat"); types.add(e.coffre.type);
    if (e.coffre.m) assert.ok(e.journal.some(j => j.l === "Coffre de la victoire" && j.m === e.coffre.m));
    assert.ok(M.voirCoffre(e).coffre.vu);
  }
  assert.ok(types.size >= 3, [...types].join());
  // Série de jours : +1 par jour joué, un joker pardonne un jour manqué, sinon on repart à 1
  localStorage.removeItem("maire_profil_v1");
  let st = M.nouvellePartie({ ligne: "centre", ambitions: [], graine: 400, nivJoueur: 3, pid: "serie" }); st.phase = "gestion"; st = M.debutTour(st, base);
  const J = 20500; let r;
  for (let k = 0; k < 7; k++) { r = G.suivrePartie(st, M, { jour: J + k }); st = r.st; assert.equal(r.serie.n, k + 1); }
  assert.ok(G.lire().passBats.statueAssidu, "jour 7 : bâtiment exclusif"); assert.ok(M.disponible(st, "statueAssidu"));
  assert.equal(G.serie(J + 6).jokers, 1);
  r = G.suivrePartie(st, M, { jour: J + 6 }); assert.equal(r.serie, null, "un seul gain par jour");
  r = G.suivrePartie(st, M, { jour: J + 8 }); st = r.st; assert.ok(r.joker); assert.equal(r.serie.n, 8);
  r = G.suivrePartie(st, M, { jour: J + 12 }); st = r.st; assert.equal(r.serie.n, 1, "série perdue");
  assert.equal(G.lire().assidu.max, 8);
  // Roue : un tour par semaine, la récompense est créditée
  const W = 20510, xp0 = G.lire().xp;
  assert.ok(G.roueDispo(W)); const t1 = G.tournerRoue(0.01, W); assert.equal(t1.i, 0); assert.equal(G.lire().xp, xp0 + 50);
  assert.equal(G.tournerRoue(0.5, W + 1), null, "déjà tournée cette semaine");
  const sem2 = W + 7 - ((W + 3) % 7); assert.ok(G.roueDispo(sem2)); assert.ok(G.tournerRoue(0.999, sem2).jackpot);
  // Ligues : 20 % du haut montent, 20 % du bas descendent
  const classe = Array.from({ length: 10 }, (_, k) => "u" + k);
  assert.equal(G.nouvelleLigue(1, classe, "u0"), 2); assert.equal(G.nouvelleLigue(1, classe, "u1"), 2); assert.equal(G.nouvelleLigue(1, classe, "u5"), 1);
  assert.equal(G.nouvelleLigue(1, classe, "u9"), 0); assert.equal(G.nouvelleLigue(4, classe, "u0"), 4); assert.equal(G.nouvelleLigue(0, classe, "u9"), 0);
  let P = G.lire(); const w = G.semaine(J); P.ligue = { tier: 1, w: w - 1 }; localStorage.setItem("maire_profil_v1", JSON.stringify(P));
  const docs = classe.map((id, k) => ({ id, name: id, s: { lgw: w - 1, lg: 1, lgx: 1000 - k * 50 } })).concat([{ id: "u3", name: "u3", s: { lgw: w, lg: 2, lgx: 40 } }]);
  docs[0] = { id: "moi", name: "moi", s: { lgw: w - 1, lg: 1, lgx: 5000 } };
  const L = G.ligue(docs, "moi", J);
  assert.equal(L.tier, 2, "promu"); assert.equal(L.avant.nouveau, 2); assert.ok(L.membres.some(m => m.id === "u3"), "nouveaux voisins de ligue");
  assert.equal(G.donneesLigue(J).lg, 2);
  localStorage.removeItem("maire_profil_v1");
});

test("l'interface sait reprendre une partie de la version actuelle du moteur", () => {
  const v = M.nouvellePartie({ ligne: "centre", ambitions: [], graine: 1, nivJoueur: 1 }).v;
  const src = readFileSync(new URL("../../public/maire/jeu.js", import.meta.url), "utf8");
  const m = src.match(/s\.v >= (\d+) && s\.v <= (\d+)/);
  assert.ok(m && +m[1] <= 3 && +m[2] >= v, "lireSauvegarde n'accepte pas la version " + v);
});

test("plan de Paris : chaque bâtiment a sa place, sans doublon, espacé au début, du centre vers l’extérieur", () => {
  assert.ok(M.C.PLAN.length >= 300);
  assert.equal(new Set(M.C.PLAN.map(p => p.join())).size, M.C.PLAN.length, "emplacements uniques");
  M.C.PLAN.forEach(p => assert.ok(p[0] > 0 && p[0] < 100 && p[1] > 0 && p[1] < 100));
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 600, nivJoueur: 40, sansLimite: true });
  st.tresor = 9000; st.phase = "gestion";
  assert.deepEqual(M.planVille(st), []);
  for (const id of ["parc", "parc", "parc", "police", "tram"]) st = M.acheter(st, id);
  st.bat.grandParc = 1;
  const l = M.planVille(st);
  assert.equal(l.length, 6); assert.equal(new Set(l.map(b => b.x + ":" + b.y)).size, 6);
  assert.deepEqual(l.slice(0, 4).map(b => b.id), ["parc", "police", "tram", "grandParc"], "un exemplaire de chaque d'abord");
  assert.ok(l.find(b => b.id === "grandParc").gros); assert.ok(!l.find(b => b.id === "parc").gros);
  assert.deepEqual([l[0].x, l[0].y], M.C.PLAN[0], "le premier bâtiment est au cœur de Paris");
  for (let a = 0; a < 60; a++) for (let c = a + 1; c < 60; c++) { const P1 = M.C.PLAN[a], P2 = M.C.PLAN[c]; assert.ok(Math.hypot((P1[0] - P2[0]) * 1.5, P1[1] - P2[1]) > 5.5, "les 60 premiers ne se chevauchent pas"); }
  st.bat.parc = 5000; assert.equal(M.planVille(st).length, M.C.PLAN.length, "jamais plus que le plan ne peut en contenir");
});

test("mandats : un dossier tous les 2 ou 3 trimestres, une crise et 3 objectifs tirés à chaque mandat, victoire et fin en vainqueur", () => {
  assert.equal(idx.total, 1000, "base de 1000 dossiers");
  // Rythme : entre deux dossiers ordinaires, 2 ou 3 trimestres
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 700, nivJoueur: 2, niveau: "facile" });
  const quand = [];
  while (st.t < 40 && st.phase !== "fin") {
    if (st.phase === "election") { st = M.continuer(st, base); continue; }
    if (st.phase === "evenement") { if (!st.evPerso && !st.special) quand.push(st.t); st = M.choisir(st, base, 0); continue; }
    st = M.debutTour(st, base);
  }
  assert.ok(quand.length >= st.t / 4 - 1 && quand.length <= st.t / 2 + 1, "dossiers : " + quand.length + " en " + st.t + " trimestres");
  for (let i = 1; i < quand.length; i++) assert.ok(quand[i] - quand[i - 1] >= 2, "écart " + quand.slice(i - 1, i + 1));
  // Crise et objectifs dès le départ
  let m = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 701, nivJoueur: 40 });
  assert.ok(M.C.CRISES[m.crise.id]); assert.equal(m.objectifs.length, 3); assert.ok(m.objectifs[0].crise);
  assert.equal(new Set(m.objectifs.map(o => o.k + (o.p || o.r || ""))).size, 3, "trois objectifs différents");
  for (let g = 0; g < 60; g++) {
    const x = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 800 + g, nivJoueur: 40, niveau: "moyen" });
    M.objectifs(x).forEach(o => assert.ok(o.txt && o.but != null && o.ico, JSON.stringify(o)));
    if (x.crise.id === "dette") assert.ok(x.dette >= 300);
  }
  // Un objectif atteint donne des voix ; à l'élection, 2 objectifs sur 3 = mandat réussi
  m.phase = "gestion"; const vrais = m.objectifs;
  m.objectifs = [{ k: "pop", but: 99, ico: "📣", txt: "t" }]; const s0 = M.sondage(m);
  m.objectifs = [{ k: "pop", but: 10, ico: "📣", txt: "t" }, { k: "pop", but: 10, ico: "📣", txt: "t" }, { k: "pop", but: 99, ico: "📣", txt: "t" }];
  assert.ok(M.sondage(m) >= s0 + 2 * M.P.objVote - 0.5);
  m.t = M.MANDAT - 1; ["cadre", "logement", "transports", "securite"].forEach(k => { m.piliers[k] = 85; m.base[k] = 85; }); m.pop = 85; m.dette = 0;
  const crise1 = m.crise.id; m = M.debutTour(m, base);
  assert.equal(m.phase, "election"); const e = m.elections[0];
  assert.equal(e.nok, 2); assert.ok(e.reussi); assert.ok(!e.parfait); assert.equal(M.stats(m).mandatsReussis, 1);
  assert.ok(m.xpLog.some(g => g.txt === "Mandats réussis"));
  assert.ok(m.crise.id !== crise1, "nouvelle crise au nouveau mandat"); assert.equal(m.objectifs.length, 3);
  // Choisir d'arrêter : fin en vainqueur
  const f = M.retraite(m); assert.equal(f.phase, "fin"); assert.ok(f.fin.gagne); assert.equal(f.fin.raison.type, "retraite");
  const b = M.bilan(f); assert.ok(b.style.titre && b.meilleur && b.meilleur.nok === 2);
  assert.equal(M.retraite(M.nouvellePartie({ ligne: "centre", ambitions: [], graine: 3, nivJoueur: 1 })).phase, "pret", "seulement après une réélection");
});

test("personnages : avantages et défauts réels, déblocage selon le profil", () => {
  const ids = Object.keys(M.C.MAIRES); assert.equal(ids.length, 11);
  ids.forEach(id => { const x = M.C.MAIRES[id]; assert.ok(M.LIGNES[x.ligne] && x.txt && x.bonus && x.slogan, id); assert.equal(x.promesses.length, 2, id); x.promesses.forEach(k => assert.ok(M.PILIERS[k], id)); });
  // Les promesses de campagne sont celles du maire incarné
  assert.deepEqual(M.nouvellePartie({ maire: "tribun", graine: 1, nivJoueur: 40 }).ambitions, ["logement", "cadre"]);
  const p = (maire, o) => M.nouvellePartie(Object.assign({ maire, ligne: "gauche", ambitions: ["cadre", "logement"], graine: 900, nivJoueur: 5, niveau: "facile" }, o || {}));
  const ref = p(null);
  assert.equal(p("gestionnaire").tresor, ref.tresor + 150); assert.equal(p("heritier").tresor, ref.tresor + 400);
  assert.equal(p("ecolo").ligne, "ecologie"); assert.equal(p("tribun").ligne, "gauche");
  const ec = p("ecolo"); ec.phase = "gestion"; ec.tresor = 3000;
  assert.equal(M.prix(ec, "parc"), Math.round(M.BATIMENTS.parc.cout * 0.75)); assert.equal(M.prix(ec, "police"), M.BATIMENTS.police.cout);
  ec.nivJ = 20; ec.sansLimite = true; assert.equal(M.peutAcheter(ec, "parkingRelais"), "Ton personnage refuse de construire ça.");
  const g = p("gestionnaire"); g.dette = 1000; const r0 = p(null); r0.dette = 1000; assert.ok(M.interets(g) < M.interets(r0));
  const ren = p("renard", { nivJoueur: 40 }), r1 = p(null, { nivJoueur: 40 }); assert.equal(ren.opposant.force, Math.max(10, r1.opposant.force - 15));
  const bat = p("batisseuse", { nivJoueur: 40 }); assert.equal(M.coutBat(bat, "grandParc"), Math.round(M.BATIMENTS.grandParc.cout * 0.75));
  // Déblocage
  localStorage.removeItem("maire_profil_v1");
  let L = G.maires(); assert.deepEqual(L.filter(x => x.dispo).map(x => x.id), ["tribun", "gestionnaire"]);
  assert.ok(L.find(x => x.id === "batisseuse").cond.length > 10);
  const P = G.lire(); P.xp = G.xpPour(10); P.succes.chantier1 = 1; P.mandats = 3; localStorage.setItem("maire_profil_v1", JSON.stringify(P));
  L = G.maires(); ["tribun", "ecolo", "star", "batisseuse"].forEach(id => assert.ok(L.find(x => x.id === id).dispo, id));
  ["notable", "emploi", "rer", "renard", "rassembleuse", "heritier"].forEach(id => assert.ok(!L.find(x => x.id === id).dispo, id));
  // Vrais prérequis de carrière : bâtiments construits par catégorie, rivaux éliminés
  P.bats = { police: 5, videoprotection: 3 }; P.elims = 3; localStorage.setItem("maire_profil_v1", JSON.stringify(P));
  L = G.maires(); assert.ok(L.find(x => x.id === "notable").dispo && L.find(x => x.id === "renard").dispo && !L.find(x => x.id === "emploi").dispo);
  assert.ok(/0\/6/.test(L.find(x => x.id === "emploi").cond));
  localStorage.removeItem("maire_profil_v1");
});

test("casino des dossiers : chaque réponse se gagne au blackjack ou à la roulette, sauf la réponse libre", () => {
  // Toujours au moins une réponse libre : « Rien », « Refuser », « Laisser faire »… ou, à défaut, la plus faible
  for (const ev of tous) if (ev.choix && ev.choix.length >= 2) { const l = M.choixLibre(ev); assert.ok(l.length >= 1 && l.length < ev.choix.length || ev.choix.every(c => /^(rien|ne rien|ne pas |refuser|laisser|attendre)/i.test(c.t)), ev.id); }
  // Répartition : poker 20 %, blackjack 40 %, roulette 40 %
  const compte = { bj: 0, roulette: 0, poker: 0 };
  for (let g = 1; g <= 600; g++) {
    let s0 = M.nouvellePartie({ ligne: "centre", ambitions: ["transports", "cadre"], graine: g, nivJoueur: 40 }); s0 = M.debutTour(s0, base);
    if (s0.phase !== "evenement" || s0.evPerso) continue;
    const jx = M.preparerMiniJeu(s0, base).mj.jeux.filter(x => x).map(x => x.jeu);
    jx.forEach(j => compte[j]++);
  }
  const tot = compte.bj + compte.roulette + compte.poker;
  const cible = { poker: 0.2, bj: 0.4, roulette: 0.4 }; Object.keys(compte).forEach(k => assert.ok(Math.abs(compte[k] / tot - cible[k]) < 0.05, JSON.stringify(compte)));
  let vus = { bj: 0, roulette: 0 }, gagnes = 0, perdus = 0;
  for (let g = 1; g <= 400 && (vus.bj < 15 || vus.roulette < 15); g++) {
    let st = M.nouvellePartie({ ligne: "centre", ambitions: ["transports", "cadre"], graine: g, nivJoueur: 40 });
    st = M.debutTour(st, base);
    if (st.phase !== "evenement" || st.evPerso) continue;
    const p = M.preparerMiniJeu(st, base); assert.ok(p.mj, st.evenement);
    const ev = M.evenementCourant(p, base), libres = M.choixLibre(ev);
    libres.forEach(i => assert.equal(M.jeuDe(p, i), null));
    const i = p.mj.jeux.findIndex(x => x && x.jeu !== "poker"); if (i < 0) continue;
    vus[p.mj.jeux[i].jeu]++;
    // Tant que la partie n'est pas gagnée, la réponse est refusée ; la réponse libre reste possible
    assert.deepEqual(M.choisir(p, base, i), p);
    assert.deepEqual(M.preparerMiniJeu(p, base), p);
    assert.equal(M.choisir(p, base, libres[0]).phase, "gestion");
    let q = p;
    if (q.mj.jeux[i].jeu === "roulette") { q = M.mjRoulette(q, i, "rouge"); assert.deepEqual(M.mjRoulette(q, i, "noir"), q); }
    else { q = M.mjBlackjack(q, i, "donner"); for (let k = 0; k < 20 && q.mj.jeux[i].etat === "a_jouer"; k++) { const b = q.mj.jeux[i].bj; q = M.mjBlackjack(q, i, b.fini ? "donner" : M.valeurMain(b.j) < 15 ? "tirer" : "rester"); } }
    const j = q.mj.jeux[i]; assert.ok(j.etat === "gagne" || j.etat === "perdu");
    if (j.etat === "gagne") { gagnes++; assert.ok(q.xp > p.xp); const r = M.choisir(q, base, i); assert.equal(r.phase, "gestion"); assert.equal(r.resultat.i, i); }
    else { perdus++; assert.deepEqual(M.choisir(q, base, i), q); }
  }
  assert.ok(vus.bj >= 15 && vus.roulette >= 15, JSON.stringify(vus));
  assert.ok(gagnes > 5 && perdus > 5, gagnes + " / " + perdus);
});
test("poker contre le bot : 100 jetons, blindes 10/20, jetons conservés, partie jusqu'à ce qu'un joueur n'ait plus rien", () => {
  const P = require("../../public/maire/poker.js");
  for (let g = 1; g <= 60; g++) {
    let t = P.nouvelleTable(g), k = 0;
    assert.equal(t.piles[0] + t.piles[1] + t.main.mises[0] + t.main.mises[1], 200);
    while (!t.fini && k++ < 2000) {
      if (t.main.fini) { t = P.donner(t); continue; }
      const s = t.main.aQui, avant = t; t = s === 0 ? P.agir(t, 0, g % 3 ? "suivre" : "tapis") : P.botAgir(t, 1);
      assert.notDeepEqual(t, avant);
      assert.equal(t.piles[0] + t.piles[1] + (t.main.fini ? 0 : t.main.pot + t.main.mises[0] + t.main.mises[1]), 200);
    }
    assert.ok(t.fini && (t.piles[0] === 200 || t.piles[1] === 200));
  }
  // Dans un dossier : la réponse jouée au poker se gagne en ruinant le bot
  let vus = 0;
  for (let g = 1; g <= 300 && vus < 6; g++) {
    let st = M.nouvellePartie({ ligne: "centre", ambitions: ["transports", "cadre"], graine: g, nivJoueur: 40 });
    st = M.debutTour(st, base); if (st.phase !== "evenement" || st.evPerso) continue;
    st = M.preparerMiniJeu(st, base); const i = st.mj.jeux.findIndex(x => x && x.jeu === "poker"); if (i < 0) continue;
    vus++; st = M.mjPoker(st, i, "commencer");
    for (let k = 0; k < 400 && M.jeuDe(st, i).etat === "a_jouer"; k++) { const t = M.jeuDe(st, i).pk; st = M.mjPoker(st, i, t.main.fini ? "donner" : "tapis"); }
    const j = M.jeuDe(st, i); assert.ok(j.etat === "gagne" || j.etat === "perdu");
    assert.equal(M.choisir(st, base, i).phase === "gestion", j.etat === "gagne");
  }
  assert.ok(vus >= 6);
});
test("habitants : la population suit la tendance électorale et fait varier les impôts", () => {
  let st = M.nouvellePartie({ ligne: "centre", ambitions: ["transports", "cadre"], graine: 3, nivJoueur: 40 });
  assert.equal(st.hab, M.HAB0);
  // Popularité basse : des Parisiens partent chaque trimestre
  let bas = JSON.parse(JSON.stringify(st)); bas.pop = 35; bas.phase = "gestion";
  bas = M.debutTour(bas, base); assert.ok(bas.hab < M.HAB0, "départs sous 50 %");
  // Plus d'habitants, plus d'impôts (dans la limite de ±20 %)
  const plein = JSON.parse(JSON.stringify(st)); plein.hab = M.HAB0 * 1.1;
  assert.ok(M.facteurHab(plein) > M.facteurHab(st));
  plein.hab = M.HAB0 * 2; assert.equal(M.facteurHab(plein), 1.2);
  // Une popularité qui monte au-dessus de 50 % attire des habitants
  let haut = JSON.parse(JSON.stringify(st)); haut.phase = "gestion"; haut.pop = 52; haut.coh = 95; haut.humeur = 30;
  Object.keys(haut.piliers).forEach(k => { haut.piliers[k] = 90; haut.base[k] = 90; });
  // Une ville incohérente (sécurité ou cadre de vie trop bas pour sa population, ou trop de chômage) perd des habitants
  assert.equal(M.besoin(st), 40);
  let inc = JSON.parse(JSON.stringify(st)); inc.phase = "gestion"; inc.pop = 52; inc.piliers.securite = 20; inc.base.securite = 20;
  inc = M.debutTour(inc, base); assert.ok(inc.hab < M.HAB0, "départs : pas assez de sécurité");
  const cho = JSON.parse(JSON.stringify(st)); assert.ok(M.chomage(cho) > 5 && M.chomage(cho) < 10);
  cho.bat = Object.assign({}, cho.bat, { mcdo: 5 }); assert.ok(M.chomage(cho) < M.chomage(st), "les commerces créent des emplois");
  // Sans logements, Paris est plein : personne n'arrive ; avec des logements sociaux, la ville peut grandir
  let plein2 = JSON.parse(JSON.stringify(haut)); plein2 = M.debutTour(plein2, base); assert.ok(plein2.hab <= M.capacite(plein2));
  haut.bat = Object.assign({}, haut.bat, { logements: 3 }); assert.equal(M.capacite(haut), M.HAB0 + 3 * M.LOGE.logements);
  const avant = haut.hab; haut = M.debutTour(haut, base); assert.ok(haut.pop > 52.4 ? haut.hab > avant : true);
});
test("le rival reste le même tant qu'on ne l'a pas battu (renoncement ou victoire écrasante)", () => {
  let gardes = 0, changes = 0;
  for (let g = 1; g <= 40; g++) {
    let st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 3000 + g, nivJoueur: 40 });
    st.phase = "gestion"; st.t = M.MANDAT - 1; st.pop = 50 + (g % 3) * 10; Object.keys(st.piliers).forEach(k => { st.piliers[k] = 60; st.base[k] = 60; });
    const avant = st.opposant.i, actif = st.opposant.actif;
    st = M.debutTour(st, base); if (st.phase !== "election") continue;
    const el = st.elections[st.elections.length - 1]; if (!el.gagne) continue;
    if (actif && el.pct < 60) { assert.equal(st.opposant.i, avant, "même rival"); gardes++; } else { assert.notEqual(st.opposant.i, avant); changes++; }
  }
  assert.ok(gardes > 0, "au moins un rival qui revient");
});
test("sessions : 21 places, on commence en bas, on défie son rival, une place gagnée ou perdue par élection", () => {
  const S = require("../../public/maire/session.js");
  assert.equal(S.ORDRE.length, 20); assert.equal(new Set(S.ORDRE).size, 20);
  for (let p = 1; p < 20; p++) assert.ok(S.habitants(p) >= S.habitants(p - 1), "du moins au plus peuplé");
  assert.equal(S.titre(20), "Maire de Paris"); assert.equal(S.titre(0), "Maire du 1er arrondissement");
  assert.ok(S.puissance(0) < S.puissance(10) && S.puissance(10) < S.puissance(20));
  let s = S.nouvelleSession(42, 0); assert.equal(s.places.length, 21); assert.ok(s.places.every(x => x.type === "bot" && x.ico && x.nom && x.talent > 0), "chaque bot a un nom, une icône et un talent");
  s = S.rejoindre(s, "u1", "Alice", "🙂", 0); assert.equal(S.placeDe(s, "u1"), 0, "on commence en bas");
  s = S.rejoindre(s, "u2", "Bruno", "🙂", 0); assert.equal(S.placeDe(s, "u2"), 1);
  assert.deepEqual(S.rejoindre(s, "u1", "Alice", "🙂", 0), s, "pas deux fois");
  // On n'entre plus à moins de 3 minutes de l'élection ; 15 minutes sans rien faire = remplacé par un bot
  assert.equal(S.placeDe(S.rejoindre(s, "u3", "Tard", "🙂", 4 * 60000), "u3"), -1, "trop près de l'élection");
  assert.equal(S.placeDe(S.rejoindre(s, "u3", "Tôt", "🙂", 3 * 60000), "u3"), 2);
  const afk = S.signaler(s, "u2", { score: 50, actif: 10 * 60000 }, 10 * 60000);
  assert.equal(S.placeDe(S.nettoyer(afk, 20 * 60000), "u1"), 0, "après 15 min : écran d’attente, la place est gardée");
  const net = S.nettoyer(afk, 26 * 60000); assert.equal(S.placeDe(net, "u1"), -1, "Alice inactive depuis 26 min (15 + 10 d’attente)"); assert.equal(S.placeDe(net, "u2"), 1, "Bruno actif il y a 16 min : encore dans l’attente");
  // Les bots évoluent : élan pendant le mandat, forme et expérience qui changent à chaque élection
  { let b = S.nouvelleSession(7, 0); const f0 = b.places.map(x => x.forme), deb = S.scores(b, 1), fin = S.scores(b, S.MANDAT_MS - 1);
    assert.ok(deb.some((v, i) => fin[i] > v) && deb.some((v, i) => fin[i] < v), "des bots montent, d'autres baissent pendant le mandat");
    b = S.elire(b, S.MANDAT_MS); assert.ok(b.places.some((x, i) => x.forme !== f0[i])); assert.ok(b.places.every(x => x.type !== "bot" || x.xp > 0));
    assert.equal(S.resume(b, S.MANDAT_MS).bots, 21); }
  assert.equal(S.note({ score: 50, bon: 50, pop: 50, tresor: 0 }), 1, "une ville moyenne n’a qu’une étoile"); assert.ok(S.note({ score: 80, bon: 80, pop: 80, tresor: 300 }) < 3.5, "4 étoiles se méritent"); assert.equal(S.note({ score: 100, bon: 100, pop: 100, tresor: 900 }), 5);
  assert.equal(S.note({ score: 0, bon: 0, pop: 0, tresor: -900 }), 0.1); assert.ok(S.note({ score: 70, bon: 70, pop: 70, tresor: 0 }) > S.note({ score: 40, bon: 40, pop: 40, tresor: 0 }));
  assert.equal(S.AUTEURS.length, 20); assert.equal(S.AUTEURS[0], "Victor Hugo");
  assert.equal(S.nomLibre(["Émile Zola"]), "Molière"); assert.ok(!/Victor Hugo/.test(S.nomLibre([])), "Victor Hugo reste la session de base");
  const rs = S.resume(S.signaler(s, "u1", { score: 50, niv: 12, actif: 0 }, 0), 60000); assert.equal(rs.joueurs, 2); assert.equal(rs.niv, 12);
  assert.equal(S.placeDe(S.quitter(s, "u1"), "u1"), -1); assert.equal(S.quitter(s, "u1").places[0].type, "bot");
  // Pas d'élection avant 10 minutes, sauf si la moitié des joueurs vote pour des anticipées
  assert.deepEqual(S.elire(s, 60000), s);
  let v = S.voter(s, "u1"); assert.equal(S.nbVotes(v), 1); assert.equal(S.votesRequis(v), 1); assert.ok(S.electionDue(v, 60000));
  // Un vrai classement : un joueur excellent passe devant tous ceux qu'il bat, d'un coup (jusqu'au trône) ; un joueur médiocre reste en bas
  let t = S.signaler(S.signaler(s, "u1", { score: 95 }, S.MANDAT_MS), "u2", { score: 20 }, S.MANDAT_MS);
  t = S.elire(t, S.MANDAT_MS + 1); const r1 = S.resultatDe(t, "u1");
  assert.equal(r1.avant, 0); assert.equal(r1.apres, 20, "du dernier rang au trône en une élection"); assert.equal(r1.vs.filter(v => v.g).length, 20, "il a dépassé tout le monde");
  assert.ok(S.placeDe(t, "u2") <= 1); assert.equal(t.classement.length, 21);
  assert.ok(t.classement.every((c, k) => k === 0 || c.score <= t.classement[k - 1].score), "classé du meilleur score au moins bon");
  // Un joueur moyen se place selon son score parmi les bots
  let m = S.signaler(S.rejoindre(S.nouvelleSession(8, 0), "u3", "Moyen", "🙂", 0), "u3", { score: 58 }, S.MANDAT_MS); m = S.elire(m, S.MANDAT_MS + 1);
  const r3 = S.resultatDe(m, "u3"), plusForts = m.classement.filter(c => c.score > r3.score).length; assert.equal(r3.apres, 20 - plusForts);
  for (let k = 1; k < 4; k++) { t = S.signaler(S.signaler(t, "u1", { score: 95 }, (k + 1) * S.MANDAT_MS), "u2", { score: 20 }, (k + 1) * S.MANDAT_MS); t = S.elire(t, (k + 1) * S.MANDAT_MS + 2); }
  assert.equal(S.placeDe(t, "u1"), 20, "Maire de Paris");
  assert.equal(t.places.filter(x => x.type === "joueur").length, 2, "personne ne disparaît");
  // Fiches comparables pour les bots comme pour les joueurs
  const f = S.fiche(t, 5); assert.ok(f.nom && f.stats && f.titre && f.hab > 0);
});
test("mode session : arrondissement à son échelle, pas d'élection interne, résultat de la session appliqué", () => {
  const S = require("../../public/maire/session.js");
  let st = M.nouvellePartie({ maire: "tribun", graine: 5, nivJoueur: 1 });
  const info = p => ({ id: "s1", place: p, titre: S.titre(p), hab0: S.habitants(p), puissance: S.puissance(p), rival: { nom: "Bernard Morel", ico: "🎩" }, opp: p ? { nom: "Sylvie Roux", ico: "👩" } : null });
  st = M.placer(st, info(0)); assert.equal(st.hab, S.habitants(0)); assert.ok(!st.opposant || !st.opposant.actif, "à la dernière place, personne n'attaque");
  assert.ok(M.capacite(st) < 30000, "logements à l'échelle de l'arrondissement");
  // 60 trimestres sans élection interne
  for (let k = 0; k < 60 && st.phase !== "fin"; k++) st = st.phase === "evenement" ? M.choisir(st, base, M.choixLibre(M.evenementCourant(st, base))[0] || 0) : M.debutTour(st, base);
  assert.equal(st.elections.length, 0); assert.equal(st.mandat, 1);
  const e = M.etatSession(st); assert.ok(e.score > 0 && e.hab > 0);
  // Victoire contre le rival : on monte, la population suit le nouvel arrondissement, l'opposant prend un nom
  const h = st.hab; st = M.electionSession(st, { election: 1, avant: 0, apres: 1, titre: S.titre(1) }); assert.equal(st.mandat, 2); assert.ok(st.elections[0].monte);
  assert.deepEqual(M.electionSession(st, { election: 1, avant: 0, apres: 1 }), st, "pas deux fois");
  st = M.placer(st, info(1)); assert.equal(st.opposant.nom, "Sylvie Roux"); assert.ok(st.opposant.actif); assert.equal(Math.round(st.hab / h * 100), Math.round(S.habitants(1) / S.habitants(0) * 100));
});
test("session : le temps passe tout seul, les dossiers arrivent à la demande", () => {
  const S = require("../../public/maire/session.js");
  let st = M.nouvellePartie({ maire: "tribun", graine: 21, nivJoueur: 1 });
  st = M.placer(st, { id: "s1", place: 3, titre: S.titre(3), hab0: S.habitants(3), puissance: S.puissance(3), rival: { nom: "R", ico: "🎩" }, opp: { nom: "O", ico: "👩" } });
  // Le temps avance sans tirer de dossier
  for (let k = 0; k < 6 && st.phase !== "fin"; k++) { const t0 = st.t; st = M.avancerSession(st, base); assert.equal(st.t, t0 + 1); assert.equal(st.phase, "gestion"); assert.equal(st.evenement, null); }
  // Un dossier à la demande
  st = M.dossierSession(st, base); assert.equal(st.phase, "evenement"); const ev = st.evenement, sp = st.special, t1 = st.t, net = st.tresor - st.dette;
  // Le temps continue pendant le dossier, qui reste en attente
  st = M.avancerSession(st, base); assert.equal(st.t, t1 + 1); assert.equal(st.phase, "evenement"); assert.equal(st.evenement, ev); assert.equal(st.special, sp);
  assert.notEqual(st.tresor - st.dette, net, "recettes et dépenses tombent");
  assert.ok(M.evenementCourant(st, base), "le dossier en attente est toujours là");
  st = M.choisir(st, base, M.choixLibre(M.evenementCourant(st, base))[0] || 0); assert.notEqual(st.phase, "evenement");
  // Résultat pas encore lu : il reste affiché après le passage du temps
  if (st.resultat && !st.resultatVu) { const r = st.resultat; st = M.avancerSession(st, base); assert.deepEqual(st.resultat, r); }
});
test("session : attaques entre voisins, bouclier, ripostes des bots", () => {
  const S = require("../../public/maire/session.js");
  let s = S.nouvelleSession(42, 0); s = S.rejoindre(s, "u1", "Moi", "🙂", 0); const p = S.placeDe(s, "u1");
  assert.equal(p, 0);
  // On ne peut viser que ses voisins
  assert.equal(S.attaquer(s, "u1", 5, "presse", 1000, 0.9), s);
  const sc0 = S.scores(s, 1000)[1];
  let s2 = S.attaquer(s, "u1", 1, "presse", 1000, 0.9); assert.equal(S.malusDe(s2, 1), 2); assert.ok(S.scores(s2, 1000)[1] < sc0);
  assert.equal(S.attaquer(s2, "u1", 1, "presse", 2000, 0.9), s2, "temps de recharge");
  // Dossier compromettant raté : c'est l'attaquant qui perd des points
  let s3 = S.attaquer(s2, "u1", 1, "scandale", 3000, 0.1); assert.equal(S.malusDe(s3, 0), 3); assert.equal(s3.journal.slice(-1)[0].res, "rate");
  // Bouclier : la prochaine attaque est arrêtée
  let t = S.rejoindre(s3, "u2", "Autre", "😎", 0); const q = S.placeDe(t, "u2"); t = S.proteger(t, "u2", 4000);
  assert.equal(q, 1, "u2 arrive juste au-dessus de u1");
  t = S.attaquer(t, "u1", 1, "manif", 5000, 0.9); assert.equal(t.journal.slice(-1)[0].res, "bloque"); assert.equal(S.malusDe(t, 1), 0);
  // Malus plafonné, remis à zéro à l'élection
  let m = s; for (let k = 0; k < 20; k++) m = S.attaquer(m, "u1", 1, "presse", k * 70000, 0.9); assert.equal(S.malusDe(m, 1), 15);
  // Les bots voisins finissent par attaquer
  let r = S.rejoindre(S.nouvelleSession(7, 0), "u1", "Moi", "🙂", 0), vu = 0;
  for (let k = 0; k < 40; k++) { r = S.ripostes(r, "u1", k * 30000, (k * 0.137) % 1); }
  vu = (r.journal || []).filter(e => e.vers && e.vers.uid === "u1").length; assert.ok(vu >= 2, "ripostes : " + vu);
});
test("session : salle des ventes, une vente à la fois toutes les 6 minutes, la suivante annoncée", () => {
  const S = require("../../public/maire/session.js"), cat = M.catalogueVentes();
  assert.equal(cat.ids.length, 35);
  let s = S.nouvelleSession(99, 0); s = S.rejoindre(s, "u1", "Moi", "🙂", 0);
  // Toujours 3 ventes en cours (après les premières minutes), une nouvelle toutes les 2 minutes, chacune dure 6 minutes
  for (let t = 1000; t < 60 * 60000; t += 37000) { const l = S.ventesEnCours(s, cat, t), pro = S.prochaineVente(s, cat, t); assert.equal(l.length, 1); assert.equal(l[0].fin - l[0].debut, 6 * 60000); assert.equal(pro.debut, l[0].fin, "la suivante commence à la fin"); assert.notEqual(pro.id, l[0].id); assert.equal(S.encherir(s, "u1", cat, pro.k, pro.prix + pro.pas * 2, t), s, "pas d'offre avant l'ouverture"); }
  const t0 = 10 * 60000 + 1000, v = S.ventesEnCours(s, cat, t0)[0];
  assert.equal(S.encherir(s, "u1", cat, v.k, v.prix, t0), s, "il faut surenchérir d'au moins un pas");
  const fort = Math.round(v.cout * 1.4);
  let s2 = S.encherir(s, "u1", cat, v.k, fort, t0); const v2 = S.vente(s2, cat, v.k, t0 + 1);
  assert.equal(v2.prix, fort); assert.equal(v2.meneur.uid, "u1", "le bot ne suit pas si cher");
  const fin = S.vente(s2, cat, v.k, v.fin + 1); assert.ok(fin.fini); assert.equal(fin.meneur.uid, "u1");
  assert.ok(S.ventesFinies(s2, cat, v.fin + 3 * 60000).some(x => x.k === v.k));
  // Le moteur construit le bâtiment une seule fois
  let st = M.nouvellePartie({ maire: "tribun", graine: 3, nivJoueur: 1 }); st.phase = "gestion";
  const a = M.gagnerVente(st, fin.id, fin.prix, "s:" + fin.k); assert.equal(a.bat[fin.id], 1); assert.equal(M.gagnerVente(a, fin.id, fin.prix, "s:" + fin.k), a);
  // Une petite offre : le bot surenchérit aussitôt s'il le peut
  const w = S.ventesEnCours(s, cat, t0 + 6 * 60000)[0]; const t1 = t0 + 6 * 60000; const s3 = S.encherir(s, "u1", cat, w.k, w.prix + w.pas, t1); const w3 = S.vente(s3, cat, w.k, t1);
  assert.ok(w3.prix >= w.prix + w.pas);
});
test("session : employés (prix qui monte, effet qui baisse, effets réels)", () => {
  const S = require("../../public/maire/session.js");
  let st = M.nouvellePartie({ maire: "tribun", graine: 8, nivJoueur: 10 });
  assert.ok(M.peutEmbaucher(st, "avocat"), "hors session : pas d'employés");
  st = M.placer(st, { id: "s", place: 4, titre: S.titre(4), hab0: S.habitants(4), puissance: S.puissance(4), rival: { nom: "R", ico: "x" }, opp: { nom: "O", ico: "y" } }); st.phase = "gestion"; st.tresor = 5000;
  assert.equal(Object.keys(M.EMPLOYES).length, 6);
  const p0 = M.prixEmploye(st, "avocat"); st = M.embaucher(st, "avocat"); const p1 = M.prixEmploye(st, "avocat"); assert.ok(p1 > p0, "le prix monte");
  const e1 = M.effetEmp(st, "avocat"); st = M.embaucher(st, "avocat"); const e2 = M.effetEmp(st, "avocat") - e1; assert.ok(e2 < e1 && e2 > 0, "chacun sert un peu moins");
  // Comptable : moins de dépenses ; urbaniste : plus de logements ; policier : la sécurité vise plus haut ; salaires comptés
  const d0 = M.depenses(st), c0 = M.capacite(st), s0 = M.cible(st).securite;
  let a = M.embaucher(st, "comptable"); assert.ok(M.depenses(a) < d0);
  a = M.embaucher(st, "urbaniste"); assert.ok(M.capacite(a) > c0);
  a = M.embaucher(st, "policier"); assert.ok(M.cible(a).securite > s0);
  assert.ok(M.salaires(a) > M.salaires(st));
  // Avocats et attachés de presse dans les attaques de la session
  let s = S.rejoindre(S.rejoindre(S.nouvelleSession(5, 0), "u1", "A", "🙂", 0), "u2", "B", "😎", 0);
  const sansDef = S.attaquer(s, "u1", 1, "manif", 1000, 0.9); const m0 = S.malusDe(sansDef, 1);
  s = S.signaler(s, "u2", { score: 50, def: 0.3 }, 500); s = S.signaler(s, "u1", { score: 50, att: 0 }, 500);
  const avecDef = S.attaquer(s, "u1", 1, "manif", 1000, 0.9); assert.ok(S.malusDe(avecDef, 1) < m0, "l'avocat protège");
  // Agents de propreté : sans eux, les espaces de vie finissent par fermer
  let v = M.placer(M.nouvellePartie({ maire: "tribun", graine: 12, nivJoueur: 30 }), { id: "s", place: 4, titre: "", hab0: S.habitants(4), puissance: 1, rival: null, opp: null });
  v.phase = "gestion"; v.tresor = 50000; v.bat = { parc: 3, fontaines: 3, jardinsPartages: 3 };
  assert.ok(M.proprete(v).manque >= 3);
  for (let k = 0; k < 30; k++) v = M.avancerSession(v, base);
  assert.ok((v.bat.parc || 0) + (v.bat.fontaines || 0) + (v.bat.jardinsPartages || 0) < 9, "des espaces ont fermé");
  let w = M.placer(M.nouvellePartie({ maire: "tribun", graine: 12, nivJoueur: 30 }), { id: "s", place: 4, titre: "", hab0: S.habitants(4), puissance: 1, rival: null, opp: null });
  w.phase = "gestion"; w.tresor = 50000; w.bat = { parc: 3, fontaines: 3, jardinsPartages: 3 }; for (let k = 0; k < 3; k++) w = M.embaucher(w, "proprete");
  assert.equal(M.proprete(w).manque, 0);
  for (let k = 0; k < 30; k++) w = M.avancerSession(w, base);
  assert.equal((w.bat.parc || 0) + (w.bat.fontaines || 0) + (w.bat.jardinsPartages || 0), 9, "bien entretenus, rien ne ferme");
});
test("élections anticipées : à la demande du maire quand ses objectifs sont remplis, 3 trimestres plus tard, sauf si le vote est déjà proche", () => {
  const prep = (t) => { const st = M.nouvellePartie({ ligne: "centre", ambitions: ["cadre", "logement"], graine: 950, nivJoueur: 40 });
    st.phase = "gestion"; st.t = t; st.objectifs = [{ k: "pop", but: 1, ico: "📣", txt: "a" }, { k: "pop", but: 2, ico: "📣", txt: "b" }, { k: "pop", but: 99, ico: "📣", txt: "c" }]; return st; };
  // Plus rien d'automatique : le compte à rebours ne démarre qu'avec le bouton
  let st = M.debutTour(prep(5), base); assert.equal(st.anticipee, null);
  if (st.phase !== "gestion") { st.phase = "gestion"; }
  assert.ok(M.anticipeePossible(st));
  st = M.demanderAnticipee(st); assert.equal(st.anticipee, st.t + 3); assert.equal(M.prochaineElection(st), st.t + 3);
  const fixe = st.anticipee; assert.deepEqual(M.demanderAnticipee(st), st, "une seule demande");
  st = M.debutTour(st, base); assert.equal(st.anticipee, fixe, "la date ne bouge plus");
  while (st.phase !== "election" && st.phase !== "fin" && st.t < 14) st = st.phase === "evenement" ? M.choisir(st, base, 0) : M.debutTour(st, base);
  assert.equal(st.t, fixe, "vote au trimestre annoncé");
  if (st.phase === "election") { assert.equal(st.anticipee, null); assert.equal(st.debutMandat, fixe); assert.equal(M.stats(st).anticipees, 1); }
  // Objectifs pas remplis, ou vote prévu dans moins de 5 trimestres : pas d'anticipées
  const sans = prep(5); sans.objectifs[1].but = 99; assert.ok(!M.anticipeePossible(sans));
  assert.ok(!M.anticipeePossible(prep(M.MANDAT - 4)));
});


test("réglages : modifiables dans l'admin, lus en direct par le moteur et la session, bornés", () => {
  const R = require("../../public/maire/reglages.js"), S = require("../../public/maire/session.js");
  assert.ok(R.LISTE.every(x => x.def >= x.min && x.def <= x.max && x.nom && x.desc), "chaque réglage a un nom, une explication et une valeur par défaut dans ses bornes");
  R.appliquer({ mandatMin: 5, casinoPoker: 100, casinoBj: 0, inconnu: 3, afkMin: 99999 });
  assert.equal(S.MANDAT_MS, 5 * 60000); assert.equal(R.v.afkMin, 120, "borné au maximum"); assert.equal(R.v.inconnu, undefined);
  const st = M.nouvellePartie({ ligne: "centre", ambitions: [], nivJoueur: 1, graine: 3 });
  assert.equal(S.nouvelleSession(1, 0).prochaine, 5 * 60000);
  R.appliquer({});
  assert.equal(S.MANDAT_MS, 6.5 * 60000, "retour aux valeurs d’origine (une élection toutes les 6 min 30)"); assert.ok(st);
});

test("session : une partie de casino dans un dossier ouvert survit au passage d'une saison", () => {
  const S = require("../../public/maire/session.js");
  let st = M.nouvellePartie({ maire: "tribun", graine: 21, niveauPartie: true });
  st = M.placer(st, { id: "s", place: 0, titre: S.titre(0), hab0: S.habitants(0), puissance: S.puissance(0), rival: null, opp: null });
  st.phase = "gestion";
  let essais = 0;
  while (essais++ < 40) { st = M.avancerSession(st, base); st = M.preparerMiniJeu(M.dossierSession(st, base), base); if (st.phase === "evenement" && st.mj && st.mj.jeux.some(Boolean)) break; if (st.phase === "evenement") st = M.choisir(st, base, st.mj ? st.mj.jeux.findIndex(x => !x) : 0); }
  const i = st.mj.jeux.findIndex(Boolean); assert.ok(M.jeuDe(st, i), "une réponse se joue au casino");
  const t0 = st.t; st = M.avancerSession(st, base);
  assert.ok(st.t > t0, "la saison est passée"); assert.ok(M.jeuDe(st, i), "la partie de casino est toujours là");
});

test("session : des dossiers laissés de côté font partir des habitants", () => {
  const S = require("../../public/maire/session.js");
  let st = M.nouvellePartie({ maire: "tribun", graine: 22, niveauPartie: true });
  st = M.placer(st, { id: "s", place: 0, titre: S.titre(0), hab0: S.habitants(0), puissance: S.puissance(0), rival: null, opp: null });
  st.phase = "gestion";
  const h0 = st.hab;
  st = M.dossierNeglige(st); st = M.dossierNeglige(st);
  assert.ok(st.hab < h0, "la population baisse");
  assert.equal(st.neglige.n, 2); assert.equal(st.neglige.perte, h0 - st.hab, "le journal connaît le nombre de départs");
});

function partieSession(graine) {
  const S = require("../../public/maire/session.js");
  let st = M.nouvellePartie({ maire: "tribun", graine, niveauPartie: true, session: true });
  st = M.placer(st, { id: "s", place: 0, titre: S.titre(0), hab0: S.habitants(0), puissance: S.puissance(0), rival: null, opp: null });
  st.phase = "gestion"; return st;
}
test("session : 1er mandat avec 3 objectifs très simples et sans crise", () => {
  const st = partieSession(31), ob = M.objectifs(st);
  assert.equal(ob.length, 3); assert.equal(st.crise, null);
  const k = ob.map(o => o.k).sort().join(","); assert.equal(k, "diversite,dossiers,rayon");
  assert.ok(ob.every(o => o.but <= 2), "cibles minuscules : " + ob.map(o => o.txt).join(" / "));
});
test("session : un bâtiment met des saisons à se construire et n'agit qu'une fois fini", () => {
  let st = partieSession(32); st.tresor = 5000;
  const id = Object.keys(M.BATIMENTS).find(i => { const B = M.BATIMENTS[i]; return !B.projet && !B.enchere && B.cout <= 50 && !M.peutAcheter(st, i); });
  const id2 = Object.keys(M.BATIMENTS).find(i => { const B = M.BATIMENTS[i]; return i !== id && !B.projet && !B.enchere && B.cout > 50 && !M.peutAcheter(st, i); });
  assert.equal(M.dureeTravaux(st, id), 1); assert.ok(M.dureeTravaux(st, id2) >= 2, "les plus chers sont plus longs");
  const t0 = st.tresor; st = M.acheter(st, id);
  assert.ok(st.tresor < t0, "payé tout de suite"); assert.ok(!st.bat[id], "pas encore construit"); assert.ok(!M.peutAcheter(st, id), "le même bâtiment peut être relancé (autre chantier)");
  st = M.avancerSession(st, base);
  assert.equal(st.bat[id], 1, "construit au bout d'une saison"); assert.equal((st.travaux || []).length, 0);
});
test("session : objectifs manqués à l'élection = éliminé ; réussis = nouveaux objectifs", () => {
  let st = partieSession(33); st.t = 10; st.debutMandat = 0;
  const rate = M.electionSession(st, { election: 1, avant: 0, apres: 0 });
  assert.equal(rate.phase, "fin"); assert.equal(rate.fin.raison.type, "objectifs");
  st.objectifs = st.objectifs.map(o => Object.assign({}, o, { but: 0 }));
  const ok2 = M.electionSession(st, { election: 1, avant: 0, apres: 0 });
  assert.notEqual(ok2.phase, "fin"); assert.equal(ok2.mandat, 2); assert.equal(M.objectifs(ok2).length, 3);
  // Les objectifs changent à chaque élection (compteurs remis à zéro)
  st.mandatBats = { logement: 5 }; const ok3 = M.electionSession(st, { election: 1, avant: 0, apres: 0 });
  assert.deepEqual(ok3.mandatBats, {}); assert.ok(M.objectifs(ok3).every(o => o.cur === 0 || o.garde), "nouveaux objectifs, repartis de zéro");
  // Arrivé juste avant le vote : pas jugé (pas éliminé), mais de nouveaux objectifs quand même
  let tard = partieSession(34); tard.t = 2; tard.debutMandat = 0; tard.mandatBats = { cadre: 3 };
  const r = M.electionSession(tard, { election: 1, avant: 0, apres: 0 });
  assert.notEqual(r.phase, "fin"); assert.equal(r.mandat, 1); assert.deepEqual(r.mandatBats, {}); assert.equal(r.debutMandat, 2);
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
      // Un joueur réfléchi vise aussi ses objectifs de mandat (pilier ou rayon à atteindre)
      const vise = (st.objectifs || []).filter(o => !M.objectifs(st).find(e => e.k === o.k && e.ok && e.txt === o.txt));
      let v = 0; for (const k in B.e) v += B.e[k] * Math.max(0, 75 - st.piliers[k]) / 20 * (st.ambitions.includes(k) ? 1.5 : 1) * (vise.some(o => o.k === "pilier" && o.p === k) ? 1.8 : 1);
      if (vise.some(o => o.k === "rayon" && o.r === B.cat)) v *= 1.6;
      // Il lit le Journal de Paris : ce qui comble un besoin des habitants passe en priorité
      const manques = M.etatBesoins(st).filter(b => b.dit).map(b => b.id);
      if (M.BESOINS.some(b => manques.includes(b.id) && b.bats.includes(id))) v = v * 3 + 2;
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
      if (M.anticipeePossible(st)) st = M.demanderAnticipee(st);
      return acheteMalin(st, 150, 1);
    } },
  "dépensier": { choix: (st, ev) => ev.choix.map((c, i) => [valeur(st, c, 0), i]).sort((a, b) => b[0] - a[0])[0][1], gere: st => acheteMalin(st, -3000, 3) },
  // Dépense sans compter, puis accepte toujours le dernier pari (blackjack, mise maximale)
  "flambeur": { choix: (st, ev) => ev.choix.map((c, i) => [valeur(st, c, 0), i]).sort((a, b) => b[0] - a[0])[0][1],
    gere: st => {
      if (st.offre && M.pariMise(st) >= 20) { st = M.bjCommencer(st, M.pariMise(st)); while (st.bj && !st.bj.fini) st = M.valeurMain(st.bj.j) < 17 ? M.bjTirer(st) : M.bjRester(st); }
      return acheteMalin(st, -3000, 3);
    } },
  // Joue comme « réfléchi », mais prend toujours l'argent de l'investisseur quand la ville est en crise
  "assisté": { choix: (st, ev) => ev.choix.map((c, i) => [valeur(st, c, 0), i]).sort((a, b) => b[0] - a[0])[0][1],
    gere: st => { if (st.offre) st = M.financer(st, "investisseur", 1); return acheteMalin(st, -3000, 2); } },
  // Joue comme « réfléchi », mais lance dès que possible les projets démesurés
  "bâtisseur": { choix: (st, ev) => ev.choix.map((c, i) => [valeur(st, c, 1), i]).sort((a, b) => b[0] - a[0])[0][1],
    gere: st => {
      const p = Object.keys(M.BATIMENTS).filter(id => M.BATIMENTS[id].projet && !M.peutAcheter(st, id) && st.tresor > M.BATIMENTS[id].cout * 0.3 + 100);
      if (p.length) st = M.acheter(st, p[0]);
      return STRATS["réfléchi"].gere(st);
    } },
};
function simuler(titre, nivJoueur) {
  console.log(`Simulation ${titre} (joueur de niveau ${nivJoueur}) : ${N} parties par stratégie`);
  const T = {};
  for (const [nom, S] of Object.entries(STRATS)) {
    graineSim = 1; const r = [0, 0, 0, 0]; let mandats = 0, t = 0, fa = 0, ach = 0, sc = 0, tmax = 0, rares = 0, proj = 0, ant = 0, reussis = 0;
    for (let p = 0; p < N; p++) {
      const a = PK.slice().sort(() => alea() - 0.5).slice(0, 2);
      const st = jouer(M.nouvellePartie({ ligne: LIGNES[p % 4], ambitions: a, graine: p * 7919 + 1, nivJoueur }), S.choix, S.gere, 200);
      const w = st.elections.filter(e => e.gagne).length, x = M.stats(st);
      for (let k = 1; k <= 3; k++) if (w >= k) r[k]++;
      mandats += w; t += st.t; ach += x.achats; sc += M.bilan(st).score; ant += x.anticipees || 0; reussis += x.mandatsReussis || 0;
      tmax = Math.max(tmax, x.tresorMax); rares += x.rares + x.legendaires; proj += x.projetsOk;
      if (st.fin && st.fin.raison.type === "faillite") fa++;
    }
    T[nom] = { r1: r[1] / N, r2: r[2] / N, r3: r[3] / N, mandats: mandats / N, faillite: fa / N, tmax };
    const pc = (v) => Math.round(v / N * 100).toString().padStart(3) + " %";
    console.log(`  ${nom.padEnd(10)} réélu 1×/2×/3× ${pc(r[1])} ${pc(r[2])} ${pc(r[3])} · élections ${(mandats / N).toFixed(1)} · mandats réussis ${(reussis / N).toFixed(1)} · anticipées ${(ant / N).toFixed(1)} · ` +
      `durée ${(t / N / 4).toFixed(1)} ans · faillites ${Math.round(fa / N * 100)} % · achats ${Math.round(ach / N)} · projets ${(proj / N).toFixed(1)} · trésor max ${Math.round(tmax)} · score ${Math.round(sc / N)}`);
  }
  return T;
}
const T = { debutant: simuler("d’un débutant", 1), expert: simuler("d’un joueur confirmé", 40) };
const R = T.expert["réfléchi"];
const bornes = [
  ["débutant : en achetant intelligemment, on gagne sa 1re élection (≥ 90 %)", T.debutant["réfléchi"].r1 >= 0.9],
  ["débutant : sans rien acheter, on perd (≤ 20 % de réélection)", T.debutant["passif"].r1 <= 0.2],
  ["confirmé : un joueur réfléchi gagne sa 1re élection (≥ 85 %) et en moyenne plus d’une", R.r1 >= 0.85 && R.mandats >= 1.3],
  ["confirmé : sans rien acheter, on perd (≤ 10 %)", T.expert["passif"].r1 <= 0.1],
  ["chaque mandat est plus dur que le précédent (taux de réélection 1er > 2e > 3e)", R.r1 > R.r2 / Math.max(0.01, R.r1) && R.r2 / Math.max(0.01, R.r1) > R.r3 / Math.max(0.01, R.r2)],
  ["un joueur réfléchi ne gagne pas indéfiniment (moins de 5 élections en moyenne)", R.mandats < 5],
  ["acheter sans compter finit mal : faillite ou défaite avant le 3e mandat (≥ 60 %)", 1 - T.expert["dépensier"].r3 >= 0.6],
  ["dépenser sans compter reste bien moins bon qu'acheter avec réflexion", T.expert["dépensier"].mandats < R.mandats * 0.6],
  ["le dernier pari ne sauve pas une gestion désastreuse (≥ 60 % s'arrêtent avant le 3e mandat)", 1 - T.expert["flambeur"].r3 >= 0.6],
  ["les financements de secours ne remplacent pas une bonne gestion", T.expert["assisté"].mandats < R.mandats],
  ["les projets démesurés sont une stratégie viable (≥ 70 % de 1re réélection)", T.expert["bâtisseur"].r1 >= 0.7],
  ["aucune stratégie ne crée d'argent infini (trésor max < 15 milliards)", Object.values(T).every(x => Object.values(x).every(y => y.tmax < 15000))],
];
let echec = 0;
for (const [t, v] of bornes) { console.log((v ? "  ✓ " : "  ✗ ") + t); if (!v) echec++; }
if (echec) process.exit(1);
