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
  function date(t) { t = Math.max(1, t); var a = Math.floor((t - 1) / 4) + 1, q = (t - 1) % 4 + 1; return (q === 1 ? "1er" : q + "e") + " trimestre · année " + a; }
  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(st)); } catch (e) {} statsPartie(false); }
  // ---------- Statistiques pour l'administration : une fiche par partie de JOUEUR (les bots n'en ont pas) ----------
  // Envoyée au plus toutes les 90 s pendant la partie, et tout de suite à la fin. Lisible seulement par l'admin.
  var STATS_ENVOI = 0, STATS_FIN = null;
  function statsPartie(force) {
    if (!st || st.scenario || !st.pid || !window.LB || !LB.db || !LB.uid) return;
    var now = Date.now(); if (!force && now - STATS_ENVOI < 90000) return;
    if (st.phase === "fin" && STATS_FIN === st.pid) return;
    STATS_ENVOI = now; if (st.phase === "fin") STATS_FIN = st.pid;
    try {
      var x = st.stats || {}, els = st.elections || [], e = M.etatSession(st), u = LB.auth && LB.auth.currentUser;
      if (st.session) st.placeMax = Math.max(st.placeMax || 0, st.session.place || 0);
      var doc = {
        uid: LB.uid, nom: window.nomJoueur ? nomJoueur() : "", google: !!(u && !u.isAnonymous), maj: now, debut: st.debutReel || (st.debutReel = now),
        fin: st.phase === "fin", raison: st.fin && st.fin.raison ? st.fin.raison.type || "" : "",
        session: !!st.session, sessionNom: SES.s && SES.s.nom || "", place: st.session ? st.session.place : -1, placeMax: st.placeMax || 0,
        competence: st.maire || "", ligne: st.ligne || "", niv: st.nivJ || 1, nivJoueur: nivJ(), t: st.t, mandats: st.mandat,
        elecG: els.filter(function (y) { return y.gagne; }).length, elecP: els.filter(function (y) { return !y.gagne; }).length, montees: els.filter(function (y) { return y.monte; }).length,
        note: SS() ? SS().note(e) : 0, score: e.score, pop: e.pop, bon: e.bon, tresor: e.tresor, hab: e.hab, bats: e.bats, emp: e.emp,
        dossiers: x.dossiers || 0, catD: x.catD || {}, casino: x.casino || {}, duels: st.duels || {},
        achats: x.achats || 0, attaquesOk: x.attaquesOk || 0, encheres: x.encheres || 0, encheresPerdues: x.encheresPerdues || 0,
        catastrophes: x.catastrophes || 0, faillites: st.fin && st.fin.raison && st.fin.raison.type === "faillite" ? 1 : 0
      };
      LB.db.collection("stats_parties").doc(String(st.pid)).set(doc).catch(function () {});
    } catch (er) {}
  }
  function lireSauvegarde() { try { var s = JSON.parse(localStorage.getItem(CLE) || "null"); return s && s.v >= 3 && s.v <= 8 ? s : null; } catch (e) { return null; } }
  function effacer() { try { localStorage.removeItem(CLE); } catch (e) {} }
  function haut() { var g = document.getElementById("g-maire"); if (g && g.getBoundingClientRect().top < 0) g.scrollIntoView({ behavior: "smooth" }); }
  function nivJ() { return G.nivJoueur(); }
  function sansLimiteAdmin() { try { return !!window.ADMIN_UNLOCKED && localStorage.getItem("maire_sanslimite") === "1"; } catch (e) { return false; } }
  function couleur(v) { var t = Math.max(0, Math.min(1, (v - 30) / 45)); return "hsl(" + Math.round(t * 125) + ",62%,42%)"; }

  // ---------- Plus de niveau de difficulté à choisir : elle monte d'elle-même, de mandat en mandat ----------
  function lireNiveau() { return "progressif"; }
  function choixNiveau() { niveau = "progressif"; var lv = document.getElementById("m-lvls"); if (lv) lv.style.display = "none"; }
  // Étoiles de difficulté du mandat en cours
  function cleClassement() { return "maire"; }
  // Note globale en étoiles (au dixième près) : 5 étoiles grises, remplies en or selon la note
  function etoilesNote(n, grand) {
    var e = h("span", "m-note" + (grand ? " m-note-g" : "")), fond = h("span", "m-note-fond", "★★★★★"), plein = h("span", "m-note-plein", "★★★★★");
    plein.style.width = (n / 5 * 100) + "%"; e.title = virg(n) + " / 5"; ajout(e, fond, plein); return e;
  }
  function noteVille() { return SS() ? SS().note(M.etatSession(st)) : 0; }

  // ---------- Données ----------
  // Téléchargement d'un fichier de données : 3 essais (réseau qui se réveille, iPhone qui revient de veille…)
  function chargerJSON(url, essais) {
    essais = essais || 3;
    return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).catch(function (e) {
      if (essais > 1) return new Promise(function (ok) { setTimeout(ok, 700); }).then(function () { return chargerJSON(url, essais - 1); });
      var err = new Error("Réseau : " + url.split("/").pop() + " (" + (e && e.message || e) + ")"); err.reseau = true; throw err;
    });
  }
  function index() {
    if (IDX) return Promise.resolve(IDX);
    return chargerJSON("maire/data/index.json").then(function (x) { IDX = x; return x; });
  }
  function choisirLots() {
    var l = IDX.lots.slice(), pris = [], n = 0;
    for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; }
    for (var k = 0; k < l.length && n < MIN_EVTS; k++) { pris.push(l[k].f); n += l[k].n; }
    return pris;
  }
  function quetes() {
    if (QUETES) return Promise.resolve(QUETES);
    return chargerJSON("maire/data/quetes.json").then(function (x) { QUETES = x; return x; });
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
    return Promise.all(noms.map(function (f) { return chargerJSON("maire/data/" + f); }))
      .then(function (ls) { BASE = M.indexer([].concat.apply([], ls)); return BASE; });
  }

  // ---------- Erreurs au chargement ----------
  function fenetreErreur(ico, titre, txt, boutons, detail) {
    var v = document.getElementById("m-erreur"); if (v) v.remove(); cacherBulle();
    var f = h("div", "m-pop"); f.id = "m-erreur"; f.setAttribute("role", "alertdialog");
    var c = ajout(h("div", "m-pop-in m-afk"), h("span", "m-afk-ico", ico), h("h4", null, titre), h("p", null, txt));
    boutons.forEach(function (b) { c.appendChild(bouton(b[0], b[2] ? "btn m-go" : "btn m-sec", function () { f.remove(); b[1](); })); });
    if (detail) c.appendChild(h("small", "m-erreur-detail", detail));
    f.appendChild(c); document.body.appendChild(f);
  }
  // Problème de connexion : on peut réessayer
  function erreurReseau(reessayer, e) {
    fenetreErreur("📡", "Impossible de charger les dossiers", "La connexion n’a pas répondu (3 essais). Vérifie ta connexion et réessaie.",
      [["🔄 Réessayer", reessayer, true], ["Fermer", accueil]], e && e.message);
  }
  // Partie trop ancienne pour la version actuelle du jeu : la seule solution est de la supprimer
  function partieIncompatible(e) {
    st = null;
    fenetreErreur("😵", "Ta partie ne peut pas reprendre",
      "Le jeu a beaucoup changé depuis le début de cette partie : elle n’est plus compatible avec la nouvelle version. La seule solution est de la supprimer et d’en commencer une nouvelle. Ton niveau, tes succès, tes objets et tes paliers sont conservés.",
      [["🗑️ Fermer et supprimer ma partie", function () { effacer(); try { localStorage.removeItem("maire_reserve"); } catch (x) {} accueil(); }, true]], e && e.message);
  }
  function echec(reessayer) { return function (e) { if (e && e.reseau) erreurReseau(reessayer, e); else partieIncompatible(e); }; }

  // ---------- Accueil ----------

  // Accueil épuré : ton niveau, un gros bouton pour jouer, 4 tuiles ; le reste est replié
  // ---------- Fond vidéo (rue de Paris en pixel art) derrière le menu du jeu, pas pendant la partie ----------
  var fondV = null, fondF = "";
  // menu = true pour le menu et ses sections (série, pass, roue, ligue, succès, objets) : la musique du menu continue
  function vider(menu) { box.innerHTML = ""; fondMenu(false); document.body.classList.toggle("m-son", !!menu); if (window.musique) setTimeout(window.musique, 0); }
  function fondMenu(on) {
    var g = document.getElementById("g-maire"); if (!g) return;
    g.classList.toggle("m-menu", on); document.body.classList.toggle("m-fond-on", on);
    if (window.musique) setTimeout(window.musique, 0);
    var calme = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (on && !fondV) {
      fondV = document.createElement("video"); fondV.className = "m-fond"; fondV.muted = true; fondV.loop = true; fondV.playsInline = true;
      fondV.setAttribute("muted", ""); fondV.setAttribute("playsinline", ""); fondV.setAttribute("aria-hidden", "true"); fondV.tabIndex = -1;
      document.body.insertBefore(fondV, document.body.firstChild);
      window.addEventListener("resize", function () { clearTimeout(fondMenu.t); fondMenu.t = setTimeout(function () { if (g.classList.contains("m-menu")) fondMenu(true); }, 300); });
      if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { if (!g.classList.contains("m-menu") || calme) return; if (e[0].isIntersecting) { var p = fondV.play(); if (p && p.catch) p.catch(function () {}); } else fondV.pause(); }).observe(g);
    }
    if (!fondV) return;
    if (!on) { fondV.pause(); return; }
    var f = window.innerHeight > window.innerWidth ? "portrait" : "paysage";
    if (f !== fondF) { fondF = f; fondV.poster = "img/maire-menu-" + f + ".webp"; if (!calme) fondV.src = "img/maire-menu-" + f + ".mp4"; }
    if (!calme) { var p = fondV.play(); if (p && p.catch) p.catch(function () {}); }
  }
  // ---------- Au lancement : jouer en invité ou se connecter avec Google (facultatif, demandé une seule fois) ----------
  var CONNEXION_VUE = false;
  function choixInvite() { try { return localStorage.getItem("maire_invite") === "1"; } catch (e) { return false; } }
  function ecranConnexion() {
    CONNEXION_VUE = true;
    vider(true); fondMenu(true); fermerModale();
    var d = h("div", "mx-connexion"), msg = h("p", "m-aide", "");
    ajout(d, h("span", "mx-connexion-ico", "🏛️"), h("h4", null, "Bienvenue, futur maire !"),
      h("p", null, "Connecte-toi avec Google pour retrouver ton pseudo, ton numéro de maire et tes statistiques sur tous tes appareils. C’est facultatif : tu peux jouer tout de suite en invité."));
    var g = bouton("", "mx-google", function () {
      g.disabled = true; msg.textContent = "Connexion…";
      window.connexionGoogle().then(function () { try { localStorage.setItem("maire_invite", "1"); } catch (e) {} toast("✅ Connecté avec Google"); accueil(); })
        .catch(function (e) { g.disabled = false; msg.textContent = e && e.code === "auth/popup-closed-by-user" ? "Connexion annulée." : "Connexion impossible pour l’instant. Tu peux jouer en invité."; });
    });
    ajout(g, h("b", null, "G"), h("span", null, "Se connecter avec Google"));
    var inv = bouton("👤 Jouer en invité", "mx-jouer mx-jouer2", function () { try { localStorage.setItem("maire_invite", "1"); } catch (e) {} accueil(); });
    ajout(d, g, inv, msg, h("small", "m-aide", "En invité, tu joues sous le nom « " + nomJoueur() + " » (ou ton pseudo). Tu pourras te connecter plus tard depuis l’accueil du jeu."));
    box.appendChild(d); haut();
  }
  // Petite ligne en bas de l'accueil : connecté avec Google, ou proposition de se connecter
  function ligneCompte() {
    var c = window.compteGoogle ? compteGoogle() : null, d = h("div", "mx-compte");
    if (c) d.appendChild(h("small", null, "✅ Connecté avec Google" + (c.nom ? " · " + c.nom : "") + " · tu joues sous le nom « " + nomJoueur() + " »"));
    else if (window.connexionGoogle) ajout(d, h("small", null, "👤 Invité · « " + nomJoueur() + " »"), bouton("Se connecter avec Google", "mx-lien", ecranConnexion));
    return d;
  }
  function accueil() {
    if (!CONNEXION_VUE && !choixInvite() && window.connexionGoogle && !(window.compteGoogle && compteGoogle())) return ecranConnexion();
    vider(true); fondMenu(true); fermerModale();
    var s = lireSauvegarde(), n = nivJ(), P = G.lire(), nv = G.niveau(P.xp);
    choixNiveau(s && s.phase !== "fin" ? s.niveau : lireNiveau());
    var pr = h("div", "mx-profil"), barre = h("div", "mx-xpbarre"), bi = h("i"); bi.style.width = nv.pct + "%"; barre.appendChild(bi);
    ajout(pr, h("span", "mx-niv mx-niv-gros", String(nv.n)), ajout(h("div"), h("strong", null, nv.titre + ((P.titres || []).length ? " · 🎖️ " + P.titres[P.titres.length - 1] : "")), barre,
      h("small", null, nv.max ? "Niveau maximum" : nv.depuis + " / " + nv.besoin + " XP vers le niveau " + (nv.n + 1))));
    box.appendChild(pr);
    if (s && s.phase !== "fin") {
      var r = bouton("", "mx-jouer", reprise);
      ajout(r, h("strong", null, "▶ Reprendre ma partie"), h("small", null, (s.defi != null ? "Défi du jour · " : "") + "Mandat " + s.mandat + " · " + date(Math.max(1, s.t))));
      box.appendChild(r);
      box.appendChild(bouton("🏛️ Rejoindre une session", "mx-jouer mx-jouer2", function () { ecranSessions(false); }));
      box.appendChild(bouton("Nouvelle partie", "mx-lien", function () { if (confirm("Commencer une nouvelle partie ? La partie en cours sera perdue.")) creation(); }));
    } else {
      var j = bouton("", "mx-jouer", creation); ajout(j, h("strong", null, "▶ Jouer"), h("small", null, "Deviens maire de Paris"));
      box.appendChild(j);
      box.appendChild(bouton("🏛️ Rejoindre une session", "mx-jouer mx-jouer2", function () { ecranSessions(false); }));
    }
    // Quatre tuiles : chacune ouvre son écran
    var se = G.serie(), ps = G.paliersMois(), roue = G.roueDispo(), t = h("div", "mx-tuiles");
    function tuile(ico, titre, sous, f, vif) { var b = bouton("", "mx-tuile" + (vif ? " mx-vif" : ""), f); ajout(b, h("span", null, ico), h("strong", null, titre), h("small", null, sous)); return b; }
    ajout(t, tuile("🔥", se.n ? se.n + " jour" + (se.n > 1 ? "s" : "") : "Série", se.fait ? "validé aujourd’hui" : "joue aujourd’hui", ecranSerie, !se.fait),
      tuile("🎟️", "Palier " + ps.palier + "/20", "objectifs du mois", ecranPass),
      tuile("🎡", "Roue", roue ? "tour gratuit !" : "revient lundi", roue ? ecranRoue : function () { toast("🎡 Prochain tour gratuit lundi."); }, roue),
      tuile("🏅", "Ligue", "de la semaine", ecranLigue));
    box.appendChild(t);
    // Mes statistiques : seulement avec un compte Google (sinon, on propose de se connecter)
    var cg = window.compteGoogle && compteGoogle(), bst = bouton("", "mx-messtats" + (cg ? "" : " mx-verrou-stats"), cg ? ecranMesStats : ecranConnexion);
    ajout(bst, h("span", null, cg ? "📊" : "🔒"), ajout(h("div"), h("strong", null, "Mes statistiques"), h("small", null, cg ? "tes parties, tes compétences, tes records" : "connecte-toi avec Google pour les voir")));
    box.appendChild(bst);
    var auj = h("details", "mx-replie"); auj.appendChild(h("summary", null, "📅 Aujourd’hui : défi, quêtes et succès du jour"));
    var zone = h("div", "m-auj"); auj.appendChild(zone); box.appendChild(auj);
    Promise.all([index(), quetes()]).then(function () { panneauJour(zone, s); }).catch(function () { zone.textContent = "Indisponible pour le moment."; });
    var plus = h("details", "mx-replie"); plus.appendChild(h("summary", null, "📖 Mon parcours : histoire, succès, objets, déblocages"));
    ajout(plus, carteChapitre(n), carteProfil(), carteDeblocages(n));
    box.appendChild(plus);
    box.appendChild(ligneCompte());
  }
  // ---------- Mes statistiques (joueur connecté avec Google) : ses fiches de parties, lues dans stats_parties ----------
  var CATS_NOMS = { finances: "💶 Finances", economie: "📈 Économie", securite: "🛡️ Sécurité", logement: "🏠 Logement", transports: "🚇 Transports", proprete: "🧹 Propreté",
    ecologie: "🌱 Écologie", services: "🏥 Services publics", culture: "🎭 Culture", quotidien: "☕ Vie quotidienne", institutions: "🏛️ Institutions", crise: "🚨 Crises",
    catastrophe: "🌋 Catastrophes", chance: "🍀 Coups de chance", opposition: "⚔️ Opposition" };
  function ecranMesStats() {
    vider(true); fondMenu(true);
    box.appendChild(bouton("← Retour", "btn m-sec", accueil));
    box.appendChild(h("h5", null, "📊 Mes statistiques · " + nomJoueur()));
    var z = h("div", "m-messtats"); z.appendChild(h("p", "m-aide", "Chargement…")); box.appendChild(z); haut();
    if (!window.LB || !LB.db || !LB.uid) { z.innerHTML = ""; z.appendChild(h("p", "m-aide", "📡 Connexion Internet nécessaire.")); return; }
    LB.db.collection("stats_parties").where("uid", "==", LB.uid).get().then(function (q) {
      var P = q.docs.map(function (d) { return d.data(); }).sort(function (a, b) { return (b.maj || 0) - (a.maj || 0); });
      z.innerHTML = "";
      if (!P.length) { z.appendChild(h("p", "m-aide", "Pas encore de partie enregistrée : joue une partie (elle est comptée au bout de quelques minutes).")); return; }
      function somme(f) { return P.reduce(function (a, x) { return a + (f(x) || 0); }, 0); }
      function moy(f) { var l = P.map(f).filter(function (v) { return typeof v === "number"; }); return l.length ? l.reduce(function (a, v) { return a + v; }, 0) / l.length : 0; }
      function carte(ico, lib, val) { return ajout(h("div", "m-ms-k"), h("span", null, ico), h("b", null, val), h("small", null, lib)); }
      var ses = P.filter(function (x) { return x.session; }), meilleure = ses.reduce(function (m, x) { return Math.max(m, x.placeMax || 0); }, 0);
      var g = somme(function (x) { return x.elecG; }), pe = somme(function (x) { return x.elecP; }), tps = somme(function (x) { return Math.max(0, (x.maj || 0) - (x.debut || x.maj || 0)); });
      ajout(z, ajout(h("div", "m-ms-grille"),
        carte("🎮", "parties", String(P.length)), carte("👑", "meilleur poste", ses.length ? SS().court(meilleure) + (meilleure >= SS().TRONE ? "" : " arr.") : "—"),
        carte("⭐", "meilleure note", virg(Math.max.apply(null, P.map(function (x) { return x.note || 0; }))) + "/5"), carte("🌟", "note moyenne", virg(Math.round(moy(function (x) { return x.note; }) * 10) / 10) + "/5"),
        carte("🗳️", "élections gagnées", g + pe ? Math.round(g / (g + pe) * 100) + " %" : "—"), carte("📂", "dossiers tranchés", String(somme(function (x) { return x.dossiers; }))),
        carte("⬆️", "niveau max.", String(Math.max.apply(null, P.map(function (x) { return x.niv || 1; })))), carte("⏱️", "temps de jeu", Math.round(tps / 60000) >= 60 ? Math.floor(tps / 3600000) + " h " + Math.round(tps % 3600000 / 60000) + " min" : Math.round(tps / 60000) + " min")));
      // Compétences jouées
      var comp = {}; P.forEach(function (x) { var c = comp[x.competence || ""] || (comp[x.competence || ""] = { n: 0, g: 0, p: 0, note: 0 }); c.n++; c.g += x.elecG || 0; c.p += x.elecP || 0; c.note += x.note || 0; });
      var lc = h("div", "m-ms-liste"); lc.appendChild(h("p", "m-etape", "🎭 Tes compétences"));
      Object.keys(comp).sort(function (a, b) { return comp[b].n - comp[a].n; }).forEach(function (k) {
        var c = comp[k], m = M.C.MAIRES[k];
        lc.appendChild(ajout(h("div", "m-ms-l"), h("span", null, m ? m.ico + " " + m.nom : "—"), h("small", null, c.n + " partie" + (c.n > 1 ? "s" : "") + " · " + (c.g + c.p ? Math.round(c.g / (c.g + c.p) * 100) + " % d’élections gagnées" : "pas d’élection") + " · ⭐ " + virg(Math.round(c.note / c.n * 10) / 10))));
      });
      z.appendChild(lc);
      // Catégories : où tu brilles, où tu souffres
      var cats = {}; P.forEach(function (x) { Object.keys(x.catD || {}).forEach(function (k) { var c = cats[k] || (cats[k] = { n: 0, pop: 0 }); c.n += x.catD[k].n || 0; c.pop += x.catD[k].pop || 0; }); });
      var ck = Object.keys(cats).filter(function (k) { return cats[k].n; }).sort(function (a, b) { return cats[b].pop / cats[b].n - cats[a].pop / cats[a].n; });
      if (ck.length) {
        var lk = h("div", "m-ms-liste"); lk.appendChild(h("p", "m-etape", "📂 Tes dossiers, du meilleur au pire (popularité par dossier)"));
        ck.forEach(function (k) { var v = cats[k].pop / cats[k].n; lk.appendChild(ajout(h("div", "m-ms-l"), h("span", null, CATS_NOMS[k] || k), h("b", v >= 0 ? "m-plus" : "m-moins", (v >= 0 ? "+" : "") + virg(Math.round(v * 10) / 10)), h("small", null, cats[k].n + " dossier" + (cats[k].n > 1 ? "s" : "")))); });
        z.appendChild(lk);
      }
      // Casino et duels
      var cas = {}, du = { bot: { g: 0, p: 0 }, joueur: { g: 0, p: 0 } };
      P.forEach(function (x) {
        Object.keys(x.casino || {}).forEach(function (k) { var c = cas[k] || (cas[k] = { j: 0, g: 0 }); c.j += x.casino[k].j || 0; c.g += x.casino[k].g || 0; });
        Object.keys(x.duels || {}).forEach(function (k) { var d = du[k === "bot" ? "bot" : "joueur"]; d.g += x.duels[k].g || 0; d.p += x.duels[k].p || 0; });
      });
      var lj = h("div", "m-ms-liste"); lj.appendChild(h("p", "m-etape", "🎰 Casino et ⚔️ duels d’élection"));
      [["poker", "♠️ Poker"], ["bj", "🃏 Blackjack"], ["roulette", "🎡 Roulette"]].forEach(function (j) { var c = cas[j[0]] || { j: 0, g: 0 }; lj.appendChild(ajout(h("div", "m-ms-l"), h("span", null, j[1]), h("small", null, c.j ? c.g + " gagnée" + (c.g > 1 ? "s" : "") + " sur " + c.j + " (" + Math.round(c.g / c.j * 100) + " %)" : "jamais joué"))); });
      [["bot", "🤖 Contre les bots"], ["joueur", "👥 Contre les joueurs"]].forEach(function (j) { var d = du[j[0]]; lj.appendChild(ajout(h("div", "m-ms-l"), h("span", null, j[1]), h("small", null, d.g + d.p ? d.g + " victoire" + (d.g > 1 ? "s" : "") + ", " + d.p + " défaite" + (d.p > 1 ? "s" : "") : "aucun duel"))); });
      z.appendChild(lj);
      // Dernières parties
      var RAIS = { election: "battu aux élections", faillite: "faillite", demission: "démission", retraite: "retraite" };
      var ld = h("div", "m-ms-liste"); ld.appendChild(h("p", "m-etape", "🕘 Tes dernières parties"));
      P.slice(0, 10).forEach(function (x) {
        var m = M.C.MAIRES[x.competence];
        ld.appendChild(ajout(h("div", "m-ms-l"), h("span", null, new Date(x.debut || x.maj).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " · " + (m ? m.ico + " " + m.nom : "—")),
          h("small", null, (x.session ? "meilleur poste : " + SS().court(x.placeMax || 0) + ((x.placeMax || 0) >= SS().TRONE ? "" : " arr.") : "solo") + " · ⭐ " + virg(x.note || 0) + " · niv. " + (x.niv || 1) + " · " + (x.fin ? RAIS[x.raison] || "terminée" : "en cours"))));
      });
      z.appendChild(ld);
    }).catch(function () { z.innerHTML = ""; z.appendChild(h("p", "m-aide", "Impossible de lire tes statistiques pour l’instant.")); });
  }
  function ecranSerie() {
    vider(true); box.appendChild(bouton("← Retour", "btn m-sec", accueil));
    box.appendChild(h("h5", null, "🔥 Série de jours"));
    box.appendChild(carteSerie());
    var u = h("ol", "m-paliers"), se = G.serie();
    [1, 3, 5, 7, 10, 14, 21, 30].forEach(function (k) { var li = h("li", se.n >= k ? "m-ok" : ""); ajout(li, h("span", "m-pn", String(k)), h("span", null, G.texteSerie(G.recompenseSerie(k))), h("b", null, se.n >= k ? "✔" : "")); u.appendChild(li); });
    ajout(box, h("p", "m-aide", "Joue au moins un trimestre par jour. Un joker (gagné chaque semaine de série) pardonne un jour manqué."), u);
    haut();
  }
  function ecranLigue() {
    vider(true); box.appendChild(bouton("← Retour", "btn m-sec", accueil));
    box.appendChild(h("h5", null, "🏅 Ligue de la semaine"));
    var z = h("div"); box.appendChild(z); carteLigue(z);
    haut();
  }
  // ---------- Bureau des objets trouvés, bâtiments secrets et combos découverts ----------
  function collection() {
    var P = G.lire(), C = M.C; vider(true);
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
    vider(true); box.appendChild(bouton("← Retour", "btn m-sec", accueil));
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
    if (!window.LB || !LB.uid) {
      ajout(d, h("strong", null, "🏅 Ligues de la semaine"), h("small", null, "Les ligues ont besoin d’une connexion Internet : les meilleurs maires montent de ligue chaque lundi."));
      zone.appendChild(d); return;
    }
    var L = G.ligue(LB.docs || [], LB.uid);
    envoyerLigue();
    ajout(d, ajout(h("div", "m-jt"), h("strong", null, L.ico + " Ligue " + L.nom), h("b", null, L.rang + "e / " + L.total)),
      h("small", null, "Ton XP cette semaine : " + L.xp + " · fin dans " + L.finDans + " jour" + (L.finDans > 1 ? "s" : "") + " · les 20 % du haut montent, les 20 % du bas descendent."));
    if (L.avant && L.avant.nouveau !== L.avant.tier) d.appendChild(h("p", "m-ligue-msg", L.avant.nouveau > L.avant.tier ? "⬆️ Promotion ! Te voilà en ligue " + G.LIGUES[L.avant.nouveau].nom + "." : "⬇️ Descente en ligue " + G.LIGUES[L.avant.nouveau].nom + " : à toi de remonter !"));
    var o = h("ol", "m-ligue-l");
    L.membres.slice(0, 10).forEach(function (m, k) { var li = h("li", m.moi ? "me" : ""); ajout(li, h("span", null, (k + 1) + ". " + (m.moi ? nomJoueur() + " (toi)" : m.nom)), h("b", null, m.xp + " XP")); o.appendChild(li); });
    if (L.rang > 10) { var li = h("li", "me"); ajout(li, h("span", null, L.rang + ". " + nomJoueur() + " (toi)"), h("b", null, L.xp + " XP")); o.appendChild(li); }
    d.appendChild(o); zone.appendChild(d);
  }
  var ligueEnvoyee = null;
  function envoyerLigue() {
    if (!window.LB || !LB.db || !LB.uid) return;
    var x = G.donneesLigue(), cle = x.lgw + ":" + x.lgx + ":" + x.lg; if (ligueEnvoyee === cle) return;
    var ref = LB.db.doc("scores/" + LB.uid);
    ref.get().then(function (sn) {
      var dd = sn.exists ? sn.data() : {}, m = Object.assign({}, dd.s || {});
      if (m.lgw === x.lgw && m.lgx === x.lgx && m.lg === x.lg) { ligueEnvoyee = cle; return; }
      m.lgw = x.lgw; m.lgx = x.lgx; m.lg = x.lg;
      return ref.set({ name: nomJoueur(), s: m, at: Date.now() }).then(function () { ligueEnvoyee = cle; });
    }).catch(function () {});
  }

  // ---------- Pass de combat ----------
  // ---------- Les sessions en cours : nom d'auteur, joueurs présents, niveau moyen, rejoindre ----------
  var VOULUE = null;
  function quitterSession() {
    if (!SES.id) return;
    window.SessionLigne.quitter(SES.id);
    if (SES.stop) SES.stop(); if (SES.timer) clearInterval(SES.timer);
    SES.id = null; SES.s = null; SES.stop = null; SES.timer = null; SES.dedans = false;
  }
  function ecranSessions(depuisJeu) {
    fermerModale(); vider(true); fondMenu(true);
    var retour = depuisJeu ? function () { fondMenu(false); jeu(); } : accueil;
    box.appendChild(bouton("← Retour", "btn m-sec", retour));
    box.appendChild(h("h5", null, "🏛️ Rejoindre une session"));
    box.appendChild(h("p", "m-aide", "Chaque session porte le nom d’un auteur. Tu y entres maire du plus petit arrondissement libre. On ne peut plus entrer à moins de 3 minutes d’une élection. Une session sans joueur disparaît, sauf Victor Hugo, ouverte en permanence."));
    var zone = h("div", "mx-sessions", ""); zone.appendChild(h("p", "m-aide", "⏳ Chargement des sessions…")); box.appendChild(zone); haut();
    window.SessionLigne.liste().then(function (l) {
      if (!document.body.contains(zone)) return;
      zone.innerHTML = "";
      if (!l) { zone.appendChild(h("p", "m-aide", "📡 Connecte-toi à Internet pour voir les sessions en cours.")); return; }
      var now = Date.now(), moi = moiSes(), partie = st && st.phase !== "fin" || (lireSauvegarde() || {}).phase && lireSauvegarde().phase !== "fin";
      l.forEach(function (x) {
        var ici = x.id === SES.id || x.uids.indexOf(moi) >= 0, reste = x.joueurs ? Math.max(0, x.prochaine - now) : 0;
        var c = h("div", "mx-sescarte" + (x.id === SS().BASE_ID ? " mx-sesbase" : "") + (ici ? " mx-sesici" : ""));
        var info = ajout(h("div"), h("strong", null, "📚 " + x.nom), x.id === SS().BASE_ID ? h("em", "mx-sesbadge", "⭐ Session de base") : null,
          h("small", null, "👥 " + x.joueurs + " joueur" + (x.joueurs > 1 ? "s" : "") + " · 🤖 " + x.bots + " bot" + (x.bots > 1 ? "s" : "") + " · ⭐ niveau moyen " + (x.niv || "—") + (x.joueurs ? " · 🗳️ élection dans " + Math.ceil(reste / 60000) + " min" : "")));
        var b;
        if (ici) b = bouton("✔ Tu y es", "btn mx-sesici-b", depuisJeu || !partie ? retour : reprise);
        else if (x.pleine) { b = bouton("Complète", "btn m-sec mx-sesoff"); b.disabled = true; }
        else if (!x.ouvre) { b = bouton("🗳️ Élection imminente", "btn m-sec mx-sesoff"); b.disabled = true; }
        else b = bouton("Rejoindre", "btn mx-sesgo", function () {
          quitterSession(); VOULUE = x.id; SES.afk = false;
          if (depuisJeu) { fondMenu(false); jeu(); } else if (partie) reprise(); else creation();
        });
        ajout(c, info, b); zone.appendChild(c);
      });
    });
  }
  function ecranPass() {
    var ps = G.paliersMois(); vider(true);
    box.appendChild(bouton("← Retour", "btn m-sec", accueil));
    box.appendChild(h("h5", null, "🎟️ Les 20 paliers de " + ps.nom));
    box.appendChild(h("p", "m-aide", "Chaque objectif atteint ce mois-ci débloque un bâtiment exclusif, pour toutes tes parties du mois. Les compteurs s’additionnent d’une partie à l’autre. Tout repart à zéro le 1er du mois prochain."));
    var u = h("ol", "m-paliers");
    ps.paliers.forEach(function (x) {
      var li = h("li", x.ok ? "m-ok" : "");
      ajout(li, h("span", "m-pn", String(x.n)), ajout(h("span", "m-pal"), h("b", null, x.txt), h("small", null, "🎁 " + x.batTxt)), h("b", null, x.ok ? "✔" : x.cur + "/" + x.but));
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
    dj.forEach(function (x) { var li = h("li", x.fait ? "m-qok" : ""); ajout(li, h("span", null, (x.fait ? "✔ " : "") + x.t), h("b", null, "+" + x.xp + " XP")); uj.appendChild(li); });
    ajout(sj, uj, h("small", null, "Se valident dans n’importe quelle partie aujourd’hui."));
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
    if (!window.LB || !LB.db || !LB.uid) return;
    var ref = LB.db.doc("scores/" + LB.uid);
    ref.get().then(function (sn) {
      var dd = sn.exists ? sn.data() : {}, m = Object.assign({}, dd.s || {});
      if (m.mairedj === j && m.maired >= score) return;
      m.mairedj = j; m.maired = score;
      return ref.set({ name: nomJoueur(), s: m, at: Date.now() });
    }).catch(function () {});
  }
  function lancerDefi(d) {
    choixNiveau(d.niveau, true);
    vider(); box.appendChild(h("p", "msg", "Préparation du défi…"));
    chargerLots(d.lots).then(function () {
      st = M.nouvellePartie({ ligne: d.ligne, ambitions: d.ambitions, lots: d.lots, niveau: d.niveau, graine: d.graine, nivJoueur: d.nivJoueur, xpJoueur: G.lire().xp, pid: Date.now().toString(36), scenario: d.scenario, secrets: {}, passBats: G.batsExclusifs(), missions: false });
      st.defi = d.jour; sauver(); demarrerPartie();
    }).catch(function (e) { if (e && e.reseau) erreurReseau(function () { lancerDefi(d); }, e); else { toast("⚠️ " + (e && e.message || e)); accueil(); } });
  }
  function succes() {
    var P = G.lire(); vider(true);
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
    vider();
    box.appendChild(h("p", "m-nivtxt", "La difficulté monte à chaque mandat : le premier est indulgent, les suivants de plus en plus exigeants."));
    // Le personnage remplace la ligne politique : chacun a la sienne, un avantage et un défaut
    box.appendChild(h("p", "m-etape", "Ta compétence de maire"));
    var lg = h("div", "mx-maires");
    liste.forEach(function (x) {
      var b = bouton("", "mx-maire" + (x.dispo ? "" : " mx-verrouille"), function () {
        if (!x.dispo) return toast("🔒 " + x.cond);
        CHOIX.maire = x.id; Array.prototype.forEach.call(lg.children, function (y) { y.setAttribute("aria-pressed", y.dataset.id === x.id); }); maj();
      });
      b.dataset.id = x.id; b.setAttribute("aria-pressed", x.id === CHOIX.maire);
      var prom = x.promesses.map(function (k) { return M.ICO[k] + " " + M.PILIERS[k]; }).join(" · ");
      ajout(b, h("span", "mx-mico", x.dispo ? x.ico : "🔒"), ajout(h("div"), h("strong", null, x.nom + (m.ligne ? " · " + M.LIGNES[x.ligne].nom : "")),
        x.slogan ? h("em", "mx-slogan", x.slogan) : null, m.promesses && prom ? h("small", "mx-prom-maire", "🎯 Promesses : " + prom) : null, h("small", null, x.dispo ? x.txt : "🔒 " + x.cond)));
      lg.appendChild(b);
    });
    box.appendChild(lg);
    // Bonus gagnés dans le pass de combat : on choisit ceux à utiliser pour cette partie
    if (sacOk.length) {
      box.appendChild(h("p", "m-etape", "🎒 Tes bonus (facultatif)"));
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
      var ok = !!CHOIX.maire;
      go.disabled = !ok;
      msg.textContent = !CHOIX.maire ? "Choisis ta compétence de maire." : "";
    }
    maj();
  }
  function demarrer() {
    quetes().catch(function () {});
    vider(); box.appendChild(h("p", "msg", "Installation à la mairie…"));
    index().then(function () { var l = choisirLots(); return chargerLots(l).then(function () { return l; }); }).then(function (lots) {
      try { localStorage.setItem("maire_perso", CHOIX.maire); } catch (e) {}
      st = M.nouvellePartie({ maire: CHOIX.maire, ligne: "centre", ambitions: CHOIX.amb, lots: lots, niveau: niveau, xpJoueur: G.lire().xp, niveauPartie: true, pid: Date.now().toString(36), secrets: G.lire().secrets, sansLimite: sansLimiteAdmin(), missions: false,
        passBats: G.batsExclusifs(), bonus: G.utiliserSac(CHOIX.sac) });
      SES.jetons = 0; garderReserve();   // nouvelle partie : toujours 0 dossier en réserve
      sauver(); demarrerPartie();
    }).catch(function (e) { if (e && e.reseau) erreurReseau(succes, e); else { toast("⚠️ " + (e && e.message || e)); accueil(); } });
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
    }).catch(echec(reprise));
  }

  // Tirage du mandat : l'opposant (s'il est débloqué), puis la crise et les trois objectifs

  // ---------- Ouverture du mandat, en trois écrans ----------
  // 1. les 3 objectifs se retournent un par un (comme un opening de cartes)
  // 2. une roulette tire la crise, puis, sur le même écran, l'opposant
  // 3. le résumé, et on entre en fonctions
  function roulette() { ouvertureObjectifs(); }
  function calme() { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function scene(sur, titre) {
    vider(); fermerModale();
    var d = h("div", "mx-scene"); ajout(d, h("p", "m-sur", sur), h("h4", "mx-scene-t", titre)); box.appendChild(d); haut();
    return d;
  }
  function ouvertureObjectifs() {
    brancherSession();
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
  function ouvertureTirage(attente) {
    // En session, on attend (au plus 4 s) de connaître sa place pour présenter son vrai rival et son vrai opposant
    if (window.SessionLigne && !st.scenario && !SES.s && (attente || 0) < 8) return setTimeout(function () { ouvertureTirage((attente || 0) + 1); }, 500);
    var ses = !!(st.session && SES.s);
    var cr = M.criseEnCours(st), o = !ses && st.meca.opposant && st.opposant ? M.opposant(st) : null;
    if (!cr && !o && !ses) return ouvertureResume();
    var d = scene("Le tirage", cr ? "Quelle crise frappe " + (ses ? "ton arrondissement" : "Paris") + " ?" : ses ? "Ta place dans Paris" : "Qui sera ton opposant ?");
    var bas = bouton("Voir le résumé →", "btn m-go mx-cache", ouvertureResume);
    function opp() {
      if (ses) {
        var se = st.session;
        d.insertBefore(ajout(h("div", "mx-resume mx-entre"),
          ajout(h("div", "mx-oppres"), h("span", null, "🏛️"), ajout(h("div"), h("strong", null, "Tu es " + se.titre), h("small", null, "Place " + (SS().NB - se.place) + " sur " + SS().NB + " : gagne tes élections pour monter jusqu’au trône de Maire de Paris."))),
          se.rival ? ajout(h("div", "mx-oppres"), h("span", null, se.rival.ico), ajout(h("div"), h("strong", null, "⚔️ Ton rival : " + se.rival.nom + (se.rival.type === "bot" ? " 🤖" : "")), h("small", null, se.rival.titre + " · bats-le à l’élection pour prendre sa place"))) : null,
          se.opp ? ajout(h("div", "mx-oppres"), h("span", null, se.opp.ico), ajout(h("div"), h("strong", null, "🛡️ Ton opposant : " + se.opp.nom + (se.opp.type === "bot" ? " 🤖" : "")), h("small", null, se.opp.titre + " · il t’attaquera pour prendre ta place"))) : h("small", "m-aide", "Personne en dessous de toi : aucun opposant ne t’attaque pour l’instant.")), bas);
        return setTimeout(function () { bas.classList.remove("mx-cache"); }, calme() ? 0 : 600);
      }
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

  // ===================== Session : 21 places, du 1er arrondissement au trône de Maire de Paris =====================
  var SES = { id: null, s: null, stop: null, enCours: false, tick: 0, temps: 0, jetons: 0, elire: 0, timer: null, place: -1, vue: null };
  // Rythme réglable dans l'administration (reglages.js) ; la « vitesse de test » n'accélère que l'appareil de l'admin
  function RG() { return window.MaireReglages; }
  function trimMs() { return RG().v.saisonSec * 1000 / RG().vitesse(); }      // une saison passe toutes les X s
  function dossierMs() { return RG().v.dossierSec * 1000 / RG().vitesse(); }  // un nouveau dossier arrive toutes les X s
  // Réserve de trimestres : on les joue quand on veut, mais pas plus vite que le temps réel
  // Réserve de dossiers : les dossiers tombent pour TOUTE la session en même temps (toutes les X s depuis le début
  // de la session), pas selon l'heure d'arrivée du joueur. Une nouvelle partie commence toujours avec 0 dossier,
  // et pendant qu'on est absent la réserve ne se remplit pas.
  function prochainDossier(now) {
    var D = dossierMs(), d0 = SES.s && SES.s.debut ? SES.s.debut : now;
    return d0 + (Math.floor((now - d0) / D) + 1) * D;
  }
  function lireReserve() {
    SES.jetons = 0; SES.tick = null;
    try { var r = JSON.parse(localStorage.getItem("maire_reserve") || "null"); if (r && r.id === SES.id && r.pid === (st && st.pid)) SES.jetons = Math.min(r.jetons || 0, RG().v.reserveMax); } catch (e) {}
    garderReserve();
  }
  function garderReserve() { try { localStorage.setItem("maire_reserve", JSON.stringify({ id: SES.id, pid: st && st.pid, jetons: SES.jetons })); } catch (e) {} }
  function rechargerReserve(now) {
    if (!SES.s) return;                                   // l'horaire de la session n'est pas encore connu
    if (SES.tick == null) SES.tick = prochainDossier(now);
    var n = 0;
    while (now >= SES.tick) { if (SES.jetons < RG().v.reserveMax) { SES.jetons++; n++; } SES.tick = prochainDossier(SES.tick); }
    if (n) {
      garderReserve();
      // Nouveau dossier disponible : le bouton fait un petit saut doré
      var b = document.querySelector(".m-barmois .btn.mx-auto");
      if (b) { b.classList.remove("mx-nouveau"); void b.offsetWidth; b.classList.add("mx-nouveau"); }
    }
  }
  function autoTrim() { try { return localStorage.getItem("maire_trim_auto") === "1"; } catch (e) { return false; } }
  function jouerTrimestre() {
    if (SES.jetons < 1) return toast("⏳ Prochain dossier dans " + mmss(Math.max(1000, (SES.tick || prochainDossier(Date.now())) - Date.now())) + ".");
    var s2 = M.dossierSession(st, BASE); if (s2 === st) return;
    SES.jetons--; garderReserve(); st = s2; sauver(); jeu();
  }
  // ---------- Outils de test (boutons de l'admin, onglet « Réglages du jeu ») : agissent sur la partie ouverte ----------
  window.MaireTest = {
    pret: function () { return !!st && st.phase !== "fin"; },
    argent: function (n) { if (!st) return; st.tresor += n; sauver(); jeu(); },
    niveaux: function (n) { if (!st || !st.np) return; M.points(st, Math.max(1, M.ptsPour(Math.min(50, st.nivJ + n)) - (st.pxp || 0))); sauver(); jeu(); },
    reserve: function () { if (!SES.id) return; SES.jetons = RG().v.reserveMax; garderReserve(); jeu(); },
    election: function () { if (SES.id) window.SessionLigne.modifier(SES.id, function (s) { s = JSON.parse(JSON.stringify(s)); s.prochaine = Date.now(); return s; }); }
  };
  function SS() { return window.MaireSession; }
  function moiSes() { return window.SessionLigne ? window.SessionLigne.moi() : "local"; }
  function infoSession(s) {
    var p = SS().placeDe(s, moiSes()), f = function (q) { var x = SS().fiche(s, q); return { nom: x.nom, ico: x.ico, type: x.type, titre: x.titre, court: x.court }; };
    return { id: SES.id, place: p, titre: SS().titre(p), hab0: SS().habitants(p), puissance: SS().puissance(p), election: s.election, rival: p < SS().TRONE ? f(p + 1) : null, opp: p > 0 ? f(p - 1) : null };
  }
  // Anti-AFK : le dernier geste du joueur (toucher, clic, touche) ; 15 minutes sans rien faire et on quitte la session
  var ACTIF = Date.now();
  ["pointerdown", "keydown"].forEach(function (t) { document.addEventListener(t, function () { ACTIF = Date.now(); }, true); });
  function etatSes() { var e = M.etatSession(st); e.actif = ACTIF; e.note = SS().note(e); return e; }
  function sortieAFK(parServeur) {
    if (!SES.id) return;
    if (!parServeur) window.SessionLigne.quitter(SES.id);
    if (SES.stop) SES.stop(); if (SES.timer) clearInterval(SES.timer);
    SES.id = null; SES.s = null; SES.stop = null; SES.timer = null; SES.dedans = false; SES.afk = true;
    cacherBulle(); var v = document.getElementById("m-afk"); if (v) v.remove();
    var f = h("div", "m-pop"); f.id = "m-afk"; f.setAttribute("role", "dialog");
    var c = ajout(h("div", "m-pop-in m-afk"), h("span", "m-afk-ico", "💤"), h("h4", null, "Tu as quitté la session"),
      h("p", null, "15 minutes sans rien faire : ta place a été laissée à un maire robot."));
    c.appendChild(bouton("🏛️ Rejoindre une session", "btn m-go", function () { f.remove(); ACTIF = Date.now(); SES.afk = false; brancherSession(); }));
    f.appendChild(c); document.body.appendChild(f);
  }
  function brancherSession() {
    if (SES.id || SES.enCours || SES.afk || !window.SessionLigne || !SS() || !st || st.phase === "fin" || st.scenario) return;
    SES.enCours = true; ACTIF = Date.now();
    var v = VOULUE; VOULUE = null;
    window.SessionLigne.rejoindre(v).then(function (r) {
      SES.enCours = false;
      if (!r && v) { toast("🚪 Impossible d’entrer dans cette session (élection imminente ou complète)."); return brancherSession(); }
      if (!r) return;
      SES.id = r.id; lireReserve(); SES.temps = Date.now() + trimMs();
      SES.stop = window.SessionLigne.ecouter(r.id, recuSession);
      if (!SES.timer) SES.timer = setInterval(horloge, 1000);
    });
  }
  // Nouvelle version de la session : élection passée ? nouvelle place ? noms du rival et de l'opposant
  function recuSession(s) {
    SES.s = s;
    // Retiré par le serveur (inactif depuis 15 min) : on le dit au joueur
    if (SS().placeDe(s, moiSes()) < 0) { if (SES.dedans) sortieAFK(true); return; }
    SES.dedans = true;
    if (!st || st.phase === "fin") return;
    surveillerAttaques(s);
    var r = SS().resultatDe(s, moiSes()), avant = st.session ? st.session.place : -1, elu = null;
    if (r && st.session && s.election > (st.session.election || 0) && st.session.dernElec !== s.election) {
      st = M.electionSession(st, { election: s.election, avant: r.avant, apres: r.apres, titre: SS().titre(r.apres), rival: r.duel ? SS().fiche(s, r.duel.bas === r.avant ? r.duel.haut : r.duel.bas).nom : "" });
      elu = r;
      // Statistiques : contre qui on a gagné ou perdu (un bot, ou un joueur et sa compétence)
      if (r.duel) {
        var advP = r.apres === r.duel.bas ? r.duel.haut : r.duel.bas, adv = SS().fiche(s, advP), etaitBas = r.avant === r.duel.bas;
        var gagne = etaitBas ? r.duel.monte : !r.duel.monte, cle = adv.type === "bot" ? "bot" : (adv.stats && adv.stats.maire) || "sans";
        st.duels = st.duels || {}; var dd = st.duels[cle] || (st.duels[cle] = { g: 0, p: 0 }); if (gagne) dd.g++; else dd.p++;
      }
    }
    var info = infoSession(s), change = !st.session || st.session.place !== info.place || st.session.election !== info.election || !st.session.rival || (info.rival && st.session.rival.nom !== info.rival.nom);
    st = M.placer(st, info); sauver();
    if (elu) annonceElection(elu, s);
    if (change && document.getElementById("m-app") && st.phase !== "fin") { if (!document.getElementById("m-modale")) jeu(); }
    else majSession();
  }
  // Chaque seconde : comptes à rebours, recharge de la réserve, mode auto, élection quand l'heure est venue
  function horloge() {
    if (!st || !SES.id || !SES.s || st.phase === "fin") return;
    var visible = document.getElementById("m-app") && !document.hidden && !document.getElementById("site").hidden && !document.getElementById("jeux").hidden;
    var now = Date.now();
    if (now - ACTIF > SS().AFK_MS) return sortieAFK(false);
    if (visible && SS().electionDue(SES.s, now) && now - SES.elire > 5000) { SES.elire = now; window.SessionLigne.elire(SES.id); }
    var libre = visible && (st.phase === "gestion" || st.phase === "pret") && !document.getElementById("m-modale") && !document.getElementById("m-telmod") && !document.body.classList.contains("m-casino") && !(st.enchere && !st.enchere.fini) && !(st.bj && !st.bj.fini);
    rechargerReserve(now);
    if (recupererVentes() && libre) return jeu();
    // Le temps passe tout seul (saisons, recettes, dépenses), même pendant un dossier ; seulement quand le jeu est à l'écran
    if (!visible) SES.temps = Math.max(SES.temps, now + 2000);
    else if (now >= SES.temps) { SES.temps = now + trimMs(); return trimestreSuivant(libre); }
    if (libre && autoTrim() && SES.jetons > 0) return jouerTrimestre();
    majSession();
  }
  function trimestreSuivant(libre) {
    var t0 = st.t, s2 = M.avancerSession(st, BASE);
    if (s2 === st) return;
    st = s2; sauver(); signal("trimestre");
    // Pas de grande fenêtre : on redessine seulement si rien n'est ouvert (dossier, casino, téléphone)
    if (libre || st.phase === "fin") jeu(); else majSession();
    if (st.t > t0 && st.phase !== "fin") messageSaison(t0);
    if (SES.id) {
      window.SessionLigne.signaler(SES.id, etatSes());
    }
  }
  // Petit message en haut de l'écran à chaque saison : la saison et ce que l'arrondissement a gagné ou perdu
  function messageSaison() {
    var sa = SAISONS[(st.t - 1) % 4], r = st.rapport, net = r ? r.solde : 0, v = document.querySelector(".m-saison-msg"); if (v) v.remove();
    var m = ajout(h("div", "m-saison-msg"), h("span", null, sa[0]), h("b", null, sa[1] + " · an " + (Math.floor((st.t - 1) / 4) + 1)), r ? h("em", net >= 0 ? "m-plus" : "m-moins", (net >= 0 ? "+" : "−") + argent(Math.abs(net))) : null);
    (document.getElementById("g-maire") || document.body).appendChild(m);
    setTimeout(function () { m.classList.add("m-saison-out"); }, 2600); setTimeout(function () { m.remove(); }, 3200);
  }
  function mmss(ms) { ms = Math.max(0, ms); var m = Math.floor(ms / 60000), sec = Math.floor(ms % 60000 / 1000); return m + ":" + (sec < 10 ? "0" : "") + sec; }
  // Met à jour les comptes à rebours sans tout redessiner
  function majSession() {
    if (!SES.s) return;
    var e = document.querySelector(".mx-ses-elec"); if (e) e.textContent = "🗳️ " + mmss(SES.s.prochaine - Date.now());
    var v = document.querySelector(".mx-ses-votes"); if (v) v.textContent = SS().nbVotes(SES.s) + "/" + SS().votesRequis(SES.s) + " vote" + (SS().votesRequis(SES.s) > 1 ? "s" : "");
    var b = document.querySelector(".m-barmois .btn.mx-auto");
    if (b) remplirTrim(b);
    majVentes();
    var mx = document.querySelector(".mx-ses-malus");
    if (mx && st.session) { var p = st.session.place, mm = SS().malusDe(SES.s, p), mr = p < SS().TRONE ? SS().malusDe(SES.s, p + 1) : 0, sh = (SES.s.boucliers || {})[moiSes()];
      mx.textContent = [mm ? "⚔️ Tu as perdu " + mm + " pts dans les sondages" : "", mr ? "🎯 Ton rival : −" + mr + " pts" : "", sh ? "🛡️ Bouclier actif" : ""].filter(Boolean).join(" · "); }
  }
  // Bandeau de session : ton titre, ta place, le compte à rebours, ton rival et ton opposant
  function bandeauSession() {
    if (!st.session || !SES.s) return null;
    var p = st.session.place, d = h("div", "mx-session" + (p >= SS().TRONE ? " mx-trone" : ""));
    var titre = ajout(h("div", "mx-ses-titre"), h("span", null, p >= SS().TRONE ? "👑" : "🏛️"), ajout(h("div"), h("strong", null, st.session.titre), h("small", null, "📚 " + (SES.s.nom || "Victor Hugo") + " · place " + (SS().NB - p) + " sur " + SS().NB + " · puissance ×" + virg(st.session.puissance))));
    var duo = h("div", "mx-ses-duo");
    if (st.session.rival) duo.appendChild(ajout(bouton("", "mx-ses-qui mx-ses-rival", function () { ficheSession(p + 1); }), h("small", null, "⚔️ Rival · au-dessus"), h("b", null, st.session.rival.ico + " " + st.session.rival.nom + (st.session.rival.type === "bot" ? " 🤖" : "")), h("small", null, st.session.rival.court)));
    else duo.appendChild(ajout(h("div", "mx-ses-qui"), h("small", null, "👑 Tu es au sommet"), h("b", null, "Garde ton trône !")));
    if (st.session.opp) duo.appendChild(ajout(bouton("", "mx-ses-qui mx-ses-opp", function () { ficheSession(p - 1); }), h("small", null, "🛡️ Opposant · au-dessous"), h("b", null, st.session.opp.ico + " " + st.session.opp.nom + (st.session.opp.type === "bot" ? " 🤖" : "")), h("small", null, st.session.opp.court)));
    else duo.appendChild(ajout(h("div", "mx-ses-qui"), h("small", null, "🛡️ Personne en dessous"), h("b", null, "Pas d’opposant")));
    var actions = ajout(h("div", "mx-ses-actions"), verrouMeca("attaques", bouton("⚔️ Attaquer", "mx-ses-act mx-ses-attaque", salleGuerre)), verrouMeca("encheres", bouton("🔨 Enchères", "mx-ses-act", allerEncheres)), bouton("🏆 Classement", "mx-ses-act mx-ses-btn", classementSession));
    ajout(d, titre, duo, actions, h("small", "mx-ses-malus", ""));
    setTimeout(majSession, 0);
    return d;
  }
  // ===================== Salle de guerre : attaquer son rival ou son opposant =====================
  var CIBLE = "rival";
  function salleGuerre() {
    if (!SES.s || !st.session) return;
    var m = h("div", "m-pop mx-fichepop mx-guerrepop"), c = h("div", "mx-fiche mx-guerre");
    function fermer() { m.remove(); document.body.classList.remove("m-modal"); clearInterval(tm); }
    m.onclick = function (e) { if (e.target === m) fermer(); };
    function rendre() {
      var s = SES.s, p = st.session.place, moi = moiSes(), S = SS();
      if (CIBLE === "rival" && p >= S.TRONE) CIBLE = "opp"; if (CIBLE === "opp" && p <= 0) CIBLE = "rival";
      var cible = CIBLE === "rival" ? p + 1 : p - 1, f = S.fiche(s, cible), now = Date.now();
      c.textContent = "";
      ajout(c, ajout(h("div", "m-tel-tete"), h("strong", null, "⚔️ Salle de guerre"), bouton("✕", "m-leonx", fermer)));
      c.appendChild(h("p", "mx-ftxt", "Fais baisser le sondage d’un adversaire avant l’élection. Les points perdus comptent jusqu’au prochain vote."));
      var choixC = h("div", "mx-cibles");
      [["rival", p + 1, "⚔️ Rival"], ["opp", p - 1, "🛡️ Opposant"]].forEach(function (x) {
        if (x[1] < 0 || x[1] >= S.NB) return;
        var fx = S.fiche(s, x[1]), b = bouton("", "mx-cible" + (CIBLE === x[0] ? " mx-on" : ""), function () { CIBLE = x[0]; rendre(); });
        ajout(b, h("small", null, x[2]), h("b", null, fx.ico + " " + fx.nom), h("small", null, fx.court + " · sondage " + Math.round(S.scores(s, now)[x[1]]) + (S.malusDe(s, x[1]) ? " (−" + S.malusDe(s, x[1]) + ")" : "")));
        choixC.appendChild(b);
      });
      c.appendChild(choixC);
      var l = h("div", "mx-attaques");
      Object.keys(S.ATTAQUES).forEach(function (k) {
        var A = S.ATTAQUES[k], px = S.prixAction(A.cout, p), att = S.attente(s, moi + ":" + k, now), cher = px > st.tresor;
        var b = bouton("", "mx-attaque", function () { lancerAttaque(cible, k, f); });
        b.disabled = !!att || cher;
        ajout(b, h("span", "mx-att-ico", A.ico), ajout(h("span", "mx-att-txt"), h("b", null, A.nom), h("small", null, A.txt)),
          h("em", "mx-att-prix", att ? "⏳ " + mmss(att) : cher ? "💸 " + argent(px) : px ? argent(px) : "Gratuit"));
        l.appendChild(b);
      });
      c.appendChild(l);
      var B = S.BOUCLIER, pxB = S.prixAction(B.cout, p), attB = S.attente(s, moi + ":bouclier", now), actif = (s.boucliers || {})[moi];
      var bb = bouton("", "mx-attaque mx-bouclier" + (actif ? " mx-on" : ""), function () {
        st = M.payer(st, pxB, B.ico + " " + B.nom); sauver();
        window.SessionLigne.proteger(SES.id).then(function () { toast("🛡️ Ton service de communication veille."); jeu(); rendre(); });
      });
      bb.disabled = !!actif || !!attB || pxB > st.tresor;
      ajout(bb, h("span", "mx-att-ico", B.ico), ajout(h("span", "mx-att-txt"), h("b", null, B.nom), h("small", null, B.txt)), h("em", "mx-att-prix", actif ? "✔ Actif" : attB ? "⏳ " + mmss(attB) : argent(pxB)));
      c.appendChild(bb);
      var j = (s.journal || []).slice().reverse().filter(function (e) { return e.type !== "bouclier"; }).slice(0, 6);
      if (j.length) { var u = h("ul", "mx-journal-att"); j.forEach(function (e) { u.appendChild(h("li", null, ligneAttaque(e))); }); ajout(c, h("h5", null, "📰 Dernières attaques"), u); }
    }
    var tm = setInterval(function () { if (!document.body.contains(m)) return clearInterval(tm); rendre(); }, 1000);
    rendre(); m.appendChild(c); (document.getElementById("g-maire") || document.body).appendChild(m); document.body.classList.add("m-modal");
  }
  function ligneAttaque(e) {
    var A = SS().ATTAQUES[e.type] || { ico: "⚔️", nom: "Attaque" }, de = e.de.uid === moiSes() ? "Toi" : e.de.ico + " " + e.de.nom + " (" + e.de.court + ")", vers = e.vers.uid === moiSes() ? "toi" : e.vers.nom + " (" + e.vers.court + ")";
    var r = e.res === "bloque" ? "arrêtée par un bouclier 🛡️" : e.res === "rate" ? "se retourne contre l’attaquant (−" + e.pts + ")" : e.res === "perdu" ? "débat perdu par l’attaquant (−3)" : "−" + e.pts + " pts";
    return A.ico + " " + de + " → " + vers + " : " + A.nom.toLowerCase() + ", " + r;
  }
  function lancerAttaque(cible, type, f) {
    var A = SS().ATTAQUES[type], px = SS().prixAction(A.cout, st.session.place);
    if (px > st.tresor) return toast("💸 Pas assez d’argent.");
    var n0 = (SES.s.journal || []).length;
    window.SessionLigne.attaquer(SES.id, cible, type).then(function (s) {
      if (!s) return toast("📵 Attaque impossible pour l’instant.");
      var e = (s.journal || []).slice(-1)[0];
      if (!e || (s.journal || []).length === n0 && e.de.uid !== moiSes()) return toast("⏳ Pas encore prêt.");
      if (px) st = M.payer(st, px, A.ico + " " + A.nom + " contre " + f.court);
      if (e.res === "ok") { var sx = M.stats(st); sx.attaquesOk = (sx.attaquesOk || 0) + 1; M.points(st, 5); }
      sauver();
      SES.journalVu = Math.max(SES.journalVu || 0, e.q);
      flash(e.res === "ok" ? A.ico + " Touché ! −" + e.pts + " pts" : e.res === "bloque" ? "🛡️ Attaque bloquée" : "😬 Ça se retourne contre toi", e.res === "ok" ? "mx-flash-ok" : "mx-flash-ko");
      jeu();
    });
  }
  // Attaques reçues : un message quand un voisin t'attaque
  function surveillerAttaques(s) {
    var moi = moiSes(), j = s.journal || [];
    if (SES.journalVu == null) { SES.journalVu = j.length ? j[j.length - 1].q : 0; return; }
    j.forEach(function (e) {
      if (e.q <= SES.journalVu) return;
      if (e.vers && e.vers.uid === moi && e.de.uid !== moi) toast((e.res === "bloque" ? "🛡️ " : "⚔️ ") + e.de.nom + " (" + e.de.court + ") t’attaque : " + (SS().ATTAQUES[e.type] || {}).nom + (e.res === "bloque" ? " — bloquée !" : e.res === "ok" ? " (−" + e.pts + ")" : " — raté !"));
    });
    if (j.length) SES.journalVu = Math.max(SES.journalVu, j[j.length - 1].q);
  }

  // ===================== Salle des ventes : 3 ventes en même temps, arrondissement contre arrondissement =====================
  var CAT = null;
  function cat() { return CAT || (CAT = M.catalogueVentes()); }
  function ventesSession() {
    if (!st.session || !SES.s) return null;
    var d = h("div", "mx-ventes");
    ajout(d, ajout(h("div", "mx-ventes-tete"), h("h5", null, "🔨 Salle des ventes"), h("small", "mx-ventes-suiv", "Arrondissement contre arrondissement")));
    d.appendChild(h("div", "mx-ventes-liste"));
    d.appendChild(h("p", "mx-aide", "Une vente à la fois, pendant 6 minutes ; la suivante attend en gris. Tous les arrondissements de la session enchérissent."));
    setTimeout(majVentes, 0);
    return d;
  }
  function allerEncheres() {
    RAYON = "enchere"; gestionOuverte = true; jeu();
    setTimeout(function () { var v = document.querySelector(".mx-ventes") || document.querySelector(".mx-boutique"); if (v) v.scrollIntoView({ behavior: "smooth", block: "center" }); }, 50);
  }
  // La prochaine vente, en gris, avec le compte à rebours avant son ouverture
  function carteAttente(v) {
    var B = M.BATIMENTS[v.id], c = h("div", "mx-vente mx-vente-attente"); c.dataset.k = v.k;
    ajout(c, ajout(h("div", "mx-vente-haut"), icone(v.id, "mx-vente-ico"), ajout(h("div", "mx-vente-nom"), h("small", null, "Prochaine vente"), h("b", null, B.nom), h("small", null, "Valeur ≈ " + argent(v.cout) + " · départ " + argent(Math.round(v.cout * 0.5 / 5) * 5))), h("span", "mx-vente-temps", "")));
    c.querySelector(".mx-vente-nom").onclick = function () { fiche(v.id); };
    return c;
  }
  function carteVente(v) {
    var B = M.BATIMENTS[v.id], c = h("div", "mx-vente mx-vente-neuve"); c.dataset.k = v.k;
    setTimeout(function () { c.classList.remove("mx-vente-neuve"); }, 900);
    ajout(c, ajout(h("div", "mx-vente-haut"), icone(v.id, "mx-vente-ico"), ajout(h("div", "mx-vente-nom"), h("b", null, B.nom), h("small", null, "Valeur ≈ " + argent(v.cout) + (B.rev ? " · +" + B.rev + " M€/t" : ""))), h("span", "mx-vente-temps", "")),
      h("div", "mx-vente-badges"),
      ajout(h("div", "mx-vente-prix"), h("small", null, "Meilleure offre"), h("strong", "mx-vente-montant", ""), h("span", "mx-vente-meneur", "")),
      ajout(h("div", "mx-vente-btns"), bouton("", "btn m-go mx-vente-go", function () { offre(v.k, 1); }), bouton("", "btn m-sec mx-vente-go3", function () { offre(v.k, 3); })));
    c.querySelector(".mx-vente-nom").onclick = function () { fiche(v.id); };
    return c;
  }
  function majVentes() {
    var d = document.querySelector(".mx-ventes"); if (!d || !SES.s) return;
    var now = Date.now(), l = SS().ventesEnCours(SES.s, cat(), now), liste = d.querySelector(".mx-ventes-liste"), moi = moiSes(), budget = M.budgetEnchere(st);
    var pro = SS().prochaineVente(SES.s, cat(), now), cles = l.map(function (v) { return v.k; }).join(",") + "|" + pro.k;
    if (liste.dataset.k !== cles) { liste.textContent = ""; l.forEach(function (v) { liste.appendChild(carteVente(v)); }); liste.appendChild(carteAttente(pro)); liste.dataset.k = cles; }
    var ca = liste.querySelector(".mx-vente-attente .mx-vente-temps"); if (ca) ca.textContent = "⏳ " + mmss(pro.debut - now);
    l.forEach(function (v) {
      var c = liste.querySelector('[data-k="' + v.k + '"]'); if (!c) return;
      var toi = !v.meneur.bot && v.meneur.uid === moi, deja = !!st.bat[v.id];
      c.classList.toggle("mx-affaire", v.affaire); c.classList.toggle("mx-bientot", v.bientot); c.classList.toggle("mx-toi", toi);
      c.querySelector(".mx-vente-temps").textContent = "⏱️ " + mmss(v.fin - now);
      var badges = []; if (v.affaire) badges.push("🔥 Sous-évaluée"); if (v.bientot) badges.push("⏰ Finit bientôt"); if (toi) badges.push("🙋 Tu mènes");
      var bd = c.querySelector(".mx-vente-badges"), txt = badges.join(" · "); if (bd.dataset.t !== txt) { bd.dataset.t = txt; bd.textContent = ""; badges.forEach(function (x) { bd.appendChild(h("span", "mx-badge", x)); }); }
      var mt = c.querySelector(".mx-vente-montant"), ancien = mt.dataset.v;
      mt.textContent = argent(v.prix); mt.dataset.v = v.prix;
      if (ancien && +ancien !== v.prix) { mt.classList.remove("mx-flashprix"); void mt.offsetWidth; mt.classList.add("mx-flashprix"); }
      c.querySelector(".mx-vente-meneur").textContent = toi ? "🙋 Toi" : v.meneur.ico + " " + v.meneur.nom + " (" + v.meneur.court + ")" + (v.meneur.bot ? " 🤖" : "");
      var b1 = c.querySelector(".mx-vente-go"), b3 = c.querySelector(".mx-vente-go3"), m1 = v.prix + v.pas, m3 = v.prix + v.pas * 3;
      b1.textContent = deja ? "Déjà à toi" : toi ? "Tu mènes" : "🔨 " + argent(m1); b3.textContent = "+" + argent(v.pas * 3);
      b1.disabled = deja || toi || m1 > budget; b3.disabled = deja || toi || m3 > budget;
      // Dépassé : on prévient
      var avant = (SES.menees || {})[v.k];
      if (avant && !toi) toast("😤 " + v.meneur.nom + " (" + v.meneur.court + ") te passe devant : " + M.BATIMENTS[v.id].nom);
      (SES.menees = SES.menees || {})[v.k] = toi;
    });
  }
  function offre(k, n) {
    var v = SS().vente(SES.s, cat(), k, Date.now()); if (!v || v.fini) return;
    var m = v.prix + v.pas * n;
    if (m > M.budgetEnchere(st)) return toast("💸 Pas assez d’argent pour cette offre.");
    window.SessionLigne.encherir(SES.id, cat(), k, m).then(function (s) {
      if (!s) return toast("📵 Offre refusée : quelqu’un a été plus rapide.");
      var w = SS().vente(s, cat(), k, Date.now());
      if (w && !w.meneur.bot && w.meneur.uid === moiSes()) toast("🙋 Tu mènes : " + argent(w.prix));
      else if (w) toast("🤖 " + w.meneur.nom + " (" + w.meneur.court + ") surenchérit aussitôt : " + argent(w.prix));
      SES.s = s; majVentes();
    });
  }
  // Ventes terminées : le gagnant récupère son bâtiment (payé à ce moment-là)
  function recupererVentes() {
    if (!SES.s || !st.session || st.phase === "fin") return;
    var moi = moiSes(), gagne = false;
    SS().ventesFinies(SES.s, cat(), Date.now()).forEach(function (v) {
      var k = SES.id + ":" + v.k;
      if (v.meneur.bot || v.meneur.uid !== moi || (st.ventesPrises || {})[k]) return;
      st = M.gagnerVente(st, v.id, v.prix, k); gagne = true;
      flash("🔨 Adjugé ! " + M.BATIMENTS[v.id].ico + " " + M.BATIMENTS[v.id].nom, "mx-flash-ok");
    });
    if (gagne) { sauver(); return true; }
  }
  // Classement de la session : les 21 places, du trône au 1er arrondissement
  var FLECHE = { croissance: " 📈", declin: " 📉", stable: "" };
  function classementSession() {
    if (!SES.s) return;
    var s = SES.s, moiP = SS().placeDe(s, moiSes()), sc = SS().scores(s, Date.now());
    var pop = h("div", "m-pop m-pop-ses"); pop.id = "m-telmod"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
    var c = h("div", "m-pop-in"), a = h("article", "m-dossier m-ses-carte");
    ajout(a, ajout(h("div", "m-tel-tete"), h("strong", "m-tel-titre", "🏆 Classement de la session"), bouton("✕", "m-leonx", fermerTel)),
      h("p", "m-aide", "Chacun défie le maire juste au-dessus à chaque élection. Touche un maire pour comparer."));
    var l = h("ol", "m-ses-liste");
    for (var p = SS().NB - 1; p >= 0; p--) (function (p) {
      var f = SS().fiche(s, p), cls = "m-ses-l" + (p === moiP ? " m-moi" : p === moiP + 1 ? " m-rival" : p === moiP - 1 ? " m-opp" : "") + (p >= SS().TRONE ? " m-trone" : "");
      var b = bouton("", cls, function () { ficheSession(p); });
      ajout(b, h("span", "m-ses-rang", p >= SS().TRONE ? "👑" : String(SS().NB - p)), h("span", "m-ses-arr", f.court), ajout(h("span", "m-ses-nom"), document.createTextNode(f.ico + " " + f.nom), f.type === "bot" ? h("i", null, " 🤖" + FLECHE[f.stats.tendance]) : null),
        etoilesNote(p === moiP ? noteVille() : SS().note(f.stats)), h("b", "m-ses-sc", virg(Math.round(sc[p] * 10) / 10)));
      l.appendChild(ajout(h("li"), b));
    })(p);
    a.appendChild(l); c.appendChild(a); pop.appendChild(c); (document.getElementById("g-maire") || document.body).appendChild(pop);
    document.body.classList.add("m-modal"); pop.onclick = function (e) { if (e.target === pop) fermerTel(); };
  }
  // Fiche d'un maire : sa ville comparée à la tienne
  function ficheSession(p) {
    if (!SES.s) return;
    fermerTel();
    var s = SES.s, f = SS().fiche(s, p), moiP = SS().placeDe(s, moiSes()), m = M.etatSession(st), o = f.stats || {};
    var pop = h("div", "m-pop m-pop-ses"); pop.id = "m-telmod"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
    var c = h("div", "m-pop-in"), a = h("article", "m-dossier m-ses-carte");
    var rel = p === moiP ? "C’est toi" : p === moiP + 1 ? "⚔️ Ton rival : bats-le à l’élection pour prendre sa place" : p === moiP - 1 ? "🛡️ Ton opposant : il veut ta place" : p > moiP ? "Plus haut que toi (" + (p - moiP) + " place" + (p - moiP > 1 ? "s" : "") + ")" : "Plus bas que toi (" + (moiP - p) + " place" + (moiP - p > 1 ? "s" : "") + ")";
    ajout(a, ajout(h("div", "m-tel-tete"), h("strong", "m-tel-titre", f.ico + " " + f.nom + (f.type === "bot" ? " 🤖" : "")), bouton("✕", "m-leonx", fermerTel)),
      h("p", "m-ses-sous", f.titre + " · place " + (SS().NB - p) + "/" + SS().NB), h("p", "m-ses-rel", rel));
    function ligne(lib, a1, b1, mieux) { var r = h("div", "m-cmp" + (mieux == null ? "" : mieux ? " m-cmp-mieux" : " m-cmp-moins")); ajout(r, h("span", null, lib), h("b", null, a1), h("b", null, b1)); return r; }
    var t = h("div", "m-cmp-table");
    ajout(t, ajout(h("div", "m-cmp m-cmp-tete"), h("span"), h("b", null, "Toi"), h("b", null, p === moiP ? "—" : f.nom.split(" ")[0])));
    function n(x) { return x == null ? "?" : typeof x === "number" ? x.toLocaleString("fr-FR") : x; }
    var nMoi = SS().note(m), nLui = SS().note(o), ln = ligne("⭐ Note", "", "", p === moiP ? null : nMoi >= nLui);
    ln.children[1].appendChild(etoilesNote(nMoi)); if (p !== moiP) ln.children[2].appendChild(etoilesNote(nLui)); else ln.children[2].textContent = "—";
    t.appendChild(ln);
    [["🗳️ Score électoral", m.score, o.score], ["📣 Popularité", m.pop, o.pop], ["😊 Bonheur", m.bon, o.bon], ["👥 Habitants", m.hab, o.hab], ["🏗️ Bâtiments", m.bats, o.bats], ["⭐ Niveau", m.niv, o.niv]].forEach(function (x) {
      t.appendChild(ligne(x[0], n(x[1]), n(x[2]), p === moiP || x[2] == null ? null : x[1] >= x[2]));
    });
    a.appendChild(t);
    if (f.type === "bot") a.appendChild(h("p", "m-ses-tend m-tend-" + o.tendance, o.tendance === "croissance" ? "📈 En pleine croissance : son sondage grimpe pendant le mandat." : o.tendance === "declin" ? "📉 En déclin : son sondage baisse pendant le mandat. C’est le moment de l’attaquer !" : "➡️ Stable pour l’instant."));
    a.appendChild(h("small", "m-aide", f.type === "bot" ? "Les places libres sont tenues par des maires robots (🤖) : ils progressent ou déclinent d’une élection à l’autre, et les vrais joueurs les remplacent en arrivant." : "Un vrai joueur de ta session."));
    c.appendChild(a); pop.appendChild(c); (document.getElementById("g-maire") || document.body).appendChild(pop);
    document.body.classList.add("m-modal"); pop.onclick = function (e) { if (e.target === pop) fermerTel(); };
  }
  // Résultat d'une élection de session : grand écran animé
  function annonceElection(r, s) {
    var monte = r.apres > r.avant, descend = r.apres < r.avant, d = h("div", "m-flash m-flash-elec" + (monte ? " m-monte" : descend ? " m-descend" : ""));
    ajout(d, ajout(h("div", "m-flash-in"), h("span", "m-flash-ico", monte ? "🎉" : descend ? "📉" : "🗳️"), h("strong", null, monte ? "Élu plus haut !" : descend ? "Tu recules d’une place" : "Tu gardes ta place"),
      h("p", null, (monte ? "Te voilà " : "Tu es ") + SS().titre(r.apres) + "."), h("small", null, r.duel ? "Ton score " + virg(r.duel.bas === r.avant ? r.duel.sBas : r.duel.sHaut) + " contre " + virg(r.duel.bas === r.avant ? r.duel.sHaut : r.duel.sBas) : "")));
    document.body.appendChild(d); if (monte) confettis();
    d.onclick = function () { d.remove(); }; setTimeout(function () { d.classList.add("m-flash-fin"); setTimeout(function () { d.remove(); }, 600); }, 3800);
  }

  function jeu() {
    envoyerClassement();
    brancherSession();
    progresser();
    if (st.phase === "fin") return fin();
    if (st.phase === "election") return resultatElection();
    var y = window.scrollY; box.style.minHeight = box.offsetHeight + "px";
    decouvertes();
    vider();
    // Écran épuré : l'essentiel en haut (où j'en suis, est-ce que je gagne), la ville au milieu, la boutique, puis la gestion repliée
    ajout(box, entete(), bandeauSession(), tableau(), carteObjectifs(), piliers(), carteLeon());
    if (st.opposant) box.appendChild(bandeauOpp());
    if (st.rapport && st.notes && st.notes.length) box.appendChild(notes());
    if (st.chantiers.length) box.appendChild(chantiers());
    box.appendChild(carteVille(false));
    box.appendChild(boutique());
    box.appendChild(gestion());
    box.appendChild(barreTrimestre());
    box.style.minHeight = ""; window.scrollTo(0, y);
    // Une enchère restée en mémoire ne doit jamais bloquer le dossier : fenêtre disparue = on oublie l'affichage ; enchère finie + dossier = on la range
    if (ENCH && !document.getElementById("m-enchmod")) { if (ENCH.minuteur) clearInterval(ENCH.minuteur); ENCH = null; }
    if (st.enchere && st.enchere.fini && st.phase === "evenement") { st = M.fermerEnchere(st); sauver(); }
    if (st.enchere) return reprendreEnchere();
    if (MASQUE !== cleMasque()) modale();
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
    var nv = noteVille(), noteB = bouton("", "mx-notebtn", function () {
      var e = M.etatSession(st);
      toast("⭐ " + virg(nv) + "/5 · sondage " + Math.round(e.score) + " · bonheur " + e.bon + " · popularité " + e.pop + " · finances " + (e.tresor >= 0 ? "+" : "") + e.tresor);
    });
    ajout(noteB, etoilesNote(nv, true), h("b", null, virg(nv) + "/5")); noteB.title = "Note de ta ville (touche pour le détail)";
    gauche.appendChild(noteB);
    var vote = h("span", "mx-chip" + (st.anticipee ? " mx-anticipee" : ""), st.scenario ? "🎯 " + (st.scenario.fin - st.t) + " trim." : st.session && SES.s ? "🗳️ " + mmss(SES.s.prochaine - Date.now()) : "🗳️ " + reste + " trim.");
    if (st.session && SES.s) vote.classList.add("mx-ses-elec");
    vote.title = st.scenario ? "Fin du défi" : st.anticipee ? "Élections anticipées" : "Prochaine élection";
    ajout(d, ajout(h("div", "mx-ligne"), gauche, ajout(h("div", "mx-droite"), vote, telephone())));
    var p = h("div", "mx-prog"), pi = h("i"); pi.style.width = (M.trimMandat(st) / M.MANDAT * 100) + "%"; p.appendChild(pi); d.appendChild(p);
    d.appendChild(barreXP());
    return d;
  }
  // Niveau et XP en direct : la barre se remplit à chaque action, le prochain déblocage est annoncé
  var xpAffiche = null;

  // Niveau de partie (1 à 50)
  function nivPartie() {
    var p = st.pxp || 0, n = M.niveauPartie(p), a = M.ptsPour(n), b = n < M.NIV_MAX ? M.ptsPour(n + 1) : a;
    return { n: n, titre: "Niveau " + n + " sur " + M.NIV_MAX + " de la partie", xp: p, depuis: p - a, besoin: b - a, pct: n < M.NIV_MAX ? Math.round((p - a) / (b - a) * 100) : 100, max: n >= M.NIV_MAX };
  }
  function nivMeca(id) { return (M.MECANIQUES.concat(M.EXTRAS).filter(function (x) { return x.id === id; })[0] || {}).niv || 1; }
  // Bouton d'une fonctionnalité pas encore débloquée : grisé, avec le niveau à atteindre
  function verrouMeca(id, b) {
    if (st.meca[id] || st.sansLimite) return b;
    b.classList.add("mx-lockbtn"); b.textContent = "🔒 " + b.textContent.replace(/^\S+\s/, "") + " · niv. " + nivMeca(id);
    b.onclick = function () { toast("🔒 Se débloque au niveau " + nivMeca(id) + " de la partie."); };
    return b;
  }
  function barreXP() {
    if (st.np) return barrePartie();
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

  // Barre du niveau de partie, avec la prochaine fonctionnalité à débloquer
  var ptsAffiches = null;
  function barrePartie() {
    var n = nivPartie(), d = h("div", "mx-xp mx-xp-partie"), barre = h("div", "mx-xpbarre"), i = h("i"); barre.appendChild(i);
    var avant = ptsAffiches != null && ptsAffiches.pid === st.pid && ptsAffiches.p < n.xp ? ptsAffiches.p : null;
    i.style.width = n.pct + "%";
    var proch = M.MECANIQUES.concat(M.EXTRAS).filter(function (x) { return x.niv > n.n && !st.meca[x.id] && (st.session || ["attaques", "employes", "encheres", "anticipees"].indexOf(x.id) < 0); }).sort(function (a, b) { return a.niv - b.niv; })[0];
    ajout(d, h("span", "mx-niv", String(n.n)), barre, avant != null ? h("em", "m-xpplus", "+" + (n.xp - avant)) : h("small", null, n.max ? "max" : n.depuis + "/" + n.besoin));
    d.title = n.titre;
    ptsAffiches = { pid: st.pid, p: n.xp };
    var w = h("div", "mx-xp-bloc"); ajout(w, d, h("small", "mx-xp-proch", n.max ? "🏆 Niveau 50 atteint !" : "Niveau " + n.n + "/50" + (proch ? " · 🔓 niv. " + proch.niv + " : " + proch.nom : "")));
    return w;
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
    // Élections anticipées : à la demande, quand 2 objectifs sur 3 sont remplis (bouton gris tant que ce n'est pas possible)
    if (st.session && SES.s && !st.meca.anticipees) d.appendChild(h("small", "mx-criseinfo mx-gris", "🔒 Élections anticipées : niveau " + nivMeca("anticipees") + "."));
    else if (st.session && SES.s) {
      var dejaVote = !!(SES.s.votes || {})[moiSes()], peut = n >= 2 && !dejaVote;
      var bv = bouton(dejaVote ? "🗳️ Tu as voté pour des élections anticipées" : "🗳️ Voter pour des élections anticipées", "mx-antic-btn" + (peut ? " mx-pret" : ""), function () {
        if (dejaVote) return toast("🗳️ Ton vote est déjà compté.");
        if (n < 2) return toast("🎯 Remplis 2 objectifs sur 3 pour pouvoir voter.");
        window.SessionLigne.voter(SES.id).then(function () { toast("🗳️ Vote enregistré !"); });
      });
      bv.setAttribute("aria-disabled", peut ? "false" : "true");
      ajout(d, ajout(h("div", "mx-ligne"), bv, h("b", "mx-ses-votes", "")), h("small", "mx-criseinfo mx-gris", "Si la moitié des joueurs de la session votent, l’élection a lieu tout de suite (sinon toutes les 10 minutes)."));
    }
    else if (st.anticipee) d.appendChild(h("p", "mx-antic", "🗳️ Élections anticipées dans " + (st.anticipee - st.t) + " trimestre" + (st.anticipee - st.t > 1 ? "s" : "") + " : tiens bon !"));
    else if (!st.scenario) {
      var ok = M.anticipeePossible(st), b = bouton("🗳️ Demander des élections anticipées", "mx-antic-btn" + (ok ? " mx-pret" : ""), function () {
        if (!M.anticipeePossible(st)) return toast(n < 2 ? "🎯 Remplis 2 objectifs sur 3 pour pouvoir le demander." : "🗳️ Le vote prévu est déjà trop proche.");
        if (!confirm("Demander des élections anticipées ? Les habitants voteront dans 3 trimestres.")) return;
        st = M.demanderAnticipee(st); sauver(); jeu();
      });
      b.setAttribute("aria-disabled", ok ? "false" : "true");
      ajout(d, b, h("small", "mx-criseinfo mx-gris", ok ? "Objectifs remplis : le vote aurait lieu 3 trimestres plus tard." : "Possible quand 2 objectifs sur 3 sont remplis (et que le vote prévu est encore loin)."));
    }
    return d;
  }
  // Tableau de bord : le sondage en grand (c'est lui qui décide de l'élection) et trois chiffres
  function tableau() {
    var v = M.sondage(st), etat = v > 52 ? "bien" : v > 48 ? "juste" : "mal", so = M.solde(st);
    var d = h("div", "mx-tableau mx-" + etat);
    var gauche = ajout(h("div", "mx-sond"), h("b", null, virg(v) + " %"), h("small", null, etat === "bien" ? "Sondage · tu serais réélu" : etat === "juste" ? "Sondage · au coude-à-coude" : "Sondage · tu serais battu"));
    // Jauge du sondage : le trait marque la barre des 50 %
    var jg = h("div", "mx-jauge"), ji = h("i"); ji.style.width = Math.max(2, Math.min(100, v)) + "%"; jg.appendChild(ji); gauche.appendChild(jg);
    function stat(ico, val, lib, alerte, cls) { var e = h("div", "mx-stat" + (alerte ? " mx-alerte" : "") + (cls ? " " + cls : "")), b = h("b"); b.innerHTML = val; ajout(e, h("span", null, ico), b, h("small", null, lib)); return e; }
    function millions(n) { return n >= 1e6 ? (Math.round(n / 10000) / 100).toFixed(2).replace(".", ",") + " M" : Math.round(n / 1000) + " k"; }
    var g = h("div", "mx-stats");
    ajout(g, stat("💰", argent(st.tresor), (so >= 0 ? "+" : "") + argent(so) + "/trim." + (st.dette > 0 ? " · dette " + argent(st.dette) : ""), st.dette > M.PLAFOND_DETTE * 0.6 || so < 0),
      stat("😊", String(Math.round(M.bonheur(st))), "bonheur", M.bonheur(st) < 40),
      stat("📣", String(Math.round(st.pop)), "popularité", st.pop < 40),
      stat("👥", millions(st.hab || M.HAB0), "habitants · max " + millions(M.capacite(st)) + ((st.hab || M.HAB0) >= M.capacite(st) ? " 🏠 plein" : "")
        + (st.habDelta ? " · " + (st.habDelta > 0 ? "+" : "−") + Math.abs(st.habDelta).toLocaleString("fr-FR") : ""), st.habDelta < 0, "mx-hab"),
      stat("💼", virg(M.chomage(st)) + " %", "chômage", M.chomage(st) > 10, "mx-chom"));
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
    if (B.emplois) l.push("+" + (B.emplois >= 1000 ? virg(B.emplois / 1000) + " k" : B.emplois) + "💼");
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
    if (M.LOGE[id]) l.appendChild(h("li", null, "🏠 Logements : place pour " + M.LOGE[id].toLocaleString("fr-FR") + " habitants de plus"));
    if (B.emplois) l.appendChild(h("li", null, "💼 Emplois : " + B.emplois.toLocaleString("fr-FR") + " postes créés (le chômage baisse)"));
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
    var txt = B.pass && !manque.length ? "🎟️ " + (B.obtenu ? B.obtenu.replace(/\.$/, "").replace("Récompense de la ", "") : "palier du mois") : manque.map(function (x) { return x.k === "niv" ? "niv. " + x.but : x.k === "t" ? (x.but - x.cur) + " trim." : x.k === "reel" ? x.but + " réélection" + (x.but > 1 ? "s" : "") : x.txt.replace("Construis d’abord ", "après "); }).join(" · ");
    var l = bouton("", "mx-lock", function () { fiche(id); });
    ajout(l, h("span", null, "🔒 " + B.ico + " " + B.nom), h("small", null, txt));
    return l;
  }
  // ---------- Employés : autant qu'on veut, chacun plus cher et un peu moins efficace que le précédent ----------
  function effetCourtEmp(id, v) {
    var pc = Math.round(v * 100);
    return { avocat: "−" + pc + " % de points perdus", presse: "+" + pc + " % de dégâts", comptable: "−" + pc + " % de frais", urbaniste: "+" + pc + " % de logements", policier: "+" + virg(Math.round(v * 10) / 10) + " Sécurité", proprete: "+" + Math.round(v) + " espaces entretenus" }[id];
  }
  function employes() {
    var d = h("div", "mx-employes");
    ajout(d, h("p", "mx-aide", "Embauche autant que tu veux : chaque nouvel employé coûte plus cher et apporte un peu moins. Ils touchent un salaire chaque trimestre."));
    var pr = M.proprete(st);
    if (pr.manque) d.appendChild(h("p", "mx-emp-alerte", "🧹 " + pr.espaces + " espaces de vie, seulement " + pr.couverts + " entretenus : il manque " + pr.manque + " agent" + (pr.manque > 1 ? "s" : "") + " de propreté. Sinon, ils finiront par fermer !"));
    var g = h("div", "mx-emps");
    Object.keys(M.EMPLOYES).forEach(function (id) {
      var E = M.EMPLOYES[id], n = M.nbEmp(st, id), px = M.prixEmploye(st, id), non = M.peutEmbaucher(st, id);
      var en = M.effetEmp(st, id), plus = M.effetEmp(st, id, 1) - en;
      var c = h("div", "mx-emp" + (n ? " mx-emp-on" : "") + (id === "proprete" && pr.manque ? " mx-emp-urgent" : ""));
      ajout(c, ajout(h("div", "mx-emp-tete"), h("span", "mx-emp-ico", E.ico), ajout(h("div"), h("b", null, E.nom), h("small", null, n ? "Salaires : " + argent(E.salaire * n) + "/trim." : "Aucun")), n ? h("em", "mx-emp-n", "×" + n) : null),
        h("p", "mx-emp-txt", E.txt),
        n ? h("p", "mx-emp-effet", "✔ " + effetCourtEmp(id, en)) : null,
        h("p", "mx-emp-plus", "Suivant : " + effetCourtEmp(id, plus) + " · " + argent(E.salaire) + "/trim."));
      var b = bouton("Embaucher · " + argent(px), "btn m-go mx-emp-go", function () {
        if (M.peutEmbaucher(st, id)) return toast("💸 " + M.peutEmbaucher(st, id));
        st = M.embaucher(st, id); sauver(); signal("achat");
        var y = document.querySelector(".mx-boutique"); if (y) y.replaceWith(boutique()); haut2();
        toast(E.ico + " " + E.nom + " embauché !");
        if (SES.id) window.SessionLigne.signaler(SES.id, etatSes());
      });
      b.disabled = !!non;
      c.appendChild(b); g.appendChild(c);
    });
    d.appendChild(g);
    return d;
  }
  // Met à jour les chiffres du haut (argent, sondage…) sans tout redessiner
  function haut2() { var a = document.querySelector("#m-app > .mx-tableau"); if (a) a.replaceWith(tableau()); }
  // Boutique rangée par rayons : on ouvre d'abord celui du pilier le plus faible
  var RAYON = null, gestionOuverte = false;
  function rayonDe(id) { return M.BATIMENTS[id].cat; }

  function boutique() {
    var d = h("div", "mx-boutique"), n = st.nivJ;
    d.appendChild(h("h5", null, "🛒 Construire"));
    if (window.ADMIN_UNLOCKED) d.appendChild(bouton(st.sansLimite ? "🛠 Limites désactivées (admin)" : "🛠 Passer les limites pour les bâtiments", "btn m-sec m-adminbat", function () {
      st = M.limites(st, !st.sansLimite); try { localStorage.setItem("maire_sanslimite", st.sansLimite ? "1" : ""); } catch (e) {} sauver(); jeu();
    }));
    var rayons = st.session ? M.RAYONS.concat([{ id: "employes", nom: "Employés", ico: "👔" }]) : M.RAYONS;
    var verrouR = { employes: "employes", enchere: st.session ? "encheres" : null };
    var ids = Object.keys(M.BATIMENTS), visibles = rayons.filter(function (r) {
      if (r.id === "secret") return ids.some(function (id) { return rayonDe(id) === "secret" && M.disponible(st, id); });
      if (r.id === "projet") return st.meca.grandsProjets || st.sansLimite || n >= 4;
      return true;
    });
    if (!RAYON || !visibles.some(function (r) { return r.id === RAYON; })) RAYON = Object.keys(M.PILIERS).sort(function (a, b) { return st.piliers[a] - st.piliers[b]; })[0];
    var onglets = h("div", "mx-rayons"); onglets.setAttribute("role", "tablist");
    visibles.forEach(function (r) {
      var l = ids.filter(function (id) { return rayonDe(id) === r.id; }), ok = l.filter(function (id) { return M.disponible(st, id); });
      var neuf = ok.some(function (id) { return !G.guideVu("bat-" + id) && !st.bat[id] && (M.BATIMENTS[id].niv > 1 || M.BATIMENTS[id].si); });
      var t = bouton("", "mx-rayon" + (neuf ? " mx-rayon-neuf" : ""), function () { RAYON = r.id; var b = document.querySelector(".mx-boutique"); if (b) b.replaceWith(boutique()); else jeu(); });
      t.setAttribute("role", "tab"); t.setAttribute("aria-selected", r.id === RAYON); t.title = r.nom;
      ajout(t, h("span", null, r.ico), h("small", null, r.nom));
      onglets.appendChild(t);
    });
    d.appendChild(onglets);
    var l = ids.filter(function (id) { return rayonDe(id) === RAYON; });
    var tri = function (a, b) { var A = M.BATIMENTS[a], B = M.BATIMENTS[b]; return (A.niv || 1) - (B.niv || 1) || A.cout - B.cout; };
    var ok = l.filter(function (id) { return M.disponible(st, id); }).sort(tri), bloques = l.filter(function (id) { return !M.disponible(st, id); }).sort(tri);
    if (verrouR[RAYON] && !st.meca[verrouR[RAYON]]) { d.appendChild(h("p", "mx-verrou", "🔒 " + (M.EXTRAS.filter(function (x) { return x.id === verrouR[RAYON]; })[0] || {}).nom + " : se débloque au niveau " + nivMeca(verrouR[RAYON]) + " de la partie.")); return d; }
    if (RAYON === "employes") { d.appendChild(employes()); return d; }
    if (RAYON === "enchere" && st.session && SES.s) {
      // En session, les bâtiments de prestige se gagnent dans la salle des ventes, contre les autres arrondissements
      d.appendChild(ventesSession());
      return d;
    }
    if (RAYON === "enchere") d.appendChild(h("p", "mx-aide", "🔨 30 secondes d’enchères contre un autre arrondissement."));
    var g = h("div", "mx-bats");
    ok.forEach(function (id) { g.appendChild(carteBat(id)); });
    if (!ok.length) g.appendChild(h("p", "mx-aide", "Rien à construire ici pour l’instant."));
    d.appendChild(g);
    // Les 3 prochains seulement ; le reste est compté
    var proches = bloques.slice(0, 3), loin = bloques.length - proches.length;
    if (proches.length) { var b = h("div", "mx-bientot"); b.appendChild(h("small", null, "Bientôt")); proches.forEach(function (id) { b.appendChild(verrou(id)); }); if (loin) b.appendChild(h("small", null, "+ " + loin + " à découvrir")); d.appendChild(b); }
    return d;
  }

  // ---------- Enchères : 30 secondes contre un autre arrondissement ----------
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
    c.appendChild(bouton("✕ Fermer", "m-pop-fermer", function () { if (st.enchere && !st.enchere.fini && !confirm("Quitter l’enchère ? Tu l’abandonnes.")) return; if (ENCH) clearInterval(ENCH.minuteur); if (st.enchere && !st.enchere.fini) st = M.finirEnchere(st); st = M.fermerEnchere(st); sauver(); fermerEnchUI(); jeu(); }));
    ajout(c, h("p", "m-sur", "🔨 Enchère face au " + e.ville), h("h4", null, B.ico + " " + B.nom));
    if (!e.fini) {
      var vVu = ENCH && ENCH.attente ? ENCH.vu : e.v, toiTete = e.j > vVu;
      var tps = h("div", "m-ench-tps"), barre = h("div", "m-barre"), i = h("i"); i.id = "m-ench-barre"; barre.appendChild(i);
      var nb = h("b", null, Math.max(0, Math.ceil(((ENCH ? ENCH.fin : Date.now()) - Date.now()) / 1000)) + " s"); nb.id = "m-ench-temps";
      ajout(tps, ajout(h("div", "m-jt"), h("span", null, "⏱️ Temps restant"), nb), barre); c.appendChild(tps);
      c.appendChild(h("p", "m-ench-moyen", "💡 Prix moyen de vente : ≈ " + argent(e.moyen) + ". Au-delà, tu paies plus cher que la normale."));
      var t = h("div", "m-ench-tete " + (toiTete ? "m-ench-toi" : "m-ench-eux"));
      ajout(t, h("span", null, toiTete ? "🙋 Tu mènes" : "🏛️ Le " + e.ville + " mène"), h("strong", null, argent(toiTete ? e.j : vVu)));
      c.appendChild(t);
      if (ENCH && ENCH.attente) c.appendChild(h("p", "m-ench-reflexion", "🤔 Le " + e.ville + " réfléchit…"));
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
        hist.appendChild(h("li", o.qui === "j" ? "m-ench-j" : "", (o.qui === "j" ? "🙋 Toi" : "🏛️ Le " + e.ville) + " : " + argent(o.m)));
      });
      c.appendChild(hist);
      c.appendChild(bouton("Abandonner", "btn m-sec", function () { if (ENCH) clearInterval(ENCH.minuteur); st = M.finirEnchere(st); sauver(); afficherEnchere(); }));
    } else {
      var r = e.res, ecart = r.prix - e.moyen;
      c.classList.add(r.gagne ? "m-ench-gagne" : "m-ench-perdu");
      ajout(c, h("p", "m-ench-res", r.gagne ? "🔨 Adjugé ! Ton arrondissement l’emporte." : "❌ Le " + e.ville + " l’emporte."),
        h("p", null, r.gagne ? B.nom + " est à toi pour " + argent(r.prix) + " (" + (ecart <= 0 ? "une bonne affaire : " + argent(-ecart) + " sous le prix moyen" : argent(ecart) + " au-dessus du prix moyen") + ")."
          : B.nom + " part au " + e.ville + " pour " + argent(r.prix) + ". Il reviendra aux enchères dans 4 trimestres."),
        bouton("Retour à ma mairie", "btn m-go", function () { st = M.fermerEnchere(st); sauver(); fermerEnchUI(); jeu(); }));
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
      bouton("🏛️ Rejoindre une session", "btn m-sec", function () { sauver(); ecranSessions(true); }),
      bouton("🏠 Menu principal", "btn m-sec", function () { sauver(); fermerModale(); accueil(); haut(); }),
      bouton("🚪 Démissionner", "btn m-sec m-demission", function () {
        if (!confirm("Démissionner ? La partie s’arrête ici : tu gardes l’XP de ce que tu as déjà accompli.")) return;
        st = M.demissionner(st); sauver(); jeu();
      })));
    return d;
  }
  // Bouton de trimestre en session : texte principal + réserve, et jauge de recharge en fond
  function remplirTrim(b) {
    var r = Math.max(0, Math.ceil(((SES.tick || prochainDossier(Date.now())) - Date.now()) / 1000)), rt = mmss(r * 1000), haut, bas;
    if (st.phase === "evenement") haut = "📂 Un dossier t’attend";
    else if ((st.bj && !st.bj.fini) || (st.enchere && !st.enchere.fini)) haut = "🃏 Une partie de cartes est en cours";
    else haut = SES.jetons < 1 ? "⏳ Prochain dossier dans " + rt : "📂 Dossier suivant →";
    // La saison du prochain dossier, en tout petit
    bas = SAISONS[Math.max(0, st.t - 1) % 4][0] + " · " + SES.jetons + "/" + RG().v.reserveMax + (SES.jetons < RG().v.reserveMax ? " · +1 dans " + rt : " · réserve pleine");
    b.textContent = ""; b.appendChild(h("span", null, haut)); b.appendChild(h("small", "mx-reserve", bas));
    b.classList.toggle("mx-vide", SES.jetons < 1);
    b.classList.toggle("mx-pret", st.phase === "evenement" || (SES.jetons > 0 && (st.phase === "gestion" || st.phase === "pret")));
    b.style.setProperty("--p", SES.jetons >= RG().v.reserveMax ? 1 : Math.max(0, Math.min(1, 1 - r / (dossierMs() / 1000))));
  }
  function barreTrimestre() {
    var b = h("div", "m-barmois");
    var cartes = (st.bj && !st.bj.fini) || (st.enchere && !st.enchere.fini);
    var auto = !!(st.session && SES.id);
    b.appendChild(bouton(st.phase === "evenement" ? "📂 Un dossier t’attend" : cartes ? "🃏 Une partie de cartes est en cours" : auto ? "" : "📂 Dossier suivant →", "btn m-go mx-dossier" + (auto ? " mx-auto" : ""), function () {
      if (st.phase === "evenement" || (st.resultat && !st.resultatVu)) return modale();
      if (st.bj && !st.bj.fini) return ouvrirTelephone();
      if (auto) return jouerTrimestre();
      // Partie de session pas encore reconnectée (retour en jeu) : on attend la session au lieu de sauter un trimestre
      if (st.session && !SES.afk) { brancherSession(); return toast("⏳ Connexion à ta session…"); }
      var t0 = st.t;
      st = M.debutTour(st, BASE); sauver(); signal("trimestre"); jeu();
      if (st.t > t0) messageSaison();   // petit message en haut, jamais de grande fenêtre
    }));
    if (auto) remplirTrim(b.lastChild);
    if (st.phase === "evenement") b.lastChild.classList.add("mx-pret");
    else if (st.phase !== "evenement" && !cartes) {
      // Partie hors session : même bouton doré, toujours prêt, avec la saison en petit
      var go = b.lastChild; go.textContent = ""; go.classList.add("mx-pret");
      go.appendChild(h("span", null, "📂 Dossier suivant →")); go.appendChild(h("small", "mx-reserve", SAISONS[st.t % 4][0] + " · " + SAISONS[st.t % 4][1]));
    }
    if (auto) b.appendChild(bouton(autoTrim() ? "⏩ Auto : oui" : "⏩ Auto : non", "btn m-sec mx-trimauto" + (autoTrim() ? " mx-on" : ""), function () {
      try { localStorage.setItem("maire_trim_auto", autoTrim() ? "0" : "1"); } catch (e) {}
      toast(autoTrim() ? "⏩ Les dossiers arrivent tout seuls dès qu’ils sont prêts." : "✋ Tu appelles toi-même le dossier suivant.");
      jeu();
    }));
    return b;
  }
  // Passage au trimestre suivant : la date tourne comme une page de calendrier, avec la saison et ce que la ville a gagné ou perdu
  var SAISONS = [["❄️", "Hiver"], ["🌸", "Printemps"], ["☀️", "Été"], ["🍂", "Automne"]];

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
    if (r.parfait) notifier({ type: "fait", txt: "🌞 Journée parfaite !" });
    if (r.joker) notifier({ type: "fait", txt: "🃏 Joker utilisé : ta série est sauvée" });
    if (r.serie) notifier({ type: "fait", txt: "🔥 " + r.serie.n + " jour" + (r.serie.n > 1 ? "s" : "") + " d’affilée", titre: r.serie.txt });
    r.pass.forEach(function (x) { notifier({ type: "fait", txt: "🎟️ Palier " + x.n + "/20 du mois atteint !", titre: x.txt }); });
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
      { q: "#m-modale .m-choix", t: "📂 Un dossier t’attend : choisis une réponse. Les pourcentages montrent ce qu’ont choisi les autres maires.", a: "choix" },
      { q: "#m-modale .m-delta, #m-modale .m-res", t: "Voilà les conséquences de ta décision.", a: "ok" },
      { q: "#m-modale .m-go", t: "Retourne à ta mairie.", a: "fermer" },
      { q: ".mx-tableau", t: "🗳️ Ton but : rester au-dessus de 50 % jusqu’à l’élection.", a: "ok" },
      { q: ".mx-piliers", t: "Ces 4 piliers font le bonheur de tes habitants. Ils baissent avec le temps : construis pour les remonter.", a: "ok" },
      { q: ".mx-bat:not(:disabled)", t: "🛒 Achète un bâtiment pour faire monter un pilier.", a: "achat" },
      { q: ".m-barmois .btn", t: "Bravo ! Appelle le dossier suivant.", a: "trimestre" }] },
    { id: "budget", ecran: "jeu", si: function () { return st.meca.budget && st.phase === "gestion"; }, etapes: [
      { q: ".mx-gestion summary", t: "💶 Nouveau : les impôts ! Règle-les dans « Gestion de la ville ».", a: "ok" }] },
    { id: "opposant", ecran: "jeu", si: function () { return st.meca.opposant && st.opposant && st.phase === "gestion"; }, etapes: [
      { q: ".mx-opp", t: "⚔️ Ton opposant veut ta place : ses attaques font baisser ton sondage.", a: "ok" }] },
    { id: "attaque", ecran: "modale", si: function () { return st.special === "opposition" && st.phase === "evenement"; }, etapes: [
      { q: "#m-modale .m-choix", t: "Riposte, tente de le faire tomber… ou laisse faire, il reviendra plus fort.", a: "choix" }] },
    { id: "cata", ecran: "modale", si: function () { return st.special === "catastrophe" && st.phase === "evenement"; }, etapes: [
      { q: "#m-modale .m-choix", t: "🚨 Une catastrophe ! Choisis comment limiter les dégâts.", a: "choix" }] },
    { id: "chance", ecran: "modale", si: function () { return st.special === "chance" && st.phase === "evenement"; }, etapes: [
      { q: "#m-modale .m-choix", t: "🍀 Un coup de chance ! À toi d’en profiter.", a: "choix" }] },
    { id: "maire-crea", ecran: "creation", si: function () { return !!document.querySelector(".mx-maires"); }, etapes: [
      { q: ".mx-maires", t: "🎩 Choisis ta compétence : chaque jeu de mots cache un point fort (et un point faible). Certaines se débloquent au fil de ta carrière.", a: "ok" }] },
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
    { id: "session", ecran: "jeu", si: function () { return !!document.querySelector(".mx-session"); }, etapes: [
      { q: ".mx-session", t: "🏛️ Tu commences maire du plus petit arrondissement. Toutes les 10 minutes, élection : bats ton rival (juste au-dessus) pour prendre sa place, jusqu’au trône de Maire de Paris. Ton opposant (juste en dessous) veut la tienne.", a: "ok" },
      { q: ".m-barmois", t: "📂 C’est toi qui appelles le dossier suivant. Un nouveau arrive toutes les 2 min 15 (le bouton s’illumine) et tu peux en garder 4 en réserve. Les saisons, elles, passent toutes seules : recettes et dépenses tombent sans que tu aies à cliquer. Le petit emoji montre la saison. Ne traîne pas trop : les autres maires avancent pendant ce temps !", a: "ok" },
      { q: ".mx-ses-attaque", t: "⚔️ Attaque ton rival ou ton opposant pour faire baisser son sondage avant l’élection. Le bouclier 🛡️ te protège de la prochaine attaque.", a: "ok" },
      { q: ".mx-ses-btn", t: "🏆 Le classement de ta session : de vrais joueurs et des maires robots. Touche un maire pour comparer vos villes.", a: "ok" }] },
    { id: "habitants3", ecran: "jeu", si: function () { return st.phase === "gestion"; }, etapes: [
      { q: ".mx-hab", t: "👥 Les habitants : plus ton arrondissement est peuplé, plus les impôts rapportent. Ils arrivent quand ta popularité monte… s’il y a des logements libres (construis-en pour en accueillir plus).", a: "ok" },
      { q: ".mx-chom", t: "💼 Une ville cohérente : plus il y a d’habitants, plus il faut de sécurité, de cadre de vie et d’emplois (les commerces en créent). Sinon, ou si ta popularité baisse, les habitants s’en vont.", a: "ok" },
      { q: ".m-journal", t: "📰 Le Journal de Paris te dit ce que veulent les habitants : lis-le à chaque trimestre !", a: "ok" }] },
    { id: "casino", ecran: "modale", si: function () { return st.phase === "evenement" && !!document.querySelector("#m-modale .m-mj"); }, etapes: [
      { q: "#m-modale .m-mj", t: "🎰 Chaque réponse se joue au casino (blackjack, roulette ou poker) : gagne pour la prendre. La réponse « ne rien faire » reste libre.", a: "ok" }] },
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

  // Filet iPhone : un toucher sur une réponse du dossier déclenche toujours la réponse,
  // même si iOS ne génère pas le « clic » (ou qu'un élément invisible se trouve au-dessus)
  var TOUCHE = null;
  document.addEventListener("touchstart", function (e) { var t = e.touches[0]; TOUCHE = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: Date.now() } : null; }, { capture: true, passive: true });
  document.addEventListener("touchend", function (e) {
    var d = TOUCHE; TOUCHE = null;
    var m = document.getElementById("m-modale"), t = e.changedTouches && e.changedTouches[0];
    if (!d || !m || !t || e.touches.length || Math.abs(t.clientX - d.x) > 12 || Math.abs(t.clientY - d.y) > 12 || Date.now() - d.at > 800) return;
    if (e.target && e.target.closest && e.target.closest(".m-bulle, .m-pop-fermer, a, input")) return;
    var opts = m.querySelectorAll(".m-option");
    for (var k = 0; k < opts.length; k++) {
      var b = opts[k], r = b.getBoundingClientRect();
      if (b._choix && !b.disabled && t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom) { e.preventDefault(); b._choix(); return; }
    }
  }, { capture: true, passive: false });

  // ---------- Dossier du trimestre : fenêtre au premier plan ----------
  var legendeVue = null, MASQUE = null;
  function cleMasque() { return st.t + ":" + (st.evenement || "") + ":" + (st.phase === "evenement" ? "e" : "r"); }
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
  // Avant de choisir : la part des maires qui a pris chaque réponse (votes réels + une base estimée tant qu'il y en a peu)
  var VOTES_LUS = {};
  function lireVotes(cle) {
    if (!cle || !window.LB || !LB.db) return Promise.resolve(null);
    if (VOTES_LUS[cle]) return VOTES_LUS[cle];
    return (VOTES_LUS[cle] = LB.db.doc("votes/" + cle).get().then(function (sn) { return sn.exists ? sn.data() : null; }).catch(function () { return null; }));
  }
  // Uniquement les vrais choix des joueurs (aucune estimation)
  function partsVotes(ev, d) {
    var c = ev.choix.map(function (_, k) { return (d && d["c" + k]) || 0; }), tot = c.reduce(function (a, x) { return a + x; }, 0);
    if (!tot) return null;
    var p = c.map(function (x) { return Math.round(x / tot * 100); }), ecart = 100 - p.reduce(function (a, x) { return a + x; }, 0);
    p[p.indexOf(Math.max.apply(null, p))] += ecart;
    return { p: p, tot: tot };
  }
  function remplirParts(ch, ev, cle) {
    var info = h("p", "m-pct-info", "📊 Ce qu’ont choisi les autres maires…"); ch.parentNode.insertBefore(info, ch);
    lireVotes(cle).then(function (d) {
      if (!document.body.contains(ch)) return;
      var r = partsVotes(ev, d), c = ev.choix.map(function (_, k) { return (d && d["c" + k]) || 0; });
      info.textContent = r ? "📊 " + r.tot + " maire" + (r.tot > 1 ? "s ont" : " a") + " déjà tranché ce dossier" : "📊 Aucun maire n’a encore tranché ce dossier : tu seras le premier !";
      var max = r ? Math.max.apply(null, r.p) : 0;
      // Sous chaque réponse : sa part des votes, ou « pas encore de stat » si personne ne l'a choisie (un seul vote suffit)
      ch.querySelectorAll(".m-pct").forEach(function (e, k) {
        e.textContent = "";
        if (!c[k]) { e.appendChild(h("em", "m-pct-vide", "📊 Pas encore de stat : personne n’a fait ce choix")); e.classList.remove("m-pct-top"); return; }
        var b = h("i"); b.style.width = r.p[k] + "%";
        ajout(e, ajout(h("span", "m-pct-barre"), b), h("b", null, r.p[k] + " % des maires ont fait ce choix"));
        e.classList.toggle("m-pct-top", r.p[k] === max);
      });
    });
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
  function fermerModale() { var m = document.getElementById("m-modale"); if (m) m.remove(); document.body.classList.remove("m-modal"); cacherBulle(); if (document.body.classList.contains("m-casino")) casino(false); }
  // Les dossiers sont écrits pour un maire d'arrondissement ; sur le trône de Maire de Paris, on passe à l'échelle de la ville
  var TRONE_TXT = [[/l’Hôtel de Ville/g, "l’\u0001"], [/L’Hôtel de Ville/g, "L’\u0001"], [/la mairie d’arrondissement/g, "l’Hôtel de Ville"], [/La mairie d’arrondissement/g, "L’Hôtel de Ville"],
    [/le conseil d’arrondissement/g, "le Conseil de Paris"], [/Le conseil d’arrondissement/g, "Le Conseil de Paris"], [/au conseil d’arrondissement/g, "au Conseil de Paris"], [/du conseil d’arrondissement/g, "du Conseil de Paris"],
    [/ton arrondissement/g, "Paris"], [/Ton arrondissement/g, "Paris"], [/de l’arrondissement/g, "de la ville"], [/à l’arrondissement/g, "à la ville"], [/l’arrondissement/g, "la ville"], [/L’arrondissement/g, "La ville"],
    [/les habitants/g, "les Parisiens"], [/Les habitants/g, "Les Parisiens"], [/maires d’arrondissement/g, "maires de France"], [/l’\u0001/g, "l’État"], [/L’\u0001/g, "L’État"]];
  function T(x) {
    if (!x || !st || !st.session || st.session.place < 20) return x;
    TRONE_TXT.forEach(function (r) { x = x.replace(r[0], r[1]); }); return x;
  }
  function modale() {
    fermerModale();
    var ev = M.evenementCourant(st, BASE);
    if (!ev || !(st.phase === "evenement" || (st.resultat && !st.resultatVu))) return;
    if (st.special === "legendaire" && st.phase === "evenement" && legendeVue !== st.t) { legendeVue = st.t; flash("🌟 ÉVÉNEMENT LÉGENDAIRE 🌟", "m-flash-legende"); }
    var sp = st.special || "dossier", pop = h("div", "m-pop m-pop-" + sp); pop.id = "m-modale";
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-modal", "true");
    var cadre = h("div", "m-pop-in");
    MASQUE = null;
    // Toujours un moyen de sortir : le dossier reste en attente, le bouton « Un dossier t’attend » le rouvre
    cadre.appendChild(bouton("✕ Fermer", "m-pop-fermer", function () { MASQUE = cleMasque(); casino(false); fermerModale(); }));
    var TITRES_POP = { catastrophe: "Alerte : une catastrophe frappe Paris", opposition: "Ton opposant passe à l’attaque", chance: "Bonne nouvelle pour Paris !",
      rare: "✨ Quelque chose d’inhabituel se produit…", legendaire: "🌟 Un événement légendaire !", historique: "📜 Une décision historique", suite: "🔁 Une vieille décision revient", chantier: "🏗️ Des nouvelles du chantier" };
    if (TITRES_POP[st.special]) cadre.appendChild(h("p", "m-pop-titre", TITRES_POP[st.special]));
    var carte = h("article", "m-dossier m-c-" + ev.cat);
    var LIB = { rare: "✨ Événement rare", legendaire: "🌟 Légendaire", politique: "🎭 Coup de théâtre", chantier: "🏗️ Chantier", historique: "📜 Décision historique", suite: "🔁 Le retour" };
    ajout(carte, h("p", "m-cat", (LIB[st.special] || M.FAMILLE[st.special || ev.cat] || "📂 Dossier") + " · " + date(st.t)), h("h4", null, T(ev.titre)));
    if (ev.perso && M.C.PERSONNAGES[ev.perso]) { var pe = M.C.PERSONNAGES[ev.perso]; carte.appendChild(ajout(h("div", "m-perso"), h("span", null, pe.ico), h("small", null, pe.nom + " · " + pe.txt))); }
    if (st.phase === "evenement") {
      // Chaque réponse se joue au casino (blackjack ou roulette), sauf la réponse « rien »
      casino(false);
      if (!st.evPerso) { var avant = st.mj; st = M.preparerMiniJeu(st, BASE); if (st.mj !== avant) sauver(); }
      carte.appendChild(h("p", "m-desc", T(ev.desc)));
      var ch = h("div", "m-choix"), cleV0 = cleVote();
      ev.choix.forEach(function (x, i) {
        var mj = M.jeuDe(st, i), b = bouton("", "m-option" + (mj ? " m-mj m-mj-" + mj.etat : ""), function () {
          var pop0 = document.getElementById("m-modale");
          try {
            // Dossier périmé (le temps a tourné pendant qu'il était ouvert) : on redessine au lieu de ne rien faire
            if (st.phase !== "evenement" || cleVote() !== cleV0) { MASQUE = null; jeu(); }
            else {
              if (mj && mj.etat === "a_jouer") return miniJeu(carte, ev, i);
              if (mj && mj.etat === "perdu") return;
              var cle = cleVote(), t = st.t, p = null;
              try { p = voter(cle, i); } catch (e) { p = null; }   // le vote des autres maires ne doit jamais bloquer le choix
              VOTE = p ? { t: t, i: i, p: p } : null;
              st = M.choisir(st, BASE, i); sauver(); signal("choix"); jeu();
            }
          } catch (e) { toast("⚠️ " + (e && e.message || e)); }
          // Si rien n'a bougé à l'écran, on remet le dossier à jour de force
          if (document.getElementById("m-modale") === pop0 && document.body.contains(pop0)) { MASQUE = null; modale(); }
        });
        b.dataset.choix = i; b._choix = b.onclick;
        ajout(b, h("span", "m-lettre", mj && mj.etat === "perdu" ? "🔒" : "ABCD"[i]), h("strong", null, T(x.t)));
        var best = st.mj && st.mj.best === i ? "⭐ Meilleur choix · " : "";
        if (mj) b.appendChild(h("small", "m-mj-tag", mj.etat === "a_jouer" ? best + "se joue " + ({ bj: "au 🃏 blackjack", roulette: "à la 🎡 roulette", poker: "au ♠️ poker" })[mj.jeu]
          : mj.etat === "gagne" ? "✅ Gagné au casino : à toi de le prendre" : "❌ Perdu au casino : ce choix t’échappe"));
        if (best && mj && mj.etat === "a_jouer") b.classList.add("m-mj-best");
        if (mj && mj.etat === "perdu") b.disabled = true;
        if (!st.evPerso || st.evPerso.src) b.appendChild(h("small", "m-pct", "📊 …"));
        ch.appendChild(b);
      });
      carte.appendChild(ch);
      if (ch.querySelector(".m-pct")) remplirParts(ch, ev, cleVote());
    } else {
      var r = st.resultat, x = ev.choix[r.i];
      ajout(carte, h("p", "m-pris", "Ta décision : " + T(x.t)), h("p", "m-res", T(r.txt || x.r)));
      variations(r.d, carte);
      if (r.surprise) carte.appendChild(h("p", "m-surprise", "⚡ Imprévu : " + T(r.surprise)));
      (r.extra || []).forEach(function (t) { carte.appendChild(h("p", "m-extra", T(t))); });
      if (r.dif) carte.appendChild(h("p", "m-extra", "⏳ Cette décision aura encore des conséquences plus tard."));
      afficherVote(carte, ev.choix.length);
      carte.appendChild(bouton("Retour à ma mairie", "btn m-go", function () { st.resultatVu = true; sauver(); fermerModale(); signal("fermer"); if (st.phase === "fin") jeu(); else guide("jeu"); }));
    }
    cadre.appendChild(carte); pop.appendChild(cadre); (document.getElementById("g-maire") || document.body).appendChild(pop);
    document.body.classList.add("m-modal");
    var f = carte.querySelector("button"); if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 50);
    setTimeout(function () { guide("modale"); }, 30);
  }

  // ---------- Mini-jeu d'un dossier : blackjack ou roulette, sans mise, pour décrocher le meilleur choix ----------
  // ---------- Poker contre le croupier (bot) ----------
  // Les cartes du poker (2 = 0 … As = 12) converties pour le dessin des cartes (As = 0, 2 = 1 … Roi = 12)
  function pkCarte(c) { var r = c % 13; return Math.floor(c / 13) * 13 + (r === 12 ? 0 : r + 1); }
  var NOM_ACT = { coucher: "se couche", suivre: "suit", parler: "parle", relancer: "relance à", tapis: "fait tapis !" };
  var pokerStop = null;
  function pokerVue(zone, i, J, fin) {
    var Pk = window.Poker, mainVue = -1;
    if (pokerStop) { pokerStop(); pokerStop = null; }
    // Déjà à une table en ligne (partie reprise) : on la retrouve
    if (J().ligne) return pokerLigne(zone, i, J, fin, Pk);
    if (J().pk) return dessin();
    // 5 secondes pour trouver un autre maire qui joue au poker, sinon le croupier (bot)
    var n = 5, info = h("p", "m-pk-cherche", ""), anim = h("div", "m-pk-radar"); zone.innerHTML = ""; ajout(zone, anim, info);
    function compte() { info.textContent = "🔎 Recherche d’un autre maire… " + n + " s"; }
    compte(); var tic = setInterval(function () { n = Math.max(0, n - 1); compte(); }, 1000);
    (window.PokerLigne ? window.PokerLigne.chercher(5000) : Promise.resolve(null)).then(function (r) {
      clearInterval(tic);
      if (!J() || J().etat !== "a_jouer" || !zone.isConnected) return;
      if (r) { st = M.mjPokerLigne(st, i, r); sauver(); return pokerLigne(zone, i, J, fin, Pk); }
      info.textContent = "Personne pour l’instant : tu joues contre le croupier.";
      setTimeout(function () { if (!zone.isConnected) return; st = M.mjPoker(st, i, "commencer"); sauver(); dessin(); }, 700);
    });
    function dessin() {
      zone.innerHTML = "";
      var t = J().pk, m = t.main, montre = m.fini && m.res && m.res.abattage;
      if (t.mains !== mainVue) { cartesVues = {}; mainVue = t.mains; }
      function siege(s) {
        var r = h("div", "m-pk-siege"), c = h("div", "m-bj-main");
        m.cartes[s].forEach(function (x, k) { var e = carteJeu(pkCarte(x), s === 1 && !montre); posee(e, k); c.appendChild(e); });
        var mise = m.mises[s] ? " · mise " + m.mises[s] : "", bout = t.bouton === s ? " 🔘" : "";
        ajout(r, h("small", "m-bj-val", (s === 0 ? "Toi" : "🤖 Le croupier") + bout + " · " + t.piles[s] + " jetons" + mise), c);
        if (montre) r.appendChild(h("small", "m-pk-main", m.res.noms[s]));
        return r;
      }
      var b = h("div", "m-pk-board");
      for (var k = 0; k < 5; k++) { if (m.board[k] != null) { var e = carteJeu(pkCarte(m.board[k]), false); posee(e, k < 3 ? k : 0); b.appendChild(e); } else b.appendChild(h("span", "m-carte-jeu m-pk-vide")); }
      var pot = m.fini && m.potFinal != null ? m.potFinal : m.pot + m.mises[0] + m.mises[1];
      var tp = ajout(tapis(), siege(1), b, h("small", "m-pk-pot", "Pot : " + pot + " jetons"), siege(0));
      zone.appendChild(tp);
      // Ce que vient de faire le croupier
      var der = m.actions.filter(function (a) { return a.s === 1; }).pop();
      if (der && !m.fini) zone.appendChild(h("p", "m-pk-info", "🤖 Le croupier " + NOM_ACT[der.a] + (der.a === "relancer" ? " " + der.n : "") + "."));
      if (t.fini) return fin();
      if (m.fini) {
        var g = m.res.couche != null ? (m.res.couche === 0 ? "Tu te couches : le croupier prend le pot." : "Le croupier se couche : tu prends le pot !")
          : m.res.gagnant === 0 ? "Tu gagnes le pot avec : " + m.res.noms[0] + " !" : m.res.gagnant === 1 ? "Le croupier gagne avec : " + m.res.noms[1] + "." : "Égalité : le pot est partagé.";
        zone.appendChild(h("p", "m-mj-res " + (m.res.gagnant === 0 ? "m-mj-ok" : m.res.gagnant === 1 ? "m-mj-ko" : ""), g));
        zone.appendChild(bouton("Main suivante", "btn m-go", function () { st = M.mjPoker(st, i, "donner"); sauver(); dessin(); }));
        return;
      }
      var o = Pk.options(t, 0); if (!o) return;
      var acts = h("div", "m-bas m-pk-acts");
      function jouer(a, n) { st = M.mjPoker(st, i, a, n); sauver(); dessin(); }
      if (o.coucher) acts.appendChild(bouton("Se coucher", "btn m-sec", function () { jouer("coucher"); }));
      acts.appendChild(bouton(o.suivre ? "Suivre (" + o.suivre + ")" : "Parler", "btn m-go", function () { jouer("suivre"); }));
      if (o.relancerMin != null && o.relancerMin < o.relancerMax) acts.appendChild(bouton("Relancer à " + o.relancerMin, "btn m-go", function () { jouer("relancer", o.relancerMin); }));
      if (o.relancerMax != null) acts.appendChild(bouton("Tapis (" + o.relancerMax + ")", "btn m-go m-pk-tapis", function () { jouer("tapis"); }));
      zone.appendChild(acts);
    }
  }
  // Table en ligne contre un autre maire : l'affichage suit la table partagée, chacun joue à son tour
  function pokerLigne(zone, i, J, fin, Pk) {
    var L = J().ligne, moi = L.siege, lui = 1 - moi, mainVue = -1, derniere = null, chrono = null, envoi = false;
    function act(a, n, pourAutre) { if (envoi) return; envoi = true; window.PokerLigne.agir(L.id, moi, a, n, pourAutre).then(function () { envoi = false; }); }
    var stop = window.PokerLigne.ecouter(L.id, function (x) { derniere = x; dessin(); });
    pokerStop = function () { stop(); clearInterval(chrono); };
    zone.innerHTML = ""; zone.appendChild(h("p", "m-pk-cherche", "🤝 Connexion à la table…"));
    // Chaque seconde, seulement pendant que l'autre réfléchit : le compte à rebours de 30 s avance
    chrono = setInterval(function () { if (derniere && derniere.t && !derniere.t.fini && !derniere.t.main.fini && !Pk.options(derniere.t, moi)) dessin(); }, 1000);
    function dessin() {
      if (!zone.isConnected) { pokerStop(); return; }
      var x = derniere, t = x.t; if (!t) return;
      zone.innerHTML = "";
      var m = t.main, montre = m.fini && m.res && m.res.abattage, noms = x.noms || ["Un maire", "Un maire"];
      if (t.mains !== mainVue) { cartesVues = {}; mainVue = t.mains; }
      function siege(s) {
        var r = h("div", "m-pk-siege"), c = h("div", "m-bj-main");
        m.cartes[s].forEach(function (cc, k) { var e = carteJeu(pkCarte(cc), s === lui && !montre); posee(e, k); c.appendChild(e); });
        ajout(r, h("small", "m-bj-val", (s === moi ? "Toi" : "👤 " + noms[s]) + (t.bouton === s ? " 🔘" : "") + " · " + t.piles[s] + " jetons" + (m.mises[s] ? " · mise " + m.mises[s] : "")), c);
        if (montre) r.appendChild(h("small", "m-pk-main", m.res.noms[s]));
        return r;
      }
      var b = h("div", "m-pk-board");
      for (var k = 0; k < 5; k++) { if (m.board[k] != null) { var e = carteJeu(pkCarte(m.board[k]), false); posee(e, k < 3 ? k : 0); b.appendChild(e); } else b.appendChild(h("span", "m-carte-jeu m-pk-vide")); }
      var pot = m.fini && m.potFinal != null ? m.potFinal : m.pot + m.mises[0] + m.mises[1];
      zone.appendChild(ajout(tapis(), siege(lui), b, h("small", "m-pk-pot", "Pot : " + pot + " jetons"), siege(moi)));
      if (t.fini) {
        pokerStop();
        if (J().etat === "a_jouer") { st = M.mjPokerResultat(st, i, t.gagnant === moi); sauver(); }
        return fin();
      }
      if (m.fini) {
        var g = m.res.couche != null ? (m.res.couche === moi ? "Tu te couches : " + noms[lui] + " prend le pot." : noms[lui] + " se couche : tu prends le pot !")
          : m.res.gagnant === moi ? "Tu gagnes le pot avec : " + m.res.noms[moi] + " !" : m.res.gagnant === lui ? noms[lui] + " gagne avec : " + m.res.noms[lui] + "." : "Égalité : le pot est partagé.";
        zone.appendChild(h("p", "m-mj-res " + (m.res.gagnant === moi ? "m-mj-ok" : m.res.gagnant === lui ? "m-mj-ko" : ""), g));
        zone.appendChild(bouton("Main suivante", "btn m-go", function () { act("donner"); }));
        return;
      }
      var o = Pk.options(t, moi);
      if (!o) {
        var attente = Math.max(0, 30 - Math.floor((Date.now() - x.maj) / 1000));
        zone.appendChild(h("p", "m-pk-info", "⏳ " + noms[lui] + " réfléchit… " + (attente ? attente + " s" : "")));
        if (!attente) zone.appendChild(bouton("Il ne joue plus : il se couche", "btn m-sec", function () { act(null, 0, true); }));
        return;
      }
      var acts = h("div", "m-bas m-pk-acts");
      if (o.coucher) acts.appendChild(bouton("Se coucher", "btn m-sec", function () { act("coucher"); }));
      acts.appendChild(bouton(o.suivre ? "Suivre (" + o.suivre + ")" : "Parler", "btn m-go", function () { act("suivre"); }));
      if (o.relancerMin != null && o.relancerMin < o.relancerMax) acts.appendChild(bouton("Relancer à " + o.relancerMin, "btn m-go", function () { act("relancer", o.relancerMin); }));
      if (o.relancerMax != null) acts.appendChild(bouton("Tapis (" + o.relancerMax + ")", "btn m-go m-pk-tapis", function () { act("tapis"); }));
      zone.appendChild(acts);
    }
  }
  // Bouton « Règles » de chaque jeu du casino (s'ouvre et se referme sur place)
  var REGLES = {
    bj: ["Approche-toi de 21 sans le dépasser.", "Les figures (V, D, R) valent 10, l’As vaut 1 ou 11, les autres cartes leur chiffre.", "« Tirer » : une carte de plus. « Rester » : tu t’arrêtes, le croupier joue.", "Le croupier tire jusqu’à 17 au moins.", "Tu gagnes si tu as plus que lui sans dépasser 21, ou s’il dépasse 21. Égalité : on redistribue."],
    roulette: ["Choisis rouge ou noir.", "La bille s’arrête sur un numéro de 0 à 36.", "Si le numéro est de ta couleur, tu gagnes.", "Le 0 (vert) fait perdre tout le monde."],
    poker: ["Texas Hold’em à deux contre le croupier : 100 jetons chacun.", "Petite blinde 10, grosse blinde 20 : elles changent de joueur à chaque main.", "Tu reçois 2 cartes cachées, puis 5 cartes communes arrivent : le flop (3), le turn (1), la river (1).", "À chaque étape : « Se coucher » (tu abandonnes la main), « Parler » ou « Suivre » (tu payes la mise), « Relancer » (tu augmentes), « Tapis » (tu mises tout).", "À la fin, la meilleure main de 5 cartes gagne le pot : hauteur < paire < double paire < brelan < suite < couleur < full < carré < quinte flush.", "Prends tous les jetons du croupier pour gagner la partie."],
    bjTel: ["Approche-toi de 21 sans le dépasser. L’As vaut 1 ou 11, les figures 10.", "Le croupier tire jusqu’à 17.", "Blackjack d’entrée : la mise × 1,5. « Doubler » : tu doubles la mise et reçois une seule carte.", "Si tu gagnes, la ville empoche la mise ; si tu perds, elle la doit à Monsieur Valentin."],
    rouletteTel: ["Rouge ou noir : la mise × 2. Une douzaine (1-12, 13-24, 25-36) : × 3. Le zéro : × 36.", "Si tu perds, la ville doit la mise à Monsieur Valentin."]
  };
  // Les règles ne s'ouvrent jamais par un appui « en trop » juste après une action de jeu (Tirer, Rester, Miser…) :
  // pendant que la table se redessine, le doigt peut retomber sur le titre des règles.
  var DERNIER_COUP = 0;
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("button")) DERNIER_COUP = Date.now(); }, true);
  function regles(type) {
    var d = h("details", "m-regles"), sm = h("summary", null, "📖 Règles du jeu"); d.appendChild(sm);
    sm.addEventListener("click", function (e) { if (Date.now() - DERNIER_COUP < 900) e.preventDefault(); });
    var l = h("ul"); REGLES[type].forEach(function (t) { l.appendChild(h("li", null, t)); }); d.appendChild(l);
    return d;
  }
  // Musique du casino : joue tant qu'une partie de casino est à l'écran, reprend où elle s'était arrêtée
  function casino(on) { document.body.classList.toggle("m-casino", !!on); if (window.musique) window.musique(); }
  function miniJeu(carte, ev, i) {
    var mj = M.jeuDe(st, i), x = ev.choix[i];
    function J() { return M.jeuDe(st, i); }
    cacherBulle(); carte.innerHTML = ""; casino(true);
    ajout(carte, h("p", "m-cat", "🎰 Casino · " + ev.titre), h("h4", null, mj.jeu === "bj" ? "🃏 Blackjack du maire" : mj.jeu === "poker" ? "♠️ Poker de l’Hôtel de Ville" : "🎡 Roulette de l’Hôtel de Ville"),
      h("p", "m-desc", "Gagne pour prendre la réponse « " + x.t + " ». Si tu perds, elle t’échappe pour ce dossier."), regles(mj.jeu));
    var zone = h("div", "m-mj-zone"); carte.appendChild(zone);
    function fin() {
      var g = J().etat === "gagne";
      if (g) confettis(); else { carte.classList.remove("m-secoue"); void carte.offsetWidth; carte.classList.add("m-secoue"); zone.appendChild(h("span", "m-mj-cadenas", "🔒")); }
      zone.appendChild(h("p", "m-mj-res " + (g ? "m-mj-ok" : "m-mj-ko"), g ? "🎉 Gagné ! Cette réponse est à toi" + (J().xp ? " · +" + J().xp + " XP" : "") + "." : "😬 Perdu… Cette réponse t’échappe, choisis parmi les autres."));
      zone.appendChild(bouton(g ? "Prendre cette réponse" : "Retour au dossier", "btn m-go", function () {
        if (g) { casino(false); var cle = cleVote(), t = st.t, p = voter(cle, i); VOTE = p ? { t: t, i: i, p: p } : null; st = M.choisir(st, BASE, i); sauver(); signal("choix"); return jeu(); }
        modale();
      }));
      if (g) zone.appendChild(bouton("Revoir le dossier", "btn m-sec", modale));
    }
    if (mj.jeu === "poker") return pokerVue(zone, i, J, fin);
    if (mj.jeu === "bj") {
      if (!J().bj) { st = M.mjBlackjack(st, i, "donner"); sauver(); }
      cartesVues = {};
      (function dessin() {
        zone.innerHTML = "";
        var b = J().bj, cache = !b.fini;
        function main(t, l, val) { var m = h("div", "m-bj-main"); l.forEach(function (c, k) { var e = carteJeu(c, cache && t === "c" && k === 1); posee(e, k); m.appendChild(e); }); return ajout(h("div", "m-bj-ligne"), h("small", "m-bj-val", (t === "j" ? "Toi" : "Croupier") + (val != null ? " · " + val : "")), m); }
        zone.appendChild(ajout(tapis(), main("c", b.c, cache ? null : M.valeurMain(b.c)), main("j", b.j, M.valeurMain(b.j))));
        if (!b.fini) {
          zone.appendChild(ajout(h("div", "m-bas"), bouton("Tirer une carte", "btn m-sec", function () { st = M.mjBlackjack(st, i, "tirer"); sauver(); dessin(); }),
            bouton("Rester", "btn m-go", function () { st = M.mjBlackjack(st, i, "rester"); sauver(); dessin(); })));
        } else if (b.res === "egal") {
          zone.appendChild(h("p", "m-mj-res", "🤝 Égalité (" + M.valeurMain(b.j) + ") : on redistribue !"));
          zone.appendChild(bouton("Nouvelle main", "btn m-go", function () { st = M.mjBlackjack(st, i, "donner"); sauver(); cartesVues = {}; dessin(); }));
        } else fin();
      })();
    } else {
      var roue = roueSVG(); zone.appendChild(roue.el);
      var g = ajout(h("div", "m-bas"), bouton("🔴 Rouge", "btn m-mj-rouge", function () { lancer("rouge"); }), bouton("⚫ Noir", "btn m-mj-noir", function () { lancer("noir"); }));
      var aide = h("small", "m-aide", "Le zéro (vert) fait perdre.");
      zone.appendChild(g); zone.appendChild(aide);
      function lancer(pari) {
        if (J().roue) return;
        st = M.mjRoulette(st, i, pari); sauver(); g.remove(); aide.remove();
        roue.lancer(J().roue.n, fin);
      }
    }
  }

  // ---------- Téléphone du maire et dernier pari ----------
  function fermerTel() { var m = document.getElementById("m-telmod"); if (m) m.remove(); document.body.classList.remove("m-modal"); cacherBulle(); casino(false); }
  // Cartes à jouer dessinées en code : valeur dans les coins, grand symbole au centre.
  // Une carte qui apparaît pour la première fois est distribuée, une carte cachée qui se dévoile se retourne.
  var cartesVues = {};
  function carteJeu(c, cache) {
    var d = h("span", "m-carte-jeu" + (cache ? " m-cachee" : "")), cle = String(c), avant = cartesVues[cle];
    if (!cache) {
      var v = c % 13 + 1, coul = Math.floor(c / 13), val = ({ 1: "A", 11: "V", 12: "D", 13: "R" })[v] || String(v), sym = ["♠", "♥", "♦", "♣"][coul];
      ajout(d, h("b", "m-cj-coin", val + "\n" + sym), h("i", null, sym), h("b", "m-cj-coin m-cj-bas", val + "\n" + sym));
      if (coul === 1 || coul === 2) d.classList.add("m-rouge");
    }
    if (!avant) d.classList.add("m-donne"); else if (avant === "cache" && !cache) d.classList.add("m-retourne");
    cartesVues[cle] = cache ? "cache" : "vue";
    return d;
  }
  // Carte distribuée : petit décalage entre les cartes d'une main, et son de carte qui glisse au moment où elle arrive
  var dernierSonCarte = 0;
  function posee(e, k) {
    if (!e.classList.contains("m-donne")) return;
    e.style.animationDelay = k * 0.12 + "s";
    var quand = Math.max(Date.now() + k * 120, dernierSonCarte + 110); dernierSonCarte = quand;
    setTimeout(function () { if (window.sfx) window.sfx("carte"); }, quand - Date.now());
  }
  // Tapis vert du blackjack : sabot de cartes et pile de jetons en décor
  function tapis() {
    var t = h("div", "m-tapis");
    ajout(t, ajout(h("div", "m-sabot"), h("i"), h("i"), h("i")), ajout(h("div", "m-jetons"), h("i"), h("i"), h("i"), h("i")));
    return t;
  }
  // Roulette européenne dessinée en SVG : 37 cases dans l'ordre réel, la roue tourne, la bille roule puis tombe dans la case tirée
  var ORDRE_ROUE = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  var ROUGES_ROUE = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  function roueSVG() {
    var NS = "http://www.w3.org/2000/svg", pas = 360 / 37;
    function el(n, a, p) { var e = document.createElementNS(NS, n); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (p) p.appendChild(e); return e; }
    function pt(r, a) { var t = (a - 90) * Math.PI / 180; return [150 + r * Math.cos(t), 150 + r * Math.sin(t)]; }
    function secteur(r1, r2, a1, a2) { var p1 = pt(r2, a1), p2 = pt(r2, a2), p3 = pt(r1, a2), p4 = pt(r1, a1); return "M" + p1 + "A" + r2 + "," + r2 + " 0 0 1 " + p2 + "L" + p3 + "A" + r1 + "," + r1 + " 0 0 0 " + p4 + "Z"; }
    var boite = h("div", "m-roulette"), svg = el("svg", { viewBox: "0 0 300 300", "aria-hidden": "true" });
    var defs = el("defs", {}, svg), gb = el("radialGradient", { id: "m-rb", cx: "50%", cy: "45%", r: "60%" }, defs);
    el("stop", { offset: "0", "stop-color": "#a0612b" }, gb); el("stop", { offset: "1", "stop-color": "#5a2f12" }, gb);
    var go = el("radialGradient", { id: "m-ro", cx: "40%", cy: "35%", r: "70%" }, defs);
    el("stop", { offset: "0", "stop-color": "#ffe9a8" }, go); el("stop", { offset: ".55", "stop-color": "#f5b21a" }, go); el("stop", { offset: "1", "stop-color": "#9a6a08" }, go);
    el("circle", { cx: 150, cy: 150, r: 148, fill: "url(#m-rb)" }, svg);
    el("circle", { cx: 150, cy: 150, r: 141, fill: "none", stroke: "#f5b21a", "stroke-width": 2 }, svg);
    var roue = el("g", { "class": "m-roue-tourne" }, svg);
    ORDRE_ROUE.forEach(function (n, k) {
      var a1 = k * pas - pas / 2, a2 = a1 + pas, coul = n === 0 ? "#1f8a4c" : ROUGES_ROUE.indexOf(n) >= 0 ? "#c8352e" : "#151515";
      el("path", { d: secteur(100, 138, a1, a2), fill: coul, stroke: "#e9c46a", "stroke-width": .8 }, roue);
      el("path", { d: secteur(80, 100, a1, a2), fill: coul, opacity: .75, stroke: "#e9c46a", "stroke-width": .6 }, roue);
      var q = pt(121, k * pas), t = el("text", { x: q[0], y: q[1], fill: "#fff", "font-size": 11, "font-weight": 800, "text-anchor": "middle", "dominant-baseline": "central", transform: "rotate(" + (k * pas) + " " + q[0] + " " + q[1] + ")" }, roue);
      t.textContent = String(n);
    });
    el("circle", { cx: 150, cy: 150, r: 80, fill: "none", stroke: "#e9c46a", "stroke-width": 1.5 }, roue);
    el("circle", { cx: 150, cy: 150, r: 62, fill: "url(#m-rb)" }, roue);
    el("circle", { cx: 150, cy: 150, r: 34, fill: "url(#m-ro)" }, roue);
    [0, 45, 90, 135].forEach(function (a) { var p1 = pt(56, a), p2 = pt(56, a + 180); el("line", { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: "#f5b21a", "stroke-width": 5, "stroke-linecap": "round" }, roue); });
    el("circle", { cx: 150, cy: 150, r: 12, fill: "#fff3c4", stroke: "#9a6a08", "stroke-width": 2 }, roue);
    boite.appendChild(svg);
    var orbite = h("div", "m-bille-orbite"), bille = h("i", "m-bille"); orbite.appendChild(bille); boite.appendChild(orbite);
    boite.appendChild(h("span", "m-roue-fl", "▼"));
    var res = h("span", "m-roue-num"); boite.appendChild(res);
    return {
      el: boite,
      lancer: function (n, fini) {
        var k = ORDRE_ROUE.indexOf(n), fin = 360 * 5 - k * pas, calme = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
        function montrer() {
          roue.setAttribute("transform", "rotate(" + (fin % 360) + " 150 150)"); orbite.style.transform = "rotate(0deg)"; bille.style.top = "20%";
          res.textContent = String(n); res.className = "m-roue-num " + (n === 0 ? "m-vert" : ROUGES_ROUE.indexOf(n) >= 0 ? "m-rouge" : "m-noir");
          setTimeout(fini, calme ? 300 : 900);
        }
        if (calme || !roue.animate) return montrer();
        var D = 4200;
        roue.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(" + fin + "deg)" }], { duration: D, easing: "cubic-bezier(.15,.6,.25,1)", fill: "forwards" });
        orbite.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(-1440deg)" }], { duration: D, easing: "cubic-bezier(.2,.65,.3,1)", fill: "forwards" });
        // La bille roule sur le bord (rayon 131 sur 300) puis descend dans les cases (rayon 90) : positions en % pour suivre la taille de la roue
        bille.animate([{ top: "6.3%" }, { top: "6.3%", offset: .55 }, { top: "15.3%", offset: .75 }, { top: "18%", offset: .85 }, { top: "20%" }], { duration: D, easing: "ease-out", fill: "forwards" });
        setTimeout(montrer, D + 50);
      }
    };
  }
  // Victoire : pluie de confettis bleu, blanc, rouge et or
  function confettis() {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var c = h("div", "m-confettis"), COUL = ["#2b4fb3", "#ffffff", "#c8352e", "#f5b21a"];
    for (var i = 0; i < 70; i++) {
      var e = h("i"); e.style.left = Math.random() * 100 + "%"; e.style.background = COUL[i % 4];
      e.style.animationDelay = Math.random() * .5 + "s"; e.style.animationDuration = 1.6 + Math.random() * 1.2 + "s";
      e.style.setProperty("--dx", (Math.random() * 160 - 80) + "px"); e.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
      c.appendChild(e);
    }
    document.body.appendChild(c); setTimeout(function () { c.remove(); }, 3400);
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
      tel.innerHTML = ""; casino(!!st.bj && !st.bj.fini || (!!st.offre && (v === "bj" || v === "roulette")));
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
          g.appendChild(option("🎡", "La roulette de la mairie", "Rouge ou noir ×2, une douzaine ×3, le zéro ×36.", function () { dessin("roulette"); }));
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
      tel.appendChild(h("h4", null, type === "bj" ? "🃏 Le blackjack municipal" : "🎡 La roulette de la mairie"));
      tel.appendChild(regles(type === "bj" ? "bjTel" : "rouletteTel"));
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
      tel.innerHTML = ""; casino(true); tel.appendChild(h("h4", null, "🎡 La bille tourne…"));
      var roue = roueSVG(); tel.appendChild(roue.el);
      roue.lancer(st.pariRes.n, function () { if (st.pariRes.gain > 0) confettis(); dessin(); });
    }
    function blackjack() {
      var b = st.bj;
      tel.appendChild(h("h4", null, "🃏 Blackjack · mise " + argent(b.mise)));
      tel.appendChild(regles("bjTel"));
      var main = function (titre, cartes, cache) {
        var d = h("div", "m-main"); d.appendChild(h("small", null, titre + " · " + (cache ? "?" : M.valeurMain(cartes))));
        var r = h("div", "m-cartes"); cartes.forEach(function (c, i) { var e = carteJeu(c, cache && i === 1); posee(e, i); r.appendChild(e); }); d.appendChild(r); return d;
      };
      if (!b.fini && b.j.length === 2 && b.c.length === 2) cartesVues = {};
      tel.appendChild(ajout(tapis(), main("Croupier (Monsieur Valentin)", b.c, !b.fini), main("Toi", b.j, false)));
      if (!b.fini) {
        var acts = h("div", "m-bas");
        acts.appendChild(bouton("Tirer une carte", "btn m-go", function () { st = M.bjTirer(st); sauver(); dessin(); }));
        acts.appendChild(bouton("Rester", "btn m-sec", function () { st = M.bjRester(st); sauver(); dessin(); }));
        if (b.j.length === 2 && b.mise * 2 <= M.pariMise(st)) acts.appendChild(bouton("Doubler (" + argent(b.mise * 2) + ")", "btn m-sec", function () { st = M.bjDoubler(st); sauver(); dessin(); }));
        tel.appendChild(acts);
      } else {
        tel.appendChild(h("p", "m-res " + (b.res.gain > 0 ? "m-gain" : b.res.gain < 0 ? "m-perte" : ""), b.res.txt));
        if (st.leon && st.leon.t === st.t) tel.appendChild(ajout(h("div", "m-leon m-leon-clair"), h("span", "m-leon-ico", "🧑‍💼"), h("p", null, "« " + st.leon.txt + " »")));
        tel.appendChild(bouton("Retour à ma mairie", "btn m-go", retourJeu));
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
      tel.appendChild(bouton("Retour à ma mairie", "btn m-go", function () { st.pariRes = null; sauver(); retourJeu(); }));
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
    vider(); fermerModale();
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
    // En session : tes bâtiments se regroupent dans ton arrondissement, et chaque arrondissement est une zone cliquable
    var ses = st.session && SES.s && SS() ? SES.s : null, moiP = ses ? SS().placeDe(ses, moiSes()) : -1, centre = null;
    if (ses && moiP >= 0 && moiP < SS().TRONE) { var A = SS().ARR[SS().arr(moiP)]; centre = { x: A.x, y: A.y, k: A.r * 1.4 / 45 }; }
    if (ses) zones(cadre, ses, moiP);
    M.planVille(st).forEach(function (b) {
      if (centre) b = Object.assign({}, b, { x: centre.x + (b.x - 50) * centre.k, y: centre.y + (b.y - 49) * centre.k * 1.5 });
      var dessin = !!DESSINS[b.id], e = dessin ? h("img", "m-v m-v-img") : h("span", "m-v" + (b.gros ? " m-v-gros" : ""), b.ico);
      if (dessin) { e.src = srcBat(b.id); e.alt = ""; e.decoding = "async"; }
      if (nouveaux && nouveaux[b.id + ":" + b.k]) e.classList.add("m-v-neuf");
      e.style.left = b.x + "%"; e.style.top = b.y + "%"; e.style.zIndex = Math.round(b.y * 10); e.title = b.nom; cadre.appendChild(e);
    });
    return cadre;
  }
  // Les 20 arrondissements sur le plan : le tien en or, ceux que tu n'as pas encore atteints grisés, tous cliquables pour comparer
  function zones(cadre, ses, moiP) {
    for (var p = 0; p < SS().TRONE; p++) (function (p) {
      var A = SS().ARR[SS().arr(p)], f = SS().fiche(ses, p), rel = p === moiP ? " m-z-moi" : p > moiP ? " m-z-haut" : " m-z-bas";
      var z = h("button", "m-zone" + rel + (p === moiP + 1 ? " m-z-rival" : "") + (f.type === "joueur" && p !== moiP ? " m-z-joueur" : ""));
      z.type = "button"; z.style.left = A.x + "%"; z.style.top = A.y + "%"; z.style.width = A.r * 2 + "%";
      z.title = f.court + " · " + f.nom + (f.type === "bot" ? " (robot)" : "");
      z.setAttribute("aria-label", z.title);
      ajout(z, h("b", null, f.court), h("span", null, p === moiP ? "Toi" : p > moiP ? "🔒" : f.ico));
      z.onclick = function (e) { e.stopPropagation(); ficheSession(p); };
      cadre.appendChild(z);
    })(p);
    var tr = SS().fiche(ses, SS().TRONE), t = h("button", "m-trone-pl" + (moiP >= SS().TRONE ? " m-z-moi" : ""));
    t.type = "button"; ajout(t, h("span", null, "👑"), h("b", null, moiP >= SS().TRONE ? "Tu es Maire de Paris" : "Maire de Paris : " + tr.nom));
    t.onclick = function (e) { e.stopPropagation(); ficheSession(SS().TRONE); }; cadre.appendChild(t);
  }
  function carteVille(fin) {
    var l = M.planVille(st), nouveaux = {};
    // Ce qui vient d'être construit depuis le dernier affichage apparaît avec une petite animation
    if (villeVue && villeVue.pid === st.pid) l.forEach(function (b) { if (!villeVue.l[b.id + ":" + b.k]) nouveaux[b.id + ":" + b.k] = 1; });
    villeVue = { pid: st.pid, l: {} }; l.forEach(function (b) { villeVue.l[b.id + ":" + b.k] = 1; });
    var d = h("details", "m-ville"); d.open = fin || villeOuverte; d.ontoggle = function () { if (!fin) villeOuverte = d.open; };
    d.appendChild(ajout(h("summary"), h("span", null, "🗺️ " + (fin ? "Le Paris que tu laisses" : st.session ? (st.session.place >= 20 ? "Ton Paris" : "Ton " + (SS() ? SS().court(st.session.place) : "") + " arrondissement") : "Ton Paris")), h("small", null, l.length + " bâtiment" + (l.length > 1 ? "s" : "") + " sur le plan")));
    var p = plan(false, nouveaux); p.onclick = function () { pleinEcranVille(); }; d.appendChild(p);
    if (!l.length) d.appendChild(h("small", "m-aide", "Achète ton premier bâtiment : il apparaîtra ici, dans ton arrondissement."));
    if (fin) d.appendChild(ajout(h("div", "m-bas"), bouton("🔍 Agrandir", "btn m-sec", pleinEcranVille), l.length ? bouton("📸 Partager ma ville", "btn m-go", partagerVille) : null));
    else if (l.length) d.appendChild(ajout(h("div", "mx-villebas"), h("small", null, "Touche le plan pour l’agrandir"), bouton("📸 Partager", "mx-lien", partagerVille)));
    if (!fin) d.appendChild(journal());
    return d;
  }
  // ---------- Le Journal de Paris : ce que disent les habitants, pour savoir ce qu'ils attendent ----------
  var PRENOMS = ["Inès", "Karim", "Léa", "Mamadou", "Chloé", "Yanis", "Sophie", "Lucas", "Fatou", "Hugo", "Camille", "Rayan", "Manon", "Théo", "Aïcha", "Jules", "Sarah", "Nathan", "Jeanne", "Malik"];
  function journal() {
    var bes = M.besoin(st), p = st.piliers, ch = M.chomage(st), plein = (st.hab || M.HAB0) >= M.capacite(st), so = M.solde(st), l = [];
    // Chaque sujet : gravité (plus c'est haut, plus il passe en premier), titre de une, citations possibles
    // plainte : un reproche général (sécurité, chômage, dette…), qui ne revient qu'un trimestre sur trois
    var plaintes = [];
    function sujet(g, une, cits, plainte) { (plainte ? plaintes : l).push({ g: g, une: une, cits: cits }); }
    if (p.securite < bes) sujet(bes - p.securite + 10, "Insécurité : les Parisiens inquiets", ["Je ne sors plus le soir, ma rue n’est pas sûre.", "Trois vols de vélo dans mon immeuble ce mois-ci.", "On veut plus de policiers dans le quartier !"], 1);
    if (p.cadre < bes) sujet(bes - p.cadre + 10, "Cadre de vie : la ville étouffe", ["Pas un parc à moins de vingt minutes de chez moi…", "Mes enfants jouent sur le parking, faute de mieux.", "Paris manque d’arbres et d’endroits pour respirer."], 1);
    if (ch > 10) sujet((ch - 10) * 3 + 10, "Chômage : " + virg(ch) + " % des Parisiens sans emploi", ["Ça fait huit mois que je cherche du travail.", "Il faudrait des commerces et des entreprises dans le quartier.", "Mon fils a fini ses études et ne trouve rien."], 1);
    if (plein && st.pop >= 50) sujet(12, "Crise du logement : plus une place libre", ["Impossible de trouver un appartement, il faut construire !", "Douze visites, douze refus. Paris est plein.", "Je vais devoir partir en banlieue, faute de logement."], 1);
    if (p.logement < 40) sujet(45 - p.logement, "Loyers : la colère monte", ["1 400 € pour 18 m², c’est une blague ?", "Mon loyer a encore augmenté.", "Les logements sociaux, il y a dix ans d’attente."], 1);
    if (p.transports < 40) sujet(45 - p.transports, "Transports : la galère quotidienne", ["Ligne 13 bondée, encore et toujours.", "Une heure pour traverser Paris en bus…", "Le métro est en panne une fois sur deux."], 1);
    if (st.dette > M.PLAFOND_DETTE * 0.5) sujet(14, "Finances : la dette inquiète", ["La mairie dépense trop, qui va payer ?", "On paiera les dettes de la ville pendant vingt ans."], 1);
    if (so < 0) sujet(8, "Budget dans le rouge", ["Les caisses se vident chaque trimestre.", "Il faudrait des recettes, pas que des dépenses."], 1);
    if (st.habDelta < -3000) sujet(9, Math.abs(st.habDelta).toLocaleString("fr-FR") + " Parisiens ont quitté la ville", ["Mes voisins sont partis à Lyon.", "Tout le monde part, ça fait de la peine."], 1);
    if (st.habDelta > 3000) sujet(3, "Paris attire : " + st.habDelta.toLocaleString("fr-FR") + " nouveaux habitants", ["On vient d’emménager, on adore le quartier !", "Paris, ça reste Paris."]);
    if (M.bonheur(st) >= 60) sujet(2, "Les Parisiens heureux", ["Franchement, la ville n’a jamais été aussi agréable.", "Bravo à la mairie pour le quartier."]);
    if (st.pop >= 55) sujet(1, "Le maire au sommet des sondages", ["Je revoterai pour lui sans hésiter.", "Enfin un maire qui écoute."]);
    // Besoins exprimés par les habitants : on en parle quand ils apparaissent, deux trimestres après, puis un trimestre sur deux quand des familles partent
    M.etatBesoins(st).forEach(function (b) {
      if (!b.dit || !(b.age === 0 || b.age === 2 || (b.age >= 4 && b.age % 2 === 0))) return;
      var c = CITS_BESOINS[b.id] || ["Il nous faudrait des " + b.nom + ".", "Toujours pas " + de(b.nom) + " !", "On part, il n’y a pas " + de(b.nom) + " ici."];
      var et = b.age >= 4 ? 2 : b.age >= 2 ? 1 : 0;
      sujet(16 + b.age * 3, [b.ico + " Les Parisiens réclament des " + b.nom, b.ico + " Toujours pas " + de(b.nom) + " : la colère monte", b.ico + " Faute " + de(b.nom) + ", des familles quittent Paris"][et], [c[et]]);
    });
    Object.keys(st.besoinsOk || {}).forEach(function (id) {
      var b = M.BESOINS.filter(function (x) { return x.id === id; })[0]; if (b && st.besoinsOk[id] === st.t) sujet(5, b.ico + " Enfin des " + b.nom + " !", ["Merci pour les nouveaux " + b.nom + ", ça change la vie."]);
    });
    if (st.t % 3 === 0 && plaintes.length) { plaintes.sort(function (a, b) { return b.g - a.g; }); l.push(plaintes[0]); }
    // Le reste du temps, la vie parisienne : faits divers et petites nouvelles
    for (var k = 0; l.length < 3 && k < 2; k++) { var f = FAITS[(st.t * 3 + k * 5) % FAITS.length]; l.push({ g: -1 - k, une: f[0], cits: [f[1]] }); }
    l.sort(function (a, b) { return b.g - a.g; });
    var d = h("div", "m-journal");
    d.appendChild(ajout(h("div", "m-journal-tete"), h("b", null, "Le Journal de Paris"), h("small", null, "n° " + st.t)));
    // Dépêche du rival : en tête du journal, tant que le manque n'est pas comblé
    var o = st.opposant && st.opposant.actif ? M.opposant(st) : null;
    if (st.depeche && o) {
      var bd = M.BESOINS.filter(function (x) { return x.id === st.depeche.id; })[0];
      d.appendChild(ajout(h("div", "m-depeche"), h("b", null, "⚡ DÉPÊCHE · " + o.nom), h("q", null, (DEPECHES[st.depeche.id] || "Ce maire laisse Paris sans " + (bd ? bd.nom : "rien") + " !")),
        h("small", null, "Des Parisiens partent chaque trimestre tant que tu ne construis pas " + (bd ? de(bd.nom) : "de quoi répondre") + ".")));
    }
    d.appendChild(h("p", "m-journal-une", l[0].une));
    var u = h("ul");
    l.slice(0, 3).forEach(function (x, k) {
      var c = x.cits[(st.t + k) % x.cits.length], n = PRENOMS[(st.t * 7 + k * 3) % PRENOMS.length], age = 19 + (st.t * 13 + k * 17) % 60, arr = 1 + (st.t * 5 + k * 11) % 20;
      u.appendChild(ajout(h("li"), h("q", null, c), h("small", null, n + ", " + age + " ans, " + arr + (arr === 1 ? "er" : "e"))));
    });
    d.appendChild(u);
    // Le mot du rival, à chaque numéro
    if (o) {
      var tm = M.trimMandat(st), proch = (Math.floor(tm / 4) + 1) * 4 - tm, so = M.sondage(st);
      var mot = st.depeche ? "Je l’avais dit : ce maire n’écoute personne." : so < 48 ? "Les Parisiens en ont assez. Je serai leur prochain maire." : proch <= 1 ? "Mon heure approche. Ce maire va le sentir passer." : so > 55 ? "Profitez-en, ça ne durera pas." : "Je surveille chaque erreur de ce maire.";
      d.appendChild(ajout(h("div", "m-rival"), h("span", null, o.ico), ajout(h("div"), h("small", null, "Le mot de ton rival · " + o.nom + (st.opposant.revanche ? " (revanche n° " + st.opposant.revanche + ")" : "")), h("q", null, mot))));
    }
    return d;
  }
  // « de écoles » → « d’écoles »
  function de(n) { return (/^[aeiouyhéèêàâ]/i.test(n) ? "d’" : "de ") + n; }
  var FAITS = [
    ["🐦 Un pigeon élu mascotte du 11e", "Il s’appelle Gérard et il est plus ponctuel que la ligne 13."],
    ["☀️ Les terrasses prises d’assaut", "Un café en terrasse au soleil, il n’y a que ça de vrai."],
    ["🥐 Concours du meilleur croissant", "Le jury a goûté 140 croissants. Il ne veut plus jamais en voir."],
    ["🐀 Un rat filmé sur un Vélib’", "Franchement, il pédalait mieux que moi."],
    ["📚 Les bouquinistes des quais en fête", "J’ai trouvé une édition de 1923 pour deux euros !"],
    ["🎭 Une pièce de théâtre affiche complet depuis un an", "J’ai réservé pour 2028, on verra bien."],
    ["🛶 Des Parisiens se baignent dans la Seine", "Elle est un peu fraîche, mais elle est propre !"],
    ["🧀 Record d’affluence au marché du dimanche", "Le fromager connaît mon prénom, c’est ça Paris."],
    ["🎸 Fête de la musique : 18 groupes dans la même rue", "Personne ne jouait la même chanson, c’était magnifique."],
    ["🗼 La tour Eiffel s’illumine en avance", "Tout le quartier a sorti les téléphones en même temps."]
  ];
  var CITS_BESOINS = {
    parcs: ["Un petit parc pour les enfants, c’est trop demander ?", "Toujours pas un brin d’herbe dans le quartier !", "On déménage à la campagne, ici il n’y a même pas un parc."],
    manger: ["Il faut traverser tout l’arrondissement pour acheter du pain.", "Pas une boulangerie, pas un kebab : on mange quoi ?", "On part, ici on ne trouve même pas de quoi manger."],
    transports: ["Il nous faudrait des pistes cyclables et des bus.", "Toujours aucun transport correct, ça devient pénible !", "Trop loin de tout : on quitte Paris."],
    police: ["Un commissariat de quartier, ça rassurerait tout le monde.", "Toujours pas de policiers, la nuit ça craint !", "On part, on ne se sent plus en sécurité."],
    ecoles: ["Mes enfants font 40 minutes de trajet pour aller à l’école.", "Toujours pas d’école dans le quartier, c’est une honte !", "On quitte Paris : pas d’école pour nos enfants."],
    culture: ["Une médiathèque, un cinéma… il n’y a rien à faire ici.", "Toujours aucun lieu de culture, Paris s’ennuie !", "On part, cette ville est devenue une cité-dortoir."],
    pompiers: ["Si le feu prend, les pompiers mettent une éternité.", "Toujours pas de caserne de pompiers, on a peur !", "On part avant qu’un drame arrive."],
    sport: ["Pas une piscine ni un stade pour faire du sport.", "Toujours pas d’équipement sportif, nos jeunes tournent en rond !", "On part, il n’y a rien pour bouger ici."],
    proprete: ["Les trottoirs sont sales, il faut des agents de propreté.", "Les poubelles débordent, toujours personne pour nettoyer !", "On part, la rue est devenue une décharge."],
    sante: ["Trois mois d’attente pour voir un médecin.", "Toujours pas de centre de santé, on se soigne comment ?", "On part : se soigner à Paris est devenu impossible."]
  };
  var DEPECHES = {
    parcs: "Pas un parc digne de ce nom : ce maire étouffe les Parisiens !", manger: "Des quartiers entiers sans un commerce : ce maire affame Paris !",
    transports: "Paris paralysé : ce maire laisse les Parisiens à pied !", police: "Les rues livrées à elles-mêmes : où est la police de ce maire ?",
    ecoles: "Pas une école digne de ce nom : ce maire abandonne nos enfants !", culture: "Paris, capitale de la culture ? Sous ce maire, il n’y a plus rien !",
    pompiers: "Sans caserne de pompiers, ce maire joue avec la vie des Parisiens !", sport: "Ni piscine ni stade : ce maire oublie la jeunesse !",
    proprete: "Paris croule sous les déchets : ce maire a baissé les bras !", sante: "Des déserts médicaux en plein Paris : ce maire est responsable !"
  };
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
      x.fillText("Mandat " + st.mandat + " · " + M.duree(st.t) + " à la mairie · score " + bi.score + " · " + location.host, W / 2, 112);
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
    decouvertes(); statsPartie(true);
    vider(); fermerModale();
    choixNiveau(st.niveau);
    var b = M.bilan(st), an = M.analyse(st), e = st.elections[st.elections.length - 1];
    var type = st.fin.raison.type, t = h("div", "m-final " + (type === "defi" || type === "retraite" ? "m-gagne" : "m-perdu"));
    ajout(t, h("p", "m-sur", (st.defi != null ? "Défi du jour · " : "") + ({ election: "Battu aux élections", faillite: "Faillite", demission: "Démission", defi: "Défi terminé", retraite: "Victoire" })[type]),
      h("h4", null, b.mandats ? "Fin de règne après " + M.duree(b.t) + " et " + b.mandats + " réélection" + (b.mandats > 1 ? "s" : "") : "Ton aventure s’arrête au bout de " + M.duree(b.t)),
      h("p", "m-raison", st.fin.raison.txt), h("p", "m-score", "Score : " + b.score));
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
        if (window.lbSubmit) lbSubmit("xp_maire", res.profil.xp).then(function () { if (window.LB) G.ligue(LB.docs || [], LB.uid); envoyerLigue(); });
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
      l.appendChild(ajout(h("div"), h("b", null, "📊 Mieux que " + pc + " % des maires"), h("small", null, "sur " + docs.length + " joueurs classés")));
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
    var texte = "🏛️ Maire de Paris — « " + b.style.titre + " ». " + b.recit + " Score : " + b.score + ". " + location.origin + location.pathname;
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
    if (false && p.passPts) c.appendChild(h("p", "m-debl", "🎟️ +" + p.passPts + " points de pass de combat" + ((p.passPaliers || []).length ? " · palier" + (p.passPaliers.length > 1 ? "s " : " ") + p.passPaliers.map(function (x) { return x.n; }).join(", ") + " atteint" + (p.passPaliers.length > 1 ? "s" : "") : "")));
    (p.passPaliers || []).forEach(function (x) { c.appendChild(h("p", "m-debl", "🎁 Palier " + x.n + " : " + x.txt)); });
    (p.debloque || []).forEach(function (nom) { c.appendChild(h("p", "m-debl", "🔓 Débloqué : " + nom)); });
    var u = h("ul", "m-liste");
    p.gains.forEach(function (x) { var li = h("li", "m-up"); ajout(li, h("span", null, x.txt), h("b", null, "+" + x.xp + " XP")); u.appendChild(li); });
    c.appendChild(u);
    var barre = h("div", "m-barre"), i = h("i"); i.style.width = n.pct + "%"; barre.appendChild(i);
    ajout(c, h("small", null, "Niveau " + n.n + " · " + n.titre + (n.max ? "" : " · " + n.depuis + " / " + n.besoin + " XP")), barre);
  }

  // Envoie l'XP totale au classement général (au plus une fois par minute, et seulement si elle a augmenté)
  var xpEnvoye = 0, xpEnvoyeA = 0;
  function envoyerClassement(force) {
    if (!window.lbSubmit) return;
    var tot = (G.lire().xp || 0) + (st && st.phase !== "fin" ? st.xp || 0 : 0);
    if (tot <= xpEnvoye || (!force && Date.now() - xpEnvoyeA < 60000)) return;
    xpEnvoye = tot; xpEnvoyeA = Date.now();
    lbSubmit("xp_maire", tot).then(function () { if (window.lbRender) lbRender(); });
  }
  window.maireInit = function () {
    box = document.getElementById("m-app");
    if (!box || box.dataset.ok) return;
    box.dataset.ok = "1";
    choixNiveau();
    // Classement général : l'XP de maire (profil + partie en cours), mise à jour pendant qu'on joue
    if (window.lbBoard) lbBoard("lb-maire", function () { return "xp_maire"; }, function () { return "🏆 Classement général · Maire de Paris"; }, function (x) { return "Niv. " + G.niveau(x).n + " · " + x.toLocaleString("fr-FR") + " XP"; });
    accueil();
  };
  window.maireStop = function () { fermerModale(); };
})();
