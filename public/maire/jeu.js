// Maire de Paris : interface du jeu (chargée à la demande). Toute la logique est dans moteur.js.
(function () {
  "use strict";
  var M = window.Maire, G = window.MaireProg, QUETES = null, CLE = "maire_partie_v1", MIN_EVTS = 550;
  var IDX = null, BASE = null, st = null, onglet = "decision", finVue = false, box = null;
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
  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(st)); } catch (e) {} }
  function lireSauvegarde() { try { var s = JSON.parse(localStorage.getItem(CLE) || "null"); return s && s.v === 1 && s.ligne ? s : null; } catch (e) { return null; } }
  function effacer() { try { localStorage.removeItem(CLE); } catch (e) {} }
  // Niveau : choisi avec les boutons au-dessus du jeu, il fixe aussi le classement affiché.
  // Pendant une partie, les boutons sont bloqués sur le niveau de la partie.
  function lireNiveau() { try { var n = localStorage.getItem("maire_niveau"); return M.NIVEAUX[n] ? n : "moyen"; } catch (e) { return "moyen"; } }
  function choixNiveau(n, bloque) {
    niveau = M.NIVEAUX[n] ? n : "moyen";
    var lv = document.getElementById("m-lvls");
    if (lv) Array.prototype.forEach.call(lv.children, function (b) { b.classList.toggle("on", b.dataset.l === niveau); b.disabled = !!bloque; });
    if (window.lbRender) lbRender();
  }
  function texteNiveau() { return "Niveau " + M.NIVEAUX[niveau].nom + " : " + M.NIVEAUX[niveau].txt + " Tu peux le changer avec les boutons au-dessus."; }
  // Le classement du niveau moyen garde la clé d'origine « maire » : les scores déjà enregistrés y restent
  function cleClassement(n) { return n === "moyen" ? "maire" : "maire_" + n; }
  function haut() { var g = document.getElementById("g-maire"); if (g && g.getBoundingClientRect().top < 0) g.scrollIntoView({ behavior: "smooth" }); }

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
    box.innerHTML = ""; finVue = false;
    var s = lireSauvegarde();
    choixNiveau(s && s.phase !== "fin" ? s.niveau || "moyen" : lireNiveau());
    var hero = h("div", "m-hero");
    ajout(hero, h("p", "m-sur", "Hôtel de Ville · Mandat de 100 semaines"),
      h("p", "m-intro", "Chaque semaine, un dossier arrive sur ton bureau. Trois décisions possibles, des conséquences parfois inattendues. Garde la confiance des Parisiens, leur bonheur et les finances de la ville."));
    box.appendChild(hero);
    box.appendChild(carteProfil());
    var auj = h("div", "m-auj"); box.appendChild(auj);
    Promise.all([index(), quetes()]).then(function () { panneauJour(auj, s); }).catch(function () { auj.remove(); });
    if (s && s.phase !== "fin") {
      var r = h("div", "m-reprise");
      ajout(r, h("strong", null, "Partie en cours"),
        h("span", null, (s.defi != null ? "Défi du jour · " : "") + "Semaine " + s.tour + "/" + M.TOURS + " · " + M.NIVEAUX[s.niveau || "moyen"].nom + " · " + M.LIGNES[s.ligne].nom + " · " + s.ambitions.map(function (a) { return M.DOMAINES[a]; }).join(" et ")),
        bouton("Reprendre", "btn", reprise));
      box.appendChild(r);
    }
    box.appendChild(bouton(s && s.phase !== "fin" ? "Nouvelle partie" : "Commencer un mandat", s && s.phase !== "fin" ? "btn m-sec" : "btn", function () {
      if (s && s.phase !== "fin" && !confirm("Commencer une nouvelle partie ? La partie en cours sera perdue.")) return;
      creation();
    }));
    var info = h("p", "m-base", "Chargement de la base d’événements…");
    box.appendChild(info);
    var regles = h("details", "m-regles");
    regles.innerHTML = "<summary>Règles du jeu</summary><ul>" +
      "<li><b>Trois niveaux</b>, chacun avec son classement : " + Object.keys(M.NIVEAUX).map(function (k) { return "<b>" + M.NIVEAUX[k].nom + "</b> (" + M.NIVEAUX[k].txt.replace(/\.$/, "") + ")"; }).join(", ") + ".</li>" +
      "<li><b>Popularité</b> et <b>bonheur</b> ne doivent jamais passer sous <b>30</b> (28 en facile, 32 en réaliste).</li>" +
      "<li>Le <b>budget</b> part d’un milliard d’euros. Tu peux t’endetter jusqu’à " + argent(M.PLAFOND_DETTE) + " ; au-delà, c’est la faillite.</li>" +
      "<li>La <b>cohérence politique</b> mesure ta fidélité à ta ligne. Trop de reniements et ton camp te lâche.</li>" +
      "<li>Les effets annoncés varient un peu : certaines décisions coûtent chaque semaine, d’autres ont des conséquences plus tard.</li>" +
      "<li>Tiens tes deux <b>ambitions</b> (niveau " + M.P.ambSeuil + " ou plus à la fin) pour un meilleur score et une meilleure élection.</li>" +
      "<li>Un <b>opposant</b> tiré au sort t’attaque toutes les 10 semaines : riposte (argent ou cohérence), tente de le faire tomber (une chance sur deux) ou laisse faire, mais il reviendra plus fort.</li>" +
      "<li>Certaines décisions ont des <b>retombées cachées</b> plusieurs semaines plus tard.</li>" +
      "<li>Au bout de 100 semaines, l’<b>élection municipale</b> décide si tu es réélu.</li>" +
      "<li>Chaque partie rapporte de l’<b>XP</b> : défi du jour, 3 quêtes quotidiennes et 100 succès à débloquer.</li></ul>";
    box.appendChild(regles);
    index().then(function (x) {
      var n = Object.keys(x.parCat || {}).length;
      info.textContent = "Base : " + x.total.toLocaleString("fr-FR") + " événements validés · " + n + " catégories";
    }).catch(function () { info.textContent = "La base d’événements n’a pas pu être chargée. Vérifie ta connexion."; });
  }

  // ---------- Profil du joueur : niveau et XP ----------
  function carteProfil() {
    var P = G.lire(), n = G.niveau(P.xp), c = h("div", "m-profil");
    var t = h("div", "m-pt");
    ajout(t, h("span", "m-pn", String(n.n)), ajout(h("div"), h("strong", null, n.titre), h("small", null, n.max ? P.xp + " XP · niveau maximum" : n.depuis + " / " + n.besoin + " XP vers le niveau " + (n.n + 1))));
    var barre = h("div", "m-barre"), i = h("i"); i.style.width = n.pct + "%"; barre.appendChild(i);
    var nb = Object.keys(P.succes).length;
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
      h("span", null, fait ? (fait.gagne ? "✔ Défi réussi aujourd’hui (score " + fait.score + (fait.reelu ? ", réélu" : "") + ")." : "Défi tenté aujourd’hui : raté (score " + fait.score + "). Reviens demain !") :
        "Même départ pour tout le monde : même niveau, même ligne, mêmes ambitions, même opposant. Termine le mandat pour gagner 150 XP (+50 si tu es réélu)."));
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
    var nb = Object.keys(P.succes).length;
    box.appendChild(h("h5", null, "Succès · " + nb + " / " + G.SUCCES.length));
    var NOMS = ["", "Bronze", "Argent", "Or", "Platine"], g = h("div", "m-succes");
    G.SUCCES.slice().sort(function (a, b) { return (P.succes[b.id] ? 1 : 0) - (P.succes[a.id] ? 1 : 0) || a.t - b.t; }).forEach(function (x) {
      var d = h("div", "m-suc m-t" + x.t + (P.succes[x.id] ? " m-sok" : ""));
      ajout(d, h("span", "m-sico", P.succes[x.id] ? "🏅" : "🔒"), ajout(h("div"), h("strong", null, x.nom), h("span", null, x.desc), h("small", null, NOMS[x.t] + " · +" + G.XP_TIER[x.t] + " XP")));
      g.appendChild(d);
    });
    box.appendChild(g); haut();
  }
  // ---------- Roulette : tirage de l'opposant ----------
  function roulette() {
    var o = M.opposant(st), noms = M.OPPOSANTS; box.innerHTML = ""; document.body.classList.remove("m-modal");
    var r = h("div", "m-roulette");
    r.appendChild(h("p", "m-sur", "Tirage au sort de ton opposant"));
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
        h("p", "m-aide", "Toutes les 10 semaines, " + o.nom + " t’attaquera. Tu pourras riposter (argent ou cohérence), tenter de le faire tomber (une chance sur deux) ou laisser faire : il reviendra plus fort. Sous " + M.SEUIL_OPP + " d’influence, il abandonne."),
        bouton("Entrer en fonctions", "btn m-go", function () { st = M.debutTour(st, BASE); sauver(); onglet = "decision"; finVue = false; jeu(); haut(); }));
      fiche.hidden = false;
    }
  }

  // ---------- Création du maire (moins d'une minute) ----------
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
    box.appendChild(h("p", "m-etape", "2. Deux ambitions pour ton mandat"));
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
      msg.textContent = !CHOIX.ligne ? "Choisis ta ligne politique." : CHOIX.amb.length < 2 ? "Choisis encore " + (2 - CHOIX.amb.length) + " ambition" + (CHOIX.amb.length ? "." : "s.") : "";
    }
    maj();
  }
  function demarrer(e) {
    var b = e && e.currentTarget; if (b) { b.disabled = true; b.textContent = "Installation à l’Hôtel de Ville…"; }
    index().then(function () { var l = choisirLots(); return chargerLots(l).then(function () { return l; }); }).then(function (lots) {
      st = M.nouvellePartie({ ligne: CHOIX.ligne, ambitions: CHOIX.amb, lots: lots, niveau: niveau });
      sauver(); roulette();
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
      st = M.reprendre(s, BASE);
      if (st.phase === "pret" && st.tour === 0) { choixNiveau(st.niveau, true); return roulette(); }
      if (st.phase === "pret") st = M.debutTour(st, BASE);
      sauver(); onglet = "decision"; finVue = st.phase === "fin" && !st.resultat; jeu();
    }).catch(function () { alert("Impossible de charger les événements. Vérifie ta connexion et réessaie."); });
  }

  // ---------- Tableau de bord ----------
  function jauge(nom, v, seuil) {
    var d = h("div", "m-jauge" + (seuil && v < seuil + 10 ? " m-danger" : ""));
    var t = h("div", "m-jt"); ajout(t, h("span", null, nom), h("b", null, String(Math.round(v))));
    var barre = h("div", "m-barre"), rempli = h("i"); rempli.style.width = v + "%"; barre.appendChild(rempli);
    if (seuil) { var s = h("em"); s.style.left = seuil + "%"; s.title = "Seuil de défaite : " + seuil; barre.appendChild(s); }
    return ajout(d, t, barre);
  }
  function tableau() {
    var t = h("div", "m-tab");
    var sem = h("div", "m-sem");
    ajout(sem, h("span", null, "Semaine"), h("b", null, st.tour + " / " + M.TOURS));
    var p = h("div", "m-prog"), pi = h("i"); pi.style.width = (st.tour / M.TOURS * 100) + "%"; p.appendChild(pi); sem.appendChild(p);
    t.appendChild(sem);
    ajout(t, jauge("Popularité", st.pop, M.seuil(st)), jauge("Bonheur", st.bon, M.seuil(st)), jauge("Cohérence", st.coh, 0));
    var b = h("div", "m-jauge m-budget" + (st.dette > M.PLAFOND_DETTE * 0.7 ? " m-danger" : ""));
    ajout(b, h("span", null, "Trésorerie"), h("b", null, argent(st.tresor)), h("small", null, st.dette > 0 ? "Dette " + argent(st.dette) : "Aucune dette"));
    t.appendChild(b);
    return t;
  }
  function onglets() {
    var n = h("div", "m-onglets"); n.setAttribute("role", "tablist");
    [["decision", "Dossier"], ["finances", "Finances"], ["ambitions", "Ambitions"], ["historique", "Historique"]].forEach(function (o) {
      var b = bouton(o[1], "m-onglet", function () { onglet = o[0]; jeu(); });
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", onglet === o[0]);
      n.appendChild(b);
    });
    return n;
  }

  // ---------- Écran principal ----------
  function jeu() {
    if (st.phase === "fin" && (finVue || !st.resultat)) return fin();
    if (niveau !== (st.niveau || "moyen") || !document.querySelector("#m-lvls .lvl:disabled")) choixNiveau(st.niveau, true);
    // La fenêtre ne remonte pas au changement de question : la carte du dossier reste à sa place
    // (si son haut était sorti de l'écran, on le ramène juste en haut de l'écran)
    var y = window.scrollY, avant = box.querySelector(".m-contenu > .m-dossier");
    var pos = avant ? Math.max(8, avant.getBoundingClientRect().top) : null;
    box.style.minHeight = box.offsetHeight + "px";
    box.innerHTML = ""; document.body.classList.remove("m-modal");
    ajout(box, tableau(), onglets());
    var c = h("div", "m-contenu");
    box.appendChild(c);
    ({ decision: dossier, finances: finances, ambitions: ambitions, historique: historique })[onglet](c);
    box.style.minHeight = ""; window.scrollTo(0, y);
    var apres = box.querySelector(".m-contenu > .m-dossier");
    if (pos !== null && apres) window.scrollBy(0, apres.getBoundingClientRect().top - pos);
  }
  function variations(d, parent) {
    var l = h("ul", "m-delta");
    function puce(v, txt, inverse) {
      if (!v) return;
      var li = h("li", (v > 0) !== !!inverse ? "m-up" : "m-down", txt); l.appendChild(li);
    }
    if (d) {
      puce(d.pop, signe(d.pop) + " popularité"); puce(d.bon, signe(d.bon) + " bonheur"); puce(d.coh, signe(d.coh) + " cohérence");
      if (d.bud) puce(d.bud, (d.bud > 0 ? "+" : "") + argent(d.bud));
      Object.keys(d.dom || {}).forEach(function (k) { puce(d.dom[k], signe(d.dom[k]) + " " + M.DOMAINES[k].toLowerCase()); });
    }
    if (l.children.length) parent.appendChild(l);
  }
  // ---------- « Votre mandat » : où en est la partie, en quelques phrases ----------
  function solde() { var r = 0; st.recurrents.forEach(function (x) { r += x.m; }); return M.FONCT.recettes - M.depenses(st) + r - st.dette * M.TAUX; }
  function tendance(k) {
    var t = 0; st.historique.slice(-6).forEach(function (x) { t += (x.d && x.d[k]) || 0; });
    return t >= 3 ? " et elle progresse" : t <= -3 ? " et elle recule" : "";
  }
  function resume() {
    var p = [], reste = M.TOURS - st.tour;
    p.push(st.tour <= 1 ? "Ton mandat commence : 100 semaines pour transformer Paris." :
      st.fin ? "Ton mandat s’est achevé à la semaine " + st.tour + "." : "Semaine " + st.tour + " : il te reste " + reste + " semaine" + (reste > 1 ? "s" : "") + " de mandat.");
    p.push((st.pop >= 65 ? "Les Parisiens t’apprécient (popularité " : st.pop >= 50 ? "Ta popularité tient bon (" : st.pop >= 40 ? "Ta popularité s’effrite (" : "Danger : ta popularité frôle le seuil fatidique de " + M.seuil(st) + " (") + Math.round(st.pop) + ")" + tendance("pop") + ".");
    p.push((st.bon >= 60 ? "La ville respire, les habitants sont plutôt heureux" : st.bon >= 45 ? "L’humeur des Parisiens est mitigée" : st.bon >= 38 ? "Les Parisiens sont las et le font savoir" : "La colère monte dans les rues : le bonheur approche du seuil de " + M.seuil(st)) + " (bonheur " + Math.round(st.bon) + ").");
    st.ambitions.forEach(function (k) {
      var v = Math.round(st.dom[k]), n = M.DOMAINES[k].toLowerCase();
      p.push(v >= M.P.ambSeuil ? "Ta promesse sur « " + n + " » est tenue (" + v + ")." : "Ta promesse sur « " + n + " » est en retard : " + v + " sur " + M.P.ambSeuil + " visés.");
    });
    var so = solde();
    if (st.dette > 0) p.push("La ville est endettée de " + argent(st.dette) + " sur " + argent(M.PLAFOND_DETTE) + " autorisés" + (st.dette > M.PLAFOND_DETTE * 0.7 ? " : la faillite n’est plus loin." : "."));
    else if (so < 0 && st.tresor / -so > M.TOURS - st.tour) p.push("Les caisses perdent " + argent(-so) + " par semaine, mais les réserves (" + argent(st.tresor) + ") tiennent jusqu’à la fin du mandat, hors imprévus.");
    else if (so < 0) p.push("Les caisses perdent " + argent(-so) + " par semaine : à ce rythme, il faudra emprunter dans environ " + Math.max(1, Math.round(st.tresor / -so)) + " semaines.");
    else p.push("Les comptes sont à l’équilibre, avec " + argent(st.tresor) + " en caisse.");
    p.push(st.coh >= 70 ? "Ton camp se reconnaît dans tes choix." : st.coh >= 45 ? "Certains dans ton camp doutent de ta ligne politique." : "Ton camp ne comprend plus ta ligne : attention aux défections.");
    var faible = Object.keys(M.DOMAINES).sort(function (a, b) { return st.dom[a] - st.dom[b]; })[0];
    if (st.dom[faible] < 40) p.push("Point faible de la ville : " + M.DOMAINES[faible].toLowerCase() + " (" + Math.round(st.dom[faible]) + ").");
    var o = M.opposant(st);
    if (o) p.push(o.actif ? "Ton opposant, " + o.nom + ", a une influence de " + Math.round(o.force) + " sur 100 : il est " + M.humeurOpp(o.force) + "." : o.nom + " a quitté la vie politique : tu n’as plus d’opposant.");
    var cata = (st.historique || []).filter(function (x) { return x.sp === "catastrophe"; }).length;
    if (cata) p.push("Paris a déjà traversé " + cata + " catastrophe" + (cata > 1 ? "s" : "") + " sous ton mandat.");
    return p;
  }
  function caseMandat(ouvert) {
    var d = h("details", "m-mandat"); d.open = ouvert;
    d.appendChild(h("summary", null, "📜 Votre mandat"));
    d.appendChild(h("p", null, resume().join(" ")));
    d.ontoggle = function () { try { localStorage.setItem("maire_mandat_ferme", d.open ? "" : "1"); } catch (e) {} };
    return d;
  }
  function mandatOuvert() { try { return !localStorage.getItem("maire_mandat_ferme"); } catch (e) { return true; } }

  function bandeauOpp() {
    var o = M.opposant(st), b = h("div", "m-opp" + (o.actif ? "" : " m-opp-fini"));
    var prochaine = Math.ceil((st.tour + 1) / 10) * 10;
    ajout(b, h("span", "m-rico", o.ico), ajout(h("div"), h("strong", null, o.nom),
      h("span", null, o.actif ? "Influence " + Math.round(o.force) + "/100 · " + M.humeurOpp(o.force) + (prochaine < M.TOURS ? " · prochaine attaque semaine " + prochaine : "") : "A quitté la vie politique")));
    return b;
  }
  function dossier(c) {
    c.appendChild(caseMandat(mandatOuvert()));
    if (st.notes && st.notes.length && st.phase === "evenement") {
      var n = h("div", "m-notes"); n.appendChild(h("p", "m-nt", "Cette semaine, les conséquences de décisions passées :"));
      st.notes.forEach(function (x) { var p = h("div", "m-note"); p.appendChild(h("p", null, "⏳ " + x.txt)); variations(x.d, p); n.appendChild(p); });
      c.appendChild(n);
    }
    var ev = M.evenementCourant(st, BASE);
    if (st.opposant) c.appendChild(bandeauOpp());
    if (!ev) { c.appendChild(h("p", "msg", "Dossier introuvable.")); return; }
    var carte = h("article", "m-dossier m-c-" + ev.cat);
    ajout(carte, h("p", "m-cat", st.special === "catastrophe" ? "🚨 Catastrophe" : st.special === "chance" ? "🍀 Coup de chance" : st.special === "opposition" ? "⚔️ Attaque de l’opposition" : M.CATS[ev.cat]), h("h4", null, ev.titre));
    if (st.phase === "evenement") {
      carte.appendChild(h("p", "m-desc", ev.desc));
      var ch = h("div", "m-choix");
      ev.choix.forEach(function (x, i) {
        var b = bouton("", "m-option", function () {
          if (st.phase !== "evenement") return;
          st = M.choisir(st, BASE, i); sauver(); jeu();
        });
        ajout(b, h("span", "m-lettre", "ABCD"[i]), h("strong", null, x.t));
        ch.appendChild(b);
      });
      carte.appendChild(ch);
    } else if (st.resultat) {
      var r = st.resultat, x = ev.choix[r.i];
      ajout(carte, h("p", "m-pris", "Ta décision : " + x.t), h("p", "m-res", r.txt || x.r));
      variations(r.d, carte);
      if (r.surprise) carte.appendChild(h("p", "m-surprise", "⚡ Imprévu : " + r.surprise));
      (r.extra || []).forEach(function (t) { carte.appendChild(h("p", "m-extra", t)); });
      if (r.rec) carte.appendChild(h("p", "m-extra", "🔁 " + (r.rec.m < 0 ? "Coût de " : "Recette de ") + argent(Math.abs(r.rec.m)) + " par semaine pendant " + r.rec.n + " semaines."));
      if (r.dif) carte.appendChild(h("p", "m-extra", "⏳ Cette décision aura encore des conséquences dans les semaines à venir."));
      carte.appendChild(st.phase === "fin"
        ? bouton("Voir le bilan du mandat", "btn m-go", function () { finVue = true; jeu(); haut(); })
        : bouton("Semaine suivante →", "btn m-go", function () { st = M.debutTour(st, BASE); sauver(); jeu(); }));
    }
    if (st.special) {
      // Catastrophe ou coup de chance : la décision s'impose en pop-up, impossible de l'ignorer
      var pop = h("div", "m-pop m-pop-" + st.special); pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
      var cadre = h("div", "m-pop-in");
      cadre.appendChild(h("p", "m-pop-titre", st.special === "catastrophe" ? "Alerte : une catastrophe frappe Paris" : st.special === "opposition" ? "Ton opposant passe à l’attaque" : "Bonne nouvelle pour Paris !"));
      cadre.appendChild(carte); pop.appendChild(cadre); c.appendChild(pop);
      document.body.classList.add("m-modal");
      var f = carte.querySelector("button"); if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 50);
    } else c.appendChild(carte);
  }

  // ---------- Finances ----------
  function finances(c) {
    var so = solde();
    var g = h("div", "m-fin");
    [["Trésorerie", argent(st.tresor)], ["Dette", argent(st.dette) + " / " + argent(M.PLAFOND_DETTE)],
      ["Solde prévu par semaine", (so > 0 ? "+" : "") + argent(so)], ["Engagements futurs", argent(M.engagements(st))]].forEach(function (x) {
      var d = h("div", "m-chiffre"); ajout(d, h("span", null, x[0]), h("b", null, x[1])); g.appendChild(d);
    });
    c.appendChild(g);
    c.appendChild(h("p", "m-aide", "Fonctionnement courant : " + argent(M.FONCT.recettes) + " de recettes et " + argent(M.depenses(st)) +
      " de dépenses chaque semaine. Si la trésorerie passe sous zéro, la ville emprunte automatiquement ; au-delà du plafond de dette, c’est la faillite."));
    c.appendChild(h("h5", null, "Engagements en cours"));
    var eng = h("ul", "m-liste");
    st.recurrents.forEach(function (r) { eng.appendChild(ligne(r.l, (r.m > 0 ? "+" : "") + argent(r.m) + "/sem · encore " + r.n + " sem.", r.m)); });
    st.prevus.forEach(function (p) { if (p.e && p.e.bud) eng.appendChild(ligne("Semaine " + p.tour + " · " + p.l, (p.e.bud > 0 ? "+" : "") + argent(p.e.bud), p.e.bud)); });
    if (!eng.children.length) eng.appendChild(h("li", "m-vide", "Aucun engagement en cours."));
    c.appendChild(eng);
    c.appendChild(h("h5", null, "Dépenses et recettes récentes"));
    var j = h("ul", "m-liste");
    st.journal.slice().reverse().filter(function (x) { return !/^(Recettes courantes|Dépenses courantes)/.test(x.l); }).slice(0, 20).forEach(function (x) {
      j.appendChild(ligne("S" + x.tour + " · " + x.l, (x.m > 0 ? "+" : "") + argent(x.m), /^Emprunt|^Remboursement/.test(x.l) ? 0 : x.m));
    });
    if (!j.children.length) j.appendChild(h("li", "m-vide", "Rien pour l’instant."));
    c.appendChild(j);
    function ligne(l, v, s) { var li = h("li", s > 0 ? "m-up" : s < 0 ? "m-down" : ""); ajout(li, h("span", null, l), h("b", null, v)); return li; }
  }

  // ---------- Ambitions et état de la ville ----------
  function jaugeDom(nom, v, cible, amb) {
    var d = h("div", "m-niv" + (amb ? " m-niv-amb" : ""));
    var t = h("div", "m-jt"); ajout(t, h("span", null, nom), h("b", null, String(Math.round(v))));
    var barre = h("div", "m-barre"), r = h("i"); r.style.width = v + "%"; barre.appendChild(r);
    if (cible) { var s = h("em", "m-cible"); s.style.left = cible + "%"; barre.appendChild(s); }
    ajout(d, t, barre);
    if (amb) d.appendChild(h("small", null, v >= cible ? "✔ Promesse tenue pour l’instant" : "Objectif : " + cible + " à la fin du mandat"));
    return d;
  }
  function ambitions(c) {
    var l = h("div", "m-ligne-rap"); ajout(l, h("strong", null, "Ligne " + M.LIGNES[st.ligne].nom), h("span", null, M.LIGNES[st.ligne].txt));
    c.appendChild(l);
    c.appendChild(h("h5", null, "Tes ambitions"));
    st.ambitions.forEach(function (k) { c.appendChild(jaugeDom(M.DOMAINES[k], st.dom[k], M.P.ambSeuil, true)); });
    c.appendChild(h("h5", null, "État de la ville"));
    var g = h("div", "m-doms");
    Object.keys(M.DOMAINES).forEach(function (k) { if (st.ambitions.indexOf(k) < 0) g.appendChild(jaugeDom(M.DOMAINES[k], st.dom[k])); });
    c.appendChild(g);
    c.appendChild(h("p", "m-aide", "Les problèmes reviennent d’eux-mêmes : sans action, chaque domaine se dégrade peu à peu. Le bonheur des Parisiens suit l’état moyen de la ville."));
  }

  // ---------- Historique ----------
  function historique(c) {
    if (!st.historique.length) { c.appendChild(h("p", "m-vide", "Aucune décision pour l’instant.")); return; }
    var l = h("ol", "m-histo");
    st.historique.slice().reverse().forEach(function (x) {
      var li = h("li"); ajout(li, h("span", "m-hs", "S" + x.tour), h("strong", null, (x.sp === "catastrophe" ? "🚨 " : x.sp === "chance" ? "🍀 " : x.sp === "opposition" ? "⚔️ " : "") + x.titre), h("span", "m-hc", x.choix));
      variations({ pop: x.d.pop, bon: x.d.bon, coh: x.d.coh, bud: x.d.bud }, li); l.appendChild(li);
    });
    c.appendChild(l);
  }

  // ---------- Fin de partie ----------
  function fin() {
    box.innerHTML = ""; document.body.classList.remove("m-modal");
    choixNiveau(st.niveau);
    var b = M.bilan(st), g = st.fin.gagne;
    var t = h("div", "m-final " + (g ? "m-gagne" : "m-perdu"));
    var el = st.election, an = M.analyse(st), o = M.opposant(st);
    ajout(t, h("p", "m-sur", (st.defi != null ? "Défi du jour · " : "") + (g ? (el && el.reelu ? "Mandat accompli · Réélu" : el ? "Mandat accompli · Battu aux élections" : "Mandat accompli") : "Fin de mandat anticipée")),
      h("h4", null, g ? (el && el.reelu ? "Les Parisiens te réélisent pour un nouveau mandat !" : "Tu as tenu 100 semaines à l’Hôtel de Ville !") : "Ton mandat s’arrête à la semaine " + st.fin.tour),
      g ? null : h("p", "m-raison", st.fin.raison.txt),
      h("p", "m-score", "Score : " + b.score + " · niveau " + M.NIVEAUX[st.niveau || "moyen"].nom));
    box.appendChild(t);
    if (g && el) {
      var e = h("div", "m-election" + (el.reelu ? " m-gagne" : " m-perdu"));
      var moi = Math.round(el.pct * 10) / 10, lui = Math.round((100 - el.pct) * 10) / 10;
      var bm = h("div", "m-ebarre"), im = h("i"), il = h("i"); im.style.width = moi + "%"; il.style.width = lui + "%"; ajout(bm, im, il);
      ajout(e, h("p", "m-sur", "🗳️ Élection municipale"),
        ajout(h("div", "m-escore"), h("span", null, "Toi · " + String(moi).replace(".", ",") + " %"), h("span", null, (o && o.actif ? o.nom : "Ton adversaire") + " · " + String(lui).replace(".", ",") + " %")), bm,
        h("p", null, el.reelu ? "Victoire ! Ton bilan convainc une majorité de Parisiens." : "Défaite de justesse ou désaveu : ton adversaire l’emporte."));
      box.appendChild(e);
    }
    if (an) { var a = h("div", "m-analyse"); ajout(a, h("p", "m-sur", "Ce qui s’est passé"), h("p", null, an.phrase), h("p", "m-conseil", "💡 " + an.conseil)); box.appendChild(a); }
    var gz = h("div", "m-gains"); box.appendChild(gz);
    if (!st.prog && !comptage) {
      comptage = true;
      quetes().catch(function () { return []; }).then(function () {
        var res = G.terminer(st, M, { quetes: G.quetesDuJour(G.jour(), QUETES || []) });
        st.prog = { total: res.total, gains: res.gains, nouveaux: res.nouveaux.map(function (x) { return x.id; }), avant: res.avant.n, apres: res.apres.n };
        comptage = false; sauver(); gains(gz);
        if (window.lbSubmit && window.user) lbSubmit("maire_xp", res.profil.xp);
      });
    } else gains(gz);
    var s = h("div", "m-fin");
    [["Popularité", Math.round(st.pop)], ["Bonheur", Math.round(st.bon)], ["Cohérence", Math.round(st.coh)],
      ["Trésorerie", argent(st.tresor)], ["Dette", argent(st.dette)], ["Décisions", st.historique.length]].forEach(function (x) {
      var d = h("div", "m-chiffre"); ajout(d, h("span", null, x[0]), h("b", null, String(x[1]))); s.appendChild(d);
    });
    box.appendChild(s);
    box.appendChild(caseMandat(true));
    box.appendChild(h("h5", null, "Tes ambitions"));
    b.ambitions.forEach(function (a) { box.appendChild(jaugeDom(a.nom, a.niveau, M.P.ambSeuil, true)); });
    function liste(titre, l) {
      if (!l.length) return;
      box.appendChild(h("h5", null, titre));
      var u = h("ol", "m-histo");
      l.forEach(function (x) { var li = h("li"); ajout(li, h("span", "m-hs", "S" + x.tour), h("strong", null, x.titre), h("span", "m-hc", x.choix)); u.appendChild(li); });
      box.appendChild(u);
    }
    liste(g ? "Les décisions qui t’ont le plus coûté" : "Les décisions qui ont précipité ta chute", b.pires.filter(function (x) { return x.v < 0; }));
    liste("Tes meilleures décisions", b.meilleures.filter(function (x) { return x.v > 0; }));
    var msg = h("p", "msg m-msg");
    box.appendChild(msg);
    if (!st.envoye && window.lbSubmit) {
      st.envoye = true; sauver();
      lbSubmit(cleClassement(st.niveau || "moyen"), b.score).then(function (x) { msg.textContent = x; });
    }
    var bas = h("div", "m-bas");
    ajout(bas, bouton("Historique complet", "btn m-sec", histoFin),
      bouton("Nouveau mandat", "btn m-go", function () { effacer(); st = null; creation(); haut(); }));
    box.appendChild(bas);
  }
  function gains(c) {
    var p = st.prog; if (!p) return; c.innerHTML = "";
    var n = G.niveau(G.lire().xp);
    c.appendChild(h("p", "m-sur", "Ce que ce mandat te rapporte : +" + p.total + " XP"));
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
        var t = box.querySelector(".m-nivtxt"); if (t) t.textContent = texteNiveau();   // écran de création : niveau annoncé à jour
      };
    });
    if (window.lbBoard) lbBoard("lb-maire", function () { return cleClassement(niveau); }, function () { return "🏆 Classement général · Maire de Paris " + M.NIVEAUX[niveau].nom; });
    accueil();
  };
  window.maireStop = function () { document.body.classList.remove("m-modal"); };
})();
