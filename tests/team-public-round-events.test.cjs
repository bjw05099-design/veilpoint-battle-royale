'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {TeamMatch}=require('../src/team-match.cjs');

function makeMatch(){
 const game=new TeamMatch({now:()=>0});
 game.join('a'.repeat(48),'First');
 game.join('b'.repeat(48),'Second');
 return game;
}
test('server publishes bounded objective history without names, tokens or concealed positions',()=>{
 const game=makeMatch();
 game.start();
 let history=game.snapshot('a'.repeat(48)).events;
 assert.deepEqual(history,[{type:'round_start',team:null,tick:0}]);
 game.recordPublicEvent('relay_complete','red');
 game.recordPublicEvent('relay_complete','blue');
 game.finish('red','objective_score');
 history=game.snapshot('b'.repeat(48)).events;
 assert.deepEqual(history.map(e=>e.type),['round_start','relay_complete','relay_complete','round_end']);
 assert.deepEqual(history.map(e=>e.team),[null,'red','blue','red']);
 assert.ok(history.every(e=>Object.keys(e).sort().join(',')==='team,tick,type'));
 const raw=JSON.stringify(history);
 assert.ok(!raw.includes('First')&&!raw.includes('Second')&&!raw.includes('aaaaa'));
 assert.equal(game.events[game.events.length-1].tick,0);
 history[0].type='tampered';
 assert.equal(game.snapshot('a'.repeat(48)).events[0].type,'round_start');
});
test('new server round clears stale objective events and caps even untrusted internal requests',()=>{
 const game=makeMatch();
 game.start();
 for(let i=0;i<18;i++)game.recordPublicEvent('relay_complete','red');
 game.recordPublicEvent('invalid','red');
 game.recordPublicEvent('relay_complete','purple');
 assert.equal(game.events.length,8);
 game.finish(null,'time_limit');
 game.start();
 assert.deepEqual(game.snapshot('a'.repeat(48)).events,[{type:'round_start',team:null,tick:0}]);
});
test('real objective scoring and PC interface are connected to server event history',()=>{
 const match=fs.readFileSync(path.join(__dirname,'../src/team-match.cjs'),'utf8');
 const client=fs.readFileSync(path.join(__dirname,'../src/team-client.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../team.html'),'utf8');
 assert.match(match,/this\.recordPublicEvent\('relay_complete',team\)/);
 assert.match(match,/this\.recordPublicEvent\('round_end',winner\)/);
 assert.match(html,/id="roundEvents" role="status"/);
 assert.match(client,/el\('roundEvents'\)\.textContent/);
 assert.match(client,/const recentEvents=Array\.isArray\(state\.events\)/);
 assert.doesNotMatch(client.slice(client.indexOf('const publicEventLabels='),client.indexOf('// Both relay progress numbers')),/innerHTML|state\.visible/);
});
