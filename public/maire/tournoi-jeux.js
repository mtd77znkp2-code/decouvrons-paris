// Grand Tournoi des Maires : les dix mini-jeux.
// Chaque jeu est « déterministe » : la même graine et les mêmes gestes donnent toujours le même score.
// Le navigateur affiche et enregistre les gestes ; le serveur (functions/) rejoue la partie avec ce même fichier
// et calcule lui-même le score : modifier le score ou le chronomètre dans le navigateur ne sert à rien.
// Temps : 30 images par seconde, 45 secondes par épreuve. Espace de jeu : 360 × 540 (le dessin s'adapte à l'écran).
(function (root) {
  "use strict";
  var FPS = 30, DUREE = 45, IMAGES = FPS * DUREE, W = 360, H = 540;

  // Hasard reproductible (mulberry32) : rangé dans l'état, il suit la partie
  function rnd(s) { s.r = (s.r + 0x6D2B79F5) | 0; var t = Math.imul(s.r ^ (s.r >>> 15), 1 | s.r); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function ent(s, a, b) { return a + Math.floor(rnd(s) * (b - a + 1)); }
  function base(graine) { return { r: graine | 0, f: 0, score: 0, fin: false, evts: [] }; }
  function pts(s, n, x, y) { s.score = Math.max(0, s.score + n); s.evts.push({ f: s.f, n: n, x: x == null ? W / 2 : x, y: y == null ? H / 3 : y }); if (s.evts.length > 12) s.evts.shift(); }
  function prog(s) { return Math.min(1, s.f / IMAGES); }   // 0 → 1 au fil de l'épreuve : la difficulté monte

  var JEUX = {};

  // ---------------- 1. Les Pickpockets : taper les pickpockets dans la foule, épargner les autres ----------------
  var SPOTS = [[70, 150], [180, 150], [290, 150], [70, 300], [180, 300], [290, 300], [70, 450], [180, 450], [290, 450]];
  var GENS = ["pickpocket", "touriste", "policier", "journaliste", "pompier"];
  JEUX.pickpockets = {
    nom: "Les Pickpockets", ico: "👜", typique: 300,
    accroche: "La foule se presse au pied de la tour Eiffel… des pickpockets s’y cachent !",
    regles: ["Touche les pickpockets (main dans un sac) : +10", "Épargne touristes, policiers en civil, journalistes et pompiers : −10", "Ils apparaissent de plus en plus vite"],
    creer: function (g) { var s = base(g); s.p = []; s.prochain = 20; s.serie = 0; return s; },
    pas: function (s, gestes) {
      var p = prog(s);
      gestes.forEach(function (x) {
        if (x.a !== "tap") return;
        for (var i = s.p.length - 1; i >= 0; i--) {
          var o = s.p[i], sp = SPOTS[o.k];
          if (Math.abs(x.x - sp[0]) < 52 && Math.abs(x.y - sp[1]) < 62) {
            if (o.t === "pickpocket") { s.serie++; pts(s, 10 + Math.min(10, Math.floor(s.serie / 3) * 2), sp[0], sp[1]); }
            else { s.serie = 0; pts(s, -10, sp[0], sp[1]); }
            s.p.splice(i, 1); return;
          }
        }
      });
      for (var i = s.p.length - 1; i >= 0; i--) if (s.f >= s.p[i].fin) { if (s.p[i].t === "pickpocket") s.serie = 0; s.p.splice(i, 1); }
      if (s.f >= s.prochain) {
        var libres = []; for (var k = 0; k < 9; k++) if (!s.p.some(function (o) { return o.k === k; })) libres.push(k);
        if (libres.length) {
          var t = rnd(s) < 0.42 ? "pickpocket" : GENS[1 + ent(s, 0, 3)];
          s.p.push({ k: libres[ent(s, 0, libres.length - 1)], t: t, debut: s.f, fin: s.f + Math.round(FPS * (1.7 - 0.8 * p)) });
        }
        s.prochain = s.f + Math.round(FPS * (0.95 - 0.55 * p));
      }
    }
  };

  // ---------------- 2. Le Jeu des Tuyaux : relier la source à l'arrivée en tournant les tuyaux ----------------
  // Une pièce = ses ouvertures (bits : 1 haut, 2 droite, 4 bas, 8 gauche) ; tourner de 90° décale les bits
  function tourne(m) { return ((m << 1) | (m >> 3)) & 15; }
  var FORMES = { droit: 5, coude: 3, te: 7 };
  function grilleTuyaux(s) {
    var N = 5, g = [], chemin = [], r = ent(s, 0, N - 1), c = 0, vus = {};
    chemin.push([r, c]); vus[r + "," + c] = 1;
    // Un chemin de gauche à droite qui serpente
    while (c < N - 1) {
      var opts = [[r, c + 1]];
      if (r > 0 && !vus[(r - 1) + "," + c]) opts.push([r - 1, c]);
      if (r < N - 1 && !vus[(r + 1) + "," + c]) opts.push([r + 1, c]);
      var o = opts[ent(s, 0, opts.length - 1)];
      if (rnd(s) < 0.45) o = opts[0];
      r = o[0]; c = o[1]; vus[r + "," + c] = 1; chemin.push([r, c]);
    }
    var depart = chemin[0][0], arrivee = chemin[chemin.length - 1][0];
    for (var i = 0; i < N; i++) { g.push([]); for (var j = 0; j < N; j++) g[i].push(0); }
    var dirs = { "-1,0": 1, "0,1": 2, "1,0": 4, "0,-1": 8 };
    chemin.forEach(function (p, k) {
      var m = 0, av = k ? chemin[k - 1] : [p[0], -1], ap = k < chemin.length - 1 ? chemin[k + 1] : [p[0], N];
      m |= dirs[(av[0] - p[0]) + "," + (av[1] - p[1])]; m |= dirs[(ap[0] - p[0]) + "," + (ap[1] - p[1])];
      g[p[0]][p[1]] = m;
    });
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
      if (!g[i][j]) g[i][j] = [FORMES.droit, FORMES.coude, FORMES.te][ent(s, 0, 2)];
      var tours = ent(s, 1, 3); for (var t = 0; t < tours; t++) g[i][j] = tourne(g[i][j]);
    }
    return { g: g, depart: depart, arrivee: arrivee, debut: s.f, eau: null };
  }
  // Cases reliées à la source (et est-ce que l'arrivée est atteinte ?)
  function eauTuyaux(T) {
    var N = 5, vus = {}, file = [], ok = false;
    if (T.g[T.depart][0] & 8) { file.push([T.depart, 0]); vus[T.depart + ",0"] = 1; }
    var D = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]];
    while (file.length) {
      var p = file.shift(), m = T.g[p[0]][p[1]];
      if (p[1] === N - 1 && p[0] === T.arrivee && (m & 2)) ok = true;
      D.forEach(function (d) {
        if (!(m & d[0])) return; var r = p[0] + d[1], c = p[1] + d[2];
        if (r < 0 || c < 0 || r >= N || c >= N || vus[r + "," + c]) return;
        if (T.g[r][c] & d[3]) { vus[r + "," + c] = 1; file.push([r, c]); }
      });
    }
    return { n: Object.keys(vus).length, ok: ok, vus: vus };
  }
  JEUX.tuyaux = {
    nom: "Le Jeu des Tuyaux", ico: "🔧", typique: 250,
    accroche: "Une canalisation a cédé sous la chaussée : l’eau doit repartir !",
    regles: ["Touche un tuyau pour le tourner d’un quart de tour", "Relie la source (à gauche) à l’arrivée (à droite)", "Chaque canalisation réparée : +100 et bonus de vitesse"],
    creer: function (g) { var s = base(g); s.T = grilleTuyaux(s); s.reparees = 0; s.flux = 0; return s; },
    pas: function (s, gestes) {
      if (s.flux) { if (--s.flux === 0) s.T = grilleTuyaux(s); return; }   // l'eau coule, puis nouvelle canalisation
      gestes.forEach(function (x) {
        if (x.a !== "tap") return;
        var c = Math.floor((x.x - 30) / 60), r = Math.floor((x.y - 120) / 60);
        if (r < 0 || c < 0 || r > 4 || c > 4) return;
        s.T.g[r][c] = tourne(s.T.g[r][c]);
      });
      var e = eauTuyaux(s.T); s.T.eau = e;
      if (e.ok) { s.reparees++; pts(s, 100 + Math.max(0, 30 - Math.floor((s.f - s.T.debut) / FPS)) * 3, W / 2, 250); s.flux = Math.round(FPS * 1.2); }
    },
    finale: function (s) { if (!s.flux && s.T.eau) pts(s, s.T.eau.n * 4); }   // canalisation commencée : 4 points par case reliée
  };

  // ---------------- 3. Panique sur le Périphérique : gérer les deux feux d'un carrefour ----------------
  JEUX.peripherique = {
    nom: "Panique sur le Périphérique", ico: "🚦", typique: 600,
    accroche: "Le carrefour est saturé : prends les commandes des feux !",
    regles: ["Touche un feu pour le passer au vert ou au rouge", "Jamais les deux au vert : collision ! (−40)", "Chaque véhicule qui passe : +10, ambulance : +30", "Les bouchons coûtent des points"],
    creer: function (g) { var s = base(g); s.feux = [true, false]; s.v = [[], []]; s.prochain = [10, 25]; s.bouchon = 0; return s; },
    pas: function (s, gestes) {
      var p = prog(s), CX = 180, CY = 270;
      gestes.forEach(function (x) { if (x.a === "feu" && (x.k === 0 || x.k === 1)) s.feux[x.k] = !s.feux[x.k]; });
      for (var a = 0; a < 2; a++) {
        if (s.f >= s.prochain[a]) {
          var amb = rnd(s) < 0.1;
          if (s.v[a].length < 9) s.v[a].push({ d: -40, amb: amb, ok: false });
          s.prochain[a] = s.f + Math.round(FPS * (1.6 - 1.0 * p) * (0.7 + rnd(s) * 0.6));
        }
        // Avancer : chaque voiture garde ses distances et s'arrête au feu rouge (ligne à 120 du centre)
        var l = s.v[a], vit = 4 + 3 * p;
        for (var i = 0; i < l.length; i++) {
          var o = l[i], limite = i ? l[i - 1].d - 34 : 9999;
          if (!s.feux[a] && o.d <= 150) limite = Math.min(limite, 150);   // feu rouge : on s'arrête à la ligne
          o.d = Math.max(o.d, Math.min(o.d + vit * (o.amb ? 1.3 : 1), limite));
        }
        while (l.length && l[0].d > 470) { var q = l.shift(); pts(s, q.amb ? 30 : 10, a ? CX : 340, a ? 520 : CY); }
      }
      // Collision : une voiture de chaque axe dans le carrefour en même temps
      var dansA = s.v[0].filter(function (o) { return o.d > 210 && o.d < 330; }), dansB = s.v[1].filter(function (o) { return o.d > 210 && o.d < 330; });
      if (dansA.length && dansB.length) {
        pts(s, -40, CX, CY);
        s.v[0] = s.v[0].filter(function (o) { return dansA.indexOf(o) < 0; }); s.v[1] = s.v[1].filter(function (o) { return dansB.indexOf(o) < 0; });
      }
      // Bouchon : plus de 6 voitures arrêtées sur un axe
      var bloq = s.v[0].length > 6 || s.v[1].length > 6;
      if (bloq && ++s.bouchon >= FPS) { s.bouchon = 0; pts(s, -5, CX, 60); }
    }
  };

  // ---------------- 4. La Tournée des Éboueurs : trier les déchets dans les quatre poubelles ----------------
  var DECHETS = [["papier", "📰"], ["papier", "📦"], ["papier", "✉️"], ["verre", "🍾"], ["verre", "🫙"], ["verre", "🥛"], ["plastique", "🧴"], ["plastique", "🥤"], ["plastique", "🛍️"], ["menager", "🍌"], ["menager", "🍕"], ["menager", "🦴"]];
  var BACS = ["papier", "verre", "plastique", "menager"];
  JEUX.eboueurs = {
    nom: "La Tournée des Éboueurs", ico: "🗑️", typique: 450,
    accroche: "Les sacs s’entassent rue de Rivoli : à toi de trier !",
    regles: ["Fais glisser chaque déchet (ou touche la bonne poubelle)", "Papier · Verre · Plastique · Ordures : +10", "5 bons tris d’affilée : bonus · Erreur : −5"],
    creer: function (g) { var s = base(g); s.d = []; s.prochain = 10; s.serie = 0; return s; },
    pas: function (s, gestes) {
      var p = prog(s);
      gestes.forEach(function (x) {
        if (x.a !== "bac" || !s.d.length) return;
        var cible = x.i != null ? s.d.filter(function (o) { return o.id === x.i; })[0] : s.d[0]; if (!cible) return;
        s.d.splice(s.d.indexOf(cible), 1);
        if (BACS[x.k] === cible.t) { s.serie++; pts(s, 10 + (s.serie >= 5 ? 5 : 0), 45 + x.k * 90, 470); } else { s.serie = 0; pts(s, -5, 45 + x.k * 90, 470); }
      });
      for (var i = s.d.length - 1; i >= 0; i--) { s.d[i].y += 1.6 + 2.6 * p; if (s.d[i].y > 400) { s.d.splice(i, 1); s.serie = 0; pts(s, -5, 180, 400); } }
      if (s.f >= s.prochain) {
        var x = DECHETS[ent(s, 0, DECHETS.length - 1)];
        s.d.push({ id: s.f, t: x[0], e: x[1], x: 60 + ent(s, 0, 240), y: 30 });
        s.prochain = s.f + Math.round(FPS * (1.5 - 0.9 * p));
      }
    }
  };

  // ---------------- 5. Le Chantier Express : lâcher les blocs de la grue au bon moment ----------------
  JEUX.chantier = {
    nom: "Le Chantier Express", ico: "🏗️", typique: 450,
    accroche: "Une grue, des pierres de taille, 45 secondes : construis l’immeuble le plus haut !",
    regles: ["Touche l’écran pour lâcher le bloc", "Bien aligné sur l’étage du dessous : +10 (pile : +15)", "Tous les 5 blocs, un étage complet : +25", "Trop décalé : ça s’écroule (−20)"],
    creer: function (g) { var s = base(g); s.pile = [{ x: 130, w: 100 }]; s.bloc = { x: 0, w: 100, sens: 1 }; s.chute = null; return s; },
    pas: function (s, gestes) {
      var p = prog(s), b = s.bloc, vit = 2.5 + 4.5 * p + s.pile.length * 0.08;
      if (s.chute) { s.chute.y += 9; if (s.chute.y > 600) s.chute = null; return; }
      b.x += vit * b.sens; if (b.x < 0) { b.x = 0; b.sens = 1; } if (b.x + b.w > W) { b.x = W - b.w; b.sens = -1; }
      if (!gestes.some(function (x) { return x.a === "tap"; })) return;
      var haut = s.pile[s.pile.length - 1], g0 = Math.max(b.x, haut.x), d0 = Math.min(b.x + b.w, haut.x + haut.w), rec = d0 - g0;
      if (rec < b.w * 0.3) {
        // Trop décalé : le bloc tombe et les deux derniers étages avec
        pts(s, -20, b.x + b.w / 2, 200); s.chute = { x: b.x, w: b.w, y: 120 };
        if (s.pile.length > 1) s.pile.splice(Math.max(1, s.pile.length - 2), 2);
        b.w = Math.max(70, s.pile[s.pile.length - 1].w); b.x = 0; b.sens = 1; return;
      }
      var parfait = Math.abs(b.x - haut.x) <= 4;
      var nv = parfait ? { x: haut.x, w: haut.w } : { x: g0, w: rec };
      s.pile.push(nv); pts(s, parfait ? 15 : 10, nv.x + nv.w / 2, 200);
      if ((s.pile.length - 1) % 5 === 0) pts(s, 25, W / 2, 160);
      b.w = Math.max(40, nv.w + (parfait ? 6 : 0)); b.x = b.sens > 0 ? 0 : W - b.w;
    }
  };

  // ---------------- 6. Le Conseil Municipal : reproduire la séquence des quatre élus ----------------
  JEUX.conseil = {
    nom: "Le Conseil Municipal", ico: "🏛️", typique: 350,
    accroche: "Les élus votent dans un ordre précis… sauras-tu suivre la séance ?",
    regles: ["Regarde l’ordre dans lequel les élus s’allument", "Touche-les dans le même ordre", "Chaque séance réussie rapporte plus · 3 erreurs et la séance est levée"],
    creer: function (g) { var s = base(g); s.seq = [ent(s, 0, 3), ent(s, 0, 3)]; s.vies = 3; s.i = 0; s.mode = "montre"; s.t = 0; s.allume = -1; s.serie = 0; return s; },
    pas: function (s, gestes) {
      var dureeL = Math.max(8, 15 - s.seq.length);   // un élu reste allumé moins longtemps quand la séquence s'allonge
      if (s.mode === "montre") {
        s.t++; var k = Math.floor(s.t / (dureeL + 4)), dans = s.t % (dureeL + 4);
        s.allume = k < s.seq.length && dans < dureeL ? s.seq[k] : -1;
        if (k >= s.seq.length) { s.mode = "joue"; s.i = 0; s.allume = -1; }
        return;
      }
      if (s.mode === "pause") { if (--s.t <= 0) { s.mode = "montre"; s.t = 0; } return; }
      gestes.forEach(function (x) {
        if (x.a !== "elu" || s.mode !== "joue") return;
        s.allume = x.k;
        if (x.k === s.seq[s.i]) {
          s.i++;
          if (s.i === s.seq.length) { s.serie++; pts(s, 10 * s.seq.length + (s.serie >= 3 ? 15 : 0), W / 2, 120); s.seq.push(ent(s, 0, 3)); s.mode = "pause"; s.t = 18; }
        } else { s.vies--; s.serie = 0; pts(s, 0, W / 2, 120); s.mode = "pause"; s.t = 24; if (s.vies <= 0) s.fin = true; }
      });
    }
  };

  // ---------------- 7. Le Marathon de Paris : sauter et glisser pour éviter les obstacles ----------------
  JEUX.marathon = {
    nom: "Le Marathon de Paris", ico: "🏃", typique: 400,
    accroche: "Le départ est donné sur les Champs-Élysées : cours, saute, glisse !",
    regles: ["Touche le haut de l’écran (ou ↑ / Espace) pour sauter", "Touche le bas (ou ↓) pour glisser sous les obstacles", "Bouteille d’eau +5, médaille +20 · 3 chocs et c’est l’abandon"],
    creer: function (g) { var s = base(g); s.y = 0; s.vy = 0; s.glisse = 0; s.obs = []; s.prochain = 40; s.coeurs = 3; s.invul = 0; s.dist = 0; return s; },
    pas: function (s, gestes) {
      var p = prog(s), vit = 5 + 5 * p;
      gestes.forEach(function (x) {
        if (x.a === "saut" && s.y === 0 && !s.glisse) s.vy = 13;
        if (x.a === "glisse" && s.y === 0) s.glisse = 18;
      });
      if (s.vy || s.y > 0) { s.y += s.vy; s.vy -= 1.1; if (s.y <= 0) { s.y = 0; s.vy = 0; } }
      if (s.glisse) s.glisse--;
      if (s.invul) s.invul--;
      s.dist += vit;
      for (var i = s.obs.length - 1; i >= 0; i--) {
        var o = s.obs[i]; o.x -= vit;
        if (o.x < -40) { s.obs.splice(i, 1); continue; }
        if (o.x > 50 && o.x < 100 && !o.pris) {
          if (o.t === "eau") { if (s.y < 30) { o.pris = 1; pts(s, 5, 80, 330); } }            // bouteille au sol : on la prend en courant
          else if (o.t === "medaille") { if (s.y > 50) { o.pris = 1; pts(s, 20, 80, 230); } } // médaille en hauteur : il faut sauter
          else if ((o.t === "barriere" ? s.y < 34 : !s.glisse) && !s.invul) { s.coeurs--; s.invul = 30; o.pris = 1; pts(s, 0, 80, 300); if (s.coeurs <= 0) s.fin = true; }
        }
      }
      if (s.f >= s.prochain) {
        var r = rnd(s), t = r < 0.4 ? "barriere" : r < 0.7 ? "bache" : r < 0.9 ? "eau" : "medaille";
        s.obs.push({ t: t, x: 400 });
        s.prochain = s.f + Math.round(FPS * (1.3 - 0.6 * p) * (0.8 + rnd(s) * 0.5));
      }
    },
    finale: function (s) { pts(s, Math.round(s.dist / 20) + s.coeurs * 20); }   // la distance et la survie comptent à la fin
  };

  // ---------------- 8. Le Casse du Budget : atteindre exactement le montant demandé ----------------
  JEUX.budget = {
    nom: "Le Casse du Budget", ico: "💶", typique: 300,
    accroche: "Le préfet exige des économies, et vite !",
    regles: ["Un objectif d’économies s’affiche", "Coche les mesures dont le total fait exactement ce montant", "Valide : +20 et bonus de vitesse · Faux : −10"],
    creer: function (g) { var s = base(g); s.manches = 0; nouvelleManche(s); return s; },
    pas: function (s, gestes) {
      if (s.pause) { s.pause--; if (!s.pause) nouvelleManche(s); return; }
      gestes.forEach(function (x) {
        if (x.a === "opt" && s.opts[x.k]) s.opts[x.k].on = !s.opts[x.k].on;
        if (x.a === "ok") {
          var tot = s.opts.reduce(function (n, o) { return n + (o.on ? o.v : 0); }, 0);
          if (tot === s.but) { s.manches++; pts(s, 20 + Math.max(0, 10 - Math.floor((s.f - s.debut) / FPS)), W / 2, 120); s.ok = true; }
          else { pts(s, -10, W / 2, 120); s.ok = false; }
          s.pause = 15;
        }
      });
    }
  };
  function nouvelleManche(s) {
    var p = prog(s), nb = 2 + (s.manches > 2 ? 1 : 0) + (p > 0.6 ? 1 : 0), bons = [], v = 0;
    for (var i = 0; i < nb; i++) { var x = ent(s, 1, 8) * 50; bons.push(x); v += x; }
    var opts = bons.map(function (x) { return { v: x }; });
    var faux = 2 + (p > 0.4 ? 1 : 0);
    for (i = 0; i < faux; i++) { var y = ent(s, 1, 8) * 50 * (rnd(s) < 0.35 ? -1 : 1); opts.push({ v: y }); }
    for (i = opts.length - 1; i > 0; i--) { var j = ent(s, 0, i), t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
    s.but = v; s.opts = opts.map(function (o) { return { v: o.v, on: false }; }); s.debut = s.f; s.ok = null;
  }

  // ---------------- 9. Les Pigeons de Paris : ramasser les déchets avant que les pigeons les éparpillent ----------------
  JEUX.pigeons = {
    nom: "Les Pigeons de Paris", ico: "🐦", typique: 600,
    accroche: "Place de la République : les pigeons ont envahi le pique-nique !",
    regles: ["Touche les déchets pour les ramasser : +10", "Les pigeons éparpillent ce qui traîne", "Un coin de la place tout propre : +20 · Trop de déchets : la place est perdue"],
    creer: function (g) {
      var s = base(g); s.d = []; s.pg = []; s.prochain = 0; s.nid = 1; s.propre = [0, 0, 0, 0]; s.lourd = 0;
      for (var i = 0; i < 4; i++) s.pg.push({ x: ent(s, 30, 330), y: ent(s, 80, 500), vx: 0, vy: 0 });
      for (i = 0; i < 6; i++) ajoutDechet(s, ent(s, 30, 330), ent(s, 80, 500));
      return s;
    },
    pas: function (s, gestes) {
      var p = prog(s);
      gestes.forEach(function (x) {
        if (x.a !== "tap") return;
        var best = -1, bd = 34 * 34;
        s.d.forEach(function (o, i) { var dd = (o.x - x.x) * (o.x - x.x) + (o.y - x.y) * (o.y - x.y); if (dd < bd) { bd = dd; best = i; } });
        if (best >= 0) {
          var o = s.d.splice(best, 1)[0], z = zone(o); pts(s, 10, o.x, o.y);
          if (!s.d.some(function (q) { return zone(q) === z; }) && s.propre[z] >= 3) { pts(s, 20, o.x, o.y - 20); s.propre[z] = 0; }
        }
      });
      // Les pigeons filent vers le déchet le plus proche et l'éparpillent en deux
      s.pg.forEach(function (g) {
        var c = null, bd = 1e9; s.d.forEach(function (o) { var dd = (o.x - g.x) * (o.x - g.x) + (o.y - g.y) * (o.y - g.y); if (dd < bd) { bd = dd; c = o; } });
        if (!c) return; var dx = c.x - g.x, dy = c.y - g.y, n = Math.sqrt(dx * dx + dy * dy) || 1, v = 1.2 + 1.3 * p;
        g.x += dx / n * v; g.y += dy / n * v;
        if (n < 8 && !c.vu) { c.vu = 1; if (s.d.length < 45) ajoutDechet(s, Math.max(20, Math.min(340, c.x + ent(s, -60, 60))), Math.max(70, Math.min(510, c.y + ent(s, -60, 60)))); g.x += ent(s, -80, 80); g.y += ent(s, -80, 80); g.x = Math.max(20, Math.min(340, g.x)); g.y = Math.max(70, Math.min(510, g.y)); }
      });
      if (s.f >= s.prochain) { ajoutDechet(s, ent(s, 25, 335), ent(s, 80, 505)); s.prochain = s.f + Math.round(FPS * (1.1 - 0.6 * p)); }
      if (s.f % (FPS * 8) === 0 && s.pg.length < 8) s.pg.push({ x: rnd(s) < 0.5 ? 0 : 360, y: ent(s, 80, 500) });
      if (s.d.length > 25 && ++s.lourd >= FPS) { s.lourd = 0; pts(s, -5, W / 2, 60); }
      if (s.d.length >= 40) s.fin = true;
    }
  };
  function zone(o) { return (o.x < 180 ? 0 : 1) + (o.y < 290 ? 0 : 2); }
  function ajoutDechet(s, x, y) { var e = ["🥤", "🍟", "🧻", "🍌", "🥡", "📰"]; var o = { id: s.nid++, x: x, y: y, e: e[ent(s, 0, e.length - 1)] }; s.d.push(o); s.propre[zone(o)]++; }

  // ---------------- 10. La Une du Journal : associer chaque événement à son titre ----------------
  var UNES = [
    ["Une crue de la Seine inonde les quais", "LES QUAIS SOUS LES EAUX"], ["La tour Eiffel s’illumine en vert", "LA DAME DE FER PASSE AU VERT"],
    ["Les loyers augmentent encore", "SE LOGER DEVIENT UN LUXE"], ["Une nouvelle ligne de métro ouvre", "LE MÉTRO ARRIVE EN BANLIEUE"],
    ["Grève des éboueurs depuis dix jours", "PARIS CROULE SOUS LES DÉCHETS"], ["Record de touristes cet été", "LA CAPITALE PRISE D’ASSAUT"],
    ["Un parc géant remplace un parking", "LE BÉTON CÈDE LA PLACE AUX ARBRES"], ["Canicule : 40 °C à Paris", "LA VILLE SUFFOQUE"],
    ["Le maire baisse les impôts locaux", "COUP DE POUCE AU PORTE-MONNAIE"], ["Une manifestation bloque la Bastille", "LA BASTILLE PARALYSÉE"],
    ["Les vélos dépassent les voitures rue de Rivoli", "LA PETITE REINE PREND LE POUVOIR"], ["Fermeture d’une boulangerie centenaire", "LA FIN D’UNE ÉPOQUE AU COIN DE LA RUE"],
    ["Un rat filmé dans un restaurant étoilé", "SCANDALE EN CUISINE"], ["Le budget de la ville dans le rouge", "LES CAISSES SONT VIDES"],
    ["Ouverture d’une piscine dans la Seine", "ON SE BAIGNE EN PLEIN PARIS"], ["Panne géante sur la ligne 13", "LA LIGNE 13 A ENCORE CRAQUÉ"],
    ["Le PSG remporte la Ligue des champions", "PARIS EST MAGIQUE"], ["Une tempête arrache des arbres centenaires", "NUIT DE CHAOS DANS LES JARDINS"],
    ["Les prix du café en terrasse s’envolent", "L’EXPRESSO À PRIX D’OR"], ["Un incendie à Notre-Dame maîtrisé à temps", "LA CATHÉDRALE SAUVÉE DES FLAMMES"],
    ["La ville interdit les trottinettes en libre-service", "FIN DE PARTIE POUR LES TROTTINETTES"], ["Des moutons tondent les pelouses du parc", "LA CAMPAGNE S’INVITE EN VILLE"],
    ["Embouteillage record sur le périphérique", "400 KM DE BOUCHONS"], ["Les bouquinistes menacés de disparaître", "SOS POUR LES BOÎTES VERTES DES QUAIS"]
  ];
  JEUX.une = {
    nom: "La Une du Journal", ico: "📰", typique: 450,
    accroche: "Le journal part à l’impression dans 45 secondes : chaque événement a son gros titre !",
    regles: ["Touche un événement, puis le titre qui lui correspond", "Bonne association : +10 · Erreur : −5", "Les trois réussies : bonus de vitesse et nouvelle page"],
    creer: function (g) { var s = base(g); s.sel = -1; nouvellePage(s); return s; },
    pas: function (s, gestes) {
      if (s.pause) { s.pause--; if (!s.pause) nouvellePage(s); return; }
      gestes.forEach(function (x) {
        if (x.a === "evt" && s.ev[x.k] && !s.ev[x.k].ok) s.sel = x.k;
        if (x.a === "titre" && s.sel >= 0 && s.ti[x.k] && !s.ti[x.k].ok) {
          if (s.ti[x.k].n === s.ev[s.sel].n) { s.ev[s.sel].ok = s.ti[x.k].ok = true; pts(s, 10, W / 2, 300); }
          else pts(s, -5, W / 2, 300);
          s.sel = -1;
          if (s.ev.every(function (e) { return e.ok; })) { pts(s, Math.max(0, 15 - Math.floor((s.f - s.debut) / FPS)), W / 2, 260); s.pause = 12; }
        }
      });
    }
  };
  function nouvellePage(s) {
    var pris = [];
    while (pris.length < 3) { var k = ent(s, 0, UNES.length - 1); if (pris.indexOf(k) < 0 && (!s.derniers || s.derniers.indexOf(k) < 0)) pris.push(k); }
    s.derniers = pris;
    var titres = pris.slice(); for (var i = titres.length - 1; i > 0; i--) { var j = ent(s, 0, i), t = titres[i]; titres[i] = titres[j]; titres[j] = t; }
    s.ev = pris.map(function (k) { return { n: k, txt: UNES[k][0], ok: false }; });
    s.ti = titres.map(function (k) { return { n: k, txt: UNES[k][1], ok: false }; });
    s.sel = -1; s.debut = s.f;
  }

  var IDS = ["pickpockets", "tuyaux", "peripherique", "eboueurs", "chantier", "conseil", "marathon", "budget", "pigeons", "une"];
  IDS.forEach(function (id) { JEUX[id].id = id; });

  // Une image de jeu : on applique les gestes de cette image, puis on avance
  function pas(id, s, gestes) { if (s.fin) return s; JEUX[id].pas(s, gestes || []); s.f++; if (s.f >= IMAGES) terminer(id, s); return s; }
  function terminer(id, s) { if (s.final) return; s.final = true; s.fin = true; if (JEUX[id].finale) JEUX[id].finale(s); s.score = Math.max(0, Math.round(s.score)); }
  // Rejouer une partie complète à partir de la graine et des gestes (c'est ce que fait le serveur)
  function rejouer(id, graine, gestes) {
    var J = JEUX[id]; if (!J) throw new Error("Épreuve inconnue");
    gestes = Array.isArray(gestes) ? gestes : [];
    var s = J.creer(graine), k = 0;
    while (!s.fin && s.f < IMAGES) {
      var lot = [];
      while (k < gestes.length && gestes[k].f <= s.f) { if (gestes[k].f === s.f) lot.push(gestes[k]); k++; }
      pas(id, s, lot);
    }
    terminer(id, s);
    return { score: s.score, images: s.f };
  }
  // Gestes acceptés : au plus 450 (10 par seconde), dans l'ordre, pendant l'épreuve, et uniquement les actions du jeu
  var ACTIONS = { tap: 1, feu: 1, bac: 1, elu: 1, saut: 1, glisse: 1, opt: 1, ok: 1, evt: 1, titre: 1 };
  function nettoyer(gestes) {
    if (!Array.isArray(gestes) || gestes.length > 450) return null;
    var out = [], der = -1;
    for (var i = 0; i < gestes.length; i++) {
      var x = gestes[i]; if (!x || typeof x !== "object" || !ACTIONS[x.a]) return null;
      var f = x.f | 0; if (f < der || f < 0 || f >= IMAGES) return null; der = f;
      var o = { f: f, a: x.a };
      if (x.x != null) o.x = Math.max(0, Math.min(W, +x.x || 0)); if (x.y != null) o.y = Math.max(0, Math.min(H, +x.y || 0));
      if (x.k != null) o.k = x.k | 0; if (x.i != null) o.i = x.i | 0;
      out.push(o);
    }
    return out;
  }

  var API = { FPS: FPS, DUREE: DUREE, IMAGES: IMAGES, W: W, H: H, IDS: IDS, JEUX: JEUX, pas: pas, terminer: terminer, rejouer: rejouer, nettoyer: nettoyer,
    BACS: BACS, SPOTS: SPOTS, eauTuyaux: eauTuyaux };
  if (typeof module === "object" && module.exports) module.exports = API;
  else root.MaireTournoiJeux = API;
})(typeof window !== "undefined" ? window : this);
