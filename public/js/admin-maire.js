// Administration du Maire de Paris : deux onglets à part du tableau général.
// - « Réglages du jeu » : tous les chiffres d'équilibrage (maire/reglages.js), enregistrés dans config/maire,
//   + un mode test qui n'accélère que cet appareil, + des boutons de test sur la partie ouverte.
// - « Statistiques » : calculées à partir des fiches de parties des JOUEURS (stats_parties ; les bots n'en ont pas)
//   et des votes sur les dossiers (votes/{dossier}).
(function () {
  "use strict";
  var R = function () { return window.MaireReglages; };
  var CATS = { finances: "💶 Finances", economie: "📈 Économie", securite: "🛡️ Sécurité", logement: "🏠 Logement", transports: "🚇 Transports",
    proprete: "🧹 Propreté", ecologie: "🌱 Écologie", services: "🏥 Services publics", culture: "🎭 Culture et tourisme", quotidien: "☕ Vie quotidienne",
    institutions: "🏛️ Relations institutionnelles", crise: "🚨 Crises", catastrophe: "🌋 Catastrophes", chance: "🍀 Coups de chance", opposition: "⚔️ Opposition" };
  var RAISONS = { election: "🗳️ Battu à une élection", faillite: "💸 Faillite", demission: "🚪 Démission", retraite: "🏖️ Retraite (fin)", defi: "🎯 Défi du jour" };
  var JEUX = { poker: "♠️ Poker", bj: "🃏 Blackjack", roulette: "🎡 Roulette" };

  function h(t, c, x) { return el(t, c, x); }
  function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function btn(txt, cls, f) { var b = h("button", cls || "btn", txt); b.type = "button"; b.onclick = f; return b; }
  function pct(a, b) { return b ? Math.round(a / b * 100) + " %" : "—"; }
  function moy(l, f) { var v = l.map(f).filter(function (x) { return typeof x === "number" && isFinite(x); }); return v.length ? v.reduce(function (a, x) { return a + x; }, 0) / v.length : null; }
  function f1(n) { return n == null ? "—" : (Math.round(n * 10) / 10).toLocaleString("fr-FR"); }
  function f0(n) { return n == null ? "—" : Math.round(n).toLocaleString("fr-FR"); }
  function duree(ms) { if (ms == null) return "—"; var m = Math.round(ms / 60000); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min"; }
  function competence(id) { var C = window.MaireContenu, m = C && C.MAIRES && C.MAIRES[id]; return m ? m.ico + " " + m.nom : id ? id : "Sans compétence"; }
  function section(box, titre, aide) { var s = add(h("section", "am-sec"), h("h2", null, titre), aide ? h("p", "am-aide", aide) : null); box.appendChild(s); return s; }
  function table(entetes, lignes) {
    var t = h("table", "am-tab"), th = h("tr");
    entetes.forEach(function (x) { th.appendChild(h("th", null, x)); }); t.appendChild(add(h("thead"), th));
    var tb = h("tbody"); lignes.forEach(function (l) { var tr = h("tr"); l.forEach(function (c) { var td = h("td"); if (c && c.nodeType) td.appendChild(c); else td.textContent = c == null ? "—" : c; tr.appendChild(td); }); tb.appendChild(tr); });
    t.appendChild(tb); return add(h("div", "am-tabw"), t);
  }
  // Petite cellule colorée : du rouge (mauvais) au vert (bon)
  function chaud(v, min, max, txt) { var c = h("span", "am-chaud", txt); if (v == null) { c.textContent = "—"; return c; } var r = Math.max(0, Math.min(1, (v - min) / ((max - min) || 1))); c.style.background = "hsla(" + Math.round(r * 120) + ",70%,45%,.35)"; return c; }
  function barres(l) { var d = h("div", "am-barres"), mx = Math.max.apply(null, l.map(function (x) { return x[1]; }).concat([1])); l.forEach(function (x) { var b = h("i"); b.style.width = (x[1] / mx * 100) + "%"; d.appendChild(add(h("div", "am-barre"), h("span", null, x[0]), add(h("b"), b), h("small", null, String(x[1])))); }); return d; }
  function kpi(lib, val, sous) { return add(h("div", "am-kpi"), h("small", null, lib), h("b", null, val), sous ? h("span", null, sous) : null); }

  // ================= Réglages du jeu =================
  function reglages(box) {
    var vals = R().defauts(), base = {};
    add(box, h("p", "am-intro", "Chaque chiffre ci-dessous règle l’équilibre du Maire de Paris. Modifie, puis « Enregistrer » : c’est appliqué tout de suite à tous les joueurs (au prochain chargement du jeu, et en direct pour ceux qui jouent). Le petit point doré signale ce qui n’est plus à la valeur d’origine."));
    var form = h("div", "am-form"); box.appendChild(form);
    var etat = h("p", "am-etat", "Chargement des réglages…"); box.appendChild(etat);
    var champs = {};
    function dessiner() {
      form.innerHTML = "";
      var groupes = [];
      R().LISTE.forEach(function (x) { if (groupes.indexOf(x.g) < 0) groupes.push(x.g); });
      groupes.forEach(function (g) {
        var s = add(h("fieldset", "am-groupe"), h("legend", null, g));
        R().LISTE.filter(function (x) { return x.g === g; }).forEach(function (x) {
          var inp = h("input"); inp.type = "number"; inp.min = x.min; inp.max = x.max; inp.step = x.pas; inp.value = vals[x.k]; inp.inputMode = "decimal";
          var modif = h("span", "am-modif"), ligne = h("label", "am-ligne");
          function maj() { var n = parseFloat(String(inp.value).replace(",", ".")); var diff = isFinite(n) && n !== x.def; modif.hidden = !diff; ligne.classList.toggle("am-change", isFinite(n) && n !== base[x.k]); ligne.classList.toggle("am-faux", !isFinite(n) || n < x.min || n > x.max); }
          inp.oninput = maj; champs[x.k] = inp;
          add(ligne, add(h("div", "am-lib"), add(h("b", null, x.nom), modif), h("small", null, x.desc), h("em", null, "Par défaut : " + String(x.def).replace(".", ",") + (x.unite ? " " + x.unite : "") + " · de " + String(x.min).replace(".", ",") + " à " + String(x.max).replace(".", ","))),
            add(h("div", "am-val"), inp, h("span", null, x.unite)));
          s.appendChild(ligne); maj();
        });
        form.appendChild(s);
      });
    }
    var actions = h("div", "am-actions"); box.appendChild(actions);
    var sauver = btn("💾 Enregistrer les réglages", "btn am-go", function () {
      var o = {}, faux = [];
      R().LISTE.forEach(function (x) { var n = parseFloat(String(champs[x.k].value).replace(",", ".")); if (!isFinite(n) || n < x.min || n > x.max) faux.push(x.nom); else if (n !== x.def) o[x.k] = n; });
      if (faux.length) { etat.textContent = "⚠️ Valeur impossible pour : " + faux.join(", ") + "."; return; }
      if (R().LISTE.some(function (x) { return x.k === "casinoPoker"; }) && (o.casinoPoker != null ? o.casinoPoker : 20) + (o.casinoBj != null ? o.casinoBj : 40) > 100) { etat.textContent = "⚠️ Poker + blackjack ne peuvent pas dépasser 100 %."; return; }
      o.maj = Date.now(); o.par = (LB.auth && LB.auth.currentUser && LB.auth.currentUser.email) || "";
      sauver.disabled = true;
      LB.db.doc("config/maire").set(o).then(function () { base = Object.assign(R().defauts(), o); etat.textContent = "✅ Enregistré : appliqué à tous les joueurs."; dessiner(); })
        .catch(function () { etat.textContent = "❌ L’enregistrement a échoué (droits d’administration ?)."; }).then(function () { sauver.disabled = false; });
    });
    var defaut = btn("↺ Tout remettre par défaut", "btn ghost", function () {
      if (!confirm("Remettre TOUS les réglages du jeu à leur valeur d’origine ?")) return;
      LB.db.doc("config/maire").set({ maj: Date.now() }).then(function () { vals = R().defauts(); base = R().defauts(); dessiner(); etat.textContent = "✅ Tous les réglages sont revenus à l’origine."; });
    });
    add(actions, sauver, defaut);
    LB.db.doc("config/maire").get().then(function (d) {
      var o = d.exists ? d.data() : {}; vals = R().defauts(); Object.keys(vals).forEach(function (k) { if (typeof o[k] === "number") vals[k] = o[k]; });
      base = Object.assign({}, vals); dessiner();
      etat.textContent = o.maj ? "Dernière modification : " + new Date(o.maj).toLocaleString("fr-FR") + (o.par ? " par " + o.par : "") : "Aucune modification : tout est à la valeur d’origine.";
    }).catch(function () { dessiner(); etat.textContent = "Impossible de lire les réglages enregistrés : valeurs d’origine affichées."; });

    // ---- Mode test (cet appareil seulement) ----
    var t = section(box, "🧪 Mode test", "Seulement sur CET appareil : les autres joueurs ne voient aucune différence. Pratique pour tester une modification sans attendre.");
    var v = R().vitesse(), seg = h("div", "am-seg");
    [1, 5, 10, 20].forEach(function (n) {
      var b = btn(n === 1 ? "Vitesse normale" : "× " + n, n === v ? "on" : "", function () { try { if (n === 1) localStorage.removeItem("maire_vitesse_test"); else localStorage.setItem("maire_vitesse_test", String(n)); } catch (e) {} Array.prototype.forEach.call(seg.children, function (c) { c.classList.remove("on"); }); b.classList.add("on"); });
      seg.appendChild(b);
    });
    add(t, h("p", "am-aide", "⏩ Vitesse des saisons et des dossiers dans tes parties :"), seg);
    var outils = h("div", "am-outils"), info = h("p", "am-aide");
    function outil(txt, f) { return btn(txt, "btn ghost", function () { if (!window.MaireTest || !MaireTest.pret()) { info.textContent = "Ouvre d’abord ta partie dans « Maire de Paris » (le jeu doit être lancé sur cet appareil), puis reviens ici."; return; } if (f() !== false) info.textContent = "✅ Fait. Retourne dans le jeu pour voir le résultat."; }); }
    add(outils, outil("💰 +1 000 M€", function () { MaireTest.argent(1000); }), outil("⬆️ +5 niveaux de partie", function () { MaireTest.niveaux(5); }),
      outil("📂 Remplir la réserve de dossiers", function () { MaireTest.reserve(); }), outil("🗳️ Forcer l’élection (dans 30 s)", function () { if (MaireTest.election30()) return; info.textContent = "Tu n’es dans aucune session pour l’instant : lance ta partie d’abord."; return false; }));
    add(t, h("p", "am-aide", "🛠️ Sur ta partie en cours :"), outils, info);
  }

  // ================= Statistiques =================
  var DONNEES = null;
  function stats(box) {
    box.appendChild(h("p", "am-intro", "Uniquement les parties des vrais joueurs (les bots ne sont jamais comptés). Chaque partie envoie sa fiche toutes les 90 secondes et à la fin."));
    var filtres = h("div", "am-seg"), zone = h("div"), periode = 0;
    [["Tout", 0], ["30 jours", 30], ["7 jours", 7], ["Aujourd’hui", 1]].forEach(function (p) {
      var b = btn(p[0], p[1] === periode ? "on" : "", function () { periode = p[1]; Array.prototype.forEach.call(filtres.children, function (c) { c.classList.remove("on"); }); b.classList.add("on"); dessiner(); });
      filtres.appendChild(b);
    });
    var recharger = btn("🔄 Actualiser", "btn ghost", function () { DONNEES = null; charger(); });
    var exp = btn("⬇️ Export CSV", "btn ghost", function () { exporter(); });
    add(box, add(h("div", "am-actions"), filtres, recharger, exp), zone);
    function charger() {
      zone.innerHTML = ""; zone.appendChild(h("p", "am-etat", "Chargement des statistiques…"));
      Promise.all([LB.db.collection("stats_parties").get(), LB.db.collection("votes").get().catch(function () { return { docs: [] }; }), titres()]).then(function (r) {
        DONNEES = { parties: r[0].docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }), votes: r[1].docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }), titres: r[2] };
        dessiner();
      }).catch(function (e) { zone.innerHTML = ""; zone.appendChild(h("p", "am-etat", "❌ Lecture impossible (" + (e && e.code || e) + "). Les règles Firestore sont-elles à jour ?")); });
    }
    function dessiner() { if (!DONNEES) return; zone.innerHTML = ""; var mini = periode ? Date.now() - periode * 86400000 : 0; rendre(zone, DONNEES.parties.filter(function (x) { return (x.maj || 0) >= mini; }), DONNEES.votes, DONNEES.titres); }
    function exporter() {
      if (!DONNEES) return;
      var cols = ["id", "nom", "uid", "google", "debut", "maj", "fin", "raison", "session", "sessionNom", "competence", "ligne", "niv", "t", "mandats", "elecG", "elecP", "montees", "placeMax", "note", "score", "pop", "bon", "tresor", "hab", "bats", "emp", "dossiers", "achats", "attaquesOk", "encheres", "encheresPerdues"];
      var lignes = [cols.join(";")].concat(DONNEES.parties.map(function (x) { return cols.map(function (c) { var v = x[c]; if (c === "debut" || c === "maj") v = v ? new Date(v).toISOString() : ""; return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(";"); }));
      var a = h("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lignes.join("\n")], { type: "text/csv" })); a.download = "maire-statistiques.csv"; a.click();
    }
    if (DONNEES) dessiner(); else charger();
  }
  // Titres des dossiers (pour les votes) : lus dans les fichiers de données du jeu
  var TITRES = null;
  function titres() {
    if (TITRES) return Promise.resolve(TITRES);
    return fetch("maire/data/index.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (ix) {
      var fs = ix.lots.map(function (l) { return l.f; }).concat(ix.speciaux ? [ix.speciaux.f] : []);
      return Promise.all(fs.map(function (f) { return fetch("maire/data/" + f).then(function (r) { return r.json(); }); }));
    }).then(function (ls) { TITRES = {}; [].concat.apply([], ls).forEach(function (ev) { TITRES[ev.id] = ev; }); return TITRES; }).catch(function () { return {}; });
  }

  function rendre(z, P, V, T) {
    if (!P.length) { z.appendChild(h("p", "am-etat", "Aucune partie de joueur sur cette période pour l’instant.")); }
    var finies = P.filter(function (x) { return x.fin; }), uids = {}, google = {};
    P.forEach(function (x) { uids[x.uid] = 1; if (x.google) google[x.uid] = 1; });
    var elG = P.reduce(function (a, x) { return a + (x.elecG || 0); }, 0), elP = P.reduce(function (a, x) { return a + (x.elecP || 0); }, 0);

    // 1. Vue d'ensemble
    var s = section(z, "📊 Vue d’ensemble"), g = h("div", "am-kpis");
    add(g, kpi("Parties", f0(P.length), finies.length + " terminées"), kpi("Joueurs différents", f0(Object.keys(uids).length), Object.keys(google).length + " avec Google"),
      kpi("Durée moyenne", duree(moy(P, function (x) { return (x.maj || 0) - (x.debut || x.maj || 0); }))), kpi("Niveau de partie moyen", f1(moy(P, function (x) { return x.niv; })), "sur 50"),
      kpi("Note moyenne", f1(moy(P, function (x) { return x.note; })), "sur 5"), kpi("Dossiers tranchés", f0(P.reduce(function (a, x) { return a + (x.dossiers || 0); }, 0))),
      kpi("Élections gagnées", pct(elG, elG + elP), (elG + elP) + " élections"), kpi("Faillites", pct(finies.filter(function (x) { return x.raison === "faillite"; }).length, finies.length), "des parties terminées"),
      kpi("Parties en session", pct(P.filter(function (x) { return x.session; }).length, P.length)), kpi("Place max. moyenne", f1(moy(P.filter(function (x) { return x.session; }), function (x) { return 21 - (x.placeMax || 0); })), "1 = Maire de Paris"));
    s.appendChild(g);

    // 2. Fins de partie
    var rs = {}; finies.forEach(function (x) { var k = x.raison || "autre"; rs[k] = (rs[k] || 0) + 1; });
    section(z, "🏁 Comment les parties se terminent").appendChild(barres(Object.keys(rs).sort(function (a, b) { return rs[b] - rs[a]; }).map(function (k) { return [RAISONS[k] || k, rs[k]]; })));

    // 3. Compétences
    var comp = {}; P.forEach(function (x) { (comp[x.competence || ""] = comp[x.competence || ""] || []).push(x); });
    var ids = Object.keys(comp).sort(function (a, b) { return comp[b].length - comp[a].length; });
    section(z, "🎭 Les compétences des maires", "Quelle compétence réussit le mieux ? Classé par nombre de parties.").appendChild(table(
      ["Compétence", "Parties", "Élections gagnées", "Place max. moy.", "Niveau moy.", "Note moy.", "Durée moy.", "Faillites"],
      ids.map(function (id) {
        var l = comp[id], g2 = l.reduce(function (a, x) { return a + (x.elecG || 0); }, 0), p2 = l.reduce(function (a, x) { return a + (x.elecP || 0); }, 0), te = g2 + p2 ? g2 / (g2 + p2) : null;
        return [competence(id), l.length, chaud(te, 0.3, 0.8, pct(g2, g2 + p2)), f1(moy(l.filter(function (x) { return x.session; }), function (x) { return 21 - (x.placeMax || 0); })), f1(moy(l, function (x) { return x.niv; })),
          chaud(moy(l, function (x) { return x.note; }), 1.5, 4, f1(moy(l, function (x) { return x.note; }))), duree(moy(l, function (x) { return (x.maj || 0) - (x.debut || x.maj || 0); })), pct(l.filter(function (x) { return x.fin && x.raison === "faillite"; }).length, l.filter(function (x) { return x.fin; }).length)];
      })));

    // 4. Qui gagne contre qui (élections de session)
    var adv = { bot: 1 }, mat = {};
    P.forEach(function (x) { Object.keys(x.duels || {}).forEach(function (k) { adv[k] = 1; var m = (mat[x.competence || ""] = mat[x.competence || ""] || {}); var c = m[k] || (m[k] = { g: 0, p: 0 }); c.g += x.duels[k].g || 0; c.p += x.duels[k].p || 0; }); });
    var advs = Object.keys(adv).sort(function (a, b) { return a === "bot" ? -1 : b === "bot" ? 1 : 0; });
    section(z, "⚔️ Qui gagne contre qui", "Élections de session : % de victoires de la compétence (ligne) contre l’adversaire (colonne). « Bots » regroupe tous les maires robots ; les autres colonnes sont de vrais joueurs.").appendChild(table(
      ["Compétence ↓ contre →"].concat(advs.map(function (k) { return k === "bot" ? "🤖 Bots" : competence(k); })),
      Object.keys(mat).map(function (id) { return [competence(id)].concat(advs.map(function (k) { var c = mat[id][k]; return c && c.g + c.p ? chaud(c.g / (c.g + c.p), 0.2, 0.8, pct(c.g, c.g + c.p) + " (" + (c.g + c.p) + ")") : "—"; })); })));

    // 5. Catégories de dossiers
    var cats = {};
    P.forEach(function (x) { Object.keys(x.catD || {}).forEach(function (k) { var c = cats[k] || (cats[k] = { n: 0, pop: 0, bon: 0, bud: 0 }), d = x.catD[k]; c.n += d.n || 0; c.pop += d.pop || 0; c.bon += d.bon || 0; c.bud += d.bud || 0; }); });
    var ck = Object.keys(cats).sort(function (a, b) { return cats[a].pop / cats[a].n - cats[b].pop / cats[b].n; });
    section(z, "📂 Les catégories de dossiers", "Effet moyen d’UN dossier de la catégorie, sur ce que les joueurs ont réellement choisi. Classé de la plus dure à la plus facile.").appendChild(table(
      ["Catégorie", "Dossiers tranchés", "Popularité / dossier", "Bonheur / dossier", "Argent / dossier (M€)"],
      ck.map(function (k) { var c = cats[k]; return [CATS[k] || k, c.n, chaud(c.pop / c.n, -2, 2, f1(c.pop / c.n)), chaud(c.bon / c.n, -2, 2, f1(c.bon / c.n)), chaud(c.bud / c.n, -40, 40, f0(c.bud / c.n))]; })));

    // 6. Compétence × catégorie
    section(z, "🧩 Compétence contre catégorie", "Popularité gagnée ou perdue en moyenne par dossier : qui s’en sort le mieux face à quel type de dossier.").appendChild(table(
      ["Compétence ↓ / catégorie →"].concat(ck.map(function (k) { return CATS[k] || k; })),
      ids.map(function (id) {
        var agg = {}; comp[id].forEach(function (x) { Object.keys(x.catD || {}).forEach(function (k) { var a = agg[k] || (agg[k] = { n: 0, pop: 0 }); a.n += x.catD[k].n || 0; a.pop += x.catD[k].pop || 0; }); });
        return [competence(id)].concat(ck.map(function (k) { var a = agg[k]; return a && a.n ? chaud(a.pop / a.n, -2, 2, f1(a.pop / a.n) + " (" + a.n + ")") : "—"; }));
      })));

    // 7. Casino
    var cas = {}; P.forEach(function (x) { Object.keys(x.casino || {}).forEach(function (k) { var c = cas[k] || (cas[k] = { j: 0, g: 0 }); c.j += x.casino[k].j || 0; c.g += x.casino[k].g || 0; }); });
    section(z, "🎰 Casino", "Réponses jouées au casino : combien de parties, et combien gagnées par les joueurs.").appendChild(table(["Jeu", "Parties jouées", "Gagnées"],
      Object.keys(JEUX).map(function (k) { var c = cas[k] || { j: 0, g: 0 }; return [JEUX[k], c.j, chaud(c.j ? c.g / c.j : null, 0.2, 0.7, pct(c.g, c.j))]; })));

    // 8. Ville et actions
    section(z, "🏙️ Ville et actions (moyenne par partie)").appendChild(add(h("div", "am-kpis"),
      kpi("Trésor net", f0(moy(P, function (x) { return x.tresor; })) + " M€"), kpi("Habitants", f0(moy(P, function (x) { return x.hab; }))), kpi("Bâtiments", f1(moy(P, function (x) { return x.bats; }))),
      kpi("Employés", f1(moy(P, function (x) { return x.emp; }))), kpi("Achats", f1(moy(P, function (x) { return x.achats; }))), kpi("Attaques réussies", f1(moy(P, function (x) { return x.attaquesOk; }))),
      kpi("Enchères gagnées", f1(moy(P, function (x) { return x.encheres; })), f1(moy(P, function (x) { return x.encheresPerdues; })) + " perdues"), kpi("Popularité", f1(moy(P, function (x) { return x.pop; }))), kpi("Bonheur", f1(moy(P, function (x) { return x.bon; })))));

    // 9. Niveaux atteints et places
    var nv = {}; P.forEach(function (x) { var b = Math.min(45, Math.floor(((x.niv || 1) - 1) / 5) * 5) + 1; nv[b] = (nv[b] || 0) + 1; });
    section(z, "⭐ Niveau de partie atteint").appendChild(barres(Object.keys(nv).map(Number).sort(function (a, b) { return a - b; }).map(function (b) { return ["Niv. " + b + "–" + (b === 46 ? 50 : b + 4), nv[b]]; })));
    var pl = {}; P.filter(function (x) { return x.session; }).forEach(function (x) { var p = 21 - (x.placeMax || 0); pl[p] = (pl[p] || 0) + 1; });
    section(z, "🏛️ Meilleure place atteinte en session", "1 = Maire de Paris, 21 = plus petit arrondissement.").appendChild(barres(Object.keys(pl).map(Number).sort(function (a, b) { return a - b; }).map(function (p) { return [p === 1 ? "👑 1 (Paris)" : "Place " + p, pl[p]]; })));

    // 10. Activité
    var jours = {}; for (var i = 13; i >= 0; i--) { var dj = new Date(Date.now() - i * 86400000); jours[dj.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })] = 0; }
    P.forEach(function (x) { var k = new Date(x.debut || x.maj).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); if (k in jours) jours[k]++; });
    section(z, "📅 Parties commencées (14 derniers jours)").appendChild(barres(Object.keys(jours).map(function (k) { return [k, jours[k]]; })));

    // 11. Meilleurs joueurs
    var top = P.slice().sort(function (a, b) { return (b.placeMax || 0) - (a.placeMax || 0) || (b.note || 0) - (a.note || 0); }).slice(0, 15);
    section(z, "🏆 Meilleures parties").appendChild(table(["Joueur", "Compétence", "Place max.", "Note", "Niveau", "Mandats", "Fin"],
      top.map(function (x) { return [x.nom || "?", competence(x.competence), x.session ? 21 - (x.placeMax || 0) : "solo", f1(x.note), x.niv, x.mandats, x.fin ? RAISONS[x.raison] || x.raison || "terminée" : "en cours"]; })));

    // 12. Dossiers : votes des joueurs
    var vl = V.map(function (v) { var c = [v.c0 || 0, v.c1 || 0, v.c2 || 0, v.c3 || 0], n = c.reduce(function (a, x) { return a + x; }, 0); return { id: v.id, c: c, n: n }; }).filter(function (v) { return v.n > 0; });
    function ligneVote(v) { var ev = T[v.id], ch = ev && ev.choix || []; return [ev ? ev.titre : v.id, v.n, h("span", "am-mut", ch.map(function (c, i) { return "ABCD"[i] + " " + Math.round(v.c[i] / v.n * 100) + " %"; }).join(" · ") || v.c.join(" / ")), ev ? CATS[ev.cat] || ev.cat : "—"]; }
    section(z, "🗳️ Dossiers les plus joués", "Ce que les joueurs ont répondu (votes réels).").appendChild(table(["Dossier", "Votes", "Réponses", "Catégorie"], vl.sort(function (a, b) { return b.n - a.n; }).slice(0, 20).map(ligneVote)));
    var div = vl.filter(function (v) { return v.n >= 5; }).map(function (v) { v.ecart = Math.max.apply(null, v.c) / v.n; return v; }).sort(function (a, b) { return a.ecart - b.ecart; }).slice(0, 10);
    section(z, "🤔 Dossiers qui divisent le plus", "Au moins 5 votes, réponses les plus partagées.").appendChild(table(["Dossier", "Votes", "Réponses", "Catégorie"], div.map(ligneVote)));
  }

  // Point d'entrée appelé par admin.js : on ne redessine pas à chaque mise à jour du site (sinon la saisie serait perdue)
  window.apMaire = function (kind, box) {
    if (box.dataset.k === kind) return;
    box.dataset.k = kind; box.innerHTML = "";
    if (!window.MaireReglages) { box.appendChild(h("p", "am-etat", "Chargement…")); return; }
    if (kind === "mreglages") reglages(box); else stats(box);
  };
})();
