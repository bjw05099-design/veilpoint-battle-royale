'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function render(){
 const layout=JSON.parse(fs.readFileSync(path.join(root,'scripts/ch01-last-broadcast-layout.json'),'utf8'));
 const arrays={Stations:layout.stationsCm,...layout.convoy,ReceptionStand:[layout.receptionStandCm]};
 let text='#pragma once\n// Generated from scripts/ch01-last-broadcast-layout.json. Run generate-ch01-native-paths.cjs.\nnamespace VPLastBroadcastPaths\n{\nstruct Point { float X,Y,Z; };\n';
 for(const [name,points]of Object.entries(arrays)){
  if(!/^[A-Za-z]+$/.test(name)||!points.length)throw Error('Invalid path');
  text+='inline constexpr Point '+name+'[]={\n';
  for(const p of points){if(p.length!==3||!p.every(Number.isFinite))throw Error('Invalid path coordinate');text+='    {'+p.map(n=>n.toFixed(1)+'f').join(',')+'},\n';}
  text+='};\n';
 }
 return text+'}\n';
}
const target=path.join(root,'Unreal/Veilpoint/Source/Veilpoint/VPLastBroadcastPaths.h');
if(require.main===module){const text=render();if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==text)throw Error('Native paths drifted from authored layout');}else fs.writeFileSync(target,text);}
module.exports={render};
