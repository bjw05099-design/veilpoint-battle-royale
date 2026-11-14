'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),toolRoot=process.env.VEILPOINT_TOOL_ROOT||path.join(root,'.tools');
const tools=JSON.parse(fs.readFileSync(path.join(toolRoot,'paths.json'),'utf8'));
const executable=path.join(path.dirname(tools.tracy),'tracy-import-chrome'+(process.platform==='win32'?'.exe':''));
const out=path.join(root,'dist/game-dev');fs.mkdirSync(out,{recursive:true});
const input=path.join(out,'synthetic-trace.json'),output=path.join(out,'synthetic.tracy');
fs.writeFileSync(input,JSON.stringify({traceEvents:[
 {ph:'M',name:'thread_name',pid:1,tid:1,args:{name:'VEILPOINT synthetic tool check'}},
 {ph:'X',name:'AssetPipelineFixture',pid:1,tid:1,ts:1000,dur:1500}
]}));
if(fs.existsSync(output))fs.unlinkSync(output);
const r=cp.spawnSync(executable,[input,output],{encoding:'utf8',timeout:30000,windowsHide:true});
assert.equal(r.status,0,r.error?.message||r.stderr);
assert.ok(fs.statSync(output).size>64,'Tracy must write an actual capture container');
const report={tracyChromeImportVerified:true,bytes:fs.statSync(output).size,syntheticTraceOnly:true,gameFrameProfileCaptured:false};
fs.writeFileSync(path.join(out,'tracy-smoke.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
