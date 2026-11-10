'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {readJson}=require('../server/json-body.cjs');

function request(body,declared){
 const req=new EventEmitter();
 req.headers=declared===undefined?{}:{'content-length':declared};
 req.resume=()=>{};
 process.nextTick(()=>{
   req.emit('data',Buffer.from(body));
   req.emit('end');
 });
 return req;
}

test('BR and story HTTP JSON decoding accepts exact decimal byte framing',async()=>{
 const text=JSON.stringify({name:'서울'});
 const bytes=Buffer.byteLength(text);
 assert.deepEqual(await readJson(request(text,String(bytes))),{name:'서울'});
 assert.deepEqual(await readJson(request(text)),{name:'서울'});
});

test('malformed and oversized Content-Length cannot reach gameplay JSON handlers',async()=>{
 for(const declared of ['0x10','1.0','-1','+1','1e2','01','','9007199254740992']){
   await assert.rejects(readJson(request('{}',declared)),{message:'invalid_content_length'});
 }
 await assert.rejects(readJson(request('{}','999'),8),{message:'body_too_large'});
});

test('declared short and long bodies are rejected without accepting partial commands',async()=>{
 await assert.rejects(readJson(request('{}','1')),{message:'content_length_mismatch'});
 await assert.rejects(readJson(request('{}','3')),{message:'content_length_mismatch'});
});
