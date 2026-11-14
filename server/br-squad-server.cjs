'use strict';
// Local-only shared BR staging endpoint. Live 96-actor simulation and internet
// deployment are separate future milestones; do not expose this to WAN.
const http=require('node:http');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const {nearbyCivicSurfaces}=require('../src/br96-civic-proximity.cjs');
const {createFixedStepClock}=require('./team-server.cjs');
const {readJson}=require('./json-body.cjs');
const BR96_HTML=fs.readFileSync(path.resolve(__dirname,'../br96.html'));
const BR96_CLIENT=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'));
const BR96_AUDIO=fs.readFileSync(path.resolve(__dirname,'../src/br96-environment-audio.js'));
const AUDIO_PREFS=fs.readFileSync(path.resolve(__dirname,'../src/audio-preferences.js'));
const BR96_CAMERA=fs.readFileSync(path.resolve(__dirname,'../src/br96-map-camera.js'));
const BR96_STREET=fs.readFileSync(path.resolve(__dirname,'../src/br96-street-view.js'));
const BR96_SQUAD_PANEL=fs.readFileSync(path.resolve(__dirname,'../src/br96-squad-panel.js'));

function createBrSquadServer({host='127.0.0.1',port=0,bodyTimeoutMs=5000,autoTick=true}={}) {
 if(!['127.0.0.1','localhost','::1'].includes(host))throw new RangeError('loopback_host_required');
 const lobby=new BrSquadLobby();
 let world=null;
 let roundNumber=1;
 const replayConsent=new Set();
 const replayVotesFor=token=>({requested:replayConsent.size,required:96,
   own:replayConsent.has(token)});
 // One privately authenticated live stream per player. No broadcast of
 // global world state, other squads' presence, or raw session capabilities.
 // The existing 60Hz server remains authoritative; streaming only publishes
 // the SAME filtered world.snapshot(token) response as GET /world.
 const liveStreams=new Map();
 const publishSnapshot=(token,res)=>{
  // Each authenticated event owns BOTH its round generation and server tick.
  // A browser still viewing the previous round must not render a new-round
  // tick 0 as an old-world rewind while its slower /state poll is pending.
  // Metadata is public to that one session; bodies remain the existing
  // token-filtered world.snapshot(token), with no opponent secrets.
  const snapshot=world.snapshot(token);
  const frame='id: '+roundNumber+':'+snapshot.tick+'\n'+
    'event: world\ndata: '+JSON.stringify(snapshot)+'\n\n';
  if(!res.write(frame)){ // never accumulate unlimited buffered frames
   liveStreams.delete(token);res.end();
  }
 };
 const broadcastPrivateWorld=()=>{
  for(const [token,res] of liveStreams){
   try {publishSnapshot(token,res);}
   catch(_){liveStreams.delete(token);res.destroy();}
  }
 };
 const advanceWorld=()=>{
  if(!world)return;
  const beforeTick=world.tick,beforePhase=world.phase;
  world.step();
  // A genuine final outcome must reach all authenticated spectators once,
  // even when it happens between two 4Hz publications. A stopped clock
  // must never replay that terminal state sixty times per second.
  if(beforePhase==='moving'&&world.phase==='finished'&&
     (world.tick===beforeTick||world.tick%15!==0)){
   broadcastPrivateWorld();return;
  }
  if(world.tick===beforeTick||world.tick%15!==0)return;
  broadcastPrivateWorld();
 };
 const advance=createFixedStepClock(advanceWorld);
 let timer=null;
 const stateFor=token=>{
  const state=lobby.snapshot(token);
  return world?{...state,roundNumber,replay:world.phase==='finished'?replayVotesFor(token):null,
    world:world.snapshot(token)}:state;
 };
 const send=(res,code,body)=>{
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
   'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'});
  res.end(JSON.stringify(body));
 };
 const server=http.createServer(async(req,res)=>{
  try {
   const authority=String(req.headers.host||'');
   const own=server.address();
   if(!own||!/^(?:localhost|127\.0\.0\.1|\[::1\]):\d{1,5}$/.test(authority)||
      Number(authority.slice(authority.lastIndexOf(':')+1))!==own.port)
      return send(res,403,{error:'invalid_host'});
   if(req.headers.origin&&req.headers.origin!=='http://'+authority)
      return send(res,403,{error:'cross_origin'});
   const url=new URL(req.url,'http://localhost');
   if(url.search||url.hash)return send(res,400,{error:'unexpected_query'});
   // Serve only the two locally owned, hard-coded browser assets. The HTTP
   // world API stays bound to loopback; no path traversal or token in URL.
   if(req.method==='GET'&&(url.pathname==='/'||
      url.pathname==='/br96-client.js'||url.pathname==='/br96-environment-audio.js'||url.pathname==='/br96-map-camera.js'||url.pathname==='/br96-street-view.js'||url.pathname==='/br96-squad-panel.js'||url.pathname==='/audio-preferences.js')){
     const script=url.pathname!=='/';
     res.writeHead(200,{
       'Content-Type':script?'text/javascript; charset=utf-8':'text/html; charset=utf-8',
       'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
       'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
       'X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'
     });
     return res.end(!script?BR96_HTML:
       url.pathname==='/br96-client.js'?BR96_CLIENT:
       url.pathname==='/br96-map-camera.js'?BR96_CAMERA:
       url.pathname==='/br96-street-view.js'?BR96_STREET:
       url.pathname==='/br96-squad-panel.js'?BR96_SQUAD_PANEL:
       url.pathname==='/audio-preferences.js'?AUDIO_PREFS:BR96_AUDIO);
   }
   if(req.method==='POST'&&url.pathname==='/join'){
    const body=await readJson(req,1024,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       !Object.hasOwn(body,'name')||
       !['name','inviteCode,name'].includes(Object.keys(body).sort().join(',')))
       return send(res,400,{error:'invalid_join'});
    const token=crypto.randomBytes(32).toString('hex');
    const result=lobby.join(token,body.name,body.inviteCode===undefined?null:body.inviteCode);
    return send(res,result.ok?201:409,result.ok?{token,...result,state:stateFor(token)}:result);
   }
   const token=req.headers['x-player-token'];
   if(req.method==='POST'&&url.pathname==='/resume-session'){
    // Existing real members may securely rotate their credential BEFORE
    // all 96 ready, without leaving/rejoining or moving anyone's seat.
    // A finished round remains frozen; a new-round replay is separate.
    if((world&&world.phase!=='moving')||
       (!world&&lobby.phase!=='assembling'))
      return send(res,409,{error:'round_not_active'});
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_resume_request'});
    // The old live token authenticates the caller; the new secret is always
    // generated here, NEVER accepted as a client-provided body field.
    lobby.snapshot(token);
    if(world)world.snapshot(token);
    let replacement;
    do{replacement=crypto.randomBytes(32).toString('hex');}
    while(lobby.players.has(replacement)||
      (world&&world.actors.has(replacement)));
    lobby.rebindSession(token,replacement);
    if(world)world.rebindSession(token,replacement);
    const stream=liveStreams.get(token);
    if(stream){liveStreams.delete(token);stream.end();}
    return send(res,200,{token:replacement,state:stateFor(replacement)});
   }
   if(req.method==='POST'&&url.pathname==='/squad-invite'){
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_invite_request'});
    const result=lobby.invite(token);
    return send(res,result.ok?200:409,result);
   }
   if(req.method==='GET'&&url.pathname==='/state')
    return send(res,200,stateFor(token));
   if(req.method==='GET'&&url.pathname==='/events'){
    if(!world)return send(res,409,{error:'round_not_started'});
    // A stale or made-up token never opens a live response body.
    world.snapshot(token);
    if(liveStreams.has(token))return send(res,409,{error:'stream_already_open'});
    if(liveStreams.size>=96)return send(res,503,{error:'stream_capacity'});
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8',
     'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
     'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY',
     'Connection':'keep-alive'});
    res.flushHeaders();
    liveStreams.set(token,res);
    const release=()=>{if(liveStreams.get(token)===res)liveStreams.delete(token);};
    // IncomingMessage 'close' may fire as soon as GET headers are consumed;
    // the writable response 'close' is the actual streaming disconnect.
    res.on('close',release);
    res.write('retry: 1000\n\n');
    publishSnapshot(token,res);
    return;
   }
   // Public fictional solid geometry is a separate one-time download, not
   // repeated in each of the 96 authenticated 4Hz private snapshots. It
   // cannot contain session IDs, opponent coordinates or civilian missions.
   if(req.method==='GET'&&url.pathname==='/world-geometry'){
    if(!world)return send(res,409,{error:'round_not_started'});
    world.snapshot(token); // Authenticated session and round identity.
    const {x,z,width,depth}=Sim.WET_LOADING_PAD;
    return send(res,200,{schema:'veilpoint-br96-public-geometry-v1',
      // Public non-sensitive environmental region, shared by both modes.
      // Gameplay traction is calculated by the server on true actor poses.
      environment:{wetLoadingPad:{x,z,width,depth}},
      // Elevated roofs/floors are derived from complete public wall kits.
      // They never become full-footprint walking obstacles or actor data.
      loadingHalls:Sim.harborPassageSpaces(world.obstacles),
      // Separate public district ground surfaces preserve the legacy
      // wet-loading-apron response contract for all existing clients.
      nearbyPavementIds:nearbyCivicSurfaces(world.actors.get(token),Sim.PUBLIC_CITY_PAVEMENTS),
      pavements:Sim.PUBLIC_CITY_PAVEMENTS.map(p=>({
        id:p.id,x:p.x,z:p.z,w:p.w,d:p.d,canvas:p.canvas
      })),
      obstacles:world.obstacles.filter(o=>o.type!=='br96-civic-shutter'&&o.routeId!=='br-dock-handcart').map(o=>({
        x:o.x,z:o.z,w:o.w,d:o.d,h:o.h,type:o.type
      }))});
   }
   if(req.method==='GET'&&url.pathname==='/world'){
    if(!world)return send(res,409,{error:'round_not_started'});
    return send(res,200,world.snapshot(token));
   }
   if(req.method==='POST'&&url.pathname==='/move'){
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,128,bodyTimeoutMs);
    const result=world.move(token,body);
    return send(res,result.ok?200:409,{...result,...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&(url.pathname==='/fire'||url.pathname==='/reload')){
    lobby.snapshot(token);
    if(!world)return send(res,409,{error:'round_not_started'});
    const generation=req.headers['x-round-number'];
    if(typeof generation!=='string'||!/^\d{1,9}$/.test(generation))
      return send(res,409,{error:'round_generation_required'});
    if(Number(generation)!==roundNumber)return send(res,409,{error:'stale_round'});
    const body=await readJson(req,160,bodyTimeoutMs);
    // The other 96 requests may finish replay consent while this body streams.
    // Recheck after the await so an old trigger cannot act in the new round.
    if(Number(generation)!==roundNumber)return send(res,409,{error:'stale_round'});
    const before=world.phase;
    const result=url.pathname==='/fire'?world.fire(token,body):world.reload(token,body);
    if(before==='moving'&&world.phase==='finished')broadcastPrivateWorld();
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/pace'){
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,96,bodyTimeoutMs);
    const result=world.pace(token,body);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/step-over'){
    // The player can request a near-body motion, never coordinates, bench ID
    // or a landing pose. Every check is performed against the live server map.
    lobby.snapshot(token);
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_step_over_request'});
    const result=world.stepOver(token);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/wave'){
    // Only an authenticated real seat can perform a server-owned gesture.
    // This endpoint has no target, coordinates, invented avatar or bonus.
    lobby.snapshot(token);
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_wave_request'});
    const result=world.wave(token);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/interact'){
    // PC F: server chooses the nearest actual usable public object. No
    // client positions, object IDs or action type can force an interaction.
    lobby.snapshot(token);
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_interact_request'});
    const result=world.interactNearby(token);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/bench-rest'){
    // A real authenticated participant may sit only by an accessible
    // server-owned civic seat. The body cannot specify place or stamina.
    lobby.snapshot(token);
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_bench_rest_request'});
    const result=world.benchRest(token);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/headlamp'){
    // Actual authenticated human may toggle only their OWN finite light.
    lobby.snapshot(token);
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_headlamp_request'});
    const result=world.headlamp(token);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/heartbeat'){
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_heartbeat'});
    const result=world.heartbeat(token);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/squad-chat'){
    // A token identifies one of the 96 real seats. Messages belong to its
    // six-person squad only; no recipient team or author pose comes from HTTP.
    lobby.snapshot(token);
    const body=await readJson(req,512,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==1||typeof body.text!=='string')
      return send(res,400,{error:'invalid_chat_request'});
    // Before all 96 humans are ready, messages go ONLY to the authenticated
    // caller's squad in the lobby; live world chat remains unchanged after lock.
    const staging=!world;
    const result=staging?lobby.chat(token,body.text):world.chat(token,body.text);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?(staging?{state:stateFor(token)}:
        {world:world.snapshot(token)}):{})});
   }
   if(req.method==='POST'&&url.pathname==='/signal'){
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,128,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==1||!Object.hasOwn(body,'kind'))
       return send(res,400,{error:'invalid_signal'});
    const result=world.signal(token,body.kind);
    return send(res,result.ok?200:409,{
       ...result,...(result.ok?{world:world.snapshot(token)}:{})
    });
   }
   if(req.method==='POST'&&url.pathname==='/handcart'){
    // Authenticate even before launch; anonymous requests never reveal round state.
    lobby.snapshot(token);
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_handcart_request'});
    const result=world.operateHandcart(token);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/civic-gate'){
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_public_gate_request'});
    const result=world.operateCivicGate(token);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/spectate'){
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,96,bodyTimeoutMs);
    const result=world.spectate(token,body);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{world:world.snapshot(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/withdraw'){
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==0)
       return send(res,400,{error:'invalid_withdraw'});
    const phaseBefore=world.phase;
    const result=world.withdraw(token);
    // A real human can finish the round outside the 60Hz tick loop.
    // Without an immediate single update, all SSE listeners stay on a
    // stale moving screen until their independent polling wakes up.
    if(result.ok&&phaseBefore==='moving'&&world.phase==='finished')
      broadcastPrivateWorld();
    return send(res,result.ok?200:409,{
      ...result,...(result.ok?{world:world.snapshot(token)}:{})
    });
   }
   if(req.method==='POST'&&url.pathname==='/replay-consent'){
    // Every one of the original 96 real participants must explicitly consent.
    // Never automatically force the remaining members into a new round.
    if(!world||world.phase!=='finished')return send(res,409,{error:'round_not_finished'});
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==1||typeof body.ready!=='boolean')
      return send(res,400,{error:'invalid_replay_consent'});
    world.snapshot(token); // Old withdrawn/spectating members still own seats.
    if(body.ready)replayConsent.add(token);else replayConsent.delete(token);
    if(replayConsent.size===96){
      // The old finished scorecard stays unchanged until a real, unanimous
      // new-round decision. Fresh 60Hz world, same real six-person rosters,
      // no clients choosing opponents, placements or physical coordinates.
      const fresh=new BrSquadWorld(lobby,20261108+roundNumber);
      world=fresh;roundNumber++;
      replayConsent.clear();
    }
    return send(res,200,{ok:true,roundNumber,
      replay:world.phase==='finished'?replayVotesFor(token):null,
      state:stateFor(token)});
   }
   if(req.method==='POST'&&url.pathname==='/entry-vote'){
    const body=await readJson(req,80,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).length!==1||typeof body.choice!=='string')
      return send(res,400,{error:'invalid_entry_vote'});
    const result=lobby.voteEntry(token,body.choice);
    return send(res,result.ok?200:409,{...result,
      ...(result.ok?{state:stateFor(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/ready'){
    const body=await readJson(req,128,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==1||typeof body.ready!=='boolean')
       return send(res,400,{error:'invalid_ready'});
    const result=lobby.ready(token,body.ready);
    if(result.ok&&result.locked&&!world)world=new BrSquadWorld(lobby);
    return send(res,result.ok?200:409,{...result,...(result.ok?{state:stateFor(token)}:{})});
   }
   if(req.method==='POST'&&url.pathname==='/leave'){
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_leave'});
    const result=lobby.leave(token);
    return send(res,result.ok?200:409,result);
   }
   return send(res,404,{error:'not_found'});
  }catch(error){
   const reason=error instanceof RangeError?error.message:'server_error';
   const status=reason==='unknown_session'?401:
    ['invalid_session','invalid_display_name','invalid_ready','invalid_movement','invalid_signal_kind','invalid_json',
     'invalid_weapon_command','invalid_join','invalid_entry_choice','invalid_pace','invalid_spectator_slot','invalid_invite_code','invalid_invite_request','invalid_resume_request','body_too_large','request_timeout'].includes(reason)?400:500;
   return send(res,status,{error:reason});
  }
 });
 return {lobby,get world(){return world;},get liveStreamCount(){return liveStreams.size;},step:advanceWorld,
  listen:()=>new Promise((resolve,reject)=>{
   const fail=err=>{server.off('error',fail);reject(err);};
   server.once('error',fail);
   server.listen(port,host,()=>{
    server.off('error',fail);
    if(autoTick){advance(require('node:perf_hooks').performance.now());
      timer=setInterval(()=>advance(require('node:perf_hooks').performance.now()),8);
      if(timer.unref)timer.unref();}
    resolve(server.address());
   });
  }),close:()=>new Promise((resolve,reject)=>{
   if(timer){clearInterval(timer);timer=null;}
   for(const stream of liveStreams.values())stream.end();
   liveStreams.clear();
   server.close(err=>err?reject(err):resolve());
  })};
}
module.exports={createBrSquadServer};
if(require.main===module){
 const raw=process.env.VEILPOINT_BR96_PORT||'8130';
 const port=Number(raw);
 if(!Number.isInteger(port)||port<1024||port>65535){
   process.stderr.write('Invalid VEILPOINT_BR96_PORT (1024–65535)\\n');
   process.exitCode=1;
 }else{
   createBrSquadServer({host:'127.0.0.1',port}).listen().then(address=>{
     process.stdout.write('VEILPOINT BR96 local test: http://127.0.0.1:'+address.port+'/\\n');
   }).catch(error=>{
     process.stderr.write('BR96 failed to listen: '+error.message+'\\n');
     process.exitCode=1;
   });
 }
}
