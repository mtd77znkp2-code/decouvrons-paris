// Grand Tournoi des Maires : l'interface (bandeau, roulette du tirage, épreuve, classement, récompenses).
// Le jeu (jeu.js) l'appelle chaque seconde avec un contexte : session, partie, et de quoi appliquer la récompense.
// Tout ce qui compte (tirage, départ, score, classement, gains) est décidé par le serveur (functions/tournoi.js).
(function (root) {
  "use strict";
  var J = root.MaireTournoiJeux, TR = root.MaireTournoiRegles;
  var URL_FN = "https://europe-west1-decouvrons-paris.cloudfunctions.net/";
  var T = null, TID = null, PARTS = {}, ECOUTE = [], DECALAGE = 0, CTX = null, BANDEAU = null;
  var ESSAIS = {}, CLOS_DEMANDE = {}, PARTIE = null;

  function h(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function ajout(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function bouton(txt, cls, f) { var b = h("button", cls || "btn", txt); b.type = "button"; b.onclick = f; return b; }
  function mmss(ms) { ms = Math.max(0, ms); var m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000); return m + ":" + (s < 10 ? "0" : "") + s; }
  function maintenant() { return Date.now() + DECALAGE; }
  function son(n, v) { if (root.sfx) root.sfx(n, v); }
  function toast(t) { if (CTX && CTX.toast) CTX.toast(t); }
  function moi() { return root.SessionLigne ? root.SessionLigne.moi() : null; }
  function jeuDe(t) { return J.JEUX[t.jeu]; }
  function vu(cle, val) { try { if (val === undefined) return localStorage.getItem("maire_tournoi_" + cle); localStorage.setItem("maire_tournoi_" + cle, val); } catch (e) { return null; } }

  // ---------- Appels au serveur (fonctions « callable » de Firebase, avec le jeton du joueur) ----------
  // Le branchement au serveur (Firebase) ; remplaçable pour les tests de l'interface
  var BACK = {
    appel: function (nom, data) { return appelFirebase(nom, data); },
    doc: function (tid, cb) { return root.LB && LB.db ? LB.db.doc("tournois/" + tid).onSnapshot(function (d) { cb(d.exists ? d.data() : null); }, function () {}) : function () {}; },
    parts: function (tid, cb) { return root.LB && LB.db ? LB.db.collection("tournois/" + tid + "/parts").onSnapshot(function (q) { var o = {}; q.forEach(function (d) { o[d.id] = d.data(); }); cb(o); }, function () {}) : function () {}; }
  };
  function appel(nom, data) { return BACK.appel(nom, data).then(function (r) { if (r && r.maintenant) DECALAGE = r.maintenant - Date.now(); return r; }); }
  function appelFirebase(nom, data) {
    var u = root.LB && LB.auth && LB.auth.currentUser;
    if (!u) return Promise.reject(new Error("Connexion indisponible."));
    return u.getIdToken().then(function (jeton) {
      return fetch(URL_FN + nom, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + jeton }, body: JSON.stringify({ data: data }) });
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) throw new Error(j.error.message || "Erreur du serveur");
      return j.result;
    });
  }

  // ---------- Suivi du tournoi en direct (le document public et les participations) ----------
  function ecouter(tid) {
    if (TID === tid) return; arreter(); TID = tid; PARTS = {};
    ECOUTE.push(BACK.doc(tid, function (d) {
      if (!d) return; var avant = T; T = Object.assign({ id: tid }, d);
      if (!avant || avant.etat !== T.etat) majTout();
      if (T.etat === "clos") recompense();
    }));
    ECOUTE.push(BACK.parts(tid, function (o) { PARTS = o; majTout(); }));
  }
  function arreter() { ECOUTE.forEach(function (f) { try { f(); } catch (e) {} }); ECOUTE = []; TID = null; T = null; }

  // ---------- Chaque seconde : ouvrir, annoncer, clore ----------
  function tic(ctx) {
    CTX = ctx;
    var s = ctx.session, sid = ctx.sid; if (!s || !sid || !TR || !J) return majBandeau();
    var f = TR.fenetre(s), tid = TR.idTournoi(sid, f.election, f.prochaine), now = maintenant();
    // Le tournoi d'avant reste suivi jusqu'à ce qu'on ait appliqué sa récompense
    // Après l'élection, on garde le tournoi précédent le temps de sa clôture et de la récompense ;
    // mais si c'est la même élection simplement déplacée (forcée), l'ancien tournoi est abandonné
    if (TID && TID !== tid && T && T.etat !== "clos" && T.election !== f.election && now < T.cloture + 120000) { cloreSiBesoin(now); return majBandeau(); }
    if (now >= f.ouverture && now < f.cloture && TID !== tid) {
      if (!ESSAIS[tid] || now - ESSAIS[tid] > 15000) {
        ESSAIS[tid] = now;
        appel("tournoiOuvrir", { session: sid }).then(function (r) {
          if (!r || !r.tournoi) return;
          ecouter(r.tournoi.id); T = r.tournoi; majTout();   // ecouter() repart de zéro : T est rempli après
          if (!vu("annonce_" + T.id)) { vu("annonce_" + T.id, "1"); annonce(true); }
        }).catch(function () {});
      }
    }
    cloreSiBesoin(now);
    majBandeau();
  }
  function cloreSiBesoin(now) {
    if (!T || T.etat === "clos" || now < T.cloture + 1500) return;
    if (CLOS_DEMANDE[T.id] && now - CLOS_DEMANDE[T.id] < 8000) return;
    CLOS_DEMANDE[T.id] = now;
    appel("tournoiClore", { tournoi: T.id }).catch(function () {});
  }

  // ---------- Bandeau dans l'écran de jeu ----------
  function bandeau() {
    BANDEAU = h("div", "mt-bandeau mx-cache"); BANDEAU.setAttribute("role", "status");
    majBandeau(); return BANDEAU;
  }
  function majBandeau() {
    if (!BANDEAU || !document.body.contains(BANDEAU)) return;
    var now = maintenant();
    if (!T || (T.etat === "clos" && now > T.cloture + 90000)) { BANDEAU.classList.add("mx-cache"); return; }
    BANDEAU.classList.remove("mx-cache"); BANDEAU.innerHTML = "";
    var mp = PARTS[moi()], jx = jeuDe(T), clos = T.etat === "clos" || now >= T.cloture;
    var txt = clos ? "Résultats du Grand Tournoi" : mp ? (mp.statut === "fini" ? "Ton score : " + mp.score + " · clôture dans " + mmss(T.cloture - now) : "Épreuve en cours…") : "Clôture dans " + mmss(T.cloture - now) + " · une seule tentative";
    ajout(BANDEAU, h("span", "mt-b-ico", jx.ico), ajout(h("div", "mt-b-txt"), h("strong", null, "🏆 Grand Tournoi · " + jx.nom), h("small", null, txt)),
      clos ? bouton("Classement", "mt-b-btn", classement) : mp ? bouton("Classement", "mt-b-btn", classement) : bouton("Jouer", "mt-b-btn mt-b-jouer", presenter));
  }
  function majTout() { majBandeau(); majClassement(); }

  // ---------- Le tirage : la roulette des dix épreuves (le serveur a déjà choisi) ----------
  function carteJeu(id) {
    var x = J.JEUX[id], c = h("div", "mt-carte"); c.dataset.id = id;
    var im = h("img"); im.src = "maire/img/tournoi/ico-" + id + ".webp"; im.alt = ""; im.onerror = function () { im.replaceWith(h("span", "mt-carte-emo", x.ico)); };
    ajout(c, im, h("b", null, x.nom)); return c;
  }
  function annonce(animer) {
    if (!T) return; fermer("mt-annonce");
    var f = h("div", "m-pop mt-pop"); f.id = "mt-annonce"; f.setAttribute("role", "dialog");
    var c = h("div", "m-pop-in mt-annonce");
    var affiche = h("img", "mt-affiche"); affiche.src = "maire/img/tournoi/affiche.webp"; affiche.alt = ""; affiche.onerror = function () { affiche.remove(); };
    var titre = h("p", "mt-sur", "Mi-mandat · tous les maires de la session s’affrontent"), grand = h("h4", "mt-titre", "🏆 Le Grand Tournoi des Maires");
    var bande = h("div", "mt-bande"), piste = h("div", "mt-piste"); bande.appendChild(piste);
    var annonceTxt = h("p", "mt-annonce-txt", "LES MAIRES DE FRANCE, VOTRE ÉPREUVE EST…"), revel = h("div", "mt-revel mx-cache"), bas = h("div", "mt-bas mx-cache");
    ajout(c, affiche, titre, grand, bande, annonceTxt, revel, bas); f.appendChild(c); document.body.appendChild(f);
    // 5 tours de roulette : on s'arrête sur l'épreuve tirée par le serveur
    var tours = 5, ids = J.IDS, n = ids.length, cible = (tours - 1) * n + ids.indexOf(T.jeu);
    for (var k = 0; k < tours * n + 3; k++) piste.appendChild(carteJeu(ids[k % n]));
    function reveler() {
      var gagnante = piste.children[cible]; if (gagnante) gagnante.classList.add("mt-gagnante");
      son("fanfare", 0.8);
      revel.classList.remove("mx-cache"); revel.innerHTML = "";
      var jx = jeuDe(T);
      ajout(revel, h("span", "mt-revel-ico", jx.ico), h("strong", null, jx.nom.toUpperCase()), h("p", null, jx.accroche));
      bas.classList.remove("mx-cache"); bas.innerHTML = "";
      var mp = PARTS[moi()];
      ajout(bas, mp ? bouton("Voir le classement", "btn m-go", function () { fermer("mt-annonce"); classement(); }) : bouton("Jouer maintenant", "btn m-go", function () { fermer("mt-annonce"); presenter(); }),
        bouton("Plus tard", "mx-lien", function () { fermer("mt-annonce"); }));
    }
    requestAnimationFrame(function () {
      // On centre la carte tirée dans le bandeau (positions réelles des cartes)
      var carte = piste.children[cible], fin = -(carte.offsetLeft - piste.offsetLeft) + (bande.clientWidth - carte.offsetWidth) / 2;
      if (!animer || calme()) { piste.style.transform = "translateX(" + fin + "px)"; reveler(); return; }
      son("roulette", 0.5);
      var t0 = performance.now(), D = 6500, dep = 0;
      (function anim(t) {
        var p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 4);   // rapide puis ralentit fort
        piste.style.transform = "translateX(" + (dep + (fin - dep) * e) + "px)";
        if (p < 1) requestAnimationFrame(anim); else setTimeout(reveler, 250);
      })(t0);
    });
  }
  function calme() { return !!(root.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function fermer(id) { var e = document.getElementById(id); if (e) e.remove(); }

  // ---------- Présentation de l'épreuve, puis la partie ----------
  function precharger(id) {
    img("decor-" + id);
    ({ pickpockets: ["s-pickpocket1", "s-pickpocket2", "s-touriste1", "s-touriste2", "s-touriste3", "s-policier", "s-journaliste", "s-pompier"],
      peripherique: ["s-voiture1", "s-voiture2", "s-taxi", "s-bus", "s-scooter", "s-ambulance", "s-feu-rouge", "s-feu-vert", "s-fumee"],
      eboueurs: ["s-journal", "s-carton", "s-bouteille", "s-bocal", "s-plastique", "s-gobelet", "s-banane", "s-pizza", "s-sac-noir"],
      tuyaux: ["t-droit", "t-coude", "t-te", "t-droit-eau", "t-coude-eau", "t-te-eau", "t-vanne", "t-maison", "t-fuite"],
      pigeons: ["s-pigeon", "s-pigeon-picore", "s-p-gobelet", "s-p-banane", "s-journal", "s-p-frites", "s-p-papier", "s-p-nouilles"],
      chantier: ["s-c-pierre", "s-c-fenetre", "s-c-balcon", "s-c-crochet", "s-c-poussiere"],
      conseil: ["s-elu0", "s-elu1", "s-elu2", "s-elu3", "s-elu0-main", "s-elu1-main", "s-elu2-main", "s-elu3-main"],
      marathon: ["s-coureur", "s-coureur-saut", "s-coureur-glisse", "s-barriere", "s-bache", "s-eau", "s-medaille", "s-coeur", "s-coeur-vide"] }[id] || []).forEach(img);
    img("victoire"); img("defaite");
  }
  function graine0(o) { return o.graine; }
  // ---------- Entraînement (admin) : choisir une épreuve et un niveau, jouer sans session ni classement ----------
  function entrainement() {
    fermer("mt-jeu");
    var f = h("div", "m-pop mt-pop"); f.id = "mt-jeu"; f.setAttribute("role", "dialog");
    var c = h("div", "m-pop-in mt-ecran"), niv = 0, l = h("div", "mt-choix-jeux"), nivs = h("div", "mt-choix-niv");
    NIVEAUX.forEach(function (n, k) { var b = bouton((k + 1) + " · " + n, "mt-nivbtn" + (k === niv ? " mt-on" : ""), function () { niv = k; Array.prototype.forEach.call(nivs.children, function (x, i) { x.classList.toggle("mt-on", i === k); }); }); nivs.appendChild(b); });
    J.IDS.forEach(function (id) {
      var x = J.JEUX[id], b = bouton("", "mt-choix", function () {
        precharger(id); var o = { id: id, niv: niv, graine: Math.floor(Math.random() * 2e9) + 1 };
        c.innerHTML = ""; c.classList.add("mt-ecran-jeu"); compteARebours(c, o.graine, o);
      });
      var im = h("img"); im.src = "maire/img/tournoi/ico-" + id + ".webp"; im.alt = ""; im.onerror = function () { im.replaceWith(h("span", null, x.ico)); };
      ajout(b, im, h("b", null, x.nom), h("small", null, J.duree(id) + " s")); l.appendChild(b);
    });
    ajout(c, bouton("✕", "m-leonx mt-x", function () { fermer("mt-jeu"); }), h("p", "mt-sur", "🛠 Admin · entraînement"), h("h4", "mt-titre", "Tester les jeux du Maire"),
      h("p", "mt-accroche", "Hors session : aucun score envoyé, aucun effet sur le tournoi."), h("p", "mt-sur", "Niveau de difficulté"), nivs, h("p", "mt-sur", "Choisis une épreuve"), l);
    f.appendChild(c); document.body.appendChild(f);
  }
  function presenter() {
    if (!T) return; precharger(T.jeu); var jx = jeuDe(T), now = maintenant();
    if (T.etat === "clos" || now >= T.cloture) return classement();
    if (PARTS[moi()]) return classement();
    fermer("mt-jeu");
    var f = h("div", "m-pop mt-pop"); f.id = "mt-jeu"; f.setAttribute("role", "dialog");
    var c = h("div", "m-pop-in mt-ecran");
    var ill = h("img", "mt-illu"); ill.src = "maire/img/tournoi/pres-" + T.jeu + ".webp"; ill.alt = ""; ill.onerror = function () { ill.replaceWith(h("div", "mt-illu mt-illu-emo", jx.ico)); };
    var regles = h("ul", "mt-regles"); jx.regles.forEach(function (r) { regles.appendChild(h("li", null, r)); });
    var go = bouton("C’est parti !", "btn m-go", function () { go.disabled = true; go.textContent = "Connexion au tournoi…"; commencer(c); });
    var nv = J.difficulte(Math.max(0, maPlace()));
    ajout(c, bouton("✕", "m-leonx mt-x", function () { fermer("mt-jeu"); }), ill, h("p", "mt-sur", "Grand Tournoi des Maires · " + DUREE() + " secondes"),
      h("p", "mt-niv mt-niv-" + nv, "🎚️ " + nivTxt(nv) + " — plus tu es haut dans le classement des maires, plus l’épreuve est dure"), h("h4", "mt-titre", jx.ico + " " + jx.nom),
      h("p", "mt-accroche", jx.accroche), regles, h("p", "mt-avert", "⚠️ Une seule tentative : si tu quittes en pleine partie, elle compte pour 0."), go);
    f.appendChild(c); document.body.appendChild(f);
  }
  var NIVEAUX = ["Facile", "Moyen", "Difficile", "Expert"];
  function maPlace() { return CTX && CTX.session && root.MaireSession ? MaireSession.placeDe(CTX.session, moi()) : 0; }
  function nivTxt(n) { return "Difficulté " + (n + 1) + "/4 · " + NIVEAUX[n]; }
  function DUREE() { return T ? J.duree(T.jeu) : J.DUREE; }
  function commencer(c) {
    appel("tournoiCommencer", { tournoi: T.id }).then(function (r) {
      if (r.deja) { fermer("mt-jeu"); toast("Tu as déjà joué ce tournoi."); return classement(); }
      compteARebours(c, r.graine, { id: T.jeu, niv: r.niv || 0, tid: T.id });
    }).catch(function (e) { fermer("mt-jeu"); toast("🏆 " + (e.message || "Tournoi indisponible")); });
  }
  function compteARebours(c, graine, o) {
    c.innerHTML = ""; c.classList.add("mt-ecran-jeu");
    var n = 3, z = h("div", "mt-321", "3"); c.appendChild(z); son("tictac", 0.6);
    var iv = setInterval(function () { n--; if (n > 0) { z.textContent = String(n); son("tictac", 0.6); } else { clearInterval(iv); jouer(c, graine, o); } }, 800);
  }

  // ---------- La boucle de jeu : 30 images par seconde, gestes enregistrés pour le serveur ----------
  // o : { id, niv, tid } — sans tid, partie d'entraînement (admin), rien n'est envoyé au serveur
  function jouer(c, graine, o) {
    var id = o.id, jx = J.JEUX[id], s = J.creer(id, graine, o.niv), gestes = [], file = [], tid = o.tid;
    img("decor-" + id);
    c.innerHTML = "";
    var haut = h("div", "mt-hud"), chrono = h("b", "mt-chrono", ""), score = h("b", "mt-score", "0");
    ajout(haut, ajout(h("span"), h("small", null, "⏱️"), chrono), h("strong", "mt-hud-nom", jx.ico + " " + jx.nom), ajout(h("span"), h("small", null, "Score"), score));
    var cv = h("canvas", "mt-canvas"); cv.width = J.W * 2; cv.height = J.H * 2; var ctx = cv.getContext("2d"); ctx.scale(2, 2);
    ajout(c, haut, cv);
    PARTIE = { fin: false };
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * J.W, y: (e.clientY - r.top) / r.height * J.H }; }
    function geste(g) { if (!s.fin) file.push(g); }
    var glisse = null;
    cv.addEventListener("pointerdown", function (e) {
      e.preventDefault(); var p = pos(e);
      if (id === "eboueurs") { var o = s.d.filter(function (q) { return Math.abs(q.x - p.x) < 34 && Math.abs(q.y - p.y) < 34; })[0]; if (o) { glisse = { id: o.id, x: p.x, y: p.y }; return; } }
      entree(id, p, geste, s);
    });
    cv.addEventListener("pointermove", function (e) { if (glisse) { var p = pos(e); glisse.x = p.x; glisse.y = p.y; } });
    cv.addEventListener("pointerup", function (e) { if (!glisse) return; var p = pos(e); if (p.y > 420) geste({ a: "bac", k: Math.max(0, Math.min(3, Math.floor(p.x / 90))), i: glisse.id }); glisse = null; });
    function clavier(e) {
      if (id !== "marathon") return;
      if (e.key === "ArrowUp" || e.key === " ") { e.preventDefault(); geste({ a: "saut" }); }
      if (e.key === "ArrowDown") { e.preventDefault(); geste({ a: "glisse" }); }
    }
    document.addEventListener("keydown", clavier);
    var t0 = performance.now(), faites = 0;
    (function boucle(t) {
      if (!document.body.contains(cv)) { document.removeEventListener("keydown", clavier); return; }
      var dues = Math.min(s.n, Math.floor((t - t0) / 1000 * J.FPS));
      while (faites < dues && !s.fin) {
        var lot = file.splice(0).map(function (g) { g.f = s.f; return g; });
        lot.forEach(function (g) { gestes.push(g); });
        var sc = s.score; J.pas(id, s, lot); faites++;
        if (s.score > sc) son("pieces", 0.25); else if (s.score < sc) son("perdu", 0.25);
      }
      COURANT = id; DESSINS[id](ctx, s, glisse);
      chrono.textContent = Math.max(0, Math.ceil((s.n - s.f) / J.FPS)) + " s"; score.textContent = String(s.score);
      if (s.fin) { document.removeEventListener("keydown", clavier); J.terminer(id, s); return finir(c, s, gestes, tid, id, o); }
      requestAnimationFrame(boucle);
    })(t0);
  }
  // Ce que fait un toucher dans chaque épreuve
  function entree(id, p, geste, s) {
    if (id === "pickpockets" || id === "tuyaux" || id === "pigeons" || id === "chantier") return geste({ a: "tap", x: Math.round(p.x), y: Math.round(p.y) });
    if (id === "peripherique") { if (p.y > 440) geste({ a: "feu", k: p.x < 180 ? 0 : 1 }); return; }
    if (id === "eboueurs") { if (p.y > 420) geste({ a: "bac", k: Math.max(0, Math.min(3, Math.floor(p.x / 90))) }); return; }
    if (id === "conseil") { var k = (p.x < 180 ? 0 : 1) + (p.y < 330 ? 0 : 2); if (p.y > 130) geste({ a: "elu", k: k }); return; }
    if (id === "marathon") return geste({ a: p.y < 330 ? "saut" : "glisse" });
    if (id === "budget") { if (p.y > 460) return geste({ a: "ok" }); var i = Math.floor((p.y - 150) / 52); if (i >= 0 && i < s.opts.length) geste({ a: "opt", k: i }); return; }
    if (id === "une") { var r = Math.floor((p.y - 110) / 130); if (r < 0 || r > 2) return; geste({ a: p.x < 180 ? "evt" : "titre", k: r }); }
  }
  function finir(c, s, gestes, tid, id, o) {
    son("fanfare", 0.6);
    c.innerHTML = ""; c.classList.remove("mt-ecran-jeu");
    var res = h("div", "mt-fin"), sc = h("strong", "mt-fin-score", String(s.score)), info = h("p", null, "Vérification du score par le serveur…");
    var bon = s.score >= J.JEUX[id].typique * 0.75, ill = h("img", "mt-illu mt-illu-fin"); ill.src = "maire/img/tournoi/" + (bon ? "victoire" : "defaite") + ".webp"; ill.alt = ""; ill.onerror = function () { ill.remove(); };
    ajout(res, ill, h("p", "mt-sur", bon ? "Belle épreuve !" : "Fin de l’épreuve !"), h("h4", "mt-titre", "🏁 " + J.JEUX[id].nom), sc, info);
    c.appendChild(res);
    if (!tid) {   // entraînement : pas de serveur, on peut rejouer
      var verif = J.rejouer(id, graine0(o), J.nettoyer(gestes, id), o.niv);
      info.textContent = "🛠 Entraînement (" + nivTxt(o.niv) + ") · rien n’est envoyé au tournoi · le serveur aurait compté " + verif.score + " points.";
      ajout(res, bouton("Rejouer", "btn m-go", function () { compteARebours(c, o.graine = Math.floor(Math.random() * 2e9) + 1, o); }), bouton("Autre épreuve", "btn m-sec", function () { fermer("mt-jeu"); entrainement(); }));
      return;
    }
    appel("tournoiTerminer", { tournoi: tid, gestes: gestes }).then(function (r) {
      sc.textContent = String(r.score);
      info.textContent = r.motif ? "⚠️ Partie refusée par le serveur (" + r.motif + ")." : "✔ Score vérifié par le serveur. Le classement définitif tombe 30 secondes avant l’élection.";
      if (root.confettis && !r.motif) root.confettis();
      ajout(res, bouton("Voir le classement", "btn m-go", function () { fermer("mt-jeu"); classement(); }));
    }).catch(function (e) { info.textContent = "⚠️ " + (e.message || "Le serveur n’a pas répondu") + " — ton score sera compté à 0 s’il n’est pas reçu."; ajout(res, bouton("Fermer", "btn m-sec", function () { fermer("mt-jeu"); })); });
  }

  // ---------- Classement (provisoire en direct, puis définitif) ----------
  function lignesClassement() {
    if (!T || !CTX || !CTX.session) return [];
    if (T.etat === "clos" && T.resultats) return T.resultats;
    var p = {}; Object.keys(PARTS).forEach(function (u) { var x = PARTS[u]; p[u] = { score: x.statut === "fini" ? x.score : 0, fin: x.fin || x.debut, statut: "fini", enCours: x.statut !== "fini" }; });
    return TR.classement(T, CTX.session, p).map(function (l) { if (l.uid && PARTS[l.uid] && PARTS[l.uid].statut !== "fini") l.enCours = true; if (l.uid && !PARTS[l.uid]) l.absent = true; return l; });
  }
  function classement() {
    if (!T) return; fermer("mt-classement");
    var f = h("div", "m-pop mt-pop"); f.id = "mt-classement"; f.setAttribute("role", "dialog");
    var c = h("div", "m-pop-in mt-classement");
    ajout(c, bouton("✕", "m-leonx mt-x", function () { fermer("mt-classement"); }), h("p", "mt-sur", jeuDe(T).ico + " " + jeuDe(T).nom), h("h4", "mt-titre", "🏆 Classement du tournoi"),
      h("p", "mt-etat", ""), h("ol", "mt-liste"));
    c.insertBefore(petite("m-coupe", "🏆", 64), c.querySelector(".mt-sur"));
    f.appendChild(c); document.body.appendChild(f); f.onclick = function (e) { if (e.target === f) fermer("mt-classement"); };
    majClassement();
  }
  function petite(nom, emo, t) { var i = h("img", "mt-mini"); i.src = "maire/img/tournoi/" + nom + ".webp"; i.alt = emo || ""; i.width = i.height = t || 14; i.onerror = function () { i.replaceWith(document.createTextNode(emo || "")); }; return i; }
  function majClassement() {
    var c = document.querySelector(".mt-classement"); if (!c || !T) return;
    var clos = T.etat === "clos", now = maintenant();
    c.querySelector(".mt-etat").textContent = clos ? "Classement définitif · les gains de popularité sont appliqués." : "Classement provisoire, en direct · clôture dans " + mmss(T.cloture - now);
    var l = c.querySelector(".mt-liste"); l.innerHTML = "";
    lignesClassement().forEach(function (x) {
      var li = h("li", "mt-l" + (x.rang <= 10 ? " mt-top" : "") + (x.uid && x.uid === moi() ? " mt-moi" : ""));
      var g = ajout(h("em", "mt-gain " + (x.gain > 0 ? "mt-plus" : "mt-moins")), petite(x.gain > 0 ? "m-hausse" : "m-baisse"), document.createTextNode((x.gain > 0 ? "+" : "") + x.gain + " %"));
      ajout(li, x.rang <= 3 ? ajout(h("b", "mt-rang"), petite(["m-or", "m-argent", "m-bronze"][x.rang - 1], ["🥇", "🥈", "🥉"][x.rang - 1], 28)) : h("b", "mt-rang", String(x.rang)), h("span", "mt-av", x.ico || "🙂"),
        ajout(h("span", "mt-nom"), document.createTextNode((x.uid === moi() ? "⭐ Toi" : x.nom) + (x.bot ? " 🤖" : "")), h("small", null, (root.MaireSession ? MaireSession.court(x.place) : "") + (x.absent && !clos ? " · pas encore joué" : x.enCours ? " · en jeu…" : x.absent ? " · absent" : ""))),
        h("b", "mt-sc", String(x.score)), g);
      l.appendChild(li);
    });
    if (!c.dataset.vu) { c.dataset.vu = "1"; var m = l.querySelector(".mt-moi"); if (m) setTimeout(function () { m.scrollIntoView({ block: "center" }); }, 50); }   // directement sur sa ligne
  }

  // ---------- Récompense : appliquée une seule fois à la partie du joueur ----------
  function recompense() {
    majTout();
    if (!T || T.etat !== "clos" || !T.resultats || !CTX || !CTX.appliquer) return;
    var r = T.resultats.filter(function (x) { return x.uid === moi(); })[0]; if (!r) return;
    if (CTX.appliquer(T.id, r.gain, r.rang)) {
      son(r.gain > 0 ? "bravo" : "hue", 0.7);
      fermer("mt-annonce"); fermer("mt-jeu"); classement();
      toast("🏆 Grand Tournoi : " + r.rang + (r.rang === 1 ? "er" : "e") + " · " + (r.gain > 0 ? "+" : "") + r.gain + " de popularité");
    }
  }

  root.__dessine = function (ctx, s, id) { COURANT = id; DESSINS[id](ctx, s, null); };   // aperçu des épreuves (tests)
  root.MaireTournoiUI = { entrainement: entrainement, branchement: function (b) { BACK = b; }, tic: tic, bandeau: bandeau, annonce: annonce, classement: classement, presenter: presenter, etat: function () { return T; } };

  // ===================== Dessin des dix épreuves (Canvas, style « arcade » de la mairie) =====================
  var BLEU = "#141c4a", CARTE = "#1d2860", OR = "#f5b21a", ROUGE = "#c8352e", CLAIR = "#e8e2cf";
  // Illustrations (maire/img/tournoi) : chargées à la demande ; tant qu'une image n'est pas prête, le dessin simple prend le relais
  var IMGS = {}, COURANT = null;
  function img(nom) { var i = IMGS[nom]; if (!i) { i = IMGS[nom] = new Image(); i.decoding = "async"; i.src = "maire/img/tournoi/" + nom + ".webp"; } return i.complete && i.naturalWidth ? i : null; }
  function spr(ctx, nom, x, y, t, e) { var i = img(nom); if (!i) return emo(ctx, e || "❔", x, y, t); var w = t * 1.15; ctx.drawImage(i, x - w / 2, y - w / 2, w, w); }
  function tuile(ctx, nom, x, y, w, ht, coul) {   // un étage : la pierre dessinée répétée sur toute sa largeur
    var i = img(nom); if (!i) return bloc(ctx, x, y, w, ht, coul, "#8a7350", 3);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, ht); ctx.clip(); ctx.fillStyle = coul || "#e9d7b0"; ctx.fillRect(x, y, w, ht); for (var k = x; k < x + w; k += ht) ctx.drawImage(i, k, y, ht, ht); ctx.restore();
    ctx.strokeStyle = "#6b5535"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, ht);
  }
  function decor(ctx) {
    if (!COURANT) return false; var i = img("decor-" + COURANT); if (!i) return false;
    if (COURANT === "marathon") return false;   // décor qui défile : dessiné par l'épreuve
    ctx.drawImage(i, 0, 0, J.W, J.H);
    if (COURANT !== "une" && COURANT !== "chantier") { ctx.fillStyle = "rgba(10,14,40,.18)"; ctx.fillRect(0, 0, J.W, J.H); }
    return true;
  }
  function fond(ctx, haut, bas) { if (decor(ctx)) return; var g = ctx.createLinearGradient(0, 0, 0, J.H); g.addColorStop(0, haut); g.addColorStop(1, bas); ctx.fillStyle = g; ctx.fillRect(0, 0, J.W, J.H); }
  function emo(ctx, e, x, y, t) { ctx.fillStyle = "#000"; /* opaque : sinon la transparence du fond déteint sur l'émoji */ ctx.font = (t || 32) + "px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(e, x, y); }
  function txt(ctx, t, x, y, taille, coul, align, gras) { ctx.font = (gras === false ? "" : "bold ") + (taille || 14) + "px Georgia, serif"; ctx.textAlign = align || "center"; ctx.textBaseline = "middle"; if (clair(coul || "#fff")) { ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineJoin = "round"; ctx.strokeText(t, x, y); }   /* contour seulement pour les textes clairs */ ctx.fillStyle = coul || "#fff"; ctx.fillText(t, x, y); }
  function clair(c) { var m = /^#([0-9a-f]{6})$/i.exec(c); if (!m) return true; var n = parseInt(m[1], 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 128; }
  function bloc(ctx, x, y, w, ht, coul, bord, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, ht, r == null ? 10 : r); else ctx.rect(x, y, w, ht); ctx.fillStyle = coul; ctx.fill(); if (bord) { ctx.strokeStyle = bord; ctx.lineWidth = 2; ctx.stroke(); } }
  function lignes(ctx, t, x, y, larg, taille, coul) {   // texte sur plusieurs lignes
    ctx.font = "bold " + taille + "px Georgia, serif"; var mots = t.split(" "), l = "", ys = y, out = [];
    mots.forEach(function (m) { var e = l ? l + " " + m : m; if (ctx.measureText(e).width > larg && l) { out.push(l); l = m; } else l = e; }); out.push(l);
    out.forEach(function (li, i) { txt(ctx, li, x, ys + i * (taille + 3) - (out.length - 1) * (taille + 3) / 2, taille, coul); });
  }
  function bulles(ctx, s) {   // les points gagnés ou perdus s'envolent
    s.evts.forEach(function (e) { var a = (s.f - e.f) / 25; if (a > 1 || !e.n) return; ctx.globalAlpha = 1 - a; txt(ctx, (e.n > 0 ? "+" : "") + e.n, e.x, e.y - a * 40, 20, e.n > 0 ? "#6fdc95" : "#ff6b6b"); ctx.globalAlpha = 1; });
  }
  var SPR = { pickpocket: ["s-pickpocket1", "s-pickpocket2"], touriste: ["s-touriste1", "s-touriste2", "s-touriste3"], policier: ["s-policier"], journaliste: ["s-journaliste"], pompier: ["s-pompier"] };
  var DECH = { "📰": "s-journal", "✉️": "s-journal", "📦": "s-carton", "🍾": "s-bouteille", "🫙": "s-bocal", "🥛": "s-bocal", "🧴": "s-plastique", "🥤": "s-gobelet", "🛍️": "s-plastique", "🍌": "s-banane", "🍕": "s-pizza", "🦴": "s-sac-noir" };
  var PERSO = { pickpocket: "🦹", touriste: "🧑‍🦰", policier: "🕵️", journaliste: "🧑‍💼", pompier: "🧑‍🚒" };
  var DESSINS = {
    pickpockets: function (ctx, s) {
      fond(ctx, "#27306b", BLEU); emo(ctx, "🗼", 300, 60, 70); txt(ctx, "Touche les pickpockets 🦹", 150, 40, 15, OR);
      J.SPOTS.forEach(function (sp) { bloc(ctx, sp[0] - 48, sp[1] - 55, 96, 112, "rgba(20,28,74,.28)", "rgba(255,255,255,.18)", 14); });
      s.p.forEach(function (o) {
        var sp = J.SPOTS[o.k], age = Math.min(1, (s.f - o.debut) / 6);
        ctx.save(); ctx.translate(sp[0], sp[1] + (1 - age) * 30); ctx.globalAlpha = age;
        var v = SPR[o.t][(o.k + o.debut) % SPR[o.t].length]; spr(ctx, v, 0, -4, 78, PERSO[o.t]);
        ctx.restore();
      });
      bulles(ctx, s);
    },
    tuyaux: function (ctx, s) {
      fond(ctx, "#2b2016", "#1a120c");
      var T2 = s.T, e = T2.eau || { vus: {} }, yD = 120 + T2.depart * 60 + 30, yA = 120 + T2.arrivee * 60 + 30, puls = 0.5 + 0.5 * Math.sin(s.f / 4);
      bloc(ctx, 12, 30, 336, 76, "rgba(20,28,74,.88)", OR, 12);
      txt(ctx, s.flux ? "💧 L’eau arrive ! Canalisation suivante…" : "Fais couler l’eau de la vanne jusqu’à la maison", 180, 52, 14, OR);
      txt(ctx, s.flux ? "Réparées : " + s.reparees : "Touche un tuyau pour le tourner · Réparées : " + s.reparees, 180, 82, 12, CLAIR, "center", false);
      // Un tuyau « en métal » : contour sombre, corps, reflet ; rempli d'eau s'il est relié à la vanne
      function tube(x1, y1, x2, y2, eau) {
        ctx.lineCap = "round";
        ctx.strokeStyle = "#2a2018"; ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = eau ? (s.flux ? "#6fd3ff" : "#2f8fe0") : "#a7a39a"; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = eau ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.35)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x1 - 2, y1 - 3); ctx.lineTo(x2 - 2, y2 - 3); ctx.stroke();
      }
      bloc(ctx, 26, 116, 308, 308, "rgba(14,18,44,.72)", "rgba(245,178,26,.5)", 10);   // la grille se détache du décor
      // Départ (vanne à gauche) et arrivée (maison à droite) : bien visibles, avec leur ligne en surbrillance
      ctx.fillStyle = "rgba(79,195,255," + (0.12 + 0.1 * puls) + ")"; ctx.fillRect(30, yD - 30, 60, 60);
      ctx.fillStyle = "rgba(111,220,149," + (0.12 + 0.1 * puls) + ")"; ctx.fillRect(270, yA - 30, 60, 60);
      for (var r = 0; r < 5; r++) for (var c = 0; c < 5; c++) {
        var x = 30 + c * 60, y = 120 + r * 60;
        ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 1; ctx.strokeRect(x + 1, y + 1, 58, 58);
      }
      var aImg = img("t-droit") && img("t-coude") && img("t-te") && img("t-droit-eau") && img("t-coude-eau") && img("t-te-eau");
      for (r = 0; r < 5; r++) for (c = 0; c < 5; c++) {
        var m = T2.g[r][c], plein = e.vus[r + "," + c], cx = 60 + c * 60, cy = 150 + r * 60;
        if (aImg) {   // la pièce dessinée, tournée selon ses ouvertures (dessins de base : droit = gauche-droite, coude = gauche-haut, T = gauche-haut-droite)
          var forme = [[10, "t-droit"], [9, "t-coude"], [11, "t-te"]].filter(function (f) { var b = f[0]; for (var q = 0; q < 4; q++) { if (b === m) return true; b = ((b << 1) | (b >> 3)) & 15; } return false; })[0];
          if (forme) {
            var b = forme[0], q = 0; while (b !== m && q < 4) { b = ((b << 1) | (b >> 3)) & 15; q++; }
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(q * Math.PI / 2); ctx.drawImage(img(forme[1] + (plein ? "-eau" : "")), -34, -34, 68, 68); ctx.restore();
            if (plein && s.flux) { ctx.fillStyle = "rgba(111,211,255,.18)"; ctx.fillRect(cx - 30, cy - 30, 60, 60); }
            continue;
          }
        }
        [[1, 0, -30], [2, 30, 0], [4, 0, 30], [8, -30, 0]].forEach(function (d) { if (m & d[0]) tube(cx, cy, cx + d[1], cy + d[2], plein); });
        ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 7); ctx.fillStyle = plein ? "#2f8fe0" : "#8d897f"; ctx.fill(); ctx.strokeStyle = "#2a2018"; ctx.lineWidth = 2; ctx.stroke();
      }
      // Fuites : là où l'eau sort d'un tuyau sans entrer dans le suivant → c'est la case à tourner
      if (!s.flux) Object.keys(e.vus).forEach(function (k) {
        var rc = k.split(","), r0 = +rc[0], c0 = +rc[1], m0 = T2.g[r0][c0];
        [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]].forEach(function (d) {
          if (!(m0 & d[0])) return; var r1 = r0 + d[1], c1 = c0 + d[2];
          if (c0 === 0 && d[0] === 8 && r0 === T2.depart) return;                       // l'entrée côté vanne
          if (c1 > 4 && r0 === T2.arrivee) return;                                        // la sortie côté maison
          if (r1 >= 0 && c1 >= 0 && r1 < 5 && c1 < 5 && e.vus[r1 + "," + c1] && (T2.g[r1][c1] & d[3])) return;
          var fx = 60 + c0 * 60 + d[2] * 30, fy = 150 + r0 * 60 + d[1] * 30;
          ctx.beginPath(); ctx.arc(fx, fy, 10 + 5 * puls, 0, 7); ctx.fillStyle = "rgba(79,195,255," + (0.35 + 0.35 * puls) + ")"; ctx.fill();
          var gi = img("t-fuite"); if (gi) { ctx.save(); ctx.translate(fx, fy); ctx.rotate(Math.atan2(d[1], d[2])); ctx.drawImage(gi, -6, -14, 28 + 6 * puls, 28); ctx.restore(); } else emo(ctx, "💦", fx + d[2] * 6, fy + d[1] * 6, 16);
        });
      });
      if (!s.flux && !e.vus[T2.depart + ",0"]) { ctx.beginPath(); ctx.arc(30, yD, 10 + 5 * puls, 0, 7); ctx.fillStyle = "rgba(79,195,255," + (0.35 + 0.35 * puls) + ")"; ctx.fill(); emo(ctx, "💦", 40, yD, 16); }
      // La vanne et la maison, avec leur bout de tuyau qui entre dans la grille
      tube(0, yD, 30, yD, true); tube(330, yA, 360, yA, s.flux > 0);
      if (img("t-vanne")) ctx.drawImage(img("t-vanne"), -10, yD - 22, 44, 44); else { bloc(ctx, 0, yD - 24, 26, 48, "#c8352e", "#fff", 6); emo(ctx, "🚰", 13, yD, 22); }
      if (img("t-maison")) ctx.drawImage(img("t-maison"), 322, yA - 24, 44, 44); else { bloc(ctx, 334, yA - 24, 26, 48, "#2f8a52", "#fff", 6); emo(ctx, "🏠", 347, yA, 20); }
      txt(ctx, "DÉPART →", 46, yD - 40, 11, "#9fdcff"); txt(ctx, "→ ARRIVÉE", 312, yA - 40, 11, "#9cf0b4");
      if (!s.flux && s.f - T2.debut < 90) txt(ctx, "👆 Tourne les tuyaux pour relier les deux", 180, 440, 13, "#fff");
      bulles(ctx, s);
    },
    peripherique: function (ctx, s) {
      fond(ctx, "#2f4a2f", "#1e331e");
      if (!img("decor-peripherique")) {
        ctx.fillStyle = "#3b3b45"; ctx.fillRect(0, 230, 360, 80); ctx.fillRect(140, 0, 80, 430);
        ctx.strokeStyle = "#e8e2cf"; ctx.setLineDash([12, 10]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 270); ctx.lineTo(360, 270); ctx.moveTo(180, 0); ctx.lineTo(180, 430); ctx.stroke(); ctx.setLineDash([]);
      }
      // Voitures : axe 0 de gauche à droite, axe 1 de haut en bas (d = distance parcourue)
      // d = 270 : le centre du carrefour ; d = 150 : la ligne d'arrêt
      var VEH = ["s-voiture1", "s-voiture2", "s-taxi", "s-bus", "s-scooter"];
      s.v[0].forEach(function (o, i) { spr(ctx, o.amb ? "s-ambulance" : VEH[(i * 3 + Math.round(o.d / 400)) % 5 === 3 ? 0 : (i + 1) % 5], o.d - 90, 255, 34, o.amb ? "🚑" : "🚗"); });
      s.v[1].forEach(function (o, i) { spr(ctx, o.amb ? "s-ambulance" : VEH[(i + 2) % 5], 165, o.d, 34, o.amb ? "🚑" : "🚙"); });
      var crash = s.evts.filter(function (e) { return e.n === -40 && s.f - e.f < 20; })[0]; if (crash) spr(ctx, "s-fumee", 180, 265, 70, "💥");
      ctx.fillStyle = "#fff"; ctx.fillRect(56, 232, 4, 76); ctx.fillRect(142, 146, 76, 4);
      // Les deux feux, gros boutons en bas
      [0, 1].forEach(function (k) {
        var x = k ? 270 : 90; bloc(ctx, x - 70, 448, 140, 80, CARTE, OR, 14);
        if (img("s-feu-vert")) spr(ctx, s.feux[k] ? "s-feu-vert" : "s-feu-rouge", x - 34, 488, 62); else { ctx.beginPath(); ctx.arc(x - 30, 488, 18, 0, 7); ctx.fillStyle = s.feux[k] ? "#3fd15a" : "#ff4b4b"; ctx.fill(); }
        txt(ctx, k ? "↕ Nord-Sud" : "↔ Est-Ouest", x + 20, 480, 12); txt(ctx, s.feux[k] ? "VERT" : "ROUGE", x + 20, 500, 12, s.feux[k] ? "#6fdc95" : "#ff8a80");
      });
      if (s.feux[0] && s.feux[1]) txt(ctx, "⚠️ Les deux feux sont verts !", 180, 215, 15, "#ffd56a");
      if (s.v[0].length > 6 || s.v[1].length > 6) txt(ctx, "🚧 Bouchon !", 180, 330, 16, "#ff8a80");
      bulles(ctx, s);
    },
    eboueurs: function (ctx, s, glisse) {
      fond(ctx, "#33405e", "#232c45"); txt(ctx, "Fais glisser chaque déchet dans la bonne poubelle", 180, 18, 12, OR);
      s.d.forEach(function (o) { if (glisse && glisse.id === o.id) return; spr(ctx, DECH[o.e], o.x, o.y, 46, o.e); });
      if (glisse) { var o = s.d.filter(function (q) { return q.id === glisse.id; })[0]; if (o) spr(ctx, DECH[o.e], glisse.x, glisse.y, 54, o.e); }
      ctx.fillStyle = "rgba(255,80,80,.25)"; ctx.fillRect(0, 404, 360, 4);
      var B = [["📰", "Papier", "#2b6fe0"], ["🍾", "Verre", "#2fae4c"], ["🧴", "Plastique", "#e0b92b"], ["🗑️", "Ordures", "#6b6b78"]];
      B.forEach(function (b, k) { var x = k * 90; bloc(ctx, x + 4, 424, 82, 110, b[2], "#fff", 12); emo(ctx, b[0], x + 45, 465, 30); txt(ctx, b[1], x + 45, 508, 13); });
      if (s.serie >= 5) txt(ctx, "🔥 Série ×" + s.serie, 180, 390, 15, "#ffd56a");
      bulles(ctx, s);
    },
    chantier: function (ctx, s) {
      fond(ctx, "#8fc1ff", "#cfe6ff");
      var decal = Math.max(0, (s.pile.length - 8) * 26);   // la vue monte avec l'immeuble
      ctx.fillStyle = "#6b5a45"; ctx.fillRect(0, 520 + decal, 360, 30);
      s.pile.forEach(function (b, i) { var y = 494 - i * 26 + decal; tuile(ctx, i === 0 ? "s-c-pierre" : i % 5 === 0 ? "s-c-balcon" : "s-c-fenetre", b.x, y, b.w, 26, "#e9d7b0"); });
      // La grue et son bloc
      ctx.fillStyle = OR; ctx.fillRect(0, 40, 360, 8); ctx.fillRect(s.bloc.x + s.bloc.w / 2 - 2, 48, 4, 40);
      if (img("s-c-crochet")) spr(ctx, "s-c-crochet", s.bloc.x + s.bloc.w / 2, 72, 30);
      tuile(ctx, (s.pile.length) % 5 === 0 ? "s-c-balcon" : "s-c-fenetre", s.bloc.x, 88, s.bloc.w, 26, "#f0e0bd");
      if (s.chute) { tuile(ctx, "s-c-pierre", s.chute.x, s.chute.y, s.chute.w, 26, "#c9b48c"); spr(ctx, "s-c-poussiere", s.chute.x + s.chute.w / 2, Math.min(500, s.chute.y), 60, "💨"); }
      txt(ctx, "Étages : " + (s.pile.length - 1), 60, 20, 14, BLEU, "left"); txt(ctx, "Touche pour lâcher !", 250, 20, 13, BLEU);
      bulles(ctx, s);
    },
    conseil: function (ctx, s) {
      fond(ctx, "#4a1f2a", "#2a1018");
      txt(ctx, s.mode === "montre" ? "👀 Regarde bien l’ordre…" : s.mode === "joue" ? "À toi ! (" + s.i + "/" + s.seq.length + ")" : "…", 180, 50, 18, OR);
      txt(ctx, "❤️".repeat(Math.max(0, s.vies)) + "🖤".repeat(Math.max(0, 3 - s.vies)), 180, 90, 18);
      var E = [["🧑‍💼", "#c8352e"], ["👩‍💼", "#2b6fe0"], ["👨‍🦳", "#2fae4c"], ["👩‍🦱", "#e0b92b"]];
      E.forEach(function (e, k) {
        var x = (k % 2) * 180 + 10, y = 140 + Math.floor(k / 2) * 190, on = s.allume === k;
        bloc(ctx, x, y, 160, 170, on ? e[1] : "rgba(255,255,255,.08)", on ? "#fff" : e[1], 18);
        if (img("s-elu" + k)) spr(ctx, "s-elu" + k + (on ? "-main" : ""), x + 80, y + 88, on ? 132 : 120); else { emo(ctx, e[0], x + 80, y + 75, on ? 78 : 64); emo(ctx, "🎤", x + 80, y + 140, 22); }
      });
      bulles(ctx, s);
    },
    marathon: function (ctx, s) {
      var rue = img("decor-marathon"), x;
      if (rue) {
        // Avenue qui défile : la chaussée de l'image tombe sous les pieds du coureur (y ≈ 380)
        var hh = 462, ww = rue.naturalWidth * hh / rue.naturalHeight, off = (s.dist * 0.6) % ww;
        ctx.fillStyle = "#3a3550"; ctx.fillRect(0, 0, J.W, J.H);
        for (x = -off; x < J.W; x += ww) ctx.drawImage(rue, x, 0, ww, hh);
        ctx.fillStyle = "#4a4560"; ctx.fillRect(0, hh, J.W, J.H - hh);
      } else {
        fond(ctx, "#ffcf8a", "#ff9a6a");
        var dec = (s.dist * 0.3) % 120; for (x = -dec; x < 400; x += 120) { bloc(ctx, x, 230, 90, 150, "#d9b38a", "#a6825e", 4); bloc(ctx, x + 20, 260, 20, 26, "#5b7fb3", null, 2); bloc(ctx, x + 55, 260, 20, 26, "#5b7fb3", null, 2); }
        emo(ctx, "🗼", 300 - (s.dist * 0.05) % 400, 150, 60);
        ctx.fillStyle = "#6b6b78"; ctx.fillRect(0, 380, 360, 160); ctx.fillStyle = "#fff"; for (x = -(s.dist % 60); x < 360; x += 60) ctx.fillRect(x, 450, 30, 4);
      }
      s.obs.forEach(function (o) {
        if (o.pris && (o.t === "eau" || o.t === "medaille")) return;
        if (o.t === "barriere") spr(ctx, "s-barriere", o.x, 358, 46, "🚧"); else if (o.t === "bache") { if (img("s-bache")) spr(ctx, "s-bache", o.x, 300, 66); else { bloc(ctx, o.x - 26, 280, 52, 50, "#c8352e", "#fff", 4); emo(ctx, "⬇️", o.x, 305, 20); } }
        else if (o.t === "eau") spr(ctx, "s-eau", o.x, 362, 30, "🧴"); else spr(ctx, "s-medaille", o.x, 290, 34, "🏅");
      });
      var yy = 360 - s.y; if (!(s.invul && s.f % 6 < 3)) { if (s.glisse) spr(ctx, "s-coureur-glisse", 75, yy + 8, 52, "🏃"); else spr(ctx, s.y > 0 ? "s-coureur-saut" : "s-coureur", 75, yy - 10, 56, "🏃"); }
      if (img("s-coeur")) for (var c = 0; c < 3; c++) spr(ctx, c < s.coeurs ? "s-coeur" : "s-coeur-vide", 278 + c * 24, 24, 18); else txt(ctx, "❤️".repeat(Math.max(0, s.coeurs)), 300, 24, 16); txt(ctx, Math.round(s.dist / 20) + " m", 50, 24, 16, BLEU);
      txt(ctx, "Haut : sauter · Bas : glisser", 180, 520, 13, "#fff");
      bulles(ctx, s);
    },
    budget: function (ctx, s) {
      fond(ctx, "#1d4a3a", "#10291f");
      bloc(ctx, 20, 30, 320, 90, CARTE, OR, 14); txt(ctx, "Objectif : économiser", 180, 55, 14, CLAIR); txt(ctx, (s.but * 1000).toLocaleString("fr-FR") + " €", 180, 88, 26, OR);
      var tot = s.opts.reduce(function (n, o) { return n + (o.on ? o.v : 0); }, 0);
      s.opts.forEach(function (o, i) {
        var y = 150 + i * 52; bloc(ctx, 20, y, 320, 44, o.on ? "#2f8a52" : "rgba(20,28,74,.86)", o.on ? "#9cf0b4" : "rgba(255,255,255,.3)", 10);
        txt(ctx, (o.on ? "☑ " : "☐ ") + (o.v > 0 ? "Économie de " : "Dépense en plus : ") + (Math.abs(o.v) * 1000).toLocaleString("fr-FR") + " €", 36, y + 22, 14, "#fff", "left");
      });
      txt(ctx, "Ta sélection : " + (tot * 1000).toLocaleString("fr-FR") + " €", 180, 445, 14, tot === s.but ? "#6fdc95" : CLAIR);
      bloc(ctx, 60, 466, 240, 56, OR, "#fff2c4", 14); txt(ctx, "✔ Valider", 180, 494, 20, BLEU);
      if (s.pause) txt(ctx, s.ok ? "✅ Budget bouclé !" : "❌ Le compte n’y est pas", 180, 135, 16, s.ok ? "#6fdc95" : "#ff8a80");
      bulles(ctx, s);
    },
    pigeons: function (ctx, s) {
      fond(ctx, "#cdbf9f", "#b3a582");
      txt(ctx, "Ramasse les déchets ! (" + s.d.length + " par terre)", 180, 30, 14, s.d.length > 25 ? ROUGE : BLEU);
      s.d.forEach(function (o) { var n = { "🥤": "s-p-gobelet", "🍌": "s-p-banane", "📰": "s-journal", "🍟": "s-p-frites", "🧻": "s-p-papier", "🥡": "s-p-nouilles" }[o.e]; spr(ctx, n, o.x, o.y, 30, o.e); });
      s.pg.forEach(function (g, k) { spr(ctx, (s.f + k * 7) % 40 < 20 ? "s-pigeon" : "s-pigeon-picore", g.x, g.y, 34, "🐦"); });
      bulles(ctx, s);
    },
    une: function (ctx, s) {
      fond(ctx, "#f2ead7", "#e2d6b8"); bloc(ctx, 16, 20, 328, 76, "rgba(250,243,226,.94)", "#8a7350", 10); txt(ctx, "Touche un événement, puis son titre", 180, 40, 15, BLEU); txt(ctx, "LE JOURNAL DE PARIS", 180, 80, 18, "#3a2a10");
      s.ev.forEach(function (e, i) { var y = 110 + i * 130; bloc(ctx, 8, y, 166, 118, e.ok ? "#bfe6c6" : s.sel === i ? "#ffe39a" : "#fffaf0", "#8a7350", 8); lignes(ctx, e.txt, 91, y + 59, 150, 13, "#2a2010"); });
      s.ti.forEach(function (t, i) { var y = 110 + i * 130; bloc(ctx, 186, y, 166, 118, t.ok ? "#bfe6c6" : "#1b2550", "#8a7350", 8); lignes(ctx, t.txt, 269, y + 59, 150, 13, t.ok ? "#2a2010" : "#fff"); });
      bulles(ctx, s);
    }
  };
})(typeof window !== "undefined" ? window : this);
