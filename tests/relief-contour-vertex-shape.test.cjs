const test=require('node:test');
const assert=require('node:assert/strict');
const {contours}=require('../src/aden-map-relief.js');
test('contours rejects incomplete or surplus vertices rather than inventing terrain',()=>{
 for(const invalid of [[0,1],[0,1,2,3],[],[0,1,NaN]])
  assert.throws(()=>contours(invalid,[1,2,3],[2,3,4]),RangeError);
 assert.ok(contours([0,0,0],[10,30,0],[0,0,10]).length>0);
});
