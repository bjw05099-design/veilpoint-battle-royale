'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../br96.html'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
test('BR96 PC crouch is visible and transmitted only as a held movement intent',()=>{
 assert.match(html,/C 낮은 자세 이동/);
 assert.match(client,/keys\.has\('KeyC'\)/);
 assert.match(client,/await request\('\/pace',\{sprint:newSprint,crouch:newCrouch\}\)/);
 assert.match(client,/if\(newSprint!==lastSprint\|\|newCrouch!==lastCrouch\)/);
 assert.match(client,/lastSprint=null;lastCrouch=null/);
 assert.match(client,/w\.self\.crouched/);
 assert.doesNotMatch(client,/\/move'\s*,\s*\{[^}]*crouch/s);
});
