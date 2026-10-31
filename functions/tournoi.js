// Grand Tournoi des Maires : la partie serveur (seule autorisée à écrire dans « tournois »).
// - tournoiOuvrir   : crée le tournoi de la session (tirage de l'épreuve par le serveur, une seule fois)
// - tournoiCommencer: ouvre la tentative unique du joueur (l'heure de départ est celle du serveur)
// - tournoiTerminer : reçoit les gestes du joueur, REJOUE la partie et calcule le score lui-même
// - tournoiClore    : à la clôture, fige le classement et les gains de popularité (une seule fois)
// Les règles et les mini-jeux sont les mêmes fichiers que dans le navigateur (copiés dans ./partage au déploiement).
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "node:module";
import { randomInt } from "node:crypto";

const require = createRequire(import.meta.url);
const R = require("./partage/reglages.js");
const S = require("./partage/session.js");
const J = require("./partage/tournoi-jeux.js");
const TR = require("./partage/tournoi-regles.js");

const db = () => getFirestore();
const OPT = { region: "europe-west1", maxInstances: 5 };   // comme les autres fonctions du site
const LIMITE = 45 * 1000;          // durée d'une épreuve
const MARGE = 20 * 1000;           // délai de réseau accepté pour rendre sa copie

function lireSession(d) { try { return JSON.parse(d.data().etat); } catch (e) { return null; } }
async function reglages() { const c = await db().doc("config/maire").get(); R.appliquer(c.exists ? c.data() : {}); }
function connecte(req) { if (!req.auth || !req.auth.uid) throw new HttpsError("unauthenticated", "Connexion requise."); return req.auth.uid; }

// Ouvre (ou renvoie) le tournoi du mandat en cours de la session
export const tournoiOuvrir = onCall(OPT, async (req) => {
  const uid = connecte(req), sid = String((req.data || {}).session || "");
  if (!sid || sid.length > 60) throw new HttpsError("invalid-argument", "Session inconnue.");
  await reglages();
  const sd = await db().doc("sessions/" + sid).get();
  const s = sd.exists ? lireSession(sd) : null;
  if (!s) throw new HttpsError("not-found", "Session inconnue.");
  if (S.placeDe(s, uid) < 0) throw new HttpsError("permission-denied", "Tu ne fais pas partie de cette session.");
  const maintenant = Date.now(), f = TR.fenetre(s), tid = TR.idTournoi(sid, f.election), ref = db().doc("tournois/" + tid);
  const res = await db().runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (d.exists) return d.data();
    if (!TR.ouvert(s, maintenant)) return null;
    // Le tirage : une seule fois, par le serveur, pour toute la session
    const t = { session: sid, election: f.election, jeu: J.IDS[randomInt(J.IDS.length)],
      ouverture: Math.max(f.ouverture, maintenant - 5000), cloture: f.cloture, etat: "ouvert", cree: maintenant };
    tx.create(ref, t);
    // La graine de l'épreuve reste secrète (illisible depuis le site) : elle n'est donnée qu'au départ de la tentative
    tx.create(db().doc("prive/tg_" + tid), { graine: randomInt(1, 2147483647) });
    return t;
  });
  return { tournoi: res ? Object.assign({ id: tid }, res) : null, maintenant };
});

// La tentative unique : le serveur note l'heure de départ ; recharger la page ne permet pas de recommencer
export const tournoiCommencer = onCall(OPT, async (req) => {
  const uid = connecte(req), tid = String((req.data || {}).tournoi || "");
  const tref = db().doc("tournois/" + tid), pref = tref.collection("parts").doc(uid);
  const maintenant = Date.now();
  return db().runTransaction(async (tx) => {
    const td = await tx.get(tref); if (!td.exists) throw new HttpsError("not-found", "Tournoi inconnu.");
    const t = td.data();
    if (t.etat !== "ouvert" || maintenant >= t.cloture) throw new HttpsError("failed-precondition", "Le tournoi est clos.");
    const sd = await tx.get(db().doc("sessions/" + t.session)), s = sd.exists ? lireSession(sd) : null;
    const place = s ? S.placeDe(s, uid) : -1;
    if (place < 0) throw new HttpsError("permission-denied", "Tu ne fais pas partie de cette session.");
    const pd = await tx.get(pref), gd = await tx.get(db().doc("prive/tg_" + tid));
    if (pd.exists) return { deja: true, part: pd.data(), maintenant };
    const x = s.places[place];
    const part = { uid, nom: String(x.nom || "Un maire").slice(0, 24), ico: String(x.ico || "🙂").slice(0, 8), place, court: S.court(place), debut: maintenant, statut: "en_cours", score: 0 };
    tx.create(pref, part);
    return { deja: false, part, jeu: t.jeu, graine: gd.data().graine, maintenant };
  });
});

// Fin de l'épreuve : le score est recalculé par le serveur à partir des gestes
export const tournoiTerminer = onCall(OPT, async (req) => {
  const uid = connecte(req), d = req.data || {}, tid = String(d.tournoi || "");
  const tref = db().doc("tournois/" + tid), pref = tref.collection("parts").doc(uid);
  const maintenant = Date.now();
  const gestes = J.nettoyer(d.gestes);
  return db().runTransaction(async (tx) => {
    const td = await tx.get(tref), pd = await tx.get(pref), gd = await tx.get(db().doc("prive/tg_" + tid));
    if (!td.exists || !pd.exists || !gd.exists) throw new HttpsError("not-found", "Tentative inconnue.");
    const t = td.data(), p = pd.data(), graine = gd.data().graine;
    if (p.statut !== "en_cours") return { score: p.score, deja: true };
    const ecoule = maintenant - p.debut;
    let score = 0, motif = "";
    if (!gestes) motif = "gestes invalides";
    else if (maintenant > t.cloture + MARGE || ecoule > LIMITE + MARGE) motif = "trop tard";
    else {
      const r = J.rejouer(t.jeu, graine, gestes);
      // Impossible de finir plus vite que le temps de jeu réellement écoulé (moins 3 s de tolérance)
      if (ecoule < r.images / J.FPS * 1000 - 3000) motif = "trop rapide";
      else score = r.score;
    }
    tx.update(pref, { statut: "fini", score, fin: maintenant, gestes: gestes ? gestes.length : 0, motif: motif || null });
    return { score, motif: motif || null };
  });
});

// Clôture : classement définitif et gains, une seule fois (n'importe quel joueur de la session peut la déclencher, le serveur vérifie l'heure)
export const tournoiClore = onCall(OPT, async (req) => {
  connecte(req);
  const tid = String((req.data || {}).tournoi || ""), tref = db().doc("tournois/" + tid), maintenant = Date.now();
  return db().runTransaction(async (tx) => {
    const td = await tx.get(tref); if (!td.exists) throw new HttpsError("not-found", "Tournoi inconnu.");
    const t = td.data(), parts = await tx.get(tref.collection("parts"));
    if (t.etat === "clos") return { resultats: t.resultats };
    const sd = await tx.get(db().doc("sessions/" + t.session)), s = sd.exists ? lireSession(sd) : null;
    if (!s) throw new HttpsError("not-found", "Session disparue.");
    if (maintenant < t.cloture && (s.election || 0) < t.election) throw new HttpsError("failed-precondition", "Le tournoi n'est pas encore clos.");
    const p = {};
    parts.forEach((d) => {
      const x = d.data();
      // Partie abandonnée en route : elle compte avec 0 point
      p[d.id] = { score: x.statut === "fini" ? x.score : 0, fin: x.fin || x.debut, statut: "fini" };
    });
    const resultats = TR.classement(Object.assign({ id: tid }, t), s, p);
    tx.update(tref, { etat: "clos", resultats, clos: maintenant });
    return { resultats };
  });
});
