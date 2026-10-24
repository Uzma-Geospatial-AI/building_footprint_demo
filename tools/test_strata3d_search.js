const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.join(__dirname,'..');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'strata3d',n),'utf8'));
const cat=read('catalog.json'),fc=read('buildings.geojson'),places=read('places.json');
const source=fs.readFileSync(path.join(root,'mpk-strata3d.js'),'utf8');
const snippet=source.slice(source.indexOf('const s3dNorm ='),source.indexOf('// Nominatim (OpenStreetMap)'));
const ctx=vm.createContext({S3D:{cat,fc},S3D_KEMAMAN:[],MPK:{},MPK_AREAS:{},STRATA:{},fmt:String,
 dpArea:id=>cat.areas.find(a=>a.id===id),s3dRegion:a=>a?.region||'Damansara',places});
vm.runInContext(snippet+'\nSR.places=places.map(p=>({...p,t:s3dNorm(p.n+" "+p.k+" "+(p.a||""))}));',ctx);
for(const [q,host] of [['Alquiler','reference/base3-retail'],['Alquiler bike rental','reference/base3-retail'],['Vainpod','reference/reflection-podium'],['Damansara Street Food Court','way/745554991']]){
 const results=vm.runInContext(`s3dLocalSearch(${JSON.stringify(q)})`,ctx);
 const expected=fc.features.find(f=>f.properties.src_id===host).properties.id;
 assert(results.some(r=>r.go.dp===expected),q+' opens actual modeled host, not only a map marker');
 const reviewed=results.find(r=>r.go.dp===expected&&r.kind!=='Building');assert(reviewed&&!reviewed.sub.includes('OpenStreetMap'),'Reviewed tenant provenance not mislabeled as OSM');
}
for(const q of ["D'Vine","D'Vervain",'Lung Mu'])assert(vm.runInContext(`s3dLocalSearch(${JSON.stringify(q)})`,ctx).some(r=>r.go.dp),q+' finds restored model');
assert(source.includes('strata3dToggleModels'),'Preserve latest model visibility switch');
console.log('PASS: restored buildings searchable; reviewed tenants open their real model hosts; latest model toggle retained.');
