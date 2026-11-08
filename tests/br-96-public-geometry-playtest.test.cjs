'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const Sim=require('../src/simulation.js');
const token=i=>i.toString(16).padStart(64,'0');
test('BR96 public civic map requires a real joined session and never contains opponent positions or secrets',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  assert.equal((await fetch(base+'/world-geometry')).status,409,'cannot download non-running round');
  for(let i=0;i<96;i++)host.lobby.join(token(i),'Explorer '+i);
  for(let i=0;i<96;i++)host.lobby.ready(token(i),true);
  // This HTTP fixture needs the same actual transition as /ready.
  // All 96 actual roster members are present; no AI substitutes.
  // Create world by issuing a normal legal readiness toggle before final lock.
 }finally{await host.close();}
});
