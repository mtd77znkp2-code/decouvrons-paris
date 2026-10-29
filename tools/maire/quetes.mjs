// Génère la base des 400 quêtes du jour de Maire de Paris (public/maire/data/quetes.json).
// Trois quêtes en sont tirées chaque jour (voir public/maire/progression.js).
// Usage : node tools/maire/quetes.mjs [--verifier]   (--verifier : échoue si le fichier publié n'est pas à jour)
import { readFileSync, writeFileSync } from "node:fs";

const SORTIE = new URL("../../public/maire/data/quetes.json", import.meta.url);
const NIV = ["", " en Moyen ou Réaliste", " en Réaliste"];
const LIGNES = { gauche: "Gauche", centre: "Centre", droite: "Droite", ecologie: "Écologie" };
const DOMS = { securite: "Sécurité", proprete: "Propreté", logement: "Logement", transports: "Transports", ecologie: "Écologie",
  achat: "Pouvoir d’achat", economie: "Économie", services: "Services publics" };
const CATS = { finances: "Finances", securite: "Sécurité", proprete: "Propreté", logement: "Logement", transports: "Transports",
  ecologie: "Écologie", economie: "Économie", services: "Services publics", culture: "Culture et tourisme", quotidien: "Vie quotidienne",
  institutions: "Relations institutionnelles", crise: "Crises exceptionnelles" };
const q = [];
// niv : niveau du joueur à partir duquel la quête peut sortir (les mécaniques nécessaires sont débloquées)
const ajout = (k, t, xp, p = {}, niv = 1) => q.push({ k, t, xp: Math.max(10, Math.min(300, Math.round(xp / 5) * 5)), niv, ...p });
const mult = (nmin) => [1, 1.6, 2.4][nmin || 0];
const NIVN = [1, 4, 8];                  // Moyen débloqué au niveau 4, Réaliste au niveau 8
const PIL = { logement: "🏠 Logement", transports: "🚇 Transports", cadre: "🌳 Cadre de vie", securite: "🛡️ Sécurité" };
const FAM = { budget: "💶 Budget", securite: "🛡️ Sécurité", logement: "🏠 Logement", transports: "🚇 Transports", cadre: "🌳 Cadre de vie", politique: "🏛️ Politique", crise: "🚨 Crise" };
const BATS = { parc: ["un parc", "parcs", 40, 1], logements: ["des logements sociaux", "ensembles de logements sociaux", 60, 1], police: ["un commissariat", "commissariats", 50, 1],
  velo: ["des pistes cyclables", "pistes cyclables", 30, 1], ecole: ["une école", "écoles", 70, 4], tram: ["une ligne de tramway", "lignes de tramway", 150, 4],
  proprete: ["une brigade de propreté", "brigades de propreté", 60, 4], marche: ["un marché couvert", "marchés couverts", 80, 4], metro: ["une station de métro", "stations de métro", 350, 8],
  hopital: ["un hôpital", "hôpitaux", 300, 8], quartier: ["un écoquartier", "écoquartiers", 400, 8], musee: ["un grand musée", "grands musées", 250, 8] };

// Élections et durée
for (const nmin of [0, 1, 2]) for (const n of [1, 2, 3, 4]) ajout("mandats", `Gagne ${n === 1 ? "une élection" : n + " élections"}${NIV[nmin]}${n > 1 ? " dans une même partie" : ""}.`, 50 * n * mult(nmin), { n, nmin }, NIVN[nmin]);
for (const [l, nom] of Object.entries(LIGNES)) for (const nmin of [0, 1, 2]) ajout("mandats", `Gagne une élection${NIV[nmin]} avec la ligne ${nom}.`, 70 * mult(nmin), { n: 1, ligne: l, nmin }, Math.max(7, NIVN[nmin]));
for (const nmin of [0, 1, 2]) for (const n of [3, 5, 7, 9, 12, 15, 18, 24]) ajout("annees", `Reste ${n} ans à l’Hôtel de Ville${NIV[nmin]}.`, (10 + n * 7) * mult(nmin), { n, nmin }, NIVN[nmin]);
for (const v of [52, 54, 55, 56, 58, 60, 62, 65, 68, 70]) ajout("voix", `Gagne une élection avec au moins ${v} % des voix.`, 40 + (v - 50) * 9, { v });
// Boutique
for (const [id, [un, des, px, nv]] of Object.entries(BATS)) for (const n of [1, 3, 5]) {
  ajout("achat", n === 1 ? `Achète ${un}.` : `Achète ${n} ${des} dans une partie.`, 10 + Math.sqrt(px) * n * 2.2, { b: id, n }, nv);
}
for (const n of [3, 5, 10, 15, 20, 30, 40, 50, 75, 100]) ajout("achats", `Achète ${n} bâtiments dans une partie.`, 15 + n * 2, { n });
for (const v of [100, 250, 500, 1000, 2000, 3000, 5000]) ajout("investi", `Dépense ${v >= 1000 ? (v / 1000 + " milliard" + (v >= 2000 ? "s" : "")) : v + " M€"} en bâtiments dans une partie.`, 15 + v / 25, { v });
for (const n of [1, 2, 3]) ajout("projets", n === 1 ? "Réalise un grand projet de Paris 2040." : `Réalise ${n} grands projets de Paris 2040 dans une même partie.`, 100 * n, { n }, 10);
// Finances
for (const v of [500, 750, 1000, 1500, 2000, 2500, 3000]) ajout("tresor", `Accumule ${v >= 1000 ? (v / 1000).toString().replace(".", ",") + " milliard" + (v >= 2000 ? "s" : "") : v + " M€"} en caisse.`, 20 + v / 25, { v });
for (const nmin of [0, 1, 2]) ajout("sansDette", `Gagne une élection${NIV[nmin]} sans jamais emprunter.`, 70 * mult(nmin), { nmin }, Math.max(2, NIVN[nmin]));
for (const v of [100, 300, 500, 800]) ajout("detteMax", `Gagne une élection sans jamais dépasser ${v} M€ de dette.`, 120 - v / 10, { v }, 2);
ajout("taux", "Gagne une élection avec des impôts à 95 % ou moins.", 70, { v: 0.95, max: 1 }, 2);
ajout("taux", "Gagne une élection avec des impôts à 90 % ou moins.", 120, { v: 0.9, max: 1 }, 2);
ajout("taux", "Gagne une élection avec des impôts à 110 % ou plus.", 60, { v: 1.1 }, 2);
ajout("taux", "Gagne une élection avec des impôts à 120 % ou plus.", 90, { v: 1.2 }, 2);
// Piliers et jauges au moment d'une élection gagnée
for (const [p, pn] of Object.entries(PIL)) for (const v of [55, 60, 65, 70, 75, 80, 85, 90]) ajout("pilier", `Gagne une élection avec le pilier ${pn} à ${v} ou plus.`, 20 + (v - 50) * 5, { p, v });
for (const [p, pn] of Object.entries(PIL)) for (const nmin of [1, 2]) ajout("pilier", `Gagne une élection${NIV[nmin]} avec le pilier ${pn} à 65 ou plus.`, 90 * mult(nmin), { p, v: 65, nmin }, NIVN[nmin]);
for (const v of [50, 55, 60, 65, 70]) ajout("tousPiliers", `Gagne une élection avec les 4 piliers à ${v} ou plus.`, 40 + (v - 45) * 8, { v });
for (const v of [55, 60, 65, 70, 75, 80]) ajout("jauge", `Gagne une élection avec un bonheur d’au moins ${v}.`, 30 + (v - 50) * 6, { j: "bon", v });
for (const v of [55, 60, 65, 70, 75]) ajout("jauge", `Gagne une élection avec une popularité d’au moins ${v}.`, 30 + (v - 50) * 6, { j: "popu", v });
for (const v of [60, 70, 80, 90]) ajout("jauge", `Gagne une élection avec une cohérence d’au moins ${v}.`, 30 + (v - 50) * 2.5, { j: "coh", v }, 7);
// Promesses
for (const [p, pn] of Object.entries(PIL)) ajout("promesse", `Gagne une élection en tenant ta promesse ${pn}.`, 80, { p }, 6);
for (const nmin of [0, 1, 2]) ajout("deuxPromesses", `Gagne une élection${NIV[nmin]} en tenant tes deux promesses.`, 100 * mult(nmin), { nmin }, Math.max(6, NIVN[nmin]));
// Dossiers par famille
// Un dossier tous les 2 ou 3 trimestres : les objectifs restent atteignables en une partie
for (const [f, fn] of Object.entries(FAM)) for (const n of [1, 2, 3, 4, 5, 6, 7]) ajout("famille", `Traite ${n} dossier${n > 1 ? "s" : ""} ${fn} dans une partie.`, 10 + n * 12, { f, n });
// Catastrophes, chance, opposant
for (const n of [1, 2, 3, 4, 5]) ajout("catastrophes", `Affronte ${n} catastrophe${n > 1 ? "s" : ""} dans une partie.`, 20 + n * 18, { n }, 5);
for (const n of [1, 2, 3]) ajout("chance", n === 1 ? "Profite d’un coup de chance." : `Profite de ${n} coups de chance dans une partie.`, 25 + n * 25, { n }, 5);
for (const n of [1, 2, 3, 5, 8]) ajout("opp", `Contre ${n} attaque${n > 1 ? "s" : ""} de l’opposition.`, 20 + n * 12, { s: "contre", n }, 3);
for (const n of [1, 2, 3]) ajout("opp", `Mobilise ton camp contre l’opposition ${n} fois.`, 25 + n * 15, { s: "mobilise", n }, 7);
for (const n of [1, 2, 3]) ajout("opp", `Réussis ${n === 1 ? "une tentative" : n + " tentatives"} pour faire tomber un opposant.`, 30 + n * 35, { s: "nuireOk", n }, 3);
for (const n of [1, 2, 3]) ajout("opp", `Pousse ${n === 1 ? "un opposant" : n + " opposants"} à renoncer.`, 50 + n * 50, { s: "elimines", n }, 3);
ajout("oppIntact", "Gagne une élection sans qu’aucune attaque de l’opposition ne t’atteigne.", 130, {}, 3);
// Score et fidélité
for (let v = 400; v <= 3000; v += 100) ajout("score", `Atteins un score d’au moins ${v}.`, 15 + (v - 300) * 0.07, { v });
for (const v of [500, 750, 1000, 1500]) ajout("score", `En Réaliste, atteins un score d’au moins ${v}.`, 60 + (v - 400) * 0.12, { v, nmin: 2 }, 8);
for (const n of [0, 1, 2, 3]) ajout("fidele", `Gagne une élection en reniant ta ligne ${n ? "au plus " + n + " fois" : "zéro fois"}.`, 110 - n * 20, { n }, 7);
for (const [l, nom] of Object.entries(LIGNES)) ajout("fidele", `Avec un maire de ligne ${nom}, gagne une élection sans jamais renier cette ligne.`, 110, { n: 0, ligne: l }, 7);
// Compléments
for (const [id, [un, des, px, nv]] of Object.entries(BATS)) if (nv < 8) for (const n of [8, 10]) ajout("achat", `Achète ${n} ${des} dans une partie.`, 10 + Math.sqrt(px) * n * 2, { b: id, n }, nv);
for (const [p, pn] of Object.entries(PIL)) for (const nmin of [1, 2]) for (const v of [70, 75]) ajout("pilier", `Gagne une élection${NIV[nmin]} avec le pilier ${pn} à ${v} ou plus.`, (60 + (v - 65) * 8) * mult(nmin), { p, v, nmin }, NIVN[nmin]);
for (const nmin of [0, 1, 2]) for (const n of [30, 36]) ajout("annees", `Reste ${n} ans à l’Hôtel de Ville${NIV[nmin]}.`, (10 + n * 7) * mult(nmin), { n, nmin }, NIVN[nmin]);
for (const [f, fn] of Object.entries(FAM)) for (const n of [8, 10]) ajout("famille", `Traite ${n} dossiers ${fn} dans une partie.`, 10 + n * 12, { f, n });
for (const nmin of [1, 2]) for (const v of [52, 55, 60]) ajout("voix", `Gagne une élection${NIV[nmin]} avec au moins ${v} % des voix.`, (40 + (v - 50) * 9) * mult(nmin), { v, nmin }, NIVN[nmin]);
for (const nmin of [1, 2]) for (const v of [55, 60]) ajout("tousPiliers", `Gagne une élection${NIV[nmin]} avec les 4 piliers à ${v} ou plus.`, (40 + (v - 45) * 8) * mult(nmin), { v, nmin }, NIVN[nmin]);
for (const v of [55, 60, 65, 70]) { ajout("jauge", `En Réaliste, gagne une élection avec un bonheur d’au moins ${v}.`, (30 + (v - 50) * 6) * 2.4, { j: "bon", v, nmin: 2 }, 8); ajout("jauge", `En Réaliste, gagne une élection avec une popularité d’au moins ${v}.`, (30 + (v - 50) * 6) * 2.4, { j: "popu", v, nmin: 2 }, 8); }
for (const [p, pn] of Object.entries(PIL)) for (const nmin of [1, 2]) ajout("promesse", `Gagne une élection${NIV[nmin]} en tenant ta promesse ${pn}.`, 80 * mult(nmin), { p, nmin }, Math.max(6, NIVN[nmin]));
for (const n of [6, 8]) ajout("catastrophes", `Affronte ${n} catastrophes dans une partie.`, 20 + n * 18, { n }, 5);
for (const n of [12, 15]) ajout("opp", `Contre ${n} attaques de l’opposition.`, 20 + n * 12, { s: "contre", n }, 3);
ajout("opp", "Réussis 4 tentatives pour faire tomber un opposant.", 170, { s: "nuireOk", n: 4 }, 3);
for (const n of [4, 5]) ajout("opp", `Pousse ${n} opposants à renoncer.`, 50 + n * 50, { s: "elimines", n }, 3);
for (let v = 600; v <= 1500; v += 100) ajout("score", `En Moyen ou Réaliste, atteins un score d’au moins ${v}.`, 30 + (v - 400) * 0.1, { v, nmin: 1 }, 4);

const textes = new Set();
for (const x of q) { if (textes.has(x.t)) throw new Error("Quête en double : " + x.t); textes.add(x.t); }
if (q.length < 400) throw new Error("Seulement " + q.length + " quêtes");
const liste = q.slice(0, 400).map((x, i) => ({ id: "q" + String(i + 1).padStart(3, "0"), ...x }));
const json = JSON.stringify(liste);
if (process.argv.includes("--verifier")) {
  let actuel = ""; try { actuel = readFileSync(SORTIE, "utf8"); } catch (e) {}
  if (actuel !== json) { console.error("quetes.json n’est pas à jour : lance node tools/maire/quetes.mjs"); process.exit(1); }
  console.log("Quêtes du jour : " + liste.length + " quêtes, fichier à jour.");
} else { writeFileSync(SORTIE, json); console.log(q.length + " quêtes possibles, " + liste.length + " écrites dans public/maire/data/quetes.json"); }
