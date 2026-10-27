// Maire de Paris (mode tycoon) : interface du jeu, chargée à la demande. Toute la logique est dans moteur.js,
// la progression du joueur (XP, succès, quêtes, défi du jour) dans progression.js.
(function () {
  "use strict";
  var M = window.Maire, G = window.MaireProg, QUETES = null, CLE = "maire_partie_v2", MIN_EVTS = 900;
  var IDX = null, BASE = null, st = null, onglet = "ville", box = null, selArr = null, mode = "bonheur";
  var CHOIX = { ligne: null, amb: [] }, niveau = "moyen", comptage = false;   // comptage : gains de fin de partie en cours de calcul

  // ---------- Outils ----------
  function h(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function ajout(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function bouton(txt, cls, f) { var b = h("button", cls || "btn", txt); b.type = "button"; b.onclick = f; return b; }
  function argent(m) {
    var s = m < 0 ? "−" : "", a = Math.abs(m);
    return s + (a >= 1000 ? (a / 1000).toFixed(2).replace(".", ",").replace(/,?0+$/, "") + " Md€" : (Math.round(a * 10) / 10).toString().replace(".", ",") + " M€");
  }
  function signe(v, unite) { var r = Math.round(v * 10) / 10; return (r > 0 ? "+" : r < 0 ? "−" : "") + String(Math.abs(r)).replace(".", ",") + (unite || ""); }
  function hab(k) { return k >= 1000 ? (k / 1000).toFixed(2).replace(".", ",") + " M" : Math.round(k) + " k"; }
  function pct(v) { return Math.round(v * 100) + " %"; }
  function date(m) { var a = Math.floor((m - 1) / 12) + 1, mo = ((m - 1) % 12); return ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"][mo] + " · année " + a; }
  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(st)); } catch (e) {} }
  function lireSauvegarde() { try { var s = JSON.parse(localStorage.getItem(CLE) || "null"); return s && s.v === 2 && s.ligne ? s : null; } catch (e) { return null; } }
  function effacer() { try { localStorage.removeItem(CLE); } catch (e) {} }
  // Niveau : choisi avec les boutons au-dessus du jeu, il fixe aussi le classement affiché ; bloqué pendant une partie
  function lireNiveau() { try { var n = localStorage.getItem("maire_niveau"); return M.NIVEAUX[n] ? n : "moyen"; } catch (e) { return "moyen"; } }
  function choixNiveau(n, bloque) {
    niveau = M.NIVEAUX[n] ? n : "moyen";
    var lv = document.getElementById("m-lvls");
    if (lv) Array.prototype.forEach.call(lv.children, function (b) { b.classList.toggle("on", b.dataset.l === niveau); b.disabled = !!bloque; });
    if (window.lbRender) lbRender();
  }
  function texteNiveau() { return "Niveau " + M.NIVEAUX[niveau].nom + " : " + M.NIVEAUX[niveau].txt + " Tu peux le changer avec les boutons au-dessus."; }
  function cleClassement(n) { return n === "moyen" ? "maire" : "maire_" + n; }
  function haut() { var g = document.getElementById("g-maire"); if (g && g.getBoundingClientRect().top < 0) g.scrollIntoView({ behavior: "smooth" }); }
  function couleur(v) { var t = Math.max(0, Math.min(1, (v - 30) / 45)); return "hsl(" + Math.round(t * 125) + ",62%," + (38 + t * 4) + "%)"; }

  // ---------- Données : l'index, puis seulement quelques lots par partie ----------
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
    noms = noms.concat(IDX.speciaux ? [IDX.speciaux.f] : []);   // catastrophes et coups de chance : toujours chargés
    return Promise.all(noms.map(function (f) { return fetch("maire/data/" + f).then(function (r) { if (!r.ok) throw 0; return r.json(); }); }))
      .then(function (ls) { BASE = M.indexer([].concat.apply([], ls)); return BASE; });
  }

  // ---------- Écran d'accueil ----------
  function accueil() {
    box.innerHTML = ""; fermerModale();
    var s = lireSauvegarde();
    choixNiveau(s && s.phase !== "fin" ? s.niveau || "moyen" : lireNiveau());
    var hero = h("div", "m-hero");
    ajout(hero, h("p", "m-sur", "Hôtel de Ville · Paris en 20 arrondissements"),
      h("p", "m-intro", "Construis, équilibre le budget, tranche les dossiers chaud et affronte l’opposition. Chaque clic fait passer un mois ; tous les 6 ans, les Parisiens votent. Ta partie dure tant qu’ils te réélisent."));
    box.appendChild(hero);
    box.appendChild(carteProfil());
    var auj = h("div", "m-auj"); box.appendChild(auj);
    Promise.all([index(), quetes()]).then(function () { panneauJour(auj, s); }).catch(function () { auj.remove(); });
    if (s && s.phase !== "fin") {
      var r = h("div", "m-reprise");
      ajout(r, h("strong", null, "Partie en cours"),
        h("span", null, (s.defi != null ? "Défi du jour · " : "") + "Mandat " + s.mandat + " · " + date(Math.max(1, s.mois)) + " · " + M.NIVEAUX[s.niveau].nom + " · " + M.LIGNES[s.ligne].nom),
        bouton("Reprendre", "btn", reprise));
      box.appendChild(r);
    }
    box.appendChild(bouton(s && s.phase !== "fin" ? "Nouvelle partie" : "Devenir maire de Paris", s && s.phase !== "fin" ? "btn m-sec" : "btn", function () {
      if (s && s.phase !== "fin" && !confirm("Commencer une nouvelle partie ? La partie en cours sera perdue.")) return;
      creation();
    }));
    var info = h("p", "m-base", "Chargement de la base d’événements…");
    box.appendChild(info);
    var regles = h("details", "m-regles");
    regles.innerHTML = "<summary>Règles du jeu</summary><ul>" +
      "<li>Chaque clic sur <b>Mois suivant</b> fait passer un mois : les impôts rentrent, l’entretien et les services coûtent, les quartiers évoluent.</li>" +
      "<li><b>Construis</b> dans les 20 arrondissements : logements, écoles, parcs, tramway, métro, commissariats… Chaque bâtiment améliore son quartier (et un peu les voisins), mais coûte un entretien chaque mois.</li>" +
      "<li>Règle les <b>impôts</b> et les budgets de propreté et de sécurité dans l’onglet Budget.</li>" +
      "<li>Presque chaque mois, un <b>dossier</b> arrive : trois décisions, des conséquences parfois cachées. Des catastrophes et des coups de chance surgissent au hasard.</li>" +
      "<li>Un <b>opposant</b> tiré au sort t’attaque tous les 6 mois : riposte, tente de le faire tomber ou laisse faire.</li>" +
      "<li>Tous les 6 ans, l’<b>élection</b> : il te faut la majorité des sièges du Conseil de Paris, arrondissement par arrondissement. Perdre une élection ou faire faillite met fin à la partie.</li>" +
      "<li>Tiens tes deux <b>ambitions</b> (domaine à " + M.P.ambSeuil + " ou plus dans toute la ville) pour gagner des voix.</li>" +
      "<li><b>Trois niveaux</b>, chacun avec son classement. Chaque partie rapporte de l’<b>XP</b> : défi du jour, 3 quêtes quotidiennes et 100 succès.</li></ul>";
    box.appendChild(regles);
    index().then(function (x) {
      info.textContent = "Base : " + x.total.toLocaleString("fr-FR") + " dossiers · " + Object.keys(M.BATIMENTS).length + " types de bâtiments · 20 arrondissements";
    }).catch(function () { info.textContent = "La base d’événements n’a pas pu être chargée. Vérifie ta connexion."; });
  }

  // ---------- Profil du joueur : niveau et XP ----------
  function carteProfil() {
    var P = G.lire(), n = G.niveau(P.xp), c = h("div", "m-profil");
    var t = h("div", "m-pt");
    ajout(t, h("span", "m-pn", String(n.n)), ajout(h("div"), h("strong", null, n.titre), h("small", null, n.max ? P.xp + " XP · niveau maximum" : n.depuis + " / " + n.besoin + " XP vers le niveau " + (n.n + 1))));
    var barre = h("div", "m-barre"), i = h("i"); i.style.width = n.pct + "%"; barre.appendChild(i);
    var nb = Object.keys(P.succes).filter(function (id) { return G.SUCCES.some(function (x) { return x.id === id; }); }).length;
    ajout(c, t, barre, bouton("🏅 Succès " + nb + " / " + G.SUCCES.length, "btn m-sec m-bsucces", succes));
    return c;
  }
  // ---------- Aujourd'hui : défi du jour et 3 quêtes ----------
  function panneauJour(c, s) {
    var j = G.jour(), P = G.lire(), d = G.defiDuJour(j, M, IDX.lots, MIN_EVTS), fait = P.defiJours[j], qs = G.quetesDuJour(j, QUETES), ok = P.quetesJour[j] || [];
    c.innerHTML = "";
    var df = h("div", "m-defi");
    ajout(df, h("p", "m-sur", "Défi du jour"),
      h("strong", null, M.NIVEAUX[d.niveau].nom + " · " + M.LIGNES[d.ligne].nom + " · " + d.ambitions.map(function (a) { return M.DOMAINES[a]; }).join(" et ")),
      h("span", null, fait ? (fait.mandats >= 1 ? "✔ Défi réussi aujourd’hui (" + fait.mandats + " élection" + (fait.mandats > 1 ? "s" : "") + " gagnée" + (fait.mandats > 1 ? "s" : "") + ", score " + fait.score + ")." : "Défi tenté aujourd’hui : raté (score " + fait.score + "). Reviens demain !") :
        "Même départ pour tout le monde : même niveau, même ligne, mêmes ambitions, même opposant. Gagne ta première élection pour 150 XP (+50 si tu gagnes la deuxième)."));
    if (!fait) df.appendChild(bouton("Relever le défi", "btn m-go", function () {
      if (s && s.phase !== "fin" && !confirm("Relever le défi ? La partie en cours sera perdue.")) return;
      lancerDefi(d);
    }));
    c.appendChild(df);
    var q = h("div", "m-quetes");
    q.appendChild(h("p", "m-sur", "Quêtes du jour · " + ok.length + "/3"));
    var u = h("ul", "m-qliste");
    qs.forEach(function (x) { var li = h("li", ok.indexOf(x.id) >= 0 ? "m-qok" : ""); ajout(li, h("span", null, (ok.indexOf(x.id) >= 0 ? "✔ " : "") + x.t), h("b", null, "+" + x.xp + " XP")); u.appendChild(li); });
    q.appendChild(u);
    q.appendChild(h("small", null, "Valables dans n’importe quelle partie terminée aujourd’hui, défi compris. Nouvelles quêtes demain."));
    c.appendChild(q);
  }
  function lancerDefi(d) {
    choixNiveau(d.niveau, true);
    box.innerHTML = ""; box.appendChild(h("p", "msg", "Préparation du défi…"));
    chargerLots(d.lots).then(function () {
      st = M.nouvellePartie({ ligne: d.ligne, ambitions: d.ambitions, lots: d.lots, niveau: d.niveau, graine: d.graine });
      st.defi = d.jour; sauver(); roulette();
    }).catch(function () { alert("Impossible de charger les événements. Vérifie ta connexion et réessaie."); accueil(); });
  }
  // ---------- Succès ----------
  function succes() {
    var P = G.lire(); box.innerHTML = ""; choixNiveau(niveau);
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
  // ---------- Roulette : tirage de l'opposant (début de partie et début de chaque mandat) ----------
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
    (function tick() {
      montre((k + n) % noms.length);
      if (n >= tours) return fin();
      n++; setTimeout(tick, 45 + Math.pow(n / tours, 3) * 260);
    })();
    function fin() {
      montre(o.i); fen.classList.add("m-rstop");
      var barre = h("div", "m-barre"), i = h("i"); i.style.width = o.force + "%"; barre.appendChild(i);
      ajout(fiche, h("p", null, o.txt),
        ajout(h("div", "m-jt"), h("span", null, "Influence"), h("b", null, Math.round(o.force) + "/100 · " + M.humeurOpp(o.force))), barre,
        h("p", "m-aide", "Tous les 6 mois, " + o.nom + " t’attaquera. Tu pourras riposter (argent ou cohérence), tenter de le faire tomber (une chance sur deux) ou laisser faire : il reviendra plus fort. Sous " + M.SEUIL_OPP + " d’influence, il renonce."),
        bouton(st.mois ? "Commencer le mandat " + st.mandat : "Entrer en fonctions", "btn m-go", function () {
          st = st.phase === "election" ? M.continuer(st, BASE) : M.debutTour(st, BASE); sauver(); onglet = "ville"; jeu(); haut();
        }));
      fiche.hidden = false;
    }
  }

  // ---------- Création du maire ----------
  function creation() {
    box.innerHTML = ""; CHOIX = { ligne: null, amb: [] };
    choixNiveau(niveau);
    box.appendChild(h("p", "m-nivtxt", texteNiveau()));
    box.appendChild(h("p", "m-etape", "1. Ta ligne politique"));
    var lg = h("div", "m-lignes");
    Object.keys(M.LIGNES).forEach(function (k) {
      var b = bouton("", "m-ligne m-l-" + k, function () {
        CHOIX.ligne = k;
        Array.prototype.forEach.call(lg.children, function (x) { x.setAttribute("aria-pressed", x === b); });
        maj();
      });
      b.setAttribute("aria-pressed", "false");
      ajout(b, h("strong", null, M.LIGNES[k].nom), h("span", null, M.LIGNES[k].txt));
      lg.appendChild(b);
    });
    box.appendChild(lg);
    box.appendChild(h("p", "m-etape", "2. Deux promesses de campagne"));
    var am = h("div", "m-ambs");
    Object.keys(M.DOMAINES).forEach(function (k) {
      var b = bouton(M.DOMAINES[k], "m-amb", function () {
        var i = CHOIX.amb.indexOf(k);
        if (i >= 0) CHOIX.amb.splice(i, 1); else { if (CHOIX.amb.length === 2) CHOIX.amb.shift(); CHOIX.amb.push(k); }
        Array.prototype.forEach.call(am.children, function (x) { x.setAttribute("aria-pressed", CHOIX.amb.indexOf(x.dataset.k) >= 0); });
        maj();
      });
      b.dataset.k = k; b.setAttribute("aria-pressed", "false");
      am.appendChild(b);
    });
    box.appendChild(am);
    var go = bouton("Prendre mes fonctions", "btn m-go", demarrer), msg = h("p", "msg m-msg");
    var bas = h("div", "m-bas"); ajout(bas, bouton("Retour", "btn m-sec", accueil), go);
    box.appendChild(bas); box.appendChild(msg);
    function maj() {
      go.disabled = !(CHOIX.ligne && CHOIX.amb.length === 2);
      msg.textContent = !CHOIX.ligne ? "Choisis ta ligne politique." : CHOIX.amb.length < 2 ? "Choisis encore " + (2 - CHOIX.amb.length) + " promesse" + (CHOIX.amb.length ? "." : "s.") : "";
    }
    maj();
  }
  function demarrer(e) {
    var b = e && e.currentTarget; if (b) { b.disabled = true; b.textContent = "Installation à l’Hôtel de Ville…"; }
    index().then(function () { var l = choisirLots(); return chargerLots(l).then(function () { return l; }); }).then(function (lots) {
      st = M.nouvellePartie({ ligne: CHOIX.ligne, ambitions: CHOIX.amb, lots: lots, niveau: niveau });
      choixNiveau(niveau, true); sauver(); roulette();
    }).catch(function () {
      if (b) { b.disabled = false; b.textContent = "Prendre mes fonctions"; }
      alert("Impossible de charger les événements. Vérifie ta connexion et réessaie.");
    });
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
      if (st.phase === "pret") return roulette();
      onglet = "ville"; jeu();
    }).catch(function () { alert("Impossible de charger les événements. Vérifie ta connexion et réessaie."); });
  }

  // ---------- Écran principal ----------
  function jeu() {
    if (st.phase === "fin") return fin();
    if (st.phase === "election") return resultatElection();
    var y = window.scrollY; box.style.minHeight = box.offsetHeight + "px";
    box.innerHTML = "";
    ajout(box, tableau(), onglets());
    var c = h("div", "m-contenu"); box.appendChild(c);
    ({ ville: ville, budget: budget, ambitions: ambitions, historique: historique })[onglet](c);
    box.appendChild(barreMois());
    box.style.minHeight = ""; window.scrollTo(0, y);
    modale();
  }
  function jauge(nom, v, sous) {
    var d = h("div", "m-jauge" + (v < 40 ? " m-danger" : ""));
    var t = h("div", "m-jt"); ajout(t, h("span", null, nom), h("b", null, String(Math.round(v))));
    var barre = h("div", "m-barre"), r = h("i"); r.style.width = v + "%"; barre.appendChild(r);
    ajout(d, t, barre); if (sous) d.appendChild(h("small", null, sous));
    return d;
  }
  function tableau() {
    var t = h("div", "m-tab"), sem = h("div", "m-sem"), reste = M.prochaineElection(st) - st.mois;
    ajout(sem, h("span", null, "Mandat " + st.mandat), h("b", null, date(Math.max(1, st.mois))), h("small", null, "🗳️ Élection dans " + reste + " mois"));
    var p = h("div", "m-prog"), pi = h("i"); pi.style.width = (M.moisMandat(st) / M.MANDAT * 100) + "%"; p.appendChild(pi); sem.appendChild(p);
    t.appendChild(sem);
    var so = M.solde(st), b = h("div", "m-jauge m-budget" + (st.dette > M.PLAFOND_DETTE * 0.7 ? " m-danger" : ""));
    ajout(b, h("span", null, "Trésorerie"), h("b", null, argent(st.tresor)), h("small", null, (so >= 0 ? "+" : "") + argent(so) + " / mois" + (st.dette > 0 ? " · dette " + argent(st.dette) : "")));
    ajout(t, b, jauge("Popularité", st.pop), jauge("Bonheur", M.bonheur(st)));
    var hb = h("div", "m-jauge m-hab"); ajout(hb, h("span", null, "Habitants"), h("b", null, hab(M.habitants(st))), h("small", null, st.rapport ? signe(st.rapport.hab, " k ce mois") : ""));
    t.appendChild(hb);
    return t;
  }
  function onglets() {
    var n = h("div", "m-onglets"); n.setAttribute("role", "tablist");
    [["ville", "🗺️ Ville"], ["budget", "💶 Budget"], ["ambitions", "🎯 Promesses"], ["historique", "📜 Historique"]].forEach(function (o) {
      var b = bouton(o[1], "m-onglet", function () { onglet = o[0]; jeu(); });
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", onglet === o[0]);
      n.appendChild(b);
    });
    return n;
  }
  function barreMois() {
    var b = h("div", "m-barmois"), attente = st.phase === "evenement";
    var go = bouton(attente ? "Un dossier t’attend" : "Mois suivant →", "btn m-go", function () {
      if (st.phase === "evenement") return modale();
      st = M.debutTour(st, BASE); sauver(); jeu();
    });
    b.appendChild(go);
    return b;
  }
  function variations(d, parent) {
    var l = h("ul", "m-delta");
    function puce(v, txt) { if (!v) return; l.appendChild(h("li", v > 0 ? "m-up" : "m-down", txt)); }
    if (d) {
      puce(d.pop, signe(d.pop) + " popularité"); puce(d.bon, signe(d.bon) + " humeur"); puce(d.coh, signe(d.coh) + " cohérence");
      if (d.bud) puce(d.bud, (d.bud > 0 ? "+" : "") + argent(d.bud));
      Object.keys(d.dom || {}).forEach(function (k) { puce(d.dom[k], signe(d.dom[k]) + " " + M.DOMAINES[k].toLowerCase()); });
    }
    if (l.children.length) parent.appendChild(l);
  }

  // ---------- Onglet Ville : carte des 20 arrondissements ----------
  function valeurArr(a) { return mode === "bonheur" ? M.bonheurArr(st, a) : a.dom[mode]; }
  function ville(c) {
    if (st.rapport && st.mois) {
      var r = h("div", "m-rapport");
      ajout(r, h("strong", null, "Rapport de " + date(st.rapport.mois).split(" · ")[0]),
        h("span", null, "Recettes " + argent(st.rapport.recettes) + " · Dépenses " + argent(st.rapport.depenses) + " · Solde " + signe(st.rapport.solde, " M€") + " · Habitants " + signe(st.rapport.hab, " k")));
      (st.notes || []).forEach(function (x) { var p = h("div", "m-note"); p.appendChild(h("p", null, "⏳ " + x.txt)); variations(x.d, p); r.appendChild(p); });
      c.appendChild(r);
    }
    if (st.opposant) c.appendChild(bandeauOpp());
    var sel = h("div", "m-modes");
    [["bonheur", "Bonheur"]].concat(Object.keys(M.DOMAINES).map(function (k) { return [k, M.DOMAINES[k]]; })).forEach(function (m) {
      var b = bouton(m[1], "m-mode" + (mode === m[0] ? " on" : ""), function () { mode = m[0]; jeu(); }); sel.appendChild(b);
    });
    c.appendChild(sel);
    var carte = h("div", "m-carte");
    st.arr.forEach(function (a, i) {
      var v = valeurArr(a), nb = 0; Object.keys(a.bat).forEach(function (k) { nb += a.bat[k]; });
      var t = bouton("", "m-tuile" + (selArr === i ? " on" : "") + (st.lieu === i && st.phase === "evenement" ? " m-alerte" : ""), function () { selArr = selArr === i ? null : i; jeu(); });
      t.style.gridColumn = (M.GRILLE[i][0] + 1); t.style.gridRow = (M.GRILLE[i][1] + 1); t.style.background = couleur(v);
      t.setAttribute("aria-label", M.nomArr(i) + " arrondissement, " + (mode === "bonheur" ? "bonheur" : M.DOMAINES[mode]) + " " + Math.round(v));
      ajout(t, h("b", null, M.nomArr(i)), h("span", null, String(Math.round(v))), nb ? h("small", null, "🏗️" + nb) : null);
      carte.appendChild(t);
    });
    c.appendChild(carte);
    c.appendChild(h("p", "m-aide", "Couleur : " + (mode === "bonheur" ? "bonheur des habitants" : M.DOMAINES[mode].toLowerCase()) + " (rouge = mauvais, vert = bon). Touche un arrondissement pour y construire."));
    if (selArr != null) c.appendChild(panneauArr(selArr));
  }
  function panneauArr(i) {
    var a = st.arr[i], p = h("div", "m-arr");
    p.id = "m-arr";
    ajout(p, h("h4", null, M.nomArr(i) + " arrondissement"),
      h("p", "m-arr-info", hab(a.pop) + " habitants · bonheur " + Math.round(M.bonheurArr(st, a))));
    var g = h("div", "m-doms");
    var c = M.cible(st, i);
    Object.keys(M.DOMAINES).forEach(function (k) {
      var d = h("div", "m-dom"), t = h("div", "m-jt"), fl = c[k] > a.dom[k] + 1 ? " ↗" : c[k] < a.dom[k] - 1 ? " ↘" : "";
      ajout(t, h("span", null, M.DOMAINES[k]), h("b", null, Math.round(a.dom[k]) + fl));
      var barre = h("div", "m-barre"), r = h("i"); r.style.width = a.dom[k] + "%"; r.style.background = couleur(a.dom[k]); barre.appendChild(r);
      ajout(d, t, barre); g.appendChild(d);
    });
    p.appendChild(g);
    var deja = Object.keys(a.bat).filter(function (k) { return a.bat[k]; });
    p.appendChild(h("p", "m-arr-bats", deja.length ? "Déjà construit : " + deja.map(function (k) { return M.BATIMENTS[k].ico + " " + M.BATIMENTS[k].nom + (a.bat[k] > 1 ? " ×" + a.bat[k] : ""); }).join(" · ") : "Aucun bâtiment de la Ville pour l’instant."));
    p.appendChild(h("h5", null, "Construire"));
    var l = h("div", "m-bats");
    Object.keys(M.BATIMENTS).forEach(function (id) {
      var B = M.BATIMENTS[id], non = M.peutConstruire(st, i, id);
      var b = bouton("", "m-bat", function () {
        if (M.peutConstruire(st, i, id)) return;
        st = M.construire(st, i, id); sauver(); jeu();
        toast(B.ico + " " + B.nom + " construit dans le " + M.nomArr(i) + " !");
      });
      b.disabled = !!non;
      var eff = Object.keys(B.e).map(function (k) { return (B.e[k] > 0 ? "+" : "−") + Math.abs(B.e[k]) + " " + M.DOMAINES[k].toLowerCase(); });
      if (B.cap) eff.push("+" + B.cap + " k places");
      if (B.rev) eff.push("+" + argent(B.rev) + "/mois");
      ajout(b, h("span", "m-bico", B.ico), ajout(h("div"), h("strong", null, B.nom),
        h("span", null, (B.cout > 0 ? argent(B.cout) : "rapporte " + argent(-B.cout)) + (B.ent ? " · entretien " + argent(B.ent) + "/mois" : "")),
        h("small", null, non || eff.join(" · "))), a.bat[id] ? h("em", null, "×" + a.bat[id]) : null);
      l.appendChild(b);
    });
    p.appendChild(l);
    return p;
  }
  function toast(t) {
    var x = h("div", "m-toast", t); (document.getElementById("g-maire") || document.body).appendChild(x);
    setTimeout(function () { x.classList.add("m-toast-out"); }, 1800); setTimeout(function () { x.remove(); }, 2300);
  }
  function bandeauOpp() {
    var o = M.opposant(st), b = h("div", "m-opp" + (o.actif ? "" : " m-opp-fini"));
    var mm = M.moisMandat(st), prochaine = (Math.floor(mm / 6) + 1) * 6 - mm;
    ajout(b, h("span", "m-rico", o.ico), ajout(h("div"), h("strong", null, o.nom),
      h("span", null, o.actif ? "Influence " + Math.round(o.force) + "/100 · " + M.humeurOpp(o.force) + " · prochaine attaque dans " + prochaine + " mois" : "A renoncé jusqu’à la prochaine élection")));
    return b;
  }

  // ---------- Onglet Budget ----------
  function budget(c) {
    var g = h("div", "m-fin");
    [["Recettes / mois", argent(M.recettes(st))], ["Dépenses / mois", argent(M.depenses(st))], ["Solde / mois", signe(M.solde(st), " M€")],
      ["Trésorerie", argent(st.tresor)], ["Dette", argent(st.dette) + " / " + argent(M.PLAFOND_DETTE)], ["Entretien des bâtiments", argent(M.entretien(st)) + "/mois"]].forEach(function (x) {
      var d = h("div", "m-chiffre"); ajout(d, h("span", null, x[0]), h("b", null, x[1])); g.appendChild(d);
    });
    c.appendChild(g);
    c.appendChild(h("h5", null, "Réglages"));
    c.appendChild(curseur("Impôts locaux", st.taux, 0.8, 1.3, "taux", "Plus d’impôts = plus de recettes, mais le pouvoir d’achat, l’économie et ta popularité en souffrent."));
    c.appendChild(curseur("Budget propreté", st.budgets.proprete, 0.5, 1.5, "proprete", "Coûte " + argent(M.P.budProprete) + " par mois au niveau normal ; améliore la propreté partout."));
    c.appendChild(curseur("Budget sécurité", st.budgets.securite, 0.5, 1.5, "securite", "Coûte " + argent(M.P.budSecurite) + " par mois au niveau normal ; améliore la sécurité partout."));
    c.appendChild(h("p", "m-aide", "Si la trésorerie passe sous zéro, la ville emprunte automatiquement ; au-delà de " + argent(M.PLAFOND_DETTE) + " de dette, c’est la faillite."));
    c.appendChild(h("h5", null, "Engagements en cours"));
    var eng = h("ul", "m-liste");
    st.recurrents.forEach(function (r) { eng.appendChild(ligne(r.l, (r.m > 0 ? "+" : "") + argent(r.m) + "/mois · encore " + r.n + " mois", r.m)); });
    if (!eng.children.length) eng.appendChild(h("li", "m-vide", "Aucun engagement en cours."));
    c.appendChild(eng);
    c.appendChild(h("h5", null, "Mouvements récents"));
    var j = h("ul", "m-liste");
    st.journal.slice().reverse().slice(0, 25).forEach(function (x) {
      j.appendChild(ligne(date(Math.max(1, x.mois)).split(" · ")[0] + " · " + x.l, (x.m > 0 ? "+" : "") + argent(x.m), /^Emprunt|^Remboursement/.test(x.l) ? 0 : x.m));
    });
    if (!j.children.length) j.appendChild(h("li", "m-vide", "Rien pour l’instant."));
    c.appendChild(j);
    function ligne(l, v, s) { var li = h("li", s > 0 ? "m-up" : s < 0 ? "m-down" : ""); ajout(li, h("span", null, l), h("b", null, v)); return li; }
  }
  function curseur(nom, v, a, b, cle, aide) {
    var d = h("div", "m-curseur"), t = h("div", "m-jt"), val = h("b", null, pct(v));
    ajout(t, h("span", null, nom), val);
    var r = h("input"); r.type = "range"; r.min = a * 100; r.max = b * 100; r.step = 5; r.value = Math.round(v * 100);
    r.setAttribute("aria-label", nom);
    r.oninput = function () { val.textContent = r.value + " %"; };
    r.onchange = function () { var o = {}; o[cle] = r.value / 100; st = M.regler(st, o); sauver(); jeu(); };
    ajout(d, t, r, h("small", null, aide));
    return d;
  }

  // ---------- Onglet Promesses (ambitions) ----------
  function ambitions(c) {
    var l = h("div", "m-ligne-rap"); ajout(l, h("strong", null, "Ligne " + M.LIGNES[st.ligne].nom + " · cohérence " + Math.round(st.coh)), h("span", null, M.LIGNES[st.ligne].txt));
    c.appendChild(l);
    c.appendChild(h("h5", null, "Tes promesses de campagne"));
    st.ambitions.forEach(function (k) { c.appendChild(jaugeDom(M.DOMAINES[k], M.domVille(st, k), M.P.ambSeuil, true)); });
    c.appendChild(h("h5", null, "Paris, domaine par domaine"));
    var g = h("div", "m-doms");
    Object.keys(M.DOMAINES).forEach(function (k) { if (st.ambitions.indexOf(k) < 0) g.appendChild(jaugeDom(M.DOMAINES[k], M.domVille(st, k))); });
    c.appendChild(g);
    c.appendChild(h("p", "m-aide", "Moyennes de toute la ville, pondérées par la population. Sans entretien, chaque quartier se dégrade peu à peu : les bâtiments et les budgets le font remonter."));
    if (st.elections.length) {
      c.appendChild(h("h5", null, "Tes élections"));
      var u = h("ul", "m-liste");
      st.elections.forEach(function (e) { u.appendChild(ajout(h("li", e.gagne ? "m-up" : "m-down"), h("span", null, "Mandat " + e.mandat + " · face à " + e.opposant), h("b", null, e.sieges + " sièges sur " + e.total))); });
      c.appendChild(u);
    }
  }
  function jaugeDom(nom, v, cible, amb) {
    var d = h("div", "m-niv" + (amb ? " m-niv-amb" : ""));
    var t = h("div", "m-jt"); ajout(t, h("span", null, nom), h("b", null, String(Math.round(v))));
    var barre = h("div", "m-barre"), r = h("i"); r.style.width = v + "%"; barre.appendChild(r);
    if (cible) { var s = h("em", "m-cible"); s.style.left = cible + "%"; barre.appendChild(s); }
    ajout(d, t, barre);
    if (amb) d.appendChild(h("small", null, v >= cible ? "✔ Promesse tenue pour l’instant (+3 % de voix à l’élection)" : "Objectif : " + cible + " le jour de l’élection"));
    return d;
  }
  function historique(c) {
    if (!st.historique.length) { c.appendChild(h("p", "m-vide", "Aucune décision pour l’instant.")); return; }
    var l = h("ol", "m-histo");
    st.historique.slice().reverse().slice(0, 120).forEach(function (x) {
      var li = h("li"); ajout(li, h("span", "m-hs", "M" + x.mois), h("strong", null, (x.sp === "catastrophe" ? "🚨 " : x.sp === "chance" ? "🍀 " : x.sp === "opposition" ? "⚔️ " : "") + x.titre), h("span", "m-hc", x.choix));
      if (x.c !== "construction") variations({ pop: x.d.pop, bon: x.d.bon, coh: x.d.coh, bud: x.d.bud }, li);
      l.appendChild(li);
    });
    c.appendChild(l);
  }

  // ---------- Dossier du mois : fenêtre au premier plan ----------
  function fermerModale() { var m = document.getElementById("m-modale"); if (m) m.remove(); document.body.classList.remove("m-modal"); }
  function modale() {
    fermerModale();
    var ev = M.evenementCourant(st, BASE);
    var montrer = st.phase === "evenement" || (st.resultat && !st.resultatVu);
    if (!ev || !montrer) return;
    var sp = st.special || "dossier", pop = h("div", "m-pop m-pop-" + sp); pop.id = "m-modale";
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
    var cadre = h("div", "m-pop-in");
    if (st.special) cadre.appendChild(h("p", "m-pop-titre", st.special === "catastrophe" ? "Alerte : une catastrophe frappe Paris" : st.special === "opposition" ? "Ton opposant passe à l’attaque" : "Bonne nouvelle pour Paris !"));
    var carte = h("article", "m-dossier m-c-" + ev.cat);
    var lieu = st.lieu != null && !st.evPerso ? " · 📍 " + M.nomArr(st.lieu) + " arr." : "";
    ajout(carte, h("p", "m-cat", (st.special === "catastrophe" ? "🚨 Catastrophe" : st.special === "chance" ? "🍀 Coup de chance" : st.special === "opposition" ? "⚔️ Attaque de l’opposition" : M.CATS[ev.cat]) + lieu + " · " + date(st.mois).split(" · ")[0]), h("h4", null, ev.titre));
    if (st.phase === "evenement") {
      carte.appendChild(h("p", "m-desc", ev.desc));
      var ch = h("div", "m-choix");
      ev.choix.forEach(function (x, i) {
        var b = bouton("", "m-option", function () {
          if (st.phase !== "evenement") return;
          st = M.choisir(st, BASE, i); st.resultatVu = false; sauver(); jeu();
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
      if (r.rec) carte.appendChild(h("p", "m-extra", "🔁 " + (r.rec.m < 0 ? "Coût de " : "Recette de ") + argent(Math.abs(r.rec.m)) + " par mois pendant " + r.rec.n + " mois."));
      if (r.dif) carte.appendChild(h("p", "m-extra", "⏳ Cette décision aura encore des conséquences dans les mois à venir."));
      carte.appendChild(bouton("Retour à la ville", "btn m-go", function () { st.resultatVu = true; sauver(); fermerModale(); if (st.phase === "fin") jeu(); }));
    }
    cadre.appendChild(carte); pop.appendChild(cadre); (document.getElementById("g-maire") || document.body).appendChild(pop);
    document.body.classList.add("m-modal");
    var f = carte.querySelector("button"); if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 50);
  }

  // ---------- Élection gagnée : résultats puis nouveau mandat ----------
  function carteElection(e, o) {
    var d = h("div", "m-election" + (e.gagne ? " m-gagne" : " m-perdu"));
    var bm = h("div", "m-ebarre"), im = h("i"), il = h("i"); im.style.width = (e.sieges / e.total * 100) + "%"; il.style.width = (100 - e.sieges / e.total * 100) + "%"; ajout(bm, im, il);
    ajout(d, h("p", "m-sur", "🗳️ Élection municipale · mandat " + e.mandat),
      ajout(h("div", "m-escore"), h("span", null, "Toi · " + e.sieges + " sièges"), h("span", null, e.opposant + " · " + (e.total - e.sieges) + " sièges")), bm,
      h("p", "m-aide", "Majorité : " + (Math.floor(e.total / 2) + 1) + " sièges sur " + e.total + " · " + String(e.pct).replace(".", ",") + " % des voix · en tête dans " + e.arrGagnes + " arrondissements sur 20"));
    var carte = h("div", "m-carte m-carte-mini");
    e.arr.forEach(function (p, i) {
      var t = h("div", "m-tuile"); t.style.gridColumn = M.GRILLE[i][0] + 1; t.style.gridRow = M.GRILLE[i][1] + 1;
      t.style.background = p > 50 ? "hsl(42,90%," + (62 - (p - 50)) + "%)" : "hsl(265,50%," + (40 + (50 - p) / 2) + "%)";
      ajout(t, h("b", null, M.nomArr(i)), h("span", null, Math.round(p) + " %")); carte.appendChild(t);
    });
    d.appendChild(carte);
    return d;
  }
  function resultatElection() {
    box.innerHTML = ""; fermerModale();
    var e = st.elections[st.elections.length - 1];
    var t = h("div", "m-final m-gagne");
    ajout(t, h("p", "m-sur", "Réélu !"), h("h4", null, "Les Parisiens te confient un mandat de plus"),
      h("p", "m-raison", "Tu entames ton mandat n° " + st.mandat + ". Un nouvel opposant se lève, plus coriace : chaque réélection est plus difficile que la précédente."));
    box.appendChild(t);
    box.appendChild(carteElection(e));
    box.appendChild(bouton("Découvrir mon nouvel opposant", "btn m-go", roulette));
    haut();
  }

  // ---------- Fin de partie ----------
  function fin() {
    box.innerHTML = ""; fermerModale();
    choixNiveau(st.niveau);
    var b = M.bilan(st), an = M.analyse(st), e = st.elections[st.elections.length - 1];
    var t = h("div", "m-final m-perdu");
    ajout(t, h("p", "m-sur", (st.defi != null ? "Défi du jour · " : "") + (st.fin.raison.type === "election" ? "Battu aux élections" : "Faillite")),
      h("h4", null, b.mandats ? "Fin de règne après " + Math.floor(b.mois / 12) + " ans et " + b.mandats + " réélection" + (b.mandats > 1 ? "s" : "") : "Ton aventure s’arrête au bout de " + Math.max(1, Math.round(b.mois / 12)) + " an" + (b.mois >= 24 ? "s" : "")),
      h("p", "m-raison", st.fin.raison.txt),
      h("p", "m-score", "Score : " + b.score + " · niveau " + M.NIVEAUX[st.niveau].nom));
    box.appendChild(t);
    if (e && st.fin.raison.type === "election") box.appendChild(carteElection(e));
    if (an) { var a = h("div", "m-analyse"); ajout(a, h("p", "m-sur", "Ce qui s’est passé"), h("p", null, an.phrase), h("p", "m-conseil", "💡 " + an.conseil)); box.appendChild(a); }
    var gz = h("div", "m-gains"); box.appendChild(gz);
    if (!st.prog && !comptage) {
      comptage = true;
      quetes().catch(function () { return []; }).then(function () {
        var res = G.terminer(st, M, { quetes: G.quetesDuJour(G.jour(), QUETES || []) });
        st.prog = { total: res.total, gains: res.gains, avant: res.avant.n, apres: res.apres.n };
        comptage = false; sauver(); gains(gz);
        if (window.lbSubmit && window.user) lbSubmit("xp_maire", res.profil.xp);
      });
    } else gains(gz);
    var s = h("div", "m-fin");
    [["Mandats gagnés", b.mandats], ["Années au pouvoir", (b.mois / 12).toFixed(1).replace(".", ",")], ["Habitants", hab(b.habitants)], ["Bonheur", Math.round(b.bonheur)],
      ["Bâtiments construits", M.stats(st).construits], ["Dossiers traités", M.stats(st).dossiers]].forEach(function (x) {
      var d = h("div", "m-chiffre"); ajout(d, h("span", null, x[0]), h("b", null, String(x[1]))); s.appendChild(d);
    });
    box.appendChild(s);
    function liste(titre, l) {
      if (!l.length) return;
      box.appendChild(h("h5", null, titre));
      var u = h("ol", "m-histo");
      l.forEach(function (x) { var li = h("li"); ajout(li, h("span", "m-hs", "M" + x.mois), h("strong", null, x.titre), h("span", "m-hc", x.choix)); u.appendChild(li); });
      box.appendChild(u);
    }
    liste("Les décisions qui t’ont le plus coûté", b.pires.filter(function (x) { return x.v < 0; }));
    liste("Tes meilleures décisions", b.meilleures.filter(function (x) { return x.v > 0; }));
    var msg = h("p", "msg m-msg"); box.appendChild(msg);
    if (!st.envoye && window.lbSubmit) {
      st.envoye = true; sauver();
      lbSubmit(cleClassement(st.niveau), b.score).then(function (x) { msg.textContent = x; });
    }
    var bas = h("div", "m-bas");
    ajout(bas, bouton("Historique complet", "btn m-sec", histoFin),
      bouton("Nouvelle partie", "btn m-go", function () { effacer(); st = null; creation(); haut(); }));
    box.appendChild(bas);
    haut();
  }
  function gains(c) {
    var p = st.prog; if (!p) return; c.innerHTML = "";
    var n = G.niveau(G.lire().xp);
    c.appendChild(h("p", "m-sur", "Ce que cette partie te rapporte : +" + p.total + " XP"));
    if (p.apres > p.avant) c.appendChild(h("p", "m-lvlup", "⬆️ Niveau " + p.apres + " atteint : " + n.titre + " !"));
    var u = h("ul", "m-liste");
    p.gains.forEach(function (x) { var li = h("li", "m-up"); ajout(li, h("span", null, x.txt), h("b", null, "+" + x.xp + " XP")); u.appendChild(li); });
    c.appendChild(u);
    var barre = h("div", "m-barre"), i = h("i"); i.style.width = n.pct + "%"; barre.appendChild(i);
    ajout(c, h("small", null, "Niveau " + n.n + " · " + n.titre + (n.max ? "" : " · " + n.depuis + " / " + n.besoin + " XP")), barre);
  }
  function histoFin() {
    box.innerHTML = "";
    box.appendChild(bouton("← Retour au bilan", "btn m-sec", function () { fin(); }));
    historique(box);
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
        var t = box.querySelector(".m-nivtxt"); if (t) t.textContent = texteNiveau();
      };
    });
    if (window.lbBoard) lbBoard("lb-maire", function () { return cleClassement(niveau); }, function () { return "🏆 Classement général · Maire de Paris " + M.NIVEAUX[niveau].nom; });
    accueil();
  };
  window.maireStop = function () { fermerModale(); };
})();
