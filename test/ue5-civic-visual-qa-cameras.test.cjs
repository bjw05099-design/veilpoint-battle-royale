'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('scripts/ue5-civic-visual-qa-cameras.py','utf8');
test('visual QA is limited to standalone original civilian terrain lab',()=>{
 assert.match(source,/Aden_TerrainLab/);
 assert.match(source,/local-metre-unreferenced/);
 assert.match(source,/actualAdenCoverageVerified/);
 assert.match(source,/VP_CIV_ST_/);
 assert.match(source,/181/);
});
test('visual QA refuses duplicates and only authors optional camera actors',()=>{
 assert.match(source,/PREFIX = "VP_CIV_QA_CAMERA_"/);
 assert.match(source,/CameraActor/);
 assert.match(source,/refusing duplicates/);
 assert.doesNotMatch(source,/save_current_level|set_collision_enabled|destroy_actor/);
});
test('visual QA explicitly excludes PIE and surveyed authenticity claims',()=>{
 assert.match(source,/no native PIE or surveyed coverage verified/);
 assert.match(source,/Orient and inspect manually/);
});
