// Test de bout en bout du tournoi sur les émulateurs Firebase : 3 comptes, une session, le vrai serveur.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../functions/index.js", import.meta.url));
const { initializeApp } = require("firebase-admin/app"), { getFirestore } = require("firebase-admin/firestore");
const S = require("../public/maire/session.js"), J = require("../public/maire/tournoi-jeux.js");
const P = "demo-tournoi", FN = `http://127.0.0.1:5001/${P}/europe-west1/`, AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x";
initializeApp({ projectId: P }); const db = getFirestore();
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) process.exitCode = 1; };
async function compte() { const r = await (await fetch(AUTH, { method: "POST", body: JSON.stringify({ returnSecureToken: true }), headers: { "content-type": "application/json" } })).json(); return { uid: r.localId, jeton: r.idToken }; }
async function appel(nom, c, data) { const r = await fetch(FN + nom, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + c.jeton }, body: JSON.stringify({ data }) }); const j = await r.json(); if (j.error) return { erreur: j.error.message }; return j.result; }

const A = await compte(), B = await compte(), C = await compte(), X = await compte();
// Une session dont l'élection est dans 3 min (le tournoi est ouvert)
let s = S.nouvelleSession(12345, Date.now()); s.nom = "Test";
s = S.rejoindre(s, A.uid, "Alice", "👩", Date.now()); s = S.rejoindre(s, B.uid, "Bruno", "🧔", Date.now()); s = S.rejoindre(s, C.uid, "Chloé", "👱", Date.now());
s.prochaine = Date.now() + 3 * 60000;
await db.doc("sessions/sT").set({ etat: JSON.stringify(s), maj: Date.now() });

console.log("1. Tirage commun");
const oa = await appel("tournoiOuvrir", A, { session: "sT" }), ob = await appel("tournoiOuvrir", B, { session: "sT" }), oc = await appel("tournoiOuvrir", C, { session: "sT" });
ok(oa.tournoi && ob.tournoi && oc.tournoi, "les trois joueurs obtiennent le tournoi");
ok(oa.tournoi.jeu === ob.tournoi.jeu && ob.tournoi.jeu === oc.tournoi.jeu, "même épreuve pour tous : " + oa.tournoi.jeu);
ok(oa.tournoi.graine === undefined, "la graine n'est pas visible avant de jouer");
const ox = await appel("tournoiOuvrir", X, { session: "sT" }); ok(!!ox.erreur, "un compte hors de la session est refusé");
const tid = oa.tournoi.id, jeu = oa.tournoi.jeu;

console.log("2. Une seule tentative");
const ca = await appel("tournoiCommencer", A, { tournoi: tid }); ok(!ca.deja && ca.graine && ca.niv === 0, "Alice commence (graine reçue, niveau " + ca.niv + ")");
const ca2 = await appel("tournoiCommencer", A, { tournoi: tid }); ok(ca2.deja && !ca2.graine, "Alice ne peut pas recommencer");
const cb = await appel("tournoiCommencer", B, { tournoi: tid }), cc = await appel("tournoiCommencer", C, { tournoi: tid });
ok(ca.graine === cb.graine, "même partie (même graine) pour tous");

console.log("3. Score vérifié par le serveur");
// Gestes « de joueur » simulés
function jouer(graine) { const s = J.creer(jeu, graine, 0), g = []; let k = 0; while (!s.fin) { const lot = s.f % 6 === 0 ? [{ f: s.f, a: ["tap","feu","bac","elu","saut","glisse","opt","ok","evt","titre"][k++ % 10], x: 180, y: 300, k: k % 4 }] : []; lot.forEach(x => g.push(x)); J.pas(jeu, s, lot); } J.terminer(jeu, s); return { g, score: s.score }; }
const pa = jouer(ca.graine);
const ta = await appel("tournoiTerminer", A, { tournoi: tid, gestes: pa.g });
ok(ta.motif === "trop rapide" && ta.score === 0, "copie rendue trop vite (sans avoir joué 45 s) : 0 point (" + ta.motif + ")");
const ta2 = await appel("tournoiTerminer", A, { tournoi: tid, gestes: pa.g }); ok(ta2.deja, "pas de deuxième copie");
// Bruno : on recule son heure de départ de 46 s comme s'il avait vraiment joué
await db.doc(`tournois/${tid}/parts/${B.uid}`).update({ debut: Date.now() - (J.duree(jeu) * 1000 + 1000) });
const pb = jouer(cb.graine);
const tb = await appel("tournoiTerminer", B, { tournoi: tid, gestes: pb.g });
ok(tb.score === pb.score, "score recalculé par le serveur = score du navigateur (" + tb.score + ")");
const triche = pb.g.concat([{ f: 999999, a: "tap" }]); // gestes falsifiés
await db.doc(`tournois/${tid}/parts/${C.uid}`).update({ debut: Date.now() - (J.duree(jeu) * 1000 + 1000) });
const tc = await appel("tournoiTerminer", C, { tournoi: tid, gestes: triche }); ok(tc.score === 0 && tc.motif === "gestes invalides", "gestes falsifiés refusés");

console.log("4. Clôture");
const k0 = await appel("tournoiClore", A, { tournoi: tid }); ok(!!k0.erreur, "pas de clôture avant l'heure");
await db.doc("tournois/" + tid).update({ cloture: Date.now() - 1000 });
const k1 = await appel("tournoiClore", B, { tournoi: tid }), k2 = await appel("tournoiClore", C, { tournoi: tid });
ok(k1.resultats.length === 21, "21 maires classés");
ok(JSON.stringify(k1.resultats) === JSON.stringify(k2.resultats), "classement figé (deux clôtures identiques)");
const rb = k1.resultats.find(r => r.uid === B.uid); ok(rb && rb.score === tb.score && rb.gain === (rb.rang <= 10 ? 11 - rb.rang : -(rb.rang - 10)), "Bruno : rang " + rb.rang + ", gain " + rb.gain);
ok(k1.resultats.slice(0, 10).every((r, i) => r.gain === 10 - i) && k1.resultats.slice(10).every((r, i) => r.gain === -(i + 1)), "gains : +10 … +1 puis −1 … −11");
const pub = await db.doc("tournois/" + tid).get(); ok(pub.data().etat === "clos" && pub.data().graine === undefined, "tournoi clos, graine jamais publique");
