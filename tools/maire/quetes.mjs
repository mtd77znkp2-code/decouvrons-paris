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
const ajout = (k, t, xp, p = {}) => q.push({ k, t, xp: Math.max(10, Math.min(300, Math.round(xp / 5) * 5)), ...p });
const mult = (nmin) => [1, 1.6, 2.4][nmin || 0];
const BATS = { logements: "ensembles de logements sociaux", creche: "crèches", ecole: "écoles", sante: "centres de santé", parc: "parcs",
  velo: "aménagements cyclables", tram: "lignes de tramway", metro: "stations de métro", police: "commissariats", cameras: "réseaux de caméras",
  proprete: "centres de propreté", marche: "marchés couverts", pepiniere: "pépinières d’entreprises", culture: "salles de spectacle", piscine: "piscines",
  bureaux: "tours de bureaux" };
const UN = { logements: "un ensemble de logements sociaux", creche: "une crèche", ecole: "une école", sante: "un centre de santé", parc: "un parc",
  velo: "des pistes cyclables", tram: "une ligne de tramway", metro: "une station de métro", police: "un commissariat", cameras: "des caméras",
  proprete: "un centre de propreté", marche: "un marché couvert", pepiniere: "une pépinière d’entreprises", culture: "une salle de spectacle", piscine: "une piscine",
  bureaux: "une tour de bureaux" };
const PRIX = { logements: 60, creche: 15, ecole: 30, sante: 35, parc: 20, velo: 12, tram: 120, metro: 300, police: 40, cameras: 10, proprete: 25, marche: 25, pepiniere: 50, culture: 60, piscine: 45, bureaux: 30 };

// Élections gagnées
for (const nmin of [0, 1, 2]) for (const n of [1, 2, 3]) ajout("mandats", `Gagne ${n === 1 ? "une élection" : n + " élections"}${NIV[nmin]}.`, 60 * n * mult(nmin), { n, nmin });
for (const [l, nom] of Object.entries(LIGNES)) ajout("mandats", `Gagne une élection avec la ligne ${nom}.`, 70, { n: 1, ligne: l });
for (const [l, nom] of Object.entries(LIGNES)) for (const nmin of [1, 2]) ajout("mandats", `Gagne une élection${NIV[nmin]} avec la ligne ${nom}.`, 70 * mult(nmin), { n: 1, ligne: l, nmin });
for (const [d, dn] of Object.entries(DOMS)) ajout("mandats", `Gagne une élection avec l’ambition « ${dn} ».`, 70, { n: 1, amb: d });
for (const nmin of [0, 1, 2]) for (const n of [2, 3, 4, 5, 6, 8, 10, 12]) ajout("annees", `Reste ${n} ans à l’Hôtel de Ville${NIV[nmin]}.`, (15 + n * 9) * mult(nmin), { n, nmin });
for (const v of [90, 95, 100, 105, 110, 120, 130, 140]) ajout("sieges", `Gagne une élection avec au moins ${v} sièges.`, 50 + (v - 82) * 3, { v });
for (const v of [52, 55, 58, 60, 65]) ajout("voix", `Gagne une élection avec au moins ${v} % des voix.`, 50 + (v - 50) * 8, { v });
for (const n of [12, 15, 18, 20]) ajout("arrGagnes", `Arrive en tête dans au moins ${n} arrondissements à une élection.`, 40 + (n - 10) * 15, { n });
for (const v of [40, 45, 50, 55]) ajout("arrBon", `Gagne une élection sans aucun arrondissement sous ${v} de bonheur.`, 40 + (v - 35) * 7, { v });
// Ville
for (const v of [2150, 2200, 2250, 2300, 2350, 2400, 2450, 2500, 2600, 2700]) ajout("habitants", `Atteins ${(v / 1000).toFixed(2).replace(".", ",").replace(/0$/, "")} millions d’habitants.`, 20 + (v - 2100) * 0.4, { v });
for (const v of [2200, 2300, 2400]) ajout("habitants", `En Réaliste, atteins ${(v / 1000).toFixed(1).replace(".", ",")} millions d’habitants.`, 80 + (v - 2100) * 0.5, { v, nmin: 2 });
// Constructions
for (const [id, nom] of Object.entries(BATS)) for (const n of [1, 3, 5]) {
  ajout("construire", n === 1 ? `Construis ${UN[id]} dans une partie.` : `Construis ${n} ${nom} dans une partie.`, 10 + Math.sqrt(PRIX[id]) * n * 2.5, { b: id, n });
}
for (const n of [10, 20, 30, 50, 75, 100, 150]) ajout("construits", `Construis ${n} bâtiments dans une partie.`, 20 + n * 1.2, { n });
for (const v of [200, 500, 1000, 2000, 3000]) ajout("investi", `Investis ${v >= 1000 ? (v / 1000 + " milliard" + (v >= 2000 ? "s" : "")) : v + " M€"} en constructions dans une partie.`, 25 + v / 20, { v });
for (const n of [5, 8, 10, 12]) ajout("arrComplet", `Construis ${n} bâtiments dans un même arrondissement.`, 20 + n * 8, { n });
for (const n of [1, 2, 3]) ajout("arrPartout", `Construis au moins ${n} bâtiment${n > 1 ? "s" : ""} dans chacun des 20 arrondissements.`, 50 + n * 40, { n });
// Finances
for (const v of [1500, 2000, 2500, 3000, 4000]) ajout("tresor", `Accumule ${(v / 1000).toString().replace(".", ",")} milliard${v >= 2000 ? "s" : ""} en caisse.`, 30 + (v - 1000) / 20, { v });
for (const nmin of [0, 1, 2]) ajout("sansDette", `Gagne une élection${NIV[nmin]} sans jamais emprunter.`, 70 * mult(nmin), { nmin });
for (const v of [200, 500, 800, 1200]) ajout("detteMax", `Gagne une élection sans jamais dépasser ${v} M€ de dette.`, 120 - v / 15, { v });
ajout("taux", "Gagne une élection avec des impôts à 95 % ou moins.", 70, { v: 0.95, max: 1 });
ajout("taux", "Gagne une élection avec des impôts à 90 % ou moins.", 120, { v: 0.9, max: 1 });
ajout("taux", "Gagne une élection avec des impôts à 110 % ou plus.", 60, { v: 1.1 });
for (const v of [300, 500, 800]) ajout("econome", `Gagne une élection en dépensant moins de ${v} M€ sur les dossiers.`, 140 - v / 10, { v });
for (const v of [1000, 2000]) ajout("genereux", `Gagne une élection en dépensant au moins ${v / 1000} milliard${v > 1000 ? "s" : ""} sur les dossiers.`, 40 + v / 40, { v });
// Jauges au moment d'une élection gagnée
for (const v of [50, 55, 60, 65, 70]) { ajout("jauge", `Gagne une élection avec une popularité d’au moins ${v}.`, 30 + (v - 45) * 5, { j: "popu", v }); ajout("jauge", `Gagne une élection avec un bonheur d’au moins ${v}.`, 30 + (v - 45) * 5, { j: "bon", v }); }
for (const v of [60, 70, 80, 90]) ajout("jauge", `Gagne une élection avec une cohérence d’au moins ${v}.`, 30 + (v - 50) * 2, { j: "coh", v });
// Ambitions et domaines
for (const nmin of [0, 1, 2]) for (const [d, dn] of Object.entries(DOMS)) ajout("amb", `Gagne une élection${NIV[nmin]} en tenant l’ambition « ${dn} ».`, 60 * mult(nmin), { d, nmin });
for (const nmin of [0, 1, 2]) ajout("deuxAmb", `Gagne une élection${NIV[nmin]} en tenant tes deux ambitions.`, 90 * mult(nmin), { nmin });
const D = Object.keys(DOMS);
for (let i = 0; i < D.length; i++) for (let k = i + 1; k < D.length; k++)
  ajout("paire", `Gagne une élection en tenant les ambitions « ${DOMS[D[i]]} » et « ${DOMS[D[k]]} ».`, 110, { a: D[i], b: D[k] });
for (const [d, dn] of Object.entries(DOMS)) for (const v of [55, 60, 65, 70, 75]) ajout("dom", `Gagne une élection avec le domaine « ${dn} » à ${v} ou plus.`, 30 + (v - 50) * 5, { d, v });
for (const [d, dn] of Object.entries(DOMS)) ajout("dom", `En Réaliste, gagne une élection avec le domaine « ${dn} » à 60 ou plus.`, 160, { d, v: 60, nmin: 2 });
for (const v of [40, 45, 50, 55]) ajout("domMin", `Gagne une élection sans aucun domaine sous ${v}.`, 40 + (v - 35) * 6, { v });
// Dossiers, catastrophes, chance
for (const [c, cn] of Object.entries(CATS)) for (const n of [5, 10, 15, 20]) ajout("cat", `Traite ${n} dossiers « ${cn} » dans une partie.`, 10 + n * 4, { c, n });
for (const n of [1, 2, 3, 5]) ajout("catastrophes", `Affronte ${n} catastrophe${n > 1 ? "s" : ""} dans une partie.`, 20 + n * 15, { n });
for (const n of [1, 2]) ajout("chance", n === 1 ? "Profite d’un coup de chance." : "Profite de 2 coups de chance dans une partie.", 30 + n * 25, { n });
// Opposant
for (const n of [1, 3, 5, 8]) ajout("opp", `Contre ${n} attaque${n > 1 ? "s" : ""} de tes opposants (campagne ou mobilisation).`, 20 + n * 12, { s: "contre", n });
for (const n of [1, 2, 3]) ajout("opp", `Mobilise ton camp contre l’opposition ${n} fois.`, 20 + n * 15, { s: "mobilise", n });
for (const n of [1, 2, 3]) ajout("opp", `Réussis ${n === 1 ? "une tentative" : n + " tentatives"} pour faire tomber un opposant.`, 30 + n * 35, { s: "nuireOk", n });
for (const n of [1, 2, 3]) ajout("opp", `Pousse ${n === 1 ? "un opposant" : n + " opposants"} à renoncer.`, 50 + n * 50, { s: "elimines", n });
ajout("oppIntact", "Gagne une élection sans qu’aucune attaque de l’opposition ne t’atteigne.", 130);
// Score
for (let v = 600; v <= 3000; v += 100) ajout("score", `Atteins un score d’au moins ${v}.`, 15 + (v - 500) * 0.08, { v });
for (const v of [800, 1000, 1200, 1500]) ajout("score", `En Réaliste, atteins un score d’au moins ${v}.`, 60 + (v - 700) * 0.15, { v, nmin: 2 });
// Fidélité à sa ligne
for (const n of [0, 1, 2, 3]) ajout("fidele", `Gagne une élection en reniant ta ligne ${n ? "au plus " + n + " fois" : "zéro fois"}.`, 110 - n * 20, { n });
for (const [l, nom] of Object.entries(LIGNES)) ajout("fidele", `Avec la ligne ${nom}, gagne une élection sans jamais la renier.`, 110, { n: 0, ligne: l });
const textes = new Set();
for (const x of q) { if (textes.has(x.t)) throw new Error("Quête en double : " + x.t); textes.add(x.t); }
if (q.length !== 400) throw new Error(q.length + " quêtes au lieu de 400");
const liste = q.slice(0, 400).map((x, i) => ({ id: "q" + String(i + 1).padStart(3, "0"), ...x }));
const json = JSON.stringify(liste);
if (process.argv.includes("--verifier")) {
  let actuel = ""; try { actuel = readFileSync(SORTIE, "utf8"); } catch (e) {}
  if (actuel !== json) { console.error("quetes.json n’est pas à jour : lance node tools/maire/quetes.mjs"); process.exit(1); }
  console.log("Quêtes du jour : " + liste.length + " quêtes, fichier à jour.");
} else { writeFileSync(SORTIE, json); console.log(q.length + " quêtes possibles, " + liste.length + " écrites dans public/maire/data/quetes.json"); }
