'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const client=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'../server/br-squad-server.cjs'),'utf8');
const body=client.slice(client.indexOf('function parsePrivateWorld('),
  client.indexOf('async function connectPrivateWorldStream()'));
const parse=vm.runInNewContext(body+'\nparsePrivateWorld;');

test('PC parser accepts only bounded, correctly typed private world events; ignores retry and malformed frames',()=>{
 const sample={mode:'br-96-traversal-prototype',phase:'moving',tick:15,self:{id:1,squad:1}};
 const wire='event: world\ndata: '+JSON.stringify(sample);
 assert.equal(JSON.stringify(parse(wire)),JSON.stringify(sample));
 for(const invalid of [
  'retry: 1000',
  'event: reconnection\ndata: '+JSON.stringify(sample),
  'event: world\ndata: not-json',
  'event: world\ndata: '+JSON.stringify({...sample,mode:'untrusted'}),
  'event: world\ndata: '+JSON.stringify({...sample,tick:-1}),
  'event: world\ndata: '+JSON.stringify({...sample,tick:1.2}),
  'event: world\ndata: '+JSON.stringify({...sample,self:null}),
  'event: world\ndata: '+('x'.repeat(65537))
 ])assert.equal(parse(invalid),null);
});

test('real PC streaming retains 256-bit token in HTTP header, not URL, body or SSE content',()=>{
 assert.match(client,/fetch\('\/events',\{method:'GET',headers:\{/);
 assert.match(client,/'x-player-token':ownToken/);
 assert.match(client,/Accept':'text\/event-stream'/);
 assert.match(client,/response\.body\.getReader\(\)/);
 assert.match(client,/new TextDecoder\(\)/);
 assert.match(client,/lastLiveAt=Date\.now\(\)/);
 assert.match(client,/apply\(\{\.\.\.state,world\}\)/);
 assert.doesNotMatch(client,/new EventSource\(/);
 assert.doesNotMatch(client,/\/events\?/);
 assert.doesNotMatch(server,/data: '\+JSON\.stringify\(\{[^}]*token/);
 assert.match(server,/world\.snapshot\(token\)/);
});

test('bounded parser, identity checks, round replay handling and private-stream teardown prevent stale session frames',()=>{
 assert.match(client,/pending\.length>98304/);
 assert.match(client,/token!==ownToken\|\|state\?\.roundNumber!==ownRound/);
 assert.match(client,/stopPrivateStream\(\);liveRetryAt=0/);
 assert.match(client,/if\(document\.hidden\)\{resetKeys\(\);stopPrivateStream\(\);\}/);
 assert.match(client,/pagehide',\(\)=>\{stopPrivateStream\(\)/);
 assert.match(client,/lastLiveAt>0&&Date\.now\(\)-lastLiveAt<2000/);
 assert.match(client,/if\(!healthy\|\|pollCount%8===0\)poll\(\)/);
 assert.match(client,/liveRetryAt=Date\.now\(\)\+4000/);
 assert.match(server,/if\(world\.tick===beforeTick\|\|world\.tick%15!==0\)return/);
});
