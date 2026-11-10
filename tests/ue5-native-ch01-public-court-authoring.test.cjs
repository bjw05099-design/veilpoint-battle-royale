'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const layout=JSON.parse(read('scripts/ch01-original-public-court.json'));
const author=read('scripts/ue5-author-ch01-map.py');
const prepare=read('scripts/prepare-native-ch01-win64.ps1');
const nativeBuild=read('scripts/build-native-win64.ps1');

test('public CH01 editor scene is original, metre-coherent, bounded and not declared surveyed Aden',()=>{
 assert.equal(layout.format,'veilpoint-ch01-original-public-court-v1');
 assert.equal(layout.coordinateSystem,'unreferenced-native-ue-centimetres');
 assert.equal(layout.actualAdenCoverageVerified,false);
 assert.equal(layout.restrictedOperationalSites,false);
 assert.equal(layout.includesRealFacilityLayout,false);
 assert.equal(layout.runtimeStoryBootstrapGeometryUnchanged,true);
 assert.equal(layout.entryEndsRemainOpen,true);
 assert.deepEqual(layout.courtCentreCm,[6800,-6600]);
 assert.ok(layout.minClearCentreAisleCm>=650);
 assert.equal(layout.pieces.length,11);
 const ids=new Set();
 const kinds=new Set(layout.pieces.map(x=>x.kind));
 for(const kind of ['structural-column','raised-canopy','street-furniture','walkable-paving'])
  assert.ok(kinds.has(kind),'missing physical public-court category '+kind);
 for(const item of layout.pieces){
  assert.ok(/^[a-z0-9-]{8,100}$/.test(item.id),'unsafe actor ID');
  assert.ok(!ids.has(item.id),'duplicate native court actor');
  ids.add(item.id);
  assert.equal(typeof item.solid,'boolean');
  for(const key of ['xCm','yCm','zCm','widthCm','depthCm','heightCm'])
   assert.ok(Number.isFinite(item[key]),'non-finite actor dimension '+key);
  assert.ok(item.widthCm>0&&item.depthCm>0&&item.heightCm>0);
  assert.ok(item.xCm>=5000&&item.xCm<=8200);
  assert.ok(item.yCm>=-8000&&item.yCm<=-5200);
 }
 assert.equal(layout.pieces.filter(x=>x.solid).length,9);
});

test('native public-court collision leaves 650cm-wide centre aisle and story markers physically reachable',()=>{
 const markers=[[0,0],[650,0],[650,-650],[1700,-500],[1700,500],
  [2800,-400],[2800,400],[4600,-1400],[4600,1400]];
 for(const p of layout.pieces){
  const {xCm:x,yCm:y,widthCm:w,depthCm:d,heightCm:h,zCm:z}=p;
  for(const [mx,my] of markers){
   const dx=Math.max(0,Math.abs(mx-x)-w/2);
   const dy=Math.max(0,Math.abs(my-y)-d/2);
   assert.ok(Math.hypot(dx,dy)>350,'court collider/decoration interferes with story objective: '+p.id);
  }
  if(!p.solid)continue;
  const bottom=z-h/2;
  if(bottom>=260)continue; // honest raised canopy, not an invisible ground wall
  const overlapsAisle=Math.abs(x-6800)<w/2+325&&Math.abs(y+6600)<d/2+550;
  assert.equal(overlapsAisle,false,'ground solid blocks the central passage: '+p.id);
 }
 const roof=layout.pieces.find(p=>p.kind==='raised-canopy');
 assert.ok(roof&&roof.solid);
 assert.ok(roof.zCm-roof.heightCm/2>=260,'canopy clips normal player capsule');
 assert.ok(layout.pieces.some(p=>!p.solid&&p.kind==='walkable-paving'));
});

test('UE5 editor authoring creates ACTUAL StaticMeshActors with collision and records bytes after successful .umap save',()=>{
 assert.match(author,/import unreal/);
 assert.match(author,/read_original_court\(\)/);
 assert.match(author,/os\.path\.exists\(MAP_FILE\)/);
 assert.match(author,/unreal\.load_class\(None, "\/Script\/Veilpoint\.VPStoryGameMode"\)/);
 assert.match(author,/levels\.new_level\(MAP_PACKAGE, False\)/);
 assert.match(author,/unreal\.PlayerStart, unreal\.Vector\(0, 0, 160\)/);
 assert.match(author,/actors\.spawn_actor_from_class\(\s*unreal\.StaticMeshActor/);
 assert.match(author,/unreal\.StaticMeshComponent/);
 assert.match(author,/mesh\.set_static_mesh\(cube\)/);
 assert.match(author,/actor\.set_actor_scale3d\(/);
 assert.match(author,/mesh\.set_collision_enabled\(/);
 assert.match(author,/unreal\.CollisionEnabled\.QUERY_AND_PHYSICS/);
 assert.match(author,/unreal\.CollisionEnabled\.NO_COLLISION/);
 assert.match(author,/levels\.save_current_level\(\)/);
 assert.match(author,/hashlib\.sha256\(map_bytes\)\.hexdigest\(\)/);
 assert.match(author,/CH01_MAP_READY\.json/);
 assert.match(author,/"nativePIEVerified": False/);
 assert.match(author,/"actualAdenCoverageVerified": False/);
 const saved=author.indexOf('if not levels.save_current_level()');
 const receipt=author.indexOf('with open(RECEIPT_FILE, "w"');
 assert.ok(saved>=0&&receipt>saved,'do not certify native map before UE saved it');
 assert.doesNotMatch(author,/os\.remove|shutil\.rmtree|\.delete_asset\(/);
});

test('Windows one-command CH01 native preparation is fail-closed and only sets startup after editor C++ and map checksum proof',()=>{
 for(const needle of [
  'VeilpointEditor','Engine/Binaries/Win64/UnrealEditor-Cmd.exe',
  'Engine/Build/BatchFiles/Build.bat','Engine/Build/Build.version',
  'EngineAssociation','-ExecutePythonScript=','CH01_MAP_READY.json',
  'Get-FileHash -LiteralPath $map -Algorithm SHA256',
  'Get-FileHash -LiteralPath $layout -Algorithm SHA256',
  'actualAdenCoverageVerified','Native Editor C++ build failed',
  'Editor exited without BOTH a real CH01 .umap',
  'Saved','GameDefaultMap=/Game/Maps/CH01_Coast','-PreflightOnly','-PackageNative'
 ])assert.ok(prepare.includes(needle),'missing real Windows authoring protection: '+needle);
 assert.match(prepare,/if \(\$env:OS -ne 'Windows_NT'\)/);
 assert.match(prepare,/if \(Test-Path -LiteralPath \$map\)/);
 assert.match(prepare,/if \(Test-Path -LiteralPath \$receipt\)/);
 assert.match(prepare,/if \(\$PreflightOnly\) \{[\s\S]*?\breturn\b/);
 assert.doesNotMatch(prepare,/Remove-Item.*CH01_Coast|Set-ExecutionPolicy|Invoke-WebRequest/);
 const verify=prepare.indexOf("if ($proof.format -ne");
 const backup=prepare.indexOf("$backup=Join-Path $saved");
 const configWrite=prepare.indexOf('[IO.File]::WriteAllText($config');
 assert.ok(verify>=0&&backup>verify&&configWrite>backup,
  'startup INI must be written only AFTER a byte-exact UE editor receipt');
 const authoring=prepare.indexOf('& $editor $project');
 assert.ok(authoring>=0&&authoring<verify);
 assert.match(nativeBuild,/if \(\$map -eq '\/Game\/Maps\/CH01_Coast'\)/);
 assert.match(nativeBuild,/CH01 authored map receipt mismatch\. Refusing cook\/package/);
 assert.match(nativeBuild,/mapSha256 -cne \$mapDigest/);
 assert.match(nativeBuild,/sourceLayoutSha256 -cne \$layoutDigest/);
 assert.match(nativeBuild,/status='PACKAGED_NOT_RUNTIME_TESTED'/);
});

test('native CH01 Python script syntax is parseable without importing the proprietary Unreal module', {
 skip:process.platform==='win32'
},()=>{
 const scripts=['scripts/ue5-author-ch01-map.py'];
 for(const script of scripts){
  const run=spawnSync('python3',['-c',
    'import ast,sys; ast.parse(open(sys.argv[1],encoding="utf8").read())',
    path.join(ROOT,script)],{encoding:'utf8',timeout:10000});
  assert.equal(run.status,0,'Python syntax error: '+run.stderr);
 }
});
