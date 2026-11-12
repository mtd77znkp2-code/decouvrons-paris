// Le quartier du maire : une vue isométrique animée de l'arrondissement (bâtiments, rues, habitants, saisons, jour et nuit, événements).
// - disposer(items, ancien) : place les bâtiments sur la grille (automatique, par familles), en gardant les places déjà choisies ;
// - encoder / decoder : le quartier en texte court (envoyé aux autres maires de la session pour les visites) ;
// - quartierBot(graine, nb, niv, ids) : un quartier crédible pour un maire robot ;
// - Vue(canvas, options) : le dessin animé (navigateur seulement).
// La grille : 7 × 7 îlots de 2 × 2 parcelles, séparés par des rues ; la mairie occupe l'îlot du centre.
(function (root) {
  "use strict";
  var B = 7, N = 3 * B + 1, CENTRE = 3;                      // îlots 0..6, cellules 0..21 (rues sur les multiples de 3)
  // Direction préférée de chaque famille de bâtiments, depuis la mairie (les logements ensemble, les commerces sur l'avenue…)
  var DIR = { logement: [-1, -1], commerce: [0, 1], cadre: [1, -1], securite: [-1, 1], transports: [1, 1], economie: [1, 0], projet: [0, -1], secret: [-1, 0], enchere: [0, -1], pass: [1, 1] };

  function estParcelle(x, y) { return x > 0 && y > 0 && x < N - 1 && y < N - 1 && x % 3 !== 0 && y % 3 !== 0; }
  function ilot(x, y) { return [Math.floor(x / 3), Math.floor(y / 3)]; }
  function mairie(x, y) { var b = ilot(x, y); return b[0] === CENTRE && b[1] === CENTRE; }
  function cellules(p, gros) { return gros ? [[p[0], p[1]], [p[0] + 1, p[1]], [p[0], p[1] + 1], [p[0] + 1, p[1] + 1]] : [[p[0], p[1]]]; }
  function cle(c) { return c[0] + "," + c[1]; }
  function valide(p, gros) {
    if (!p || p.length !== 2 || !(p[0] >= 0) || !(p[1] >= 0)) return false;
    if (gros && !(p[0] % 3 === 1 && p[1] % 3 === 1)) return false;
    return cellules(p, gros).every(function (c) { return estParcelle(c[0], c[1]) && !mairie(c[0], c[1]); });
  }
  // Place les bâtiments : ceux qui ont déjà une place la gardent ; les nouveaux vont au plus près de la mairie, du côté de leur famille, à côté de leurs voisins de même famille
  function disposer(items, ancien) {
    var pos = {}, occ = {}, cat = {};
    ancien = ancien || {};
    // 1) les places déjà connues (gros d'abord), si elles sont toujours valides et libres
    items.slice().sort(function (a, b) { return (b.gros ? 1 : 0) - (a.gros ? 1 : 0); }).forEach(function (it) {
      var p = ancien[it.cle];
      if (!valide(p, it.gros)) return;
      var cs = cellules(p, it.gros); if (cs.some(function (c) { return occ[cle(c)]; })) return;
      cs.forEach(function (c) { occ[cle(c)] = it.cle; cat[cle(c)] = it.cat; }); pos[it.cle] = [p[0], p[1]];
    });
    // 2) les nouveaux : gros d'abord (il leur faut un îlot entier), puis les autres
    items.filter(function (it) { return !pos[it.cle]; }).sort(function (a, b) { return (b.gros ? 1 : 0) - (a.gros ? 1 : 0); }).forEach(function (it) {
      var d = DIR[it.cat] || [0, 0], ax = CENTRE + d[0] * 1.6, ay = CENTRE + d[1] * 1.6, mieux = null, score = Infinity;
      for (var x = 1; x < N - 1; x++) for (var y = 1; y < N - 1; y++) {
        var p = [x, y]; if (!valide(p, it.gros)) continue;
        var cs = cellules(p, it.gros); if (cs.some(function (c) { return occ[cle(c)]; })) continue;
        var bx = x / 3 - 0.5, by = y / 3 - 0.5;
        var s = Math.hypot(bx - CENTRE, by - CENTRE) * 1.0 + Math.hypot(bx - ax, by - ay) * 0.55;
        // à côté d'un bâtiment de la même famille : bonus ; parcelle déjà entamée dans un îlot : petit bonus (les îlots se remplissent un à un)
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (v) { var k = cle([x + v[0], y + v[1]]); if (occ[k] && cat[k] === it.cat) s -= 0.45; else if (occ[k]) s -= 0.12; });
        s += (x * 31 + y * 17) % 7 * 0.001;                  // départage stable
        if (s < score) { score = s; mieux = p; }
      }
      if (!mieux) return;                                    // quartier plein : le bâtiment n'est pas dessiné
      cellules(mieux, it.gros).forEach(function (c) { occ[cle(c)] = it.cle; cat[cle(c)] = it.cat; }); pos[it.cle] = mieux;
    });
    return pos;
  }
  // Déplacer (ou échanger) un bâtiment : renvoie les nouvelles places, ou null si c'est impossible
  function deplacer(items, pos, cleA, cible) {
    var it = items.filter(function (x) { return x.cle === cleA; })[0]; if (!it || !pos[cleA] || !cible) return null;
    var p = it.gros ? [Math.floor(cible[0] / 3) * 3 + 1, Math.floor(cible[1] / 3) * 3 + 1] : [cible[0], cible[1]];
    if (!valide(p, it.gros)) return null;
    var n = {}; Object.keys(pos).forEach(function (k) { n[k] = pos[k]; });
    var occ = {}; items.forEach(function (x) { if (n[x.cle] && x.cle !== cleA) cellules(n[x.cle], x.gros).forEach(function (c) { occ[cle(c)] = x; }); });
    var gene = {}; cellules(p, it.gros).forEach(function (c) { var o = occ[cle(c)]; if (o) gene[o.cle] = o; });
    var l = Object.keys(gene).map(function (k) { return gene[k]; });
    if (!l.length) { n[cleA] = p; return n; }
    // échange : seulement avec un bâtiment de même taille
    if (l.length === 1 && !!l[0].gros === !!it.gros && (it.gros || (n[l[0].cle][0] === p[0] && n[l[0].cle][1] === p[1]))) { n[l[0].cle] = pos[cleA]; n[cleA] = p; return n; }
    return null;
  }
  // Le quartier en texte court : « parc.0@4,5;logements.1@1,2 »
  function encoder(pos, max) {
    return Object.keys(pos).slice(0, max || 160).map(function (k) { var i = k.lastIndexOf(":"); return k.slice(0, i) + "." + k.slice(i + 1) + "@" + pos[k][0] + "," + pos[k][1]; }).join(";");
  }
  function decoder(txt) {
    var pos = {}; String(txt || "").split(";").forEach(function (x) {
      var m = /^([A-Za-z0-9_]{1,40})\.(\d{1,3})@(\d{1,2}),(\d{1,2})$/.exec(x); if (m) pos[m[1] + ":" + m[2]] = [+m[3], +m[4]];
    });
    return pos;
  }
  function hache(a, b) { var h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) | 0; h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  // Un maire robot : des bâtiments tirés parmi ceux de son niveau, placés comme un joueur le ferait
  function quartierBot(graine, nb, niv, bats) {
    var dispo = Object.keys(bats).filter(function (id) { var x = bats[id]; return (x.niv || 1) <= Math.max(1, niv) && !x.secret && !x.enchere && !x.pass && !x.projet; });
    if (!dispo.length) return { items: [], pos: {} };
    var compte = {}, items = [];
    for (var i = 0; i < Math.min(nb, 80); i++) {
      var id = dispo[Math.floor(hache(graine, i) * dispo.length)], k = compte[id] || 0; compte[id] = k + 1;
      items.push({ cle: id + ":" + k, id: id, cat: bats[id].cat, gros: false });
    }
    return { items: items, pos: disposer(items, {}) };
  }

  var API = { B: B, N: N, CENTRE: CENTRE, estParcelle: estParcelle, valide: valide, disposer: disposer, deplacer: deplacer, encoder: encoder, decoder: decoder, quartierBot: quartierBot, cellules: cellules };

  // ======================================================================================================
  // Le dessin (navigateur)
  // ======================================================================================================
  if (typeof document !== "undefined") (function () {
    var TW = 64, TH = 32;
    var IMG = {};
    function image(src) { if (!src) return null; var i = IMG[src]; if (!i) { i = IMG[src] = new Image(); i.decoding = "async"; i.src = src; } return i.complete && i.naturalWidth ? i : null; }
    // Images du quartier (public/maire/img/quartier, découpées par tools/maire/decouper-quartier.py)
    function sprite(x, nom, cx, by, w, miroir) {
      var img = image("maire/img/quartier/" + nom + ".webp"); if (!img) return false;
      var h = w * img.naturalHeight / img.naturalWidth;
      if (miroir) { x.save(); x.translate(cx, 0); x.scale(-1, 1); x.drawImage(img, -w / 2, by - h, w, h); x.restore(); }
      else x.drawImage(img, cx - w / 2, by - h, w, h);
      return true;
    }
    // Dalle de sol illustrée posée sur la case (u, v) ; l'épaisseur de la dalle dépasse sous la case
    function dalle(x, nom, u, v, miroir) { var b = P(u + 1, v + 1); return sprite(x, nom, b[0], b[1] + TW * 0.14, TW * 1.04, miroir); }
    var PIETONS = ["homme", "baguette", "enfant", "canne", "joggeuse", "chien", "touriste", "serveur", "balayeur", "policier", "etudiante", "accordeon", "poussette", "peintre"];
    var AUTOS = ["voiture", "voiture", "taxi", "taxi", "camionnette", "voiture", "benne", "ambulance", "pompiers"];
    function P(u, v) { return [(u - v) * TW / 2, (u + v) * TH / 2]; }
    function inv(sx, sy) { var a = sx / (TW / 2), b = sy / (TH / 2); return [(a + b) / 2, (b - a) / 2]; }
    function losange(x, u, v, w, h, fill, trait) {
      var a = P(u, v), b = P(u + w, v), c = P(u + w, v + h), d = P(u, v + h);
      x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.lineTo(d[0], d[1]); x.closePath();
      if (fill) { x.fillStyle = fill; x.fill(); } if (trait) { x.strokeStyle = trait; x.lineWidth = 1; x.stroke(); }
    }
    // Boîte isométrique (u, v, largeur, profondeur, hauteur en pixels) : murs gauche/droite et toit
    function boite(x, u, v, w, d, hz, cg, cd, ct) {
      var a = P(u, v + d), b = P(u + w, v + d), c = P(u + w, v), o = P(u, v);
      x.fillStyle = cg; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(b[0], b[1] - hz); x.lineTo(a[0], a[1] - hz); x.closePath(); x.fill();
      x.fillStyle = cd; x.beginPath(); x.moveTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.lineTo(c[0], c[1] - hz); x.lineTo(b[0], b[1] - hz); x.closePath(); x.fill();
      x.fillStyle = ct; x.beginPath(); x.moveTo(o[0], o[1] - hz); x.lineTo(c[0], c[1] - hz); x.lineTo(b[0], b[1] - hz); x.lineTo(a[0], a[1] - hz); x.closePath(); x.fill();
    }
    // Saisons : 0 hiver, 1 printemps, 2 été, 3 automne
    var HERBE = [["#dfe8ee", "#cfdbe3"], ["#7cc46a", "#6db35c"], ["#9cc24e", "#8bb243"], ["#9aa84c", "#8e9c44"]];
    var FEUILLE = [["#e9f1f5", "#c9d6de"], ["#4fae4a", "#7fd06a"], ["#3f9a3a", "#5cb84a"], ["#d9822b", "#c2541f"]];
    var COUL = ["#d6362c", "#2b6fe0", "#f5b21a", "#2fae4c", "#8e44ad", "#e67e22", "#ecf0f1", "#1abc9c", "#e84393", "#34495e"];

    function Vue(canvas, o) {
      var V = this; o = o || {};
      V.c = canvas; V.x = canvas.getContext("2d"); V.d = null; V.zoom = 1; V.pan = [0, 0]; V.sel = null; V.mode = "voir";
      V.agents = []; V.parts = []; V.t0 = performance.now(); V.vu = true; V.grand = !!o.grand; V.onTap = o.onTap; V.onMove = o.onMove;
      V.fenetres = {};
      var io = window.IntersectionObserver ? new IntersectionObserver(function (e) { V.vu = e[0].isIntersecting; if (V.vu) V.boucle(); }) : null;
      if (io) io.observe(canvas);
      V.io = io;
      if (V.grand) V.gestes();
    }
    Vue.prototype.fin = function () { this.mort = true; if (this.io) this.io.disconnect(); };
    // Nouvelles données (à chaque saison) : bâtiments, chantiers, ambiance
    Vue.prototype.maj = function (d) {
      var V = this, avant = V.d; V.d = d;
      // Zone visible : les îlots utilisés, plus un îlot de marge (au moins 3 × 3 autour de la mairie)
      var b0 = [CENTRE - 1, CENTRE - 1], b1 = [CENTRE + 1, CENTRE + 1];
      Object.keys(d.pos).forEach(function (k) { var p = d.pos[k], b = ilot(p[0], p[1]); b0 = [Math.min(b0[0], b[0]), Math.min(b0[1], b[1])]; b1 = [Math.max(b1[0], b[0]), Math.max(b1[1], b[1])]; });
      b0 = [Math.max(0, b0[0]), Math.max(0, b0[1])]; b1 = [Math.min(B - 1, b1[0]), Math.min(B - 1, b1[1])];
      // cadrage : les îlots bâtis (au moins 3 × 3 autour de la mairie) ; on dessine un îlot de plus tout autour
      V.cadre = { x0: b0[0] * 3, y0: b0[1] * 3, x1: b1[0] * 3 + 3, y1: b1[1] * 3 + 3 };
      var m0 = [Math.max(0, b0[0] - 1), Math.max(0, b0[1] - 1)], m1 = [Math.min(B - 1, b1[0] + 1), Math.min(B - 1, b1[1] + 1)];
      V.zone = { x0: m0[0] * 3, y0: m0[1] * 3, x1: m1[0] * 3 + 3, y1: m1[1] * 3 + 3 };
      // Les habitants et la circulation suivent la ville
      var hab = d.hab || 1000, bon = d.bon == null ? 50 : d.bon, tr = d.pil ? d.pil.transports : 50, se = d.pil ? d.pil.securite : 50;
      var nP = Math.round(Math.max(5, Math.min(46, 5 + 7 * Math.log(hab / 700))) * (0.6 + bon / 125));
      var nV = Math.round(Math.max(2, Math.min(18, 2 + 2.4 * Math.log(hab / 700))) * (tr < 40 ? 1.4 : 1));
      var nB = tr >= 50 ? 1 + Math.floor((tr - 50) / 15) : 0, nVelo = tr >= 45 ? Math.min(6, 1 + Math.floor((tr - 45) / 8)) : 0, nPol = se >= 55 ? (se >= 70 ? 2 : 1) : 0;
      if (!avant || V.agents.length === 0 || Math.abs((avant.hab || 0) - hab) > 50 || (avant.pil && d.pil && (avant.pil.transports !== tr || avant.pil.securite !== se))) {
        var garde = V.agents.filter(function (a) { return dans(V.zone, a); });
        var l = { pieton: [], voiture: [], bus: [], velo: [], police: [] };
        garde.forEach(function (a) { l[a.type].push(a); });
        var veut = { pieton: nP, voiture: nV, bus: nB, velo: nVelo, police: nPol };
        V.agents = [];
        Object.keys(veut).forEach(function (t) { for (var i = 0; i < veut[t]; i++) V.agents.push(l[t][i] || V.nouvelAgent(t)); });
      }
      // Ce qui traîne dans les rues : déchets, tags, fleurs (positions stables)
      V.deco = [];
      var sale = d.sale ? 9 : (d.pil && d.pil.cadre < 40 ? 5 : 0), tags = d.pil && d.pil.securite < 40 ? 6 : 0, fleurs = bon >= 60 ? 10 : bon >= 50 ? 4 : 0;
      for (var i = 0; i < sale + tags + fleurs; i++) {
        var r = trottoir(V.zone, i * 7 + 3);
        V.deco.push({ k: i < sale ? "dechet" : i < sale + tags ? "tag" : "fleur", u: r[0], v: r[1], c: COUL[i % COUL.length] });
      }
      V.boucle();
    };
    function dans(z, a) { return a.u >= z.x0 && a.v >= z.y0 && a.u <= z.x1 + 1 && a.v <= z.y1 + 1; }
    // Une place sur un trottoir (stable selon n)
    function trottoir(z, n) {
      var h = function (k) { return hache(n, k); };
      var horiz = h(1) < 0.5, cols = (z.x1 - z.x0) / 3, rows = (z.y1 - z.y0) / 3;
      if (horiz) { var j = z.y0 + 3 * Math.floor(h(2) * (rows + 1)); return [z.x0 + h(3) * (z.x1 - z.x0 + 1), j + (h(4) < 0.5 ? 0.08 : 0.92)]; }
      var i = z.x0 + 3 * Math.floor(h(2) * (cols + 1)); return [i + (h(4) < 0.5 ? 0.08 : 0.92), z.y0 + h(3) * (z.y1 - z.y0 + 1)];
    }
    Vue.prototype.nouvelAgent = function (type) {
      var z = this.zone, n = Math.random();
      var cols = (z.x1 - z.x0) / 3 + 1, rows = (z.y1 - z.y0) / 3 + 1;
      var i = z.x0 + 3 * Math.floor(Math.random() * cols), j = z.y0 + 3 * Math.floor(Math.random() * rows);
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(function (d) { var nu = i + 0.5 + d[0] * 3, nv = j + 0.5 + d[1] * 3; return nu >= z.x0 + 0.5 && nv >= z.y0 + 0.5 && nu <= z.x1 + 0.5 && nv <= z.y1 + 0.5; }), dir = dirs[Math.floor(Math.random() * dirs.length)] || [1, 0];
      var pied = type === "pieton";
      return { type: type, u: i + 0.5, v: j + 0.5, dir: dir, cote: pied ? (Math.random() < 0.5 ? -0.4 : 0.4) : 0.16, prog: Math.random() * 3,
        vit: pied ? 0.35 + Math.random() * 0.25 : type === "bus" ? 0.9 : type === "velo" ? 0.8 : 1.3 + Math.random() * 0.5,
        c: COUL[Math.floor(Math.random() * COUL.length)], c2: COUL[Math.floor(Math.random() * COUL.length)], ph: Math.random() * 6, coeur: 0, pause: 0, n: n };
    };
    // Les agents roulent / marchent le long des rues et tournent aux carrefours
    Vue.prototype.bouger = function (dt) {
      var z = this.zone, V = this;
      this.agents.forEach(function (a) {
        if (a.pause > 0) { a.pause -= dt; return; }
        a.prog += a.vit * dt;
        while (a.prog >= 3) {
          a.prog -= 3; a.u += a.dir[0] * 3; a.v += a.dir[1] * 3;
          var ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(function (d) {
            var nu = a.u + d[0] * 3, nv = a.v + d[1] * 3;
            return nu >= z.x0 + 0.5 && nv >= z.y0 + 0.5 && nu <= z.x1 + 0.5 && nv <= z.y1 + 0.5 && !(d[0] === -a.dir[0] && d[1] === -a.dir[1]);
          });
          if (!ok.length) ok = [[-a.dir[0], -a.dir[1]]];
          // tout droit le plus souvent
          var droit = ok.filter(function (d) { return d[0] === a.dir[0] && d[1] === a.dir[1]; })[0];
          a.dir = droit && Math.random() < 0.55 ? droit : ok[Math.floor(Math.random() * ok.length)];
          if (a.type === "pieton" && Math.random() < 0.15) a.pause = 1 + Math.random() * 3;
          if (a.type === "bus") a.pause = 1.2;
        }
        if (a.type === "pieton" && V.d && V.d.bon >= 60 && Math.random() < dt * 0.04) a.coeur = 1.6;
        if (a.coeur > 0) a.coeur -= dt;
      });
      // Particules de saison et d'événements
      var s = this.d ? this.d.saison : 2, W = this.vueW || 300, H = this.vueH || 200;
      var veut = s === 0 ? 70 : s === 3 ? 22 : s === 1 ? 16 : 0;
      if (this.ev("fete")) veut += 50;
      while (this.parts.length < veut) this.parts.push({ x: Math.random() * W, y: Math.random() * H - H, vx: (Math.random() - 0.5) * 20, vy: 15 + Math.random() * 25, r: Math.random() * 6, k: this.ev("fete") && Math.random() < 0.5 ? "confetti" : "saison", c: COUL[Math.floor(Math.random() * COUL.length)] });
      this.parts = this.parts.filter(function (p) { p.x += p.vx * dt + Math.sin(p.y / 20 + p.r) * 12 * dt; p.y += p.vy * dt; return p.y < H + 10; }).slice(0, veut);
    };
    Vue.prototype.ev = function (k) { var l = this.d && this.d.evts || []; for (var i = 0; i < l.length; i++) if (l[i].k === k) return l[i]; return null; };
    // Jour et nuit : un cycle de 3 minutes (nuit ≈ un tiers du temps)
    function nuit() { var p = (Date.now() / 180000) % 1, c = Math.cos(p * Math.PI * 2); return Math.max(0, Math.min(1, (c - 0.1) * 1.6)); }
    Vue.prototype.boucle = function () {
      var V = this; if (V.mort || V.anim) return;
      V.anim = true;
      var der = performance.now();
      function tic(t) {
        V.anim = false;
        if (V.mort || !V.c.isConnected) return;
        if (!V.vu || document.hidden) return;
        var dt = Math.min(0.1, (t - der) / 1000); der = t;
        if (!V.calme) V.bouger(dt);
        V.dessiner(t / 1000);
        V.anim = true;
        setTimeout(function () { requestAnimationFrame(tic); }, V.calme ? 1000 : 30);
      }
      requestAnimationFrame(tic);
      V.calme = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    };
    document.addEventListener("visibilitychange", function () { if (!document.hidden) Vue.toutes.forEach(function (v) { v.boucle(); }); });
    Vue.toutes = [];
    var _Vue = Vue;
    Vue = function (c, o) { _Vue.call(this, c, o); Vue.toutes = Vue.toutes.filter(function (v) { return !v.mort && v.c.isConnected; }); Vue.toutes.push(this); };
    Vue.prototype = _Vue.prototype; Vue.toutes = [];

    // Caméra : la zone visible tient dans le cadre, puis zoom et déplacement (plein écran)
    Vue.prototype.camera = function () {
      var c = this.c, dpr = Math.min(2, window.devicePixelRatio || 1), W = c.clientWidth || 300, H = c.clientHeight || 200;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      this.vueW = W; this.vueH = H;
      var z = this.cadre || this.zone, a = P(z.x0, z.y1 + 1), b = P(z.x1 + 1, z.y0), top = P(z.x0, z.y0), bas = P(z.x1 + 1, z.y1 + 1);
      var lw = b[0] - a[0], lh = bas[1] - top[1] + 60;
      var k = Math.min(W / lw, H / lh) * 1.04 * this.zoom;
      var cx = (a[0] + b[0]) / 2, cy = (top[1] - 50 + bas[1]) / 2;
      this.cam = { k: k, ox: W / 2 - cx * k + this.pan[0], oy: H / 2 - cy * k + this.pan[1], dpr: dpr };
      return this.cam;
    };
    Vue.prototype.dessiner = function (t) {
      var V = this, d = V.d; if (!d) return;
      var x = V.x, cam = V.camera(), z = V.zone, s = d.saison == null ? 2 : d.saison, nu = d.nuit != null ? d.nuit : window.MAIRE_NUIT != null ? window.MAIRE_NUIT : nuit();
      x.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
      // ciel / fond
      var g = x.createLinearGradient(0, 0, 0, V.vueH);
      g.addColorStop(0, s === 0 ? "#9fb3c8" : "#8fd0f0"); g.addColorStop(1, s === 0 ? "#d7e2ea" : "#d8f0d0");
      x.fillStyle = g; x.fillRect(0, 0, V.vueW, V.vueH);
      x.setTransform(cam.dpr * cam.k, 0, 0, cam.dpr * cam.k, cam.dpr * cam.ox, cam.dpr * cam.oy);
      // sol : herbe, rues, trottoirs, passages piétons
      for (var u = z.x0; u <= z.x1; u++) for (var v = z.y0; v <= z.y1; v++) {
        var ru = u % 3 === 0, rv = v % 3 === 0;
        if (s !== 0 && (ru || rv) && dalle(x, ru && rv ? "croisement" : (ru ? v : u) % 3 === 1 && hache(u * 31 + v, 9) < 0.3 ? "passage" : "rue", u, v, rv && !ru)) continue;
        if (ru || rv) {
          losange(x, u, v, 1, 1, s === 0 ? "#8d939b" : "#6f757e");
          if (ru && rv) { // carrefour : passages piétons
            x.fillStyle = "rgba(255,255,255,.55)";
            for (var k = 0; k < 4; k++) { losange(x, u + 0.08 + k * 0.22, v - 0.0, 0.1, 0.12, "rgba(255,255,255,.6)"); losange(x, u + 0.08 + k * 0.22, v + 0.88, 0.1, 0.12, "rgba(255,255,255,.6)"); }
          } else if (ru) { losange(x, u + 0.47, v + 0.2, 0.06, 0.6, "rgba(255,240,180,.7)"); losange(x, u, v, 0.1, 1, "#b9b2a3"); losange(x, u + 0.9, v, 0.1, 1, "#b9b2a3"); }
          else { losange(x, u + 0.2, v + 0.47, 0.6, 0.06, "rgba(255,240,180,.7)"); losange(x, u, v, 1, 0.1, "#b9b2a3"); losange(x, u, v + 0.9, 1, 0.1, "#b9b2a3"); }
        } else {
          var hb = HERBE[s][(u + v) % 2];
          losange(x, u, v, 1, 1, hb);
        }
      }
      // objets triés par profondeur
      var objs = [];
      // mairie au centre
      objs.push({ p: CENTRE * 3 + 1 + CENTRE * 3 + 1 + 3.9, f: function () { dessinerMairie(x, CENTRE * 3 + 1, CENTRE * 3 + 1, s, t, V); } });
      var occ = {};
      (d.items || []).forEach(function (it) {
        var p = d.pos[it.cle]; if (!p) return;
        cellules(p, it.gros).forEach(function (c) { occ[cle(c)] = 1; });
        objs.push({ p: p[0] + p[1] + (it.gros ? 3.9 : 1.9), it: it, f: function () { dessinerBat(x, V, it, p, t, s); } });
      });
      // arbres sur les parcelles libres
      for (var u2 = z.x0; u2 <= z.x1; u2++) for (var v2 = z.y0; v2 <= z.y1; v2++) {
        if (!estParcelle(u2, v2) || mairie(u2, v2) || occ[u2 + "," + v2]) continue;
        var hh = hache(u2 * 97 + v2, 5);
        if (s !== 0 && image("maire/img/quartier/pelouse.webp")) {
          (function (a, b, h) { var nom = h < 0.35 ? "pelouse" : h < 0.55 ? "sol-arbre" : h < 0.7 ? "place" : h < 0.8 ? "sol-banc" : h < 0.88 ? "sol-lampe" : "pelouse";
            objs.push({ p: a + b + 0.9, f: function () { dalle(x, nom, a, b, hache(a, b) < 0.5); } }); })(u2, v2, hh);
          continue;
        }
        if (hh < 0.55) (function (a, b, h) { objs.push({ p: a + b + 1, f: function () { arbre(x, a + 0.3 + h * 0.4, b + 0.35 + hache(a, b) * 0.3, s, 0.8 + h * 0.4); } }); })(u2, v2, hh);
        if (hh < 0.2) (function (a, b) { objs.push({ p: a + b + 1.2, f: function () { arbre(x, a + 0.75, b + 0.8, s, 0.7); } }); })(u2, v2);
      }
      // déco des trottoirs
      (V.deco || []).forEach(function (o) { objs.push({ p: o.u + o.v, f: function () { deco(x, o, t, s); } }); });
      // réverbères aux carrefours
      for (var i = z.x0; i <= z.x1; i += 3) for (var j = z.y0; j <= z.y1; j += 3) (function (i, j) { objs.push({ p: i + j + 1.05, f: function () { lampe(x, i + 0.95, j + 0.95, nu); } }); })(i, j);
      // habitants, voitures, bus, vélos, police
      V.agents.forEach(function (a) {
        var f = a.prog, pu = a.u + a.dir[0] * f + (a.dir[1] !== 0 ? -a.cote * a.dir[1] : 0), pv = a.v + a.dir[1] * f + (a.dir[0] !== 0 ? a.cote * a.dir[0] : 0);
        a.pu = pu; a.pv = pv;
        objs.push({ p: pu + pv, f: function () { agent(x, a, pu, pv, t, nu); } });
      });
      // événements
      evenements(x, V, objs, t, nu);
      objs.sort(function (a, b) { return a.p - b.p; });
      objs.forEach(function (o) { o.f(); });
      // nuit : la ville s'assombrit, les fenêtres et les réverbères s'allument
      x.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
      if (nu > 0.02) {
        x.fillStyle = "rgba(14,20,60," + (nu * 0.55) + ")"; x.fillRect(0, 0, V.vueW, V.vueH);
        x.setTransform(cam.dpr * cam.k, 0, 0, cam.dpr * cam.k, cam.dpr * cam.ox, cam.dpr * cam.oy);
        x.globalCompositeOperation = "lighter";
        lumieres(x, V, nu, t);
        x.globalCompositeOperation = "source-over";
        x.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
      }
      // particules (neige, feuilles, pétales, confettis) en coordonnées écran
      V.parts.forEach(function (p) {
        if (p.k === "confetti") { x.fillStyle = p.c; x.fillRect(p.x, p.y, 4, 2.5); return; }
        x.fillStyle = s === 0 ? "rgba(255,255,255,.9)" : s === 3 ? (p.r > 3 ? "#d9822b" : "#b5521f") : s === 1 ? "#ffc0d6" : "#fff";
        if (s === 0) { x.beginPath(); x.arc(p.x, p.y, 1.2 + p.r / 4, 0, 7); x.fill(); } else x.fillRect(p.x, p.y, 3, 2);
      });
      // sélection (déplacement)
      if (V.sel && V.d.pos[V.sel]) {
        x.setTransform(cam.dpr * cam.k, 0, 0, cam.dpr * cam.k, cam.dpr * cam.ox, cam.dpr * cam.oy);
        var it = (d.items || []).filter(function (q) { return q.cle === V.sel; })[0], ps = V.d.pos[V.sel];
        x.lineWidth = 3 / cam.k; losange(x, ps[0], ps[1], it && it.gros ? 2 : 1, it && it.gros ? 2 : 1, "rgba(255,213,106,.25)", "#ffd56a");
      }
    };
    // ---------- les dessins ----------
    function dessinerBat(x, V, it, p, t, s) {
      var n = it.gros ? 2 : 1, bas = P(p[0] + n, p[1] + n), w = TW * n * 1.06;
      if (it.chantier) return chantier(x, p, n, t, it, s);
      var img = image(it.img);
      if (img) {
        var hgt = w * img.naturalHeight / img.naturalWidth;
        x.drawImage(img, bas[0] - w / 2, bas[1] - hgt * 0.955 + 2, w, hgt);
        if (s === 0) { // un peu de neige sur les toits
          x.fillStyle = "rgba(255,255,255,.18)"; x.fillRect(bas[0] - w / 2, bas[1] - hgt * 0.95, w, hgt * 0.35);
        }
        it._r = [bas[0] - w / 2, bas[1] - hgt * 0.955, w, hgt];
      } else {
        boite(x, p[0] + 0.1, p[1] + 0.1, n - 0.2, n - 0.2, 26 * n, "#e8dcc0", "#cbbd9c", "#5a6a8a");
        x.font = (18 * n) + "px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif"; x.textAlign = "center";
        x.fillText(it.ico || "🏢", bas[0], bas[1] - 26 * n - 10);
        it._r = [bas[0] - w / 2, bas[1] - 60 * n, w, 60 * n];
      }
    }
    function dessinerMairie(x, u, v, s, t, V) {
      var nu = V.d && V.d.nuit != null ? V.d.nuit : window.MAIRE_NUIT != null ? window.MAIRE_NUIT : nuit(), bm = P(u + 2, v + 2);
      if (sprite(x, V.ev("fete") ? "mairie-fete" : s === 0 ? "mairie-neige" : nu > 0.5 ? "mairie-nuit" : "mairie-jour", bm[0], bm[1] + 6, TW * 2.15)) {
        V._mairie = [bm[0] - TW * 1.07, bm[1] - TW * 2.1, TW * 2.15, TW * 2.15]; return;
      }
      losange(x, u, v, 2, 2, "#cfc6b0");
      losange(x, u + 0.15, v + 0.15, 1.7, 1.7, "#e4dccb");
      // parterres
      losange(x, u + 0.1, v + 1.55, 0.5, 0.35, s === 0 ? "#e9f1f5" : "#5aa64a"); losange(x, u + 1.4, v + 1.55, 0.5, 0.35, s === 0 ? "#e9f1f5" : "#5aa64a");
      boite(x, u + 0.3, v + 0.3, 1.4, 1.0, 34, "#efe3c6", "#d6c7a3", "#e9dcbd");
      // toit d'ardoise
      var a = P(u + 0.3, v + 1.3), b = P(u + 1.7, v + 1.3), c = P(u + 1.7, v + 0.3), o = P(u + 0.3, v + 0.3), m1 = P(u + 0.55, v + 0.8), m2 = P(u + 1.45, v + 0.8);
      x.fillStyle = "#3e4f72"; x.beginPath(); x.moveTo(a[0], a[1] - 34); x.lineTo(b[0], b[1] - 34); x.lineTo(m2[0], m2[1] - 56); x.lineTo(m1[0], m1[1] - 56); x.closePath(); x.fill();
      x.fillStyle = "#2f3d5c"; x.beginPath(); x.moveTo(b[0], b[1] - 34); x.lineTo(c[0], c[1] - 34); x.lineTo(m2[0], m2[1] - 56); x.closePath(); x.fill();
      x.fillStyle = "#4a5d85"; x.beginPath(); x.moveTo(o[0], o[1] - 34); x.lineTo(c[0], c[1] - 34); x.lineTo(m2[0], m2[1] - 56); x.lineTo(m1[0], m1[1] - 56); x.closePath(); x.fill();
      if (s === 0) { x.fillStyle = "rgba(255,255,255,.75)"; x.beginPath(); x.moveTo(m1[0], m1[1] - 56); x.lineTo(m2[0], m2[1] - 56); x.lineTo(m2[0] - 6, m2[1] - 50); x.lineTo(m1[0] - 6, m1[1] - 50); x.fill(); }
      // fenêtres et porte (façade gauche)
      for (var k = 0; k < 4; k++) {
        var f = P(u + 0.45 + k * 0.32, v + 1.3);
        x.fillStyle = "#2c3e66"; x.fillRect(f[0] - 2, f[1] - 26, 5, 8); x.fillRect(f[0] - 2, f[1] - 14, 5, 8);
      }
      var po = P(u + 1.0, v + 1.3); x.fillStyle = "#5a3a1e"; x.fillRect(po[0] - 4, po[1] - 12, 8, 12);
      // horloge et drapeau
      var hz = P(u + 1.0, v + 0.8); x.fillStyle = "#fff"; x.beginPath(); x.arc(hz[0], hz[1] - 47, 4, 0, 7); x.fill(); x.strokeStyle = "#333"; x.lineWidth = 0.8; x.stroke();
      x.strokeStyle = "#555"; x.lineWidth = 1; x.beginPath(); x.moveTo(m2[0], m2[1] - 56); x.lineTo(m2[0], m2[1] - 74); x.stroke();
      var ond = Math.sin(t * 4) * 1.5;
      [["#2b4fb3", 0], ["#fff", 4], ["#d6362c", 8]].forEach(function (c) { x.fillStyle = c[0]; x.fillRect(m2[0] + 1 + c[1], m2[1] - 74 + (c[1] ? ond * c[1] / 8 : 0), 4, 6); });
      V._mairie = [P(u, v + 2)[0], P(u + 1, v)[1] - 80, TW * 2, 110];
    }
    function arbre(x, u, v, s, k) {
      var b = P(u, v), f = FEUILLE[s];
      x.fillStyle = "#6b4a2b"; x.fillRect(b[0] - 1.2 * k, b[1] - 9 * k, 2.4 * k, 9 * k);
      if (s === 0) { x.fillStyle = "#7a6a5a"; x.fillRect(b[0] - 5 * k, b[1] - 13 * k, 10 * k, 1.5); x.fillStyle = "#fff"; x.beginPath(); x.arc(b[0], b[1] - 14 * k, 5 * k, Math.PI, 0); x.fill(); return; }
      x.fillStyle = f[0]; x.beginPath(); x.arc(b[0], b[1] - 15 * k, 8 * k, 0, 7); x.fill();
      x.fillStyle = f[1]; x.beginPath(); x.arc(b[0] - 2.5 * k, b[1] - 17 * k, 4.5 * k, 0, 7); x.fill();
      if (s === 1) { x.fillStyle = "#ffc0d6"; for (var i = 0; i < 4; i++) x.fillRect(b[0] - 5 * k + i * 3 * k, b[1] - 18 * k + (i % 2) * 5 * k, 1.6, 1.6); }
    }
    function lampe(x, u, v, nu) {
      var b = P(u, v); x.strokeStyle = "#2a2f3a"; x.lineWidth = 1.2; x.beginPath(); x.moveTo(b[0], b[1]); x.lineTo(b[0], b[1] - 16); x.stroke();
      x.fillStyle = nu > 0.2 ? "#ffe9a0" : "#3a4050"; x.fillRect(b[0] - 1.8, b[1] - 19, 3.6, 3.6);
    }
    function deco(x, o, t, s) {
      var b = P(o.u, o.v);
      if (o.k === "dechet") { x.fillStyle = "#2d2d2d"; x.beginPath(); x.arc(b[0], b[1] - 2.5, 3, 0, 7); x.fill(); x.fillStyle = "#555"; x.beginPath(); x.arc(b[0] + 3, b[1] - 1.5, 2, 0, 7); x.fill(); x.fillStyle = "#8a6"; x.fillRect(b[0] - 5, b[1] - 1, 2, 1.5); }
      else if (o.k === "tag") { x.strokeStyle = o.c; x.lineWidth = 1.4; x.beginPath(); x.moveTo(b[0] - 6, b[1] - 1); x.quadraticCurveTo(b[0] - 2, b[1] - 6, b[0] + 1, b[1] - 1); x.quadraticCurveTo(b[0] + 4, b[1] + 3, b[0] + 7, b[1] - 3); x.stroke(); }
      else if (s !== 0) { x.fillStyle = "#6b4a2b"; x.fillRect(b[0] - 3, b[1] - 3, 6, 3); x.fillStyle = o.c; x.beginPath(); x.arc(b[0] - 1.5, b[1] - 4.5, 1.6, 0, 7); x.arc(b[0] + 1.5, b[1] - 5, 1.6, 0, 7); x.fill(); }
    }
    function agent(x, a, u, v, t, nu) {
      var b = P(u, v), dx = (a.dir[0] - a.dir[1]), dy = (a.dir[0] + a.dir[1]) * 0.5;   // direction à l'écran
      var miroir = dx < 0, bob = a.pause > 0 ? 0 : Math.abs(Math.sin(t * 9 + a.ph)) * 0.8;
      if (a.type === "pieton" && sprite(x, PIETONS[Math.floor(a.n * PIETONS.length)], b[0], b[1] + 1 - bob, 14, miroir)) {
        if (a.coeur > 0) { x.fillStyle = "rgba(230,60,90," + Math.min(1, a.coeur) + ")"; x.font = "7px sans-serif"; x.textAlign = "center"; x.fillText("♥", b[0], b[1] - 19 - (1.6 - a.coeur) * 6); }
        return;
      }
      if (a.type === "velo" && sprite(x, a.n < 0.6 ? "cycliste" : "livreur", b[0], b[1] + 1, 17, miroir)) return;
      if ((a.type === "voiture" || a.type === "bus") && sprite(x, a.type === "bus" ? "bus" : AUTOS[Math.floor(a.n * AUTOS.length)], b[0], b[1] + 3, a.type === "bus" ? 42 : 28, miroir)) return;
      if (a.type === "pieton") {
        var pas = a.pause > 0 ? 0 : Math.sin(t * 9 + a.ph) * 1.4;
        x.fillStyle = "#2b2b3a"; x.fillRect(b[0] - 1.6 + pas * 0.3, b[1] - 4, 1.3, 4); x.fillRect(b[0] + 0.3 - pas * 0.3, b[1] - 4, 1.3, 4);
        x.fillStyle = a.c; x.fillRect(b[0] - 2, b[1] - 9, 4, 5.5);
        x.fillStyle = "#f1c7a0"; x.beginPath(); x.arc(b[0], b[1] - 10.8, 1.9, 0, 7); x.fill();
        if (a.coeur > 0) { x.fillStyle = "rgba(230,60,90," + Math.min(1, a.coeur) + ")"; x.font = "7px sans-serif"; x.textAlign = "center"; x.fillText("♥", b[0], b[1] - 15 - (1.6 - a.coeur) * 6); }
        return;
      }
      if (a.type === "velo") {
        x.strokeStyle = "#222"; x.lineWidth = 0.8; x.beginPath(); x.arc(b[0] - dx * 2, b[1] - 2 - dy * 2, 1.6, 0, 7); x.arc(b[0] + dx * 2, b[1] - 2 + dy * 2, 1.6, 0, 7); x.stroke();
        x.fillStyle = a.c; x.fillRect(b[0] - 1.5, b[1] - 8, 3, 4); x.fillStyle = "#f1c7a0"; x.beginPath(); x.arc(b[0], b[1] - 9.5, 1.6, 0, 7); x.fill(); return;
      }
      var long = a.type === "bus" ? 1.7 : 0.75, lg = 0.42, hz = a.type === "bus" ? 11 : 6;
      var c1 = a.type === "bus" ? "#1d8a5a" : a.type === "police" ? "#f4f6fa" : a.c, c2 = a.type === "bus" ? "#156a45" : a.type === "police" ? "#cfd6e2" : ombre(a.c), ct = a.type === "bus" ? "#e9f2ee" : a.type === "police" ? "#2b4fb3" : ombre(a.c, 0.15);
      // boîte orientée selon la rue (u ou v)
      var w = a.dir[0] !== 0 ? long : lg, d = a.dir[0] !== 0 ? lg : long;
      boite(x, u - w / 2, v - d / 2, w, d, hz, c2, c1, ct);
      if (a.type === "bus") { var f1 = P(u - w / 2, v + d / 2), f2 = P(u + w / 2, v + d / 2); x.fillStyle = "#bfe3f5"; x.beginPath(); x.moveTo(f1[0], f1[1] - 8); x.lineTo(f2[0], f2[1] - 8); x.lineTo(f2[0], f2[1] - 5); x.lineTo(f1[0], f1[1] - 5); x.fill(); }
      if (a.type === "police") { var gy = Math.floor(t * 4) % 2; x.fillStyle = gy ? "#3b7cff" : "#ff3b3b"; x.fillRect(b[0] - 1.5, b[1] - hz - 3, 3, 2); }
    }
    function ombre(c, k) { var n = parseInt(c.slice(1), 16), f = 1 - (k == null ? 0.25 : -k); var r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f)); return "rgb(" + r + "," + g + "," + b + ")"; }
    function chantier(x, p, n, t, it, s) {
      losange(x, p[0] + 0.05, p[1] + 0.05, n - 0.1, n - 0.1, s === 0 ? "#d9d4cc" : "#a87b4f");
      // palissade
      var c = [P(p[0] + 0.05, p[1] + 0.05), P(p[0] + n - 0.05, p[1] + 0.05), P(p[0] + n - 0.05, p[1] + n - 0.05), P(p[0] + 0.05, p[1] + n - 0.05)];
      x.strokeStyle = "#e8a33a"; x.lineWidth = 1.4;
      [[0, 1], [1, 2], [2, 3], [3, 0]].forEach(function (e, k) { var a = c[e[0]], b = c[e[1]]; x.beginPath(); x.moveTo(a[0], a[1] - 4); x.lineTo(b[0], b[1] - 4); x.stroke(); });
      // la structure qui monte avec l'avancement
      var pct = Math.max(0.1, Math.min(1, it.pct || 0.1));
      boite(x, p[0] + 0.25, p[1] + 0.25, n - 0.5, n - 0.5, 30 * n * pct, "#b9b4aa", "#9d978c", "#c9c4ba");
      // grue
      var m = P(p[0] + 0.2, p[1] + 0.2), hz = 46 * n, ang = Math.sin(t * 0.6 + p[0]) * 0.9;
      x.strokeStyle = "#f5b21a"; x.lineWidth = 2; x.beginPath(); x.moveTo(m[0], m[1]); x.lineTo(m[0], m[1] - hz); x.stroke();
      var bx = Math.cos(ang) * 26 * n, by = Math.sin(ang) * 8 * n;
      x.lineWidth = 1.6; x.beginPath(); x.moveTo(m[0] - bx * 0.3, m[1] - hz - by * 0.3); x.lineTo(m[0] + bx, m[1] - hz + by); x.stroke();
      x.strokeStyle = "#333"; x.lineWidth = 0.6; x.beginPath(); x.moveTo(m[0] + bx * 0.8, m[1] - hz + by * 0.8); x.lineTo(m[0] + bx * 0.8, m[1] - hz + by * 0.8 + 14 + Math.sin(t * 1.3) * 4); x.stroke();
      x.fillStyle = "#555"; x.fillRect(m[0] + bx * 0.8 - 2, m[1] - hz + by * 0.8 + 14 + Math.sin(t * 1.3) * 4, 4, 3);
      var bb = P(p[0] + n, p[1] + n);
      it._r = [bb[0] - TW * n / 2, bb[1] - hz - 10, TW * n, hz + 10];
    }
    // Les fenêtres allumées : des points pris dans les parties claires du dessin (calculés une fois par image)
    function fenetres(img) {
      var k = img.src; if (Vue.prototype._f && Vue.prototype._f[k]) return Vue.prototype._f[k];
      var F = Vue.prototype._f = Vue.prototype._f || {}, l = [];
      try {
        var c = document.createElement("canvas"), W = 48, H = Math.round(48 * img.naturalHeight / img.naturalWidth); c.width = W; c.height = H;
        var g = c.getContext("2d"); g.drawImage(img, 0, 0, W, H); var px = g.getImageData(0, 0, W, H).data;
        for (var y = Math.floor(H * 0.12); y < H * 0.72; y += 2) for (var xx = 4; xx < W - 4; xx += 2) {
          var i = (y * W + xx) * 4; if (px[i + 3] < 250) continue;
          var r = px[i], gg = px[i + 1], b = px[i + 2], lum = (r + gg + b) / 3;
          if ((b > r + 10 && lum < 140) || lum < 60) l.push([xx / W, y / H]);   // vitres (bleutées ou sombres)
        }
      } catch (e) { /* image d'une autre origine : pas de fenêtres */ }
      l = l.filter(function (_, i) { return hache(i, l.length) < 0.25; }).slice(0, 14);
      F[k] = l; return l;
    }
    function lumieres(x, V, nu, t) {
      var d = V.d;
      (d.items || []).forEach(function (it) {
        if (!it._r || it.chantier) return;
        var img = image(it.img); if (!img) return;
        var l = fenetres(img), r = it._r;
        l.forEach(function (f, i) { if (hache(i, it.cle.length * 7 + Math.floor(t / 7)) < 0.25) return; x.fillStyle = "rgba(255,200,90," + (0.55 * nu) + ")"; x.fillRect(r[0] + f[0] * r[2] - 1.2, r[1] + f[1] * r[3] - 1.2, 2.6, 2.6); });
      });
      // réverbères
      var z = V.zone;
      for (var i = z.x0; i <= z.x1; i += 3) for (var j = z.y0; j <= z.y1; j += 3) {
        var b = P(i + 0.95, j + 0.95), g = x.createRadialGradient(b[0], b[1] - 17, 0, b[0], b[1] - 17, 22);
        g.addColorStop(0, "rgba(255,220,140," + 0.5 * nu + ")"); g.addColorStop(1, "rgba(255,220,140,0)"); x.fillStyle = g; x.fillRect(b[0] - 22, b[1] - 39, 44, 44);
      }
      // phares
      V.agents.forEach(function (a) { if (a.type === "pieton" || a.type === "velo" || a.pu == null) return; var b = P(a.pu + a.dir[0] * 0.5, a.pv + a.dir[1] * 0.5); x.fillStyle = "rgba(255,240,180," + 0.6 * nu + ")"; x.beginPath(); x.arc(b[0], b[1] - 3, 3, 0, 7); x.fill(); });
      // feu d'artifice les soirs de fête
      if (V.ev("fete")) for (var k = 0; k < 3; k++) {
        var ph = (t * 0.5 + k / 3) % 1, cx = P(CENTRE * 3 + 1 + k * 0.7, CENTRE * 3 + 0.5), rr = ph * 30;
        for (var q = 0; q < 12; q++) { var a2 = q / 12 * 6.283; x.fillStyle = "rgba(" + ["255,90,90", "120,170,255", "255,220,90"][k] + "," + (1 - ph) * nu + ")"; x.fillRect(cx[0] + Math.cos(a2) * rr, cx[1] - 110 + Math.sin(a2) * rr + ph * 10, 2, 2); }
      }
    }
    // Événements : manifestation / grève, presse, scandale, bouclier, déménagements, fête
    function evenements(x, V, objs, t, nu) {
      var cu = CENTRE * 3 + 1, cv = CENTRE * 3 + 1;
      var foule = V.ev("manif") || V.ev("greve");
      if (foule) {
        for (var i = 0; i < 16; i++) (function (i) {
          var u = cu + 0.2 + (i % 8) * 0.22 + Math.sin(t + i) * 0.05, v = cv + 2.15 + Math.floor(i / 8) * 0.35;
          objs.push({ p: u + v, f: function () {
            var b = P(u, v), saut = Math.abs(Math.sin(t * 5 + i)) * 2;
            x.fillStyle = COUL[i % COUL.length]; x.fillRect(b[0] - 2, b[1] - 9 - saut, 4, 6); x.fillStyle = "#f1c7a0"; x.beginPath(); x.arc(b[0], b[1] - 11 - saut, 1.9, 0, 7); x.fill();
            if (i % 3 === 0) { x.strokeStyle = "#6b4a2b"; x.lineWidth = 0.8; x.beginPath(); x.moveTo(b[0] + 2, b[1] - 9 - saut); x.lineTo(b[0] + 2, b[1] - 20 - saut); x.stroke(); x.fillStyle = i % 2 ? "#d6362c" : "#fff"; x.fillRect(b[0] - 3, b[1] - 26 - saut, 10, 6); x.fillStyle = "#222"; x.fillRect(b[0] - 1.5, b[1] - 24 - saut, 7, 1); }
          } });
        })(i);
      }
      var presse = V.ev("presse") || V.ev("scandale");
      if (presse) {
        for (var j = 0; j < 4; j++) (function (j) {
          var u = cu - 0.45, v = cv + 0.3 + j * 0.4;
          objs.push({ p: u + v, f: function () {
            var b = P(u, v); x.fillStyle = "#333"; x.fillRect(b[0] - 2, b[1] - 9, 4, 6); x.fillStyle = "#f1c7a0"; x.beginPath(); x.arc(b[0], b[1] - 11, 1.9, 0, 7); x.fill();
            x.fillStyle = "#111"; x.fillRect(b[0] + 1, b[1] - 12, 4, 3);
            if (Math.sin(t * 7 + j * 2.1) > 0.85) { x.fillStyle = "rgba(255,255,255,.95)"; x.beginPath(); x.arc(b[0] + 4, b[1] - 11, 4, 0, 7); x.fill(); }
          } });
        })(j);
        if (V.ev("scandale")) objs.push({ p: cu - 0.5 + cv + 1.6, f: function () { boite(x, cu - 0.75, cv + 1.4, 0.45, 0.9, 10, "#dcdcdc", "#f4f4f4", "#e8e8e8"); var b = P(cu - 0.55, cv + 1.8); x.strokeStyle = "#999"; x.beginPath(); x.moveTo(b[0], b[1] - 10); x.lineTo(b[0], b[1] - 16); x.stroke(); x.fillStyle = "#ccc"; x.beginPath(); x.ellipse(b[0], b[1] - 17, 4, 2, -0.5, 0, 7); x.fill(); } });
      }
      if (V.ev("depart")) objs.push({ p: cu + 2.2 + cv - 0.6, f: function () { boite(x, cu + 2.05, cv - 1.0, 0.9, 0.45, 14, "#e9e1d0", "#fff", "#f4efe4"); var b = P(cu + 2.5, cv - 0.55); x.fillStyle = "#8a5a2b"; x.fillRect(b[0] - 12, b[1] - 3, 5, 4); x.fillRect(b[0] - 17, b[1] - 1, 4, 3); } });
      if (V.ev("bouclier")) objs.push({ p: 99, f: function () {
        var b = P(cu + 1, cv + 1), e = V.ev("bouclier"), k = 0.5 + 0.2 * Math.sin(t * 3);
        x.strokeStyle = "rgba(120,190,255," + Math.min(1, k + 0.3) + ")"; x.fillStyle = "rgba(90,160,255," + k * 0.45 + ")"; x.lineWidth = 3;
        x.beginPath(); x.ellipse(b[0], b[1] - 20, TW * 1.15, 62, 0, Math.PI, 0); x.closePath(); x.fill(); x.stroke();
      } });
      if (V.ev("fete")) {
        objs.push({ p: cu + cv + 4.2, f: function () {
          // guirlandes tricolores devant la mairie
          var a = P(cu, cv + 2.05), b = P(cu + 2, cv + 2.05);
          for (var k = 0; k < 10; k++) { var f = k / 9, px = a[0] + (b[0] - a[0]) * f, py = a[1] + (b[1] - a[1]) * f - 20 + Math.sin(f * 3.14) * 6; x.fillStyle = ["#2b4fb3", "#fff", "#d6362c"][k % 3]; x.beginPath(); x.moveTo(px - 2, py); x.lineTo(px + 2, py); x.lineTo(px, py + 4); x.fill(); }
        } });
      }
    }
    // ---------- gestes : glisser, zoomer, toucher ----------
    Vue.prototype.gestes = function () {
      var V = this, c = V.c, pts = {}, dep = null, dist0 = 0, zoom0 = 1, bouge = 0;
      c.style.touchAction = "none";
      c.addEventListener("pointerdown", function (e) { c.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY]; bouge = 0; dep = [e.clientX, e.clientY, V.pan[0], V.pan[1]];
        var k = Object.keys(pts); if (k.length === 2) { dist0 = Math.hypot(pts[k[0]][0] - pts[k[1]][0], pts[k[0]][1] - pts[k[1]][1]); zoom0 = V.zoom; } });
      c.addEventListener("pointermove", function (e) {
        if (!pts[e.pointerId]) return; pts[e.pointerId] = [e.clientX, e.clientY];
        var k = Object.keys(pts);
        if (k.length === 2) { var dd = Math.hypot(pts[k[0]][0] - pts[k[1]][0], pts[k[0]][1] - pts[k[1]][1]); V.zoomer(zoom0 * dd / Math.max(10, dist0) / V.zoom); bouge = 99; return; }
        if (!dep) return; var dx = e.clientX - dep[0], dy = e.clientY - dep[1]; bouge = Math.max(bouge, Math.abs(dx) + Math.abs(dy));
        V.pan = [dep[2] + dx, dep[3] + dy]; if (V.calme) V.dessiner(performance.now() / 1000);
      });
      function fin(e) { var etait = pts[e.pointerId]; delete pts[e.pointerId]; if (etait && bouge < 8 && !Object.keys(pts).length) V.toucher(e); }
      c.addEventListener("pointerup", fin); c.addEventListener("pointercancel", function (e) { delete pts[e.pointerId]; });
      c.addEventListener("wheel", function (e) { e.preventDefault(); V.zoomer(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    };
    Vue.prototype.zoomer = function (f) { this.zoom = Math.max(0.6, Math.min(4, this.zoom * f)); this.pan = [this.pan[0] * f, this.pan[1] * f]; if (this.calme) this.dessiner(performance.now() / 1000); };
    Vue.prototype.toucher = function (e) {
      var V = this, r = V.c.getBoundingClientRect(), cam = V.cam; if (!cam || !V.d) return;
      var sx = (e.clientX - r.left - cam.ox) / cam.k, sy = (e.clientY - r.top - cam.oy) / cam.k;
      // bâtiment touché (le plus en avant d'abord)
      var touche = null;
      (V.d.items || []).slice().sort(function (a, b) { var pa = V.d.pos[a.cle], pb = V.d.pos[b.cle]; return (pb ? pb[0] + pb[1] : 0) - (pa ? pa[0] + pa[1] : 0); }).some(function (it) {
        var q = it._r; if (q && sx >= q[0] + q[2] * 0.12 && sx <= q[0] + q[2] * 0.88 && sy >= q[1] + q[3] * 0.1 && sy <= q[1] + q[3]) { touche = it; return true; } return false;
      });
      var c = inv(sx, sy), cel = [Math.floor(c[0]), Math.floor(c[1])];
      if (V.mode === "deplacer") {
        if (!V.sel) { if (touche && !touche.chantier) V.sel = touche.cle; V.dessiner(performance.now() / 1000); if (V.onTap) V.onTap(touche, V.sel ? "choisi" : "rien"); return; }
        var cible = touche && touche.cle !== V.sel ? V.d.pos[touche.cle] : cel;
        var n = deplacer(V.d.items, V.d.pos, V.sel, cible);
        if (n) { V.d.pos = n; V.sel = null; if (V.onMove) V.onMove(n); V.dessiner(performance.now() / 1000); if (V.onTap) V.onTap(null, "pose"); }
        else if (V.onTap) V.onTap(null, "impossible");
        return;
      }
      if (V.onTap) V.onTap(touche || (V._mairie && sx >= V._mairie[0] && sx <= V._mairie[0] + V._mairie[2] && sy >= V._mairie[1] && sy <= V._mairie[1] + V._mairie[3] ? { mairie: true } : null), "voir");
    };
    API.Vue = Vue;
    API.nuit = nuit;
  })();

  if (typeof module === "object" && module.exports) module.exports = API;
  else root.MaireQuartier = API;
})(typeof window !== "undefined" ? window : this);
