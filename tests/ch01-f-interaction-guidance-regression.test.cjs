'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.resolve(__dirname,'../src',file),'utf8');

test('CH01 mission guidance contains no retired E-action instructions after PC F migration',()=>{
 const story=read('story-slice.js'),app=read('story-app.js');
 assert.doesNotMatch(story,/E로|E 키|E키/);
 assert.doesNotMatch(app,/E로|E 키|E키/);
 assert.match(story,/F로 동행 재개 가능/);
 assert.match(app,/situation\.guideStatus\.includes\('F로 동행 재개 가능'\)/);
 assert.match(app,/interactPrompt/);
});
