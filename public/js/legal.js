// Pages légales : remplit le nom, le directeur de la publication et l'e-mail saisis dans l'admin
// (Firestore « config/legal », lu sans charger Firebase grâce à l'API REST publique).
(function(){
  var url="https://firestore.googleapis.com/v1/projects/decouvrons-paris/databases/(default)/documents/config/legal?key=AIzaSyBhd_xCy7FMFmCpjWxHrHk-9Tqwk0rC_U4";
  fetch(url).then(function(r){return r.ok?r.json():null}).then(function(j){
    var f=j&&j.fields;if(!f)return;
    function v(k){var x=f[k];return x?(x.stringValue||x.integerValue||x.doubleValue||""):""}
    var d={nom:v("nom"),directeur:v("directeur")||v("nom"),email:v("email")};
    var m=+(v("maj"));if(m)d.maj=new Date(m).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"});
    Array.prototype.forEach.call(document.querySelectorAll("[data-l]"),function(s){
      var k=s.getAttribute("data-l");if(!d[k])return;
      s.classList.remove("todo");s.textContent="";
      if(k==="email"){var a=document.createElement("a");a.href="mailto:"+d.email;a.textContent=d.email;s.appendChild(a)}else s.textContent=d[k];
    });
  }).catch(function(){});
})();
