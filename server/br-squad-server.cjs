'use strict';
// Local-only shared BR staging endpoint. Live 96-actor simulation and internet
// deployment are separate future milestones; do not expose this to WAN.
const http=require('node:http');
const crypto=require('node:crypto');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const {createFixedStepClock}=require('./team-server.cjs');
const {readJson}=require('./json-body.cjs');
function createBrSquadServer({host='127.0.0.1',port=0,bodyTimeoutMs=5000,autoTick=true}={}) {
 if(!['127.0.0.1','localhost','::1'].includes(host))throw new RangeError('loopback_host_required');
 const lobby=new BrSquadLobby();
 let world=null;
 const advance=createFixedStepClock(()=>{if(world)world.step();});
 let timer=null;
 const stateFor=token=>{
  const state=lobby.snapshot(token);
  return world?{...state,world:world.snapshot(token)}:state;
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
   if(req.method==='POST'&&url.pathname==='/squad-invite'){
    const body=await readJson(req,64,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==0)
      return send(res,400,{error:'invalid_invite_request'});
    const result=lobby.invite(token);
    return send(res,result.ok?200:409,result);
   }
   if(req.method==='GET'&&url.pathname==='/state')
    return send(res,200,stateFor(token));
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
   if(req.method==='POST'&&url.pathname==='/pace'){
    if(!world)return send(res,409,{error:'round_not_started'});
    const body=await readJson(req,96,bodyTimeoutMs);
    const result=world.pace(token,body);
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
    const result=world.withdraw(token);
    return send(res,result.ok?200:409,{
      ...result,...(result.ok?{world:world.snapshot(token)}:{})
    });
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
     'invalid_join','invalid_pace','invalid_spectator_slot','invalid_invite_code','invalid_invite_request','body_too_large','request_timeout'].includes(reason)?400:500;
   return send(res,status,{error:reason});
  }
 });
 return {lobby,get world(){return world;},step:()=>{if(world)world.step();},
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
   server.close(err=>err?reject(err):resolve());
  })};
}
module.exports={createBrSquadServer};
