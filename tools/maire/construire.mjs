// Maire de Paris : transforme les événements écrits dans tools/maire/sources/*.txt en données du jeu
// (public/maire/data/lot-NNN.json + index.json), après les avoir tous vérifiés.
//   node tools/maire/construire.mjs           construit et affiche le bilan
//   node tools/maire/construire.mjs --verifier vérifie seulement que les données publiées sont à jour (pour la mise en ligne)
// Format des sources : voir tools/maire/LISEZMOI.md
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ICI = path.dirname(new URL(import.meta.url).pathname);
const RACINE = path.resolve(ICI, "../..");
const Maire = require(path.join(RACINE, "public/maire/moteur.js"));
const SOURCES = path.join(ICI, "sources"), SORTIE = path.join(RACINE, "public/maire/data");
const PAR_LOT = 250;
const DOM = Object.keys(Maire.DOMAINES);

// ---------- Lecture du format texte ----------
function effets(txt, ou, err) {
  const e = {};
  for (const tok of txt.trim().split(/\s+/).filter(Boolean)) {
    let m;
    if ((m = tok.match(/^(pop|bon|coh|bud)([+-]\d+(?:\.\d+)?)$/))) e[m[1]] = (e[m[1]] || 0) + Number(m[2]);
    else if ((m = tok.match(/^rec([+-]\d+(?:\.\d+)?)x(\d+)$/))) e.rec = { m: Number(m[1]), n: Number(m[2]) };
    else if ((m = tok.match(/^([a-z]+)([+-]\d+(?:\.\d+)?)$/)) && DOM.includes(m[1])) { e.dom = e.dom || {}; e.dom[m[1]] = Number(m[2]); }
    else err.push(`${ou} : effet illisible « ${tok} »`);
  }
  return e;
}
function alignement(txt, ou, err) {
  const a = {};
  for (const tok of txt.trim().split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^([gcde])([+-]?\d)$/);
    if (m) a[m[1]] = Number(m[2]); else err.push(`${ou} : alignement illisible « ${tok} »`);
  }
  return a;
}
function lireFichier(f, err) {
  const lignes = fs.readFileSync(f, "utf8").replace(/\r/g, "").split("\n");
  const evs = []; let ev = null, ch = null, n = 0;
  const fin = () => { if (ev) { ev.desc = ev.desc.trim(); evs.push(ev); } };
  for (const brut of lignes) {
    n++; const l = brut.trim(), ou = `${path.basename(f)}:${n}`;
    if (!l || l.startsWith("//")) continue;
    let m;
    if ((m = l.match(/^===\s*([^|]+)\|\s*([^|]+)\|\s*(.+)$/))) {
      fin(); ev = { id: m[1].trim(), cat: m[2].trim(), titre: m[3].trim(), desc: "", choix: [] }; ch = null; continue;
    }
    if (!ev) { err.push(`${ou} : texte hors événement`); continue; }
    if ((m = l.match(/^\?\s*(.*)$/)) && !ch) {
      const c = {};
      for (const tok of m[1].split(/\s+/).filter(Boolean)) {
        const k = tok.split("=");
        if (tok === "suite") ev.suiteSeulement = true;
        else if (tok === "distinct") ev.distinct = true;   // titre proche d'un autre, mais sujet différent (vérifié à la main)
        else if (k[0] === "poids") ev.poids = Number(k[1]);
        else if (k[0] === "ligne") c.ligne = k[1].split(",");
        else if (k[0] === "amb" || k[0] === "flag" || k[0] === "sansFlag") c[k[0]] = k[1];
        else if (k.length === 2) c[k[0]] = Number(k[1]);
        else err.push(`${ou} : condition illisible « ${tok} »`);
      }
      if (Object.keys(c).length) ev.cond = c; continue;
    }
    if ((m = l.match(/^([ABC])\)\s*(.+?)\s*::\s*(.+)$/))) {
      ch = { t: m[2], d: m[3], e: {}, r: "" }; ev.choix.push(ch); ch._eff = false; continue;
    }
    if (!ch) { ev.desc += (ev.desc ? " " : "") + l; continue; }
    if ((m = l.match(/^>\s*(.+)$/))) { ch.r += (ch.r ? " " : "") + m[1]; continue; }
    if ((m = l.match(/^~(\d+)\s+(.*?)\s*>\s*(.+)$/))) { ch.alea = { p: Number(m[1]), e: effets(m[2], ou, err), txt: m[3] }; continue; }
    if ((m = l.match(/^\+(\d+)\s+(.*?)\s*>\s*(.+)$/))) { (ch.dif = ch.dif || []).push({ n: Number(m[1]), e: effets(m[2], ou, err), txt: m[3] }); continue; }
    if ((m = l.match(/^=>\s*([a-z]+-\d+)\s*@(\d+)$/))) { ch.suite = { id: m[1], n: Number(m[2]) }; continue; }
    if ((m = l.match(/^!\s*([a-z0-9-]+)$/))) { ch.flag = m[1]; continue; }
    if (!ch._eff) {
      const [ef, al] = l.split("|");
      ch.e = effets(ef, ou, err);
      if (al !== undefined) ch.ali = alignement(al, ou, err);
      ch._eff = true; continue;
    }
    err.push(`${ou} : ligne non comprise « ${l.slice(0, 60)} »`);
  }
  fin();
  evs.forEach((e) => e.choix.forEach((c) => delete c._eff));
  return evs;
}

// ---------- Doublons manifestes ----------
function mots(s) { return new Set(s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 3)); }
function proche(a, b) { let c = 0; for (const w of a) if (b.has(w)) c++; return c / Math.max(1, Math.min(a.size, b.size)); }

// ---------- Construction ----------
const err = [], tous = [];
const fichiers = fs.existsSync(SOURCES) ? fs.readdirSync(SOURCES).filter((f) => f.endsWith(".txt")).sort() : [];
for (const f of fichiers) tous.push(...lireFichier(path.join(SOURCES, f), err));
const vus = {};
for (const ev of tous) { if (vus[ev.id]) err.push(`${ev.id} : identifiant en double`); vus[ev.id] = 1; }
const base = Maire.indexer(tous);
base.rejets.forEach((r) => err.push(...r.err));
// Titres identiques ou descriptions presque identiques = doublon
// Mots vides fréquents des titres, ignorés pour comparer les sujets
const VIDES = new Set(["paris", "ville", "parisien", "parisiens", "parisienne", "dans", "pour", "avec", "sans", "plus", "trop", "veut", "veulent", "menace", "demande", "propose", "proposition", "nouveau", "nouvelle", "grand", "grande", "quartier", "quartiers", "logement", "logements", "sociaux", "social", "sociale", "immeuble", "immeubles", "coutent", "coute", "cher", "chers", "chere", "trop", "faut", "doit", "contre", "sont", "leur", "leurs", "tout", "tous", "toute", "toutes", "elle", "elles", "fait", "font", "piste", "pistes", "cyclable", "cyclables", "ligne", "lignes", "police", "municipale", "municipal", "municipaux", "fenetres", "boites", "libre", "service", "velos", "gratuits", "gratuit", "gratuite"]);
const motsTitre = (t) => new Set([...mots(t)].filter((w) => !VIDES.has(w)));
const sig = base.liste.map((ev) => ({ id: ev.id, t: ev.titre.toLowerCase(), m: mots(ev.titre + " " + ev.desc), mt: motsTitre(ev.titre), libre: !!ev.distinct }));
const lies = (a, b) => [a, b].some((x, k) => base.parId[x].choix.some((c) => c.suite && c.suite.id === [a, b][1 - k]));
base.liste.forEach((ev) => { delete ev.distinct; });
const doublons = new Set();
for (let i = 0; i < sig.length; i++) for (let j = i + 1; j < sig.length; j++) {
  // Même titre, texte presque identique, ou titres qui partagent l'essentiel de leurs mots (même sujet)
  if (sig[i].t === sig[j].t || (sig[i].m.size > 6 && proche(sig[i].m, sig[j].m) > 0.8) ||
    (!sig[i].libre && !sig[j].libre && !lies(sig[i].id, sig[j].id) && sig[i].mt.size >= 2 && sig[j].mt.size >= 2 && proche(sig[i].mt, sig[j].mt) >= 0.66)) { err.push(`${sig[j].id} : trop proche de ${sig[i].id}`); doublons.add(sig[j].id); }
}
const tousValides = base.liste.filter((ev) => !doublons.has(ev.id));
// Catastrophes et coups de chance : un fichier à part, chargé dans toutes les parties
const speciaux = tousValides.filter((ev) => Maire.SPECIAUX[ev.cat]);
const candidats = tousValides.filter((ev) => !Maire.SPECIAUX[ev.cat]);
// ---------- Sélection des 1000 dossiers les plus marquants ----------
// Un dossier tombe tous les 2 ou 3 trimestres : on garde les vrais dilemmes (chaque réponse a un prix, les réponses
// s'opposent) aux effets nets, avec des conséquences qui reviennent plus tard. Chaque catégorie garde la même part.
const MAX_DOSSIERS = 1000;
function valeurChoix(c) {
  const e = c.e || {}, d = e.dom || {};
  return { pop: (e.pop || 0) + (e.bon || 0), argent: (e.bud || 0) / 8 + (e.rec ? e.rec.m * e.rec.n / 8 : 0), ville: Object.values(d).reduce((a, v) => a + v, 0) };
}
function force(ev) {
  const v = ev.choix.map(valeurChoix);
  const ampleur = v.reduce((a, x) => a + Math.abs(x.pop) + Math.abs(x.argent) + Math.abs(x.ville), 0) / v.length;
  // Dilemme : chaque réponse perd quelque chose, et aucune ne domine toutes les autres
  const prix = v.filter((x) => x.pop < 0 || x.argent < 0 || x.ville < 0).length / v.length;
  const domine = v.some((x, i) => v.every((y, j) => i === j || (x.pop >= y.pop && x.argent >= y.argent && x.ville >= y.ville)));
  const ecart = ["pop", "argent", "ville"].reduce((a, k) => a + Math.max(...v.map((x) => x[k])) - Math.min(...v.map((x) => x[k])), 0);
  const suites = ev.choix.reduce((a, c) => a + (c.dif ? c.dif.length : 0) + (c.alea ? 1 : 0) + (c.suite ? 2 : 0), 0);
  return ampleur + ecart * 0.6 + prix * 3 + (domine ? -4 : 2) + suites * 0.8;
}
const cibles0 = new Set(); candidats.forEach((ev) => ev.choix.forEach((c) => { if (c.suite) cibles0.add(c.suite.id); }));
const parCatC = {}; candidats.filter((ev) => !cibles0.has(ev.id)).forEach((ev) => { (parCatC[ev.cat] = parCatC[ev.cat] || []).push(ev); });
const cats = Object.keys(parCatC).sort(), garder = new Set(), suiteDe = (ev) => ev.choix.filter((c) => c.suite && base.parId[c.suite.id]).map((c) => base.parId[c.suite.id]);
const chaine = (ev) => { const l = [ev]; for (let i = 0; i < l.length; i++) suiteDe(l[i]).forEach((x) => { if (!l.includes(x)) l.push(x); }); return l; };
cats.forEach((cat, i) => {
  const quota = Math.floor(MAX_DOSSIERS / cats.length) + (i < MAX_DOSSIERS % cats.length ? 1 : 0);
  let n = 0;
  for (const ev of parCatC[cat].sort((a, b) => force(b) - force(a) || (a.id < b.id ? -1 : 1))) {
    const ch = chaine(ev); if (n + ch.length > quota) continue;
    ch.forEach((x) => garder.add(x.id)); n += ch.length;
  }
});
const valides = candidats.filter((ev) => garder.has(ev.id));
// Une suite doit rester dans le même lot que l'événement qui l'annonce : on garde les chaînes ensemble
const groupes = [], dansGroupe = {}, cibles = new Set();
valides.forEach((ev) => ev.choix.forEach((c) => { if (c.suite) cibles.add(c.suite.id); }));
// On part des événements « racines » (jamais annoncés par un autre), puis on rattrape les éventuels restes
for (const ev of [...valides.filter((e) => !cibles.has(e.id)), ...valides]) {
  if (dansGroupe[ev.id] != null) continue;
  const g = [], file = [ev];
  while (file.length) {
    const x = file.shift(); if (dansGroupe[x.id] != null) continue;
    dansGroupe[x.id] = groupes.length; g.push(x);
    x.choix.forEach((c) => { if (c.suite && base.parId[c.suite.id]) file.push(base.parId[c.suite.id]); });
  }
  groupes.push(g);
}
// Chaque partie ne charge que quelques lots : on les mélange (de façon stable) pour que chaque lot couvre toutes les catégories
const hache = (t) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
groupes.sort((x, y) => hache(x[0].id) - hache(y[0].id));
const lots = []; let lot = [];
for (const g of groupes) { if (lot.length + g.length > PAR_LOT && lot.length) { lots.push(lot); lot = []; } lot.push(...g); }
if (lot.length) lots.push(lot);
const parCat = {}; valides.forEach((ev) => { parCat[ev.cat] = (parCat[ev.cat] || 0) + 1; });
const index = {
  total: valides.length, lots: lots.map((l, i) => ({ f: `lot-${String(i + 1).padStart(3, "0")}.json`, n: l.length })),
  parCat, rejetes: tous.length - tousValides.length, ecartes: candidats.length - valides.length,
  speciaux: { f: "speciaux.json", catastrophe: speciaux.filter((e) => e.cat === "catastrophe").length, chance: speciaux.filter((e) => e.cat === "chance").length }
};
const sorties = { "index.json": JSON.stringify(index), "speciaux.json": JSON.stringify(speciaux) };
lots.forEach((l, i) => { sorties[index.lots[i].f] = JSON.stringify(l); });

console.log(`Événements lus : ${tous.length} · gardés : ${valides.length} sur ${candidats.length} valides (+ ${index.speciaux.catastrophe} catastrophes, ${index.speciaux.chance} coups de chance) · rejetés : ${index.rejetes}`);
console.log("Par catégorie :", Object.entries(parCat).map(([k, v]) => `${Maire.CATS[k]} ${v}`).join(" · "));
if (err.length) { console.log(`\n${err.length} problème(s) :`); err.slice(0, 80).forEach((e) => console.log(" - " + e)); }

if (process.argv.includes("--verifier")) {
  const diff = Object.keys(sorties).filter((f) => !fs.existsSync(path.join(SORTIE, f)) || fs.readFileSync(path.join(SORTIE, f), "utf8") !== sorties[f]);
  if (diff.length || err.length) { console.error(`\nDonnées à reconstruire ou erreurs : ${diff.join(", ") || "voir ci-dessus"}`); process.exit(1); }
  console.log("Données publiées à jour."); process.exit(0);
}
fs.mkdirSync(SORTIE, { recursive: true });
for (const f of fs.readdirSync(SORTIE)) if (/^lot-\d+\.json$/.test(f) && !sorties[f]) fs.unlinkSync(path.join(SORTIE, f));
for (const [f, txt] of Object.entries(sorties)) fs.writeFileSync(path.join(SORTIE, f), txt);
console.log(`\n${lots.length} lot(s) écrit(s) dans public/maire/data.`);
if (err.length) process.exitCode = 1;
