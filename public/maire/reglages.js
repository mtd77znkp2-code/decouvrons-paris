// Réglages du Maire de Paris : TOUS les chiffres d'équilibrage modifiables, au même endroit, avec leur explication.
// - Les valeurs par défaut sont ici (« def »).
// - L'administration (onglet « Réglages du jeu ») enregistre les valeurs modifiées dans Firestore (config/maire) :
//   elles remplacent les valeurs par défaut au chargement du jeu, pour tous les joueurs.
// - Le code lit toujours la valeur au moment où il en a besoin : R.v.cle (jamais recopiée dans une constante).
// Pour ajouter un réglage : une ligne dans LISTE, puis lire R.v.cle là où le chiffre était écrit en dur.
(function (root) {
  "use strict";
  var LISTE = [
    // ---- Rythme de la session ----
    { k: "saisonSec", g: "Rythme de la session", nom: "Durée d’une saison", unite: "s", def: 25, min: 5, max: 120, pas: 1,
      desc: "Toutes les X secondes, une saison passe : recettes et dépenses tombent, la date avance. 24 saisons = un mandat." },
    { k: "dossierSec", g: "Rythme de la session", nom: "Arrivée d’un dossier", unite: "s", def: 90, min: 10, max: 900, pas: 5,
      desc: "Un nouveau dossier arrive dans la réserve toutes les X secondes (90 s = 1 min 30)." },
    { k: "reserveMax", g: "Rythme de la session", nom: "Dossiers en réserve (max)", unite: "", def: 4, min: 1, max: 10, pas: 1,
      desc: "Nombre de dossiers qu’un joueur peut garder en attente." },
    { k: "mandatMin", g: "Rythme de la session", nom: "Durée d’un mandat (entre deux élections)", unite: "min", def: 10, min: 2, max: 60, pas: 1,
      desc: "Temps entre deux élections dans une session." },
    { k: "entreeMin", g: "Rythme de la session", nom: "Fermeture avant l’élection", unite: "min", def: 3, min: 0, max: 10, pas: 0.5,
      desc: "On ne peut plus entrer dans une session à moins de X minutes de l’élection (une nouvelle session est créée)." },
    { k: "afkMin", g: "Rythme de la session", nom: "Anti-AFK", unite: "min", def: 15, min: 2, max: 120, pas: 1,
      desc: "Un joueur qui ne touche à rien pendant X minutes voit l’écran d’attente (puis quitte la session si personne ne revient)." },
    { k: "afkAttenteMin", g: "Rythme de la session", nom: "Écran d’attente avant la sortie", unite: "min", def: 10, min: 1, max: 60, pas: 1,
      desc: "Après l’anti-AFK, un écran « Tu es toujours là ? » laisse X minutes pour revenir avant de quitter la session." },
    { k: "venteMin", g: "Rythme de la session", nom: "Enchères de prestige", unite: "min", def: 6, min: 1, max: 30, pas: 1,
      desc: "Une enchère de bâtiment de prestige toutes les X minutes, qui dure X minutes." },

    // ---- Argent ----
    { k: "dossierSession", g: "Argent", nom: "Montants des dossiers en session", unite: "×", def: 1, min: 0.1, max: 3, pas: 0.05,
      desc: "Multiplie l’argent gagné ou perdu par les réponses aux dossiers (1 = montants normaux)." },
    { k: "fraisSession", g: "Argent", nom: "Frais de fonctionnement en session", unite: "×", def: 0.85, min: 0.3, max: 2, pas: 0.05,
      desc: "Multiplie les frais de fonctionnement de la ville à chaque saison (plus bas = plus facile)." },

    // ---- Niveaux de la partie (1 à 50) ----
    { k: "ptsSaison", g: "Niveaux de la partie", nom: "Points par saison (session)", unite: "pts", def: 9, min: 0, max: 100, pas: 1,
      desc: "Points de niveau gagnés à chaque saison qui passe." },
    { k: "ptsDossier", g: "Niveaux de la partie", nom: "Points par dossier tranché (session)", unite: "pts", def: 20, min: 0, max: 300, pas: 1,
      desc: "Points de niveau gagnés à chaque réponse à un dossier." },
    { k: "nivCourbe", g: "Niveaux de la partie", nom: "Difficulté des niveaux", unite: "pts", def: 30, min: 5, max: 200, pas: 1,
      desc: "Points demandés pour monter : X × (niveau − 1)^1,6. Plus haut = niveaux plus lents." },

    // ---- Casino ----
    { k: "casinoPoker", g: "Casino", nom: "Part du poker", unite: "%", def: 20, min: 0, max: 100, pas: 5,
      desc: "Quand une réponse se joue au casino : probabilité que ce soit du poker." },
    { k: "casinoBj", g: "Casino", nom: "Part du blackjack", unite: "%", def: 40, min: 0, max: 100, pas: 5,
      desc: "Probabilité que ce soit du blackjack. La roulette prend le reste (100 − poker − blackjack)." },

    // ---- Employés ----
    { k: "empHausse", g: "Employés", nom: "Hausse du prix à chaque embauche", unite: "×", def: 1.35, min: 1, max: 3, pas: 0.05,
      desc: "Chaque nouvel employé du même métier coûte X fois plus cher que le précédent." },
    { k: "empRendement", g: "Employés", nom: "Rendement des employés suivants", unite: "×", def: 0.75, min: 0.1, max: 1, pas: 0.05,
      desc: "Chaque nouvel employé du même métier est X fois moins efficace que le précédent." },

    // ---- Bots de la session ----
    { k: "botBase", g: "Bots de la session", nom: "Force de base des bots", unite: "pts", def: 41, min: 10, max: 80, pas: 1,
      desc: "Score de sondage de départ d’un bot (avant son talent, sa place et sa forme)." },
    { k: "botElan", g: "Bots de la session", nom: "Croissance / déclin des bots", unite: "pts", def: 10, min: 0, max: 30, pas: 1,
      desc: "Jusqu’à combien de points un bot en croissance gagne (ou un bot en déclin perd) pendant un mandat." },
    { k: "botXpMax", g: "Bots de la session", nom: "Expérience maximale des bots", unite: "pts", def: 6, min: 0, max: 30, pas: 1,
      desc: "Points de sondage qu’un bot gagne au fil des élections (plafond)." },
    { k: "botXpGain", g: "Bots de la session", nom: "Expérience gagnée par élection", unite: "pts", def: 0.6, min: 0, max: 5, pas: 0.1,
      desc: "Ce qu’un bot gagne d’expérience à chaque élection." },
    { k: "malusMax", g: "Bots de la session", nom: "Dégâts maximum des attaques", unite: "pts", def: 15, min: 0, max: 50, pas: 1,
      desc: "Une cible ne peut pas perdre plus de X points de sondage par attaques avant l’élection." }
  ];

  var v = {};
  LISTE.forEach(function (x) { v[x.k] = x.def; });
  // Valeurs venant de l'administration : seules les clés connues et les nombres dans les bornes sont gardés
  function appliquer(o) {
    LISTE.forEach(function (x) {
      var n = o && typeof o[x.k] === "number" && isFinite(o[x.k]) ? o[x.k] : x.def;
      v[x.k] = Math.max(x.min, Math.min(x.max, n));
    });
    return v;
  }
  function defauts() { var o = {}; LISTE.forEach(function (x) { o[x.k] = x.def; }); return o; }

  // Vitesse de test : seulement sur l'appareil de l'administrateur (réglée dans l'admin, gardée sur cet appareil)
  function vitesse() { try { var n = +root.localStorage.getItem("maire_vitesse_test"); return n > 1 ? Math.min(50, n) : 1; } catch (e) { return 1; } }

  var API = { LISTE: LISTE, v: v, appliquer: appliquer, defauts: defauts, vitesse: vitesse };
  if (typeof module === "object" && module.exports) module.exports = API;
  else root.MaireReglages = API;
})(typeof window !== "undefined" ? window : this);
