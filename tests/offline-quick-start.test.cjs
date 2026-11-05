'use strict';
// Verify a real Windows-friendly offline ZIP using the same zero-dependency
// packaging path as GitHub Actions. These tests do not launch a browser.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {packageDemo,buildZip,collectFiles,NOTICE_TEXT,QUICK_START_TEXT}=
 require('../scripts/package-offline-demo.cjs');
const {verifyArchive,verifyPackage,inspectZip}=
 require('../scripts/verify-offline-demo.cjs');

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifestFor=map=>[...map].filter(([name])=>
 name!=='MANIFEST.sha256'&&name!=='NOTICE.txt')
 .sort(([a],[b])=>a<b?-1:a>b?1:0)
 .map(([name,bytes])=>hash(bytes)+'  '+name).join('\n')+'\n';
const repack=map=>buildZip([...map].map(([name,data])=>({name,data}))
 .sort((a,b)=>a.name.localeCompare(b.name,'en')));

test('offline package has useful Windows launch steps and cryptographically covered quick start',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'veilpoint-offline-quick-start-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const target=path.join(temp,'veilpoint-offline-demo.zip');
 const built=packageDemo(undefined,target);
 const inspected=inspectZip(fs.readFileSync(target));
 assert.ok(inspected.has('QUICK_START.txt'));
 const raw=inspected.get('QUICK_START.txt').toString('utf8');
 assert.equal(raw,QUICK_START_TEXT);
 for(const part of ['index.html','story.html','Ctrl+C','120-second','GitHub Actions',
  'NO native Unreal/Win64 .exe','165 FPS','MANIFEST.sha256']){
  assert.ok(raw.includes(part),'missing honest Windows launch guidance: '+part);
 }
 assert.equal(inspected.get('NOTICE.txt').toString('utf8'),NOTICE_TEXT);
 assert.match(inspected.get('MANIFEST.sha256').toString('utf8'),
   new RegExp(hash(inspected.get('QUICK_START.txt'))+'  QUICK_START\\.txt'));
 const outer=path.join(temp,'START_HERE.txt');
 assert.equal(built.outerGuide,outer);
 assert.equal(fs.readFileSync(outer,'utf8'),QUICK_START_TEXT,
   'the first guide visible in a GitHub Actions download must match the ZIP');
 assert.equal(verifyPackage(target).sha256,built.sha256);
});

test('offline verifier rejects replaced launch instructions even after rewriting its file hashes',()=>{
 const files=collectFiles();
 const input=new Map(files.map(({name,data})=>[name,data]));
 input.set('QUICK_START.txt',Buffer.from(QUICK_START_TEXT));
 input.set('NOTICE.txt',Buffer.from(NOTICE_TEXT));
 input.set('MANIFEST.sha256',Buffer.from(manifestFor(input)));
 assert.doesNotThrow(()=>verifyArchive(repack(input)));
 const forged=new Map(input);
 forged.set('QUICK_START.txt',Buffer.from(
   QUICK_START_TEXT.replace('NO native Unreal/Win64 .exe','A native Unreal executable is bundled')));
 forged.set('MANIFEST.sha256',Buffer.from(manifestFor(forged)));
 assert.throws(()=>verifyArchive(repack(forged)),/quick_start_mismatch/);
 assert.doesNotThrow(()=>verifyArchive(repack(input)),
   'rejecting the modified guide does not invalidate the genuine package');
});

test('offline verifier rejects false certification claims inserted into NOTICE independently of hashes',()=>{
 const files=collectFiles();
 const input=new Map(files.map(({name,data})=>[name,data]));
 input.set('QUICK_START.txt',Buffer.from(QUICK_START_TEXT));
 input.set('NOTICE.txt',Buffer.from(NOTICE_TEXT));
 input.set('MANIFEST.sha256',Buffer.from(manifestFor(input)));
 const forged=new Map(input);
 forged.set('NOTICE.txt',Buffer.from(
   'Official UE5 Win64 executable included. 165FPS and multi-player certified.\n'));
 assert.throws(()=>verifyArchive(repack(forged)),/notice_mismatch/);
 assert.doesNotThrow(()=>verifyArchive(repack(input)));
});

test('outer GitHub download guide cannot be missing or stale while ZIP and SHA256 remain correct',t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'veilpoint-outer-guide-'));
 t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
 const zip=path.join(tmp,'veilpoint-offline-demo.zip');
 packageDemo(undefined,zip);
 const guide=path.join(tmp,'START_HERE.txt');
 const initial=fs.readFileSync(guide);
 fs.rmSync(guide);
 assert.throws(()=>verifyPackage(zip),/invalid_demo_zip:outer_guide_missing/);
 fs.writeFileSync(guide,'Incorrect or old download instructions');
 assert.throws(()=>verifyPackage(zip),/invalid_demo_zip:outer_guide_mismatch/);
 fs.writeFileSync(guide,initial);
 assert.doesNotThrow(()=>verifyPackage(zip),
   'restoring byte-identical guide restores valid deployment evidence');
});

test('CI uploads the outer Windows instructions beside the inner offline ZIP and checksum',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/ci.yml'),'utf8');
 assert.match(workflow,/name: veilpoint-offline-demo-candidate/);
 assert.match(workflow,/dist\/veilpoint-offline-demo\.zip\s*\n\s*dist\/veilpoint-offline-demo\.zip\.sha256\s*\n\s*dist\/START_HERE\.txt/);
 assert.doesNotMatch(workflow,/Win64\.exe|UE5\.exe/);
});
