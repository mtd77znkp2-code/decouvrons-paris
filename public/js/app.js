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
function lbBoard(id,key,title){LB.boards[id]={k:key,t:title};lbDraw(id)}
function lbRender(){for(var id in LB.boards)lbDraw(id)}
function lbDraw(id){
  var b=LB.boards[id],box=$(id);if(!b||!box)return;
  box.innerHTML="";box.appendChild(el("h4","",b.t()));
  if(!LB.db){box.appendChild(el("p","lbn","Le classement général n’est pas disponible pour le moment."));return}
  var key=b.k(),rows=LB.docs.filter(function(d){return d.s&&d.s[key]>0}).sort(function(x,y){return y.s[key]-x.s[key]}).slice(0,10);
  if(!rows.length){box.appendChild(el("p","lbn","Aucun score pour l’instant. Sois le premier !"));return}
  var t=el("ol","lbl");
  rows.forEach(function(d){var li=el("li",d.id===LB.uid?"me":"");li.appendChild(el("span","nm",d.name||"Anonyme"));li.appendChild(el("span","sc",String(d.s[key])));t.appendChild(li)});
  box.appendChild(t);
}
function lbSubmit(key,score){
  if(!window.user)return Promise.resolve("Connecte-toi depuis l’accueil pour apparaître au classement général.");
  if(!LB.db||!LB.uid)return Promise.resolve("Le classement général n’est pas disponible ici.");
  var ref=LB.db.doc("scores/"+LB.uid);
  return ref.get().then(function(s){
    var d=s.exists?s.data():{},m=Object.assign({},d.s||{});
    if(!(score>(m[key]||0)))return "Ton meilleur score reste inchangé au classement.";
    m[key]=score;
    return ref.set({name:window.user,s:m,at:Date.now()}).then(function(){return "Ton score est dans le classement général !"});
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
    auth.getRedirectResult().then(function(r){if(r&&r.user&&!r.user.isAnonymous)adminEnter(r.user)}).catch(function(){adminFail("Connexion impossible. Réessaie.")});
    auth.onAuthStateChanged(function(u){
      if(!u){LB.uid=null;window.ADMIN_OK=false;auth.signInAnonymously().catch(function(){});return}
      LB.uid=u.uid;window.ADMIN_OK=!u.isAnonymous;lbRender();
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
}
Array.prototype.forEach.call(document.querySelectorAll(".tab"),function(b){b.onclick=function(){tab(b.dataset.s);enHaut()}});

// Connexion (pseudo, gardé sur cet appareil)
window.user="";
try{window.user=localStorage.getItem("user")||""}catch(e){}
function paintUser(){
  var u=window.user,btn=document.getElementById("loginBtn");
  btn.textContent=u?"👤 "+u:"👤 Connexion";
  document.getElementById("loginForm").hidden=!!u;
  document.getElementById("loggedBox").hidden=!u;
  document.getElementById("welcome").textContent=u?"Salut "+u+" !":"";
  document.querySelector(".hello").textContent=u?"Salut "+u+", que veux-tu découvrir ?":"Que veux-tu découvrir ?";
}
document.getElementById("loginBtn").onclick=function(){var b=document.getElementById("loginBox");b.hidden=!b.hidden;if(!b.hidden&&!window.user)document.getElementById("pseudo").focus()};
document.getElementById("loginForm").onsubmit=function(e){
  e.preventDefault();var v=document.getElementById("pseudo").value.trim();if(!v)return;
  window.user=v;try{localStorage.setItem("user",v)}catch(x){}
  document.getElementById("loginBox").hidden=true;paintUser();
};
document.getElementById("logout").onclick=function(){
  window.user="";try{localStorage.removeItem("user")}catch(x){}
  document.getElementById("pseudo").value="";document.getElementById("loginBox").hidden=true;paintUser();
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
function loadMaire(){
  if(!LOADED.mcss){LOADED.mcss=1;var l=document.createElement("link");l.rel="stylesheet";l.href="maire/maire.css";document.head.appendChild(l)}
  return loadScript("maire/contenu.js").then(function(){return loadScript("maire/moteur.js")}).then(function(){return loadScript("maire/progression.js")}).then(function(){return loadScript("maire/jeu.js")}).then(function(){maireInit()})
    .catch(function(){$("m-app").textContent="Le jeu n’a pas pu se charger. Vérifie ta connexion."});
}
function loadAdmin(){
  if(!LOADED.css){LOADED.css=1;var l=document.createElement("link");l.rel="stylesheet";l.href="css/admin.css";document.head.appendChild(l)}
  return loadScript("js/donnees.js").then(function(){return loadScript("js/admin.js")});
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
  LB.auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider()).catch(function(){adminFail("Connexion impossible. Réessaie.")});
};
$("adminLogout").onclick=function(){adminMode(false);if(LB.auth)LB.auth.signOut();window.scrollTo(0,0)};

// Accueil : la vidéo de fond, verticale sur téléphone, horizontale sur ordinateur (image fixe si l'on préfère moins d'animations)
(function(){
  var v=document.getElementById("homeVideo");if(!v)return;
  var calme=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  function format(){return window.innerHeight>window.innerWidth?"portrait":"paysage"}
  var cur="";
  function charge(){
    var f=format();if(f===cur)return;cur=f;
    v.poster="img/accueil-"+f+".webp";
    if(calme){v.removeAttribute("src");return}
    v.src="img/accueil-"+f+".mp4";var p=v.play();if(p&&p.catch)p.catch(function(){});
  }
  charge();
  window.addEventListener("resize",function(){clearTimeout(charge.t);charge.t=setTimeout(charge,300)});
  // La vidéo s'arrête quand on ne voit plus l'accueil (batterie et données)
  if("IntersectionObserver" in window)new IntersectionObserver(function(e){if(calme)return;if(e[0].isIntersecting){var p=v.play();if(p&&p.catch)p.catch(function(){})}else v.pause()}).observe(document.getElementById("home"));
})();
// L'accueil et le site sont deux écrans séparés : on passe de l'un à l'autre sans défiler
function enHaut(){var h=document.documentElement;h.style.scrollBehavior="auto";window.scrollTo(0,0);h.style.scrollBehavior=""}
function ecran(s){
  var home=document.getElementById("home"),st=document.getElementById("site");
  home.hidden=!!s;st.hidden=!s;
  if(s)tab(s);
  var v=document.getElementById("homeVideo");if(v&&s)v.pause();else if(v&&!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)){var p=v.play();if(p&&p.catch)p.catch(function(){})}
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
  var g=document.createElement("div");g.className="glitch";g.setAttribute("aria-hidden","true");
  for(var i=0,b="";i<9;i++)b+='<i class="gl-b" style="top:'+Math.round(Math.random()*95)+'%;height:'+(2+Math.round(Math.random()*9))+'%;--d:'+(Math.random()<.5?"-":"")+(4+Math.round(Math.random()*14))+'%"></i>';
  g.innerHTML=b;
  document.body.appendChild(g);document.body.classList.add("glitching");
  setTimeout(function(){goTo("jeux")},230);
  setTimeout(function(){g.classList.add("gl-fin")},440);
  setTimeout(function(){g.remove();document.body.classList.remove("glitching")},600);
};
document.getElementById("back").onclick=menuPrincipal;
if("scrollRestoration" in history)history.scrollRestoration="manual";
(function(){var s=depuisAdr(location.hash);if(s){ecran(s);history.replaceState(null,"",ADR[s])}else enHaut()})();
window.addEventListener("pageshow",function(e){if(e.persisted)enHaut()});
