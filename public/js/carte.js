// Vraie carte de Paris (Leaflet)
// Cadre de départ : le centre de Paris (ou Paris et sa proche banlieue)
var PARIS=[[48.834,2.282],[48.889,2.398]],IDF=[[48.68,2.05],[49.02,2.66]];
var BOUNDS={p:[[48.74,2.1],[48.98,2.6]],b:[[48.1,1.3],[49.45,3.4]]};
// Vue de départ : tout le cadre si l'écran est large, sinon zoom minimum (téléphone)
function parisHome(m,fly,wide){
  var c=wide?[48.85,2.35]:[48.8615,2.34],z=Math.max(wide?10:12.5,m.getBoundsZoom(wide?IDF:PARIS));
  if(fly)m.flyTo(c,z,{duration:.6});else m.setView(c,z);
}
function parisMap(box,wide,named){
  var m=L.map(box,{minZoom:wide?8:11,maxZoom:18,maxBounds:wide?BOUNDS.b:BOUNDS.p,maxBoundsViscosity:.8,zoomSnap:.5});
  // Fonds Esri sans clé. Pour les jeux : sans noms de lieux (pour ne pas donner la réponse).
  // Pour « Découvre ! » (named) : plan avec les noms de rues.
  var E="https://server.arcgisonline.com/ArcGIS/rest/services/";
  var sat=L.tileLayer(E+"World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Images © Esri, Maxar, Earthstar Geographics"});
  var plan=named?L.tileLayer(E+"World_Street_Map/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Plan © Esri, HERE, OpenStreetMap"})
    :L.tileLayer(E+"Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,maxNativeZoom:16,attribution:"Plan © Esri, HERE, OpenStreetMap"});
  (named?plan:sat).addTo(m);
  L.control.layers(named?{"Plan":plan,"Satellite":sat}:{"Satellite":sat,"Plan":plan},null,{collapsed:false,position:"topright"}).addTo(m);
  parisHome(m,false,wide);
  if(window.ResizeObserver)new ResizeObserver(function(){m.invalidateSize()}).observe(box);
  return m;
}
function geoDot(ll,c){return L.circleMarker(ll,{radius:11,color:"#fff",weight:4,fillColor:c,fillOpacity:1})}
function geoDist(a,b){
  var R=6371000,r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lng-a.lng)*r;
  var h=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)*Math.sin(dn/2);
  return 2*R*Math.asin(Math.sqrt(h));
}
