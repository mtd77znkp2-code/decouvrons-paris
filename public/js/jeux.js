// Les trois jeux. Les données de départ (js/donnees.js) ne sont chargées que si la base est vide.
function withBank(btn,msg,next){
  btn.disabled=true;
  loadScript("js/donnees.js").then(function(){btn.disabled=false;next()}).catch(function(){btn.disabled=false;msg.textContent="Jeu indisponible pour le moment."});
}

// 1) Devine où c'est : retrouver sur la carte où a été prise la photo. 3 niveaux, option banlieue, 10 manches.
// Seuls les lieux validés dans l'admin (position vérifiée + photo) sont joués.
(function(){
  var LV={facile:"Facile",moyen:"Moyen",difficile:"Difficile"},N=10;
  var lvl="facile",ban=false,playing=false;
  function key(){return "loc_"+lvl+(ban?"_b":"")}
  function keep(x){return x.on!==false&&x.ok===true&&x.ph&&x.level===lvl&&(x.zone==="paris"||(ban&&x.zone==="banlieue"))&&isFinite(x.lat)&&isFinite(x.lng)}
  function pool(){return (window.LDB||[]).filter(keep)}
  lbBoard("lb-loc",key,function(){return "🏆 Classement général · Où c’est "+LV[lvl]+(ban?" + banlieue":"")});
  var order,photos,round,pts,wait,cur,guess,map,layer,btn=$("l-btn"),msg=$("l-msg"),lv=$("l-lvls"),bx=$("l-ban"),ph=$("l-photo");
  var DEF=msg.textContent;
  function lock(on){Array.prototype.forEach.call(lv.children,function(b){b.disabled=on});bx.disabled=on}
  function mode(){
    if(!map)return;
    map.setMaxBounds(ban?BOUNDS.b:BOUNDS.p);map.setMinZoom(ban?8:11);
    layer.clearLayers();parisHome(map,true,ban);
  }
  Array.prototype.forEach.call(lv.children,function(b){
    b.onclick=function(){if(playing)return;lvl=b.dataset.l;Array.prototype.forEach.call(lv.children,function(x){x.classList.toggle("on",x===b)});lbRender()};
  });
  bx.onchange=function(){if(playing)return;ban=bx.checked;mode();lbRender()};
  function setup(){
    if(map)return true;
    if(!window.L){$("l-map").textContent="La carte n’a pas pu se charger. Vérifie ta connexion et recharge la page.";return false}
    map=parisMap($("l-map"));layer=L.layerGroup().addTo(map);
    map.on("click",function(e){
      if(!wait)return;
      guess=e.latlng;layer.clearLayers();geoDot(guess,"#ff5a5f").addTo(layer);
      btn.hidden=false;btn.textContent="Valider";btn.dataset.m="ok";
      msg.textContent="Manche "+(round+1)+"/"+N+" : tu peux encore déplacer ton point, puis valide.";
    });
    return true;
  }
  setup();
  window.locStop=function(){
    if(!playing&&btn.dataset.m!=="load")return;
    playing=false;wait=false;lock(false);ph.hidden=true;if(layer)layer.clearLayers();
    btn.hidden=false;btn.disabled=false;btn.textContent="Jouer";btn.dataset.m="";msg.textContent=DEF;
  };
  function ask(){
    layer.clearLayers();cur=order[round];guess=null;wait=true;btn.hidden=true;
    ph.querySelector("img").src=imgSrc(photos[round]);ph.hidden=false;
    parisHome(map,true,ban);
    msg.textContent="Manche "+(round+1)+"/"+N+" : où a été prise cette photo ? Touche la carte.";
  }
  function check(){
    wait=false;
    // Avec la banlieue, les distances sont plus grandes : la note baisse moins vite
    var ans=L.latLng(cur.lat,cur.lng),d=geoDist(guess,ans),s=Math.max(0,Math.round(100-d/(ban?250:78)));
    pts+=s;
    L.polyline([guess,ans],{color:"#0e1740",weight:3,dashArray:"8 8"}).addTo(layer);
    geoDot(ans,"#f5b21a").addTo(layer).bindTooltip(cur.n,{permanent:true,direction:"top",offset:[0,-12],className:"geo-tip"});
    map.flyToBounds(L.latLngBounds([guess,ans]).pad(.4),{maxZoom:16,duration:.6});
    var t="C’était « "+cur.n+" » : +"+s+" points (à "+(d<1000?Math.round(d/10)*10+" m":(d/1000).toFixed(1).replace(".",",")+" km")+"). ";
    if(round===N-1){
      playing=false;lock(false);
      var b=rec(key(),pts);msg.textContent=t+"Fini ! Score : "+pts+"/"+N*100+" · Record : "+b;
      lbSubmit(key(),pts).then(function(x){msg.textContent+=" "+x});btn.textContent="Rejouer";btn.dataset.m="";
    }
    else{msg.textContent=t;btn.textContent="Manche suivante";btn.dataset.m="next"}
  }
  function start(){
    if(!LB.db){msg.textContent="Le jeu n’est pas disponible pour le moment. Réessaie un peu plus tard.";return}
    var p=pool();
    if(p.length<N){msg.textContent="Pas encore assez de lieux prêts pour ce niveau ("+p.length+"/"+N+"). Reviens bientôt !";return}
    order=shuffle(p).slice(0,N);round=0;pts=0;playing=true;lock(true);
    // Les photos sont rangées à part pour ne pas alourdir le site : on charge les 10 de la partie
    btn.dataset.m="load";btn.disabled=true;btn.textContent="Chargement…";msg.textContent="Chargement des photos…";
    Promise.all(order.map(function(x){return LB.db.doc("photos/"+x.id).get().then(function(s){return s.exists?s.data().img:null})})).then(function(r){
      if(btn.dataset.m!=="load")return;
      btn.disabled=false;
      var keepIdx=r.map(function(v,i){return v?i:-1}).filter(function(i){return i>=0});
      if(keepIdx.length<N){playing=false;lock(false);btn.dataset.m="";btn.textContent="Jouer";msg.textContent="Certaines photos manquent pour ce niveau. Reviens bientôt !";return}
      photos=r;ask();
    }).catch(function(){
      playing=false;lock(false);btn.disabled=false;btn.dataset.m="";btn.textContent="Jouer";msg.textContent="Impossible de charger les photos. Vérifie ta connexion et réessaie.";
    });
  }
  btn.onclick=function(){
    if(!setup())return;
    if(btn.dataset.m==="load")return;
    if(btn.dataset.m==="ok"){if(guess)check();return}
    if(btn.dataset.m==="next"){round++;ask();return}
    start();
  };
})();

// 2) Quiz sur Paris : 3 niveaux, 10 questions, 20 s par question, 5 s entre deux
(function(){
  function pool(){
    var d=(window.QDB||[]).filter(function(x){return x.level===lvl&&x.on!==false&&x.q&&x.o&&x.o.length===4});
    if(d.length>=4)return d.map(function(x){return [x.q,x.a,x.o,x.img||null]});
    return (window.quizBank||{})[lvl]||[];
  }
  var LV={facile:"Facile",moyen:"Moyen",difficile:"Difficile"};
  var lvl="facile",list,i,sc,tmr=null,brk=null,playing=false,answered=false,end=0,q;
  var box=$("q-box"),btn=$("q-btn"),msg=$("q-msg"),bar=$("q-time"),arc=$("q-arc"),sec=$("q-sec"),lv=$("q-lvls");
  var DEF="10 questions, 20 secondes chacune, 3 secondes entre deux.";
  lbBoard("lb-quiz",function(){return "quiz_"+lvl},function(){return "🏆 Classement général · Quiz "+LV[lvl]});
  function lock(on){Array.prototype.forEach.call(lv.children,function(b){b.disabled=on})}
  function stop(){clearInterval(tmr);clearTimeout(brk);playing=false;bar.hidden=true;lock(false);box.innerHTML="";btn.hidden=false;btn.textContent="Jouer";msg.textContent=DEF}
  window.quizStop=stop;
  Array.prototype.forEach.call(lv.children,function(b){
    b.onclick=function(){if(playing)return;lvl=b.dataset.l;Array.prototype.forEach.call(lv.children,function(x){x.classList.toggle("on",x===b)});lbRender()};
  });
  function show(){
    q=list[i];answered=false;box.innerHTML="";
    msg.textContent="Question "+(i+1)+"/"+list.length+" · Score : "+sc;
    box.appendChild(el("p","qq",q[0]));
    if(q[3]){var qi=el("img","qimg");qi.alt="";qi.src=imgSrc(q[3]);box.appendChild(qi)}
    var g=el("div","opts");
    shuffle(q[2]).forEach(function(o){var b=el("button","opt",o);b.onclick=function(){answer(o,b)};g.appendChild(b)});
    box.appendChild(g);box.appendChild(el("p","qnote",""));
    end=Date.now()+20000;bar.hidden=false;tick();
    clearInterval(tmr);tmr=setInterval(tick,100);
  }
  function tick(){
    var left=Math.max(0,end-Date.now());
    arc.style.strokeDashoffset=339.29*(1-left/20000);arc.classList.toggle("low",left<=5000);sec.textContent=Math.ceil(left/1000);
    if(left<=0)answer(null);
  }
  function next(){clearTimeout(brk);if(i===list.length-1)finish();else{i++;show()}}
  function answer(o,b){
    if(answered)return;answered=true;clearInterval(tmr);bar.hidden=true;
    var left=Math.max(0,end-Date.now()),g=box.querySelector(".opts"),note=box.querySelector(".qnote");
    Array.prototype.forEach.call(g.children,function(c){c.disabled=true;if(c.textContent===q[1])c.classList.add("good")});
    var t;
    if(o===q[1]){var p=100+Math.round(left/1000*5);sc+=p;t="Bonne réponse ! +"+p+" points."}
    else{if(b)b.classList.add("bad");t=o===null?"Temps écoulé. ":"Raté. ";t+="La réponse : "+q[1]+"."}
    msg.textContent="Question "+(i+1)+"/"+list.length+" · Score : "+sc;
    var sk=el("button","btn skip",i===list.length-1?"Voir le résultat":"Question suivante");sk.onclick=next;box.appendChild(sk);
    (function pause(n){
      note.textContent=t+" "+(i===list.length-1?"Résultat":"Suite")+" dans "+n+" s";
      if(n===0){next();return}
      brk=setTimeout(function(){pause(n-1)},1000);
    })(3);
  }
  function finish(){
    playing=false;lock(false);bar.hidden=true;box.innerHTML="";
    var r=rec("quiz_"+lvl,sc);
    msg.textContent="Fini ! Quiz "+LV[lvl]+" : "+sc+" / "+list.length*200+" · Ton record : "+r;
    var n=el("p","qq","");n.id="q-end";box.appendChild(n);
    btn.hidden=false;btn.textContent="Rejouer";
    lbSubmit("quiz_"+lvl,sc).then(function(x){n.textContent=x});
  }
  btn.onclick=function(){
    // Base vide ou indisponible : on charge les questions de départ
    if(!pool().length){withBank(btn,msg,btn.onclick);return}
    list=shuffle(pool()).slice(0,10);i=0;sc=0;playing=true;lock(true);btn.hidden=true;show();
  };
})();

// 3) Devine le prix : 3 niveaux, 10 objets, 20 s, 3 s entre deux
(function(){
  var LV={facile:"Facile",moyen:"Moyen",difficile:"Difficile"};
  var lvl="facile",list,i,sc,tmr=null,brk=null,playing=false,answered=false,end=0,it;
  var box=$("p-box"),btn=$("p-btn"),msg=$("p-msg"),lv=$("p-lvls"),holder=$("p-ring");
  var ring=$("q-time").cloneNode(true);ring.removeAttribute("id");ring.hidden=false;
  Array.prototype.forEach.call(ring.querySelectorAll("[id]"),function(e){e.removeAttribute("id")});
  holder.appendChild(ring);
  var arc=ring.querySelector(".arc"),sec=ring.querySelector(".rsec");
  var DEF="10 objets, 20 secondes chacun, 3 secondes entre deux. Prix moyens approximatifs.";
  lbBoard("lb-prix",function(){return "prix_"+lvl},function(){return "🏆 Classement général · Prix "+LV[lvl]});
  function fmt(n){return (n%1?n.toFixed(2).replace(".",","):String(n))+" €"}
  function pool(){
    var d=(window.PDB||[]).filter(function(x){return x.level===lvl&&x.on!==false&&x.t&&x.p>0});
    if(d.length>=4)return d.map(function(x){return [x.t,x.p,x.img||null]});
    return (window.priceBank||{})[lvl]||[];
  }
  function lock(on){Array.prototype.forEach.call(lv.children,function(b){b.disabled=on})}
  function stop(){clearInterval(tmr);clearTimeout(brk);playing=false;holder.hidden=true;lock(false);box.innerHTML="";btn.hidden=false;btn.textContent="Jouer";msg.textContent=DEF}
  window.prixStop=stop;
  Array.prototype.forEach.call(lv.children,function(b){
    b.onclick=function(){if(playing)return;lvl=b.dataset.l;Array.prototype.forEach.call(lv.children,function(x){x.classList.toggle("on",x===b)});lbRender()};
  });
  function show(){
    it=list[i];answered=false;box.innerHTML="";
    msg.textContent="Objet "+(i+1)+"/"+list.length+" · Score : "+sc;
    box.appendChild(el("p","qq","Combien coûte environ : "+it[0]+" ?"));
    if(it[2]){var im=el("img","qimg");im.alt="";im.src=imgSrc(it[2]);box.appendChild(im)}
    var f=el("form","pform"),inp=el("input");inp.type="text";inp.inputMode="decimal";inp.required=true;inp.autocomplete="off";inp.setAttribute("aria-label","Ton prix en euros");inp.placeholder="Ton prix en €";
    var ok=el("button","btn","Valider");ok.type="submit";f.appendChild(inp);f.appendChild(ok);box.appendChild(f);box.appendChild(el("p","qnote",""));
    f.onsubmit=function(e){e.preventDefault();var g=parseFloat(inp.value.replace(",","."));if(isNaN(g)||g<0)return;answer(g)};
    box.__inp=inp;
    end=Date.now()+20000;holder.hidden=false;tick();
    clearInterval(tmr);tmr=setInterval(tick,100);
    try{inp.focus()}catch(x){}
  }
  function tick(){
    var left=Math.max(0,end-Date.now());
    arc.style.strokeDashoffset=339.29*(1-left/20000);arc.classList.toggle("low",left<=5000);sec.textContent=Math.ceil(left/1000);
    if(left<=0){var v=box.__inp?parseFloat(String(box.__inp.value).replace(",",".")):NaN;answer(isNaN(v)?null:v)}
  }
  function next(){clearTimeout(brk);if(i===list.length-1)finish();else{i++;show()}}
  function answer(g){
    if(answered)return;answered=true;clearInterval(tmr);holder.hidden=true;
    var left=Math.max(0,end-Date.now()),note=box.querySelector(".qnote"),inp=box.__inp;
    if(inp)inp.disabled=true;
    var f=box.querySelector("form");if(f)f.querySelector("button").hidden=true;
    var t;
    if(g===null){t="Temps écoulé. Prix : environ "+fmt(it[1])+"."}
    else{
      var acc=Math.max(0,Math.round(100-Math.abs(g-it[1])/it[1]*100));
      var p=acc+Math.round(acc/100*left/1000*5);sc+=p;
      t="Ta réponse : "+fmt(g)+" · Prix : environ "+fmt(it[1])+" · +"+p+" points.";
    }
    msg.textContent="Objet "+(i+1)+"/"+list.length+" · Score : "+sc;
    var sk=el("button","btn skip",i===list.length-1?"Voir le résultat":"Objet suivant");sk.onclick=next;box.appendChild(sk);
    (function pause(n){
      note.textContent=t+" "+(i===list.length-1?"Résultat":"Suite")+" dans "+n+" s";
      if(n===0){next();return}
      brk=setTimeout(function(){pause(n-1)},1000);
    })(3);
  }
  function finish(){
    playing=false;lock(false);holder.hidden=true;box.innerHTML="";
    var r=rec("prix_"+lvl,sc);
    msg.textContent="Fini ! Prix "+LV[lvl]+" : "+sc+" / "+list.length*200+" · Ton record : "+r;
    var n=el("p","qq","");box.appendChild(n);
    btn.hidden=false;btn.textContent="Rejouer";
    lbSubmit("prix_"+lvl,sc).then(function(x){n.textContent=x});
  }
  btn.onclick=function(){
    // Base vide ou indisponible : on charge les questions de départ
    if(!pool().length){withBank(btn,msg,btn.onclick);return}
    list=shuffle(pool()).slice(0,10);i=0;sc=0;playing=true;lock(true);btn.hidden=true;show();
  };
  holder.hidden=true;
})();
