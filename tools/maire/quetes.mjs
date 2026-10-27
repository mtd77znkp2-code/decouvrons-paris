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
const ajout = (k, t, xp, p = {}) => q.push({ k, t, xp: Math.round(xp / 5) * 5, ...p });
const mult = (nmin) => [1, 1.6, 2.4][nmin || 0];

// Durée du mandat
for (const nmin of [0, 1, 2]) for (const n of [20, 30, 40, 50, 60, 70, 80, 90])
  ajout("semaine", `Tiens jusqu’à la semaine ${n}${NIV[nmin]}.`, (15 + n * 0.5) * mult(nmin), { n, nmin });
for (const [l, nom] of Object.entries(LIGNES)) for (const n of [25, 50, 75])
  ajout("semaine", `Avec la ligne ${nom}, tiens jusqu’à la semaine ${n}.`, 20 + n * 0.5, { n, ligne: l });
// Victoires
for (const nmin of [0, 1, 2]) ajout("victoire", `Termine un mandat${NIV[nmin]}.`, 50 * mult(nmin), { nmin });
for (const nmin of [0, 1, 2]) for (const [l, nom] of Object.entries(LIGNES))
  ajout("victoire", `Termine un mandat${NIV[nmin]} avec la ligne ${nom}.`, 60 * mult(nmin), { nmin, ligne: l });
for (const [l, nom] of Object.entries(LIGNES)) for (const [d, dn] of Object.entries(DOMS))
  ajout("victoire", `Termine un mandat avec la ligne ${nom} et l’ambition « ${dn} ».`, 60, { ligne: l, amb: d });
// Élection
for (const nmin of [0, 1, 2]) ajout("reelu", `Sois réélu${NIV[nmin]}.`, 70 * mult(nmin), { nmin });
for (const pct of [52, 55, 58, 60, 65]) ajout("reelu", `Sois réélu avec au moins ${pct} % des voix.`, 60 + (pct - 50) * 6, { pct });
for (const [l, nom] of Object.entries(LIGNES)) ajout("reelu", `Sois réélu avec la ligne ${nom}.`, 80, { ligne: l });
for (const [d, dn] of Object.entries(DOMS)) ajout("reelu", `Sois réélu avec l’ambition « ${dn} ».`, 80, { amb: d });
// Finances
for (const v of [100, 200, 300, 400, 500, 600, 800, 1000]) ajout("tresor", `Termine un mandat avec au moins ${v >= 1000 ? "1 milliard" : v + " M€"} en caisse.`, 50 + v / 10, { v });
for (const v of [200, 400]) ajout("tresor", `Termine un mandat en Réaliste avec au moins ${v} M€ en caisse.`, 140 + v / 5, { v, nmin: 2 });
for (const nmin of [0, 1, 2]) ajout("sansDette", `Termine un mandat${NIV[nmin]} sans aucune dette.`, 60 * mult(nmin), { nmin });
for (const v of [100, 200, 300, 400]) ajout("detteMax", `Termine un mandat sans jamais dépasser ${v} M€ de dette.`, 130 - v / 5, { v });
for (const v of [200, 400]) ajout("detteMax", `Termine un mandat en Réaliste sans jamais dépasser ${v} M€ de dette.`, 200 - v / 5, { v, nmin: 2 });
for (const v of [300, 500, 800, 1000, 1500]) ajout("econome", `Termine un mandat en dépensant moins de ${v >= 1000 ? (v / 1000 + " milliard").replace(".", ",") : v + " M€"} en décisions.`, 150 - v / 15, { v });
for (const v of [1000, 1500, 2000]) ajout("genereux", `Termine un mandat en dépensant au moins ${(v / 1000 + " milliard").replace(".", ",")} en décisions.`, 40 + v / 25, { v });
// Jauges
const J = { pop: "une popularité", bon: "un bonheur", coh: "une cohérence" };
for (const v of [45, 50, 55, 60, 65, 70]) { ajout("jauge", `Termine un mandat avec ${J.pop} d’au moins ${v}.`, 30 + (v - 40) * 3, { j: "pop", v }); ajout("jauge", `Termine un mandat avec ${J.bon} d’au moins ${v}.`, 30 + (v - 40) * 3, { j: "bon", v }); }
for (const v of [50, 60, 70, 80, 90]) ajout("jauge", `Termine un mandat avec ${J.coh} d’au moins ${v}.`, 30 + (v - 40) * 1.5, { j: "coh", v });
for (const v of [50, 55, 60]) { ajout("jauge", `En Réaliste, termine avec ${J.pop} d’au moins ${v}.`, 100 + (v - 50) * 6, { j: "pop", v, nmin: 2 }); ajout("jauge", `En Réaliste, termine avec ${J.bon} d’au moins ${v}.`, 100 + (v - 50) * 6, { j: "bon", v, nmin: 2 }); }
for (const [l, nom] of Object.entries(LIGNES)) ajout("jauge", `Avec la ligne ${nom}, termine avec une cohérence d’au moins 70.`, 70, { j: "coh", v: 70, ligne: l });
for (const v of [35, 40, 45]) { ajout("jaugeMin", `Termine un mandat sans que ta popularité passe sous ${v}.`, 40 + (v - 30) * 6, { j: "pop", v }); ajout("jaugeMin", `Termine un mandat sans que le bonheur passe sous ${v}.`, 40 + (v - 30) * 6, { j: "bon", v }); }
// Ambitions et domaines
for (const nmin of [0, 1, 2]) for (const [d, dn] of Object.entries(DOMS)) ajout("amb", `Tiens l’ambition « ${dn} »${NIV[nmin]}.`, 60 * mult(nmin), { d, nmin });
for (const nmin of [0, 1, 2]) ajout("deuxAmb", `Tiens tes deux ambitions${NIV[nmin]}.`, 90 * mult(nmin), { nmin });
const D = Object.keys(DOMS);
for (let i = 0; i < D.length; i++) for (let k = i + 1; k < D.length; k++)
  ajout("paire", `Tiens à la fois les ambitions « ${DOMS[D[i]]} » et « ${DOMS[D[k]]} ».`, 110, { a: D[i], b: D[k] });
for (const [d, dn] of Object.entries(DOMS)) for (const v of [50, 55, 60, 65, 70, 75]) ajout("dom", `Termine un mandat avec le domaine « ${dn} » à ${v} ou plus.`, 30 + (v - 45) * 4, { d, v });
for (const [d, dn] of Object.entries(DOMS)) ajout("dom", `En Réaliste, termine avec le domaine « ${dn} » à 55 ou plus.`, 150, { d, v: 55, nmin: 2 });
for (const v of [30, 35, 40, 45]) ajout("domMin", `Termine un mandat sans aucun domaine sous ${v}.`, 40 + (v - 25) * 5, { v });
// Dossiers traités
for (const [c, cn] of Object.entries(CATS)) for (const n of [6, 8, 10, 12, 14]) ajout("cat", `Traite au moins ${n} dossiers « ${cn} » dans une partie.`, 15 + n * 3, { c, n });
// Catastrophes, chance
for (const n of [1, 2, 3]) ajout("catastrophes", `Affronte ${n} catastrophe${n > 1 ? "s" : ""} dans une partie.`, 20 + n * 15, { n });
ajout("catastrophes", "Termine un mandat après avoir affronté 4 catastrophes.", 200, { n: 4, gagne: 1 });
ajout("chance", "Profite d’un coup de chance.", 40);
ajout("chance", "Profite d’un coup de chance et termine ton mandat.", 80, { gagne: 1 });
// Opposant
for (const n of [1, 2, 3, 4]) ajout("opp", `Contre ${n} attaque${n > 1 ? "s" : ""} de ton opposant (campagne ou mobilisation).`, 20 + n * 15, { s: "contre", n });
for (const n of [1, 2, 3]) ajout("opp", `Mobilise ton camp contre ton opposant ${n} fois.`, 20 + n * 15, { s: "mobilise", n });
for (const n of [1, 2]) ajout("opp", `Réussis ${n === 1 ? "une tentative" : "deux tentatives"} pour faire tomber ton opposant.`, 40 + n * 40, { s: "nuireOk", n });
for (const nmin of [0, 1, 2]) ajout("oppElim", `Pousse ton opposant à abandonner${NIV[nmin]}.`, 80 * mult(nmin), { nmin });
for (const avant of [40, 60]) ajout("oppElim", `Pousse ton opposant à abandonner avant la semaine ${avant}.`, 220 - avant * 2, { avant });
ajout("oppIntact", "Termine un mandat sans qu’aucune attaque de ton opposant ne t’atteigne.", 130);
for (const v of [50, 60, 70, 80]) ajout("oppForce", `Termine un mandat face à un opposant parti avec une influence d’au moins ${v}.`, 40 + (v - 40) * 3, { v });
// Score
for (let v = 150; v <= 380; v += 10) ajout("score", `Atteins un score d’au moins ${v}.`, 20 + (v - 150) * 0.6, { v });
for (const v of [200, 225, 250, 275, 300]) ajout("score", `En Réaliste, atteins un score d’au moins ${v}.`, 100 + (v - 200) * 1.2, { v, nmin: 2 });
// Fidélité à sa ligne
for (const n of [0, 1, 2, 3]) ajout("fidele", `Termine un mandat en reniant ta ligne ${n ? "au plus " + n + " fois" : "zéro fois"}.`, 110 - n * 20, { n });
for (const [l, nom] of Object.entries(LIGNES)) ajout("fidele", `Avec la ligne ${nom}, termine un mandat sans jamais la renier.`, 110, { n: 0, ligne: l });

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
