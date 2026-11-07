'use strict';
// Local-only shared BR staging endpoint. Live 96-actor simulation and internet
// deployment are separate future milestones; do not expose this to WAN.
const http=require('node:http');
const crypto=require('node:crypto');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {readJson}=require('./json-body.cjs');
function createBrSquadServer({host='127.0.0.1',port=0,bodyTimeoutMs=5000}={}) {
 if(!['127.0.0.1','localhost','::1'].includes(host))throw new RangeError('loopback_host_required');
 const lobby=new BrSquadLobby();
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
       Object.keys(body).length!==1||!Object.hasOwn(body,'name'))
       return send(res,400,{error:'invalid_join'});
    const token=crypto.randomBytes(32).toString('hex');
    const result=lobby.join(token,body.name);
    return send(res,result.ok?201:409,result.ok?{token,...result,state:lobby.snapshot(token)}:result);
   }
   const token=req.headers['x-player-token'];
   if(req.method==='GET'&&url.pathname==='/state')
    return send(res,200,lobby.snapshot(token));
   if(req.method==='POST'&&url.pathname==='/ready'){
    const body=await readJson(req,128,bodyTimeoutMs);
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==1||typeof body.ready!=='boolean')
       return send(res,400,{error:'invalid_ready'});
    const result=lobby.ready(token,body.ready);
    return send(res,result.ok?200:409,{...result,...(result.ok?{state:lobby.snapshot(token)}:{})});
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
    ['invalid_session','invalid_display_name','invalid_ready','invalid_json',
     'invalid_join','body_too_large','request_timeout'].includes(reason)?400:500;
   return send(res,status,{error:reason});
  }
 });
 return {lobby,listen:()=>new Promise((resolve,reject)=>{
   const fail=err=>{server.off('error',fail);reject(err);};
   server.once('error',fail);
   server.listen(port,host,()=>{server.off('error',fail);resolve(server.address());});
  }),close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))};
}
module.exports={createBrSquadServer};
