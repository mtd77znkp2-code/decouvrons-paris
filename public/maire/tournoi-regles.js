// Grand Tournoi des Maires : les règles (module pur, partagé entre le serveur et le navigateur).
// Un tournoi par session et par mandat : il ouvre 4 minutes avant l'élection et ferme 30 secondes avant.
// Une seule épreuve, tirée par le serveur, pour les 21 maires de la session (les maires robots ont un score selon leur place).
// Récompenses à la clôture : 1er +10 de popularité, 2e +9 … 10e +1 ; à partir de la 11e place : −11 (la popularité reste entre 0 et 100).
(function (root) {
  "use strict";
  var AVANT_MS = 4 * 60000, CLOTURE_MS = 30000, NB = 21;
  var T = root.MaireTournoiJeux || (typeof require === "function" ? require("./tournoi-jeux.js") : null);

  function idTournoi(sessionId, election) { return sessionId + "_" + election; }
  // Le tournoi du mandat en cours (celui qui précède l'élection n° s.election + 1)
  function fenetre(s) { return { election: (s.election || 0) + 1, ouverture: s.prochaine - AVANT_MS, cloture: s.prochaine - CLOTURE_MS }; }
  function ouvert(s, maintenant) { var f = fenetre(s); return maintenant >= f.ouverture - 5000 && maintenant < f.cloture; }

  // Gain ou perte de popularité selon le rang (1 = premier)
  function gain(rang) { return rang <= 10 ? 11 - rang : -11; }

  // Score d'un maire robot : selon sa place dans la session (les mieux placés sont plus forts), avec un peu de hasard reproductible
  function hache(a, b) { var h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) | 0; h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  // Clé publique des robots (tirée de l'identifiant du tournoi) : le classement provisoire peut les afficher sans connaître la graine secrète
  function cleBots(tid) { var h = 2166136261; for (var i = 0; i < tid.length; i++) h = Math.imul(h ^ tid.charCodeAt(i), 16777619); return h | 0; }
  function scoreBot(jeu, graine, place) {
    var typ = (T && T.JEUX[jeu] && T.JEUX[jeu].typique) || 300;
    return Math.round(typ * (0.35 + 0.45 * (place / (NB - 1)) + 0.45 * hache(graine, place)));
  }

  // Classement final : tous les maires de la session (joueurs, présents ou non, et robots)
  // parts : { uid: { score, fin, statut } } ; à égalité, celui qui a fini le plus tôt passe devant, puis les joueurs avant les robots
  function classement(tournoi, session, parts) {
    var l = [];
    for (var p = 0; p < NB; p++) {
      var x = session.places[p]; if (!x) continue;
      if (x.type === "joueur") {
        var q = parts[x.uid];
        l.push({ uid: x.uid, nom: x.nom, ico: x.ico, place: p, score: q && q.statut === "fini" ? q.score : 0, fin: q && q.fin ? q.fin : Infinity, absent: !q, bot: false });
      } else l.push({ uid: null, nom: x.nom, ico: x.ico, place: p, score: scoreBot(tournoi.jeu, cleBots(tournoi.id), p), fin: Infinity, bot: true });
    }
    l.sort(function (a, b) { return b.score - a.score || a.fin - b.fin || (a.bot - b.bot) || b.place - a.place; });
    return l.map(function (x, i) { return { rang: i + 1, uid: x.uid, nom: x.nom, ico: x.ico, place: x.place, score: x.score, bot: x.bot, absent: !!x.absent, gain: gain(i + 1) }; });
  }

  var API = { AVANT_MS: AVANT_MS, CLOTURE_MS: CLOTURE_MS, idTournoi: idTournoi, cleBots: cleBots, fenetre: fenetre, ouvert: ouvert, gain: gain, scoreBot: scoreBot, classement: classement };
  if (typeof module === "object" && module.exports) module.exports = API;
  else root.MaireTournoiRegles = API;
})(typeof window !== "undefined" ? window : this);
