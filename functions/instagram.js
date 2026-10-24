// Récupère les vidéos (Reels) du compte Instagram via l'API officielle (Instagram API with Instagram Login).
// Le jeton d'accès vient de la variable d'environnement IG_TOKEN (Netlify), puis il est renouvelé
// automatiquement et rangé dans Netlify Blobs : il expire au bout de 60 jours s'il n'est pas renouvelé.

const API = "https://graph.instagram.com";
const DAY = 24 * 3600 * 1000;
const REFRESH_EVERY = 7 * DAY;
const CACHE_FOR = 30 * 60 * 1000;

export async function getToken(store, env, fetchFn = fetch, now = Date.now()) {
  let saved = await store.get("token", { type: "json" });
  // Un nouveau jeton collé dans Netlify remplace celui qu'on avait rangé
  if (saved && env.IG_TOKEN && saved.source !== env.IG_TOKEN) saved = null;
  const token = (saved && saved.token) || env.IG_TOKEN;
  if (!token) throw new Error("IG_TOKEN manquant");
  if (saved && now - saved.at < REFRESH_EVERY) return token;
  try {
    const r = await fetchFn(`${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    const j = await r.json();
    if (!r.ok || !j.access_token) throw new Error(j.error && j.error.message || "refresh refusé");
    await store.setJSON("token", { token: j.access_token, source: env.IG_TOKEN || null, at: now });
    return j.access_token;
  } catch (e) {
    // Jeton trop récent (moins de 24 h) ou souci passager : on garde l'actuel et on réessaie demain
    await store.setJSON("token", { token, source: env.IG_TOKEN || null, at: now - REFRESH_EVERY + DAY });
    return token;
  }
}

export async function listVideos(token, fetchFn = fetch) {
  const fields = "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,children{media_type,media_url,thumbnail_url}";
  let url = `${API}/me/media?fields=${fields}&limit=50&access_token=${encodeURIComponent(token)}`;
  const out = [];
  // Jusqu'à 1000 publications, pour retrouver aussi les plus anciennes vidéos (numérotées depuis la 1re)
  for (let page = 0; url && page < 20; page++) {
    const r = await fetchFn(url);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error && j.error.message || `Instagram a répondu ${r.status}`);
    for (const m of j.data || []) {
      // Vidéos et carrousels contenant une vidéo. Pour un Reel avec une musique protégée,
      // Instagram ne donne pas le fichier (media_url) : on garde quand même la vidéo, lue avec le lecteur Instagram.
      let v = null;
      if (m.media_type === "VIDEO") v = { src: m.media_url || null, poster: m.thumbnail_url || null, kind: "video" };
      else if (m.media_type === "CAROUSEL_ALBUM") {
        const c = ((m.children && m.children.data) || []).find((x) => x.media_type === "VIDEO");
        if (c) v = { src: c.media_url || null, poster: c.thumbnail_url || null, kind: "carrousel" };
      }
      if (!v) continue;
      out.push({ id: m.id, src: v.src, poster: v.poster, kind: v.kind, link: m.permalink || null, caption: (m.caption || "").slice(0, 140), ts: m.timestamp || null });
    }
    url = j.paging && j.paging.next;
  }
  return out;
}

export async function getVideos(store, env, fetchFn = fetch, now = Date.now(), force = false) {
  const cache = await store.get("videos2", { type: "json" });
  if (!force && cache && now - cache.at < CACHE_FOR) return cache.list;
  const token = await getToken(store, env, fetchFn, now);
  const list = await listVideos(token, fetchFn);
  await store.setJSON("videos2", { at: now, list });
  return list;
}
