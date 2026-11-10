'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildZip}=require('../scripts/package-offline-demo.cjs');
const {inspectZip}=require('../scripts/verify-offline-demo.cjs');
const Story=require('../scripts/package-story-preview.cjs');
const ROOT=path.resolve(__dirname,'..');

function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-story-only-'));
 try{
  fs.mkdirSync(path.join(dir,'src'),{recursive:true});
  fs.mkdirSync(path.join(dir,'docs'),{recursive:true});
  fs.writeFileSync(path.join(dir,'story.html'),
   '<!doctype html><html><script src="src/story-app.js"></script>'+
   '<script src="src/story-slice.js"></script><a href="index.html">Exit</a></html>');
  fs.writeFileSync(path.join(dir,'src/story-app.js'),'console.log("story app");');
  fs.writeFileSync(path.join(dir,'src/story-slice.js'),'console.log("story rules");');
  fs.writeFileSync(path.join(dir,'docs/STORY_FIRST_RELEASE_PLAN.md'),'Story first');
  return fn(dir);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('story-first Windows browser ZIP contains CH01 and an honest launcher but NO BR entry',()=>{
 fixture(dir=>{
  const result=Story.packageStory(dir);
  const check=Story.verifyStoryPackage(result.output);
  assert.equal(result.storyOnly,true);
  assert.equal(result.nativeUE5Verified,false);
  assert.equal(result.fullCampaignVerified,false);
  assert.equal(check.sha256,result.sha256);
  const entries=inspectZip(fs.readFileSync(result.output));
  assert.ok(entries.has('story.html'));
  assert.match(entries.get('index.html').toString('utf8'),/Start Story CH01/);
  assert.deepEqual([...entries.keys()].filter(x=>x.startsWith('src/')).sort(),
   ['src/story-app.js','src/story-slice.js']);
  for(const banned of ['src/app.js','src/br96-client.js','terrain.html']){
   assert.equal(entries.has(banned),false);
  }
  const raw=fs.readFileSync(result.output);
  assert.equal(Story.verifyStoryArchive(raw).sha256,result.sha256);
  assert.equal(Story.packageStory(dir).sha256,result.sha256,'deterministic, repeatable packaging');
  const tampered=Buffer.from(raw);tampered[50]^=4;
  assert.throws(()=>Story.verifyStoryArchive(tampered),'modified ZIP must not receive a release certificate');
  fs.writeFileSync(result.output+'.sha256','0'.repeat(64)+'  '+Story.FILENAME+'\n');
  assert.throws(()=>Story.verifyStoryPackage(result.output),/sidecar_mismatch/);
 });
});
test('story package verifier refuses manifest-consistent archives missing an actual script',()=>{
 fixture(dir=>{
  const entries=Story.storyEntries(dir);
  const missing=buildZip(entries.filter(x=>x.name!=='src/story-app.js'));
  assert.throws(()=>Story.verifyStoryArchive(missing),/story_asset_missing:src\/story-app\.js/);
  const extra=buildZip([...entries,{name:'src/br96-client.js',data:Buffer.from('console.log("br");')}]
   .sort((a,b)=>a.name.localeCompare(b.name,'en')));
  assert.throws(()=>Story.verifyStoryArchive(extra),/story_untracked_file:src\/br96-client\.js/);
  const spoofed=entries.map(x=>x.name==='index.html'?{name:x.name,data:Buffer.from('<script src="src/app.js"></script>')}:x);
  assert.throws(()=>Story.verifyStoryArchive(buildZip(spoofed)),/story_notice_changed:index\.html/);
 });
});
test('story source assets must stay inside the source tree and remain offline self-contained',()=>{
 fixture(dir=>{
  fs.writeFileSync(path.join(dir,'src/story-app.js'),'fetch("https://example.invalid/remote");');
  assert.throws(()=>Story.collectStoryFiles(dir),/Unsupported JavaScript dependency/);
  fs.writeFileSync(path.join(dir,'src/story-app.js'),'console.log("local");');
  fs.writeFileSync(path.join(dir,'story.html'),'<script src="../outside.js"></script>');
  assert.throws(()=>Story.collectStoryFiles(dir),/Unsafe\/external asset/);
 });
});
test('actual VEILPOINT CH01 entrypoint and all script dependencies make a story-only candidate independently of the BR prototype',()=>{
 const files=Story.collectStoryFiles(ROOT);
 const paths=files.map(f=>f.name);
 assert.ok(paths.length>15);
 for(const file of ['story.html','src/story-app.js','src/story-slice.js',
   'src/aden-public-hall.js','src/story-harbor-ambience.js']){
  assert.ok(paths.includes(file),'CH01 offline entrypoint closure: '+file);
 }
 assert.equal(paths.includes('index.html'),false,
  'source collector must not pull the BR home page into the story-only archive');
 assert.equal(paths.includes('src/app.js'),false);
 assert.equal(paths.includes('src/br96-client.js'),false);
 const zip=buildZip(Story.storyEntries(ROOT));
 const report=Story.verifyStoryArchive(zip);
 assert.equal(report.storyOnly,true);
 assert.equal(report.fullCampaignVerified,false);
 const entries=inspectZip(zip);
 assert.equal(entries.get('README.md').toString('utf8'),Story.README);
 assert.equal(entries.get('NOTICE.txt').toString('utf8'),Story.NOTICE);
 const doc=fs.readFileSync(path.join(ROOT,'docs/STORY_FIRST_RELEASE_PLAN.md'),'utf8');
 assert.match(doc,/First release: Windows PC story mode/);
});
