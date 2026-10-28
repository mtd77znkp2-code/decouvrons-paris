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
  function lireSauvegarde() { try { var s = JSON.parse(localStorage.getItem(CLE) || "null"); return s && s.v >= 3 && s.v <= 6 ? s : null; } catch (e) { return null; } }
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
  function accueil() {
    box.innerHTML = ""; fermerModale();
    var s = lireSauvegarde(), n = nivJ();
    choixNiveau(s && s.phase !== "fin" ? s.niveau : lireNiveau());
    box.appendChild(carteChapitre(n));
    box.appendChild(carteProfil());
    if (s && s.phase !== "fin") {
      var r = h("div", "m-reprise");
      ajout(r, h("strong", null, "Partie en cours"),
        h("span", null, (s.defi != null ? "Défi du jour · " : "") + "Mandat " + s.mandat + " · " + date(Math.max(1, s.t)) + " · " + M.NIVEAUX[s.niveau].nom),
        bouton("Reprendre", "btn", reprise));
      box.appendChild(r);
    }
    box.appendChild(bouton(s && s.phase !== "fin" ? "Nouvelle partie" : "▶ Jouer", s && s.phase !== "fin" ? "btn m-sec" : "btn m-go m-gros", function () {
      if (s && s.phase !== "fin" && !confirm("Commencer une nouvelle partie ? La partie en cours sera perdue.")) return;
      creation();
    }));
    box.appendChild(carteSerie());
    if (G.roueDispo()) box.appendChild(carteRoue());
    box.appendChild(cartePass());
    var lg = h("div", "m-liguezone"); box.appendChild(lg); carteLigue(lg);
    var auj = h("div", "m-auj"); box.appendChild(auj);
    Promise.all([index(), quetes()]).then(function () { panneauJour(auj, s); }).catch(function () { auj.remove(); });
    box.appendChild(carteDeblocages(n));
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
  function carteRoue() {
    var d = h("div", "m-roue-carte");
    ajout(d, h("span", "m-serie-feu", "🎡"), ajout(h("div"), h("strong", null, "Roue de la fortune"), h("small", null, "Un tour gratuit cette semaine : XP, points de pass, bonus… ou le jackpot !")),
      bouton("Tourner", "btn m-go", ecranRoue));
    return d;
  }
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
  function cartePass() {
    var ps = G.pass(), d = h("div", "m-passcarte"), suiv = ps.paliers[ps.palier];
    var barre = h("div", "m-barre"), i = h("i"); i.style.width = (ps.palier >= ps.max ? 100 : Math.round(ps.dans / ps.parPalier * 100)) + "%"; barre.appendChild(i);
    ajout(d, ajout(h("div", "m-jt"), h("strong", null, "🎟️ Pass de combat · " + ps.nom), h("b", null, "Palier " + ps.palier + "/" + ps.max)), barre,
      h("small", null, ps.palier >= ps.max ? "Pass terminé : bravo ! Nouvelle saison le mois prochain." : "Prochain palier (" + ps.dans + "/" + ps.parPalier + " pts) : " + suiv.txt),
      bouton("Voir le pass", "btn m-sec", ecranPass));
    return d;
  }
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
      st = M.nouvellePartie({ ligne: d.ligne, ambitions: d.ambitions, lots: d.lots, niveau: d.niveau, graine: d.graine, nivJoueur: d.nivJoueur, xpJoueur: G.lire().xp, pid: Date.now().toString(36), scenario: d.scenario, secrets: {}, passBats: G.lire().passBats });
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
    CHOIX = { ligne: m.ligne ? null : "centre", amb: [], sac: [] };
    choixNiveau(lireNiveau());
    var sac = G.lire().sac || {}, sacOk = Object.keys(G.SAC).filter(function (k) { return sac[k] > 0; });
    if (!m.ligne && !m.promesses && !sacOk.length) return demarrer();
    box.innerHTML = "";
    box.appendChild(h("p", "m-nivtxt", "Niveau " + M.NIVEAUX[niveau].nom + " : " + M.NIVEAUX[niveau].txt));
    if (m.ligne) {
      box.appendChild(h("p", "m-etape", "Ta ligne politique"));
      var lg = h("div", "m-lignes");
      Object.keys(M.LIGNES).forEach(function (k) {
        var b = bouton("", "m-ligne m-l-" + k, function () { CHOIX.ligne = k; Array.prototype.forEach.call(lg.children, function (x) { x.setAttribute("aria-pressed", x === b); }); maj(); });
        b.setAttribute("aria-pressed", "false");
        ajout(b, h("strong", null, M.LIGNES[k].nom), h("span", null, M.LIGNES[k].txt));
        lg.appendChild(b);
      });
      box.appendChild(lg);
    }
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
      var ok = CHOIX.ligne && (!m.promesses || CHOIX.amb.length === 2);
      go.disabled = !ok;
      msg.textContent = !CHOIX.ligne ? "Choisis ta ligne politique." : m.promesses && CHOIX.amb.length < 2 ? "Choisis encore " + (2 - CHOIX.amb.length) + " promesse" + (CHOIX.amb.length ? "." : "s.") : "";
    }
    maj();
  }
  function demarrer() {
    quetes().catch(function () {});
    box.innerHTML = ""; box.appendChild(h("p", "msg", "Installation à l’Hôtel de Ville…"));
    index().then(function () { var l = choisirLots(); return chargerLots(l).then(function () { return l; }); }).then(function (lots) {
      st = M.nouvellePartie({ ligne: CHOIX.ligne || "centre", ambitions: CHOIX.amb, lots: lots, niveau: niveau, xpJoueur: G.lire().xp, pid: Date.now().toString(36), secrets: G.lire().secrets, sansLimite: sansLimiteAdmin(),
        passBats: G.lire().passBats, bonus: G.utiliserSac(CHOIX.sac) });
      sauver(); demarrerPartie();
    }).catch(function () { alert("Impossible de charger les dossiers. Vérifie ta connexion et réessaie."); accueil(); });
  }
  // Roulette de l'opposant (s'il est débloqué), puis le premier trimestre ; le guide prend le relais dans le jeu
  function demarrerPartie() {
    choixNiveau(st.niveau, true);
    if (st.meca.opposant && st.t === 0) return roulette();
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
      st = M.reprendre(s, BASE); sauver(); choixNiveau(st.niveau, true);
      if (st.phase === "pret") return demarrerPartie();
      jeu();
    }).catch(function () { alert("Impossible de charger les dossiers. Vérifie ta connexion et réessaie."); });
  }
  function roulette() {
    var o = M.opposant(st), noms = M.OPPOSANTS; box.innerHTML = ""; fermerModale();
    var r = h("div", "m-roulette");
    r.appendChild(h("p", "m-sur", st.mandat > 1 ? "Mandat " + st.mandat + " · ton nouvel opposant" : "Tirage au sort de ton opposant"));
    var fen = h("div", "m-rfen"), nom = h("strong", "m-rnom"), ico = h("span", "m-rico");
    ajout(fen, ico, nom); r.appendChild(fen);
    var fiche = h("div", "m-rfiche"); fiche.hidden = true; r.appendChild(fiche);
    box.appendChild(r); haut();
    var calme = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var k = Math.floor(Math.random() * noms.length), tours = calme ? 0 : 22 + ((o.i - k - 22) % noms.length + noms.length) % noms.length, n = 0;
    function montre(i) { ico.textContent = noms[i].ico; nom.textContent = noms[i].nom; }
    (function tick() { montre((k + n) % noms.length); if (n >= tours) return fin(); n++; setTimeout(tick, 45 + Math.pow(n / tours, 3) * 260); })();
    function fin() {
      montre(o.i); fen.classList.add("m-rstop");
      var barre = h("div", "m-barre"), i = h("i"); i.style.width = o.force + "%"; barre.appendChild(i);
      ajout(fiche, h("p", null, o.txt),
        ajout(h("div", "m-jt"), h("span", null, "Influence"), h("b", null, Math.round(o.force) + "/100 · " + M.humeurOpp(o.force))), barre,
        h("p", "m-aide", "Une fois par an, " + o.nom + " t’attaquera. Plus son influence est grande, plus il te coûte des voix."),
        bouton(st.t ? "Commencer le mandat " + st.mandat : "Entrer en fonctions", "btn m-go", function () {
          st = st.phase === "election" ? M.continuer(st, BASE) : M.debutTour(st, BASE); sauver(); jeu(); haut();
        }));
      fiche.hidden = false;
    }
  }

  // ---------- Écran de jeu : une seule page, de haut en bas ----------
  function jeu() {
    progresser();
    if (st.phase === "fin") return fin();
    if (st.phase === "election") return resultatElection();
    var y = window.scrollY; box.style.minHeight = box.offsetHeight + "px";
    decouvertes();
    box.innerHTML = "";
    ajout(box, entete(), carteLeon(), sondage(), jauges(), piliers());
    if (st.mission) box.appendChild(carteMission());
    var cj = carteJour(); if (cj) box.appendChild(cj);
    if (st.opposant) box.appendChild(bandeauOpp());
    if (st.rapport && st.notes && st.notes.length) box.appendChild(notes());
    if (st.chantiers.length) box.appendChild(chantiers());
    ajout(box, boutique());
    if (st.meca.budget) box.appendChild(budget());
    box.appendChild(journal());
    box.appendChild(ajout(h("div", "m-quitter"),
      bouton("🏠 Menu principal", "btn m-sec", function () { sauver(); fermerModale(); accueil(); haut(); }),
      bouton("🚪 Démissionner", "btn m-sec m-demission", function () {
        if (!confirm("Démissionner ? La partie s’arrête ici : tu gardes l’XP de ce que tu as déjà accompli.")) return;
        st = M.demissionner(st); sauver(); jeu();
      })));
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
  // Succès du jour et pass de combat, repliés en jeu : on voit où on en est sans quitter la partie
  var jourOuvert = false;
  function carteJour() {
    var l = G.journaliersPartie(st, M); if (!l.length) return null;
    var faits = l.filter(function (d) { return d.fait; }).length, ps = G.pass();
    var d = h("details", "m-jourcarte"); d.open = jourOuvert; d.ontoggle = function () { jourOuvert = d.open; };
    d.appendChild(ajout(h("summary"), h("span", null, "🌞 Succès du jour " + faits + "/" + l.length), h("small", null, "🎟️ Palier " + ps.palier + "/" + ps.max)));
    var u = h("ul", "m-qliste");
    l.forEach(function (x) {
      var li = h("li", x.fait ? "m-qok" : "");
      ajout(li, h("span", null, (x.fait ? "✔ " : "") + x.t), h("b", null, x.fait ? "fait" : x.cur + " / " + x.but));
      u.appendChild(li);
    });
    var barre = h("div", "m-barre"), i = h("i"); i.style.width = Math.round(ps.dans / ps.parPalier * 100) + "%"; barre.appendChild(i);
    ajout(d, u, h("small", "m-aide", "Chaque succès du jour : +XP et +100 points de pass. Les 5 réussis : +200 points."),
      ajout(h("div", "m-jt"), h("span", null, "🎟️ Pass de combat · " + ps.nom), h("b", null, ps.dans + " / " + ps.parPalier)), barre);
    return d;
  }
  function carteMission() {
    var m = st.mission, def = M.C.MISSIONS[m.id], reste = m.fin - st.t, d = h("div", "m-mission");
    ajout(d, h("span", "m-sicon", "🎯"), ajout(h("div"), h("strong", null, "Mission surprise · " + def.xp + " XP"), h("span", null, def.t + " Encore " + reste + " trimestre" + (reste > 1 ? "s" : "") + ".")));
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
    var d = h("div", "m-entete"), reste = M.prochaineElection(st) - st.t;
    ajout(d, ajout(h("div"), h("span", "m-sur", "Mandat " + st.mandat + (st.scenario ? " · défi du jour" : "")), h("strong", null, date(Math.max(1, st.t)))),
      ajout(h("div", "m-entete-d"), telephone(), h("span", "m-reste", st.scenario ? "🎯 Fin du défi dans " + (st.scenario.fin - st.t) + " trim." : "🗳️ Élection dans " + reste + " trimestre" + (reste > 1 ? "s" : ""))));
    var p = h("div", "m-prog"), pi = h("i"); pi.style.width = (M.trimMandat(st) / M.MANDAT * 100) + "%"; p.appendChild(pi); d.appendChild(p);
    d.appendChild(barreXP());
    return d;
  }
  // Niveau et XP en direct : la barre se remplit à chaque action, le prochain déblocage est annoncé
  var xpAffiche = null;
  function barreXP() {
    var xp = st.xp0 + st.xp, n = G.niveau(xp), d = h("div", "m-xp");
    var barre = h("div", "m-xpbarre"), i = h("i"); barre.appendChild(i);
    var avant = xpAffiche != null && xpAffiche.pid === st.pid && xpAffiche.xp < xp ? G.niveau(xpAffiche.xp) : null;
    i.style.width = (avant && avant.n === n.n ? avant.pct : n.pct) + "%";
    if (avant) requestAnimationFrame(function () { requestAnimationFrame(function () { i.style.width = n.pct + "%"; }); });
    var suiv = prochainDeblocage();
    ajout(d, ajout(h("div", "m-jt"), h("span", null, "⭐ Niveau " + n.n + " · " + n.titre),
      ajout(h("b"), avant ? h("em", "m-xpplus", "+" + (xp - xpAffiche.xp) + " XP") : null, document.createTextNode(n.max ? "niveau max" : n.depuis + " / " + n.besoin + " XP"))), barre);
    if (suiv) d.appendChild(h("small", null, "Prochain déblocage au niveau " + suiv.niv + " : " + suiv.txt));
    xpAffiche = { pid: st.pid, xp: xp };
    return d;
  }
  function prochainDeblocage() {
    if (st.nivFixe) return null;
    var l = [];
    Object.keys(M.BATIMENTS).forEach(function (id) { var B = M.BATIMENTS[id]; if (!B.secret && B.niv > st.nivJ) l.push({ niv: B.niv, txt: B.ico + " " + B.nom }); });
    M.MECANIQUES.concat(M.EXTRAS).forEach(function (m) { if (m.niv > st.nivJ && !st.meca[m.id]) l.push({ niv: m.niv, txt: m.nom }); });
    if (!l.length) return null;
    var nv = Math.min.apply(null, l.map(function (x) { return x.niv; }));
    return { niv: nv, txt: l.filter(function (x) { return x.niv === nv; }).map(function (x) { return x.txt; }).join(", ") };
  }
  function sondage() {
    var v = M.sondage(st), d = h("div", "m-sondage " + (v > 52 ? "m-bien" : v > 48 ? "m-juste" : "m-mal"));
    ajout(d, h("span", "m-sicon", "🗳️"), ajout(h("div"), h("strong", null, "Sondage : " + virg(v) + " %"),
      h("span", null, v > 52 ? "Si l’élection avait lieu aujourd’hui, tu serais réélu." : v > 48 ? "Au coude-à-coude : il te faut plus de 50 % le jour du vote." : "Tu serais battu : il te faut plus de 50 % le jour du vote.")));
    return d;
  }
  function tuile(nom, val, sous, danger) {
    var d = h("div", "m-jauge" + (danger ? " m-danger" : "")); ajout(d, h("span", null, nom), h("b", null, val)); if (sous) d.appendChild(h("small", null, sous)); return d;
  }
  function jauges() {
    var t = h("div", "m-tab3"), so = M.solde(st);
    ajout(t, tuile("💰 Trésorerie", argent(st.tresor), (so >= 0 ? "+" : "") + argent(so) + " / trimestre" + (st.dette > 0 ? " · dette " + argent(st.dette) : ""), st.dette > M.PLAFOND_DETTE * 0.6),
      tuile("😊 Bonheur", String(Math.round(M.bonheur(st))), "moyenne des 4 piliers", M.bonheur(st) < 40),
      tuile("📣 Popularité", String(Math.round(st.pop)), "s’use avec le temps", st.pop < 40));
    if (st.meca.ligne) { var tc = tuile("🧭 Cohérence", String(Math.round(st.coh)), "ligne " + M.LIGNES[st.ligne].nom, st.coh < 40); tc.classList.add("m-jauge-coh"); t.appendChild(tc); }
    return t;
  }
  function piliers() {
    var d = h("div", "m-piliers"), c = M.cible(st);
    Object.keys(M.PILIERS).forEach(function (k) {
      var v = st.piliers[k], prom = st.ambitions.indexOf(k) >= 0, fl = c[k] > v + 0.5 ? " ↗" : c[k] < v - 0.5 ? " ↘" : "";
      var p = h("div", "m-pilier" + (prom ? " m-prom" : ""));
      var t = h("div", "m-jt"); ajout(t, h("span", null, M.ICO[k] + " " + M.PILIERS[k] + (prom ? " · 🎯 promesse" : "")), h("b", null, Math.round(v) + fl));
      var barre = h("div", "m-barre"), r = h("i"); r.style.width = v + "%"; r.style.background = couleur(v); barre.appendChild(r);
      if (prom) { var s = h("em", "m-cible"); s.style.left = M.P.ambSeuil + "%"; barre.appendChild(s); }
      ajout(p, t, barre); d.appendChild(p);
    });
    return d;
  }
  function bandeauOpp() {
    var o = M.opposant(st), b = h("div", "m-opp" + (o.actif ? "" : " m-opp-fini")), tm = M.trimMandat(st), proch = (Math.floor(tm / 4) + 1) * 4 - tm;
    ajout(b, h("span", "m-rico", o.ico), ajout(h("div"), h("strong", null, "Opposant : " + o.nom),
      h("span", null, o.actif ? "Influence " + Math.round(o.force) + "/100 · " + M.humeurOpp(o.force) + " · prochaine attaque dans " + proch + " trimestre" + (proch > 1 ? "s" : "") : "A renoncé jusqu’à la prochaine élection")));
    return b;
  }
  function notes() {
    var r = h("div", "m-rapport"); r.appendChild(h("strong", null, "Ce trimestre"));
    st.notes.forEach(function (x) { var p = h("div", "m-note"); p.appendChild(h("p", null, "⏳ " + x.txt)); variations(x.d, p); r.appendChild(p); });
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
  function carteBat(id) {
    var B = M.BATIMENTS[id], ench = !!B.enchere, non = ench ? M.peutEncherir(st, id) : M.peutAcheter(st, id), px = B.projet || ench ? B.cout : M.prix(st, id), deja = st.bat[id] || 0;
    var ga = M.gainAchat(st, id);
    var gain = Object.keys(ga).map(function (k) { return (ga[k] >= 0 ? "+" : "−") + virg(Math.abs(ga[k])) + " " + M.ICO[k]; });
    if (B.rev) gain.push("+" + argent(B.rev) + "/trim.");
    if (B.pop) gain.push("+" + B.pop + " popularité");
    var neuf = (B.niv > 1 || B.secret || B.projet || B.si) && !G.guideVu("bat-" + id) && !deja;
    var b = bouton("", "m-bat" + (B.projet ? " m-bat-projet" : "") + (B.secret ? " m-bat-secret" : "") + (ench ? " m-bat-ench" : "") + (neuf ? " m-new" : ""), function () {
      G.marquerGuide("bat-" + id);
      if (ench) { if (!M.peutEncherir(st, id)) enchere(id); return; }
      if (M.peutAcheter(st, id)) return;
      st = M.acheter(st, id); sauver(); signal("achat"); jeu(); toast(B.ico + " " + B.nom + (B.projet ? " : le chantier démarre !" : " : c’est fait !"));
    });
    b.disabled = !!non && !(ench && deja);
    if (ench && deja) b.disabled = true;
    var prixTxt = ench ? "🔨 Aux enchères · prix moyen ≈ " + argent(px) + (B.ent ? " · entretien " + argent(B.ent) + "/trim." : "")
      : B.projet ? argent(px) + " au total (30 % au lancement) · " + B.duree + " trimestres" : (B.cout > 0 ? argent(px) : "rapporte " + argent(-px)) + (B.ent ? " · entretien " + argent(B.ent) + "/trim." : "");
    var at = atouts(B);
    ajout(b, h("span", "m-bico", B.ico), ajout(h("div"), h("strong", null, B.nom),
      gain.length ? h("span", "m-gain", gain.join("  ")) : null, at.length ? h("span", "m-atouts", at.join(" · ")) : null,
      B.txt ? h("span", "m-bat-txt", B.txt) : null, neuf ? h("i", "m-neuf", "Nouveau") : null,
      h("small", null, non && non !== "Pas assez d’argent, même en empruntant." ? non : prixTxt)), deja && !B.unique ? h("em", null, "×" + deja) : null);
    return b;
  }
  // Bâtiment pas encore disponible : ce qui manque (niveau, trimestres, réélection), avec une barre pour l'objectif de partie
  // Bâtiment pas encore disponible : tous ses prérequis (niveau, trimestres, réélection, bâtiments), cochés ou non
  function verrou(id) {
    var B = M.BATIMENTS[id], l = h("div", "m-bat m-bat-lock"), corps = ajout(h("div"), h("strong", null, B.ico + " " + B.nom));
    if (B.pass) corps.appendChild(h("small", null, "🎟️ Récompense du pass de combat."));
    var u = h("ul", "m-prereq");
    M.prerequis(st, id).forEach(function (x) {
      var li = h("li", x.ok ? "m-ok" : "", (x.ok ? "✔ " : "🔒 ") + x.txt + (!x.ok && x.k === "niv" && st.nivFixe ? " (hors défi du jour)" : ""));
      if (!x.ok && x.k !== "niv" && x.but > 1) { var barre = h("div", "m-barre"), i = h("i"); i.style.width = Math.round(x.cur / x.but * 100) + "%"; barre.appendChild(i); li.appendChild(barre); }
      u.appendChild(li);
    });
    if (u.children.length) corps.appendChild(u);
    ajout(l, h("span", "m-bico", "🔒"), corps);
    return l;
  }
  // Boutique rangée par rayons : on ouvre d'abord celui du pilier le plus faible
  var RAYON = null;
  function rayonDe(id) { return M.BATIMENTS[id].cat; }
  function boutique() {
    var d = h("div", "m-boutique"), n = st.nivJ, nb = 0;
    Object.keys(st.bat).forEach(function (id) { nb += st.bat[id]; });
    d.appendChild(ajout(h("div", "m-btete"), h("h5", null, "🛒 Boutique de la Ville"), h("small", null, nb + " bâtiment" + (nb > 1 ? "s" : "") + " · entretien " + argent(M.entretien(st)) + "/trim.")));
    if (window.ADMIN_UNLOCKED) d.appendChild(bouton(st.sansLimite ? "🛠 Limites des bâtiments : désactivées (admin)" : "🛠 Passer les limites pour les bâtiments", "btn m-sec m-adminbat", function () {
      st = M.limites(st, !st.sansLimite); try { localStorage.setItem("maire_sanslimite", st.sansLimite ? "1" : ""); } catch (e) {} sauver(); jeu();
    }));
    var ids = Object.keys(M.BATIMENTS), visibles = M.RAYONS.filter(function (r) {
      if (r.id === "secret") return ids.some(function (id) { return rayonDe(id) === "secret" && M.disponible(st, id); });
      if (r.id === "projet") return st.meca.grandsProjets || st.sansLimite || n >= 4;
      return true;
    });
    if (!RAYON || !visibles.some(function (r) { return r.id === RAYON; })) {
      var faible = Object.keys(M.PILIERS).sort(function (a, b) { return st.piliers[a] - st.piliers[b]; })[0]; RAYON = faible;
    }
    var onglets = h("div", "m-rayons"); onglets.setAttribute("role", "tablist");
    visibles.forEach(function (r) {
      var l = ids.filter(function (id) { return rayonDe(id) === r.id; }), ok = l.filter(function (id) { return M.disponible(st, id); });
      var neuf = ok.some(function (id) { return !G.guideVu("bat-" + id) && !st.bat[id] && (M.BATIMENTS[id].niv > 1 || M.BATIMENTS[id].si); });
      var t = bouton("", "m-rayon" + (neuf ? " m-rayon-neuf" : ""), function () { RAYON = r.id; var y = window.scrollY; jeu(); window.scrollTo(0, y); });
      t.setAttribute("role", "tab"); t.setAttribute("aria-selected", r.id === RAYON);
      ajout(t, h("span", null, r.ico + " " + r.nom), h("small", null, ok.length + "/" + l.length));
      onglets.appendChild(t);
    });
    d.appendChild(onglets);
    var l = ids.filter(function (id) { return rayonDe(id) === RAYON; });
    var ok = l.filter(function (id) { return M.disponible(st, id); }), bloques = l.filter(function (id) { return !M.disponible(st, id); });
    var tri = function (a, b) { var A = M.BATIMENTS[a], B = M.BATIMENTS[b]; return (A.niv || 1) - (B.niv || 1) || A.cout - B.cout; };
    var g = h("div", "m-bats");
    if (RAYON === "enchere") d.appendChild(h("p", "m-aide", "🔨 Les bâtiments de prestige se disputent avec une ville voisine : 30 secondes pour faire la meilleure offre. Le prix moyen de vente t’aide à savoir quand t’arrêter."));
    ok.sort(tri).forEach(function (id) { g.appendChild(carteBat(id)); });
    // Bientôt : les objectifs de partie en cours et les 2 prochains niveaux ; le reste est seulement compté
    var proches = bloques.filter(function (id) { return (M.BATIMENTS[id].niv || 1) <= n + 2; }).sort(tri), loin = bloques.length - proches.length;
    if (proches.length) { g.appendChild(h("p", "m-bientot", "Bientôt")); proches.forEach(function (id) { g.appendChild(verrou(id)); }); }
    if (!ok.length && !proches.length && !loin) g.appendChild(h("p", "m-aide", "Rien dans ce rayon pour l’instant."));
    d.appendChild(g);
    if (loin) d.appendChild(h("p", "m-aide", "🔒 Encore " + loin + " bâtiment" + (loin > 1 ? "s" : "") + " à découvrir dans ce rayon en montant de niveau."));
    if (st.meca.combos) {
      var dc = h("details", "m-combos"), act = M.combosActifs(st);
      dc.appendChild(h("summary", null, "🧩 Combos de bâtiments (" + act.length + " actif" + (act.length > 1 ? "s" : "") + ")"));
      Object.keys(M.C.COMBOS).forEach(function (k) {
        var o = M.C.COMBOS[k], connu = st.combos.indexOf(k) >= 0 || G.lire().combos[k];
        dc.appendChild(h("p", act.indexOf(k) >= 0 ? "m-ok" : "", (act.indexOf(k) >= 0 ? "✅ " : connu ? "◻️ " : "❔ ") + (connu ? o.nom + " : " + texteCombo(k) : "Indice : " + o.indice)));
      });
      d.appendChild(dc);
    }
    d.appendChild(h("p", "m-aide", "Chaque nouvel exemplaire coûte un peu plus cher et rapporte un peu moins : varie tes achats."));
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

  function budget() {
    var d = h("div", "m-curseur");
    var t = h("div", "m-jt"), val = h("b", null, Math.round(st.taux * 100) + " %");
    ajout(t, h("span", null, "💶 Impôts locaux"), val);
    var r = h("input"); r.type = "range"; r.min = 80; r.max = 130; r.step = 5; r.value = Math.round(st.taux * 100); r.setAttribute("aria-label", "Impôts locaux");
    r.oninput = function () { val.textContent = r.value + " %"; };
    r.onchange = function () { st = M.regler(st, { taux: r.value / 100 }); sauver(); signal("regler"); jeu(); };
    ajout(d, t, r, h("small", null, "Recettes " + argent(M.recettes(st)) + " · dépenses " + argent(M.depenses(st)) + " (dont entretien " + argent(M.entretien(st)) + ") par trimestre. Plus d’impôts = plus d’argent, mais moins de popularité."));
    return d;
  }
  function journal() {
    var d = h("details", "m-journal"); d.appendChild(h("summary", null, "📜 Historique des décisions"));
    if (!st.historique.length) d.appendChild(h("p", "m-vide", "Aucune décision pour l’instant."));
    else {
      var l = h("ol", "m-histo");
      st.historique.slice().reverse().slice(0, 60).forEach(function (x) {
        var li = h("li"); ajout(li, h("span", "m-hs", "T" + x.t), h("strong", null, (x.sp === "catastrophe" ? "🚨 " : x.sp === "chance" ? "🍀 " : x.sp === "opposition" ? "⚔️ " : "") + x.titre), h("span", "m-hc", x.choix));
        if (x.c !== "achat") variations(x.d, li);
        l.appendChild(li);
      });
      d.appendChild(l);
    }
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
  function progresser() {
    if (!st || st.prog) return;
    var r = G.suivrePartie(st, M, { quetes: quetesAuj() });
    st = r.st;
    var montees = st.montees || [];
    if (montees.length) st = M.viderMontees(st);
    sauver();
    montees.forEach(function (m) { notifier({ type: "niveau", m: m }); });
    r.chapitres.forEach(function (c) { notifier({ type: "fait", cls: "m-n-chap", sur: "📖 Chapitre " + c.num + " accompli", nom: c.titre, desc: c.objectif, xp: 200 }); });
    r.quetes.forEach(function (q) { notifier({ type: "fait", cls: "m-n-quete", sur: "🎯 Quête du jour accomplie", nom: q.t, xp: q.xp, pts: 100 }); });
    r.journaliers.forEach(function (d) { notifier({ type: "fait", cls: "m-n-jour", sur: "🌞 Succès du jour !", nom: d.t, xp: d.xp, pts: 100 }); });
    if (r.joker) notifier({ type: "fait", cls: "m-n-serie", sur: "🃏 Joker utilisé", nom: "Ta série de jours est sauvée" });
    if (r.serie) notifier({ type: "fait", cls: "m-n-serie", sur: "🔥 Série de " + r.serie.n + " jour" + (r.serie.n > 1 ? "s" : "") + " !", nom: r.serie.txt });
    if (r.parfait) notifier({ type: "fait", cls: "m-n-jour", sur: "🌞 Journée parfaite !", nom: "Les 5 succès du jour sont réussis", pts: 200 });
    r.pass.forEach(function (x) { notifier({ type: "fait", cls: "m-n-pass", sur: "🎟️ Pass de combat · palier " + x.n, nom: x.txt }); });
    var su = r.succes.slice(0, 4);
    su.forEach(function (x) { notifier({ type: "fait", cls: "m-n-succes m-n-t" + x.t, sur: "🏆 Succès débloqué !", nom: x.nom, desc: x.desc, xp: G.XP_TIER[x.t] }); });
    if (r.succes.length > su.length) notifier({ type: "fait", cls: "m-n-succes", sur: "🏆 Et ce n’est pas fini…", nom: "+" + (r.succes.length - su.length) + " autres succès débloqués" });
    // Un seul « ça avance » à la fois par sorte (succès, quête), et seulement si rien n'a été réussi à ce moment-là
    if (!r.succes.length && !r.quetes.length && !r.journaliers.length && !r.serie) {
      var deja = {};
      r.progres.forEach(function (p) { if (!deja[p.type]) { deja[p.type] = 1; notifier({ type: "progres", p: p }); } });
    }
  }
  // File d'affichage : une réussite ou un niveau passe toujours avant les pastilles « ça avance », qui ne s'empilent jamais
  var FILE = [], notifActive = null;
  function notifier(n) {
    if (n.type === "progres") {
      if (FILE.some(function (x) { return x.type !== "progres"; })) return;
      FILE = FILE.filter(function (x) { return x.p.type !== n.p.type; });
    } else {
      FILE = FILE.filter(function (x) { return x.type !== "progres"; });
      if (notifActive && notifActive.type === "progres") notifActive.fermer();
    }
    FILE.push(n);
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
    if (n.type === "progres") {
      var p = n.p; el = h("div", "m-notif m-n-progres" + (p.type === "quete" ? " m-n-pq" : p.type === "jour" ? " m-n-pj" : ""));
      var barre = h("div", "m-barre"), i = h("i"); i.style.width = Math.round((p.cur - 1) / p.but * 100) + "%"; barre.appendChild(i);
      ajout(el, ajout(h("div", "m-jt"), h("span", null, p.ico + " " + p.nom), h("b", null, p.cur + " / " + p.but)), barre);
      requestAnimationFrame(function () { requestAnimationFrame(function () { i.style.width = Math.round(p.cur / p.but * 100) + "%"; }); });
      duree = 2200;
    } else if (n.type === "niveau") {
      var m = n.m, nv = m.n ? G.niveau(G.xpPour(m.n)) : null;
      el = h("div", "m-notif m-n-niveau");
      ajout(el, h("p", "m-n-sur", m.n ? "⬆️ Niveau " + m.n + " !" : "🔓 Nouveau en boutique !"), h("strong", null, nv ? nv.titre : "Objectif rempli : de nouveaux bâtiments arrivent"));
      var u = h("ul");
      m.bats.forEach(function (id) { var B = M.BATIMENTS[id]; u.appendChild(h("li", null, "🔓 " + B.ico + " " + B.nom + (B.projet ? " (projet démesuré)" : B.enchere ? " (aux enchères)" : "") + " · en boutique")); });
      m.meca.forEach(function (t) { u.appendChild(h("li", null, "✨ " + t)); });
      m.plusTard.forEach(function (t) { u.appendChild(h("li", "m-n-tard", "🔜 " + t + " · dès ta prochaine partie")); });
      if (u.children.length) el.appendChild(u);
      duree = 4200;
    } else {
      el = h("div", "m-notif " + n.cls);
      ajout(el, h("p", "m-n-sur", n.sur), h("strong", null, n.nom), n.desc ? h("span", null, n.desc) : null,
        n.xp || n.pts ? h("b", "m-n-xp", (n.xp ? "+" + n.xp + " XP" : "") + (n.xp && n.pts ? " · " : "") + (n.pts ? "+" + n.pts + " 🎟️" : "")) : null);
      duree = FILE.length ? 2400 : 3200;              // plusieurs réussites d'affilée : on accélère un peu
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
      { q: ".m-sondage", t: "🗳️ Ton but : rester au-dessus de 50 % jusqu’à l’élection.", a: "ok" },
      { q: ".m-piliers", t: "Ces 4 piliers font le bonheur des Parisiens. Ils baissent avec le temps.", a: "ok" },
      { q: ".m-bat:not(:disabled):not(.m-bat-lock)", t: "🛒 Achète un bâtiment pour faire monter un pilier.", a: "achat" },
      { q: ".m-barmois .btn", t: "Bravo ! Passe au trimestre suivant.", a: "trimestre" }] },
    { id: "budget", ecran: "jeu", si: function () { return st.meca.budget && st.phase === "gestion"; }, etapes: [
      { q: ".m-curseur", t: "💶 Nouveau : les impôts ! Plus d’argent… mais moins de popularité.", a: "ok" }] },
    { id: "opposant", ecran: "jeu", si: function () { return st.meca.opposant && st.opposant && st.phase === "gestion"; }, etapes: [
      { q: ".m-opp", t: "⚔️ Ton opposant attaque une fois par an. Son influence fait baisser ton sondage.", a: "ok" }] },
    { id: "attaque", ecran: "modale", si: function () { return st.special === "opposition" && st.phase === "evenement"; }, etapes: [
      { q: "#m-modale .m-choix", t: "Riposte, tente de le faire tomber… ou laisse faire, il reviendra plus fort.", a: "choix" }] },
    { id: "cata", ecran: "modale", si: function () { return st.special === "catastrophe" && st.phase === "evenement"; }, etapes: [
      { q: "#m-modale .m-choix", t: "🚨 Une catastrophe ! Choisis comment limiter les dégâts.", a: "choix" }] },
    { id: "chance", ecran: "modale", si: function () { return st.special === "chance" && st.phase === "evenement"; }, etapes: [
      { q: "#m-modale .m-choix", t: "🍀 Un coup de chance ! À toi d’en profiter.", a: "choix" }] },
    { id: "promesses-crea", ecran: "creation", si: function () { return !!document.querySelector(".m-ambs"); }, etapes: [
      { q: ".m-ambs", t: "🎯 Choisis 2 piliers à promettre aux Parisiens.", a: "ok" }] },
    { id: "promesses", ecran: "jeu", si: function () { return st.ambitions.length && st.phase === "gestion"; }, etapes: [
      { q: ".m-prom", t: "🎯 Ta promesse : dépasse le trait blanc avant l’élection pour gagner des voix.", a: "ok" }] },
    { id: "ligne-crea", ecran: "creation", si: function () { return !!document.querySelector(".m-lignes"); }, etapes: [
      { q: ".m-lignes", t: "🧭 Choisis ton camp politique.", a: "ok" }] },
    { id: "ligne", ecran: "jeu", si: function () { return st.meca.ligne && st.phase === "gestion"; }, etapes: [
      { q: ".m-jauge-coh", t: "🧭 Reste fidèle à ton camp : ta cohérence soutient ta popularité.", a: "ok" }] },
    { id: "pari", ecran: "jeu", si: function () { return !!st.offre && st.phase === "gestion"; }, etapes: [
      { q: ".m-tel", t: "📱 Ton téléphone sonne : une proposition très risquée pour sauver les finances.", a: "ok" }] },
    { id: "mission", ecran: "jeu", si: function () { return !!st.mission && st.phase === "gestion"; }, etapes: [
      { q: ".m-mission", t: "🎯 Mission surprise de Léon : réussis-la à temps pour gagner de l’XP.", a: "ok" }] },
    { id: "chantier", ecran: "jeu", si: function () { return st.chantiers.length > 0 && st.phase === "gestion"; }, etapes: [
      { q: ".m-chantiers", t: "🏗️ Ton chantier avance chaque trimestre et se paie par tranches. Gare aux imprévus !", a: "ok" }] },
    { id: "rare", ecran: "modale", si: function () { return (st.special === "rare" || st.special === "legendaire") && st.phase === "evenement"; }, etapes: [
      { q: "#m-modale .m-choix", t: "✨ Un événement rare ! Aucune réponse n’est toujours la meilleure : à toi de jouer.", a: "choix" }] },
    { id: "xp", ecran: "jeu", si: function () { return st.phase === "gestion" && st.t >= 2 && !st.nivFixe; }, etapes: [
      { q: ".m-xp", t: "⭐ Chaque trimestre, achat, élection ou succès te rapporte de l’XP. À chaque niveau, un nouveau bâtiment arrive en boutique !", a: "ok" }] },
    { id: "nouveautes", ecran: "jeu", si: function () { return st.phase === "gestion" && !!document.querySelector(".m-bat.m-new:not(:disabled)"); }, rejouable: 1, etapes: [
      { q: ".m-bat.m-new:not(:disabled)", t: "✨ Nouveau en boutique ! Essaie-le.", a: "ok" }] }
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
    var e = st.elections[st.elections.length - 1];
    var t = h("div", "m-final m-gagne");
    ajout(t, h("p", "m-sur", "Réélu !"), h("h4", null, "Les Parisiens te confient un mandat de plus"),
      h("p", "m-raison", "Mandat n° " + st.mandat + ". Attention : chaque réélection est un peu plus difficile que la précédente."));
    box.appendChild(t);
    box.appendChild(carteElection(e));
    if (st.coffre && st.coffre.mandat === st.mandat) box.appendChild(carteCoffre());
    box.appendChild(bouton(st.meca.opposant ? "Découvrir mon nouvel opposant" : "Commencer le mandat " + st.mandat, "btn m-go", function () {
      if (st.meca.opposant) return roulette();
      st = M.continuer(st, BASE); sauver(); jeu(); haut();
    }));
    haut();
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
    var t = h("div", "m-final " + (st.fin.raison.type === "defi" ? "m-gagne" : "m-perdu"));
    ajout(t, h("p", "m-sur", (st.defi != null ? "Défi du jour · " : "") + ({ election: "Battu aux élections", faillite: "Faillite", demission: "Démission", defi: "Défi terminé" })[st.fin.raison.type]),
      h("h4", null, b.mandats ? "Fin de règne après " + M.duree(b.t) + " et " + b.mandats + " réélection" + (b.mandats > 1 ? "s" : "") : "Ton aventure s’arrête au bout de " + M.duree(b.t)),
      h("p", "m-raison", st.fin.raison.txt), h("p", "m-score", "Score : " + b.score + " · " + M.NIVEAUX[st.niveau].nom));
    box.appendChild(t);
    if (e && st.fin.raison.type === "election") box.appendChild(carteElection(e));
    if (an) { var a = h("div", "m-analyse"); ajout(a, h("p", "m-sur", "Ce qui s’est passé"), h("p", null, an.phrase), h("p", "m-conseil", "💡 " + an.conseil)); box.appendChild(a); }
    box.appendChild(carteRecit(b));
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
    var texte = "🏛️ Maire de Paris — " + b.recit + " Score : " + b.score + " (" + M.NIVEAUX[st.niveau].nom + "). " + location.origin + location.pathname;
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
