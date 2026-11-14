'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
function probe(command,args){
 const r=cp.spawnSync(command,args,{encoding:'utf8',timeout:20000,windowsHide:true});
 return {available:!r.error&&r.status===0,exitCode:r.status,
  detail:r.error?r.error.code:(r.stdout||r.stderr||'').trim().split(/\r?\n/)[0].slice(0,600)};
}
function inspect(toolRoot=process.env.VEILPOINT_TOOL_ROOT||path.join(root,'.tools'),desktop=false){
 const pathsFile=path.join(toolRoot,'paths.json');
 const installed=fs.existsSync(pathsFile)?JSON.parse(fs.readFileSync(pathsFile,'utf8')):{};
 const tools={node:probe(process.execPath,['--version']),git:probe('git',['--version']),
  gitLfs:probe('git',['lfs','version']),ffmpeg:probe('ffmpeg',['-version']),
  blender:probe(installed.blender||'blender',['--version']),
  agentDesktop:probe(installed['agent-desktop']||'agent-desktop',['version'])};
 let assets=false;try{require.resolve('../tools/game-dev/node_modules/gltf-validator');assets=true;}catch{}
 tools.assetPackages={available:assets};
 const report={schema:'veilpoint-game-dev-doctor-v1',platform:process.platform,
  scope:'current-host-only',remotePcConnected:false,nativeUnrealBuilt:false,tools};
 if(desktop)report.desktopStatus=probe(installed['agent-desktop']||'agent-desktop',['status']);
 return report;
}
if(require.main===module){
 const args=process.argv.slice(2),report=inspect(undefined,args.includes('--desktop'));
 const oi=args.indexOf('--output');
 if(oi>=0){if(!args[oi+1])throw Error('Output path missing');fs.mkdirSync(path.dirname(args[oi+1]),{recursive:true});fs.writeFileSync(args[oi+1],JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report,null,2));
 if(args.includes('--strict-assets')&&['blender','agentDesktop','assetPackages'].some(k=>!report.tools[k].available))process.exitCode=1;
}
module.exports={inspect,probe};
