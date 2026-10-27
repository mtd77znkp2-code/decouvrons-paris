// Maire de Paris : interface du jeu, chargée à la demande. La logique est dans moteur.js,
// la progression du joueur (niveaux, histoire, tutoriels, succès, quêtes, défi du jour) dans progression.js.
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
  function lireSauvegarde() { try { var s = JSON.parse(localStorage.getItem(CLE) || "null"); return s && s.v === 3 ? s : null; } catch (e) { return null; } }
  function effacer() { try { localStorage.removeItem(CLE); } catch (e) {} }
  function haut() { var g = document.getElementById("g-maire"); if (g && g.getBoundingClientRect().top < 0) g.scrollIntoView({ behavior: "smooth" }); }
  function nivJ() { return G.nivJoueur(); }
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
    var auj = h("div", "m-auj"); box.appendChild(auj);
    Promise.all([index(), quetes()]).then(function () { panneauJour(auj, s); }).catch(function () { auj.remove(); });
    box.appendChild(carteDeblocages(n));
  }
  function carteChapitre(n) {
    var id = G.chapitre(M, n), c = G.HISTOIRE[id], P = G.lire(), d = h("div", "m-chap");
    ajout(d, h("p", "m-sur", "Chapitre " + c.num + " sur 9 · " + c.titre),
      ajout(h("div", "m-leon"), h("span", "m-leon-ico", "🧑‍💼"), h("p", null, "« " + c.recit + " » — Léon, ton directeur de cabinet")),
      h("p", "m-chap-obj" + (P.chapitres[id] ? " m-ok" : ""), (P.chapitres[id] ? "✔ Objectif accompli : " : "🎯 Objectif du chapitre : ") + c.objectif + (P.chapitres[id] ? "" : " (+200 XP)")));
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
    ajout(c, t, barre, bouton("🏅 Succès " + nb + " / " + G.SUCCES.length, "btn m-sec m-bsucces", succes));
    if (window.ADMIN_UNLOCKED) {
      var a = h("div", "m-admin"), sel = h("select");
      for (var k = 1; k <= G.NIV_MAX; k++) { var o = h("option", null, "Niveau " + k); o.value = k; if (k === n.n) o.selected = true; sel.appendChild(o); }
      sel.onchange = function () { G.fixerNiveau(+sel.value); accueil(); };
      ajout(a, h("span", null, "🛠 Admin : se placer au"), sel, bouton("Revoir les tutoriels", "btn m-sec", function () { G.oublierTutos(); alert("Les tutoriels réapparaîtront à la prochaine partie."); }));
      c.appendChild(a);
    }
    return c;
  }
  function carteDeblocages(n) {
    var d = h("details", "m-debloc"); d.appendChild(h("summary", null, "🔓 Ce que tu as débloqué"));
    var u = h("ul");
    M.MECANIQUES.forEach(function (m) { u.appendChild(h("li", n >= m.niv ? "m-ok" : "", (n >= m.niv ? "✔ " : "🔒 Niveau " + m.niv + " · ") + m.nom)); });
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
      ajout(df, h("strong", null, M.NIVEAUX[d.niveau].nom + " · " + M.LIGNES[d.ligne].nom + " · promesses " + d.ambitions.map(function (a) { return M.ICO[a] + " " + M.PILIERS[a]; }).join(" et ")),
        h("span", null, fait ? (fait.mandats >= 1 ? "✔ Défi réussi aujourd’hui (score " + fait.score + ")." : "Défi tenté aujourd’hui : raté (score " + fait.score + "). Reviens demain !") :
          "Gagne ta première élection pour 150 XP (+50 si tu gagnes la deuxième)."));
      if (!fait) df.appendChild(bouton("Relever le défi", "btn m-go", function () {
        if (s && s.phase !== "fin" && !confirm("Relever le défi ? La partie en cours sera perdue.")) return;
        lancerDefi(d);
      }));
    }
    c.appendChild(df);
    var q = h("div", "m-quetes"), qs = G.quetesDuJour(j, QUETES, n), ok = P.quetesJour[j] || [];
    q.appendChild(h("p", "m-sur", "Quêtes du jour" + (qs.length ? " · " + ok.length + "/3" : "")));
    if (!qs.length) q.appendChild(h("span", null, "🔒 Se débloquent au niveau " + G.NIV_QUETES + "."));
    else {
      var u = h("ul", "m-qliste");
      qs.forEach(function (x) { var li = h("li", ok.indexOf(x.id) >= 0 ? "m-qok" : ""); ajout(li, h("span", null, (ok.indexOf(x.id) >= 0 ? "✔ " : "") + x.t), h("b", null, "+" + x.xp + " XP")); u.appendChild(li); });
      ajout(q, u, h("small", null, "Valables dans n’importe quelle partie terminée aujourd’hui."));
    }
    c.appendChild(q);
  }
  function lancerDefi(d) {
    choixNiveau(d.niveau, true);
    box.innerHTML = ""; box.appendChild(h("p", "msg", "Préparation du défi…"));
    chargerLots(d.lots).then(function () {
      st = M.nouvellePartie({ ligne: d.ligne, ambitions: d.ambitions, lots: d.lots, niveau: d.niveau, graine: d.graine, nivJoueur: d.nivJoueur });
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
    CHOIX = { ligne: m.ligne ? null : "centre", amb: [] };
    choixNiveau(lireNiveau());
    if (!m.ligne && !m.promesses) return demarrer();
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
    var go = bouton("Prendre mes fonctions", "btn m-go", demarrer), msg = h("p", "msg m-msg");
    var bas = h("div", "m-bas"); ajout(bas, bouton("Retour", "btn m-sec", accueil), go);
    box.appendChild(bas); box.appendChild(msg);
    function maj() {
      var ok = CHOIX.ligne && (!m.promesses || CHOIX.amb.length === 2);
      go.disabled = !ok;
      msg.textContent = !CHOIX.ligne ? "Choisis ta ligne politique." : m.promesses && CHOIX.amb.length < 2 ? "Choisis encore " + (2 - CHOIX.amb.length) + " promesse" + (CHOIX.amb.length ? "." : "s.") : "";
    }
    maj();
  }
  function demarrer() {
    box.innerHTML = ""; box.appendChild(h("p", "msg", "Installation à l’Hôtel de Ville…"));
    index().then(function () { var l = choisirLots(); return chargerLots(l).then(function () { return l; }); }).then(function (lots) {
      st = M.nouvellePartie({ ligne: CHOIX.ligne || "centre", ambitions: CHOIX.amb, lots: lots, niveau: niveau, nivJoueur: nivJ() });
      sauver(); demarrerPartie();
    }).catch(function () { alert("Impossible de charger les dossiers. Vérifie ta connexion et réessaie."); accueil(); });
  }
  // Tutoriels des mécaniques pas encore vues, puis roulette de l'opposant (s'il est débloqué), puis le premier trimestre
  function demarrerPartie() {
    choixNiveau(st.niveau, true);
    var a = G.tutosAVoir(M).filter(function (id) { return st.meca[id]; });
    if (a.length) return tutoriel(a[0], demarrerPartie);
    if (st.meca.opposant && st.t === 0) return roulette();
    st = M.debutTour(st, BASE); sauver(); jeu(); haut();
  }
  function tutoriel(id, ensuite) {
    var c = G.HISTOIRE[id], etape = 0;
    fermerModale();
    var pop = h("div", "m-pop m-pop-tuto"); pop.id = "m-modale"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
    var cadre = h("div", "m-pop-in"), carte = h("article", "m-dossier m-tuto");
    cadre.appendChild(carte); pop.appendChild(cadre); (document.getElementById("g-maire") || document.body).appendChild(pop);
    document.body.classList.add("m-modal");
    function dessin() {
      carte.innerHTML = "";
      carte.appendChild(h("p", "m-cat", id === "base" ? "Chapitre 1 · Bienvenue" : "🔓 Nouveau · Chapitre " + c.num));
      carte.appendChild(h("h4", null, c.titre));
      if (etape === 0) carte.appendChild(ajout(h("div", "m-leon m-leon-clair"), h("span", "m-leon-ico", "🧑‍💼"), h("p", null, "« " + c.recit + " »")));
      else carte.appendChild(h("p", "m-tuto-etape", c.etapes[etape - 1]));
      var pts = h("div", "m-points"); for (var i = 0; i <= c.etapes.length; i++) pts.appendChild(h("i", i === etape ? "on" : ""));
      carte.appendChild(pts);
      if (etape === c.etapes.length) carte.appendChild(h("p", "m-chap-obj", "🎯 Objectif du chapitre : " + c.objectif + " (+200 XP)"));
      carte.appendChild(bouton(etape < c.etapes.length ? "Suivant →" : "C’est parti !", "btn m-go", function () {
        if (etape < c.etapes.length) { etape++; dessin(); } else { G.tutoVu(id); fermerModale(); ensuite(); }
      }));
    }
    dessin();
  }
  function reprise() {
    var s = lireSauvegarde(); if (!s) return accueil();
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
    if (st.phase === "fin") return fin();
    if (st.phase === "election") return resultatElection();
    var y = window.scrollY; box.style.minHeight = box.offsetHeight + "px";
    box.innerHTML = "";
    ajout(box, entete(), sondage(), jauges(), piliers());
    if (st.opposant) box.appendChild(bandeauOpp());
    if (st.rapport && st.notes && st.notes.length) box.appendChild(notes());
    ajout(box, boutique());
    if (st.meca.budget) box.appendChild(budget());
    box.appendChild(journal());
    box.appendChild(barreTrimestre());
    box.style.minHeight = ""; window.scrollTo(0, y);
    modale();
  }
  function entete() {
    var d = h("div", "m-entete"), reste = M.prochaineElection(st) - st.t;
    ajout(d, ajout(h("div"), h("span", "m-sur", "Mandat " + st.mandat + (st.defi != null ? " · défi du jour" : "")), h("strong", null, date(Math.max(1, st.t)))),
      h("span", "m-reste", "🗳️ Élection dans " + reste + " trimestre" + (reste > 1 ? "s" : "")));
    var p = h("div", "m-prog"), pi = h("i"); pi.style.width = (M.trimMandat(st) / M.MANDAT * 100) + "%"; p.appendChild(pi); d.appendChild(p);
    return d;
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
    if (st.meca.ligne) t.appendChild(tuile("🧭 Cohérence", String(Math.round(st.coh)), "ligne " + M.LIGNES[st.ligne].nom, st.coh < 40));
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
  function boutique() {
    var d = h("div", "m-boutique"), n = nivJ();
    d.appendChild(h("h5", null, "🛒 Boutique de la Ville"));
    var g = h("div", "m-bats");
    Object.keys(M.BATIMENTS).forEach(function (id) {
      var B = M.BATIMENTS[id], dispo = M.disponible(st, id);
      var lvl = M.MECANIQUES.filter(function (m) { return m.id === ({ 1: "base", 2: "boutique2", 3: "boutique3", 4: "projets" })[B.tier]; })[0].niv;
      if (!dispo) {
        if (lvl > n + 3) return;                                   // on ne montre que les prochains déblocages
        var l = h("div", "m-bat m-bat-lock"); ajout(l, h("span", "m-bico", "🔒"), ajout(h("div"), h("strong", null, B.nom), h("small", null, "Se débloque au niveau " + lvl))); g.appendChild(l); return;
      }
      var non = M.peutAcheter(st, id), px = M.prix(st, id), deja = st.bat[id] || 0;
      var gain = Object.keys(B.e).map(function (k) { return "+" + virg(B.e[k] * M.P.gain * Math.pow(M.P.rendement, deja)) + " " + M.ICO[k]; });
      if (B.rev) gain.push("+" + argent(B.rev) + "/trim.");
      if (B.pop) gain.push("+" + B.pop + " popularité");
      var b = bouton("", "m-bat" + (B.tier === 4 ? " m-bat-projet" : ""), function () {
        if (M.peutAcheter(st, id)) return;
        st = M.acheter(st, id); sauver(); jeu(); toast(B.ico + " " + B.nom + " : c’est fait !");
      });
      b.disabled = !!non;
      ajout(b, h("span", "m-bico", B.ico), ajout(h("div"), h("strong", null, B.nom),
        h("span", "m-gain", gain.join("  ")),
        h("small", null, non && non !== "Pas assez d’argent, même en empruntant." ? non : argent(px) + (B.ent ? " · entretien " + argent(B.ent) + "/trim." : ""))), deja && !B.unique ? h("em", null, "×" + deja) : null);
      g.appendChild(b);
    });
    d.appendChild(g);
    d.appendChild(h("p", "m-aide", "Chaque nouvel exemplaire coûte un peu plus cher et rapporte un peu moins : varie tes achats."));
    return d;
  }
  function budget() {
    var d = h("div", "m-curseur");
    var t = h("div", "m-jt"), val = h("b", null, Math.round(st.taux * 100) + " %");
    ajout(t, h("span", null, "💶 Impôts locaux"), val);
    var r = h("input"); r.type = "range"; r.min = 80; r.max = 130; r.step = 5; r.value = Math.round(st.taux * 100); r.setAttribute("aria-label", "Impôts locaux");
    r.oninput = function () { val.textContent = r.value + " %"; };
    r.onchange = function () { st = M.regler(st, { taux: r.value / 100 }); sauver(); jeu(); };
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
    b.appendChild(bouton(st.phase === "evenement" ? "📂 Un dossier t’attend" : "Trimestre suivant →", "btn m-go", function () {
      if (st.phase === "evenement" || (st.resultat && !st.resultatVu)) return modale();
      st = M.debutTour(st, BASE); sauver(); jeu();
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
    }
    if (l.children.length) parent.appendChild(l);
  }
  function toast(t) {
    var x = h("div", "m-toast", t); (document.getElementById("g-maire") || document.body).appendChild(x);
    setTimeout(function () { x.classList.add("m-toast-out"); }, 1600); setTimeout(function () { x.remove(); }, 2100);
  }

  // ---------- Dossier du trimestre : fenêtre au premier plan ----------
  function fermerModale() { var m = document.getElementById("m-modale"); if (m) m.remove(); document.body.classList.remove("m-modal"); }
  function modale() {
    fermerModale();
    var ev = M.evenementCourant(st, BASE);
    if (!ev || !(st.phase === "evenement" || (st.resultat && !st.resultatVu))) return;
    var sp = st.special || "dossier", pop = h("div", "m-pop m-pop-" + sp); pop.id = "m-modale";
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
    var cadre = h("div", "m-pop-in");
    if (st.special) cadre.appendChild(h("p", "m-pop-titre", st.special === "catastrophe" ? "Alerte : une catastrophe frappe Paris" : st.special === "opposition" ? "Ton opposant passe à l’attaque" : "Bonne nouvelle pour Paris !"));
    var carte = h("article", "m-dossier m-c-" + ev.cat);
    ajout(carte, h("p", "m-cat", (M.FAMILLE[st.special || ev.cat] || "📂 Dossier") + " · " + date(st.t)), h("h4", null, ev.titre));
    if (st.phase === "evenement") {
      carte.appendChild(h("p", "m-desc", ev.desc));
      var ch = h("div", "m-choix");
      ev.choix.forEach(function (x, i) {
        var b = bouton("", "m-option", function () { if (st.phase !== "evenement") return; st = M.choisir(st, BASE, i); sauver(); jeu(); });
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
      carte.appendChild(bouton("Retour à l’Hôtel de Ville", "btn m-go", function () { st.resultatVu = true; sauver(); fermerModale(); if (st.phase === "fin") jeu(); }));
    }
    cadre.appendChild(carte); pop.appendChild(cadre); (document.getElementById("g-maire") || document.body).appendChild(pop);
    document.body.classList.add("m-modal");
    var f = carte.querySelector("button"); if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 50);
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
    box.appendChild(bouton(st.meca.opposant ? "Découvrir mon nouvel opposant" : "Commencer le mandat " + st.mandat, "btn m-go", function () {
      if (st.meca.opposant) return roulette();
      st = M.continuer(st, BASE); sauver(); jeu(); haut();
    }));
    haut();
  }

  // ---------- Fin de partie ----------
  function fin() {
    box.innerHTML = ""; fermerModale();
    choixNiveau(st.niveau);
    var b = M.bilan(st), an = M.analyse(st), e = st.elections[st.elections.length - 1];
    var t = h("div", "m-final m-perdu");
    ajout(t, h("p", "m-sur", (st.defi != null ? "Défi du jour · " : "") + (st.fin.raison.type === "election" ? "Battu aux élections" : "Faillite")),
      h("h4", null, b.mandats ? "Fin de règne après " + virg(b.annees) + " ans et " + b.mandats + " réélection" + (b.mandats > 1 ? "s" : "") : "Ton aventure s’arrête au bout de " + virg(b.annees) + " ans"),
      h("p", "m-raison", st.fin.raison.txt), h("p", "m-score", "Score : " + b.score + " · " + M.NIVEAUX[st.niveau].nom));
    box.appendChild(t);
    if (e && st.fin.raison.type === "election") box.appendChild(carteElection(e));
    if (an) { var a = h("div", "m-analyse"); ajout(a, h("p", "m-sur", "Ce qui s’est passé"), h("p", null, an.phrase), h("p", "m-conseil", "💡 " + an.conseil)); box.appendChild(a); }
    var gz = h("div", "m-gains"); box.appendChild(gz);
    if (!st.prog && !comptage) {
      comptage = true;
      quetes().catch(function () { return []; }).then(function () {
        var res = G.terminer(st, M, { quetes: G.quetesDuJour(G.jour(), QUETES || [], nivJ()) });
        st.prog = { total: res.total, gains: res.gains, avant: res.avant.n, apres: res.apres.n, debloque: res.debloque.map(function (m) { return m.nom; }) };
        comptage = false; sauver(); gains(gz);
        if (window.lbSubmit && window.user) lbSubmit("xp_maire", res.profil.xp);
      });
    } else gains(gz);
    var msg = h("p", "msg m-msg"); box.appendChild(msg);
    if (!st.envoye && window.lbSubmit) { st.envoye = true; sauver(); lbSubmit(cleClassement(st.niveau), b.score).then(function (x) { msg.textContent = x; }); }
    var bas = h("div", "m-bas");
    ajout(bas, bouton("Accueil", "btn m-sec", function () { effacer(); st = null; accueil(); haut(); }),
      bouton("▶ Rejouer", "btn m-go", function () { effacer(); st = null; creation(); haut(); }));
    box.appendChild(bas);
    haut();
  }
  function gains(c) {
    var p = st.prog; if (!p) return; c.innerHTML = "";
    var n = G.niveau(G.lire().xp);
    c.appendChild(h("p", "m-sur", "Ce que cette partie te rapporte : +" + p.total + " XP"));
    if (p.apres > p.avant) c.appendChild(h("p", "m-lvlup", "⬆️ Niveau " + p.apres + " atteint : " + n.titre + " !"));
    (p.debloque || []).forEach(function (nom) { c.appendChild(h("p", "m-debl", "🔓 Débloqué : " + nom + " — Léon t’expliquera tout à la prochaine partie.")); });
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
