// Découvre ! : vraie carte avec mes lieux en vidéo
window.dInit=function(){
  if(window.dMap||!window.L)return;
  var m=window.dMap=parisMap($("d-map"),false,true);
  if(window.spotsInit)spotsInit(m);
};

// Découvre ! : mes lieux en vidéo (public/spots.json). Chaque lieu renvoie à une de mes vidéos Instagram
// par son numéro (1 = la plus ancienne), avec un extrait facultatif « debut »/« fin » en secondes.
(function(){
  var SP=null,SPJ=null,cat="",layer=null,map=null,framed=false;
  // Survol seulement avec une souris (sur téléphone, on touche le point)
  var HOVER=!!(window.matchMedia&&matchMedia("(hover:hover) and (pointer:fine)").matches);
  fetch("spots.json",{cache:"no-store"}).then(function(r){return r.json()}).then(function(j){SPJ=j;build()}).catch(function(){SPJ={categories:{},lieux:[]};build()});
  // Les lieux se gèrent dans l'admin (Firebase : « spots » et « spotcats ») ; spots.json sert tant que la base est vide
  function build(){
    if(window.SPDB&&SPDB.length){
      var cs={};(window.SCDB||[]).slice().sort(function(a,b){return (a.n||0)-(b.n||0)}).forEach(function(c){cs[c.id]={nom:c.nom,emoji:c.emoji}});
      SP={categories:cs,lieux:SPDB.filter(function(s){return s.on!==false&&s.nom&&isFinite(s.lat)&&isFinite(s.lng)&&s.lat!==null}).sort(function(a,b){return (a.n||0)-(b.n||0)}).map(function(s){return Object.assign({},s,{gps:[+s.lat,+s.lng]})})};
    }else if(SPJ)SP=SPJ;else return;
    draw();
  }
  window.spotsData=build;
  window.spotVid=function(s){return vidOf(s)};
  // Mes vidéos de la plus ancienne (n°1) à la plus récente
  window.igOrdered=function(){
    var l=(window.IGV||[]).slice();
    if(l.every(function(v){return v.ts}))l.sort(function(a,b){return a.ts<b.ts?-1:a.ts>b.ts?1:0});else l.reverse();
    return l;
  };
  // Jour de publication (heure de Paris) au format AAAA-MM-JJ
  window.igDay=function(ts){try{return new Date(ts).toLocaleDateString("sv-SE",{timeZone:"Europe/Paris"})}catch(e){return String(ts).slice(0,10)}};
  // Une vidéo se désigne par son numéro (1 = la plus ancienne) ou par sa date de publication
  function vidOf(s){
    var l=igOrdered();
    if(s.mid)return l.filter(function(v){return v.id===s.mid})[0]||null;
    if(s.date)return l.filter(function(v){return v.ts&&igDay(v.ts)===s.date})[0]||null;
    return l[s.video-1]||null;
  }
  function secs(x){if(x==null||x==="")return null;if(typeof x==="number")return x;var p=String(x).split(":").map(Number);return p.length>1?p[0]*60+p[1]:p[0]}
  function emo(c){return (SP.categories[c]||{}).emoji||"📍"}
  // Lieux regroupés par position (même GPS = même bulle)
  function groups(){
    var g={};SP.lieux.forEach(function(s){if(cat&&s.categorie!==cat)return;var k=s.gps[0].toFixed(5)+","+s.gps[1].toFixed(5);(g[k]=g[k]||[]).push(s)});
    return Object.keys(g).map(function(k){return g[k]});
  }
  function chips(){
    var box=$("d-cats");box.innerHTML="";
    var cs=Object.keys(SP.categories).filter(function(c){return SP.lieux.some(function(s){return s.categorie===c})});
    box.hidden=!cs.length;if(!cs.length)return;
    [""].concat(cs).forEach(function(c){
      var n=SP.lieux.filter(function(s){return !c||s.categorie===c}).length;
      var b=el("button","dcat"+(c===cat?" on":""));b.type="button";
      b.appendChild(el("span","e",c?emo(c):"✨"));b.appendChild(el("span","",(c?SP.categories[c].nom:"Tout")+" ("+n+")"));
      b.onclick=function(){cat=c;chips();draw();if(c)show((SP.categories[c].emoji||"")+" "+SP.categories[c].nom,SP.lieux.filter(function(s){return s.categorie===c}));else hide()};
      box.appendChild(b);
    });
  }
  function draw(){
    if(!SP||!map)return;
    chips();
    if(layer)layer.remove();layer=L.layerGroup().addTo(map);
    groups().forEach(function(g){
      var s=g[0],html='<div class="vpin" aria-hidden="true">'+(s.emoji||emo(s.categorie))+(g.length>1?'<b>'+g.length+'</b>':'')+'</div>';
      var mk=L.marker(s.gps,{icon:L.divIcon({className:"",html:html,iconSize:[48,48],iconAnchor:[24,24]}),title:g.length>1?s.nom+" ("+g.length+" vidéos)":s.nom,keyboard:true,alt:s.nom,zIndexOffset:500}).addTo(layer);
      var c=document.createElement("div"),b=document.createElement("b");b.textContent=(s.emoji?s.emoji+" ":"")+s.nom;c.appendChild(b);
      if(g.length===1&&s.description)c.appendChild(el("span","",s.description));
      else if(g.length>1)c.appendChild(el("span","",g.map(function(x){return x.nom}).filter(function(n,i,a){return a.indexOf(n)===i}).join(" · ")));
      var go=el("button","dpop-go",g.length>1?"▶ Voir les "+g.length+" vidéos":"▶ Voir la vidéo");go.type="button";
      go.onclick=function(){mk.closePopup();show((s.emoji||"📍")+" "+s.nom,g)};c.appendChild(go);
      mk.bindPopup(c,{className:"dpop",maxWidth:260,autoPanPadding:[20,20]});
      // À la souris : la fiche s'ouvre au survol et reste ouverte tant qu'on est sur le point ou sur la fiche
      var tm=null;function keep(){clearTimeout(tm)}function leave(){tm=setTimeout(function(){mk.closePopup()},350)}
      if(HOVER){mk.on("mouseover",function(){keep();mk.openPopup()});mk.on("mouseout",leave)}
      mk.on("popupopen",function(){var pe=mk.getPopup().getElement();if(pe&&!pe.__h){pe.__h=1;pe.addEventListener("mouseenter",keep);pe.addEventListener("mouseleave",leave)}});
    });
    // Cadrer sur mes lieux (sans trop zoomer s'il n'y en a qu'un)
    var pts=SP.lieux.map(function(s){return s.gps});
    if(!framed&&pts.length>1){framed=true;map.fitBounds(L.latLngBounds(pts).pad(.15),{maxZoom:14})}
  }
  function hide(){$("d-vids").hidden=true;$("d-vids").innerHTML=""}
  // Un lecteur par vidéo, limité à l'extrait choisi
  function card(s){
    var c=el("div","dv"),v=vidOf(s),a=secs(s.debut),z=secs(s.fin);
    var w=el("div","dv-vid");
    if(v&&v.src){
      var vd=document.createElement("video");vd.src=v.src;if(v.poster)vd.poster=v.poster;vd.controls=true;vd.playsInline=true;vd.preload="metadata";
      vd.setAttribute("aria-label","Vidéo : "+s.nom);
      var again=el("button","dv-again","↻ Revoir l’extrait");again.type="button";again.hidden=true;
      vd.addEventListener("loadedmetadata",function(){if(a)vd.currentTime=a});
      vd.addEventListener("timeupdate",function(){if(z&&vd.currentTime>=z){vd.pause();again.hidden=false}});
      vd.addEventListener("play",function(){
        again.hidden=true;
        if((z&&vd.currentTime>=z)||(a&&vd.currentTime<a-.5))vd.currentTime=a||0;
        Array.prototype.forEach.call(document.querySelectorAll("#d-vids video,#tt video"),function(o){if(o!==vd)o.pause()});
      });
      again.onclick=function(){vd.currentTime=a||0;vd.play()};
      w.appendChild(vd);w.appendChild(again);
    }else if(v&&v.link){
      // Musique protégée : Instagram ne donne pas le fichier, on intègre son lecteur officiel (pas d'extrait possible)
      var f=document.createElement("iframe");f.className="dv-embed";f.src=v.link.split("?")[0].replace(/\/?$/,"/")+"embed/";
      f.title="Vidéo Instagram : "+s.nom;f.loading="lazy";f.allow="encrypted-media; fullscreen";f.allowFullscreen=true;w.appendChild(f);
    }else w.appendChild(el("p","dv-none",window.IGV===null?"Chargement de la vidéo…":"Vidéo introuvable sur le compte Instagram."));
    c.appendChild(w);
    var t=el("div","dv-txt");
    t.appendChild(el("span","dv-cat",emo(s.categorie)+" "+((SP.categories[s.categorie]||{}).nom||"")));
    t.appendChild(el("b","",(s.emoji?s.emoji+" ":"")+s.nom));
    t.appendChild(el("span","dv-adr",s.adresse));
    if(s.description)t.appendChild(el("p","",s.description));
    if((a!=null||z!=null)&&v&&v.src)t.appendChild(el("span","dv-ext","Extrait "+fmt(a||0)+(z?" → "+fmt(z):"")));
    if(v&&v.link){var l=el("a","dv-ig","Voir sur Instagram");l.href=v.link;l.target="_blank";l.rel="noopener";t.appendChild(l)}
    c.appendChild(t);
    return c;
  }
  function fmt(x){return Math.floor(x/60)+":"+("0"+Math.floor(x%60)).slice(-2)}
  var cur=null;
  function show(title,list){
    cur=[title,list];
    var p=$("d-vids");p.innerHTML="";p.hidden=false;
    var h=el("div","dv-head");h.appendChild(el("b","",title+" · "+list.length+" vidéo"+(list.length>1?"s":"")));
    var x=el("button","dv-x","×");x.type="button";x.setAttribute("aria-label","Fermer");x.onclick=function(){cur=null;hide()};h.appendChild(x);p.appendChild(h);
    var row=el("div","dv-row");list.forEach(function(s){row.appendChild(card(s))});p.appendChild(row);
    p.scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  // Quand la liste Instagram arrive, on met à jour les vidéos affichées
  window.spotsRefresh=function(){if(cur)show(cur[0],cur[1])};
  window.spotsInit=function(m){map=m;draw()};
})();


// Découvre ! : 5 vidéos au hasard. D'abord les Reels Instagram (automatique, via /api/insta),
// sinon la liste TikTok de l'admin, sinon le widget officiel TikTok.
(function(){
  var shown=null,igShown=null;
  window.IGV=null;
  fetch("/api/insta").then(function(r){return r.ok?r.json():null}).then(function(j){window.IGV=(j&&j.videos)||[];ttRender();if(window.spotsRefresh)spotsRefresh();if(window.apRender)apRender()}).catch(function(){window.IGV=[];ttRender()});
  function igRender(box){
    if(!igShown)igShown=shuffle(IGV.filter(function(v){return v.src})).slice(0,5);
    if(box.dataset.mode==="ig")return;
    box.dataset.mode="ig";box.className="vids";box.innerHTML="";
    igShown.forEach(function(v){
      var w=el("div","tt ig"),vd=document.createElement("video");
      vd.src=v.src;if(v.poster)vd.poster=v.poster;vd.controls=true;vd.playsInline=true;vd.preload="none";
      vd.setAttribute("aria-label",v.caption||"Vidéo de @decouvronsparis1");
      // Une seule vidéo à la fois
      vd.addEventListener("play",function(){Array.prototype.forEach.call(box.querySelectorAll("video"),function(o){if(o!==vd)o.pause()})});
      w.appendChild(vd);
      if(v.link){var a=el("a","ig-link","Voir sur Instagram");a.href=v.link;a.target="_blank";a.rel="noopener";w.appendChild(a)}
      box.appendChild(w);
    });
  }
  window.ttRender=function(){
    var box=$("tt");if(!box)return;
    if(window.IGV===null){if(!box.dataset.mode){box.dataset.mode="wait";box.className="vids";box.innerHTML="";box.appendChild(el("p","lbn","Chargement des vidéos…"))}return}
    if(IGV.some(function(v){return v.src})){igRender(box);return}
    var all=(window.VDB||[]).filter(function(v){return v.on!==false&&/^\d{8,25}$/.test(v.vid||"")});
    var ids=all.map(function(v){return v.vid});
    // On garde le même tirage tant que la liste ne change pas
    if(!shown||shown.some(function(i){return ids.indexOf(i)<0})||(shown.length<5&&ids.length>shown.length))shown=shuffle(ids).slice(0,5);
    // Aucune vidéo choisie dans l'admin : widget officiel TikTok avec les dernières vidéos du compte
    if(!shown.length){
      if(box.dataset.mode==="widget")return;
      box.dataset.mode="widget";box.innerHTML="";box.className="tt-creator";
      var q=document.createElement("blockquote");q.className="tiktok-embed";
      q.setAttribute("cite","https://www.tiktok.com/@decouvronsparis1");q.setAttribute("data-unique-id","decouvronsparis1");q.setAttribute("data-embed-type","creator");
      var sec=document.createElement("section"),a=el("a","","@decouvronsparis1 sur TikTok");
      a.href="https://www.tiktok.com/@decouvronsparis1?refer=creator_embed";a.target="_blank";a.rel="noopener";
      sec.appendChild(a);q.appendChild(sec);box.appendChild(q);
      var old=document.getElementById("tt-js");if(old)old.remove();
      var sc=document.createElement("script");sc.id="tt-js";sc.async=true;sc.src="https://www.tiktok.com/embed.js";document.body.appendChild(sc);
      return;
    }
    box.dataset.mode="tiktok";box.className="vids";box.innerHTML="";
    shown.forEach(function(id){
      var v=all.filter(function(x){return x.vid===id})[0],w=el("div","tt"),f=document.createElement("iframe");
      f.src="https://www.tiktok.com/player/v1/"+id+"?music_info=0&description=0&rel=0";
      f.title=(v&&v.t)||"Vidéo TikTok de @decouvronsparis1";f.loading="lazy";
      f.allow="encrypted-media; fullscreen; picture-in-picture";f.allowFullscreen=true;
      w.appendChild(f);box.appendChild(w);
    });
  };
  ttRender();
})();
