// GET /api/insta : liste des vidéos Instagram du compte, pour la section « Découvre ! »
import { getStore } from "@netlify/blobs";
import { getVideos } from "../lib/instagram.mjs";

export default async () => {
  try {
    const videos = await getVideos(getStore("instagram"), process.env);
    return Response.json({ videos }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (e) {
    console.error("Instagram :", e.message);
    return Response.json({ videos: [], error: "indisponible" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};

export const config = { path: "/api/insta" };
