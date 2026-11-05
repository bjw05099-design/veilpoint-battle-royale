'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
const segment=app.slice(app.indexOf("global.addEventListener('pagehide'"),app.indexOf("document.addEventListener('visibilitychange'"));
test('CH01 closes active nonterminal mission through validated checkpoint writer',()=>{
 assert.match(segment,/global\.addEventListener\('pagehide',\(\)=>\{/);
 assert.match(segment,/if\(sessionStarted&&running&&state\.phase!=='failed'&&state\.phase!=='complete'\)/);
 assert.match(segment,/persist\('종료 직전 저장'\)/);
 assert.doesNotMatch(segment,/localStorage\.setItem|storage\.set\(SAVE_KEY/);
 assert.equal((segment.match(/global\.addEventListener\('pagehide'/g)||[]).length,1,
   'one pagehide listener must own the save and pause transition');
 assert.ok(segment.indexOf("persist('종료 직전 저장')")<segment.indexOf('running=false;'),
   'pagehide must write the live world before clearing running state');
 assert.ok(segment.indexOf("persist('종료 직전 저장')")<segment.indexOf("menuOpen("),
   'the original PC resume menu must be shown only after a save attempt');
});
test('CH01 bfcache restoration requires explicit mouse reacquisition, never advances fixed-step',()=>{
 assert.match(segment,/global\.addEventListener\('pageshow',event=>\{/);
 assert.match(segment,/if\(!event\.persisted\)return;/);
 assert.match(segment,/clearInput\(\)/);
 assert.match(segment,/clock\.reset\(\)/);
 assert.match(segment,/limiter\.reset\(\)/);
 assert.match(segment,/menuOpen\('이전 페이지에서 복귀했습니다\./);
 assert.match(app,/const canAct=\(\)=>running&&!graphicsContextLost/);
});
test('CH01 pagehide cannot overwrite newer disk generation from another tab',()=>{
 assert.match(app,/if\(previous!==diskGeneration\)\s*return protectDisk\('다른 창에서 체크포인트 변경 감지'\)/);
 assert.match(app,/saved=global\.localStorage\.getItem\(SAVE_KEY\)===raw/);
 assert.match(segment,/running=false;\s*clearInput\(\);\s*clock\.reset\(\);\s*limiter\.reset\(\)/);
});
