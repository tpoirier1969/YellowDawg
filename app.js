
const map = L.map('map').setView([46.75, -87.85], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
 maxZoom: 19
}).addTo(map);

const todLayer = new L.FeatureGroup().addTo(map);
const curtLayer = new L.FeatureGroup().addTo(map);
const steveLayer = new L.FeatureGroup().addTo(map);

const layers = {
  Tod: todLayer,
  Curt: curtLayer,
  Steve: steveLayer
};

const drawControl = new L.Control.Draw({
 edit: {
   featureGroup: todLayer
 },
 draw:{
   polygon:true,
   polyline:true,
   rectangle:true,
   marker:true,
   circle:false
 }
});

map.addControl(drawControl);

let currentUser = localStorage.getItem("yd_user") || "Tod";
document.getElementById("userSelect").value = currentUser;

document.getElementById("userSelect").addEventListener("change", e=>{
 currentUser = e.target.value;
 localStorage.setItem("yd_user", currentUser);
});

map.on(L.Draw.Event.CREATED, function(e){

 const layer = e.layer;

 const note = prompt("Note:");
 if(note){
   layer.bindPopup(note);
 }

 layers[currentUser].addLayer(layer);

 saveLocal();
});

function saveLocal(){

 const data = {
   Tod: todLayer.toGeoJSON(),
   Curt: curtLayer.toGeoJSON(),
   Steve: steveLayer.toGeoJSON()
 };

 localStorage.setItem("yd_data", JSON.stringify(data));
}

function loadLocal(){

 const raw = localStorage.getItem("yd_data");
 if(!raw) return;

 const data = JSON.parse(raw);

 addGeo(data.Tod, todLayer);
 addGeo(data.Curt, curtLayer);
 addGeo(data.Steve, steveLayer);
}

function addGeo(geo, layer){

 if(!geo) return;

 L.geoJSON(geo,{
   onEachFeature:(f,l)=>{
     if(f.properties && f.properties.popup){
       l.bindPopup(f.properties.popup);
     }
     layer.addLayer(l);
   }
 });
}

loadLocal();

document.getElementById("saveBtn").onclick = ()=>{

 const data = localStorage.getItem("yd_data") || "{}";
 const blob = new Blob([data],{type:"application/json"});
 const a = document.createElement("a");
 a.href = URL.createObjectURL(blob);
 a.download = "yellow_dog_notes.json";
 a.click();
};

document.getElementById("loadBtn").onclick = ()=>{
 document.getElementById("fileInput").click();
};

document.getElementById("fileInput").onchange = e=>{

 const file = e.target.files[0];
 const reader = new FileReader();

 reader.onload = ev=>{

   localStorage.setItem("yd_data", ev.target.result);
   location.reload();
 };

 reader.readAsText(file);
};
