// Tous les jours : renouvelle le jeton Instagram si besoin et rafraîchit la liste des vidéos,
// pour que tout continue de marcher même si personne ne visite le site pendant un moment.
import { getStore } from "@netlify/blobs";
import { getVideos } from "../lib/instagram.mjs";

export default async () => {
  try {
    const list = await getVideos(getStore("instagram"), process.env, fetch, Date.now(), true);
    console.log(`Instagram : ${list.length} vidéos`);
  } catch (e) {
    console.error("Instagram :", e.message);
  }
};

export const config = { schedule: "@daily" };
