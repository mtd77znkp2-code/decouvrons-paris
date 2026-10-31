// Fonctions Firebase du site : liste des vidéos Instagram pour « Découvre ! ».
// Le jeton Instagram se colle dans l'admin du site (onglet « Mes Reels ») ; il est rangé dans
// Firestore « prive/instagram », illisible pour les visiteurs (voir firestore.rules), puis renouvelé tout seul.
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getVideos } from "./instagram.js";

setGlobalOptions({ region: "europe-west1", maxInstances: 3 });
initializeApp();
const db = getFirestore();

// Même interface que Netlify Blobs : get(clé) / setJSON(clé, valeur), une fiche par clé dans « prive »
const store = {
  get: async (k) => { const s = await db.doc("prive/ig_" + k).get(); return s.exists ? s.data().v : null; },
  setJSON: async (k, v) => { await db.doc("prive/ig_" + k).set({ v }); },
};
async function env() {
  const s = await db.doc("prive/instagram").get();
  return { IG_TOKEN: s.exists ? s.data().token || null : null };
}

// GET /api/insta (voir firebase.json)
export const insta = onRequest(async (req, res) => {
  try {
    const videos = await getVideos(store, await env());
    res.set("Cache-Control", "public, max-age=300, s-maxage=600").json({ videos });
  } catch (e) {
    console.error("Instagram :", e.message);
    res.set("Cache-Control", "no-store").status(503).json({ videos: [], error: "indisponible" });
  }
});

// Tous les jours : renouvelle le jeton si besoin et rafraîchit la liste
export const instaRefresh = onSchedule({ schedule: "every day 05:17", timeZone: "Europe/Paris" }, async () => {
  try {
    const list = await getVideos(store, await env(), fetch, Date.now(), true);
    console.log(`Instagram : ${list.length} vidéos`);
  } catch (e) {
    console.error("Instagram :", e.message);
  }
});

// Grand Tournoi des Maires (Maire de Paris)
export { tournoiOuvrir, tournoiCommencer, tournoiTerminer, tournoiClore } from "./tournoi.js";
