'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const layout=require('../scripts/ch01-last-broadcast-layout.json');
const court=require('../scripts/ch01-original-public-court.json');
test('native path header exactly follows the authored map source',()=>{
 assert.equal(fs.readFileSync(path.join(root,'Unreal/Veilpoint/Source/Veilpoint/VPLastBroadcastPaths.h'),'utf8').replaceAll('\r\n','\n'),require('../scripts/generate-ch01-native-paths.cjs').render());
 assert.equal(layout.stationsCm.length,11);assert.equal(layout.actualAdenCoverageVerified,false);
});
test('both physical escort paths leave capsule clearance against all new and existing court geometry',()=>{
 const solid=layout.pieces.filter(p=>p.solid).map(p=>({name:p.name,c:p.centreCm,s:p.sizeCm}));
 for(const p of court.pieces.filter(p=>p.solid))solid.push({name:p.id,c:[p.xCm,p.yCm,p.zCm],s:[p.widthCm,p.depthCm,p.heightCm]});
 // Include the real table stations: arrival points must not be inside their collider.
 for(const [i,p]of layout.stationsCm.entries())if(i!==10)solid.push({name:'station'+i,c:[p[0],p[1],50],s:[82,76,110]});
 for(const [name,start]of [['Workshop',[6100,-3800,83]],['South',layout.convoy.Workshop.at(-1)],['East',layout.convoy.Workshop.at(-1)],['BoardSouth',layout.convoy.South.at(-1)],['BoardEast',layout.convoy.East.at(-1)],['Reception',layout.convoy.BoardSouth.at(-1)]]){
  const points=[start,...layout.convoy[name]];
  for(let j=1;j<points.length;j++)for(let n=0;n<=200;n++)for(const offset of [-85,0,85]){
   const x=points[j-1][0]+(points[j][0]-points[j-1][0])*n/200;
   const y=points[j-1][1]+(points[j][1]-points[j-1][1])*n/200+offset;
   for(const p of solid){if(p.c[2]-p.s[2]/2>=180)continue;
    const distance=Math.hypot(Math.max(0,Math.abs(x-p.c[0])-p.s[0]/2),Math.max(0,Math.abs(y-p.c[1])-p.s[1]/2));
    assert.ok(distance>29,`${name} segment ${j} intersects ${p.name} at ${x},${y}`);
   }
  }
 }
});
test('radio desk remains outside the four-metre hall doorway and previous cargo geometry',()=>{
 const [x,y,z]=layout.radioOriginCm;assert.equal(z,-5);
 assert.ok(x-60>11200 && x+60<11750);assert.ok(y-32.5> -7150 && y+32.5< -6500);
 assert.deepEqual(layout.radioInteractCm,layout.stationsCm.at(-1));
});
test('shelter waiting bay is within F reach and clear of all three reception lanes',()=>{
 const [x,y,z]=layout.receptionStandCm;
 const desk=layout.stationsCm[8];
 assert.ok(Math.hypot(x-desk[0],y-desk[1],z-desk[2])<275);
 const bay=layout.pieces.find(part=>part.name==='ShelterReceptionStandingBay');
 assert.deepEqual(bay.centreCm.slice(0,2),[x,y]);
 assert.equal(bay.solid,false);
 const points=[layout.convoy.BoardSouth.at(-1),...layout.convoy.Reception];
 for(let i=1;i<points.length;i++)for(const offset of [-85,0,85]){
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1]-offset)*dy)/(dx*dx+dy*dy)));
  const distance=Math.hypot(x-(a[0]+t*dx),y-(a[1]+offset+t*dy));
  assert.ok(distance>110,'wait position overlaps a swept escort lane');
 }
});
