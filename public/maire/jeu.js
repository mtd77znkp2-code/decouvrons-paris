// Maire de Paris : interface du jeu, chargée à la demande. La logique est dans moteur.js,
// la progression du joueur (niveaux, histoire, succès, quêtes, défi du jour) dans progression.js.
// Pas de tutoriel à lire : un guide montre, au bon moment, l'élément à utiliser avec une bulle d'une ligne.
(function () {
  "use strict";
  var M = window.Maire, G = window.MaireProg, QUETES = null, CLE = "maire_partie_v3", MIN_EVTS = 600;
  var IDX = null, BASE = null, st = null, box = null;
  var CHOIX = { ligne: null, amb: [] }, niveau = "facile", comptage = false;   // comptage : gains de fin de partie en cours de calcul

  // ---------- Outils ----------
  function h(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function ajout(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function bouton(txt, cls, f) { var b = h("button", cls || "btn", txt); b.type = "button"; b.onclick = f; return b; }
  function argent(m) {
    var s = m < 0 ? "−" : "", a = Math.abs(m);
    return s + (a >= 1000 ? (a / 1000).toFixed(2).replace(".", ",").replace(/,?0+$/, "") + " Md€" : (Math.round(a * 10) / 10).toString().replace(".", ",") + " M€");
  }
  function signe(v, unite) { var r = Math.round(v * 10) / 10; return (r > 0 ? "+" : r < 0 ? "−" : "") + String(Math.abs(r)).replace(".", ",") + (unite || ""); }
  function virg(v) { return String(Math.round(v * 10) / 10).replace(".", ","); }
  function date(t) { var a = Math.floor((t - 1) / 4) + 1, q = (t - 1) % 4 + 1; return (q === 1 ? "1er" : q + "e") + " trimestre · année " + a; }
  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(st)); } catch (e) {} }
  function lireSauvegarde() { try { var s = JSON.parse(localStorage.getItem(CLE) || "null"); return s && s.v >= 3 && s.v <= 7 ? s : null; } catch (e) { return null; } }
  function effacer() { try { localStorage.removeItem(CLE); } catch (e) {} }
  function haut() { var g = document.getElementById("g-maire"); if (g && g.getBoundingClientRect().top < 0) g.scrollIntoView({ behavior: "smooth" }); }
  function nivJ() { return G.nivJoueur(); }
  function sansLimiteAdmin() { try { return !!window.ADMIN_UNLOCKED && localStorage.getItem("maire_sanslimite") === "1"; } catch (e) { return false; } }
  function couleur(v) { var t = Math.max(0, Math.min(1, (v - 30) / 45)); return "hsl(" + Math.round(t * 125) + ",62%,42%)"; }

  // ---------- Niveau de difficulté : les boutons au-dessus du jeu (certains se débloquent avec le niveau du joueur) ----------
  function ouvert(n) { return M.mecaniques(nivJ())[M.NIVEAUX[n].meca]; }
  function lireNiveau() { try { var n = localStorage.getItem("maire_niveau"); return M.NIVEAUX[n] && ouvert(n) ? n : "facile"; } catch (e) { return "facile"; } }
  function choixNiveau(n, bloque) {
    niveau = M.NIVEAUX[n] ? n : "facile";
    var lv = document.getElementById("m-lvls");
    if (lv) Array.prototype.forEach.call(lv.children, function (b) {
      var o = ouvert(b.dataset.l);
      b.classList.toggle("on", b.dataset.l === niveau); b.disabled = !!bloque || !o;
      b.textContent = (o ? "" : "🔒 ") + M.NIVEAUX[b.dataset.l].nom;
      b.title = o ? "" : "Se débloque au niveau " + (b.dataset.l === "moyen" ? 4 : 8);
    });
    if (window.lbRender) lbRender();
  }
  function cleClassement(n) { return n === "moyen" ? "maire" : "maire_" + n; }

  // ---------- Données ----------
  function index() {
    if (IDX) return Promise.resolve(IDX);
    return fetch("maire/data/index.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (x) { IDX = x; return x; });
  }
  function choisirLots() {
    var l = IDX.lots.slice(), pris = [], n = 0;
    for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; }
    for (var k = 0; k < l.length && n < MIN_EVTS; k++) { pris.push(l[k].f); n += l[k].n; }
    return pris;
  }
  function quetes() {
    if (QUETES) return Promise.resolve(QUETES);
    return fetch("maire/data/quetes.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (x) { QUETES = x; return x; });
  }
  // Les 3 quêtes du jour sont figées pour la journée (monter de niveau en pleine partie ne les change pas)
  function quetesAuj() {
    if (!QUETES) return [];
    var j = G.jour(), c = null;
    try { c = JSON.parse(localStorage.getItem("maire_quetes_j") || "null"); } catch (e) {}
    if (c && c.j === j) return c.ids.map(function (id) { return QUETES.filter(function (q) { return q.id === id; })[0]; }).filter(Boolean);
    var l = G.quetesDuJour(j, QUETES, nivJ());
    if (l.length) try { localStorage.setItem("maire_quetes_j", JSON.stringify({ j: j, ids: l.map(function (q) { return q.id; }) })); } catch (e) {}
    return l;
  }
  function chargerLots(noms) {
    noms = noms.concat(IDX.speciaux ? [IDX.speciaux.f] : []);
    return Promise.all(noms.map(function (f) { return fetch("maire/data/" + f).then(function (r) { if (!r.ok) throw 0; return r.json(); }); }))
      .then(function (ls) { BASE = M.indexer([].concat.apply([], ls)); return BASE; });
  }

  // ---------- Accueil ----------

  // Accueil épuré : ton niveau, un gros bouton pour jouer, 4 tuiles ; le reste est replié
  function accueil() {
    box.innerHTML = ""; fermerModale();
    var s = lireSauvegarde(), n = nivJ(), P = G.lire(), nv = G.niveau(P.xp);
    choixNiveau(s && s.phase !== "fin" ? s.niveau : lireNiveau());
    var pr = h("div", "mx-profil"), barre = h("div", "mx-xpbarre"), bi = h("i"); bi.style.width = nv.pct + "%"; barre.appendChild(bi);
    ajout(pr, h("span", "mx-niv mx-niv-gros", String(nv.n)), ajout(h("div"), h("strong", null, nv.titre + ((P.titres || []).length ? " · 🎖️ " + P.titres[P.titres.length - 1] : "")), barre,
      h("small", null, nv.max ? "Niveau maximum" : nv.depuis + " / " + nv.besoin + " XP vers le niveau " + (nv.n + 1))));
    box.appendChild(pr);
    if (s && s.phase !== "fin") {
      var r = bouton("", "mx-jouer", reprise);
      ajout(r, h("strong", null, "▶ Reprendre ma partie"), h("small", null, (s.defi != null ? "Défi du jour · " : "") + "Mandat " + s.mandat + " · " + date(Math.max(1, s.t)) + " · " + M.NIVEAUX[s.niveau].nom));
      box.appendChild(r);
      box.appendChild(bouton("Nouvelle partie", "mx-lien", function () { if (confirm("Commencer une nouvelle partie ? La partie en cours sera perdue.")) creation(); }));
    } else {
      var j = bouton("", "mx-jouer", creation); ajout(j, h("strong", null, "▶ Jouer"), h("small", null, "Deviens maire de Paris"));
      box.appendChild(j);
    }
    // Quatre tuiles : chacune ouvre son écran
    var se = G.serie(), ps = G.pass(), roue = G.roueDispo(), t = h("div", "mx-tuiles");
    function tuile(ico, titre, sous, f, vif) { var b = bouton("", "mx-tuile" + (vif ? " mx-vif" : ""), f); ajout(b, h("span", null, ico), h("strong", null, titre), h("small", null, sous)); return b; }
    ajout(t, tuile("🔥", se.n ? se.n + " jour" + (se.n > 1 ? "s" : "") : "Série", se.fait ? "validé aujourd’hui" : "joue aujourd’hui", ecranSerie, !se.fait),
      tuile("🎟️", "Palier " + ps.palier, "pass de combat", ecranPass),
      tuile("🎡", "Roue", roue ? "tour gratuit !" : "revient lundi", roue ? ecranRoue : function () { toast("🎡 Prochain tour gratuit lundi."); }, roue),
      tuile("🏅", "Ligue", "de la semaine", ecranLigue));
    box.appendChild(t);
    var auj = h("details", "mx-replie"); auj.appendChild(h("summary", null, "📅 Aujourd’hui : défi, quêtes et succès du jour"));
    var zone = h("div", "m-auj"); auj.appendChild(zone); box.appendChild(auj);
    Promise.all([index(), quetes()]).then(function () { panneauJour(zone, s); }).catch(function () { zone.textContent = "Indisponible pour le moment."; });
    var plus = h("details", "mx-replie"); plus.appendChild(h("summary", null, "📖 Mon parcours : histoire, succès, objets, déblocages"));
    ajout(plus, carteChapitre(n), carteProfil(), carteDeblocages(n));
    box.appendChild(plus);
  }
  function ecranSerie() {
    box.innerHTML = ""; box.appendChild(bouton("← Retour", "btn m-sec", accueil));
    box.appendChild(h("h5", null, "🔥 Série de jours"));
    box.appendChild(carteSerie());
    var u = h("ol", "m-paliers"), se = G.serie();
    [1, 3, 5, 7, 10, 14, 21, 30].forEach(function (k) { var li = h("li", se.n >= k ? "m-ok" : ""); ajout(li, h("span", "m-pn", String(k)), h("span", null, G.texteSerie(G.recompenseSerie(k))), h("b", null, se.n >= k ? "✔" : "")); u.appendChild(li); });
    ajout(box, h("p", "m-aide", "Joue au moins un trimestre par jour. Un joker (gagné chaque semaine de série) pardonne un jour manqué."), u);
    haut();
  }
  function ecranLigue() {
    box.innerHTML = ""; box.appendChild(bouton("← Retour", "btn m-sec", accueil));
    box.appendChild(h("h5", null, "🏅 Ligue de la semaine"));
    var z = h("div"); box.appendChild(z); carteLigue(z);
    haut();
  }
  // ---------- Bureau des objets trouvés, bâtiments secrets et combos découverts ----------
  function collection() {
    var P = G.lire(), C = M.C; box.innerHTML = "";
    box.appendChild(bouton("← Retour", "btn m-sec", accueil));
    var no = Object.keys(C.OBJETS).filter(function (k) { return P.objets[k]; }).length;
    box.appendChild(h("h5", null, "🗃️ Bureau des objets trouvés · " + no + " / " + Object.keys(C.OBJETS).length));
    var g = h("div", "m-succes");
    Object.keys(C.OBJETS).forEach(function (k) {
      var o = C.OBJETS[k], ok = !!P.objets[k], d = h("div", "m-suc" + (ok ? " m-sok" : ""));
      ajout(d, h("span", "m-sico", ok ? o.ico : "❔"), ajout(h("div"), h("strong", null, ok ? o.nom : "Objet inconnu"), h("span", null, ok ? o.txt : "Continue à jouer : certains événements rares en offrent."),
        ok && o.secret ? h("small", null, "🔓 A débloqué : " + C.SECRETS[o.secret].nom) : null));
      g.appendChild(d);
    });
    box.appendChild(g);
    var ns = Object.keys(C.SECRETS).filter(function (k) { return P.secrets[k]; }).length;
    box.appendChild(h("h5", null, "🔐 Bâtiments secrets · " + ns + " / " + Object.keys(C.SECRETS).length));
    var g2 = h("div", "m-succes");
    Object.keys(C.SECRETS).forEach(function (k) {
      var o = C.SECRETS[k], ok = !!P.secrets[k], d = h("div", "m-suc" + (ok ? " m-sok" : ""));
      ajout(d, h("span", "m-sico", ok ? o.ico : "❔"), ajout(h("div"), h("strong", null, ok ? o.nom : "???"), h("span", null, ok ? o.txt + " Disponible dans ta boutique." : "Un objet insolite permet de le découvrir.")));
      g2.appendChild(d);
    });
    box.appendChild(g2);
    var nc = Object.keys(C.COMBOS).filter(function (k) { return P.combos[k]; }).length;
    box.appendChild(h("h5", null, "🧩 Combos de bâtiments · " + nc + " / " + Object.keys(C.COMBOS).length));
    var g3 = h("div", "m-succes");
    Object.keys(C.COMBOS).forEach(function (k) {
      var o = C.COMBOS[k], ok = !!P.combos[k], d = h("div", "m-suc" + (ok ? " m-sok" : ""));
      ajout(d, h("span", "m-sico", ok ? o.ico : "❔"), ajout(h("div"), h("strong", null, ok ? o.nom : "Combo inconnu"), h("span", null, ok ? texteCombo(k) : "Indice : " + o.indice)));
      g3.appendChild(d);
    });
    box.appendChild(g3); haut();
  }
  function texteCombo(k) {
    var o = M.C.COMBOS[k], noms = { transport: "un transport (tram, métro…)" };
    var besoin = Object.keys(o.besoin).map(function (b) { return (o.besoin[b] > 1 ? o.besoin[b] + " × " : "") + (noms[b] || (M.BATIMENTS[b] ? M.BATIMENTS[b].nom.toLowerCase() : b)); }).join(" + ");
    var eff = Object.keys(o.e).map(function (p) { return (o.e[p] > 0 ? "+" : "−") + Math.abs(o.e[p] * M.P.gain) + " " + M.ICO[p]; });
    if (o.rev) eff.push("+" + o.rev + " M€/trim.");
    return besoin + " → " + eff.join(", ");
  }
  function carteChapitre(n) {
    var id = G.chapitre(M, n), c = G.HISTOIRE[id], P = G.lire(), d = h("div", "m-chap");
    ajout(d, h("p", "m-sur", "Chapitre " + c.num + " sur 9 · " + c.titre),
      ajout(h("div", "m-leon"), h("span", "m-leon-ico", "🧑‍💼"), h("p", null, "« " + c.recit + " » — Léon, ton directeur de cabinet")),
      h("p", "m-chap-obj" + (P.chapitres[id] ? " m-ok" : ""), (P.chapitres[id] ? "✔ Objectif accompli : " : "🎯 Objectif du chapitre : ") + c.objectif + (P.chapitres[id] ? "" : " (+" + G.XP_CHAPITRE + " XP)")));
    var suiv = M.MECANIQUES.filter(function (m) { return m.niv > n; })[0];
    if (suiv) d.appendChild(h("small", null, "Prochain chapitre au niveau " + suiv.niv + " : « " + G.HISTOIRE[suiv.id].titre + " »."));
    else d.appendChild(h("small", null, "Tu as ouvert tous les chapitres de Paris 2040."));
    return d;
  }
  function carteProfil() {
    var P = G.lire(), n = G.niveau(P.xp), c = h("div", "m-profil");
    var t = h("div", "m-pt");
    ajout(t, h("span", "m-pn", String(n.n)), ajout(h("div"), h("strong", null, n.titre), h("small", null, n.max ? P.xp + " XP · niveau maximum" : n.depuis + " / " + n.besoin + " XP vers le niveau " + (n.n + 1))));
    var barre = h("div", "m-barre"), i = h("i"); i.style.width = n.pct + "%"; barre.appendChild(i);
    var nb = G.SUCCES.filter(function (x) { return P.succes[x.id]; }).length;
    var no = Object.keys(P.objets || {}).length;
    ajout(c, t, barre, h("small", "m-rep", "⭐ Réputation " + (P.rep || 0) + " · " + G.reputation(P.rep || 0, M.C) + ((P.titres || []).length ? " · 🎖️ " + P.titres[P.titres.length - 1] : "")),
      ajout(h("div", "m-bas"), bouton("🏅 Succès " + nb + " / " + G.SUCCES.length, "btn m-sec m-bsucces", succes), bouton("🗃️ Objets trouvés " + no + " / " + Object.keys(M.C.OBJETS).length, "btn m-sec m-bsucces", collection)));
    if (window.ADMIN_UNLOCKED) {
      var a = h("div", "m-admin"), sel = h("select");
      for (var k = 1; k <= G.NIV_MAX; k++) { var o = h("option", null, "Niveau " + k); o.value = k; if (k === n.n) o.selected = true; sel.appendChild(o); }
      sel.onchange = function () { G.fixerNiveau(+sel.value); accueil(); };
      var lab = h("label", "m-admin-lim"), cb = h("input"); cb.type = "checkbox"; cb.checked = sansLimiteAdmin();
      cb.onchange = function () { try { localStorage.setItem("maire_sanslimite", cb.checked ? "1" : ""); } catch (e) {} };
      ajout(lab, cb, document.createTextNode(" Passer les limites pour les bâtiments (niveaux, trimestres, réélections)"));
      ajout(a, h("span", null, "🛠 Admin : se placer au"), sel, lab, bouton("Revoir le guide", "btn m-sec", function () { G.oublierTutos(); alert("Le guide réapparaîtra dans ta prochaine partie."); }));
      c.appendChild(a);
    }
    return c;
  }
  // ---------- Série de jours ----------
  function carteSerie() {
    var x = G.serie(), d = h("div", "m-serie");
    ajout(d, h("span", "m-serie-feu" + (x.n ? "" : " m-serie-eteint"), "🔥"), ajout(h("div"),
      h("strong", null, x.n ? x.n + " jour" + (x.n > 1 ? "s" : "") + " d’affilée" : "Lance ta série de jours"),
      h("small", null, (x.fait ? "✔ Aujourd’hui validé · demain : " : "Joue un trimestre aujourd’hui : ") + x.txt),
      h("small", null, "Record : " + x.max + " · 🃏 Jokers : " + x.jokers + " (un jour manqué pardonné)")));
    return d;
  }
  // ---------- Roue de la fortune (une fois par semaine) ----------
  function ecranRoue() {
    box.innerHTML = ""; box.appendChild(bouton("← Retour", "btn m-sec", accueil));
    box.appendChild(h("h5", null, "🎡 Roue de la fortune"));
    var n = G.ROUE.length, cont = h("div", "m-roue-zone"), roue = h("div", "m-roue2"), fl = h("div", "m-roue-fleche", "▼");
    var cols = ["#f5b21a", "#2b4fb3", "#3fae68", "#e0524b", "#7c4dff", "#1fa2c7", "#f08a30", "#c8352e"], g = [];
    G.ROUE.forEach(function (x, k) {
      g.push(cols[k % cols.length] + " " + (k * 360 / n) + "deg " + ((k + 1) * 360 / n) + "deg");
      var lab = h("span", "m-roue-lab", x.txt.replace(/ :.*$/, "").replace("points de pass", "pts pass"));
      lab.style.transform = "rotate(" + ((k + 0.5) * 360 / n) + "deg) translateY(calc(min(320px, 86vw) * -0.32))"; roue.appendChild(lab);
    });
    roue.style.background = "conic-gradient(" + g.join(",") + ")";
    ajout(cont, fl, roue); box.appendChild(cont);
    var res = h("p", "m-roue-res"), go = bouton("Lancer la roue", "btn m-go m-gros", function () {
      go.disabled = true;
      var r = G.tournerRoue(Math.random()); if (!r) { res.textContent = "Tu as déjà tourné la roue cette semaine."; return; }
      var calme = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      roue.style.transition = calme ? "none" : "transform 4s cubic-bezier(.15,.85,.2,1)";
      roue.style.transform = "rotate(" + (360 * 6 - (r.i + 0.5) * 360 / n) + "deg)";
      setTimeout(function () {
        res.textContent = "🎉 Tu gagnes : " + r.txt + (r.pass.length ? " · palier " + r.pass.map(function (x) { return x.n; }).join(", ") + " du pass atteint !" : "");
        if (r.jackpot) flash("🎰 JACKPOT ! 🎰", "m-flash-jackpot");
        go.textContent = "Retour à l’accueil"; go.disabled = false; go.onclick = accueil;
      }, calme ? 100 : 4100);
    });
    ajout(box, res, go, h("small", "m-aide", "Un tour gratuit chaque semaine (du lundi au dimanche)."));
    haut();
  }
  // ---------- Ligues de la semaine ----------
  function carteLigue(zone) {
    zone.innerHTML = "";
    var d = h("div", "m-ligue");
    if (!window.user || !window.LB || !LB.uid) {
      ajout(d, h("strong", null, "🏅 Ligues de la semaine"), h("small", null, "Connecte-toi depuis l’accueil du site (avec un pseudo) pour affronter les autres maires : les meilleurs montent de ligue chaque lundi."));
      zone.appendChild(d); return;
    }
    var L = G.ligue(LB.docs || [], LB.uid);
    envoyerLigue();
    ajout(d, ajout(h("div", "m-jt"), h("strong", null, L.ico + " Ligue " + L.nom), h("b", null, L.rang + "e / " + L.total)),
      h("small", null, "Ton XP cette semaine : " + L.xp + " · fin dans " + L.finDans + " jour" + (L.finDans > 1 ? "s" : "") + " · les 20 % du haut montent, les 20 % du bas descendent."));
    if (L.avant && L.avant.nouveau !== L.avant.tier) d.appendChild(h("p", "m-ligue-msg", L.avant.nouveau > L.avant.tier ? "⬆️ Promotion ! Te voilà en ligue " + G.LIGUES[L.avant.nouveau].nom + "." : "⬇️ Descente en ligue " + G.LIGUES[L.avant.nouveau].nom + " : à toi de remonter !"));
    var o = h("ol", "m-ligue-l");
    L.membres.slice(0, 10).forEach(function (m, k) { var li = h("li", m.moi ? "me" : ""); ajout(li, h("span", null, (k + 1) + ". " + (m.moi ? window.user + " (toi)" : m.nom)), h("b", null, m.xp + " XP")); o.appendChild(li); });
    if (L.rang > 10) { var li = h("li", "me"); ajout(li, h("span", null, L.rang + ". " + window.user + " (toi)"), h("b", null, L.xp + " XP")); o.appendChild(li); }
    d.appendChild(o); zone.appendChild(d);
  }
  var ligueEnvoyee = null;
  function envoyerLigue() {
    if (!window.user || !window.LB || !LB.db || !LB.uid) return;
    var x = G.donneesLigue(), cle = x.lgw + ":" + x.lgx + ":" + x.lg; if (ligueEnvoyee === cle) return;
    var ref = LB.db.doc("scores/" + LB.uid);
    ref.get().then(function (sn) {
      var dd = sn.exists ? sn.data() : {}, m = Object.assign({}, dd.s || {});
      if (m.lgw === x.lgw && m.lgx === x.lgx && m.lg === x.lg) { ligueEnvoyee = cle; return; }
      m.lgw = x.lgw; m.lgx = x.lgx; m.lg = x.lg;
      return ref.set({ name: window.user, s: m, at: Date.now() }).then(function () { ligueEnvoyee = cle; });
    }).catch(function () {});
  }

  // ---------- Pass de combat ----------
  function ecranPass() {
    var ps = G.pass(); box.innerHTML = "";
    box.appendChild(bouton("← Retour", "btn m-sec", accueil));
    box.appendChild(h("h5", null, "🎟️ Pass de combat · saison " + ps.nom));
    box.appendChild(h("p", "m-aide", "Gagne des points avec les succès du jour (+100, +200 si les 5 sont réussis), les quêtes (+100), chaque partie (+50) et chaque élection gagnée (+50). Tous les " + ps.parPalier + " points, un palier et sa récompense. Les points repartent à zéro chaque mois ; les bâtiments exclusifs et les titres restent."));
    var sac = Object.keys(G.SAC).filter(function (k) { return ps.sac[k] > 0; });
    if (sac.length) box.appendChild(h("p", "m-nivtxt", "🎒 Dans ton sac : " + sac.map(function (k) { return G.SAC[k].ico + " " + G.SAC[k].nom + " ×" + ps.sac[k]; }).join(" · ") + " (à choisir en lançant une partie)"));
    if (ps.titres.length) box.appendChild(h("p", "m-nivtxt", "🎖️ Tes titres : " + ps.titres.join(" · ")));
    var u = h("ol", "m-paliers");
    ps.paliers.forEach(function (x) {
      var li = h("li", x.ok ? "m-ok" : x.n === ps.palier + 1 ? "m-suivant" : "");
      ajout(li, h("span", "m-pn", String(x.n)), h("span", null, x.txt), h("b", null, x.ok ? "✔" : x.n === ps.palier + 1 ? ps.dans + "/" + ps.parPalier : "🔒"));
      u.appendChild(li);
    });
    box.appendChild(u); haut();
  }
  function carteDeblocages(n) {
    var d = h("details", "m-debloc"); d.appendChild(h("summary", null, "🔓 Ce que tu as débloqué"));
    var u = h("ul");
    var l = M.MECANIQUES.concat(M.EXTRAS).map(function (m) { return { niv: m.niv, txt: m.nom }; });
    Object.keys(M.BATIMENTS).forEach(function (id) { var B = M.BATIMENTS[id]; if (!B.secret) l.push({ niv: B.niv || 1, txt: B.ico + " " + (B.projet ? "Projet : " : "") + B.nom }); });
    l.sort(function (a, b) { return a.niv - b.niv; }).forEach(function (m) { u.appendChild(h("li", n >= m.niv ? "m-ok" : "", (n >= m.niv ? "✔ " : "🔒 Niveau " + m.niv + " · ") + m.txt)); });
    d.appendChild(u);
    return d;
  }
  function panneauJour(c, s) {
    var j = G.jour(), P = G.lire(), n = nivJ();
    c.innerHTML = "";
    var df = h("div", "m-defi");
    df.appendChild(h("p", "m-sur", "Défi du jour"));
    if (n < G.NIV_DEFI) df.appendChild(h("span", null, "🔒 Se débloque au niveau " + G.NIV_DEFI + " : chaque jour, le même départ pour tout le monde."));
    else {
      var d = G.defiDuJour(j, M, IDX.lots, MIN_EVTS), fait = P.defiJours[j];
      ajout(df, h("strong", null, d.titre),
        h("span", null, d.txt + " (12 trimestres, même départ pour tous.)"),
        h("span", null, fait ? (fait.ok ? "✔ Défi terminé aujourd’hui : score " + fait.score + "." : "Défi tenté aujourd’hui : raté (score " + fait.score + "). Reviens demain !") :
          "Termine le défi pour 150 XP (+50 si ton score dépasse 1 200)."));
      df.appendChild(classementJour(j));
      if (!fait) df.appendChild(bouton("Relever le défi", "btn m-go", function () {
        if (s && s.phase !== "fin" && !confirm("Relever le défi ? La partie en cours sera perdue.")) return;
        lancerDefi(d);
      }));
    }
    c.appendChild(df);
    var dj = G.journaliers(j), nf = dj.filter(function (x) { return x.fait; }).length, sj = h("div", "m-quetes m-jours");
    sj.appendChild(h("p", "m-sur", "🌞 Succès du jour · " + nf + "/" + dj.length));
    var uj = h("ul", "m-qliste");
    dj.forEach(function (x) { var li = h("li", x.fait ? "m-qok" : ""); ajout(li, h("span", null, (x.fait ? "✔ " : "") + x.t), h("b", null, "+" + x.xp + " XP · +100 🎟️")); uj.appendChild(li); });
    ajout(sj, uj, h("small", null, "Se valident dans n’importe quelle partie aujourd’hui. Les 5 réussis : +200 points de pass."));
    c.appendChild(sj);
    var q = h("div", "m-quetes"), qs = quetesAuj(), ok = P.quetesJour[j] || [];
    q.appendChild(h("p", "m-sur", "Quêtes du jour" + (qs.length ? " · " + ok.length + "/3" : "")));
    if (!qs.length) q.appendChild(h("span", null, "🔒 Se débloquent au niveau " + G.NIV_QUETES + "."));
    else {
      var u = h("ul", "m-qliste");
      qs.forEach(function (x) { var li = h("li", ok.indexOf(x.id) >= 0 ? "m-qok" : ""); ajout(li, h("span", null, (ok.indexOf(x.id) >= 0 ? "✔ " : "") + x.t), h("b", null, "+" + x.xp + " XP")); u.appendChild(li); });
      ajout(q, u, h("small", null, "Elles se valident en pleine partie, dès que l’objectif est atteint."));
    }
    c.appendChild(q);
  }
  // Classement du défi du jour : seuls les joueurs du même jour (même scénario) sont comparés
  function classementJour(j) {
    var d = h("div", "m-lbjour"), docs = (window.LB && LB.docs) || [];
    var l = docs.filter(function (x) { return x.s && x.s.mairedj === j && x.s.maired > 0; }).sort(function (a, b) { return b.s.maired - a.s.maired; }).slice(0, 5);
    if (!l.length) return d;
    d.appendChild(h("small", null, "🏆 Classement du jour"));
    var o = h("ol", "lbl"); l.forEach(function (x) { var li = h("li", x.id === LB.uid ? "me" : ""); ajout(li, h("span", "nm", x.name || "Anonyme"), h("span", "sc", String(x.s.maired))); o.appendChild(li); });
    d.appendChild(o);
    return d;
  }
  function envoyerScoreJour(j, score) {
    if (!window.LB || !LB.db || !LB.uid || !window.user) return;
    var ref = LB.db.doc("scores/" + LB.uid);
    ref.get().then(function (sn) {
      var dd = sn.exists ? sn.data() : {}, m = Object.assign({}, dd.s || {});
      if (m.mairedj === j && m.maired >= score) return;
      m.mairedj = j; m.maired = score;
      return ref.set({ name: window.user, s: m, at: Date.now() });
    }).catch(function () {});
  }
  function lancerDefi(d) {
    choixNiveau(d.niveau, true);
    box.innerHTML = ""; box.appendChild(h("p", "msg", "Préparation du défi…"));
    chargerLots(d.lots).then(function () {
      st = M.nouvellePartie({ ligne: d.ligne, ambitions: d.ambitions, lots: d.lots, niveau: d.niveau, graine: d.graine, nivJoueur: d.nivJoueur, xpJoueur: G.lire().xp, pid: Date.now().toString(36), scenario: d.scenario, secrets: {}, passBats: G.lire().passBats, missions: false });
      st.defi = d.jour; sauver(); demarrerPartie();
    }).catch(function () { alert("Impossible de charger les dossiers. Vérifie ta connexion et réessaie."); accueil(); });
  }
  function succes() {
    var P = G.lire(); box.innerHTML = "";
    box.appendChild(bouton("← Retour", "btn m-sec", accueil));
    var nb = G.SUCCES.filter(function (x) { return P.succes[x.id]; }).length;
    box.appendChild(h("h5", null, "Succès · " + nb + " / " + G.SUCCES.length));
    var NOMS = ["", "Bronze", "Argent", "Or", "Platine"], g = h("div", "m-succes");
    G.SUCCES.slice().sort(function (a, b) { return (P.succes[b.id] ? 1 : 0) - (P.succes[a.id] ? 1 : 0) || a.t - b.t; }).forEach(function (x) {
      var d = h("div", "m-suc m-t" + x.t + (P.succes[x.id] ? " m-sok" : ""));
      ajout(d, h("span", "m-sico", P.succes[x.id] ? "🏅" : "🔒"), ajout(h("div"), h("strong", null, x.nom), h("span", null, x.desc), h("small", null, NOMS[x.t] + " · +" + G.XP_TIER[x.t] + " XP")));
      g.appendChild(d);
    });
    box.appendChild(g); haut();
  }

  // ---------- Nouvelle partie ----------
  function creation() {
    var m = M.mecaniques(nivJ());
    var liste = G.maires(), dernier = null;
    try { dernier = localStorage.getItem("maire_perso"); } catch (e) {}
    var premier = liste.filter(function (x) { return x.dispo && x.id === dernier; })[0] || liste.filter(function (x) { return x.dispo; })[0];
    CHOIX = { maire: premier ? premier.id : null, amb: [], sac: [] };
    choixNiveau(lireNiveau());
    var sac = G.lire().sac || {}, sacOk = Object.keys(G.SAC).filter(function (k) { return sac[k] > 0; });
    box.innerHTML = "";
    box.appendChild(h("p", "m-nivtxt", "Niveau " + M.NIVEAUX[niveau].nom + " : " + M.NIVEAUX[niveau].txt));
    // Le personnage remplace la ligne politique : chacun a la sienne, un avantage et un défaut
    box.appendChild(h("p", "m-etape", "Ton personnage"));
    var lg = h("div", "mx-maires");
    liste.forEach(function (x) {
      var b = bouton("", "mx-maire" + (x.dispo ? "" : " mx-verrouille"), function () {
        if (!x.dispo) return toast("🔒 " + x.cond);
        CHOIX.maire = x.id; Array.prototype.forEach.call(lg.children, function (y) { y.setAttribute("aria-pressed", y.dataset.id === x.id); }); maj();
      });
      b.dataset.id = x.id; b.setAttribute("aria-pressed", x.id === CHOIX.maire);
      ajout(b, h("span", "mx-mico", x.dispo ? x.ico : "🔒"), ajout(h("div"), h("strong", null, x.nom + (m.ligne ? " · " + M.LIGNES[x.ligne].nom : "")), h("small", null, x.dispo ? x.txt : x.cond)));
      lg.appendChild(b);
    });
    box.appendChild(lg);
    if (m.promesses) {
      box.appendChild(h("p", "m-etape", "Tes deux promesses de campagne"));
      var am = h("div", "m-ambs");
      Object.keys(M.PILIERS).forEach(function (k) {
        var b = bouton(M.ICO[k] + " " + M.PILIERS[k], "m-amb", function () {
          var i = CHOIX.amb.indexOf(k);
          if (i >= 0) CHOIX.amb.splice(i, 1); else { if (CHOIX.amb.length === 2) CHOIX.amb.shift(); CHOIX.amb.push(k); }
          Array.prototype.forEach.call(am.children, function (x) { x.setAttribute("aria-pressed", CHOIX.amb.indexOf(x.dataset.k) >= 0); });
          maj();
        });
        b.dataset.k = k; b.setAttribute("aria-pressed", "false");
        am.appendChild(b);
      });
      box.appendChild(am);
    }
    // Bonus gagnés dans le pass de combat : on choisit ceux à utiliser pour cette partie
    if (sacOk.length) {
      box.appendChild(h("p", "m-etape", "🎒 Tes bonus du pass de combat (facultatif)"));
      var sb = h("div", "m-ambs m-sac");
      sacOk.forEach(function (k) {
        var o = G.SAC[k], b = bouton(o.ico + " " + o.nom + " ×" + sac[k], "m-amb", function () {
          var i = CHOIX.sac.indexOf(k); if (i >= 0) CHOIX.sac.splice(i, 1); else CHOIX.sac.push(k);
          b.setAttribute("aria-pressed", CHOIX.sac.indexOf(k) >= 0);
        });
        b.title = o.txt; b.setAttribute("aria-pressed", "false"); sb.appendChild(b);
      });
      ajout(box, sb, h("small", "m-aide", sacOk.map(function (k) { return G.SAC[k].ico + " " + G.SAC[k].txt; }).join(" · ")));
    }
    var go = bouton("Prendre mes fonctions", "btn m-go", demarrer), msg = h("p", "msg m-msg");
    var bas = h("div", "m-bas"); ajout(bas, bouton("Retour", "btn m-sec", accueil), go);
    box.appendChild(bas); box.appendChild(msg);
    setTimeout(function () { guide("creation"); }, 50);
    function maj() {
      var ok = CHOIX.maire && (!m.promesses || CHOIX.amb.length === 2);
      go.disabled = !ok;
      msg.textContent = !CHOIX.maire ? "Choisis ton personnage." : m.promesses && CHOIX.amb.length < 2 ? "Choisis encore " + (2 - CHOIX.amb.length) + " promesse" + (CHOIX.amb.length ? "." : "s.") : "";
    }
    maj();
  }
  function demarrer() {
    quetes().catch(function () {});
    box.innerHTML = ""; box.appendChild(h("p", "msg", "Installation à l’Hôtel de Ville…"));
    index().then(function () { var l = choisirLots(); return chargerLots(l).then(function () { return l; }); }).then(function (lots) {
      try { localStorage.setItem("maire_perso", CHOIX.maire); } catch (e) {}
      st = M.nouvellePartie({ maire: CHOIX.maire, ligne: "centre", ambitions: CHOIX.amb, lots: lots, niveau: niveau, xpJoueur: G.lire().xp, pid: Date.now().toString(36), secrets: G.lire().secrets, sansLimite: sansLimiteAdmin(), missions: false,
        passBats: G.lire().passBats, bonus: G.utiliserSac(CHOIX.sac) });
      sauver(); demarrerPartie();
    }).catch(function () { alert("Impossible de charger les dossiers. Vérifie ta connexion et réessaie."); accueil(); });
  }
  // Roulette de l'opposant (s'il est débloqué), puis le premier trimestre ; le guide prend le relais dans le jeu
  function demarrerPartie() {
    choixNiveau(st.niveau, true);
    if (st.t === 0 && (st.objectifs.length || (st.meca.opposant && st.opposant))) return roulette();
    st = M.debutTour(st, BASE); sauver(); jeu(); haut();
  }
  function reprise() {
    var s = lireSauvegarde(); if (!s) return accueil();
    quetes().catch(function () {});
    index().then(function () {
      var dispo = IDX.lots.map(function (l) { return l.f; }), lots = (s.lots || []).filter(function (f) { return dispo.indexOf(f) >= 0; });
      if (!lots.length) lots = choisirLots();
      s.lots = lots;
      return chargerLots(lots);
    }).then(function () {
      st = M.reprendre(s, BASE); st.sansMissions = true; st.mission = null; sauver(); choixNiveau(st.niveau, true);
      if (st.phase === "pret") return demarrerPartie();
      jeu();
    }).catch(function () { alert("Impossible de charger les dossiers. Vérifie ta connexion et réessaie."); });
  }

  // Tirage du mandat : l'opposant (s'il est débloqué), puis la crise et les trois objectifs

  // ---------- Ouverture du mandat, en trois écrans ----------
  // 1. les 3 objectifs se retournent un par un (comme un opening de cartes)
  // 2. une roulette tire la crise, puis, sur le même écran, l'opposant
  // 3. le résumé, et on entre en fonctions
  function roulette() { ouvertureObjectifs(); }
  function calme() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function scene(sur, titre) {
    box.innerHTML = ""; fermerModale();
    var d = h("div", "mx-scene"); ajout(d, h("p", "m-sur", sur), h("h4", "mx-scene-t", titre)); box.appendChild(d); haut();
    return d;
  }
  function ouvertureObjectifs() {
    var ob = M.objectifs(st);
    if (!ob.length) return ouvertureTirage();
    var d = scene(st.mandat > 1 ? "Mandat " + st.mandat : "Ton premier mandat", "Tes 3 objectifs pour passer au mandat suivant");
    var rang = h("div", "mx-cartes"), suite = bouton("Continuer →", "btn m-go mx-cache", ouvertureTirage), aide = h("small", "m-aide", "Touche une carte pour la retourner");
    var cartes = ob.map(function (o, i) {
      var c = h("button", "mx-carte"); c.type = "button";
      var inn = h("div", "mx-carte-in");
      ajout(inn, ajout(h("div", "mx-face mx-dos"), h("span", null, "🎯"), h("small", null, "Objectif " + (i + 1))),
        ajout(h("div", "mx-face mx-recto"), h("span", "mx-carte-ico", o.ico), h("strong", null, o.txt)));
      c.appendChild(inn); c.onclick = function () { retourner(i); };
      rang.appendChild(c); return c;
    });
    ajout(d, rang, aide, suite);
    var vus = 0;
    function retourner(i) {
      var c = cartes[i]; if (c.classList.contains("mx-retournee")) return;
      c.classList.add("mx-retournee"); vus++;
      if (vus === cartes.length) { aide.textContent = "Réussis-en au moins 2 sur 3 pour gagner le mandat."; setTimeout(function () { suite.classList.remove("mx-cache"); }, calme() ? 0 : 500); }
    }
    // Sans toucher, les cartes se retournent d'elles-mêmes, l'une après l'autre
    cartes.forEach(function (c, i) { setTimeout(function () { if (document.body.contains(c)) retourner(i); }, calme() ? 0 : 900 + i * 1100); });
  }
  // Une roulette qui défile puis s'arrête sur le tirage (déjà décidé par le moteur)
  function rouleau(liste, cible, fini) {
    var fen = h("div", "m-rfen mx-rouleau"), ico = h("span", "m-rico"), nom = h("strong", "m-rnom"); ajout(fen, ico, nom);
    var k = Math.floor(Math.random() * liste.length), tours = calme() ? 0 : 20 + ((cible - k - 20) % liste.length + liste.length) % liste.length, n = 0;
    function montre(i) { ico.textContent = liste[i].ico; nom.textContent = liste[i].nom; }
    (function tick() { montre((k + n) % liste.length); if (n >= tours) { fen.classList.add("m-rstop"); return fini && fini(); } n++; setTimeout(tick, 45 + Math.pow(n / tours, 3) * 280); })();
    return fen;
  }
  function ouvertureTirage() {
    var cr = M.criseEnCours(st), o = st.meca.opposant && st.opposant ? M.opposant(st) : null;
    if (!cr && !o) return ouvertureResume();
    var d = scene("Le tirage", cr ? "Quelle crise frappe Paris ?" : "Qui sera ton opposant ?");
    var bas = bouton("Voir le résumé →", "btn m-go mx-cache", ouvertureResume);
    function opp() {
      if (!o) return bas.classList.remove("mx-cache");
      var t = h("p", "m-sur mx-entre", "⚔️ Ton opposant"); d.insertBefore(t, bas);
      d.insertBefore(rouleau(M.OPPOSANTS, o.i, function () {
        d.insertBefore(ajout(h("p", "mx-entre mx-fichetxt"), document.createTextNode(o.txt + " Influence " + Math.round(o.force) + "/100.")), bas);
        setTimeout(function () { bas.classList.remove("mx-cache"); }, calme() ? 0 : 400);
      }), bas);
    }
    if (cr) {
      var ids = Object.keys(M.C.CRISES), liste = ids.map(function (id) { return M.C.CRISES[id]; });
      d.appendChild(rouleau(liste, ids.indexOf(st.crise.id), function () {
        d.insertBefore(ajout(h("p", "mx-entre mx-fichetxt mx-crisetxt"), document.createTextNode(cr.txt)), bas);
        setTimeout(opp, calme() ? 0 : 1100);
      }));
    } else opp();
    d.appendChild(bas);
  }
  function ouvertureResume() {
    var d = scene(st.mandat > 1 ? "Mandat " + st.mandat : "Ton premier mandat", "Le résumé"), cr = M.criseEnCours(st), o = st.meca.opposant && st.opposant ? M.opposant(st) : null;
    var l = h("div", "mx-resume");
    if (cr) l.appendChild(ajout(h("div", "mx-crise mx-entre"), h("span", null, cr.ico), ajout(h("div"), h("strong", null, cr.nom), h("small", null, cr.txt))));
    if (o) l.appendChild(ajout(h("div", "mx-oppres mx-entre"), h("span", null, o.ico), ajout(h("div"), h("strong", null, o.nom), h("small", null, "Influence " + Math.round(o.force) + "/100 · " + M.humeurOpp(o.force)))));
    var u = h("ul", "mx-objliste");
    M.objectifs(st).forEach(function (x, j) { var li = h("li", "mx-entre"); li.style.animationDelay = (calme() ? 0 : 0.15 * (j + 2)) + "s"; ajout(li, h("span", null, x.ico), h("span", null, x.txt)); u.appendChild(li); });
    if (u.children.length) { l.appendChild(h("p", "m-sur", "🎯 Tes objectifs")); l.appendChild(u); }
    ajout(d, l, h("small", "m-aide", "Réussis au moins 2 objectifs sur 3 pour gagner le mandat. Chaque objectif atteint rapporte aussi +" + ((M.bonusMaire(st).objVote) || M.P.objVote) + " % au vote."),
      bouton(st.t ? "Commencer le mandat " + st.mandat : "Entrer en fonctions", "btn m-go", function () {
        st = st.phase === "election" ? M.continuer(st, BASE) : M.debutTour(st, BASE); sauver(); jeu(); haut();
      }));
  }

  // ---------- Écran de jeu : une seule page, de haut en bas ----------

  function jeu() {
    progresser();
    if (st.phase === "fin") return fin();
    if (st.phase === "election") return resultatElection();
    var y = window.scrollY; box.style.minHeight = box.offsetHeight + "px";
    decouvertes();
    box.innerHTML = "";
    // Écran épuré : l'essentiel en haut (où j'en suis, est-ce que je gagne), la ville au milieu, la boutique, puis la gestion repliée
    ajout(box, entete(), tableau(), carteObjectifs(), piliers(), carteLeon());
    if (st.opposant) box.appendChild(bandeauOpp());
    if (st.rapport && st.notes && st.notes.length) box.appendChild(notes());
    if (st.chantiers.length) box.appendChild(chantiers());
    box.appendChild(carteVille(false));
    box.appendChild(boutique());
    box.appendChild(gestion());
    box.appendChild(barreTrimestre());
    box.style.minHeight = ""; window.scrollTo(0, y);
    if (st.enchere) return reprendreEnchere();
    modale();
    guide(document.getElementById("m-modale") ? "modale" : "jeu");
  }
  // Les découvertes de la partie (objets, secrets, combos) rejoignent le profil dès qu'elles arrivent
  function decouvertes() {
    if (!st.decouvertes || !st.decouvertes.length) return;
    var n = G.synchroniser(st); st = M.viderDecouvertes(st); sauver();
    n.forEach(function (d, i) {
      var o = d.type === "objet" ? M.C.OBJETS[d.id] : d.type === "secret" ? M.C.SECRETS[d.id] : M.C.COMBOS[d.id];
      setTimeout(function () { toast(o.ico + " " + (d.type === "objet" ? "Objet trouvé" : d.type === "secret" ? "Bâtiment secret débloqué" : "Combo découvert") + " : " + o.nom); }, 400 + i * 1900);
    });
  }
  var leonVu = null;
  function carteLeon() {
    if (!st.leon || st.leon.t !== st.t || leonVu === st.leon.t + st.leon.k) return null;
    var d = h("div", "m-leonbar");
    ajout(d, h("span", "m-leon-ico", "🧑‍💼"), h("p", null, st.leon.txt), bouton("×", "m-leonx", function () { leonVu = st.leon.t + st.leon.k; d.remove(); }));
    return d;
  }
  function chantiers() {
    var d = h("div", "m-chantiers"); d.appendChild(h("h5", null, "🏗️ Chantiers en cours"));
    st.chantiers.forEach(function (c) {
      var B = M.BATIMENTS[c.id], tot = B.duree, fait = Math.max(0, Math.min(tot, tot - c.reste)), l = h("div", "m-chantier");
      var barre = h("div", "m-barre"), i = h("i"); i.style.width = Math.round(fait / Math.max(tot, fait + c.reste) * 100) + "%"; barre.appendChild(i);
      ajout(l, ajout(h("div", "m-jt"), h("span", null, B.ico + " " + B.nom + (c.ampleur < 1 ? " (réduit)" : "")), h("b", null, c.susp ? "⏸ suspendu " + c.susp + " trim." : "encore " + c.reste + " trim.")), barre,
        h("small", null, "Reste à payer : " + argent(c.du) + (c.susp ? "" : " · prochaine tranche " + argent(Math.round(c.du / Math.max(1, c.reste))))));
      d.appendChild(l);
    });
    return d;
  }
  // Le téléphone du maire : un vieux téléphone rouge animé
  function imgTel(cls) { var i = h("img", cls); i.src = "maire/img/telephone.gif"; i.alt = ""; i.width = 40; i.height = 40; i.decoding = "async"; return i; }
  function telephone() {
    var nl = st.messages.filter(function (m) { return !m.lu; }).length;
    var b = bouton("", "m-tel" + (st.offre ? " m-tel-offre" : nl ? " m-tel-nouv" : ""), ouvrirTelephone);
    ajout(b, imgTel("m-tel-img"), nl ? h("span", "m-tel-nb", String(nl)) : null);
    b.setAttribute("aria-label", "Téléphone du maire" + (nl ? ", " + nl + " message" + (nl > 1 ? "s" : "") + " non lu" + (nl > 1 ? "s" : "") : ""));
    return b;
  }

  function entete() {
    var d = h("div", "mx-hud"), reste = M.prochaineElection(st) - st.t, a = Math.floor((Math.max(1, st.t) - 1) / 4) + 1, q = (Math.max(1, st.t) - 1) % 4 + 1;
    var gauche = ajout(h("div", "mx-quand"), h("strong", null, "Année " + a + " · T" + q), h("small", null, "Mandat " + st.mandat + (st.scenario ? " · défi du jour" : "")));
    var vote = h("span", "mx-chip", st.scenario ? "🎯 " + (st.scenario.fin - st.t) + " trim." : "🗳️ " + reste + " trim.");
    vote.title = st.scenario ? "Fin du défi" : "Prochaine élection";
    ajout(d, ajout(h("div", "mx-ligne"), gauche, ajout(h("div", "mx-droite"), vote, telephone())));
    var p = h("div", "mx-prog"), pi = h("i"); pi.style.width = (M.trimMandat(st) / M.MANDAT * 100) + "%"; p.appendChild(pi); d.appendChild(p);
    d.appendChild(barreXP());
    return d;
  }
  // Niveau et XP en direct : la barre se remplit à chaque action, le prochain déblocage est annoncé
  var xpAffiche = null;

  function barreXP() {
    var xp = st.xp0 + st.xp, n = G.niveau(xp), d = h("div", "mx-xp");
    var barre = h("div", "mx-xpbarre"), i = h("i"); barre.appendChild(i);
    var avant = xpAffiche != null && xpAffiche.pid === st.pid && xpAffiche.xp < xp ? G.niveau(xpAffiche.xp) : null;
    i.style.width = (avant && avant.n === n.n ? avant.pct : n.pct) + "%";
    if (avant) requestAnimationFrame(function () { requestAnimationFrame(function () { i.style.width = n.pct + "%"; }); });
    ajout(d, h("span", "mx-niv", String(n.n)), barre, avant ? h("em", "m-xpplus", "+" + (xp - xpAffiche.xp)) : h("small", null, n.max ? "max" : n.depuis + "/" + n.besoin));
    d.title = "Niveau " + n.n + " · " + n.titre;
    xpAffiche = { pid: st.pid, xp: xp };
    return d;
  }

  // Objectifs du mandat : ce qu'il faut réussir pour gagner, toujours visible
  function carteObjectifs() {
    var ob = M.objectifs(st); if (!ob.length) return null;
    var cr = M.criseEnCours(st), n = ob.filter(function (o) { return o.ok; }).length, d = h("div", "mx-objectifs");
    ajout(d, ajout(h("div", "mx-pt"), h("strong", null, "🎯 Objectifs du mandat"), h("b", "mx-objn" + (n >= 2 ? " mx-objbon" : ""), n + "/" + ob.length)));
    if (cr) d.appendChild(h("small", "mx-criseinfo", cr.ico + " " + cr.nom + " · " + cr.txt));
    ob.forEach(function (o) {
      var l = h("div", "mx-objl" + (o.ok ? " mx-ok" : ""));
      var etat = o.ok ? (o.garde ? "✔ à tenir" : "✔") : o.inverse ? o.cur + " M€ (max " + o.but + ")" : o.cur + " / " + o.but;
      ajout(l, h("span", null, o.ico), h("span", null, o.txt), h("b", null, etat));
      d.appendChild(l);
    });
    return d;
  }
  // Tableau de bord : le sondage en grand (c'est lui qui décide de l'élection) et trois chiffres
  function tableau() {
    var v = M.sondage(st), etat = v > 52 ? "bien" : v > 48 ? "juste" : "mal", so = M.solde(st);
    var d = h("div", "mx-tableau mx-" + etat);
    var gauche = ajout(h("div", "mx-sond"), h("b", null, virg(v) + " %"), h("small", null, etat === "bien" ? "Sondage · tu serais réélu" : etat === "juste" ? "Sondage · au coude-à-coude" : "Sondage · tu serais battu"));
    function stat(ico, val, lib, alerte, cls) { var e = h("div", "mx-stat" + (alerte ? " mx-alerte" : "") + (cls ? " " + cls : "")); ajout(e, h("span", null, ico), h("b", null, val), h("small", null, lib)); return e; }
    var g = h("div", "mx-stats");
    ajout(g, stat("💰", argent(st.tresor), (so >= 0 ? "+" : "") + argent(so) + "/trim." + (st.dette > 0 ? " · dette " + argent(st.dette) : ""), st.dette > M.PLAFOND_DETTE * 0.6 || so < 0),
      stat("😊", String(Math.round(M.bonheur(st))), "bonheur", M.bonheur(st) < 40),
      stat("📣", String(Math.round(st.pop)), "popularité", st.pop < 40));
    if (st.meca.ligne) g.appendChild(stat("🧭", String(Math.round(st.coh)), "cohérence", st.coh < 40, "mx-coh"));
    ajout(d, gauche, g);
    return d;
  }

  function piliers() {
    var d = h("div", "mx-piliers"), c = M.cible(st);
    Object.keys(M.PILIERS).forEach(function (k) {
      var v = st.piliers[k], prom = st.ambitions.indexOf(k) >= 0, fl = c[k] > v + 0.5 ? "↗" : c[k] < v - 0.5 ? "↘" : "";
      var p = h("div", "mx-pilier" + (prom ? " mx-prom" : ""));
      var barre = h("div", "mx-barre"), r = h("i"); r.style.width = v + "%"; r.style.background = couleur(v); barre.appendChild(r);
      if (prom) { var cible = h("em"); cible.style.left = M.P.ambSeuil + "%"; barre.appendChild(cible); }
      ajout(p, h("span", "mx-pico", M.ICO[k]), ajout(h("div"), ajout(h("div", "mx-pt"), h("span", null, M.PILIERS[k] + (prom ? " 🎯" : "")), h("b", null, Math.round(v) + (fl ? " " + fl : ""))), barre));
      d.appendChild(p);
    });
    return d;
  }

  function bandeauOpp() {
    var o = M.opposant(st), tm = M.trimMandat(st), proch = (Math.floor(tm / 4) + 1) * 4 - tm;
    var b = h("div", "mx-opp" + (o.actif ? "" : " mx-opp-fini"));
    ajout(b, h("span", null, o.ico), h("strong", null, o.nom), h("small", null, o.actif ? "⚔️ " + Math.round(o.force) + "/100 · attaque dans " + proch + " trim." : "a renoncé"));
    return b;
  }

  function notes() {
    var r = h("div", "mx-notes");
    st.notes.slice(0, 3).forEach(function (x) { var p = h("div", "mx-note"); p.appendChild(h("p", null, "⏳ " + x.txt)); variations(x.d, p); r.appendChild(p); });
    return r;
  }
  // Ce que le bâtiment apporte en plus des piliers : c'est ce qui le rend unique
  function atouts(B) {
    var l = [];
    if (B.popT) l.push("📣 +" + virg(B.popT) + " popularité / trim.");
    if (B.vote) l.push("🗳️ +" + virg(B.vote) + " pt au sondage");
    Object.keys(B.usure || {}).forEach(function (k) { l.push(M.ICO[k] + " s’use " + Math.round(B.usure[k] * 100) + " % moins vite"); });
    if (B.entretienPct) l.push("🧾 −" + B.entretienPct + " % d’entretien partout");
    if (B.interet) l.push("🏦 −" + Math.round(B.interet * 100) + " % d’intérêts");
    if (B.cata) l.push("🚒 −" + Math.round(B.cata * 100) + " % de dégâts des catastrophes");
    if (B.chaosT) l.push("🌙 calme le chaos parisien");
    if (B.eco) l.push("📈 économie +" + B.eco);
    return l;
  }

  // Effet principal en une ligne (piliers et recettes) ; le reste est dans la fiche
  // Illustration du bâtiment si elle existe, sinon son emoji
  var DESSINS = {}; (M.C.ILLUSTRES || []).forEach(function (id) { DESSINS[id] = 1; });
  function srcBat(id) { return "maire/img/bat/" + id + ".webp"; }
  function icone(id, cls) {
    if (!DESSINS[id]) return h("span", cls, M.BATIMENTS[id].ico);
    var i = h("img", cls + " mx-img"); i.src = srcBat(id); i.alt = ""; i.loading = "lazy"; i.decoding = "async"; i.width = 96; i.height = 96; return i;
  }
  function effetCourt(id) {
    var B = M.BATIMENTS[id], ga = M.gainAchat(st, id), l = Object.keys(ga).filter(function (k) { return Math.abs(ga[k]) >= 0.1; })
      .map(function (k) { return (ga[k] >= 0 ? "+" : "−") + virg(Math.abs(ga[k])) + M.ICO[k]; });
    if (B.rev) l.push("+" + B.rev + " M€/t");
    return l.slice(0, 3).join(" ");
  }
  function acheterBat(id) {
    var B = M.BATIMENTS[id];
    G.marquerGuide("bat-" + id);
    if (B.enchere) { if (!M.peutEncherir(st, id)) enchere(id); return; }
    if (M.peutAcheter(st, id)) return;
    st = M.acheter(st, id); sauver(); signal("achat"); jeu(); toast(B.ico + " " + B.nom + (B.projet ? " : chantier lancé !" : " construit !"));
  }
  // Carte compacte : on touche pour construire ; « i » ouvre la fiche
  function carteBat(id) {
    var B = M.BATIMENTS[id], ench = !!B.enchere, non = ench ? M.peutEncherir(st, id) : M.peutAcheter(st, id), deja = st.bat[id] || 0;
    var px = B.projet ? Math.round(M.coutBat(st, id) * 0.3) : ench ? B.cout : M.prix(st, id);
    var neuf = (B.niv > 1 || B.secret || B.projet || B.si) && !G.guideVu("bat-" + id) && !deja;
    var c = h("div", "mx-batc");
    var b = bouton("", "mx-bat" + (ench ? " mx-ench" : B.projet ? " mx-projet" : B.secret || B.pass ? " mx-rare" : "") + (neuf ? " mx-new" : ""), function () { acheterBat(id); });
    b.disabled = !!non;
    var prix = ench ? "🔨 ≈ " + argent(px) : B.projet ? argent(px) + " + tranches" : argent(px);
    ajout(b, icone(id, "mx-bico"), h("strong", null, B.nom), h("span", "mx-eff", effetCourt(id) || "✨ atout spécial"),
      h("small", "mx-prix" + (non && /argent/.test(non) ? " mx-cher" : ""), non && !/argent/.test(non) ? non.replace(/\.$/, "") : prix),
      deja && !B.unique ? h("em", null, "×" + deja) : null, neuf ? h("i", "mx-neuf", "Nouveau") : null);
    var info = bouton("i", "mx-info", function () { fiche(id); }); info.setAttribute("aria-label", "Détails : " + B.nom);
    ajout(c, b, info);
    return c;
  }
  // Fiche d'un bâtiment : tout le détail, seulement quand on le demande
  function fiche(id) {
    var B = M.BATIMENTS[id], ench = !!B.enchere, non = ench ? M.peutEncherir(st, id) : M.peutAcheter(st, id), dispo = M.disponible(st, id);
    var m = h("div", "m-pop mx-fichepop"), c = h("div", "mx-fiche");
    function fermer() { m.remove(); document.body.classList.remove("m-modal"); }
    m.onclick = function (e) { if (e.target === m) fermer(); };
    ajout(c, ajout(h("div", "m-tel-tete"), h("strong", null, (DESSINS[id] ? "" : B.ico + " ") + B.nom), bouton("✕", "m-leonx", fermer)));
    if (DESSINS[id]) c.appendChild(icone(id, "mx-fimg"));
    if (B.txt) c.appendChild(h("p", "mx-ftxt", B.txt));
    var l = h("ul", "mx-fl"), ga = M.gainAchat(st, id);
    Object.keys(ga).forEach(function (k) { l.appendChild(h("li", null, M.ICO[k] + " " + M.PILIERS[k] + " : " + (ga[k] >= 0 ? "+" : "−") + virg(Math.abs(ga[k])))); });
    if (B.rev) l.appendChild(h("li", null, "💶 Recettes : +" + B.rev + " M€ par trimestre"));
    if (B.pop) l.appendChild(h("li", null, "📣 Popularité : +" + B.pop + " à l’inauguration"));
    atouts(B).forEach(function (t) { l.appendChild(h("li", null, t)); });
    l.appendChild(h("li", "mx-fcout", ench ? "🔨 Aux enchères · prix moyen ≈ " + argent(B.cout) : B.projet ? "🏗️ " + argent(M.coutBat(st, id)) + " au total, 30 % au lancement, " + B.duree + " trimestres de travaux" : "💰 " + argent(M.prix(st, id)) + (B.ent ? " · entretien " + argent(B.ent) + "/trim." : "")));
    c.appendChild(l);
    if (!dispo) { var u = h("ul", "m-prereq"); M.prerequis(st, id).forEach(function (x) { u.appendChild(h("li", x.ok ? "m-ok" : "", (x.ok ? "✔ " : "🔒 ") + x.txt)); }); if (B.pass && !B.si) u.appendChild(h("li", null, "🎟️ " + (B.obtenu || "Récompense du pass de combat."))); c.appendChild(u); }
    var go = bouton(ench ? "🔨 Enchérir" : B.projet ? "🏗️ Lancer le chantier" : "Construire", "btn m-go", function () { fermer(); acheterBat(id); });
    go.disabled = !!non;
    ajout(c, go, non ? h("small", "m-aide", non) : null);
    m.appendChild(c); (document.getElementById("g-maire") || document.body).appendChild(m); document.body.classList.add("m-modal");
  }
  // Bâtiment pas encore disponible : ce qui manque (niveau, trimestres, réélection), avec une barre pour l'objectif de partie
  // Bâtiment pas encore disponible : tous ses prérequis (niveau, trimestres, réélection, bâtiments), cochés ou non

  // Bâtiment pas encore disponible : une ligne, ce qui manque ; la fiche donne le détail
  function verrou(id) {
    var B = M.BATIMENTS[id], manque = M.prerequis(st, id).filter(function (x) { return !x.ok; });
    var txt = B.pass && !manque.length ? "🎟️ " + (B.obtenu ? "série de 7 jours" : "pass de combat") : manque.map(function (x) { return x.k === "niv" ? "niv. " + x.but : x.k === "t" ? (x.but - x.cur) + " trim." : x.k === "reel" ? x.but + " réélection" + (x.but > 1 ? "s" : "") : x.txt.replace("Construis d’abord ", "après "); }).join(" · ");
    var l = bouton("", "mx-lock", function () { fiche(id); });
    ajout(l, h("span", null, "🔒 " + B.ico + " " + B.nom), h("small", null, txt));
    return l;
  }
  // Boutique rangée par rayons : on ouvre d'abord celui du pilier le plus faible
  var RAYON = null, gestionOuverte = false;
  function rayonDe(id) { return M.BATIMENTS[id].cat; }

  function boutique() {
    var d = h("div", "mx-boutique"), n = st.nivJ;
    d.appendChild(h("h5", null, "🛒 Construire"));
    if (window.ADMIN_UNLOCKED) d.appendChild(bouton(st.sansLimite ? "🛠 Limites désactivées (admin)" : "🛠 Passer les limites pour les bâtiments", "btn m-sec m-adminbat", function () {
      st = M.limites(st, !st.sansLimite); try { localStorage.setItem("maire_sanslimite", st.sansLimite ? "1" : ""); } catch (e) {} sauver(); jeu();
    }));
    var ids = Object.keys(M.BATIMENTS), visibles = M.RAYONS.filter(function (r) {
      if (r.id === "secret") return ids.some(function (id) { return rayonDe(id) === "secret" && M.disponible(st, id); });
      if (r.id === "projet") return st.meca.grandsProjets || st.sansLimite || n >= 4;
      return true;
    });
    if (!RAYON || !visibles.some(function (r) { return r.id === RAYON; })) RAYON = Object.keys(M.PILIERS).sort(function (a, b) { return st.piliers[a] - st.piliers[b]; })[0];
    var onglets = h("div", "mx-rayons"); onglets.setAttribute("role", "tablist");
    visibles.forEach(function (r) {
      var l = ids.filter(function (id) { return rayonDe(id) === r.id; }), ok = l.filter(function (id) { return M.disponible(st, id); });
      var neuf = ok.some(function (id) { return !G.guideVu("bat-" + id) && !st.bat[id] && (M.BATIMENTS[id].niv > 1 || M.BATIMENTS[id].si); });
      var t = bouton("", "mx-rayon" + (neuf ? " mx-rayon-neuf" : ""), function () { RAYON = r.id; var y = window.scrollY; jeu(); window.scrollTo(0, y); });
      t.setAttribute("role", "tab"); t.setAttribute("aria-selected", r.id === RAYON); t.title = r.nom;
      ajout(t, h("span", null, r.ico), h("small", null, r.nom));
      onglets.appendChild(t);
    });
    d.appendChild(onglets);
    var l = ids.filter(function (id) { return rayonDe(id) === RAYON; });
    var tri = function (a, b) { var A = M.BATIMENTS[a], B = M.BATIMENTS[b]; return (A.niv || 1) - (B.niv || 1) || A.cout - B.cout; };
    var ok = l.filter(function (id) { return M.disponible(st, id); }).sort(tri), bloques = l.filter(function (id) { return !M.disponible(st, id); }).sort(tri);
    if (RAYON === "enchere") d.appendChild(h("p", "mx-aide", "🔨 30 secondes d’enchères contre une ville voisine."));
    var g = h("div", "mx-bats");
    ok.forEach(function (id) { g.appendChild(carteBat(id)); });
    if (!ok.length) g.appendChild(h("p", "mx-aide", "Rien à construire ici pour l’instant."));
    d.appendChild(g);
    // Les 3 prochains seulement ; le reste est compté
    var proches = bloques.slice(0, 3), loin = bloques.length - proches.length;
    if (proches.length) { var b = h("div", "mx-bientot"); b.appendChild(h("small", null, "Bientôt")); proches.forEach(function (id) { b.appendChild(verrou(id)); }); if (loin) b.appendChild(h("small", null, "+ " + loin + " à découvrir")); d.appendChild(b); }
    return d;
  }

  // ---------- Enchères : 30 secondes contre une ville voisine ----------
  var ENCH = null;   // enchère affichée : { fin (horloge), attente (la ville réfléchit), minuteur }
  function fermerEnchUI() { var m = document.getElementById("m-enchmod"); if (m) m.remove(); document.body.classList.remove("m-modal"); if (ENCH && ENCH.minuteur) clearInterval(ENCH.minuteur); ENCH = null; }
  function enchere(id) {
    st = M.ouvrirEnchere(st, id); sauver();
    if (!st.enchere) return;
    ENCH = { fin: Date.now() + 30000, attente: 0, vu: st.enchere.v };
    if (notifActive) notifActive.fermer();
    afficherEnchere();
    ENCH.minuteur = setInterval(tic, 100);
  }
  function tic() {
    if (!ENCH || !st.enchere) return;
    if (st.enchere.fini) { clearInterval(ENCH.minuteur); return; }
    var reste = ENCH.fin - Date.now();
    if (ENCH.attente && Date.now() >= ENCH.attente) { ENCH.attente = 0; ENCH.vu = st.enchere.v; afficherEnchere(); }
    var c = document.getElementById("m-ench-temps");
    if (c) {
      c.textContent = Math.max(0, Math.ceil(reste / 1000)) + " s";
      var bar = document.getElementById("m-ench-barre"); if (bar) bar.style.width = Math.max(0, reste / 300) + "%";
      document.getElementById("m-enchmod").classList.toggle("m-ench-urgent", reste < 8000);
    }
    if (reste <= 0) { clearInterval(ENCH.minuteur); ENCH.attente = 0; st = M.finirEnchere(st); sauver(); afficherEnchere(); }
  }
  function afficherEnchere() {
    var e = st.enchere; if (!e) return fermerEnchUI();
    var B = M.BATIMENTS[e.id], m = document.getElementById("m-enchmod");
    if (!m) { m = h("div", "m-pop m-pop-enchere"); m.id = "m-enchmod"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); (document.getElementById("g-maire") || document.body).appendChild(m); document.body.classList.add("m-modal"); }
    m.innerHTML = "";
    var c = h("div", "m-pop-in m-ench");
    ajout(c, h("p", "m-sur", "🔨 Enchère face à " + e.ville), h("h4", null, B.ico + " " + B.nom));
    if (!e.fini) {
      var vVu = ENCH && ENCH.attente ? ENCH.vu : e.v, toiTete = e.j > vVu;
      var tps = h("div", "m-ench-tps"), barre = h("div", "m-barre"), i = h("i"); i.id = "m-ench-barre"; barre.appendChild(i);
      var nb = h("b", null, Math.max(0, Math.ceil(((ENCH ? ENCH.fin : Date.now()) - Date.now()) / 1000)) + " s"); nb.id = "m-ench-temps";
      ajout(tps, ajout(h("div", "m-jt"), h("span", null, "⏱️ Temps restant"), nb), barre); c.appendChild(tps);
      c.appendChild(h("p", "m-ench-moyen", "💡 Prix moyen de vente : ≈ " + argent(e.moyen) + ". Au-delà, tu paies plus cher que la normale."));
      var t = h("div", "m-ench-tete " + (toiTete ? "m-ench-toi" : "m-ench-eux"));
      ajout(t, h("span", null, toiTete ? "🙋 Tu mènes" : "🏙️ " + e.ville + " mène"), h("strong", null, argent(toiTete ? e.j : vVu)));
      c.appendChild(t);
      if (ENCH && ENCH.attente) c.appendChild(h("p", "m-ench-reflexion", "🤔 " + e.ville + " réfléchit…"));
      var budget = M.budgetEnchere(st), base = Math.max(e.v, e.j), g = h("div", "m-ench-btns");
      [1, 2, 5].forEach(function (k) {
        var montant = base + k * e.pas;
        var bt = bouton("+" + argent(k * e.pas) + "\n= " + argent(montant), "btn m-go", function () {
          if (!st.enchere || st.enchere.fini || (ENCH && ENCH.attente)) return;
          var v0 = st.enchere.v; st = M.encherir(st, montant); sauver();
          if (st.enchere.v > v0) {
            var reste = ENCH.fin - Date.now();
            ENCH.vu = v0; ENCH.attente = Date.now() + Math.max(150, Math.min(500 + Math.random() * 1000, reste - 300));
          } else ENCH.vu = st.enchere.v;
          afficherEnchere();
        });
        bt.disabled = toiTete || montant > budget || !!(ENCH && ENCH.attente);
        g.appendChild(bt);
      });
      c.appendChild(g);
      c.appendChild(h("small", "m-aide", "Ton budget maximum : " + argent(budget) + " (trésorerie + emprunt possible)."));
      var hist = h("ul", "m-ench-hist");
      e.offres.slice(-6).reverse().forEach(function (o, k) {
        if (o.qui === "v" && ENCH && ENCH.attente && k === 0) return;
        hist.appendChild(h("li", o.qui === "j" ? "m-ench-j" : "", (o.qui === "j" ? "🙋 Toi" : "🏙️ " + e.ville) + " : " + argent(o.m)));
      });
      c.appendChild(hist);
      c.appendChild(bouton("Abandonner", "btn m-sec", function () { if (ENCH) clearInterval(ENCH.minuteur); st = M.finirEnchere(st); sauver(); afficherEnchere(); }));
    } else {
      var r = e.res, ecart = r.prix - e.moyen;
      c.classList.add(r.gagne ? "m-ench-gagne" : "m-ench-perdu");
      ajout(c, h("p", "m-ench-res", r.gagne ? "🔨 Adjugé ! Paris l’emporte." : "❌ " + e.ville + " l’emporte."),
        h("p", null, r.gagne ? B.nom + " est à toi pour " + argent(r.prix) + " (" + (ecart <= 0 ? "une bonne affaire : " + argent(-ecart) + " sous le prix moyen" : argent(ecart) + " au-dessus du prix moyen") + ")."
          : B.nom + " part à " + e.ville + " pour " + argent(r.prix) + ". Il reviendra aux enchères dans 4 trimestres."),
        bouton("Retour à l’Hôtel de Ville", "btn m-go", function () { st = M.fermerEnchere(st); sauver(); fermerEnchUI(); jeu(); }));
      if (r.gagne) toast(B.ico + " " + B.nom + " rejoint Paris !");
    }
    m.appendChild(c);
    tic();
  }
  // Enchère interrompue (page rechargée) : le temps est écoulé, la meilleure offre l'emporte
  function reprendreEnchere() {
    if (!st.enchere || ENCH) return;
    if (!st.enchere.fini) { st = M.finirEnchere(st); sauver(); }
    ENCH = { fin: 0, attente: 0, vu: st.enchere.v };
    afficherEnchere();
  }


  // Gestion repliée : impôts, combos, historique et options de la partie
  function gestion() {
    var d = h("details", "mx-gestion"); d.open = gestionOuverte; d.ontoggle = function () { gestionOuverte = d.open; };
    d.appendChild(h("summary", null, "⚙️ Gestion de la ville"));
    if (st.meca.budget) {
      var c = h("div", "mx-impots"), val = h("b", null, Math.round(st.taux * 100) + " %");
      var r = h("input"); r.type = "range"; r.min = 80; r.max = 130; r.step = 5; r.value = Math.round(st.taux * 100); r.setAttribute("aria-label", "Impôts locaux");
      r.disabled = !!(st.scenario && st.scenario.tauxBloque);
      r.oninput = function () { val.textContent = r.value + " %"; };
      r.onchange = function () { st = M.regler(st, { taux: r.value / 100 }); sauver(); signal("regler"); jeu(); };
      ajout(c, ajout(h("div", "mx-pt"), h("span", null, "💶 Impôts"), val), r, h("small", null, "Recettes " + argent(M.recettes(st)) + " · dépenses " + argent(M.depenses(st)) + " par trimestre. Plus d’impôts : plus d’argent, moins de popularité."));
      d.appendChild(c);
    }
    if (st.meca.combos) {
      var act = M.combosActifs(st), cb = h("div", "mx-combos");
      cb.appendChild(h("strong", null, "🧩 Combos (" + act.length + " actif" + (act.length > 1 ? "s" : "") + ")"));
      Object.keys(M.C.COMBOS).forEach(function (k) {
        var o = M.C.COMBOS[k], connu = st.combos.indexOf(k) >= 0 || G.lire().combos[k];
        cb.appendChild(h("small", act.indexOf(k) >= 0 ? "m-ok" : "", (act.indexOf(k) >= 0 ? "✅ " : connu ? "◻️ " : "❔ ") + (connu ? o.nom + " : " + texteCombo(k) : o.indice)));
      });
      d.appendChild(cb);
    }
    var j = h("details", "mx-histo"); j.appendChild(h("summary", null, "📜 Dernières décisions"));
    if (!st.historique.length) j.appendChild(h("p", "m-vide", "Aucune décision pour l’instant."));
    else {
      var l = h("ol", "m-histo");
      st.historique.slice().reverse().slice(0, 30).forEach(function (x) {
        var li = h("li"); ajout(li, h("span", "m-hs", "T" + x.t), h("strong", null, (x.sp === "catastrophe" ? "🚨 " : x.sp === "chance" ? "🍀 " : x.sp === "opposition" ? "⚔️ " : "") + x.titre), h("span", "m-hc", x.choix));
        if (x.c !== "achat") variations(x.d, li);
        l.appendChild(li);
      });
      j.appendChild(l);
    }
    d.appendChild(j);
    d.appendChild(ajout(h("div", "mx-quitter"),
      bouton("🏠 Menu principal", "btn m-sec", function () { sauver(); fermerModale(); accueil(); haut(); }),
      bouton("🚪 Démissionner", "btn m-sec m-demission", function () {
        if (!confirm("Démissionner ? La partie s’arrête ici : tu gardes l’XP de ce que tu as déjà accompli.")) return;
        st = M.demissionner(st); sauver(); jeu();
      })));
    return d;
  }
  function barreTrimestre() {
    var b = h("div", "m-barmois");
    var cartes = (st.bj && !st.bj.fini) || (st.enchere && !st.enchere.fini);
    b.appendChild(bouton(st.phase === "evenement" ? "📂 Un dossier t’attend" : cartes ? "🃏 Une partie de cartes est en cours" : "Trimestre suivant →", "btn m-go", function () {
      if (st.phase === "evenement" || (st.resultat && !st.resultatVu)) return modale();
      if (st.bj && !st.bj.fini) return ouvrirTelephone();
      st = M.debutTour(st, BASE); sauver(); signal("trimestre"); jeu();
    }));
    return b;
  }
  function variations(d, parent) {
    var l = h("ul", "m-delta");
    function puce(v, txt) { if (!v) return; l.appendChild(h("li", v > 0 ? "m-up" : "m-down", txt)); }
    if (d) {
      puce(d.pop, signe(d.pop) + " popularité"); puce(d.bon, signe(d.bon) + " humeur"); puce(d.coh, signe(d.coh) + " cohérence");
      if (d.bud) puce(d.bud, (d.bud > 0 ? "+" : "") + argent(d.bud));
      Object.keys(d.pil || {}).forEach(function (k) { puce(d.pil[k], signe(d.pil[k]) + " " + M.ICO[k]); });
      (d.rec || []).forEach(function (r) { puce(r.m, (r.m > 0 ? "+" : "−") + argent(Math.abs(r.m)) + "/trim. pendant " + r.n + " trim."); });
      if (d.mod && d.mod.entretien) puce(d.mod.entretien < 1 ? 1 : -1, (d.mod.entretien < 1 ? "−" : "+") + Math.round(Math.abs(1 - d.mod.entretien) * 100) + " % d’entretien pour toujours");
      if (d.mod && d.mod.recettes) puce(d.mod.recettes, signe(d.mod.recettes) + " M€ de recettes par trimestre pour toujours");
    }
    if (l.children.length) parent.appendChild(l);
  }
  function toast(t) {
    var x = h("div", "m-toast", t); (document.getElementById("g-maire") || document.body).appendChild(x);
    setTimeout(function () { x.classList.add("m-toast-out"); }, 1600); setTimeout(function () { x.remove(); }, 2100);
  }

  // ---------- Progression en pleine partie : XP, niveaux, succès et quêtes ----------
  // Après chaque action : le profil reçoit l'XP, les succès et quêtes réussis sont rangés, et on prépare l'affichage

  // Après chaque action : le profil reçoit l'XP ; les réussites s'annoncent par de petites pastilles discrètes (regroupées)
  function progresser() {
    if (!st || st.prog) return;
    var r = G.suivrePartie(st, M, { quetes: quetesAuj() });
    st = r.st;
    var montees = st.montees || [];
    if (montees.length) st = M.viderMontees(st);
    sauver();
    montees.forEach(function (m) { notifier({ type: "niveau", m: m }); });
    var xp = 0; r.succes.forEach(function (x) { xp += G.XP_TIER[x.t]; });
    if (r.succes.length === 1) notifier({ type: "fait", txt: "🏆 " + r.succes[0].nom + " · +" + xp + " XP", titre: r.succes[0].desc });
    else if (r.succes.length > 1) notifier({ type: "fait", txt: "🏆 " + r.succes.length + " succès débloqués · +" + xp + " XP", titre: r.succes.map(function (x) { return x.nom; }).join(", ") });
    r.chapitres.forEach(function (c) { notifier({ type: "fait", txt: "📖 Chapitre " + c.num + " accompli · +" + G.XP_CHAPITRE + " XP" }); });
    r.quetes.forEach(function (q) { notifier({ type: "fait", txt: "🎯 Quête du jour réussie · +" + q.xp + " XP", titre: q.t }); });
    r.journaliers.forEach(function (d) { notifier({ type: "fait", txt: "🌞 Succès du jour · +" + d.xp + " XP", titre: d.t }); });
    if (r.parfait) notifier({ type: "fait", txt: "🌞 Journée parfaite · +200 🎟️" });
    if (r.joker) notifier({ type: "fait", txt: "🃏 Joker utilisé : ta série est sauvée" });
    if (r.serie) notifier({ type: "fait", txt: "🔥 " + r.serie.n + " jour" + (r.serie.n > 1 ? "s" : "") + " d’affilée", titre: r.serie.txt });
    r.pass.forEach(function (x) { notifier({ type: "fait", txt: "🎟️ Palier " + x.n + " du pass", titre: x.txt }); });
  }
  // File d'affichage : un niveau passe avant les petites pastilles ; elles ne s'empilent jamais au-delà de 4
  var FILE = [], notifActive = null;
  function notifier(n) {
    if (n.type === "niveau") FILE.unshift(n); else if (FILE.length < 4) FILE.push(n);
    if (!notifActive) suivante();
  }
  function suivante() {
    var n = FILE.shift(); notifActive = null;
    if (!n) return;
    // Pendant une enchère, rien ne vient cacher le chrono : les annonces attendent la fin
    if (st && st.enchere && !st.enchere.fini && document.getElementById("m-enchmod")) {
      FILE.unshift(n); notifActive = { type: "pause", fermer: function () {} };
      setTimeout(function () { notifActive = null; suivante(); }, 800); return;
    }
    var el, duree;
    if (n.type === "niveau") {
      // Nouveau niveau (ou objectif rempli) : une carte courte, ce qui arrive en boutique sur une ligne
      var m = n.m, quoi = m.bats.map(function (id) { return M.BATIMENTS[id].ico + " " + M.BATIMENTS[id].nom; }).concat(m.meca.map(function (t) { return "✨ " + t; }));
      el = h("div", "m-notif mx-niveau");
      ajout(el, h("strong", null, m.n ? "⬆️ Niveau " + m.n : "🔓 Nouveau en boutique"), quoi.length ? h("span", null, quoi.slice(0, 3).join(" · ") + (quoi.length > 3 ? " +" + (quoi.length - 3) : "")) : null,
        m.plusTard.length ? h("small", null, "🔜 " + m.plusTard.join(", ") + " : à la prochaine partie") : null);
      duree = 3200;
    } else {
      el = h("div", "m-notif mx-mini", n.txt); if (n.titre) el.title = n.titre;
      duree = FILE.length ? 1500 : 2300;
    }
    el.setAttribute("role", "status");
    var fini = false;
    function fermer() { if (fini) return; fini = true; el.classList.add("m-notif-out"); setTimeout(function () { el.remove(); suivante(); }, 300); }
    notifActive = { type: n.type, fermer: fermer };
    el.onclick = fermer;
    (document.getElementById("g-maire") || document.body).appendChild(el);
    setTimeout(fermer, duree);
  }

  // ---------- Guide intégré : une bulle pointe l'élément à utiliser, on avance en faisant l'action ----------
  // Chaque séquence : où elle peut se lancer (ecran), quand (si), et ses étapes { q: élément visé, t: une phrase, a: action attendue }.
  // a = "ok" : un bouton OK dans la bulle (ou toucher l'élément) suffit.
  var GUIDES = [
    { id: "base", ecran: "modale", si: function () { return st.phase === "evenement" && !st.special; }, etapes: [
      { q: "#m-modale .m-choix", t: "📂 Un dossier arrive chaque trimestre. Choisis une réponse.", a: "choix" },
      { q: "#m-modale .m-delta, #m-modale .m-res", t: "Voilà les conséquences de ta décision.", a: "ok" },
      { q: "#m-modale .m-go", t: "Retourne à l’Hôtel de Ville.", a: "fermer" },
      { q: ".mx-tableau", t: "🗳️ Ton but : rester au-dessus de 50 % jusqu’à l’élection.", a: "ok" },
      { q: ".mx-piliers", t: "Ces 4 piliers font le bonheur des Parisiens. Ils baissent avec le temps.", a: "ok" },
      { q: ".mx-bat:not(:disabled)", t: "🛒 Achète un bâtiment pour faire monter un pilier.", a: "achat" },
      { q: ".m-barmois .btn", t: "Bravo ! Passe au trimestre suivant.", a: "trimestre" }] },
    { id: "budget", ecran: "jeu", si: function () { return st.meca.budget && st.phase === "gestion"; }, etapes: [
      { q: ".mx-gestion summary", t: "💶 Nouveau : les impôts ! Règle-les dans « Gestion de la ville ».", a: "ok" }] },
    { id: "opposant", ecran: "jeu", si: function () { return st.meca.opposant && st.opposant && st.phase === "gestion"; }, etapes: [
      { q: ".mx-opp", t: "⚔️ Ton opposant attaque une fois par an. Son influence fait baisser ton sondage.", a: "ok" }] },
    { id: "attaque", ecran: "modale", si: function () { return st.special === "opposition" && st.phase === "evenement"; }, etapes: [
      { q: "#m-modale .m-choix", t: "Riposte, tente de le faire tomber… ou laisse faire, il reviendra plus fort.", a: "choix" }] },
    { id: "cata", ecran: "modale", si: function () { return st.special === "catastrophe" && st.phase === "evenement"; }, etapes: [
      { q: "#m-modale .m-choix", t: "🚨 Une catastrophe ! Choisis comment limiter les dégâts.", a: "choix" }] },
    { id: "chance", ecran: "modale", si: function () { return st.special === "chance" && st.phase === "evenement"; }, etapes: [
      { q: "#m-modale .m-choix", t: "🍀 Un coup de chance ! À toi d’en profiter.", a: "choix" }] },
    { id: "promesses-crea", ecran: "creation", si: function () { return !!document.querySelector(".m-ambs"); }, etapes: [
      { q: ".m-ambs", t: "🎯 Choisis 2 piliers à promettre aux Parisiens.", a: "ok" }] },
    { id: "promesses", ecran: "jeu", si: function () { return st.ambitions.length && st.phase === "gestion"; }, etapes: [
      { q: ".mx-prom", t: "🎯 Ta promesse : dépasse le trait blanc avant l’élection pour gagner des voix.", a: "ok" }] },
    { id: "ligne-crea", ecran: "creation", si: function () { return !!document.querySelector(".m-lignes"); }, etapes: [
      { q: ".m-lignes", t: "🧭 Choisis ton camp politique.", a: "ok" }] },
    { id: "ligne", ecran: "jeu", si: function () { return st.meca.ligne && st.phase === "gestion"; }, etapes: [
      { q: ".mx-coh", t: "🧭 Reste fidèle à ton camp : ta cohérence soutient ta popularité.", a: "ok" }] },
    { id: "pari", ecran: "jeu", si: function () { return !!st.offre && st.phase === "gestion"; }, etapes: [
      { q: ".m-tel", t: "📱 Ton téléphone sonne : une proposition très risquée pour sauver les finances.", a: "ok" }] },
    { id: "chantier", ecran: "jeu", si: function () { return st.chantiers.length > 0 && st.phase === "gestion"; }, etapes: [
      { q: ".m-chantiers", t: "🏗️ Ton chantier avance chaque trimestre et se paie par tranches. Gare aux imprévus !", a: "ok" }] },
    { id: "rare", ecran: "modale", si: function () { return (st.special === "rare" || st.special === "legendaire") && st.phase === "evenement"; }, etapes: [
      { q: "#m-modale .m-choix", t: "✨ Un événement rare ! Aucune réponse n’est toujours la meilleure : à toi de jouer.", a: "choix" }] },
    { id: "xp", ecran: "jeu", si: function () { return st.phase === "gestion" && st.t >= 2 && !st.nivFixe; }, etapes: [
      { q: ".mx-xp", t: "⭐ Chaque trimestre, achat, élection ou succès te rapporte de l’XP. À chaque niveau, un nouveau bâtiment arrive en boutique !", a: "ok" }] },
    { id: "nouveautes", ecran: "jeu", si: function () { return st.phase === "gestion" && !!document.querySelector(".mx-bat.mx-new:not(:disabled)"); }, rejouable: 1, etapes: [
      { q: ".mx-bat.mx-new:not(:disabled)", t: "✨ Nouveau en boutique ! Essaie-le.", a: "ok" }] }
  ];
  var GA = null, BULLE = null;   // séquence en cours : { g, i }
  function guide(ecran) {
    if (ecran !== "creation" && (!st || st.phase === "fin")) return cacherBulle();
    if (!GA) {
      var g = GUIDES.filter(function (x) {
        if (x.ecran !== ecran || !x.si()) return false;
        var cle = x.rejouable ? x.id + "-" + (st ? st.nivJ : nivJ()) : x.id;
        return !G.guideVu(cle);
      })[0];
      if (!g) return cacherBulle();
      GA = { g: g, i: 0, cle: g.rejouable ? g.id + "-" + (st ? st.nivJ : nivJ()) : g.id };
    }
    montrerEtape();
  }
  function signal(a) {
    if (!GA) return;
    var e = GA.g.etapes[GA.i];
    if (e && e.a === a) avancer();
  }
  function avancer() {
    GA.i++;
    if (GA.i >= GA.g.etapes.length) { G.marquerGuide(GA.cle); GA = null; cacherBulle(); return; }
    setTimeout(montrerEtape, 60);
  }
  function cacherBulle() {
    if (BULLE) { BULLE.remove(); BULLE = null; }
    Array.prototype.forEach.call(document.querySelectorAll(".m-focus"), function (x) { x.classList.remove("m-focus"); });
  }
  function montrerEtape() {
    cacherBulle();
    if (!GA) return;
    var e = GA.g.etapes[GA.i], cible = document.querySelector(e.q);
    if (!cible) return;                           // l'élément n'est pas à l'écran : on attendra le prochain affichage
    cible.classList.add("m-focus");
    var dansModale = !!cible.closest("#m-modale");
    var b = h("div", "m-bulle" + (dansModale ? " m-bulle-fixe" : ""));
    ajout(b, h("span", "m-bulle-leon", "🧑‍💼"), h("p", null, e.t));
    var bas = h("div", "m-bulle-bas");
    if (e.a === "ok") bas.appendChild(bouton("OK", "m-bulle-ok", avancer));
    bas.appendChild(bouton("Passer le guide", "m-bulle-passer", function () { G.marquerGuide(GA.cle); GA = null; cacherBulle(); }));
    b.appendChild(bas);
    (dansModale ? document.getElementById("m-modale") : document.body).appendChild(b);
    BULLE = b;
    if (e.a === "ok") cible.addEventListener("click", function ok() { cible.removeEventListener("click", ok); if (BULLE === b) avancer(); });
    if (!dansModale) { var r0 = cible.getBoundingClientRect(); if (r0.top < 70 || r0.bottom > innerHeight - 120) cible.scrollIntoView({ block: "center", behavior: "smooth" }); }
    placer();
    setTimeout(placer, 350);
  }
  function placer() {
    if (!BULLE || !GA) return;
    var cible = document.querySelector(".m-focus"); if (!cible) return;
    var r = cible.getBoundingClientRect(), fixe = BULLE.classList.contains("m-bulle-fixe"), bh = BULLE.offsetHeight, bw = BULLE.offsetWidth;
    var dessous = r.bottom + bh + 16 < innerHeight || r.top < bh + 16;
    var top = dessous ? r.bottom + 12 : r.top - bh - 12, left = Math.max(10, Math.min(innerWidth - bw - 10, r.left + r.width / 2 - bw / 2));
    BULLE.classList.toggle("m-bulle-haut", !dessous);
    BULLE.style.top = (fixe ? top : top + scrollY) + "px"; BULLE.style.left = left + "px";
    BULLE.style.setProperty("--fl", Math.max(16, Math.min(bw - 16, r.left + r.width / 2 - left)) + "px");
  }
  window.addEventListener("scroll", function () { if (BULLE) placer(); }, { passive: true });
  window.addEventListener("resize", function () { if (BULLE) placer(); });

  // ---------- Dossier du trimestre : fenêtre au premier plan ----------
  var legendeVue = null;
  // ---------- Vote de la communauté : ce qu'ont choisi les autres maires sur le même dossier ----------
  var VOTE = null;
  function cleVote() { return st.evPerso ? st.evPerso.src || null : st.evenement; }
  function voter(cle, i) {
    if (!cle || !window.LB || !LB.db || !LB.uid || !window.firebase || !firebase.firestore) return null;
    var faits = {}; try { faits = JSON.parse(localStorage.getItem("maire_votes") || "{}"); } catch (e) {}
    var ref = LB.db.doc("votes/" + cle), inc = {}; inc["c" + i] = firebase.firestore.FieldValue.increment(1);
    var p = faits[cle] != null ? Promise.resolve() : ref.set(inc, { merge: true }).then(function () {
      faits[cle] = i; var ks = Object.keys(faits); if (ks.length > 400) delete faits[ks[0]];
      try { localStorage.setItem("maire_votes", JSON.stringify(faits)); } catch (e) {}
    });
    return p.catch(function () {}).then(function () { return ref.get(); }).then(function (sn) { return sn.exists ? sn.data() : null; }).catch(function () { return null; });
  }
  function afficherVote(carte, nb) {
    var v = VOTE; if (!v || v.t !== st.t) return;
    var zone = h("div", "m-vote"); zone.appendChild(h("small", null, "📊 Ce qu’ont choisi les autres maires…")); carte.appendChild(zone);
    v.p.then(function (d) {
      if (!d) return zone.remove();
      var c = []; for (var k = 0; k < nb; k++) c.push(d["c" + k] || 0);
      var tot = c.reduce(function (a, x) { return a + x; }, 0); zone.innerHTML = "";
      if (tot < 3) return zone.appendChild(h("small", null, "📊 Tu fais partie des tout premiers maires à trancher ce dossier."));
      var moi = Math.round(c[v.i] / tot * 100);
      zone.appendChild(h("p", null, "📊 " + moi + " % des maires ont fait le même choix que toi (" + tot + " votes)."));
      c.forEach(function (x, k) {
        var pc = Math.round(x / tot * 100), l = h("div", "m-vote-l" + (k === v.i ? " m-vote-moi" : "")), barre = h("div", "m-barre"), b = h("i"); b.style.width = pc + "%"; barre.appendChild(b);
        ajout(l, h("span", null, "ABCD"[k]), barre, h("b", null, pc + " %")); zone.appendChild(l);
      });
      if (moi < 20 && tot >= 10) { zone.appendChild(h("small", "m-vote-libre", "🦄 Esprit libre : tu vas à contre-courant !")); if (!v.note) { v.note = 1; G.noterVote(moi); } }
    });
  }
  function fermerModale() { var m = document.getElementById("m-modale"); if (m) m.remove(); document.body.classList.remove("m-modal"); cacherBulle(); }
  function modale() {
    fermerModale();
    var ev = M.evenementCourant(st, BASE);
    if (!ev || !(st.phase === "evenement" || (st.resultat && !st.resultatVu))) return;
    if (st.special === "legendaire" && st.phase === "evenement" && legendeVue !== st.t) { legendeVue = st.t; flash("🌟 ÉVÉNEMENT LÉGENDAIRE 🌟", "m-flash-legende"); }
    var sp = st.special || "dossier", pop = h("div", "m-pop m-pop-" + sp); pop.id = "m-modale";
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
    var cadre = h("div", "m-pop-in");
    var TITRES_POP = { catastrophe: "Alerte : une catastrophe frappe Paris", opposition: "Ton opposant passe à l’attaque", chance: "Bonne nouvelle pour Paris !",
      rare: "✨ Quelque chose d’inhabituel se produit…", legendaire: "🌟 Un événement légendaire !", historique: "📜 Une décision historique", suite: "🔁 Une vieille décision revient", chantier: "🏗️ Des nouvelles du chantier" };
    if (TITRES_POP[st.special]) cadre.appendChild(h("p", "m-pop-titre", TITRES_POP[st.special]));
    var carte = h("article", "m-dossier m-c-" + ev.cat);
    var LIB = { rare: "✨ Événement rare", legendaire: "🌟 Légendaire", politique: "🎭 Coup de théâtre", chantier: "🏗️ Chantier", historique: "📜 Décision historique", suite: "🔁 Le retour" };
    ajout(carte, h("p", "m-cat", (LIB[st.special] || M.FAMILLE[st.special || ev.cat] || "📂 Dossier") + " · " + date(st.t)), h("h4", null, ev.titre));
    if (ev.perso && M.C.PERSONNAGES[ev.perso]) { var pe = M.C.PERSONNAGES[ev.perso]; carte.appendChild(ajout(h("div", "m-perso"), h("span", null, pe.ico), h("small", null, pe.nom + " · " + pe.txt))); }
    if (st.phase === "evenement") {
      carte.appendChild(h("p", "m-desc", ev.desc));
      var ch = h("div", "m-choix");
      ev.choix.forEach(function (x, i) {
        var b = bouton("", "m-option", function () {
          if (st.phase !== "evenement") return;
          var cle = cleVote(), t = st.t, p = voter(cle, i); VOTE = p ? { t: t, i: i, p: p } : null;
          st = M.choisir(st, BASE, i); sauver(); signal("choix"); jeu();
        });
        ajout(b, h("span", "m-lettre", "ABCD"[i]), h("strong", null, x.t));
        ch.appendChild(b);
      });
      carte.appendChild(ch);
    } else {
      var r = st.resultat, x = ev.choix[r.i];
      ajout(carte, h("p", "m-pris", "Ta décision : " + x.t), h("p", "m-res", r.txt || x.r));
      variations(r.d, carte);
      if (r.surprise) carte.appendChild(h("p", "m-surprise", "⚡ Imprévu : " + r.surprise));
      (r.extra || []).forEach(function (t) { carte.appendChild(h("p", "m-extra", t)); });
      if (r.dif) carte.appendChild(h("p", "m-extra", "⏳ Cette décision aura encore des conséquences plus tard."));
      afficherVote(carte, ev.choix.length);
      carte.appendChild(bouton("Retour à l’Hôtel de Ville", "btn m-go", function () { st.resultatVu = true; sauver(); fermerModale(); signal("fermer"); if (st.phase === "fin") jeu(); else guide("jeu"); }));
    }
    cadre.appendChild(carte); pop.appendChild(cadre); (document.getElementById("g-maire") || document.body).appendChild(pop);
    document.body.classList.add("m-modal");
    var f = carte.querySelector("button"); if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 50);
    setTimeout(function () { guide("modale"); }, 30);
  }

  // ---------- Téléphone du maire et dernier pari ----------
  function fermerTel() { var m = document.getElementById("m-telmod"); if (m) m.remove(); document.body.classList.remove("m-modal"); cacherBulle(); }
  function carteJeu(c, cache) {
    var d = h("span", "m-carte-jeu" + (cache ? " m-cachee" : ""));
    if (!cache) { var v = c % 13 + 1, coul = Math.floor(c / 13); d.textContent = ({ 1: "A", 11: "V", 12: "D", 13: "R" })[v] || String(v); d.appendChild(h("i", null, ["♠", "♥", "♦", "♣"][coul])); if (coul === 1 || coul === 2) d.classList.add("m-rouge"); }
    return d;
  }
  function ouvrirTelephone(vue) {
    fermerTel(); fermerModale();
    if (st.messages.some(function (m) { return !m.lu; })) { st = M.lireMessages(st); sauver(); }
    var pop = h("div", "m-pop m-pop-tel"); pop.id = "m-telmod"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
    var cadre = h("div", "m-pop-in"), tel = h("article", "m-dossier m-tel-ecran");
    cadre.appendChild(tel); pop.appendChild(cadre); (document.getElementById("g-maire") || document.body).appendChild(pop);
    document.body.classList.add("m-modal");
    function retourJeu() { fermerTel(); jeu(); }
    function dessin(v) {
      tel.innerHTML = "";
      tel.appendChild(ajout(h("div", "m-tel-tete"), ajout(h("strong", "m-tel-titre"), imgTel("m-tel-img"), document.createTextNode(" Téléphone du maire")), bouton("✕", "m-leonx", retourJeu)));
      if (st.bj) return blackjack();
      if (st.pariRes && st.pariRes.t === st.t) return resultatPari();
      if (st.offre && v === "bj") return choisirMise("bj");
      if (st.offre && v === "roulette") return choisirMise("roulette");
      if (st.offre && (v === "investisseur" || v === "fonds")) return financement(v);
      if (st.offre) {
        var o = h("div", "m-offre");
        ajout(o, ajout(h("div", "m-leon m-leon-clair"), h("span", "m-leon-ico", "🧑‍💼"), h("p", null, "« " + M.C.LEON.pari[0] + " »")),
          h("p", "m-perso-ligne", "🎩 Monsieur Valentin peut avancer jusqu’à " + argent(st.offre.max ? M.pariMise(st) : 0) + ". Si la ville gagne, elle empoche la mise ; si elle perd, elle la lui doit (la mise s’ajoute à la dette)."),
          h("small", "m-aide-noir", "Argent fictif du jeu uniquement. L’offre expire à la fin du trimestre."));
        var g = h("div", "m-choix");
        if (M.pariMise(st) >= 20) {
          g.appendChild(option("🃏", "Le blackjack municipal", "Atteins 21 sans dépasser. Le croupier tire jusqu’à 17.", function () { dessin("bj"); }));
          g.appendChild(option("🎡", "La roulette de l’Hôtel de Ville", "Rouge ou noir ×2, une douzaine ×3, le zéro ×36.", function () { dessin("roulette"); }));
        }
        g.appendChild(option("💰", "L’investisseur mystérieux", "Gaspard Mallet propose de l’argent… avec des contreparties.", function () { dessin("investisseur"); }));
        g.appendChild(option("🏦", "Le fonds de secours", "Un prêt de secours, remboursé sur 4 ans.", function () { dessin("fonds"); }));
        g.appendChild(option("🙅", "Refuser poliment", "Léon approuve. Tu chercheras une solution normale.", function () { st = M.refuserPari(st); sauver(); retourJeu(); }));
        o.appendChild(g); tel.appendChild(o);
      }
      tel.appendChild(h("h5", null, "Messages"));
      var l = h("ul", "m-msgs");
      st.messages.slice().reverse().forEach(function (m) { l.appendChild(ajout(h("li"), h("span", "m-sicon", m.ico), ajout(h("div"), h("strong", null, m.titre), h("span", null, m.txt), h("small", null, date(Math.max(1, m.t)))))); });
      if (!st.messages.length) l.appendChild(h("li", "m-vide", "Aucun message pour l’instant."));
      tel.appendChild(l);
    }
    function option(ico, t, txt, f) { var b = bouton("", "m-option", f); ajout(b, h("span", "m-lettre", ico), ajout(h("div"), h("strong", null, t), h("small", null, txt))); return b; }
    function choisirMise(type) {
      var max = M.pariMise(st), mises = [50, 100, 150, 200, 250].filter(function (x) { return x < max; }).concat([max]).filter(function (x, i, a) { return x >= 20 && a.indexOf(x) === i; }), mise = mises[0], pari = "rouge";
      tel.appendChild(h("h4", null, type === "bj" ? "🃏 Le blackjack municipal" : "🎡 La roulette de l’Hôtel de Ville"));
      tel.appendChild(h("p", "m-desc", type === "bj" ? "Approche-toi de 21 sans le dépasser. L’as vaut 1 ou 11, les figures 10. Le croupier tire jusqu’à 17. Blackjack d’entrée : la mise × 1,5. Tu peux doubler sur tes deux premières cartes." :
        "Choisis ta mise et ton pari. Rouge ou noir rapporte la mise, une douzaine le double, le zéro 35 fois la mise. Si tu perds, la ville doit la mise."));
      var gm = h("div", "m-mises");
      mises.forEach(function (x) { var b = bouton(argent(x), "m-mise" + (x === mise ? " on" : ""), function () { mise = x; Array.prototype.forEach.call(gm.children, function (c) { c.classList.toggle("on", c === b); }); }); gm.appendChild(b); });
      tel.appendChild(h("small", null, "Mise (maximum " + argent(max) + ")")); tel.appendChild(gm);
      if (type === "roulette") {
        var gp = h("div", "m-mises");
        [["rouge", "🔴 Rouge ×2"], ["noir", "⚫ Noir ×2"], ["d1", "1-12 ×3"], ["d2", "13-24 ×3"], ["d3", "25-36 ×3"], ["zero", "🟢 Zéro ×36"]].forEach(function (x) {
          var b = bouton(x[1], "m-mise" + (x[0] === pari ? " on" : ""), function () { pari = x[0]; Array.prototype.forEach.call(gp.children, function (c) { c.classList.toggle("on", c === b); }); }); gp.appendChild(b);
        });
        tel.appendChild(h("small", null, "Ton pari")); tel.appendChild(gp);
      }
      tel.appendChild(ajout(h("div", "m-bas"), bouton("← Retour", "btn m-sec", function () { dessin(); }),
        bouton(type === "bj" ? "Distribuer les cartes" : "Lancer la bille", "btn m-go", function () {
          if (type === "bj") { st = M.bjCommencer(st, mise); sauver(); return dessin(); }
          st = M.roulette(st, mise, pari); if (st.pariRes) st.pariRes.t = st.t; sauver(); animerRoulette();
        })));
    }
    function animerRoulette() {
      tel.innerHTML = ""; var n = h("div", "m-roue", "?"); tel.appendChild(h("h4", null, "🎡 La bille tourne…")); tel.appendChild(n);
      var k = 0, fin = st.pariRes.n, calme = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      (function tick() {
        if (calme || k > 18) { n.textContent = String(fin); n.className = "m-roue " + (fin === 0 ? "m-vert" : st.pariRes.rouge ? "m-rouge" : "m-noir"); return setTimeout(function () { dessin(); }, 700); }
        n.textContent = String(Math.floor(Math.random() * 37)); k++; setTimeout(tick, 50 + k * 12);
      })();
    }
    function blackjack() {
      var b = st.bj;
      tel.appendChild(h("h4", null, "🃏 Blackjack · mise " + argent(b.mise)));
      var main = function (titre, cartes, cache) {
        var d = h("div", "m-main"); d.appendChild(h("small", null, titre + " · " + (cache ? "?" : M.valeurMain(cartes))));
        var r = h("div", "m-cartes"); cartes.forEach(function (c, i) { r.appendChild(carteJeu(c, cache && i === 1)); }); d.appendChild(r); return d;
      };
      ajout(tel, main("Croupier (Monsieur Valentin)", b.c, !b.fini), main("Toi", b.j, false));
      if (!b.fini) {
        var acts = h("div", "m-bas");
        acts.appendChild(bouton("Tirer une carte", "btn m-go", function () { st = M.bjTirer(st); sauver(); dessin(); }));
        acts.appendChild(bouton("Rester", "btn m-sec", function () { st = M.bjRester(st); sauver(); dessin(); }));
        if (b.j.length === 2 && b.mise * 2 <= M.pariMise(st)) acts.appendChild(bouton("Doubler (" + argent(b.mise * 2) + ")", "btn m-sec", function () { st = M.bjDoubler(st); sauver(); dessin(); }));
        tel.appendChild(acts);
      } else {
        tel.appendChild(h("p", "m-res " + (b.res.gain > 0 ? "m-gain" : b.res.gain < 0 ? "m-perte" : ""), b.res.txt));
        if (st.leon && st.leon.t === st.t) tel.appendChild(ajout(h("div", "m-leon m-leon-clair"), h("span", "m-leon-ico", "🧑‍💼"), h("p", null, "« " + st.leon.txt + " »")));
        tel.appendChild(bouton("Retour à l’Hôtel de Ville", "btn m-go", retourJeu));
      }
    }
    function financement(type) {
      var o = M.offresFinancement(st)[type];
      tel.appendChild(h("h4", null, type === "fonds" ? "🏦 Le fonds de secours" : "💰 Gaspard Mallet, l’investisseur mystérieux"));
      tel.appendChild(h("p", "m-desc", type === "fonds" ? "Un organisme public propose d’éponger une partie du déficit. Les conditions sont affichées avant d’accepter." : "« Je peux sauver vos finances. Évidemment, rien n’est gratuit. » Les contreparties sont affichées avant d’accepter."));
      var g = h("div", "m-choix");
      o.forEach(function (c, k) { g.appendChild(option(["A", "B", "C"][k], c.t, c.txt, function () { st = M.financer(st, type, k); if (st.pariRes) st.pariRes.t = st.t; sauver(); dessin(); })); });
      tel.appendChild(g);
      tel.appendChild(bouton("← Retour", "btn m-sec", function () { dessin(); }));
    }
    function resultatPari() {
      var r = st.pariRes;
      tel.appendChild(h("h4", null, r.type === "roulette" ? "🎡 Résultat de la roulette" : r.type === "fonds" ? "🏦 Fonds de secours" : "💰 Accord avec Gaspard Mallet"));
      if (r.type === "roulette") tel.appendChild(h("div", "m-roue " + (r.n === 0 ? "m-vert" : r.rouge ? "m-rouge" : "m-noir"), String(r.n)));
      tel.appendChild(h("p", "m-res " + (r.gain > 0 ? "m-gain" : r.gain < 0 ? "m-perte" : ""), r.txt));
      if (st.leon && st.leon.t === st.t) tel.appendChild(ajout(h("div", "m-leon m-leon-clair"), h("span", "m-leon-ico", "🧑‍💼"), h("p", null, "« " + st.leon.txt + " »")));
      tel.appendChild(bouton("Retour à l’Hôtel de Ville", "btn m-go", function () { st.pariRes = null; sauver(); retourJeu(); }));
    }
    dessin(vue);
  }

  // ---------- Élection ----------
  function carteElection(e) {
    var d = h("div", "m-election" + (e.gagne ? " m-gagne" : " m-perdu"));
    var bm = h("div", "m-ebarre"), im = h("i"), il = h("i"); im.style.width = e.pct + "%"; il.style.width = (100 - e.pct) + "%"; ajout(bm, im, il);
    ajout(d, h("p", "m-sur", "🗳️ Élection municipale · mandat " + e.mandat),
      ajout(h("div", "m-escore"), h("span", null, "Toi · " + virg(e.pct) + " %"), h("span", null, e.opposant + " · " + virg(100 - e.pct) + " %")), bm);
    return d;
  }

  function resultatElection() {
    box.innerHTML = ""; fermerModale();
    var e = st.elections[st.elections.length - 1], ob = e.objectifs || [];
    var verdict = !ob.length ? "Réélu !" : e.parfait ? "🏆 Mandat parfait !" : e.reussi ? "🏆 Mandat réussi !" : "Réélu… mais objectifs manqués";
    var t = h("div", "m-final " + (e.reussi || !ob.length ? "m-gagne" : "m-perdu"));
    ajout(t, h("p", "m-sur", "Fin du mandat " + (st.mandat - 1)), h("h4", null, verdict),
      h("p", "m-raison", "Réélu avec " + String(e.pct).replace(".", ",") + " % des voix" + (ob.length ? " · " + e.nok + " objectif" + (e.nok > 1 ? "s" : "") + " sur " + ob.length + " atteint" + (e.nok > 1 ? "s" : "") : "") + "."));
    box.appendChild(t);
    if (ob.length) {
      var u = h("div", "mx-objectifs");
      ob.forEach(function (o) { var l = h("div", "mx-objl" + (o.ok ? " mx-ok" : " mx-rate")); ajout(l, h("span", null, o.ok ? "✅" : "❌"), h("span", null, o.txt), h("b", null, o.inverse ? o.cur + " M€" : o.cur + "/" + o.but)); u.appendChild(l); });
      box.appendChild(u);
    }
    box.appendChild(carteElection(e));
    if (st.coffre && st.coffre.mandat === st.mandat) box.appendChild(carteCoffre());
    var bas = h("div", "mx-choixfin");
    ajout(bas, bouton("▶ Mandat suivant : nouvelle crise, nouveaux objectifs", "btn m-go", function () { roulette(); }),
      bouton("🏁 Terminer la partie en vainqueur", "btn m-sec", function () { st = M.retraite(st); sauver(); jeu(); haut(); }));
    box.appendChild(bas);
    haut();
  }

  // ---------- Plan de Paris : la ville se construit sous tes yeux ----------
  var villeVue = null, villeOuverte = true;
  function plan(grand, nouveaux) {
    var cadre = h("div", "m-plan" + (grand ? " m-plan-grand" : "")), img = h("img");
    img.src = grand ? "maire/img/plan-paris.webp" : "maire/img/plan-paris-petit.webp"; img.alt = "Plan de Paris"; img.width = 1536; img.height = 1024; img.decoding = "async";
    cadre.appendChild(img);
    M.planVille(st).forEach(function (b) {
      var dessin = !!DESSINS[b.id], e = dessin ? h("img", "m-v m-v-img") : h("span", "m-v" + (b.gros ? " m-v-gros" : ""), b.ico);
      if (dessin) { e.src = srcBat(b.id); e.alt = ""; e.decoding = "async"; }
      if (nouveaux && nouveaux[b.id + ":" + b.k]) e.classList.add("m-v-neuf");
      e.style.left = b.x + "%"; e.style.top = b.y + "%"; e.style.zIndex = Math.round(b.y * 10); e.title = b.nom; cadre.appendChild(e);
    });
    return cadre;
  }
  function carteVille(fin) {
    var l = M.planVille(st), nouveaux = {};
    // Ce qui vient d'être construit depuis le dernier affichage apparaît avec une petite animation
    if (villeVue && villeVue.pid === st.pid) l.forEach(function (b) { if (!villeVue.l[b.id + ":" + b.k]) nouveaux[b.id + ":" + b.k] = 1; });
    villeVue = { pid: st.pid, l: {} }; l.forEach(function (b) { villeVue.l[b.id + ":" + b.k] = 1; });
    var d = h("details", "m-ville"); d.open = fin || villeOuverte; d.ontoggle = function () { if (!fin) villeOuverte = d.open; };
    d.appendChild(ajout(h("summary"), h("span", null, "🗺️ " + (fin ? "Le Paris que tu laisses" : "Ton Paris")), h("small", null, l.length + " bâtiment" + (l.length > 1 ? "s" : "") + " sur le plan")));
    var p = plan(false, nouveaux); p.onclick = function () { pleinEcranVille(); }; d.appendChild(p);
    if (!l.length) d.appendChild(h("small", "m-aide", "Achète ton premier bâtiment : il apparaîtra ici, au cœur de Paris."));
    if (fin) d.appendChild(ajout(h("div", "m-bas"), bouton("🔍 Agrandir", "btn m-sec", pleinEcranVille), l.length ? bouton("📸 Partager ma ville", "btn m-go", partagerVille) : null));
    else if (l.length) d.appendChild(ajout(h("div", "mx-villebas"), h("small", null, "Touche le plan pour l’agrandir"), bouton("📸 Partager", "mx-lien", partagerVille)));
    return d;
  }
  function pleinEcranVille() {
    var m = h("div", "m-pop m-pop-ville"); m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    var c = h("div", "m-ville-plein"), z = h("div", "m-ville-zoom");
    z.appendChild(plan(true));
    function fermer() { m.remove(); document.body.classList.remove("m-modal"); }
    ajout(c, ajout(h("div", "m-tel-tete"), h("strong", null, "🗺️ Ton Paris · " + M.planVille(st).length + " bâtiments"), bouton("✕", "m-leonx", fermer)), z,
      h("small", "m-aide", "Fais glisser pour te promener dans la ville."), bouton("📸 Partager ma ville", "btn m-go", partagerVille));
    m.appendChild(c); m.onclick = function (e) { if (e.target === m) fermer(); };
    (document.getElementById("g-maire") || document.body).appendChild(m); document.body.classList.add("m-modal");
    setTimeout(function () { z.scrollLeft = (z.scrollWidth - z.clientWidth) / 2; z.scrollTop = (z.scrollHeight - z.clientHeight) / 2; }, 50);
  }
  // Image à partager : le plan, les bâtiments, et un bandeau avec le bilan
  function partagerVille(ev) {
    var bt = ev && ev.currentTarget, l = M.planVille(st), img = new Image();
    if (bt) { bt.disabled = true; bt.textContent = "Préparation de l’image…"; }
    img.onload = function () {
      // Les dessins des bâtiments sont chargés avant de composer l'image
      var a = {}, att = 0;
      l.forEach(function (b) { if (DESSINS[b.id] && !a[b.id]) { att++; var i = new Image(); a[b.id] = i; i.onload = i.onerror = function () { if (--att === 0) composer(a); }; i.src = srcBat(b.id); } });
      if (!att) composer(a);
    };
    function composer(dessins) {
      var W = 1536, H = 1024, c = document.createElement("canvas"); c.width = W; c.height = H + 150;
      var x = c.getContext("2d");
      x.fillStyle = "#1b2550"; x.fillRect(0, 0, W, H + 150); x.drawImage(img, 0, 150, W, H);
      x.textAlign = "center"; x.textBaseline = "middle";
      l.forEach(function (b) {
        var px = b.x / 100 * W, py = 150 + b.y / 100 * H, r = b.gros ? 30 : 21, d = dessins[b.id];
        if (d && d.naturalWidth) { x.drawImage(d, px - 48, py - 76, 96, 96); return; }
        x.fillStyle = "rgba(255,255,255,.88)"; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
        x.font = (b.gros ? 38 : 26) + "px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif"; x.fillText(b.ico, px, py + 2);
      });
      var bi = M.bilan(st);
      x.fillStyle = "#ffd970"; x.font = "bold 54px system-ui,sans-serif"; x.fillText("🏛️ Mon Paris · " + l.length + " bâtiments", W / 2, 58);
      x.fillStyle = "#ffffff"; x.font = "32px system-ui,sans-serif";
      x.fillText("Mandat " + st.mandat + " · " + M.duree(st.t) + " à l’Hôtel de Ville · score " + bi.score + " · " + location.host, W / 2, 112);
      c.toBlob(function (blob) {
        if (bt) { bt.disabled = false; bt.textContent = "📸 Partager ma ville"; }
        if (!blob) return;
        var f = null; try { f = new File([blob], "mon-paris.jpg", { type: "image/jpeg" }); } catch (e) {}
        if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: "Mon Paris", text: "Voilà le Paris que j’ai construit ! " + location.origin + location.pathname }).catch(function () {});
        } else {
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mon-paris.jpg"; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); toast("📸 Image enregistrée : mon-paris.jpg");
        }
      }, "image/jpeg", 0.86);
    }
    img.onerror = function () { if (bt) { bt.disabled = false; bt.textContent = "📸 Partager ma ville"; } toast("Impossible de préparer l’image."); };
    img.src = "maire/img/plan-paris.webp";
  }

  // Coffre de la victoire : on le secoue, il s'ouvre, la surprise apparaît
  function carteCoffre() {
    var c = st.coffre, d = h("div", "m-coffre" + (c.vu ? " m-coffre-ouvert" : "") + (c.type === "jackpot" ? " m-coffre-jackpot" : ""));
    var ico = h("span", "m-coffre-ico", c.vu ? (c.type === "jackpot" ? "🎰" : "✨") : "🎁"), txt = h("strong", null, c.vu ? c.txt : "Le coffre de la victoire t’attend");
    ajout(d, ico, txt);
    if (!c.vu) d.appendChild(bouton("Ouvrir le coffre", "btn m-go", function (ev) {
      ev.currentTarget.remove(); d.classList.add("m-coffre-secoue");
      setTimeout(function () {
        st = M.voirCoffre(st); sauver();
        d.classList.remove("m-coffre-secoue"); d.classList.add("m-coffre-ouvert");
        if (st.coffre.type === "jackpot") d.classList.add("m-coffre-jackpot");
        ico.textContent = st.coffre.type === "jackpot" ? "🎰" : "✨"; txt.textContent = st.coffre.txt;
        if (st.coffre.type === "jackpot") flash("🎰 JACKPOT ! 🎰", "m-flash-jackpot");
      }, 900);
    }));
    return d;
  }
  // Grand moment plein écran (événement légendaire, jackpot) : quelques secondes, puis on joue
  function flash(texte, cls) {
    var f = h("div", "m-flash " + (cls || "")); f.setAttribute("aria-hidden", "true");
    f.appendChild(h("strong", null, texte));
    for (var k = 0; k < 18; k++) { var e = h("i", null, ["✨", "🌟", "⭐", "💫"][k % 4]); e.style.left = (5 + Math.random() * 90) + "%"; e.style.animationDelay = (Math.random() * 0.6) + "s"; f.appendChild(e); }
    (document.getElementById("g-maire") || document.body).appendChild(f);
    f.onclick = function () { f.remove(); };
    setTimeout(function () { f.classList.add("m-flash-out"); }, 1700); setTimeout(function () { f.remove(); }, 2200);
  }

  // ---------- Fin de partie ----------
  function fin() {
    decouvertes();
    box.innerHTML = ""; fermerModale();
    choixNiveau(st.niveau);
    var b = M.bilan(st), an = M.analyse(st), e = st.elections[st.elections.length - 1];
    var type = st.fin.raison.type, t = h("div", "m-final " + (type === "defi" || type === "retraite" ? "m-gagne" : "m-perdu"));
    ajout(t, h("p", "m-sur", (st.defi != null ? "Défi du jour · " : "") + ({ election: "Battu aux élections", faillite: "Faillite", demission: "Démission", defi: "Défi terminé", retraite: "Victoire" })[type]),
      h("h4", null, b.mandats ? "Fin de règne après " + M.duree(b.t) + " et " + b.mandats + " réélection" + (b.mandats > 1 ? "s" : "") : "Ton aventure s’arrête au bout de " + M.duree(b.t)),
      h("p", "m-raison", st.fin.raison.txt), h("p", "m-score", "Score : " + b.score + " · " + M.NIVEAUX[st.niveau].nom));
    box.appendChild(t);
    box.appendChild(carteStyle(b));
    if (e && st.fin.raison.type === "election") box.appendChild(carteElection(e));
    if (an) { var a = h("div", "m-analyse"); ajout(a, h("p", "m-sur", "Ce qui s’est passé"), h("p", null, an.phrase), h("p", "m-conseil", "💡 " + an.conseil)); box.appendChild(a); }
    box.appendChild(carteRecit(b));
    box.appendChild(carteVille(true));
    var gz = h("div", "m-gains"); box.appendChild(gz);
    if (!st.prog && !comptage) {
      comptage = true;
      quetes().catch(function () { return []; }).then(function () {
        var res = G.terminer(st, M, { quetes: quetesAuj() });
        st = res.st; st.prog = { passPts: res.passPts, passPaliers: res.passPaliers, total: res.total, gains: res.gains, avant: res.avant.n, apres: res.apres.n, debloque: res.debloque.map(function (m) { return m.nom; }) };
        comptage = false; sauver(); gains(gz);
        if (window.lbSubmit && window.user) lbSubmit("xp_maire", res.profil.xp).then(function () { if (window.LB) G.ligue(LB.docs || [], LB.uid); envoyerLigue(); });
      });
    } else gains(gz);
    var msg = h("p", "msg m-msg"); box.appendChild(msg);
    if (st.triche) { if (!st.envoye) { st.envoye = true; sauver(); } msg.textContent = "Partie jouée sans limites (admin) : elle ne compte pas au classement."; }
    else if (!st.envoye && st.scenario) { st.envoye = true; sauver(); if (st.defi === G.jour()) envoyerScoreJour(st.defi, b.score); }
    else if (!st.envoye && window.lbSubmit) { st.envoye = true; sauver(); lbSubmit(cleClassement(st.niveau), b.score).then(function (x) { msg.textContent = x; }); }
    var bas = h("div", "m-bas");
    ajout(bas, bouton("Accueil", "btn m-sec", function () { effacer(); st = null; accueil(); haut(); }),
      bouton("▶ Rejouer", "btn m-go", function () { effacer(); st = null; creation(); haut(); }));
    box.appendChild(bas);
    haut();
  }
  // Bilan de carrière : ton titre, ton meilleur mandat, et ta place parmi les autres maires
  function carteStyle(b) {
    var d = h("div", "mx-style"), m = b.meilleur, P = G.lire();
    ajout(d, h("p", "m-sur", "Ton titre"), h("strong", "mx-titre", b.style.titre), h("small", null, b.style.txt));
    var l = h("div", "mx-faits");
    if (m) l.appendChild(ajout(h("div"), h("b", null, "🏆 Meilleur mandat : n° " + m.mandat), h("small", null, (m.nb ? m.nok + "/" + m.nb + " objectifs · " : "") + String(m.pct).replace(".", ",") + " % des voix" + (m.crise ? " · malgré « " + m.crise.nom + " »" : ""))));
    var x = b.stats; if (x.mandatsReussis) l.appendChild(ajout(h("div"), h("b", null, "🎯 " + x.mandatsReussis + " mandat" + (x.mandatsReussis > 1 ? "s" : "") + " réussi" + (x.mandatsReussis > 1 ? "s" : "")), h("small", null, (x.objectifsOk || 0) + " objectifs atteints en tout")));
    // Comparaison avec les autres joueurs du classement (même difficulté)
    var cle = cleClassement(st.niveau), docs = ((window.LB && LB.docs) || []).filter(function (y) { return y.s && y.s[cle] > 0 && y.id !== (window.LB && LB.uid); });
    if (docs.length >= 3) {
      var mieux = docs.filter(function (y) { return y.s[cle] < b.score; }).length, pc = Math.round(mieux / docs.length * 100);
      l.appendChild(ajout(h("div"), h("b", null, "📊 Mieux que " + pc + " % des maires"), h("small", null, "sur " + docs.length + " joueurs en " + M.NIVEAUX[st.niveau].nom)));
    }
    var rec = P.scoreMax || 0;
    l.appendChild(ajout(h("div"), h("b", null, b.score >= rec ? "⭐ Record personnel !" : "⭐ Ton record : " + rec), h("small", null, b.score >= rec ? "ta meilleure partie à ce jour" : "il te manque " + (rec - b.score) + " points")));
    d.appendChild(l);
    return d;
  }
  // Le récit de la partie, construit à partir de ce qui s'est vraiment passé, à copier ou partager (sans données personnelles)
  function carteRecit(b) {
    var x = b.stats, d = h("div", "m-recit");
    d.appendChild(h("p", "m-sur", "📰 L’histoire de ton mandat"));
    d.appendChild(h("p", "m-recit-txt", b.recit));
    var g = h("div", "m-fin");
    [["Trimestres", b.t], ["Réélections", b.mandats], ["Bonheur max", Math.round(x.bonheurMax)], ["Trésor max", argent(x.tresorMax)], ["Dette max", argent(x.detteMax)],
      ["Bâtiments", x.achats], ["Projets inaugurés", x.projetsOk], ["Crises traversées", x.crisesOk], ["Événements rares", x.rares + x.legendaires], ["Objets trouvés", b.objets.length]].forEach(function (y) {
      g.appendChild(ajout(h("div", "m-chiffre"), h("span", null, y[0]), h("b", null, String(y[1]))));
    });
    d.appendChild(g);
    var texte = "🏛️ Maire de Paris — « " + b.style.titre + " ». " + b.recit + " Score : " + b.score + " (" + M.NIVEAUX[st.niveau].nom + "). " + location.origin + location.pathname;
    var bas = h("div", "m-bas");
    bas.appendChild(bouton("📋 Copier le résumé", "btn m-sec", function (e) {
      var bt = e.currentTarget, ok = function () { bt.textContent = "✔ Copié !"; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texte).then(ok, function () { prompt("Copie ce texte :", texte); });
      else prompt("Copie ce texte :", texte);
    }));
    if (navigator.share) bas.appendChild(bouton("📤 Partager", "btn m-sec", function () { navigator.share({ title: "Mon mandat de maire de Paris", text: texte }).catch(function () {}); }));
    d.appendChild(bas);
    return d;
  }
  function gains(c) {
    var p = st.prog; if (!p) return; c.innerHTML = "";
    var n = G.niveau(G.lire().xp);
    c.appendChild(h("p", "m-sur", "Ce que cette partie te rapporte : +" + p.total + " XP"));
    if (p.apres > p.avant) c.appendChild(h("p", "m-lvlup", "⬆️ Niveau " + p.apres + " atteint : " + n.titre + " !"));
    if (p.passPts) c.appendChild(h("p", "m-debl", "🎟️ +" + p.passPts + " points de pass de combat" + ((p.passPaliers || []).length ? " · palier" + (p.passPaliers.length > 1 ? "s " : " ") + p.passPaliers.map(function (x) { return x.n; }).join(", ") + " atteint" + (p.passPaliers.length > 1 ? "s" : "") : "")));
    (p.passPaliers || []).forEach(function (x) { c.appendChild(h("p", "m-debl", "🎁 Palier " + x.n + " : " + x.txt)); });
    (p.debloque || []).forEach(function (nom) { c.appendChild(h("p", "m-debl", "🔓 Débloqué : " + nom)); });
    var u = h("ul", "m-liste");
    p.gains.forEach(function (x) { var li = h("li", "m-up"); ajout(li, h("span", null, x.txt), h("b", null, "+" + x.xp + " XP")); u.appendChild(li); });
    c.appendChild(u);
    var barre = h("div", "m-barre"), i = h("i"); i.style.width = n.pct + "%"; barre.appendChild(i);
    ajout(c, h("small", null, "Niveau " + n.n + " · " + n.titre + (n.max ? "" : " · " + n.depuis + " / " + n.besoin + " XP")), barre);
  }

  window.maireInit = function () {
    box = document.getElementById("m-app");
    if (!box || box.dataset.ok) return;
    box.dataset.ok = "1";
    niveau = lireNiveau();
    var lv = document.getElementById("m-lvls");
    if (lv) Array.prototype.forEach.call(lv.children, function (b) {
      b.onclick = function () {
        if (b.disabled) return;
        choixNiveau(b.dataset.l);
        try { localStorage.setItem("maire_niveau", niveau); } catch (e) {}
        var t = box.querySelector(".m-nivtxt"); if (t) t.textContent = "Niveau " + M.NIVEAUX[niveau].nom + " : " + M.NIVEAUX[niveau].txt;
      };
    });
    if (window.lbBoard) lbBoard("lb-maire", function () { return cleClassement(niveau); }, function () { return "🏆 Classement général · Maire de Paris " + M.NIVEAUX[niveau].nom; });
    accueil();
  };
  window.maireStop = function () { fermerModale(); };
})();
