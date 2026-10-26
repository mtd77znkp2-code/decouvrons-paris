// Administration : page à part, un tableau par jeu avec recherche, filtres et tri
(function(){
  var LVN={facile:"Facile",moyen:"Moyen",difficile:"Difficile"},LVO={facile:0,moyen:1,difficile:2};
  var st={t:"quiz",q:"",lvl:"",vis:"",zone:"",ok:"",cat:"",sk:null,sd:1};
  function norm(s){return String(s==null?"":s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()}
  function eur(n){n=+n;return (n%1?n.toFixed(2).replace(".",","):String(n))+" €"}
  function day(ms){if(!ms)return "—";var d=new Date(ms);return d.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})+" "+d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
  function toast(x){var b=$("apToast");b.textContent=x;b.classList.add("on");clearTimeout(b.__t);b.__t=setTimeout(function(){b.classList.remove("on")},2400)}
  function lvCell(x){return el("span","ap-lv ap-"+x.level,LVN[x.level]||"—")}
  function thumb(x){if(!x.img)return el("span","ap-mut","—");var i=el("img","ap-th");i.alt="";i.loading="lazy";i.src=imgSrc(x.img);return i}
  function sw(x){
    var b=el("button","ap-sw"+(x.on===false?"":" on"));b.type="button";b.setAttribute("role","switch");
    b.setAttribute("aria-checked",String(x.on!==false));b.setAttribute("aria-label",x.on===false?"Afficher":"Masquer");
    b.onclick=function(){write(LB.db.doc(T[st.t].coll+"/"+x.id).update({on:x.on===false}),x.on===false?"Affiché dans le jeu.":"Masqué du jeu.")};
    return b;
  }
  var LVS={facile:"Facile",moyen:"Moyen",difficile:"Difficile"};
  function scName(k){
    if(k==="loc")return "Devine où c’est (ancienne version)";
    var p=k.split("_"),g={loc:"Devine où c’est",quiz:"Quiz",prix:"Devine le prix"}[p[0]]||p[0];
    return g+" "+(LVS[p[1]]||p[1]||"")+(p[2]==="b"?" + banlieue":"");
  }
  function scLabel(k){if(k==="loc")return "Ancienne version";var p=k.split("_");return (LVS[p[1]]||p[1])+(p[2]==="b"?" + banlieue":"")}
  function sc(g,h){
    var mine=function(x){return Object.keys(x.s||{}).filter(function(k){return (k===g||k.indexOf(g+"_")===0)&&x.s[k]>0}).sort(function(a,b){return (LVO[a.split("_")[1]]||0)-(LVO[b.split("_")[1]]||0)||(a.length-b.length)})};
    return {h:h,k:function(x){return mine(x).reduce(function(m,k){return Math.max(m,x.s[k])},0)},c:function(x){
      var ks=mine(x);if(!ks.length)return el("span","ap-mut","—");
      var u=el("ul","ap-scl");
      ks.forEach(function(k){
        var li=el("li");li.appendChild(el("small","",scLabel(k)));li.appendChild(el("b","",String(x.s[k])));
        var b=el("button","","×");b.type="button";b.title="Supprimer ce score";b.setAttribute("aria-label","Supprimer le score "+scName(k));b.onclick=function(){askScore(x,k)};
        var w=el("span","ap-scx");w.appendChild(b);li.appendChild(w);u.appendChild(li);
      });
      return u;
    }};
  }
  function askScore(x,k){
    var y=el("button","btn danger","Supprimer ce score");y.type="button";
    var p=el("p","ap-mut","Le score de "+x.s[k]+" points sera retiré du classement « "+scName(k)+" ». Les autres scores de ce joueur restent.");
    var err=dlg("Supprimer le score de « "+(x.name||"Anonyme")+" » ?",[p],[y]);
    y.onclick=function(){
      y.disabled=true;var m=Object.assign({},x.s);delete m[k];
      var ref=LB.db.doc("scores/"+x.id);
      write(Object.keys(m).length?ref.update({s:m}):ref.delete(),"Score supprimé.").then(function(){$("apDlg").close()}).catch(function(){y.disabled=false;err.textContent="La suppression a échoué."});
    };
  }
  function okSw(x){
    var on=x.ok===true,b=el("button","ap-sw"+(on?" on":""));b.type="button";b.setAttribute("role","switch");
    b.setAttribute("aria-checked",String(on));b.setAttribute("aria-label",on?"Retirer la validation":"Valider ce lieu");
    b.onclick=function(){
      if(!on&&!x.ph){toast("Ajoute d’abord une photo (bouton Modifier).");return}
      write(LB.db.doc("lieux/"+x.id).update({ok:!on}),on?"Lieu remis « à valider ».":"Lieu validé : il peut sortir dans le jeu.");
    };
    return b;
  }
  var T={
    quiz:{coll:"questions",one:"question",many:"questions",lv:true,vis:true,
      cols:[
        {h:"Niveau",k:function(x){return LVO[x.level]},c:lvCell},
        {h:"Question",k:function(x){return norm(x.q)},c:function(x){return el("span","ap-strong",x.q)}},
        {h:"Bonne réponse",k:function(x){return norm(x.a)},c:function(x){return el("span","ap-good",x.a)}},
        {h:"Mauvaises réponses",c:function(x){var u=el("ul","ap-wr");(x.o||[]).filter(function(o){return o!==x.a}).forEach(function(o){u.appendChild(el("li","",o))});return u}},
        {h:"Image",c:thumb},
        {h:"Visible",cls:"ap-vis",k:function(x){return x.on===false?0:1},c:sw}
      ],
      find:function(x){return [x.q,x.a].concat(x.o||[]).join(" ")},
      def:function(a,b){return (LVO[a.level]-LVO[b.level])||((a.n||0)-(b.n||0))}},
    prix:{coll:"prix",one:"objet",many:"objets",lv:true,vis:true,
      cols:[
        {h:"Niveau",k:function(x){return LVO[x.level]},c:lvCell},
        {h:"Objet ou service",k:function(x){return norm(x.t)},c:function(x){return el("span","ap-strong",x.t)}},
        {h:"Prix moyen",cls:"ap-sc",k:function(x){return +x.p||0},c:function(x){return el("span","ap-good",eur(x.p))}},
        {h:"Image",c:thumb},
        {h:"Visible",cls:"ap-vis",k:function(x){return x.on===false?0:1},c:sw}
      ],
      find:function(x){return x.t+" "+x.p},
      def:function(a,b){return (LVO[a.level]-LVO[b.level])||((a.n||0)-(b.n||0))}},
    lieux:{coll:"lieux",one:"lieu",many:"lieux",lv:true,vis:true,
      cols:[
        {h:"Niveau",k:function(x){return LVO[x.level]},c:lvCell},
        {h:"Zone",k:function(x){return x.zone||""},c:function(x){return el("span","ap-zone",x.zone==="banlieue"?"Banlieue":x.zone==="paris"?"Paris":"—")}},
        {h:"Lieu",k:function(x){return norm(x.n)},c:function(x){return el("span","ap-strong",x.n)}},
        {h:"Position",c:function(x){return isFinite(x.lat)&&isFinite(x.lng)?el("span","ap-mut",(+x.lat).toFixed(4)+", "+(+x.lng).toFixed(4)):el("span","ap-warn","À placer sur la carte")}},
        {h:"Photo",k:function(x){return x.ph?1:0},c:function(x){return x.ph?el("span","ap-ok","📷 Oui"):el("span","ap-warn","Manquante")}},
        {h:"Validé",cls:"ap-vis",k:function(x){return x.ok===true?1:0},c:okSw},
        {h:"Visible",cls:"ap-vis",k:function(x){return x.on===false?0:1},c:sw}
      ],
      find:function(x){return x.n},
      def:function(a,b){return ((a.zone==="banlieue")-(b.zone==="banlieue"))||(LVO[a.level]-LVO[b.level])||((a.o||0)-(b.o||0))}},
    spots:{coll:"spots",one:"lieu",many:"lieux",vis:true,dup:true,
      cols:[
        {h:"Vidéo",c:function(x){var v=window.spotVid&&spotVid(x);if(!v||!v.poster)return el("span","ap-mut","—");var i=el("img","ap-th");i.alt="";i.loading="lazy";i.src=v.poster;return i}},
        {h:"Lieu",k:function(x){return norm(x.nom)},c:function(x){var w=el("div");w.appendChild(el("b","",(x.emoji?x.emoji+" ":"")+(x.nom||"Sans nom")));w.appendChild(el("div","ap-mut",x.adresse||""));return w}},
        {h:"Catégorie",k:function(x){return x.categorie||""},c:function(x){return el("span","ap-zone",catName(x.categorie))}},
        {h:"Extrait",c:function(x){return el("span","ap-mut",x.debut!=null||x.fin!=null?mmss(x.debut||0)+" → "+(x.fin!=null?mmss(x.fin):"fin"):"Vidéo entière")}},
        {h:"État",c:function(x){var w=spotIssues(x);return w.length?el("span","ap-warn","⚠ "+w.join(", ")):el("span","ap-ok","✓ Prêt")}},
        {h:"Visible",cls:"ap-vis",k:function(x){return x.on===false?0:1},c:sw}
      ],
      find:function(x){return (x.nom||"")+" "+(x.adresse||"")+" "+(x.description||"")+" "+catName(x.categorie)},
      def:function(a,b){return (a.n||0)-(b.n||0)}},
    reels:{one:"vidéo",many:"vidéos",noAdd:true,noEdit:true,noDel:true,noNum:true,
      cols:[
        {h:"N°",k:function(x){return x.n},c:function(x){return el("b","",String(x.n))}},
        {h:"Miniature",c:function(x){if(!x.poster)return el("span","ap-mut","—");var i=el("img","ap-th");i.alt="";i.loading="lazy";i.src=x.poster;return i}},
        {h:"Publiée le",k:function(x){return x.ts||""},c:function(x){return el("span","ap-mut",x.ts?new Date(x.ts).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"}):"—")}},
        {h:"Légende",c:function(x){return el("span","",x.caption||"—")}},
        {h:"Lecture",c:function(x){return x.src?el("span","ap-ok",x.kind==="carrousel"?"Sur le site (carrousel)":"Sur le site"):el("span","ap-warn","Lecteur Instagram (musique protégée)")}},
        {h:"Sur la carte",c:function(x){return el("span",x.spots?"ap-ok":"ap-mut",x.spots||"—")}},
        {h:"Lien",c:function(x){if(!x.link)return el("span","ap-mut","—");var a=el("a","ap-mut","Ouvrir");a.href=x.link;a.target="_blank";a.rel="noopener";return a}}
      ],
      find:function(x){return x.n+" "+(x.caption||"")+" "+(x.spots||"")},
      def:function(a,b){return a.n-b.n}},
    videos:{coll:"videos",one:"vidéo",many:"vidéos",vis:true,
      cols:[
        {h:"Titre",k:function(x){return norm(x.t)},c:function(x){return el("span",x.t?"ap-strong":"ap-mut",x.t||"Sans titre")}},
        {h:"Lien",c:function(x){var a=el("a","ap-mut",x.u||x.vid);a.href=x.u||("https://www.tiktok.com/@decouvronsparis1/video/"+x.vid);a.target="_blank";a.rel="noopener";return a}},
        {h:"Visible",cls:"ap-vis",k:function(x){return x.on===false?0:1},c:sw}
      ],
      find:function(x){return (x.t||"")+" "+(x.u||"")},
      def:function(a,b){return (b.n||0)-(a.n||0)}},
    scores:{coll:"scores",one:"joueur",many:"joueurs",noAdd:true,noEdit:true,
      cols:[
        {h:"Joueur",k:function(x){return norm(x.name)},c:function(x){return el("span","ap-strong",x.name||"Anonyme")}},
        sc("loc","Devine où c’est"),sc("quiz","Quiz sur Paris"),sc("prix","Devine le prix"),
        {h:"Dernière partie",k:function(x){return x.at||0},c:function(x){return el("span","ap-mut",day(x.at))}}
      ],
      find:function(x){return x.name},
      def:function(a,b){return (b.at||0)-(a.at||0)}}
  };
  var SPOTS=null;fetch("spots.json",{cache:"no-store"}).then(function(r){return r.json()}).then(function(j){SPOTS=j}).catch(function(){});
  // Import manuel des lieux de spots.json (même contenu que l'import automatique)
  function importSpots(){
    if(!LB.db||!SPOTS)return Promise.reject(new Error("données pas encore chargées"));
    var b=LB.db.batch();function pad(i){return ("00"+i).slice(-3)}
    Object.keys(SPOTS.categories).forEach(function(k,i){var c=SPOTS.categories[k];b.set(LB.db.doc("spotcats/"+k),{nom:c.nom,emoji:c.emoji,n:i})});
    SPOTS.lieux.forEach(function(s,i){
      var v=window.spotVid&&window.IGV?spotVid(s):null;
      b.set(LB.db.doc("spots/spot_"+pad(i)),{nom:s.nom,emoji:s.emoji||null,categorie:s.categorie,adresse:s.adresse||"",description:s.description||"",lat:s.gps[0],lng:s.gps[1],mid:v?v.id:null,date:s.date||null,video:s.video||null,debut:s.debut==null?null:s.debut,fin:s.fin==null?null:s.fin,on:true,n:i});
    });
    b.set(LB.db.doc("config/seed"),{spots:true},{merge:true});
    return b.commit();
  }
  function allSpots(){return window.SPDB&&SPDB.length?SPDB:(SPOTS?SPOTS.lieux:[])}
  function reels(){
    if(!window.igOrdered)return [];
    return igOrdered().map(function(v,i){
      var n=i+1,sp=allSpots().filter(function(s){var x=window.spotVid&&spotVid(s);return x&&x.id===v.id}).map(function(s){return s.nom}).join(", ");
      return Object.assign({},v,{n:n,spots:sp});
    });
  }
  function rows(t){if(t==="reels")return reels();if(t==="spots")return window.SPDB||[];return (t==="quiz"?window.QDB:t==="prix"?window.PDB:t==="lieux"?window.LDB:t==="videos"?window.VDB:LB.docs)||[]}
  // ---------- Lieux de la carte « Découvre ! » ----------
  function cats(){return (window.SCDB||[]).slice().sort(function(a,b){return (a.n||0)-(b.n||0)})}
  function catName(id){var c=cats().filter(function(c){return c.id===id})[0];return c?c.emoji+" "+c.nom:"—"}
  function mmss(x){if(x==null||x==="")return "";x=+x;return Math.floor(x/60)+":"+("0"+Math.floor(x%60)).slice(-2)}
  function parseT(s){s=String(s||"").trim();if(!s)return null;var m=s.match(/^(\d+):([0-5]?\d)$/);if(m)return +m[1]*60+(+m[2]);if(/^\d+$/.test(s))return +s;return NaN}
  function parseGps(s){var m=String(s||"").match(/(-?\d{1,2}\.\d+)\s*[,; ]\s*(-?\d{1,3}\.\d+)/);return m?[+m[1],+m[2]]:null}
  function spotIssues(x){
    var w=[];if(!window.spotVid||!spotVid(x))w.push(window.IGV===null?"vidéo en chargement":"vidéo introuvable");
    if(!isFinite(x.lat)||!isFinite(x.lng))w.push("pas de GPS");if(!x.adresse)w.push("pas d’adresse");
    if(!x.categorie||!cats().some(function(c){return c.id===x.categorie}))w.push("pas de catégorie");return w;
  }
  // Premier émoji du texte (gère les émojis composés comme 👨‍🍳 ou 🇫🇷)
  function firstEmoji(s){
    s=String(s||"").trim();if(!s)return "";
    var parts=window.Intl&&Intl.Segmenter?Array.from(new Intl.Segmenter("fr",{granularity:"grapheme"}).segment(s),function(x){return x.segment}):Array.from(s);
    for(var i=0;i<parts.length;i++)if(/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(parts[i]))return parts[i];
    return "";
  }
  function slug(s){return norm(s).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,30)||"cat"}
  function editSpot(x,dup){
    var v0=x&&window.spotVid?spotVid(x):null,mid=x&&(x.mid||(v0&&v0.id))||null,lat=x?x.lat:null,lng=x?x.lng:null,mk=null,gm=null;
    // 1. La vidéo, choisie parmi mes Reels
    var pw=el("div","ap-f");pw.appendChild(el("span","","Vidéo (touche la bonne miniature)"));
    var pick=el("div","ap-pick");pw.appendChild(pick);
    var list=window.igOrdered?igOrdered():[];
    if(window.IGV===null)pick.appendChild(el("p","ap-mut","Chargement de tes vidéos…"));
    else if(!list.length)pick.appendChild(el("p","ap-err","Aucune vidéo Instagram trouvée."));
    list.slice().reverse().forEach(function(v){
      var n=list.indexOf(v)+1,b=el("button","ap-pv"+(v.id===mid?" on":""));b.type="button";
      if(v.poster){var im=el("img");im.alt="";im.loading="lazy";im.src=v.poster;b.appendChild(im)}else b.appendChild(el("span","ap-pv-x","🎬"));
      b.appendChild(el("small","","n°"+n+(v.ts?" · "+new Date(v.ts).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"2-digit"}):"")));
      b.title=v.caption||"";
      b.onclick=function(){mid=v.id;Array.prototype.forEach.call(pick.children,function(c){c.classList.toggle("on",c===b)})};
      pick.appendChild(b);
    });
    // 2. L'extrait
    var t1=inp(x?mmss(x.debut):"",6),t2=inp(x?mmss(x.fin):"",6);t1.placeholder="ex : 0:20";t2.placeholder="ex : 0:30";t1.inputMode=t2.inputMode="numeric";
    var rx=el("div","ap-row");rx.appendChild(fld("Début de l’extrait (facultatif)",t1));rx.appendChild(fld("Fin de l’extrait (facultatif)",t2));
    // 3. Même endroit qu'un lieu existant (pour regrouper plusieurs vidéos au même lieu)
    var same=el("select"),seen={};same.appendChild(Object.assign(el("option","","— Nouveau lieu —"),{value:""}));
    (window.SPDB||[]).forEach(function(s){
      if(x&&s.id===x.id&&!dup)return;var k=s.nom+"|"+s.lat+"|"+s.lng;if(seen[k]||!s.nom)return;seen[k]=1;
      var o=el("option","",(s.emoji?s.emoji+" ":"")+s.nom+(s.adresse?" — "+s.adresse:""));o.value=s.id;same.appendChild(o);
    });
    // 4. Nom, émoticône, catégorie, adresse, description
    var nm=inp(x&&x.nom,80),em=inp(x&&x.emoji,8),ad=inp(x&&x.adresse,160),de=el("textarea");de.rows=2;de.maxLength=300;de.value=(x&&x.description)||"";
    // Zone de texte libre : n'importe quel émoji, tapé avec le clavier émoji ou collé
    em.maxLength=16;em.placeholder="Tape ou colle un émoji : 🍕 🎡 🌉 …";em.className="ap-emo-in";em.autocomplete="off";
    var pv=el("span","ap-emo-pv",em.value||"📍");em.oninput=function(){pv.textContent=firstEmoji(em.value)||"📍"};
    var ef=fld("Émoticône sur la carte (n’importe lequel)",em);
    var eh=el("div","ap-emo-row");eh.appendChild(pv);eh.appendChild(el("small","ap-mut","Aperçu sur la carte. Sur téléphone : touche 😀 sur le clavier. Sur ordinateur : Windows + ; (PC) ou Ctrl + Cmd + Espace (Mac)."));ef.appendChild(eh);
    var ca=el("select");
    function fillCats(sel){ca.innerHTML="";cats().forEach(function(c){var o=el("option","",c.emoji+" "+c.nom);o.value=c.id;ca.appendChild(o)});var o=el("option","","＋ Nouvelle catégorie…");o.value="__new";ca.appendChild(o);ca.value=sel||(cats()[0]||{id:"__new"}).id}
    fillCats(x&&x.categorie);
    var nc=el("div","ap-row ap-newcat"),ncn=inp("",40),nce=inp("",8);ncn.placeholder="ex : Restos";nce.placeholder="🍽️";
    nc.appendChild(fld("Nom de la nouvelle catégorie",ncn));nc.appendChild(fld("Son émoticône",nce));
    function upd(){nc.hidden=ca.value!=="__new"}ca.onchange=upd;upd();
    var r1=el("div","ap-row");r1.appendChild(fld("Nom du lieu",nm));r1.appendChild(fld("Catégorie",ca));
    // 5. Position GPS : coller les coordonnées ou toucher la carte
    var gp=inp(isFinite(lat)&&lat!=null?lat+", "+lng:"",60);gp.placeholder="ex : 48.8605454, 2.3388832";
    var gw=fld("Position GPS (colle les coordonnées de Google Maps, ou touche la carte)",gp),gbox=el("div","ap-geo");gw.appendChild(gbox);
    function put(a,b,move){lat=+(+a).toFixed(7);lng=+(+b).toFixed(7);gp.value=lat+", "+lng;if(gm){if(mk)mk.setLatLng([lat,lng]);else mk=geoDot([lat,lng],"#e1306c").addTo(gm);if(move)gm.setView([lat,lng],Math.max(gm.getZoom(),15))}}
    gp.oninput=function(){var g=parseGps(gp.value);if(g){lat=g[0];lng=g[1];if(gm){if(mk)mk.setLatLng(g);else mk=geoDot(g,"#e1306c").addTo(gm);gm.setView(g,Math.max(gm.getZoom(),15))}}};
    if(window.L)setTimeout(function(){gm=parisMap(gbox,false,true);if(isFinite(lat)&&lat!=null)put(lat,lng,true);gm.on("click",function(e){put(e.latlng.lat,e.latlng.lng,false)})},30);
    same.onchange=function(){
      var s=(window.SPDB||[]).filter(function(y){return y.id===same.value})[0];if(!s)return;
      nm.value=s.nom||"";ad.value=s.adresse||"";em.value=s.emoji||"";if(s.categorie)fillCats(s.categorie),upd();
      if(!de.value&&s.description)de.value=s.description;if(isFinite(s.lat))put(s.lat,s.lng,true);
    };
    var vis=chk("Visible sur la carte",x?x.on!==false:true);
    var body=[pw,rx,fld("Même endroit qu’un lieu déjà sur la carte ? (regroupe les vidéos dans une bulle)",same),r1,nc,ef,fld("Adresse affichée",ad),fld("Description (facultatif)",de),gw,vis];
    var sv=el("button","btn",x&&!dup?"Enregistrer":"Ajouter");sv.type="submit";
    var err=dlg(dup?"Dupliquer : même vidéo, autre extrait":x?"Modifier un lieu":"Ajouter un lieu",body,[sv]);
    sv.onclick=function(){
      var a=parseT(t1.value),z=parseT(t2.value),g=parseGps(gp.value);
      var e=(em.value.trim()&&!firstEmoji(em.value))?"L’émoticône doit être un émoji (par exemple 🍕), pas du texte.":!mid?"Choisis la vidéo en touchant sa miniature.":!nm.value.trim()?"Donne un nom au lieu.":!ad.value.trim()?"Indique l’adresse du lieu.":
        !g?"Ajoute la position GPS : colle les coordonnées (ex : 48.8605, 2.3388) ou touche la carte.":
        (ca.value==="__new"&&!ncn.value.trim())?"Donne un nom à la nouvelle catégorie.":
        (isNaN(a)||isNaN(z))?"Extrait : écris les temps comme 0:20 (minutes:secondes).":(a!=null&&z!=null&&z<=a)?"Extrait : la fin doit être après le début.":"";
      if(e){err.textContent=e;return}
      var ops=[],cid=ca.value;
      if(cid==="__new"){
        cid=slug(ncn.value);var base=cid,i=2;while(cats().some(function(c){return c.id===cid}))cid=base+"-"+(i++);
        ops.push(LB.db.doc("spotcats/"+cid).set({nom:ncn.value.trim(),emoji:nce.value.trim()||"📍",n:Date.now()}));
      }
      var r={nom:nm.value.trim(),emoji:firstEmoji(em.value)||null,categorie:cid,adresse:ad.value.trim(),description:de.value.trim(),lat:g[0],lng:g[1],mid:mid,debut:a,fin:z,on:vis.__c.checked,n:x&&!dup?(x.n||0):Date.now()};
      var id=x&&!dup?x.id:"spot_"+Date.now().toString(36);
      ops.push(LB.db.doc("spots/"+id).set(r));
      sv.disabled=true;err.textContent="";
      write(Promise.all(ops),dup?"Extrait ajouté.":x?"Modifications enregistrées.":"Lieu ajouté à la carte !").then(function(){$("apDlg").close()}).catch(function(){sv.disabled=false;err.textContent="L’enregistrement a échoué."});
    };
  }
  // Gérer les catégories : renommer, changer l'émoticône, ajouter, supprimer (si elle n'est plus utilisée)
  function editCats(){
    var rowsC=[],box=el("div","ap-cats");
    function line(c){
      var r=el("div","ap-catrow"),e=inp(c?c.emoji:"",8),n=inp(c?c.nom:"",40);e.placeholder="📍";n.placeholder="Nom de la catégorie";e.className="ap-emo";
      var used=c?(window.SPDB||[]).filter(function(s){return s.categorie===c.id}).length:0;
      r.appendChild(e);r.appendChild(n);r.appendChild(el("small","ap-mut",used+" lieu"+(used>1?"x":"")));
      var d=el("button","btn ghost","Supprimer");d.type="button";
      var o={c:c,e:e,n:n,del:false,r:r};
      d.onclick=function(){if(used){err.textContent="« "+(c.nom||"")+" » est utilisée par "+used+" lieu"+(used>1?"x":"")+" : change d’abord leur catégorie.";return}o.del=!o.del;r.classList.toggle("del",o.del);d.textContent=o.del?"Annuler":"Supprimer"};
      r.appendChild(d);rowsC.push(o);box.appendChild(r);
    }
    cats().forEach(line);
    var add=el("button","btn ghost","＋ Ajouter une catégorie");add.type="button";add.onclick=function(){line(null)};
    var sv=el("button","btn","Enregistrer");sv.type="submit";
    var err=dlg("Catégories de la carte",[box,add],[sv]);
    sv.onclick=function(){
      var ops=[],bad=rowsC.filter(function(o){return !o.del&&(o.n.value.trim()||o.c)&&!o.n.value.trim()});
      if(bad.length){err.textContent="Chaque catégorie doit avoir un nom.";return}
      rowsC.forEach(function(o){
        var nmv=o.n.value.trim(),emv=o.e.value.trim()||"📍";
        if(o.c&&o.del)ops.push(LB.db.doc("spotcats/"+o.c.id).delete());
        else if(o.c&&(nmv!==o.c.nom||emv!==o.c.emoji))ops.push(LB.db.doc("spotcats/"+o.c.id).update({nom:nmv,emoji:emv}));
        else if(!o.c&&nmv){var id=slug(nmv),base=id,i=2;while(cats().some(function(c){return c.id===id}))id=base+"-"+(i++);ops.push(LB.db.doc("spotcats/"+id).set({nom:nmv,emoji:emv,n:Date.now()+ops.length}))}
      });
      if(!ops.length){$("apDlg").close();return}
      sv.disabled=true;write(Promise.all(ops),"Catégories enregistrées.").then(function(){$("apDlg").close()}).catch(function(){sv.disabled=false;err.textContent="L’enregistrement a échoué."});
    };
  }
  function nameOf(d){return d.one==="question"?"une question":d.one==="objet"?"un objet":d.one==="vidéo"?"une vidéo":"un lieu"}
  function write(p,ok){
    if(!LB.db)return Promise.reject();
    return p.then(function(){if(ok)toast(ok)}).catch(function(e){toast("Action refusée : vérifie que tu es connecté en admin.");throw e});
  }

  // Tableau
  window.apRender=function(){
    apSeed();
    if($("adminPage").hidden)return;
    Array.prototype.forEach.call($("apTabs").children,function(b){
      var on=b.dataset.t===st.t;b.setAttribute("aria-selected",String(on));b.querySelector(".n").textContent=rows(b.dataset.t).length;
    });
    var d=T[st.t];
    $("apLvl").hidden=!d.lv;$("apZone").hidden=st.t!=="lieux";$("apOk").hidden=st.t!=="lieux";
    $("apCat").hidden=$("apCatsBtn").hidden=st.t!=="spots";$("apIgBtn").hidden=st.t!=="reels";
    if(st.t==="spots"){var cs=$("apCat");cs.innerHTML="";cs.appendChild(Object.assign(el("option","","Toutes les catégories"),{value:""}));cats().forEach(function(c){var o=el("option","",c.emoji+" "+c.nom);o.value=c.id;cs.appendChild(o)});cs.value=st.cat||""}
    var mk={quiz:"quiz",prix:"prix",lieux:"loc"}[st.t],mon=!!(window.MAINT||{})[mk];
    $("apMaint").hidden=!mk;$("apMaint").classList.toggle("on",mon);
    $("apMaintSw").classList.toggle("on",mon);$("apMaintSw").setAttribute("aria-checked",String(mon));
    $("apMaintS").textContent=mon?"Activé : les joueurs voient « Jeu en maintenance ». Toi, tu peux encore le tester.":"Désactivé : le jeu est ouvert à tous.";$("apVis").hidden=!d.vis;$("apAdd").hidden=!!d.noAdd;
    $("apAdd").textContent="+ Ajouter "+nameOf(d);
    $("apSearch").placeholder="Rechercher dans les "+d.many+"…";
    var all=rows(st.t),q=norm(st.q).trim();
    var list=all.filter(function(x){
      if(d.lv&&st.lvl&&x.level!==st.lvl)return false;
      if(st.t==="lieux"&&st.zone&&x.zone!==st.zone)return false;
      if(st.t==="lieux"&&st.ok==="ok"&&x.ok!==true)return false;
      if(st.t==="spots"&&st.cat&&x.categorie!==st.cat)return false;
      if(st.t==="lieux"&&st.ok==="no"&&x.ok===true)return false;
      if(d.vis&&st.vis==="on"&&x.on===false)return false;
      if(d.vis&&st.vis==="off"&&x.on!==false)return false;
      return !q||norm(d.find(x)).indexOf(q)>=0;
    });
    var col=st.sk!=null&&d.cols[st.sk];
    list.sort(col&&col.k?function(a,b){var x=col.k(a),y=col.k(b);return (x<y?-1:x>y?1:0)*st.sd||d.def(a,b)}:d.def);
    var nok=st.t==="lieux"?" · "+all.filter(function(x){return x.ok===true}).length+" validés au total":"";
    if(st.t==="reels"&&allSpots().length&&window.IGV){
      // Lieux de la carte pour lesquels aucune vidéo ne correspond (mauvaise date ou mauvais numéro)
      var sl=allSpots(),miss=sl.filter(function(s){return !(window.spotVid&&spotVid(s))});
      nok=" · "+(sl.length-miss.length)+"/"+sl.length+" lieux de la carte reliés à une vidéo"+(miss.length?" · ⚠ Sans vidéo trouvée : "+miss.map(function(s){return s.nom+(s.date?" ("+s.date+")":s.video?" (n°"+s.video+")":"")}).join(", "):"");
    }
    $("apCount").textContent=(list.length===all.length?all.length+" "+(all.length>1?d.many:d.one):list.length+" sur "+all.length+" "+d.many)+nok;
    var hr=el("tr");if(!d.noNum)hr.appendChild(el("th","ap-num","#"));
    d.cols.forEach(function(c,i){
      var th=el("th",c.cls||"");
      if(c.k){var b=el("button","",c.h);b.type="button";if(st.sk===i)b.dataset.d=st.sd;b.onclick=function(){if(st.sk===i)st.sd=-st.sd;else{st.sk=i;st.sd=1}apRender()};th.appendChild(b)}
      else th.textContent=c.h;
      hr.appendChild(th);
    });
    hr.appendChild(el("th","ap-act",""));
    var hd=$("apHead");hd.innerHTML="";hd.appendChild(hr);
    var bd=$("apBody");bd.innerHTML="";
    list.forEach(function(x,k){
      var tr=el("tr",x.on===false?"off":"");
      if(!d.noNum){var n=el("td","ap-num",String(k+1));tr.appendChild(n)}
      d.cols.forEach(function(c){var td=el("td",c.cls||"");td.dataset.l=c.h;td.appendChild(c.c(x));tr.appendChild(td)});
      var a=el("td","ap-act");
      if(!d.noEdit){var e=el("button","","Modifier");e.type="button";e.onclick=function(){edit(x)};a.appendChild(e)}
      if(d.dup){var du=el("button","","Dupliquer");du.type="button";du.title="Même vidéo et même lieu, pour un autre extrait";du.onclick=function(){editSpot(x,true)};a.appendChild(du)}
      if(!d.noDel){var del=el("button","del",st.t==="scores"?"Supprimer le joueur":"Supprimer");del.type="button";del.onclick=function(){ask(x)};a.appendChild(del)}
      tr.appendChild(a);bd.appendChild(tr);
    });
    var em=$("apEmpty");em.hidden=!!list.length;
    if(st.t==="spots"&&!all.length){
      em.innerHTML="";em.appendChild(el("p","","Aucun lieu dans la base pour l’instant."));
      var ib=el("button","btn","Importer mes "+(SPOTS?SPOTS.lieux.length:"")+" lieux de départ");ib.type="button";
      ib.onclick=function(){ib.disabled=true;importSpots().then(function(){toast("Lieux et catégories importés.")}).catch(function(e){ib.disabled=false;toast("Import impossible : "+((e&&e.message)||"réessaie"))})};
      em.appendChild(ib);return;
    }
    em.textContent=all.length?"Aucun résultat pour cette recherche.":(st.t==="scores"?"Personne n’a encore joué.":st.t==="reels"?(window.IGV===null?"Chargement…":"Aucune vidéo Instagram trouvée."):"Chargement…");
  };

  // Fenêtre d'ajout / modification
  function fld(lbl,inp,cls){var w=el("label","ap-f"+(cls?" "+cls:""));w.appendChild(el("span","",lbl));w.appendChild(inp);return w}
  function inp(v,max){var i=el("input");i.value=v==null?"":v;if(max)i.maxLength=max;return i}
  function lvSel(v){var s=el("select");Object.keys(LVN).forEach(function(k){var o=el("option","",LVN[k]);o.value=k;s.appendChild(o)});s.value=v||st.lvl||"facile";return s}
  function imgField(cur,set,lbl){
    var w=el("div","ap-f");w.appendChild(el("span","",lbl||"Image (facultatif)"));
    var box=el("div","ap-img"),pv=el("img");pv.alt="";
    var f=el("input");f.type="file";f.accept="image/*";
    var rm=el("button","btn ghost","Retirer l’image");rm.type="button";
    function show(v){set(v);pv.hidden=!v;rm.hidden=!v;if(v)pv.src=imgSrc(v)}
    rm.onclick=function(){f.value="";show(null)};
    f.onchange=function(){
      var file=f.files[0];if(!file)return;
      var rd=new FileReader();
      rd.onload=function(){
        var im=new Image();
        im.onload=function(){
          var s=Math.min(1,700/Math.max(im.width,im.height)),c=document.createElement("canvas");
          c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);
          c.getContext("2d").drawImage(im,0,0,c.width,c.height);
          show(c.toDataURL("image/jpeg",.75));
        };
        im.onerror=function(){toast("Image illisible.")};
        im.src=rd.result;
      };
      rd.readAsDataURL(file);
    };
    box.appendChild(pv);box.appendChild(f);box.appendChild(rm);w.appendChild(box);show(cur||null);w.__show=show;
    return w;
  }
  function geoField(lat,lng,set,wide){
    var w=el("div","ap-f");w.appendChild(el("span","","Position : touche la carte à l’endroit du lieu (tu peux zoomer)"));
    var box=el("div","ap-geo");w.appendChild(box);
    if(!window.L){box.appendChild(el("p","ap-err","La carte n’a pas pu se charger."));return w}
    setTimeout(function(){
      var m=parisMap(box,true),mk=null;parisHome(m,false,wide);
      function put(ll){set(ll.lat,ll.lng);if(mk)mk.setLatLng(ll);else mk=geoDot(ll,"#f5b21a").addTo(m)}
      if(lat!=null&&lng!=null&&isFinite(lat)&&isFinite(lng)){put(L.latLng(lat,lng));m.setView([lat,lng],15)}
      m.on("click",function(e){put(e.latlng)});
    },30);
    return w;
  }
  function chk(lbl,v){var w=el("label","ap-chk"),c=el("input");c.type="checkbox";c.checked=v;w.appendChild(c);w.appendChild(document.createTextNode(lbl));w.__c=c;return w}
  function dlg(title,body,acts){
    var f=$("apForm");f.innerHTML="";f.appendChild(el("h2","",title));
    body.forEach(function(b){f.appendChild(b)});
    var err=el("p","ap-err","");f.appendChild(err);
    var a=el("div","ap-dlg-acts"),c=el("button","btn ghost","Annuler");c.type="button";c.onclick=function(){$("apDlg").close()};
    a.appendChild(c);acts.forEach(function(b){a.appendChild(b)});f.appendChild(a);
    f.onsubmit=function(e){e.preventDefault()};
    if(!$("apDlg").open)$("apDlg").showModal();
    return err;
  }
  function edit(x){
    if(st.t==="spots")return editSpot(x,false);
    var t=st.t,d=T[t],img=x?x.img||null:null,px=x?x.lat:null,py=x?x.lng:null,body=[],get;
    if(t==="quiz"){
      var lv=lvSel(x&&x.level),q=el("textarea");q.rows=2;q.maxLength=200;q.value=x?x.q:"";
      var w=x?(x.o||[]).filter(function(o){return o!==x.a}):[];
      var a=inp(x&&x.a,80),w1=inp(w[0],80),w2=inp(w[1],80),w3=inp(w[2],80);
      var r1=el("div","ap-row");r1.appendChild(fld("Bonne réponse",a,"good"));r1.appendChild(fld("Mauvaise réponse 1",w1));
      var r2=el("div","ap-row");r2.appendChild(fld("Mauvaise réponse 2",w2));r2.appendChild(fld("Mauvaise réponse 3",w3));
      body=[fld("Niveau",lv),fld("Question",q),r1,r2];
      get=function(){
        var v=[q.value,a.value,w1.value,w2.value,w3.value].map(function(s){return s.trim()});
        if(v.some(function(s){return !s}))return "Remplis la question et les 4 réponses.";
        var o=v.slice(1);if(new Set(o.map(norm)).size!==4)return "Les 4 réponses doivent être différentes.";
        return {level:lv.value,q:v[0],a:v[1],o:o};
      };
    }else if(t==="prix"){
      var lv2=lvSel(x&&x.level),tt=inp(x&&x.t,120),pr=inp(x?String(x.p).replace(".",","):"",12);pr.inputMode="decimal";pr.placeholder="ex : 2,50";
      var r=el("div","ap-row");r.appendChild(fld("Niveau",lv2));r.appendChild(fld("Prix moyen en euros",pr,"good"));
      body=[fld("Objet ou service (ex : Un croissant en boulangerie)",tt),r];
      get=function(){
        var s=tt.value.trim(),p=parseFloat(pr.value.replace(",",".").replace(/\s|€/g,""));
        if(!s||isNaN(p)||p<=0)return "Indique l’objet et un prix supérieur à 0.";
        return {level:lv2.value,t:s,p:p};
      };
    }else if(t==="videos"){
      var u=inp(x&&x.u,300),vt=inp(x&&x.t,80);u.placeholder="https://www.tiktok.com/@decouvronsparis1/video/…";vt.placeholder="ex : Le plus beau rooftop de Paris";
      var hint=el("p","ap-mut","Sur TikTok, ouvre la vidéo dans ton navigateur et copie le lien de la barre d’adresse. Les liens courts (vm.tiktok.com) ne marchent pas ici.");
      body=[fld("Lien de la vidéo TikTok",u),hint,fld("Titre (facultatif, pour t’y retrouver)",vt)];
      get=function(){
        var s=u.value.trim(),m=s.match(/\/video\/(\d{8,25})/)||s.match(/^(\d{8,25})$/);
        if(!m)return "Ce lien ne ressemble pas à un lien de vidéo TikTok (…/video/123456…).";
        return {u:/^https?:/.test(s)?s:"https://www.tiktok.com/@decouvronsparis1/video/"+m[1],vid:m[1],t:vt.value.trim()};
      };
    }else{
      var nm=inp(x&&x.n,60),lv3=lvSel(x&&x.level),zn=el("select");
      [["paris","Paris"],["banlieue","Banlieue"]].forEach(function(z){var o=el("option","",z[1]);o.value=z[0];zn.appendChild(o)});
      zn.value=(x&&x.zone)||st.zone||"paris";
      var r3=el("div","ap-row");r3.appendChild(fld("Niveau",lv3));r3.appendChild(fld("Zone",zn));
      body=[fld("Nom du lieu",nm),r3,geoField(px,py,function(a,b){px=+a.toFixed(6);py=+b.toFixed(6)},zn.value==="banlieue")];
      get=function(){
        if(!nm.value.trim())return "Indique le nom du lieu.";
        if(!isFinite(px)||!isFinite(py)||px===null)return "Touche la carte pour placer le lieu.";
        return {n:nm.value.trim(),lat:px,lng:py,level:lv3.value,zone:zn.value};
      };
    }
    var img0=img,okc=null;
    if(t==="quiz"||t==="prix")body.push(imgField(img,function(v){img=v}));
    else if(t==="lieux"){
      // La photo est rangée dans « photos/<id> » et chargée seulement quand on en a besoin
      var pf=imgField(null,function(v){img=v},"Photo du lieu (obligatoire pour valider)");body.push(pf);
      var phWait=!!(x&&x.ph);
      if(phWait)LB.db.doc("photos/"+x.id).get().then(function(s){if(s.exists){img0=s.data().img;pf.__show(img0)}phWait=false}).catch(function(){});
      okc=chk("Validé : position et photo vérifiées",x?x.ok===true:false);body.push(okc);
    }
    var vis=chk("Visible dans le jeu",x?x.on!==false:true);body.push(vis);
    var sv=el("button","btn",x?"Enregistrer":"Ajouter");sv.type="submit";
    var err=dlg((x?"Modifier ":"Ajouter ")+nameOf(d),body,[sv]);
    sv.onclick=function(){
      var r=get();if(typeof r==="string"){err.textContent=r;return}
      r.on=vis.__c.checked;
      if(t==="quiz"||t==="prix")r.img=img||null;
      else if(t==="lieux"){
        if(phWait){err.textContent="La photo est encore en train de charger, réessaie dans un instant.";return}
        if(okc.__c.checked&&!img){err.textContent="Ajoute une photo avant de valider ce lieu.";return}
        r.ph=!!img;r.ok=okc.__c.checked;
      }
      if(t==="lieux")r.o=x?x.o||0:Date.now();else r.n=x?x.n||0:Date.now();
      var id=x?x.id:(t==="lieux"?"lieu_"+r.zone+"_"+r.level:t==="videos"?"v":r.level)+"_"+Date.now().toString(36);
      sv.disabled=true;err.textContent="";
      var ops=[LB.db.doc(d.coll+"/"+id).set(r)];
      if(t==="lieux"&&img!==img0)ops.push(img?LB.db.doc("photos/"+id).set({img:img}):LB.db.doc("photos/"+id).delete());
      write(Promise.all(ops),x?"Modifications enregistrées.":"Ajouté !").then(function(){$("apDlg").close()}).catch(function(){sv.disabled=false;err.textContent="L’enregistrement a échoué."});
    };
  }
  function ask(x){
    var d=T[st.t],nm=st.t==="quiz"?x.q:st.t==="prix"?x.t:st.t==="lieux"?x.n:st.t==="videos"?(x.t||"cette vidéo"):st.t==="spots"?(x.nom||"ce lieu"):(x.name||"Anonyme");
    var y=el("button","btn danger",st.t==="scores"?"Supprimer le joueur":"Supprimer");y.type="button";
    var p=el("p","ap-mut",st.t==="scores"?"Tous les scores de ce joueur seront effacés du classement. C’est définitif. Pour retirer un seul score, utilise le petit × à côté du score.":"C’est définitif. Pour le retirer du jeu sans l’effacer, utilise plutôt l’interrupteur « Visible ».");
    var err=dlg("Supprimer « "+nm+" » ?",[p],[y]);
    y.onclick=function(){y.disabled=true;if(st.t==="lieux"&&x.ph)LB.db.doc("photos/"+x.id).delete().catch(function(){});write(LB.db.doc(d.coll+"/"+x.id).delete(),"Supprimé.").then(function(){$("apDlg").close()}).catch(function(){y.disabled=false;err.textContent="La suppression a échoué."})};
  }

  // Première ouverture : copie les questions, prix et lieux de base dans la base pour pouvoir tout modifier
  var seeding=false,seedDone=false,migrated=false,midDone=false;
  window.apSeed=function(){
    // Retenir la vidéo exacte des lieux importés (pour qu'une suppression sur Instagram ne décale rien)
    if(!midDone&&window.ADMIN_UNLOCKED&&LB.db&&window.IGV&&IGV.length&&window.SPDB&&SPDB.length&&window.spotVid){
      midDone=true;
      SPDB.forEach(function(s){if(s.mid)return;var v=spotVid(s);if(v)LB.db.doc("spots/"+s.id).update({mid:v.id}).catch(function(){})});
    }
    if(seeding||seedDone||!window.ADMIN_UNLOCKED||!LB.db||!window.QDB_OK||!window.PDB_OK||!window.LDB_OK)return;
    seeding=true;
    var ref=LB.db.doc("config/seed");
    ref.get().then(function(s){
      var done=s.exists?s.data():{},b=LB.db.batch(),mark={},n=0;
      function pad(i){return ("00"+i).slice(-3)}
      if(!done.quiz&&!window.QDB.length){
        Object.keys(LVN).forEach(function(l,li){(window.quizBank[l]||[]).forEach(function(q,i){b.set(LB.db.doc("questions/base_"+l+"_"+pad(i)),{level:l,q:q[0],a:q[1],o:q[2],img:null,on:true,n:li*1000+i});n++})});
        mark.quiz=true;
      }
      if(!done.prix&&!window.PDB.length){
        Object.keys(LVN).forEach(function(l,li){(window.priceBank[l]||[]).forEach(function(q,i){b.set(LB.db.doc("prix/base_"+l+"_"+pad(i)),{level:l,t:q[0],p:q[1],img:null,on:true,n:li*1000+i});n++})});
        mark.prix=true;
      }
      // Version 2 des lieux : 3 niveaux × Paris/banlieue. Les 16 anciens lieux de base sont remplacés,
      // les lieux ajoutés à la main sont gardés et classés « Moyen · Paris » par défaut.
      if(!done.spots&&window.SPDB&&window.SCDB&&SPOTS&&!SPDB.length){
        Object.keys(SPOTS.categories).forEach(function(k,i){var c=SPOTS.categories[k];b.set(LB.db.doc("spotcats/"+k),{nom:c.nom,emoji:c.emoji,n:i});n++});
        SPOTS.lieux.forEach(function(s,i){
          var v=window.spotVid&&window.IGV?spotVid(s):null;
          b.set(LB.db.doc("spots/spot_"+pad(i)),{nom:s.nom,emoji:s.emoji||null,categorie:s.categorie,adresse:s.adresse||"",description:s.description||"",lat:s.gps[0],lng:s.gps[1],mid:v?v.id:null,date:s.date||null,video:s.video||null,debut:s.debut==null?null:s.debut,fin:s.fin==null?null:s.fin,on:true,n:i});n++;
        });
        mark.spots=true;
      }
      if(!done.lieux2){
        (window.LDB||[]).forEach(function(x){
          if(x.level&&x.zone)return;
          if(/^base_/.test(x.id))b.delete(LB.db.doc("lieux/"+x.id));else b.update(LB.db.doc("lieux/"+x.id),{level:"moyen",zone:"paris"});
          n++;
        });
        (window.locBank||[]).forEach(function(q){b.set(LB.db.doc("lieux/geo_"+q.zone+"_"+q.level+"_"+pad(q.o)),{n:q.n,lat:q.lat,lng:q.lng,level:q.level,zone:q.zone,on:true,ok:false,ph:false,o:q.o});n++});
        mark.lieux=true;mark.lieux2=true;mark.lieux3=true;
        b.set(LB.db.doc("config/maintenance"),{loc:true},{merge:true});
      }else if(!done.lieux3){
        // Version 3 : le jeu passe aux photos. Tous les lieux repassent « à valider » et le jeu part en maintenance.
        (window.LDB||[]).forEach(function(x){b.update(LB.db.doc("lieux/"+x.id),{ok:false,ph:!!x.ph});n++});
        b.set(LB.db.doc("config/maintenance"),{loc:true},{merge:true});n++;
        mark.lieux3=true;
      }
      // Tout est déjà importé : on ne revérifie plus pendant cette visite
      if(done.quiz&&done.prix&&done.lieux2&&done.lieux3&&done.spots){seedDone=true;seeding=false;return}
      if(!n){seeding=false;return}
      b.set(ref,mark,{merge:true});
      // Après l'import, on réessaie au prochain affichage pour ce qui n'était pas encore prêt (ex. lieux de la carte)
      return b.commit().then(function(){seeding=false;toast(mark.lieux3&&!mark.lieux2?"Lieux remis « à valider » et jeu mis en maintenance.":"Contenu de base importé : tout est modifiable.")});
    }).catch(function(){seeding=false});
  };

  // Ouverture / fermeture de la page
  window.apOpen=function(){
    if(!window.ADMIN_UNLOCKED)return;
    $("adminPage").hidden=false;document.body.classList.add("apage");window.scrollTo(0,0);
    try{history.replaceState(null,"","#admin")}catch(e){}
    apSeed();apRender();
  };
  window.apClose=function(){
    if($("apDlg").open)$("apDlg").close();
    $("adminPage").hidden=true;document.body.classList.remove("apage");
    if(location.hash==="#admin")try{history.replaceState(null,"",location.pathname+location.search)}catch(e){}
  };
  Array.prototype.forEach.call($("apTabs").children,function(b){b.onclick=function(){if(st.t===b.dataset.t)return;st.t=b.dataset.t;st.sk=null;st.sd=1;st.q="";$("apSearch").value="";apRender()}});
  $("apSearch").oninput=function(){st.q=this.value;apRender()};
  [["apLvl","lvl"],["apVis","vis"],["apZone","zone"],["apOk","ok"]].forEach(function(g){
    Array.prototype.forEach.call($(g[0]).children,function(b){b.onclick=function(){st[g[1]]=b.dataset.v;Array.prototype.forEach.call($(g[0]).children,function(x){x.classList.toggle("on",x===b)});apRender()}});
  });
  $("apAdd").onclick=function(){edit(null)};
  $("apCatsBtn").onclick=function(){editCats()};
  $("apIgBtn").onclick=function(){
    var tk=el("textarea");tk.rows=3;tk.placeholder="Colle ici le token Instagram (commence souvent par IG…)";tk.autocomplete="off";tk.spellcheck=false;
    var p=el("p","ap-mut","Le token est rangé dans une partie privée de ta base : personne ne peut le lire depuis le site. Il se renouvelle ensuite tout seul. Tu n’as besoin de le recoller que si les vidéos disparaissent.");
    var sv=el("button","btn","Enregistrer le token");sv.type="submit";
    var err=dlg("Connexion Instagram",[fld("Token Instagram",tk),p],[sv]);
    sv.onclick=function(){
      var v=tk.value.trim();if(v.length<20){err.textContent="Ce token paraît trop court : vérifie le copier-coller.";return}
      sv.disabled=true;write(LB.db.doc("prive/instagram").set({token:v,at:Date.now()}),"Token enregistré. Les vidéos arrivent d’ici quelques minutes.").then(function(){$("apDlg").close()}).catch(function(){sv.disabled=false;err.textContent="L’enregistrement a échoué (as-tu publié les nouvelles règles ?)."});
    };
  };
  $("apCat").onchange=function(){st.cat=this.value;apRender()};
  $("apMaintSw").onclick=function(){
    var k={quiz:"quiz",prix:"prix",lieux:"loc"}[st.t];if(!k)return;
    var on=!(window.MAINT||{})[k],o={};o[k]=on;
    write(LB.db.doc("config/maintenance").set(o,{merge:true}),on?"Jeu mis en maintenance.":"Jeu de nouveau ouvert à tous.").catch(function(){});
  };
  $("apBack").onclick=function(){apClose();window.scrollTo(0,0)};
  // Infos légales : nom de l'éditeur, directeur de la publication et e-mail, affichés sur les pages légales
  $("apLegal").onclick=function(){
    var ref=LB.db.doc("config/legal"),nm=inp("",80),di=inp("",80),em=inp("",120);
    nm.placeholder="ex : Prénom Nom";di.placeholder="Laisse vide si c’est la même personne";em.placeholder="ex : contact@exemple.fr";em.type="email";
    var p=el("p","ap-mut","Ces informations s’affichent sur les pages Mentions légales et Confidentialité (en bas du site). Elles sont publiques.");
    var sv=el("button","btn","Enregistrer");sv.type="submit";
    var err=dlg("Infos légales",[p,fld("Éditeur du site (prénom et nom)",nm),fld("Directeur de la publication",di),fld("E-mail de contact",em)],[sv]);
    ref.get().then(function(s){var d=s.exists?s.data():{};nm.value=d.nom||"";di.value=d.directeur||"";em.value=d.email||""}).catch(function(){});
    sv.onclick=function(){
      var n=nm.value.trim(),e=em.value.trim();
      if(!n){err.textContent="Indique le nom de l’éditeur du site.";return}
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){err.textContent="Indique une adresse e-mail valide.";return}
      sv.disabled=true;
      write(ref.set({nom:n,directeur:di.value.trim()||n,email:e,maj:Date.now()}),"Infos légales enregistrées.").then(function(){$("apDlg").close()}).catch(function(){sv.disabled=false;err.textContent="L’enregistrement a échoué."});
    };
  };
  $("apDlg").addEventListener("click",function(e){if(e.target===this)this.close()});
})();
