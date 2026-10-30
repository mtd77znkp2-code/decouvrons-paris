// Base de données Firebase (projet decouvrons-paris)
var FB_CONFIG={
  apiKey:"AIzaSyBhd_xCy7FMFmCpjWxHrHk-9Tqwk0rC_U4",
  // La connexion Google passe par l’adresse du site (indispensable sur iPhone) : Firebase Hosting la fournit
  // directement sur decouvrons-paris.web.app et decouvrons-paris.firebaseapp.com.
  authDomain:/^decouvrons-paris\.(web\.app|firebaseapp\.com)$/.test(location.hostname)?location.hostname:"decouvrons-paris.firebaseapp.com",
  projectId:"decouvrons-paris",
  storageBucket:"decouvrons-paris.firebasestorage.app",
  messagingSenderId:"67600209029",
  appId:"1:67600209029:web:f5ed5ec1afbcefc34e05ec"
};

var ADMIN_EMAIL="evangaberelinvest@gmail.com";

// Jeux
function $(i){return document.getElementById(i)}
function shuffle(a){return a.slice().sort(function(){return Math.random()-.5})}
function rec(g,s){var k="rec_"+g+"_"+(window.user||""),b=0;try{b=+localStorage.getItem(k)||0}catch(e){}if(s>b){b=s;try{localStorage.setItem(k,b)}catch(e){}}return b}
function imgSrc(x){return /^(data:|https?:)/.test(x)?x:"/_blob/"+x}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}

// Classement général (base partagée si disponible)
var LB={db:null,uid:null,docs:[],boards:{}};
// Nom du joueur partout (classements, sessions, poker) : son pseudo s'il en a choisi un,
// sinon « Maire0002 » : un numéro unique attribué une seule fois (compteurs/maires), gardé dans joueurs/{uid}
window.MAIRE_NUM=null;try{window.MAIRE_NUM=+localStorage.getItem("maire_numero")||null}catch(e){}
function pad4(n){return ("000"+n).slice(-4)}
window.nomJoueur=function(){
  if(window.user)return window.user.slice(0,20);
  if(window.MAIRE_NUM)return "Maire"+pad4(window.MAIRE_NUM);
  // Numéro pas encore attribué (hors ligne) : un numéro provisoire, gardé sur l'appareil
  var t=0;try{t=+localStorage.getItem("maire_numero_tmp")||0;if(!t){t=1000+Math.floor(Math.random()*9000);localStorage.setItem("maire_numero_tmp",t)}}catch(e){t=1000}
  return "Maire"+pad4(t);
};
function profilJoueur(){
  if(!LB.db||!LB.uid)return;
  var uid=LB.uid,ref=LB.db.doc("joueurs/"+uid),u=LB.auth&&LB.auth.currentUser;
  ref.get().then(function(d){
    var x=d.exists?d.data():{};
    if(x.pseudo&&!window.user){window.user=x.pseudo;try{localStorage.setItem("user",x.pseudo)}catch(e){}paintUser()}
    if(x.numero){window.MAIRE_NUM=x.numero;try{localStorage.setItem("maire_numero",x.numero)}catch(e){}return}
    if(window.MAIRE_NUM)return ref.set({numero:window.MAIRE_NUM,pseudo:window.user||"",google:!!(u&&!u.isAnonymous)},{merge:true});
    var c=LB.db.doc("compteurs/maires");
    return LB.db.runTransaction(function(tx){return tx.get(c).then(function(s){var n=(s.exists&&s.data().n||0)+1;tx.set(c,{n:n});return n})}).then(function(n){
      if(LB.uid!==uid)return;
      window.MAIRE_NUM=n;try{localStorage.setItem("maire_numero",n)}catch(e){}
      return ref.set({numero:n,pseudo:window.user||"",google:!!(u&&!u.isAnonymous)},{merge:true});
    });
  }).catch(function(){});
}
// Connexion Google du joueur (facultative) : le compte invité est relié à Google (même identifiant, rien n'est perdu).
// Si ce compte Google sert déjà sur un autre appareil, on bascule dessus (son pseudo et son numéro reviennent).
window.connexionGoogle=function(){
  if(!LB.auth||!window.firebase)return Promise.reject(new Error("Connexion indisponible ici."));
  var prov=new firebase.auth.GoogleAuthProvider(),u=LB.auth.currentUser;
  prov.setCustomParameters({prompt:"select_account"});
  var p=u&&u.isAnonymous?u.linkWithPopup(prov).catch(function(e){
    if(e&&(e.code==="auth/credential-already-in-use"||e.code==="auth/email-already-in-use")&&e.credential)return LB.auth.signInWithCredential(e.credential);
    throw e;
  }):LB.auth.signInWithPopup(prov);
  return p.then(function(){profilJoueur();if(LB.auth.currentUser)LB.db.doc("joueurs/"+LB.auth.currentUser.uid).set({google:true},{merge:true}).catch(function(){})}).catch(function(e){
    // Fenêtre bloquée (certains téléphones) : on passe par une redirection
    if(e&&(e.code==="auth/popup-blocked"||e.code==="auth/operation-not-supported-in-this-environment")){
      try{sessionStorage.setItem("connexion","jeu")}catch(x){}
      return u&&u.isAnonymous?u.linkWithRedirect(prov):LB.auth.signInWithRedirect(prov);
    }
    throw e;
  });
};
window.compteGoogle=function(){var u=LB.auth&&LB.auth.currentUser;return u&&!u.isAnonymous?{nom:u.displayName||"",email:u.email||""}:null};
function garderPseudo(){if(LB.db&&LB.uid)LB.db.doc("joueurs/"+LB.uid).set({pseudo:window.user||""},{merge:true}).catch(function(){})}
function lbBoard(id,key,title,fmt){LB.boards[id]={k:key,t:title,f:fmt};lbDraw(id)}
function lbRender(){for(var id in LB.boards)lbDraw(id)}
function lbDraw(id){
  var b=LB.boards[id],box=$(id);if(!b||!box)return;
  box.innerHTML="";box.appendChild(el("h4","",b.t()));
  if(!LB.db){box.appendChild(el("p","lbn","Le classement général n’est pas disponible pour le moment."));return}
  var key=b.k(),rows=LB.docs.filter(function(d){return d.s&&d.s[key]>0}).sort(function(x,y){return y.s[key]-x.s[key]}).slice(0,10);
  if(!rows.length){box.appendChild(el("p","lbn","Aucun score pour l’instant. Sois le premier !"));return}
  var t=el("ol","lbl");
  rows.forEach(function(d){var li=el("li",d.id===LB.uid?"me":"");li.appendChild(el("span","nm",d.name||"Anonyme"));li.appendChild(el("span","sc",b.f?b.f(d.s[key]):String(d.s[key])));t.appendChild(li)});
  box.appendChild(t);
}
function lbSubmit(key,score){
  if(!LB.db||!LB.uid)return Promise.resolve("Le classement général n’est pas disponible ici.");
  // Sans pseudo, le joueur apparaît quand même, sous son nom de maire numéroté (Maire0002)
  var nom=nomJoueur();
  var ref=LB.db.doc("scores/"+LB.uid);
  return ref.get().then(function(s){
    var d=s.exists?s.data():{},m=Object.assign({},d.s||{});
    if(!(score>(m[key]||0))){
      // Le score ne bouge pas, mais le pseudo a pu changer depuis
      if(d.name!==nom&&s.exists)return ref.set({name:nom,s:m,at:Date.now()}).then(function(){return "Ton meilleur score reste inchangé au classement."});
      return "Ton meilleur score reste inchangé au classement.";
    }
    m[key]=score;
    return ref.set({name:nom,s:m,at:Date.now()}).then(function(){return "Ton score est dans le classement général !"});
  }).catch(function(){return "Impossible d’enregistrer ton score dans le classement."});
}
(function(){
  try{
    if(!window.firebase)return;
    firebase.initializeApp(FB_CONFIG);
    var db=firebase.firestore(),auth=firebase.auth();
    LB.db=db;LB.auth=auth;lbRender();
    db.collection("questions").onSnapshot(function(s){
      window.QDB=s.docs.map(function(d){var x=d.data()||{};x.id=d.id;return x});window.QDB_OK=!s.metadata.fromCache;
      if(window.apRender)apRender();
    },function(){});
    db.collection("prix").onSnapshot(function(s){
      window.PDB=s.docs.map(function(d){var x=d.data()||{};x.id=d.id;return x});window.PDB_OK=!s.metadata.fromCache;
      if(window.apRender)apRender();
    },function(){});
    db.collection("spots").onSnapshot(function(s){
      window.SPDB=s.docs.map(function(d){var x=d.data()||{};x.id=d.id;return x});window.SPDB_OK=!s.metadata.fromCache;
      if(window.spotsData)spotsData();if(window.apRender)apRender();
    },function(){});
    db.collection("spotcats").onSnapshot(function(s){
      window.SCDB=s.docs.map(function(d){var x=d.data()||{};x.id=d.id;return x});window.SCDB_OK=!s.metadata.fromCache;
      if(window.spotsData)spotsData();if(window.apRender)apRender();
    },function(){});
    db.collection("videos").onSnapshot(function(s){
      window.VDB=s.docs.map(function(d){var x=d.data()||{};x.id=d.id;return x});
      if(window.ttRender)ttRender();if(window.apRender)apRender();
    },function(){});
    db.collection("lieux").onSnapshot(function(s){
      window.LDB=s.docs.map(function(d){var x=d.data()||{};x.id=d.id;return x});window.LDB_OK=!s.metadata.fromCache;
      if(window.apRender)apRender();
    },function(){});
    db.doc("config/maintenance").onSnapshot(function(s){
      window.MAINT=s.exists?s.data()||{}:{};applyMaint();if(window.apRender)apRender();
    },function(){});
    db.collection("scores").onSnapshot(function(s){
      LB.docs=s.docs.map(function(d){var x=d.data()||{};x.id=d.id;return x});lbRender();if(window.apRender)apRender();
    },function(){LB.db=null;lbRender()});
    // Retour d'une connexion Google par redirection : celle du jeu (joueur) ou celle de l'administration
    auth.getRedirectResult().then(function(r){
      var f=null;try{f=sessionStorage.getItem("connexion");sessionStorage.removeItem("connexion")}catch(e){}
      if(!r||!r.user||r.user.isAnonymous)return;
      if(f==="jeu"){profilJoueur();return}
      adminEnter(r.user);
    }).catch(function(e){
      var f=null;try{f=sessionStorage.getItem("connexion");sessionStorage.removeItem("connexion")}catch(x){}
      if(f==="jeu"){if(e&&e.credential)auth.signInWithCredential(e.credential).catch(function(){});return}
      adminFail("Connexion impossible. Réessaie.");
    });
    auth.onAuthStateChanged(function(u){
      if(!u){LB.uid=null;window.ADMIN_OK=false;auth.signInAnonymously().catch(function(){});return}
      LB.uid=u.uid;window.ADMIN_OK=!u.isAnonymous;lbRender();profilJoueur();if(window.paintUser)paintUser();
      if(!u.isAnonymous&&u.email===ADMIN_EMAIL&&window.adminMode){adminMode(true);if(location.hash==="#admin")loadAdmin().then(function(){apOpen()})}
    });
  }catch(e){LB.db=null}
})();


// Onglets Vidéos / Jeux
function tab(s){
  ["videos","jeux"].forEach(function(n){
    document.getElementById(n).hidden=(n!==s);
  });
  Array.prototype.forEach.call(document.querySelectorAll(".tab"),function(b){if(b.dataset.s===s)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  if(s==="videos"&&window.dInit)setTimeout(dInit,0);
  if(s==="jeux")loadMaire();
  if(window.musique)musique();
}
Array.prototype.forEach.call(document.querySelectorAll(".tab"),function(b){b.onclick=function(){tab(b.dataset.s);enHaut()}});

// Connexion (pseudo, gardé sur cet appareil)
window.user="";
try{window.user=localStorage.getItem("user")||""}catch(e){}
// Fenêtre « Connexion » du menu principal : la même connexion Google que dans le jeu, plus le pseudo
function paintUser(){
  var u=window.user,g=window.compteGoogle?compteGoogle():null;
  $("loginBtn").textContent=g||u?"👤 "+nomJoueur():"👤 Connexion";
  $("lbGoogle").hidden=!!g;$("logout").hidden=!g;$("loggedBox").hidden=!g;
  $("welcome").textContent=g?"✅ Connecté avec Google"+(g.nom?" · "+g.nom:""):"";
  $("lbTitre").textContent=g?"Ton compte":"Connexion";$("lbTxt").hidden=!!g;
  $("pseudo").value=u||"";
  $("lbNom").textContent="Tu joues sous le nom « "+nomJoueur()+" »"+(u?".":" (choisis un pseudo pour le changer).");
  var hello=document.querySelector(".hello");if(hello)hello.textContent=u?"Salut "+u+", que veux-tu découvrir ?":"Que veux-tu découvrir ?";
}
window.paintUser=paintUser;
function fermerLogin(){$("loginBox").hidden=true;document.body.classList.remove("lb-ouvert")}
$("loginBtn").onclick=function(){paintUser();$("lbEtat").textContent="";$("loginBox").hidden=false;document.body.classList.add("lb-ouvert")};
$("loginClose").onclick=fermerLogin;
$("loginBox").onclick=function(e){if(e.target===$("loginBox"))fermerLogin()};
$("lbGoogle").onclick=function(){
  var b=$("lbGoogle");b.disabled=true;$("lbEtat").textContent="Connexion…";
  window.connexionGoogle().then(function(){try{localStorage.setItem("maire_invite","1")}catch(x){}$("lbEtat").textContent="✅ Connecté !";setTimeout(paintUser,600)})
    .catch(function(e){$("lbEtat").textContent=e&&e.code==="auth/popup-closed-by-user"?"Connexion annulée.":"Connexion impossible pour l’instant."}).then(function(){b.disabled=false});
};
$("loginForm").onsubmit=function(e){
  e.preventDefault();var v=$("pseudo").value.trim().slice(0,20);
  window.user=v;try{if(v)localStorage.setItem("user",v);else localStorage.removeItem("user")}catch(x){}
  garderPseudo();paintUser();$("lbEtat").textContent=v?"✅ Pseudo enregistré.":"Pseudo retiré : tu joues sous ton numéro de maire.";
};
$("logout").onclick=function(){
  if(!LB.auth)return;
  // On repart en invité : nouveau numéro de maire, pseudo effacé de cet appareil
  window.user="";window.MAIRE_NUM=null;try{localStorage.removeItem("user");localStorage.removeItem("maire_numero")}catch(x){}
  LB.auth.signOut().then(function(){$("lbEtat").textContent="Déconnecté : tu joues maintenant en invité.";setTimeout(paintUser,800)});
};
paintUser();

// Mode maintenance : les joueurs voient un message, l'admin peut toujours tester
function applyMaint(){
  var M=window.MAINT||{},adm=!!window.ADMIN_UNLOCKED;
  [["g-maire","maire","maireStop"]].forEach(function(g){
    var on=!!M[g[1]],box=$(g[0]);if(!box)return;
    box.classList.toggle("maint",on&&!adm);box.classList.toggle("maint-adm",on&&adm);
    var tl=document.querySelector('.gtile[data-g="'+g[0]+'"]');if(tl)tl.classList.toggle("off",on&&!adm);
    if(on&&!adm&&window[g[2]])window[g[2]]();
  });
}

// Chargement à la demande : le code de l'admin et les données de départ ne sont téléchargés que si besoin
var LOADED={};
function loadScript(src){
  return LOADED[src]||(LOADED[src]=new Promise(function(ok,ko){var s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=function(){delete LOADED[src];ko()};document.head.appendChild(s)}));
}
// Maire de Paris : moteur, interface et style chargés seulement quand on ouvre le jeu
// Réglages du jeu modifiés dans l'administration (config/maire) : appliqués au chargement, puis en direct
function reglagesMaire(){
  if(!LB.db||!window.MaireReglages)return;
  var pret=false;
  return new Promise(function(ok){
    setTimeout(ok,2500);   // hors ligne ou lent : on joue avec les valeurs par défaut
    LB.db.doc("config/maire").onSnapshot(function(d){MaireReglages.appliquer(d.exists?d.data():{});if(!pret){pret=true;ok()}},function(){ok()});
  });
}
function loadMaire(){
  if(!LOADED.mcss){LOADED.mcss=1;var l=document.createElement("link");l.rel="stylesheet";l.href="maire/maire.css";document.head.appendChild(l)}
  return loadScript("maire/reglages.js").then(reglagesMaire).then(function(){return loadScript("maire/contenu.js")}).then(function(){return loadScript("maire/poker.js")}).then(function(){return loadScript("maire/session.js")}).then(function(){return loadScript("maire/moteur.js")}).then(function(){return loadScript("maire/progression.js")}).then(function(){return loadScript("maire/jeu.js")}).then(function(){maireInit()})
    .catch(function(){$("m-app").textContent="Le jeu n’a pas pu se charger. Vérifie ta connexion."});
}
function loadAdmin(){
  if(!LOADED.css){LOADED.css=1;var l=document.createElement("link");l.rel="stylesheet";l.href="css/admin.css";document.head.appendChild(l)}
  if(!LOADED.amcss){LOADED.amcss=1;var m=document.createElement("link");m.rel="stylesheet";m.href="css/admin-maire.css";document.head.appendChild(m)}
  return loadScript("js/donnees.js").then(function(){return loadScript("maire/reglages.js")}).then(function(){return loadScript("maire/contenu.js")}).then(function(){return loadScript("js/admin-maire.js")}).then(function(){return loadScript("js/admin.js")});
}

// Connexion administrateur (Google, discrète, en bas du site)
$("adminLink").onclick=function(){var f=$("adminLogin");f.hidden=!f.hidden};
function adminFail(x){$("adminLogin").hidden=false;$("adm-msg").textContent=x}
function adminMode(on){window.ADMIN_UNLOCKED=on;$("adminBadge").hidden=!on;$("adminLogout").hidden=!on;document.body.classList.toggle("admin",on);applyMaint();if(!on){if(window.apClose)apClose()}else loadAdmin().then(function(){apSeed()})}
$("adminBadge").onclick=function(){loadAdmin().then(function(){apOpen()})};
function adminEnter(u){
  if(u.email!==ADMIN_EMAIL){adminFail("Ce compte Google n’a pas les droits d’administration.");LB.auth.signOut();return}
  adminMode(true);$("adm-msg").textContent="";$("adminLogin").hidden=true;loadAdmin().then(function(){apOpen()});
}
$("adminLogin").onsubmit=function(e){
  e.preventDefault();
  if(!LB.auth){adminFail("Connexion impossible ici.");return}
  $("adm-msg").textContent="Connexion…";
  try{sessionStorage.setItem("connexion","admin")}catch(x){}
  LB.auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider()).catch(function(){adminFail("Connexion impossible. Réessaie.")});
};
$("adminLogout").onclick=function(){adminMode(false);if(LB.auth)LB.auth.signOut();window.scrollTo(0,0)};

// Sessions du Maire de Paris : 21 places partagées en ligne (sessions/{id}, état gardé en texte JSON).
// Sans connexion à la base, une session locale (bots seulement) permet quand même de jouer.
window.SessionLigne=(function(){
  var LOCAL="maire_session_locale";
  function S(){return window.MaireSession}
  function enLigne(){return !!(LB.db&&LB.uid)}
  function moi(){return LB.uid||"local"}
  function nom(){return nomJoueur()}
  function lire(d){var x=d.data()||{};try{return JSON.parse(x.etat)}catch(e){return null}}
  function champs(s){return {etat:JSON.stringify(s),ouverte:!S().pleine(s),joueurs:S().joueurs(s).map(function(x){return x.uid}),maj:Date.now()}}
  // ---- Session locale ----
  var ecouteurs=[];
  function lireLocal(){try{return JSON.parse(localStorage.getItem(LOCAL)||"null")}catch(e){return null}}
  function ecrireLocal(s){try{localStorage.setItem(LOCAL,JSON.stringify(s))}catch(e){}ecouteurs.forEach(function(f){setTimeout(function(){f(s)},0)})}
  // ---- Rejoindre ----
  // Ordre : la session voulue (choisie dans la liste) ou la sienne, puis « Victor Hugo » (la session de base, toujours là),
  // puis les autres sessions actives, sinon une nouvelle session au nom d'un auteur. Jamais à moins de 3 min d'une élection.
  function rejoindre(voulue){
    var ico="🙂";
    if(!enLigne()){
      var t=Date.now(),s=lireLocal();if(s)s=S().nettoyer(s,t);
      // Moins de 3 min avant l'élection (ou plus de session) : une nouvelle session commence
      if(!s||S().placeDe(s,"local")<0&&!S().peutEntrer(s,t)){s=S().nouvelleSession(Math.floor(Math.random()*2147483647),t);s.nom=S().AUTEURS[0]}
      s=S().rejoindre(s,"local",nom(),ico,t);ecrireLocal(s);return Promise.resolve({id:"local",place:S().placeDe(s,"local"),local:true});
    }
    var db=LB.db,uid=moi(),dejaId=null;try{dejaId=localStorage.getItem("maire_session")}catch(e){}
    function entrer(ref){
      return db.runTransaction(function(tx){return tx.get(ref).then(function(d){
        var s=d.exists?lire(d):null;
        if(!s&&ref.id===S().BASE_ID){s=S().nouvelleSession(Math.floor(Math.random()*2147483647),Date.now());s.nom=S().AUTEURS[0]}
        if(!s)return null;
        s=S().nettoyer(s,Date.now());
        // Session vide (Victor Hugo au repos) : elle repart de zéro, avec un mandat complet devant elle
        if(!S().joueurs(s).length){var nm=s.nom;s=S().nouvelleSession(Math.floor(Math.random()*2147483647),Date.now());s.nom=nm}
        if(S().placeDe(s,uid)<0){var n=S().rejoindre(s,uid,nom(),ico,Date.now());if(n===s)return null;s=n}
        tx.set(ref,champs(s));return {id:ref.id,place:S().placeDe(s,uid)};
      })}).catch(function(){return null});
    }
    function chercher(){
      return liste().then(function(l){
        var autres=l.filter(function(x){return x.id!==S().BASE_ID&&x.joueurs>0&&x.ouvre&&!x.pleine}).sort(function(a,b){return b.joueurs-a.joueurs});
        var ids=[S().BASE_ID].concat(autres.map(function(x){return x.id}));
        function essai(k){if(k>=ids.length)return creer(l);return entrer(db.collection("sessions").doc(ids[k])).then(function(r){return r||essai(k+1)})}
        return essai(0);
      });
    }
    function creer(l){
      var ref=db.collection("sessions").doc(),s=S().nouvelleSession(Math.floor(Math.random()*2147483647),Date.now());
      s.nom=S().nomLibre((l||[]).map(function(x){return x.nom}));
      s=S().rejoindre(s,uid,nom(),ico,Date.now());
      return ref.set(champs(s)).then(function(){return {id:ref.id,place:S().placeDe(s,uid)}});
    }
    var p=voulue?entrer(db.collection("sessions").doc(voulue)):dejaId?entrer(db.collection("sessions").doc(dejaId)).then(function(r){return r||chercher()}):chercher();
    return p.then(function(r){if(r)try{localStorage.setItem("maire_session",r.id)}catch(e){}return r}).catch(function(){return null});
  }
  // Les sessions en cours : nom, joueurs présents, niveau moyen ; une session vide disparaît (sauf Victor Hugo)
  function liste(){
    if(!enLigne())return Promise.resolve(null);
    var db=LB.db,t=Date.now();
    return Promise.all([db.collection("sessions").where("maj",">",t-60*60*1000).get(),db.collection("sessions").doc(S().BASE_ID).get()]).then(function(r){
      var vus={},l=[];
      r[0].docs.concat(r[1].exists?[r[1]]:[]).forEach(function(d){
        if(vus[d.id])return;vus[d.id]=1;var s=lire(d);if(!s)return;
        var x=S().resume(s,t);x.id=d.id;if(x.joueurs>0||d.id===S().BASE_ID)l.push(x);
      });
      if(!vus[S().BASE_ID])l.push({id:S().BASE_ID,nom:S().AUTEURS[0],joueurs:0,bots:S().NB,uids:[],niv:0,pleine:false,ouvre:true,prochaine:0});
      return l.sort(function(a,b){return (b.id===S().BASE_ID)-(a.id===S().BASE_ID)||b.joueurs-a.joueurs});
    }).catch(function(){return null});
  }
  function ecouter(id,cb){
    if(id==="local"){ecouteurs.push(cb);var s=lireLocal();if(s)setTimeout(function(){cb(s)},0);return function(){var i=ecouteurs.indexOf(cb);if(i>=0)ecouteurs.splice(i,1)}}
    if(!enLigne())return function(){};
    return LB.db.collection("sessions").doc(id).onSnapshot(function(d){if(d.exists){var s=lire(d);if(s)cb(s)}},function(){});
  }
  // Modifie la session avec une fonction pure (signaler, voter, attaquer, élire…)
  function modifier(id,f){
    if(id==="local"){var s=lireLocal();if(!s)return Promise.resolve(null);var n=f(s);if(n!==s)ecrireLocal(n);return Promise.resolve(n)}
    if(!enLigne())return Promise.resolve(null);
    var ref=LB.db.collection("sessions").doc(id);
    return LB.db.runTransaction(function(tx){return tx.get(ref).then(function(d){var s=d.exists?lire(d):null;if(!s)return null;var n=f(s);
      // Plus aucun joueur : la session disparaît (la session de base Victor Hugo reste)
      if(n!==s){if(!S().joueurs(n).length&&id!==S().BASE_ID)tx.delete(ref);else tx.set(ref,champs(n))}return n})}).catch(function(){return null});
  }
  return {rejoindre:rejoindre,liste:liste,ecouter:ecouter,modifier:modifier,moi:moi,
    quitter:function(id){return modifier(id,function(s){return S().quitter(s,moi())})},
    signaler:function(id,stats){return modifier(id,function(s){return S().ripostes(S().signaler(s,moi(),stats,Date.now()),moi(),Date.now(),Math.random())})},
    voter:function(id){return modifier(id,function(s){return S().voter(s,moi())})},
    attaquer:function(id,cible,type){return modifier(id,function(s){return S().attaquer(s,moi(),cible,type,Date.now(),Math.random())})},
    proteger:function(id){return modifier(id,function(s){return S().proteger(s,moi(),Date.now())})},
    encherir:function(id,cat,k,m){return modifier(id,function(s){return S().encherir(s,moi(),cat,k,m,Date.now())})},
    elire:function(id){return modifier(id,function(s){return S().elire(S().nettoyer(s,Date.now()),Date.now())})}};
})();

// Poker entre joueurs : un maire qui lance une partie de poker attend 5 secondes qu'un autre se présente, sinon il joue contre le bot.
// File d'attente : poker_attente/{uid} ; table : poker_tables/{id} (l'état de la table est gardé en texte JSON).
window.PokerLigne=(function(){
  function pret(){return LB.db&&LB.uid&&window.Poker}
  function nom(){return nomJoueur()}
  function lire(d){var x=d.data()||{};try{x.t=JSON.parse(x.etat)}catch(e){x.t=null}return x}
  // Cherche un adversaire pendant ms millisecondes ; renvoie {id, siege} ou null (=> bot)
  function chercher(ms){
    if(!pret())return Promise.resolve(null);
    var db=LB.db,moi=LB.uid,maintenant=Date.now();
    return db.collection("poker_attente").where("at",">",maintenant-20000).get().then(function(q){
      var cands=q.docs.filter(function(d){var x=d.data();return d.id!==moi&&!x.table});
      cands.sort(function(a,b){return a.data().at-b.data().at});
      // On rejoint le maire qui attend depuis le plus longtemps
      function essayer(k){
        if(k>=cands.length)return attendre();
        var ref=cands[k].ref,tref=db.collection("poker_tables").doc();
        return db.runTransaction(function(tx){
          return tx.get(ref).then(function(d){
            var x=d.exists?d.data():null;
            if(!x||x.table||x.at<Date.now()-20000)return null;
            var t=window.Poker.nouvelleTable(Math.floor(Math.random()*2147483647));
            tx.set(tref,{joueurs:[d.id,moi],noms:[x.nom||"Un maire",nom()],etat:JSON.stringify(t),maj:Date.now()});
            tx.update(ref,{table:tref.id});
            return {id:tref.id,siege:1};
          });
        }).then(function(r){return r||essayer(k+1)}).catch(function(){return essayer(k+1)});
      }
      return essayer(0);
    }).catch(function(){return null});
    // Personne : on s'inscrit et on attend qu'un autre maire nous rejoigne
    function attendre(){
      var ref=db.collection("poker_attente").doc(moi);
      return ref.set({at:Date.now(),nom:nom(),table:null}).then(function(){
        return new Promise(function(ok){
          var fini=false,stop=ref.onSnapshot(function(d){var x=d.data();if(!fini&&x&&x.table){fini=true;stop();ref.delete().catch(function(){});ok({id:x.table,siege:0})}},function(){});
          setTimeout(function(){
            if(fini)return;
            db.runTransaction(function(tx){return tx.get(ref).then(function(d){var x=d.exists?d.data():null;if(x&&x.table)return x.table;tx.delete(ref);return null})})
              .then(function(id){if(fini)return;fini=true;stop();if(id){ref.delete().catch(function(){});ok({id:id,siege:0})}else ok(null)})
              .catch(function(){if(!fini){fini=true;stop();ok(null)}});
          },ms);
        });
      }).catch(function(){return null});
    }
  }
  function ecouter(id,cb){if(!pret())return function(){};return LB.db.collection("poker_tables").doc(id).onSnapshot(function(d){if(d.exists)cb(lire(d))},function(){})}
  // Joue une action (ou « donner » la main suivante) ; « pourAutre » : l'adversaire ne joue plus depuis 30 s, il se couche d'office
  function agir(id,siege,action,montant,pourAutre){
    if(!pret())return Promise.resolve();
    var ref=LB.db.collection("poker_tables").doc(id);
    return LB.db.runTransaction(function(tx){
      return tx.get(ref).then(function(d){
        if(!d.exists)return;var x=lire(d),t=x.t,n;if(!t)return;
        if(action==="donner")n=window.Poker.donner(t);
        else if(pourAutre){if(Date.now()-x.maj<30000)return;n=window.Poker.agir(t,1-siege,"coucher")}
        else n=window.Poker.agir(t,siege,action,montant);
        if(n!==t)tx.update(ref,{etat:JSON.stringify(n),maj:Date.now()});
      });
    }).catch(function(){});
  }
  return {chercher:chercher,ecouter:ecouter,agir:agir};
})();

// Accueil : Paris sous la neige ; de temps en temps, une « interférence » montre 3 s la tour Eiffel illuminée
// Chaque image de l'accueil a son son : La Bohème sur Paris sous la neige, la neige sur la tour illuminée.
// Un son se met en pause dès que son image n'est plus à l'écran (ou qu'on quitte l'accueil) et reprend là où il s'était arrêté.
var musique=(function(){
  function piste(src,vol){var a=new Audio(src);a.loop=true;a.preload="none";return{a:a,vol:vol,fondu:null}}
  var P={base:piste("audio/accueil-musique.mp3",.7),allumee:piste("audio/accueil-neige.mp3",.8),jeu:piste("audio/maire-menu.mp3",.35),casino:piste("audio/casino.mp3",.45)};
  var f=document.getElementById("homeFond"),bt=document.getElementById("hson"),muet=false;
  try{muet=localStorage.getItem("musique_off")==="1"}catch(e){}
  function quelle(){
    var home=document.getElementById("home"),jeux=document.getElementById("jeux");
    if(muet||document.hidden)return "";
    // Menu du jeu Maire de Paris (pas pendant la partie)
    if(home.hidden){
      if(document.getElementById("site").hidden||jeux.hidden)return "";
      // Une partie de casino (blackjack, roulette) passe avant tout le reste
      if(document.body.classList.contains("m-casino"))return "casino";
      return document.body.classList.contains("m-son")?"jeu":"";
    }
    if(document.body.classList.contains("eteint"))return "";
    return f&&f.classList.contains("interf")?"allumee":"base";
  }
  // Petit fondu ; sur iPhone le volume ne se règle pas, d'où la limite de temps qui coupe quand même
  function fondu(p,v,fin){
    clearInterval(p.fondu);var t=0;
    p.fondu=setInterval(function(){
      t+=25;var d=v-p.a.volume;
      if(Math.abs(d)<.06||t>=300){clearInterval(p.fondu);try{p.a.volume=v}catch(e){}if(fin)fin()}
      else try{p.a.volume=Math.max(0,Math.min(1,p.a.volume+(d>0?.06:-.06)))}catch(e){}
    },25);
  }
  function maj(){
    var q=quelle();
    Object.keys(P).forEach(function(k){
      var p=P[k];
      if(k===q){if(p.a.paused){try{p.a.volume=0}catch(e){}var r=p.a.play();if(r&&r.catch)r.catch(function(){})}fondu(p,p.vol)}
      else if(!p.a.paused){fondu(p,0,function(){if(quelle()!==k)p.a.pause()})}
    });
  }
  // Sur iPhone, chaque son doit avoir été lancé une fois pendant un toucher : on les « amorce » en silence
  maj.amorce=function(){var q=quelle();Object.keys(P).forEach(function(k){var a=P[k].a;if(k===q||!a.paused||a.amorce)return;a.amorce=1;a.muted=true;var r=a.play();if(r&&r.then)r.then(function(){if(quelle()!==k)a.pause();a.muted=false}).catch(function(){a.muted=false;a.amorce=0})})};
  function bouton(){bt.textContent=muet?"🔇":"🔊";bt.setAttribute("aria-pressed",muet?"true":"false");bt.setAttribute("aria-label",muet?"Remettre la musique":"Couper la musique")}
  bt.onclick=function(e){e.stopPropagation();muet=!muet;try{localStorage.setItem("musique_off",muet?"1":"0")}catch(x){}bouton();maj()};
  bouton();
  // Les navigateurs bloquent le son tant qu'on n'a pas touché la page : on réessaie à chaque geste
  // (sur téléphone, seul le doigt qu'on relève compte) jusqu'à ce que la lecture ait vraiment démarré
  var GESTES=["touchend","pointerup","click","keydown"],debloque=false;
  function geste(e){
    if(debloque||(e&&e.target&&e.target.closest&&e.target.closest("#jouer")))return;
    var q=quelle();if(!q)return;
    var a=P[q].a;try{a.volume=0}catch(e){}
    var r=a.play();
    if(r&&r.then)r.then(function(){debloque=true;GESTES.forEach(function(g){document.removeEventListener(g,geste,true)});maj();maj.amorce()}).catch(function(){});
    else{debloque=true;maj()}
  }
  GESTES.forEach(function(g){document.addEventListener(g,geste,true)});
  // On quitte la page (autre appli, écran verrouillé, onglet changé) : tout se coupe tout de suite, sans fondu
  // (sur téléphone, les minuteries du fondu sont gelées quand la page est cachée, le son continuait)
  function couperTout(){Object.keys(P).forEach(function(k){clearInterval(P[k].fondu);P[k].a.pause()});try{coupure.pause()}catch(e){}if(ctx&&ctx.state==="running")ctx.suspend().catch(function(){})}
  document.addEventListener("visibilitychange",function(){if(document.hidden)couperTout();else{if(ctx&&ctx.state==="suspended")ctx.resume().catch(function(){});maj()}});
  window.addEventListener("pagehide",couperTout);
  window.addEventListener("blur",function(){setTimeout(function(){if(document.hidden)couperTout()},300)});
  // Paris s'éteint : bruit du groupe électrogène qui s'arrête, toujours depuis le début
  var coupure=new Audio("audio/accueil-eteint.mp3");coupure.preload="auto";
  maj.coupure=function(){if(muet)return;try{coupure.currentTime=0}catch(e){}var r=coupure.play();if(r&&r.catch)r.catch(function(){})};
  // Clic sur chaque bouton (sauf « Jouer », qui a son propre son) : clic A pour les boutons principaux, clic B pour les secondaires.
  // Web Audio : sans délai et superposable.
  var AC=window.AudioContext||window.webkitAudioContext,ctx=null,clics={},clicCharge=false;
  var SECONDAIRE=".m-sec,.mx-lien,.m-leonx,.tab,.hdecouvre,.hson,#loginBtn,#back,.m-mise,.ghost,.m-bulle-passer,.m-bulle-ok,.mx-info,.mx-rayon,.mx-lock,[class*=ap-]";
  function chargerClic(){
    if(clicCharge||!AC)return;clicCharge=true;
    try{ctx=new AC()}catch(e){return}
    ["a","b"].forEach(function(k){
      fetch("audio/clic-"+k+".mp3").then(function(r){return r.arrayBuffer()}).then(function(b){
        return new Promise(function(ok,ko){var p=ctx.decodeAudioData(b,ok,ko);if(p&&p.then)p.then(ok,ko)});
      }).then(function(x){clics[k]=x}).catch(function(){});
    });
  }
  // Effets sonores du jeu : window.sfx("carte") joue audio/sfx-carte.mp3 (chargé à la première demande, puis instantané)
  var SFX={},SFXc={};
  function jouerBuf(buf,vol){if(!ctx||!buf||muet)return;if(ctx.state==="suspended")ctx.resume();var s=ctx.createBufferSource(),g=ctx.createGain();g.gain.value=vol==null?.8:vol;s.buffer=buf;s.connect(g);g.connect(ctx.destination);s.start(0)}
  function chargerSfx(nom,puis){
    if(SFX[nom]||SFXc[nom]||!ctx)return;SFXc[nom]=1;
    fetch("audio/sfx-"+nom+".mp3").then(function(r){return r.arrayBuffer()}).then(function(b){
      return new Promise(function(ok,ko){var p=ctx.decodeAudioData(b,ok,ko);if(p&&p.then)p.then(ok,ko)});
    }).then(function(x){SFX[nom]=x;if(puis)puis(x)}).catch(function(){SFXc[nom]=0});
  }
  window.sfx=function(nom,vol){chargerClic();if(SFX[nom])jouerBuf(SFX[nom],vol);else chargerSfx(nom,function(x){jouerBuf(x,vol)})};
  // Préchargés pour être prêts au bon moment
  setTimeout(function(){chargerClic();["carte","retourne","roulette","bille","gagne","perdu","jetons","achat","chantier","dossier","telephone","tampon","epee","bouclier","attaque"].forEach(function(n){chargerSfx(n)})},1500);
  function clic(e){
    var b=e.target&&e.target.closest&&e.target.closest("button,.btn,[role=button]");
    if(!b||muet||b.disabled||b.id==="jouer"||b.classList.contains("entree"))return;
    var buf=clics[b.matches(SECONDAIRE)?"b":"a"];
    chargerClic();if(!ctx||!buf)return;
    if(ctx.state==="suspended")ctx.resume();
    jouerBuf(buf,.6);
  }
  document.addEventListener("click",clic,true);
  chargerClic();
  // Aucun navigateur n'accepte de jouer du son avant que la personne ait touché la page.
  // Si la musique est bloquée à l'arrivée, un écran « Touche pour entrer » fournit ce premier toucher.
  function entree(){
    if(document.querySelector(".entree"))return;
    var d=document.createElement("button");d.type="button";d.className="entree";
    var souris=window.matchMedia&&matchMedia("(hover: hover) and (pointer: fine)").matches;
    d.innerHTML='<img src="img/logo.webp" alt="" width="200" height="200"><span>'+(souris?"Clique pour entrer":"Touche l’écran pour entrer")+'</span>';
    d.onclick=function(){geste();d.classList.add("entree-fin");setTimeout(function(){d.remove()},450)};
    document.body.appendChild(d);
  }
  (function(){
    var q=quelle();if(!q)return;
    var a=P[q].a;try{a.volume=0}catch(e){}
    var r=a.play();
    if(r&&r.then)r.then(function(){debloque=true;GESTES.forEach(function(g){document.removeEventListener(g,geste,true)});maj()}).catch(function(e){if(e&&e.name==="NotAllowedError")entree()});
    else{debloque=true;maj()}
  })();
  return maj;
})();
(function(){
  var f=document.getElementById("homeFond");if(!f)return;
  if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  function prochaine(){setTimeout(interf,9000+Math.random()*14000)}
  function interf(){
    var home=document.getElementById("home");
    if(home.hidden||document.hidden||document.body.classList.contains("eteint"))return prochaine();
    f.classList.add("interf");musique();setTimeout(function(){f.classList.remove("interf");musique();prochaine()},3400);
  }
  prochaine();
})();
// L'accueil et le site sont deux écrans séparés : on passe de l'un à l'autre sans défiler
function enHaut(){var h=document.documentElement;h.style.scrollBehavior="auto";window.scrollTo(0,0);h.style.scrollBehavior=""}
function ecran(s){
  var home=document.getElementById("home"),st=document.getElementById("site");
  home.hidden=!!s;st.hidden=!s;
  if(s)tab(s);
  document.body.classList.remove("eteint");
  // Retour à l'accueil : on recrée la neige animée (sur iPhone un GIF caché peut rester figé ou vide)
  if(!s){var fl=document.querySelector(".hb-flocons");if(fl){var n=document.createElement("i");n.className="hb-flocons";fl.parentNode.replaceChild(n,fl)}}
  musique();
  enHaut();
}
// Adresses : #jouer et #decouvre (pas les id des sections, sinon le navigateur défile tout seul jusqu'à elles)
var ADR={jeux:"#jouer",videos:"#decouvre"};
function depuisAdr(h){return h==="#jouer"||h==="#jeux"?"jeux":h==="#decouvre"||h==="#videos"?"videos":""}
function goTo(s){ecran(s);if(location.hash!==ADR[s]){history.pushState(null,"",ADR[s]);window._dejaPousse=1}}
function menuPrincipal(){if(window._dejaPousse&&location.hash)history.back();else{ecran("");history.replaceState(null,"",location.pathname+location.search)}}
window.addEventListener("popstate",function(){var s=depuisAdr(location.hash);ecran(s);if(s&&location.hash!==ADR[s]){history.replaceState(null,"",ADR[s]);setTimeout(enHaut,30)}});
document.querySelector(".hdecouvre").onclick=function(){goTo("videos")};
// « Jouer » : l'écran se dérègle façon bug informatique, puis le jeu le remplace
document.getElementById("jouer").onclick=function(){
  if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)return goTo("jeux");
  // Paris s'éteint 0,8 seconde (plus aucun bouton), puis l'écran bugge et le jeu apparaît
  if(document.body.classList.contains("eteint"))return;
  document.body.classList.add("eteint");musique.amorce();musique();musique.coupure();
  setTimeout(function(){
    var g=document.createElement("div");g.className="glitch";g.setAttribute("aria-hidden","true");
    for(var i=0,b="";i<9;i++)b+='<i class="gl-b" style="top:'+Math.round(Math.random()*95)+'%;height:'+(2+Math.round(Math.random()*9))+'%;--d:'+(Math.random()<.5?"-":"")+(4+Math.round(Math.random()*14))+'%"></i>';
    g.innerHTML=b;
    document.body.appendChild(g);document.body.classList.add("glitching");
    setTimeout(function(){goTo("jeux")},230);
    setTimeout(function(){g.classList.add("gl-fin")},440);
    setTimeout(function(){g.remove();document.body.classList.remove("glitching")},600);
  },800);
};
document.getElementById("back").onclick=menuPrincipal;
if("scrollRestoration" in history)history.scrollRestoration="manual";
(function(){var s=depuisAdr(location.hash);if(s){ecran(s);history.replaceState(null,"",ADR[s])}else enHaut()})();
window.addEventListener("pageshow",function(e){if(e.persisted)enHaut()});
