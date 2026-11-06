'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('../scripts/validate-pc-geometry.cjs');
const sizes=[[2560,1440],[1366,768],[1280,720],[1024,600]];
const names=['BR-main','BR-more','BR-load','BR-export',
 'settings-visual','settings-controls','settings-benchmark'];
function fixture(){
 return {schema:'veilpoint-pc-ui-geometry-v2',transportFailure:null,failures:[],
  checks:sizes.map(([width,height])=>({width,height,errors:[],
   cases:names.map(name=>({name,issues:[],targets:[{
    id:'test-control',visible:true,enabled:true,hit:true,focused:true,probesPassed:5
   }]}))}))};
}
test('complete CDP evidence is accepted',()=>assert.equal(validate(fixture()),true));
test('missing viewport fails closed',()=>{
 const value=fixture();value.checks.pop();
 assert.throws(()=>validate(value),/Missing viewport/);
});
test('missing screen fails closed',()=>{
 const value=fixture();value.checks[0].cases.pop();
 assert.throws(()=>validate(value),/Missing measured screen/);
});
test('transport failure cannot pass',()=>{
 const value=fixture();value.transportFailure={message:'Chrome timeout'};
 assert.throws(()=>validate(value),/transport failure/);
});
test('covered or keyboard-inaccessible control cannot pass',()=>{
 const value=fixture();value.checks[0].cases[0].targets[0].hit=false;
 assert.throws(()=>validate(value),/Occluded/);
 value.checks[0].cases[0].targets[0].hit=true;
 value.checks[0].cases[0].targets[0].focused=false;
 assert.throws(()=>validate(value),/Unfocusable/);
});
test('reported scroll or clipping cannot pass',()=>{
 const value=fixture();value.checks[0].cases[0].issues.push({id:'scrollHeight'});
 assert.throws(()=>validate(value),/Clipping or scrolling/);
});
