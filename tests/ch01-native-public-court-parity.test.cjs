'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const scene=JSON.parse(read('scripts/ch01-original-public-court.json'));
const Court=require('../src/story-public-court.js');
const Sim=require('../src/simulation.js');
const Story=require('../src/story-slice.js');

test('native UE5 physical public court and browser CH01 use exactly one authored 11-piece layout',()=>{
 assert.equal(scene.format,Court.FORMAT);
 assert.equal(scene.actualAdenCoverageVerified,false);
 assert.equal(Court.georeferenced,false);
 assert.equal(Court.storyFirst,true);
 assert.deepEqual(scene.courtCentreCm,[11000,-3700]);
 assert.deepEqual(Court.CENTRE,{x:110,z:-37});
 assert.equal(Court.RAW.length,11);
 const expected=scene.pieces.map(p=>({
   id:p.id,x:p.xCm/100,z:p.yCm/100,y:p.zCm/100,
   w:p.widthCm/100,d:p.depthCm/100,h:p.heightCm/100,
   solid:p.solid,kind:p.kind
 }));
 assert.deepEqual(Court.RAW,expected,'browser and native actor coordinates must NEVER drift');
 assert.equal(Court.SOLIDS.length,8,'four columns, two benches and two shelves');
 assert.ok(Court.RAW.filter(p=>p.solid).length===9,
  'the 9th original collision is overhead canopy in true UE5 3D only');
 for(const obj of Court.SOLIDS)
  assert.ok(obj.type.startsWith('story-public-court-'));
});

test('old 68m/-66m site overlapped an existing BR building; relocated 110m/-37m court is free',()=>{
 const br=Sim.newMatch(20261027,0);
 const overlapping=br.obstacles.find(o=>o.x===70&&o.z===-78&&o.type==='building');
 assert.ok(overlapping,'an existing solid building occupied the OLD court site');
 assert.equal(Sim.blocked(68,-66,.85,br.obstacles),true);
 assert.equal(Sim.blocked(Court.CENTRE.x,Court.CENTRE.z,.85,br.obstacles),false,
  'new court centre must be outside ALL old game solid bodies');
 const base=Story.createState();
 assert.equal(base.world.scene,'nahrin');
 assert.equal(base.world.obstacles.filter(o=>o.type.startsWith('story-public-court-')).length,8);
 assert.ok(!br.obstacles.some(o=>o.type.startsWith('story-public-court-')),
  'offline BR round/checkpoint geometry cannot change before story-first release');
 for(const box of Court.SOLIDS){
  assert.equal(Sim.blocked(box.x,box.z,.01,br.obstacles),false,
    'new authored court physical body overlaps a preexisting 2D solid: '+box.id);
  const actual=base.world.obstacles.find(o=>o.id===box.id);
  assert.ok(actual,'missing story collision '+box.id);
  for(const field of ['x','z','w','d','h','type'])
   assert.equal(actual[field],box[field],'mismatched 60Hz collision '+box.id+'.'+field);
 }
});

test('11m wide centre aisle is continuously walkable from southern to northern public entry',()=>{
 const state=Story.createState();
 for(let z=-48;z<=-26;z+=.25) {
  assert.equal(Sim.blocked(Court.CENTRE.x,z,.85,state.world.obstacles),false,
   'centre aisle becomes physically obstructed near '+z);
 }
 const feet={x:110,z:-48};
 for(let tick=0;tick<220;tick++)
  Sim.moveEntity(feet,0,6,1/60,state.world.obstacles);
 assert.ok(feet.z>-27.5,'movement must traverse the actual public court on foot');
 assert.equal(feet.x,110);
 assert.equal(Sim.blocked(feet.x,feet.z,.85,state.world.obstacles),false);
 assert.equal(Court.withinCourt({x:110,z:-37}),true);
 assert.equal(Court.withinCourt({x:160,z:-37}),false);
 assert.equal(Court.withinCourt({x:NaN,z:-37}),false);
});

test('solid supports block genuine body movement; non-solid ground, canopy and marks create no phantom walls',()=>{
 const state=Story.createState();
 const col=Court.SOLIDS.find(o=>o.type==='story-public-court-column');
 const bench=Court.SOLIDS.find(o=>o.type==='story-public-court-furniture');
 for(const o of [col,bench])
  assert.equal(Sim.blocked(o.x,o.z,.15,state.world.obstacles),true,
   'genuine mesh column/bench must collide with the 60Hz body');
 assert.equal(Court.CANOPY.solid,true);
 assert.ok(Court.CANOPY.y-Court.CANOPY.h/2>3.0);
 assert.equal(state.world.obstacles.some(o=>o.id===Court.CANOPY.id),false,
  '2D movement collider must not treat 3m-high roof as impassable');
 assert.equal(state.world.obstacles.some(o=>o.id===Court.FLOOR.id),false,
  'thin pavement is visual only and never a false obstacle');
 assert.equal(state.world.obstacles.some(o=>o.id===Court.CENTRE_MARK.id),false);
});

test('browser WebGL/Canvas reuse the physical public-court parts and overhead material without duplicate collisions',()=>{
 const html=read('story.html');
 const renderer=read('src/renderer.js');
 const story=read('src/story-slice.js');
 assert.ok(html.indexOf('src/story-public-court.js')<html.indexOf('src/renderer.js'));
 assert.ok(html.indexOf('src/story-public-court.js')<html.indexOf('src/story-slice.js'));
 assert.match(story,/Court\?Court\.SOLIDS:\[\]/);
 assert.match(renderer,/const StoryCourt=global\.VeilpointStoryPublicCourt/);
 assert.match(renderer,/StoryCourt\.FLOOR/);
 assert.match(renderer,/StoryCourt\.CANOPY/);
 assert.match(renderer,/StoryCourt\.CENTRE_MARK/);
 assert.match(renderer,/o\.type==='story-public-court-column'/);
 assert.match(renderer,/o\.type==='story-public-court-furniture'/);
 assert.match(renderer,/m\.box\(roof\.x,roof\.y-roof\.h\/2/);
 assert.match(renderer,/roofY:roof\.y-roof\.h\/2,type:'shared-public-canopy'/);
});

test('existing v2 story save schema retains original version and the court is not a forced mission or a BR option',()=>{
 const state=Story.createState(),serialized=Story.serialize(state);
 const restored=Story.restore(serialized);
 assert.equal(Story.VERSION,2);
 assert.equal(restored.phase,state.phase);
 assert.equal(restored.world.player.x,state.world.player.x);
 assert.equal(restored.world.player.z,state.world.player.z);
 assert.ok(restored.world.obstacles.some(o=>o.id===Court.SOLIDS[0].id));
 assert.doesNotMatch(serialized,/publicCourt|courtActor|courtVisited/);
 assert.equal(Story.markers(restored).some(m=>m.id.startsWith('court')),false);
});

test('local courtyard feedback and footfalls are grounded in actual player feet, not world-wide scene flags',()=>{
 const Footfall=require('../src/story-footfall.js');
 const state=Story.createState();
 assert.equal(Court.withinCourt(state.world.player),false);
 assert.notEqual(Footfall.surfaceAt(state),'stone');
 state.world.player.x=110;state.world.player.z=-37;
 assert.equal(Court.withinCourt(state.world.player),true);
 assert.equal(Footfall.surfaceAt(state),'stone');
 state.world.player.x=110;state.world.player.z=-53;
 assert.equal(Court.withinCourt(state.world.player),false);
 const app=read('src/story-app.js');
 assert.match(app,/PublicCourt\?\.withinCourt\(state\.world\.player\)/);
 assert.match(app,/주민 인원 확인 전/);
 assert.match(read('src/story-footfall.js'),/Court\?\.withinCourt\(p\)/);
});
