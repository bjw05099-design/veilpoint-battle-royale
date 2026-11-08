'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('BR96 public PC controls expose only fixed route choices and authenticated vote commands',()=>{
 const client=source('src/br96-client.js'),page=source('br96.html');
 const server=source('server/br-squad-server.cjs');
 assert.match(page,/R 분대 이동 투표/);
 assert.match(client,/key==='KeyR'&&active\(\)/);
 assert.match(client,/const choices=\['ferry','shade','civic'\]/);
 assert.match(client,/command\('\/route-vote',\{choice\},null\)/);
 assert.match(client,/w\.squadRoute\?\.target/);
 assert.match(client,/분대 이동 합의/);
 assert.match(server,/url\.pathname==='\/route-vote'/);
 assert.match(server,/world\.voteRoute\(token,body\.choice\)/);
 assert.match(server,/Object\.keys\(body\)\.length!==1/);
 assert.doesNotMatch(client,/\/route-vote'\s*,\s*\{[^}]*[xz]:/);
});
