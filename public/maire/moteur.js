// Maire de Paris : moteur du jeu, sans interface (utilisable dans le navigateur et dans Node pour les tests).
// L'état de partie est un objet simple, sauvegardable tel quel. Chaque étape (début de tour, choix) part
// de l'état précédent et produit le nouvel état : recharger la page ne rejoue jamais un effet déjà appliqué.
(function (root) {
  "use strict";

  var TOURS = 100, SEUIL = 30;
  var DEPART = { pop: 58, bon: 58, coh: 70, tresor: 1000 };
  var FONCT = { recettes: 200, depenses: 209 };          // fonctionnement courant (M€ par semaine), légèrement déficitaire
  var PLAFOND_DETTE = 1000, TAUX = 0.003;               // emprunt autorisé et intérêts par semaine

  // Réglages d'équilibrage (vérifiés par tools/maire/test-moteur.mjs)
  var P = { domRepos: 43, domVit: 0.03, bonVit: 0.05, popVit: 0.04, usure: 0.22, detteImpop: 120,
    cohRepos: 50, cohVit: 0.015, aliPlus: 0.8, aliMoins: 1.6, probleme: 3.7, ambMult: 2.5, ambSeuil: 52, problemeAmb: 0.3, retombees: 0.16, elecCentre: 45 };
  // Opposants (personnages fictifs) : tirés au sort en début de partie, ils attaquent toutes les 10 semaines
  var OPPOSANTS = [
    { nom: "Victor Delaunay", ico: "🎩", txt: "Ancien ministre, orateur redoutable qui rêve de l’Hôtel de Ville." },
    { nom: "Claire Montfort", ico: "🏛️", txt: "Sénatrice aux réseaux immenses, patiente et méthodique." },
    { nom: "Hugo Valmy", ico: "📱", txt: "Jeune influenceur politique suivi par deux millions de personnes." },
    { nom: "Mathilde Ferrand", ico: "📢", txt: "Présidente du premier groupe d’opposition au Conseil de Paris." },
    { nom: "Bernard Castagne", ico: "📰", txt: "Patron de presse qui fait et défait les réputations." },
    { nom: "Inès Haddad", ico: "✊", txt: "Syndicaliste charismatique, capable de remplir les rues." },
    { nom: "Paul-Émile Roux", ico: "🏘️", txt: "Maire d’arrondissement frondeur, très populaire dans son quartier." },
    { nom: "Sophie Laborde", ico: "🗂️", txt: "Ton ancienne adjointe : elle connaît tous tes dossiers." },
    { nom: "Marc Ollivier", ico: "💼", txt: "Homme d’affaires fortuné, candidat déclaré à ta succession." },
    { nom: "Léa Brunet", ico: "🌱", txt: "Militante associative adorée des jeunes Parisiens." },
    { nom: "Antoine Mercier", ico: "♟️", txt: "Député et stratège, il ne laisse rien au hasard." },
    { nom: "Nadia Kessler", ico: "⚖️", txt: "Avocate médiatique qui traque la moindre irrégularité." }
  ];
  var FORCE_OPP = { facile: [25, 60], moyen: [35, 75], difficile: [50, 90] };   // influence de départ selon le niveau
  var ATTAQUES = [
    { titre: "publie une tribune assassine", desc: "Dans un grand quotidien, {nom} démolit ta gestion point par point.", cible: "pop" },
    { titre: "mobilise ses soutiens dans la rue", desc: "{nom} appelle à manifester contre ta politique ; les cortèges grossissent.", cible: "bon" },
    { titre: "dépose une motion de défiance", desc: "Au Conseil de Paris, {nom} tente de retourner tes propres élus contre toi.", cible: "coh" },
    { titre: "enchaîne les plateaux télé", desc: "Toute la semaine, {nom} occupe les écrans pour dénoncer tes choix.", cible: "pop" },
    { titre: "lance une pétition contre ton projet phare", desc: "La pétition de {nom} dépasse les 100 000 signatures en trois jours.", cible: "bon" },
    { titre: "débauche un de tes adjoints", desc: "{nom} convainc un de tes proches de claquer la porte avec fracas.", cible: "coh" },
    { titre: "saisit la justice sur un marché public", desc: "{nom} accuse la mairie de favoritisme et alerte la presse.", cible: "pop" },
    { titre: "organise un grand meeting", desc: "Salle comble pour {nom}, qui se pose en recours face à ton échec.", cible: "pop" },
    { titre: "révèle un rapport embarrassant", desc: "{nom} publie un rapport interne qui pointe les retards de tes chantiers.", cible: "bon" }
  ];
  var SEUIL_OPP = 15;   // sous cette influence, l'opposant renonce et quitte la vie politique

  var LIGNES = {
    gauche: { nom: "Gauche", txt: "Services publics, solidarité et réduction des inégalités." },
    centre: { nom: "Centre", txt: "Compromis, équilibre budgétaire et réformes pragmatiques." },
    droite: { nom: "Droite", txt: "Sécurité, maîtrise des dépenses et attractivité économique." },
    ecologie: { nom: "Écologie", txt: "Environnement, mobilités douces et transition écologique." }
  };
  var CODE_LIGNE = { g: "gauche", c: "centre", d: "droite", e: "ecologie" };
  var DOMAINES = {
    securite: "Sécurité", proprete: "Propreté", logement: "Logement", transports: "Transports",
    ecologie: "Écologie", achat: "Pouvoir d’achat", economie: "Économie", services: "Services publics"
  };
  var CATS = {
    finances: "Finances", securite: "Sécurité", proprete: "Propreté", logement: "Logement",
    transports: "Transports", ecologie: "Écologie", economie: "Économie", services: "Services publics",
    culture: "Culture et tourisme", quotidien: "Vie quotidienne", institutions: "Relations institutionnelles",
    crise: "Crises exceptionnelles"
  };
  // Événements spéciaux, hors des 12 catégories : 3 catastrophes par partie, et une chance sur deux d'avoir un coup de chance
  var SPECIAUX = { catastrophe: "Catastrophe", chance: "Coup de chance" };
  var NB_CATASTROPHES = 3, PROBA_CHANCE = 0.5;
  // Niveaux de difficulté (le niveau « difficile » s'affiche « Réaliste ») : le niveau moyen correspond aux réglages ci-dessus, les autres les ajustent
  var NIVEAUX = {
    facile: { nom: "Facile", txt: "Finances plus souples, moins d’usure du pouvoir, 2 catastrophes.",
      seuil: 28, tresor: 1200, depenses: 205, usure: 0.19, probleme: 3.5, catastrophes: 2 },
    moyen: { nom: "Moyen", txt: "L’équilibre classique : 3 catastrophes, popularité et bonheur au-dessus de 30.",
      seuil: SEUIL, tresor: DEPART.tresor, depenses: FONCT.depenses, usure: P.usure, probleme: P.probleme, catastrophes: NB_CATASTROPHES },
    difficile: { nom: "Réaliste", txt: "Caisses plus vides, Parisiens plus exigeants, 4 catastrophes.",
      seuil: 32, tresor: 800, depenses: 211, usure: 0.24, probleme: 4.0, catastrophes: 4 }
  };
  function niv(st) { return NIVEAUX[st && st.niveau] || NIVEAUX.moyen; }   // anciennes sauvegardes : niveau moyen
  function seuil(st) { return niv(st).seuil; }

  // Domaine naturellement lié à chaque catégorie (pour favoriser les événements liés aux ambitions)
  var CAT_DOM = { securite: "securite", proprete: "proprete", logement: "logement", transports: "transports",
    ecologie: "ecologie", economie: "economie", services: "services", finances: "achat", quotidien: "achat" };
  var COND = ["popMin", "popMax", "bonMin", "bonMax", "cohMin", "cohMax", "tresorMin", "tresorMax", "detteMin",
    "apres", "avant", "ligne", "amb", "flag", "sansFlag"];

  // ---------- Hasard reproductible (sauvegardé dans l'état) ----------
  function rnd(st) {
    st.rng = (st.rng + 0x6D2B79F5) | 0;
    var t = Math.imul(st.rng ^ (st.rng >>> 15), 1 | st.rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rndT(st) {
    if (st.rngT == null) return rnd(st);
    var o = { rng: st.rngT }, r = rnd(o); st.rngT = o.rng; return r;
  }
  function copie(o) { return JSON.parse(JSON.stringify(o)); }
  function borne(x) { return Math.max(0, Math.min(100, Math.round(x * 10) / 10)); }
  // Les effets annoncés varient de ±25 % : on ne peut pas tout calculer à l'avance
  function varie(st, v) {
    if (!v) return 0;
    var r = v * (0.75 + 0.5 * rnd(st));
    var n = Math.abs(v) >= 3 ? Math.round(r) : Math.round(r * 10) / 10;
    return n === 0 ? (v > 0 ? 1 : -1) : n;
  }

  // ---------- Validation d'un événement ----------
  function num(x, a, b) { return typeof x === "number" && isFinite(x) && x >= a && x <= b; }
  function validerEffets(e, err, ou) {
    if (!e || typeof e !== "object") { err.push(ou + " : effets absents"); return 0; }
    var n = 0;
    ["pop", "bon", "coh"].forEach(function (k) { if (e[k] != null) { if (!num(e[k], -20, 20)) err.push(ou + " : " + k + " hors limites"); else if (e[k]) n++; } });
    if (e.bud != null) { if (!num(e.bud, -800, 800)) err.push(ou + " : budget hors limites"); else if (e.bud) n++; }
    if (e.rec) {
      if (!num(e.rec.m, -40, 40) || !num(e.rec.n, 1, 80) || e.rec.n % 1) err.push(ou + " : dépense récurrente invalide"); else n++;
    }
    if (e.dom) Object.keys(e.dom).forEach(function (k) {
      if (!DOMAINES[k]) err.push(ou + " : domaine inconnu « " + k + " »");
      else if (!num(e.dom[k], -25, 25)) err.push(ou + " : domaine " + k + " hors limites"); else n++;
    });
    Object.keys(e).forEach(function (k) { if (["pop", "bon", "coh", "bud", "rec", "dom"].indexOf(k) < 0) err.push(ou + " : clé inconnue « " + k + " »"); });
    return n;
  }
  function valider(ev, ids) {
    var err = [];
    if (!ev || typeof ev !== "object") return ["événement vide"];
    var id = ev.id || "?";
    if (!/^[a-z]{2,6}-\d{3,5}$/.test(ev.id || "")) err.push(id + " : identifiant invalide");
    if (!CATS[ev.cat] && !SPECIAUX[ev.cat]) err.push(id + " : catégorie inconnue");
    if (!ev.titre || ev.titre.length < 6 || ev.titre.length > 90) err.push(id + " : titre manquant ou de mauvaise longueur");
    if (!ev.desc || ev.desc.length < 30 || ev.desc.length > 420) err.push(id + " : description manquante ou de mauvaise longueur");
    if (ev.cond) Object.keys(ev.cond).forEach(function (k) {
      if (COND.indexOf(k) < 0) err.push(id + " : condition inconnue « " + k + " »");
      if (k === "ligne" && (!Array.isArray(ev.cond.ligne) || ev.cond.ligne.some(function (l) { return !LIGNES[l]; }))) err.push(id + " : condition de ligne invalide");
      if (k === "amb" && !DOMAINES[ev.cond.amb]) err.push(id + " : condition d’ambition invalide");
      if (/Min$|Max$|^apres$|^avant$/.test(k) && !num(ev.cond[k], -5000, 5000)) err.push(id + " : condition " + k + " invalide");
    });
    if (!Array.isArray(ev.choix) || ev.choix.length !== 3) { err.push(id + " : il faut exactement trois choix"); return err; }
    var titres = {};
    ev.choix.forEach(function (c, i) {
      var ou = id + " choix " + "ABC"[i];
      if (!c.t || c.t.length < 4 || c.t.length > 90) err.push(ou + " : titre manquant ou trop long");
      if (!c.d || c.d.length < 5 || c.d.length > 240) err.push(ou + " : indice manquant ou trop long");
      if (!c.r || c.r.length < 15 || c.r.length > 420) err.push(ou + " : résultat manquant ou trop long");
      var k = (c.t || "").toLowerCase(); if (titres[k]) err.push(ou + " : même titre qu’un autre choix"); titres[k] = 1;
      var n = validerEffets(c.e, err, ou);
      if (c.ali) Object.keys(c.ali).forEach(function (l) { if (!CODE_LIGNE[l] || !num(c.ali[l], -5, 5)) err.push(ou + " : alignement invalide"); });
      else err.push(ou + " : alignement politique absent");
      (c.dif || []).forEach(function (d) { if (!num(d.n, 1, 30) || !d.txt) err.push(ou + " : effet différé invalide"); n += validerEffets(d.e, err, ou + " (différé)"); });
      if (c.alea) { if (!num(c.alea.p, 5, 60) || !c.alea.txt) err.push(ou + " : aléa invalide"); validerEffets(c.alea.e, err, ou + " (aléa)"); }
      if (c.suite) { if (!num(c.suite.n, 1, 30) || (ids && !ids[c.suite.id])) err.push(ou + " : suite vers un événement introuvable (" + c.suite.id + ")"); }
      if (!n) err.push(ou + " : aucun effet");
    });
    return err;
  }

  // ---------- Création de partie ----------
  function nouvellePartie(o) {
    if (!LIGNES[o.ligne]) throw new Error("Ligne politique inconnue");
    var amb = (o.ambitions || []).filter(function (a, i, t) { return DOMAINES[a] && t.indexOf(a) === i; });
    if (amb.length !== 2) throw new Error("Il faut choisir exactement deux ambitions");
    var dom = {}; Object.keys(DOMAINES).forEach(function (k) { dom[k] = 50; });
    var st = {
      v: 1, niveau: NIVEAUX[o.niveau] ? o.niveau : "moyen", rng: (o.graine >>> 0) || ((Math.random() * 4294967296) >>> 0), lots: o.lots || [],
      ligne: o.ligne, ambitions: amb, tour: 0, phase: "pret",
      pop: DEPART.pop, bon: DEPART.bon, coh: DEPART.coh, tresor: NIVEAUX[o.niveau] ? NIVEAUX[o.niveau].tresor : DEPART.tresor, dette: 0, dom: dom,
      prevus: [], recurrents: [], suites: [], vus: {}, flags: {}, nid: 1,
      journal: [], historique: [], evenement: null, resultat: null, fin: null, cats: [], speciaux: [], special: null, evPerso: null
    };
    // Deuxième générateur, réservé au tirage des dossiers : deux joueurs partis de la même graine (défi du jour)
    // reçoivent les mêmes dossiers tant que leurs choix ne changent pas les conditions d'apparition
    st.rngT = (st.rng ^ 0x5bd1e995) | 0;
    var fo = FORCE_OPP[st.niveau] || FORCE_OPP.moyen;
    st.opposant = { i: Math.floor(rnd(st) * OPPOSANTS.length), force: Math.round(fo[0] + rnd(st) * (fo[1] - fo[0])), actif: true, depart: 0, contres: 0 };
    st.opposant.depart = st.opposant.force;
    st.stats = stats(st);
    // Calendrier secret des événements spéciaux : une catastrophe par tiers du mandat, un éventuel coup de chance
    // (une catastrophe par tranche du mandat : 3 tranches de 30 semaines au niveau moyen)
    var nc = niv(st).catastrophes, pas = Math.floor(90 / nc);
    for (var k = 0; k < nc; k++) st.speciaux.push({ tour: 8 + k * pas + Math.floor(rnd(st) * (pas - 6)), type: "catastrophe" });
    if (rnd(st) < PROBA_CHANCE) {
      var t = 12 + Math.floor(rnd(st) * 76);
      while (st.speciaux.some(function (s) { return Math.abs(s.tour - t) < 3; })) t += 3;
      st.speciaux.push({ tour: t, type: "chance" });
    }
    return st;
  }

  // Compteurs de la partie (succès, quêtes, analyse de la défaite) ; créés à la volée pour les anciennes sauvegardes
  function stats(st) {
    if (!st.stats) st.stats = { trahisons: 0, depenses: 0, detteMax: 0, popMin: st.pop, bonMin: st.bon, contre: 0, mobilise: 0,
      nuireOk: 0, nuireKo: 0, subi: 0, elimine: 0, catastrophes: 0, chances: 0, cats: {}, retombees: 0 };
    return st.stats;
  }
  function suivre(st) {
    var x = stats(st);
    x.detteMax = Math.max(x.detteMax, st.dette); x.popMin = Math.min(x.popMin, st.pop); x.bonMin = Math.min(x.bonMin, st.bon);
  }
  function opposant(st) { return st.opposant ? Object.assign({}, OPPOSANTS[st.opposant.i], st.opposant) : null; }
  function humeurOpp(f) { return f < 40 ? "tiède" : f < 60 ? "combatif" : f < 75 ? "redoutable" : "brûlant"; }

  // ---------- Élection municipale à la fin du mandat ----------
  function election(st) {
    var ok = st.ambitions.filter(function (k) { return st.dom[k] >= P.ambSeuil; }).length;
    var f = st.opposant ? (st.opposant.actif ? st.opposant.force : 0) : 50;
    var pct = 50 + (st.pop - P.elecCentre) * 0.6 + (st.bon - P.elecCentre) * 0.35 + (st.coh - 60) * 0.08 + (ok - 1) * 4 - (f - 45) * 0.12 - st.dette / 80 + (rnd(st) - 0.5) * 4;
    pct = Math.max(15, Math.min(85, Math.round(pct * 10) / 10));
    return { pct: pct, reelu: pct > 50 };
  }
  function victoire(st) { st.phase = "fin"; st.fin = { gagne: true, tour: st.tour }; st.election = election(st); }

  // ---------- Argent : chaque mouvement est inscrit une seule fois au journal ----------
  function mouvement(st, montant, libelle) {
    if (!montant) return;
    montant = Math.round(montant * 10) / 10;
    st.tresor = Math.round((st.tresor + montant) * 10) / 10;
    st.journal.push({ tour: st.tour, m: montant, l: libelle });
    if (st.journal.length > 60) st.journal.splice(0, st.journal.length - 60);
  }
  // Trésorerie négative : on emprunte jusqu'au plafond autorisé, au-delà c'est la faillite
  function financement(st) {
    if (st.tresor < 0) {
      var besoin = -st.tresor, possible = PLAFOND_DETTE - st.dette;
      if (besoin > possible) return false;
      st.dette = Math.round((st.dette + besoin) * 10) / 10; st.tresor = 0;
      st.journal.push({ tour: st.tour, m: besoin, l: "Emprunt pour couvrir les paiements" });
    } else if (st.dette > 0 && st.tresor > 400) {
      var r = Math.min(st.dette, 60, st.tresor - 400);
      st.dette = Math.round((st.dette - r) * 10) / 10; st.tresor = Math.round((st.tresor - r) * 10) / 10;
      st.journal.push({ tour: st.tour, m: -r, l: "Remboursement de la dette" });
    }
    return true;
  }
  function engagements(st) {
    var t = 0;
    st.recurrents.forEach(function (r) { t += r.m * r.n; });
    st.prevus.forEach(function (p) { if (p.e && p.e.bud) t += p.e.bud; });
    return Math.round(t * 10) / 10;
  }

  // ---------- Appliquer des effets ----------
  // Renvoie les variations réellement appliquées (pour l'affichage)
  function appliquer(st, e, libelle, d) {
    d = d || { pop: 0, bon: 0, coh: 0, bud: 0, dom: {} };
    if (!e) return d;
    ["pop", "bon", "coh"].forEach(function (k) {
      if (!e[k]) return;
      var avant = st[k]; st[k] = borne(st[k] + e[k]); d[k] = Math.round((d[k] + st[k] - avant) * 10) / 10;
    });
    if (e.bud) { mouvement(st, e.bud, libelle); d.bud = Math.round((d.bud + e.bud) * 10) / 10; }
    if (e.dom) Object.keys(e.dom).forEach(function (k) {
      if (!DOMAINES[k]) return;
      // Les domaines choisis comme ambitions comptent davantage
      var v = e.dom[k] * (st.ambitions.indexOf(k) >= 0 ? P.ambMult : 1);
      var avant = st.dom[k]; st.dom[k] = borne(st.dom[k] + v); d.dom[k] = Math.round(((d.dom[k] || 0) + st.dom[k] - avant) * 10) / 10;
    });
    return d;
  }
  function varier(st, e) {
    if (!e) return null;
    var o = {};
    ["pop", "bon", "coh", "bud"].forEach(function (k) { if (e[k]) o[k] = varie(st, e[k]); });
    if (e.dom) { o.dom = {}; Object.keys(e.dom).forEach(function (k) { o.dom[k] = varie(st, e.dom[k]); }); }
    if (e.rec) o.rec = { m: e.rec.m, n: e.rec.n };
    return o;
  }

  // ---------- Conditions d'apparition et tirage des événements ----------
  function possible(st, ev) {
    var c = ev.cond; if (!c) return true;
    if (c.popMin != null && st.pop < c.popMin) return false;
    if (c.popMax != null && st.pop > c.popMax) return false;
    if (c.bonMin != null && st.bon < c.bonMin) return false;
    if (c.bonMax != null && st.bon > c.bonMax) return false;
    if (c.cohMin != null && st.coh < c.cohMin) return false;
    if (c.cohMax != null && st.coh > c.cohMax) return false;
    if (c.tresorMin != null && st.tresor < c.tresorMin) return false;
    if (c.tresorMax != null && st.tresor > c.tresorMax) return false;
    if (c.detteMin != null && st.dette < c.detteMin) return false;
    if (c.apres != null && st.tour < c.apres) return false;
    if (c.avant != null && st.tour > c.avant) return false;
    if (c.ligne && c.ligne.indexOf(st.ligne) < 0) return false;
    if (c.amb && st.ambitions.indexOf(c.amb) < 0) return false;
    if (c.flag && !st.flags[c.flag]) return false;
    if (c.sansFlag && st.flags[c.sansFlag]) return false;
    return true;
  }
  function tirer(st, base) {
    // D'abord les suites annoncées par une décision précédente
    for (var i = 0; i < st.suites.length; i++) {
      var s = st.suites[i];
      if (s.tour <= st.tour && base.parId[s.id] && !st.vus[s.id]) { st.suites.splice(i, 1); return base.parId[s.id]; }
    }
    st.suites = st.suites.filter(function (s) { return s.tour > st.tour || (base.parId[s.id] && !st.vus[s.id]); });
    var der = st.cats.slice(-2), total = 0, cand = [];
    base.liste.forEach(function (ev) {
      if (st.vus[ev.id] || ev.suiteSeulement || SPECIAUX[ev.cat] || !possible(st, ev)) return;
      var w = ev.poids || 1;
      if (CAT_DOM[ev.cat] && st.ambitions.indexOf(CAT_DOM[ev.cat]) >= 0) w *= 1.8;      // ambitions
      if (ev.cond && (ev.cond.amb || ev.cond.ligne)) w *= 1.5;                              // événements ciblés
      if (ev.cat === "crise") w *= (st.pop < 42 || st.bon < 42) ? 0.9 : 0.4;                // crises plus rares
      if (der.indexOf(ev.cat) >= 0) w *= der[0] === der[1] && der[0] === ev.cat ? 0.05 : 0.35; // pas trois fois de suite
      cand.push([ev, w]); total += w;
    });
    if (!cand.length) return null;
    var x = rndT(st) * total;
    for (var j = 0; j < cand.length; j++) { x -= cand[j][1]; if (x <= 0) return cand[j][0]; }
    return cand[cand.length - 1][0];
  }

  // ---------- Défaite ----------
  function verifierFin(st, raisonFaillite) {
    var r = null;
    if (raisonFaillite) r = { type: "faillite", txt: "Faillite municipale : la ville ne peut plus payer ses dépenses, même en empruntant au maximum autorisé." };
    else if (st.pop < seuil(st)) r = { type: "popularite", txt: "Ta popularité est passée sous " + seuil(st) + " % : le Conseil de Paris te retire sa confiance." };
    else if (st.bon < seuil(st)) r = { type: "bonheur", txt: "Le bonheur des Parisiens est passé sous " + seuil(st) + " % : la ville se soulève et tu dois démissionner." };
    if (r) { st.fin = { gagne: false, raison: r, tour: st.tour }; st.phase = "fin"; }
    return !!r;
  }

  // ---------- Début de tour ----------
  function debutTour(st0, base) {
    if (st0.phase !== "pret" && st0.phase !== "resultat") return st0;  // déjà fait : rien à rejouer
    var st = copie(st0);
    if (st.tour >= TOURS) { victoire(st); return st; }
    st.tour++; st.resultat = null; st.evPerso = null;
    var notes = [];
    // 1. Fonctionnement courant de la ville
    mouvement(st, FONCT.recettes, "Recettes courantes (impôts, dotations)");
    mouvement(st, -niv(st).depenses, "Dépenses courantes de fonctionnement");
    // 2. Dépenses et recettes récurrentes engagées
    var rec = 0; st.recurrents.forEach(function (r) { rec += r.m; r.n--; });
    if (st.recurrents.length) mouvement(st, rec, "Engagements récurrents (" + st.recurrents.length + ")");
    st.recurrents = st.recurrents.filter(function (r) { return r.n > 0; });
    // 3. Intérêts de la dette
    if (st.dette > 0) mouvement(st, -Math.round(st.dette * TAUX * 10) / 10, "Intérêts de la dette");
    // 4. Effets différés arrivés à échéance
    var restants = [];
    st.prevus.forEach(function (p) {
      if (p.tour <= st.tour) { var d = appliquer(st, p.e, p.l); notes.push({ txt: p.txt, d: d }); }
      else restants.push(p);
    });
    st.prevus = restants;
    // 5. La ville évolue d'elle-même : les problèmes reviennent, l'humeur suit l'état des domaines
    var somme = 0, n = 0;
    Object.keys(st.dom).forEach(function (k) { st.dom[k] = borne(st.dom[k] + (P.domRepos - st.dom[k]) * P.domVit); somme += st.dom[k]; n++; });
    st.bon = borne(st.bon + (somme / n - st.bon) * P.bonVit);
    // Usure du pouvoir : avec le temps, il faut faire mieux pour garder le même soutien
    var cible = st.bon * 0.55 + st.coh * 0.2 + 12 - st.tour * niv(st).usure - (st.coh < 40 ? 4 : 0) - st.dette / P.detteImpop;
    st.pop = borne(st.pop + (cible - st.pop) * P.popVit);
    st.coh = borne(st.coh + (P.cohRepos - st.coh) * P.cohVit);   // les compromis du quotidien érodent la ligne
    // 6. Financement et vérifications
    var ok = financement(st); suivre(st);
    if (verifierFin(st, !ok)) { st.notes = notes; return st; }
    // 7 bis. Toutes les 10 semaines, l'opposant attaque (les événements spéciaux prévus cette semaine passent à la suivante)
    if (st.opposant && st.opposant.actif && st.tour % 10 === 0 && st.tour < TOURS) {
      st.evPerso = attaque(st); st.evenement = st.evPerso.id; st.special = "opposition"; st.notes = notes; st.phase = "evenement";
      return st;
    }
    // 7. Nouvel événement : d'abord un événement spécial s'il est prévu cette semaine
    var ev = null; st.special = null;
    (st.speciaux || []).forEach(function (s) {
      if (ev || s.fait || s.tour > st.tour) return;
      var pool = base.liste.filter(function (e) { return e.cat === s.type && !st.vus[e.id] && possible(st, e); });
      s.fait = true;
      if (pool.length) { ev = pool[Math.floor(rnd(st) * pool.length)]; st.special = s.type; }
    });
    if (!ev) ev = tirer(st, base);
    if (!ev) { st.phase = "fin"; st.fin = { gagne: false, raison: { type: "base", txt: "Plus aucun événement disponible." }, tour: st.tour }; return st; }
    st.vus[ev.id] = st.tour; st.cats.push(ev.cat); if (st.cats.length > 6) st.cats.shift();
    if (st.special === "catastrophe") stats(st).catastrophes++; else if (st.special === "chance") stats(st).chances++;
    // Chaque événement est un problème qui pèse sur la ville tant qu'on ne le règle pas
    if (st.special) { /* les effets d'une catastrophe ou d'une chance sont dans les choix */ }
    else if (CAT_DOM[ev.cat]) {
      // Les domaines des ambitions reviennent plus souvent sur le bureau : chaque dossier y pèse un peu moins
      var k = CAT_DOM[ev.cat], f = st.ambitions.indexOf(k) >= 0 ? P.problemeAmb : 1;
      st.dom[k] = borne(st.dom[k] - niv(st).probleme * f);
    }
    else st.bon = borne(st.bon - niv(st).probleme * (ev.cat === "crise" ? 0.8 : 0.3));
    st.evenement = ev.id; st.notes = notes; st.phase = "evenement";
    return st;
  }

  // ---------- Attaques de l'opposant ----------
  function attaque(st) {
    var o = opposant(st), a = ATTAQUES[(Math.floor(st.tour / 10) + st.opposant.i) % ATTAQUES.length];
    var m = Math.round(2 + o.force / 14) * (a.cible === "coh" ? 2 : 1);
    var cher = 1 + 0.1 * st.opposant.contres;                      // chaque riposte coûte un peu plus cher que la précédente
    var prix = Math.round((10 + o.force * 0.4) * cher), coh = Math.round((3 + o.force / 15) * cher);
    var e = {}; e[a.cible] = -m;
    var nom = { pop: "popularité", bon: "bonheur", coh: "cohérence" }[a.cible];
    return { id: "opp-" + st.tour, cat: "opposition", titre: o.nom + " " + a.titre, attaque: e,
      desc: a.desc.replace("{nom}", o.nom) + " Influence actuelle : " + Math.round(o.force) + "/100 (" + humeurOpp(o.force) + "). Si tu laisses faire : −" + m + " " + nom + ".",
      choix: [
        { t: "Riposter par une campagne de communication (−" + prix + " M€)", r: "Ta riposte éteint l’incendie : l’attaque fait pschitt.", e: { bud: -prix }, k: "contre", prix: prix },
        { t: "Mobiliser ton camp pour répondre (−" + coh + " cohérence)", r: "Tes élus montent au créneau : l’attaque est repoussée, mais ton camp a dû avaler des couleuvres.", e: { coh: -coh }, k: "mobilise", coh: coh },
        { t: "Chercher à le faire tomber (−30 M€, une chance sur deux)", r: "", e: { bud: -30 }, k: "nuire" },
        { t: "Ne rien faire", r: "Tu laisses passer l’orage. " + o.nom + " en sort renforcé et reviendra.", e: e, k: "subir" }
      ] };
  }
  function choisirOpposition(st, i) {
    var ev = st.evPerso, c = ev.choix[i], o = st.opposant, x = stats(st), lib = ev.titre + " : " + c.t;
    var d = { pop: 0, bon: 0, coh: 0, bud: 0, dom: {} }, txt = c.r, extra = [];
    var nom = OPPOSANTS[o.i].nom;
    if (c.k === "contre") { d = appliquer(st, { bud: -c.prix }, lib, d); o.force = Math.max(0, o.force - 6); o.contres++; x.contre++; }
    else if (c.k === "mobilise") { d = appliquer(st, { coh: -c.coh }, lib, d); o.force = Math.max(0, o.force - 6); o.contres++; x.mobilise++; }
    else if (c.k === "nuire") {
      d = appliquer(st, { bud: -30 }, lib, d);
      if (rnd(st) < 0.5) { o.force = Math.round(o.force / 2 * 10) / 10; x.nuireOk++; txt = "Coup réussi : des révélations font chuter " + nom + ", dont l’influence est divisée par deux."; }
      else { d = appliquer(st, ev.attaque, lib, d); d = appliquer(st, { pop: -2 }, lib, d); o.force = Math.min(100, o.force + 3); x.nuireKo++;
        txt = "L’opération est éventée : " + nom + " crie au complot et son attaque porte en plein."; }
    }
    else { d = appliquer(st, ev.attaque, lib, d); o.force = Math.min(100, o.force + 6); x.subi++; }
    if (o.force < SEUIL_OPP) { o.actif = false; x.elimine = st.tour; extra.push("🏳️ " + nom + " renonce et quitte la vie politique : plus aucune attaque d’ici la fin du mandat."); }
    else extra.push("Influence de " + nom + " : " + Math.round(o.force) + "/100 (" + humeurOpp(o.force) + ").");
    return { d: d, txt: txt, extra: extra };
  }

  // ---------- Choix du joueur ----------
  function choisir(st0, base, i) {
    if (st0.phase !== "evenement") return st0;                           // déjà choisi : rien à rejouer
    if (st0.evPerso) {
      if (!st0.evPerso.choix[i]) return st0;
      var so = copie(st0), ro = choisirOpposition(so, i), co = so.evPerso.choix[i];
      so.historique.push({ tour: so.tour, ev: so.evPerso.id, titre: so.evPerso.titre, choix: co.t, d: ro.d, sp: "opposition", c: "opposition" });
      so.resultat = { ev: so.evPerso.id, i: i, d: ro.d, surprise: null, extra: ro.extra, rec: null, dif: 0, txt: ro.txt };
      so.phase = "resultat";
      var oko = financement(so); suivre(so);
      if (!verifierFin(so, !oko) && so.tour >= TOURS) victoire(so);
      return so;
    }
    var ev = base.parId[st0.evenement]; if (!ev || !ev.choix[i]) return st0;
    var st = copie(st0), c = ev.choix[i], lib = ev.titre + " : " + c.t;
    var e = varier(st, c.e), d = appliquer(st, e, lib), extra = [];
    // Cohérence politique : fidélité à sa ligne, sauf si une crise justifie le compromis
    var a = (c.ali && c.ali[{ gauche: "g", centre: "c", droite: "d", ecologie: "e" }[st.ligne]]) || 0;
    if (a) {
      var urgence = ev.cat === "crise" || ev.cat === "catastrophe";
      var dc = a > 0 ? a * P.aliPlus : a * (urgence ? 0.8 : P.aliMoins);
      if (a <= -3 && !urgence) stats(st).trahisons++;
      d = appliquer(st, { coh: Math.round(dc * 10) / 10 }, lib, d);
      if (a <= -3 && !urgence && rnd(st) < 0.6) { d = appliquer(st, { pop: -2 }, lib, d); extra.push("Une partie de ton électorat se sent trahie."); }
      if (a >= 3 && st.coh > 75 && rnd(st) < 0.3) { d = appliquer(st, { pop: 1 }, lib, d); extra.push("Tes soutiens saluent une décision fidèle à tes engagements."); }
    }
    // Ambitions : agir sur ses priorités est remarqué
    if (e && e.dom) Object.keys(e.dom).forEach(function (k) {
      if (st.ambitions.indexOf(k) >= 0 && e.dom[k] > 0) { d = appliquer(st, { pop: 1 }, lib, d); extra.push("Les Parisiens voient que tu tiens ta promesse sur « " + DOMAINES[k] + " »."); }
    });
    // Finances tendues : chaque nouvelle dépense inquiète
    if (e && e.bud < -20 && (st.dette > 300 || st.tresor < 150)) { d = appliquer(st, { pop: -1 }, lib, d); extra.push("Avec des finances tendues, cette dépense inquiète."); }
    // Dépense ou recette récurrente
    if (e && e.rec) { st.recurrents.push({ id: st.nid++, m: e.rec.m, n: e.rec.n, l: lib }); }
    // Surprise
    var surprise = null;
    if (c.alea && rnd(st) * 100 < c.alea.p) { var es = varier(st, c.alea.e); d = appliquer(st, es, lib + " (imprévu)", d); surprise = c.alea.txt; }
    // Effets différés et suites
    (c.dif || []).forEach(function (x) { st.prevus.push({ id: st.nid++, tour: st.tour + x.n, e: varier(st, x.e), l: lib + " (effet différé)", txt: x.txt }); });
    if (c.suite) st.suites.push({ id: c.suite.id, tour: st.tour + c.suite.n });
    if (c.flag) st.flags[c.flag] = st.tour;
    // Retombées cachées : une décision sur six revient plus tard, en bien ou en mal, sans prévenir
    if (rnd(st) < P.retombees && st.tour < TOURS - 3) {
      var sens = (e && (e.pop || 0) + (e.bon || 0)) < 0 ? -1 : 1; if (rnd(st) < 0.35) sens = -sens;
      var re = { pop: sens * (1 + Math.floor(rnd(st) * 2)), bon: sens * (1 + Math.floor(rnd(st) * 2)) };
      st.prevus.push({ id: st.nid++, tour: st.tour + 3 + Math.floor(rnd(st) * 6), e: re, l: lib + " (retombées)", cache: 1,
        txt: (sens > 0 ? "Bonne surprise : ta décision « " : "Retour de bâton : ta décision « ") + c.t + " » (" + ev.titre + ") fait encore parler d’elle." });
      stats(st).retombees++;
    }
    var x = stats(st); x.cats[ev.cat] = (x.cats[ev.cat] || 0) + 1;
    if (e && e.bud < 0) x.depenses += -e.bud;
    var r = { ev: ev.id, i: i, d: d, surprise: surprise, extra: extra, rec: e && e.rec ? e.rec : null, dif: (c.dif || []).length };
    st.historique.push({ tour: st.tour, ev: ev.id, titre: ev.titre, choix: c.t, d: d, sp: st.special || undefined, c: ev.cat });
    var ok = financement(st); suivre(st);
    st.resultat = r; st.phase = "resultat";
    if (!verifierFin(st, !ok) && st.tour >= TOURS) victoire(st);
    return st;
  }

  // ---------- Reprise d'une sauvegarde ----------
  // Si la base a changé depuis la sauvegarde et que l'événement en cours n'existe plus, on en tire un autre
  // sans rejouer le début de tour (aucun effet n'est appliqué deux fois).
  function reprendre(st0, base) {
    if (st0.phase !== "evenement" || st0.evPerso || base.parId[st0.evenement]) return st0;
    var st = copie(st0), ev = tirer(st, base);
    if (!ev) { st.phase = "fin"; st.fin = { gagne: false, raison: { type: "base", txt: "Plus aucun événement disponible." }, tour: st.tour }; return st; }
    st.vus[ev.id] = st.tour; st.evenement = ev.id; st.special = null;
    return st;
  }

  // ---------- Bilan ----------
  function bilan(st) {
    var amb = st.ambitions.map(function (k) { return { k: k, nom: DOMAINES[k], niveau: Math.round(st.dom[k]), ok: st.dom[k] >= P.ambSeuil }; });
    // Décisions qui ont le plus pesé (pour expliquer une défaite)
    var poids = st.historique.map(function (h) {
      var cle = st.fin && st.fin.raison ? st.fin.raison.type : "";
      var v = cle === "popularite" ? h.d.pop : cle === "bonheur" ? h.d.bon : cle === "faillite" ? h.d.bud / 10 : h.d.pop + h.d.bon;
      return { tour: h.tour, titre: h.titre, choix: h.choix, v: v };
    }).sort(function (a, b) { return a.v - b.v; });
    var score = Math.round(st.pop + st.bon + st.coh * 0.6 + Math.max(-60, Math.min(60, (st.tresor - st.dette) / 20)) +
      amb.filter(function (a) { return a.ok; }).length * 25 + (st.fin && st.fin.gagne ? 100 : st.tour) +
      (st.election && st.election.reelu ? 40 + Math.round(st.election.pct - 50) : 0));
    return { ambitions: amb, pires: poids.slice(0, 5), meilleures: poids.slice(-5).reverse(), score: Math.max(0, score), engagements: engagements(st) };
  }

  // ---------- Pourquoi ça s'est mal passé : la période décisive et un conseil ----------
  function analyse(st) {
    if (!st.fin) return null;
    var h = st.historique, x = stats(st);
    if (st.fin.gagne) {
      if (!st.election || st.election.reelu) return null;
      var o = opposant(st), raisons = [];
      if (st.pop < 50) raisons.push("ta popularité (" + Math.round(st.pop) + ") était trop basse");
      if (st.bon < 50) raisons.push("les Parisiens n’étaient pas assez heureux (" + Math.round(st.bon) + ")");
      if (st.ambitions.some(function (k) { return st.dom[k] < P.ambSeuil; })) raisons.push("tes promesses n’ont pas toutes été tenues");
      if (o && o.actif && o.force >= 55) raisons.push(o.nom + " était encore très influent (" + Math.round(o.force) + "/100)");
      if (st.dette > 300) raisons.push("la dette de la ville inquiétait");
      return { phrase: "Battu avec " + String(st.election.pct).replace(".", ",") + " % des voix : " + (raisons.length ? raisons.join(", ") : "il t’a manqué un petit élan en fin de mandat") + ".",
        conseil: "Pour être réélu, soigne la fin de mandat : popularité, bonheur et promesses tenues comptent le plus, et un opposant affaibli pèse moins." };
    }
    var type = st.fin.raison.type, cle = type === "faillite" ? "bud" : type === "popularite" ? "pop" : "bon";
    // Fenêtre de 12 semaines où la jauge fatale a le plus reculé
    var L = 12, mieux = null;
    for (var a = 1; a <= st.tour; a++) {
      var t = 0, liste = [];
      h.forEach(function (y) { if (y.tour >= a && y.tour < a + L) { var v = (y.d && y.d[cle]) || 0; t += v; liste.push({ y: y, v: v }); } });
      if (!mieux || t < mieux.t) mieux = { t: t, de: a, a: Math.min(st.tour, a + L - 1), liste: liste };
    }
    var pires = (mieux ? mieux.liste : []).filter(function (z) { return z.v < 0; }).sort(function (p, q) { return p.v - q.v; }).slice(0, 2)
      .map(function (z) { return "« " + z.y.choix + " » (" + z.y.titre + ")"; });
    var periode = mieux && mieux.t < 0 ? "entre les semaines " + mieux.de + " et " + mieux.a : "";
    var phrase, conseil;
    if (type === "faillite") {
      var rec = st.recurrents.reduce(function (s, r) { return s + r.m * r.n; }, 0);
      phrase = "Tu as trop dépensé" + (periode ? " " + periode + " (" + Math.round(-mieux.t) + " M€ engagés)" : "") + (pires.length ? ", surtout avec " + pires.join(" et ") : "") + ".";
      conseil = x.detteMax > 600 ? "Au-delà de 600 M€ de dette, chaque nouvelle dépense doit être compensée : regarde l’onglet Finances avant de décider." :
        rec < -200 ? "Les dépenses récurrentes t’ont étranglé : une petite dépense chaque semaine finit par coûter très cher." :
        "Garde une réserve pour les catastrophes : elles arrivent toujours au mauvais moment.";
    } else if (type === "popularite") {
      phrase = "Ta popularité s’est effondrée" + (periode ? " " + periode : "") + (pires.length ? ", notamment après " + pires.join(" et ") : "") + ".";
      conseil = st.coh < 45 || x.trahisons >= 6 ? "Tu as souvent renié ta ligne (" + x.trahisons + " fois) : ton camp t’a lâché. Reste fidèle à tes engagements." :
        st.dette > 400 ? "La dette pèse sur ta popularité : les Parisiens n’aiment pas un maire qui vit à crédit." :
        x.subi >= 3 ? "Tu as laissé ton opposant frapper " + x.subi + " fois sans réagir : contre-le avant qu’il ne prenne trop d’influence." :
        "Avec le temps, l’usure du pouvoir s’installe : garde une marge de popularité pour la fin du mandat.";
    } else {
      var doms = Object.keys(st.dom).sort(function (p, q) { return st.dom[p] - st.dom[q]; }).slice(0, 2).map(function (k) { return DOMAINES[k].toLowerCase() + " (" + Math.round(st.dom[k]) + ")"; });
      phrase = "Le bonheur des Parisiens a chuté" + (periode ? " " + periode : "") + (pires.length ? ", notamment après " + pires.join(" et ") : "") + ".";
      conseil = "Le bonheur suit l’état moyen de la ville : tes points faibles étaient " + doms.join(" et ") + ". Ne laisse aucun domaine s’effondrer.";
    }
    return { phrase: phrase, conseil: conseil };
  }
  function evenementCourant(st, base) { return st.evPerso || base.parId[st.evenement]; }

  // ---------- Base d'événements ----------
  function indexer(liste) {
    var parId = {}, valides = liste.filter(function (ev) { return ev && ev.id; }), rejets = [], encore = true;
    // On recommence tant qu'un rejet rend invalide une suite qui pointait vers lui
    while (encore) {
      encore = false; parId = {};
      valides.forEach(function (ev) { parId[ev.id] = ev; });
      valides = valides.filter(function (ev) { var e = valider(ev, parId); if (e.length) { rejets.push({ id: ev.id, err: e }); encore = true; return false; } return true; });
    }
    var p = {}; valides.forEach(function (ev) { p[ev.id] = ev; });
    // Un événement n'apparaît que comme suite si une autre décision y renvoie et qu'il le demande
    return { liste: valides, parId: p, rejets: rejets };
  }

  var API = { OPPOSANTS: OPPOSANTS, SEUIL_OPP: SEUIL_OPP, opposant: opposant, humeurOpp: humeurOpp, analyse: analyse, evenementCourant: evenementCourant, stats: stats, NIVEAUX: NIVEAUX, seuil: seuil, depenses: function (st) { return niv(st).depenses; }, SPECIAUX: SPECIAUX, NB_CATASTROPHES: NB_CATASTROPHES, P: P, TAUX: TAUX, TOURS: TOURS, SEUIL: SEUIL, DEPART: DEPART, FONCT: FONCT, PLAFOND_DETTE: PLAFOND_DETTE, LIGNES: LIGNES, DOMAINES: DOMAINES, CATS: CATS,
    nouvellePartie: nouvellePartie, debutTour: debutTour, choisir: choisir, reprendre: reprendre, bilan: bilan, valider: valider, indexer: indexer, engagements: engagements };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.Maire = API;
})(this);
