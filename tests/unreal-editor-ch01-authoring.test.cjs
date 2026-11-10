'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('scripts/ue5-author-ch01-map.py');
const project=JSON.parse(read('Unreal/Veilpoint/Veilpoint.uproject'));
const ini=read('Unreal/Veilpoint/Config/DefaultEngine.ini');
const nativeMode=read('Unreal/Veilpoint/Source/Veilpoint/VPStoryGameMode.cpp');

test('UE5 editor-only Python authoring is opt-in and cannot clobber a pre-existing CH01 map',()=>{
 const plugin=project.Plugins.find(p=>p.Name==='PythonScriptPlugin');
 assert.ok(plugin&&plugin.Enabled===true);
 assert.deepEqual(plugin.TargetAllowList,['Editor']);
 assert.match(source,/import unreal/);
 assert.match(source,/MAP_PACKAGE = "\/Game\/Maps\/CH01_Coast"/);
 assert.match(source,/CH01_Coast\.umap/);
 assert.match(source,/if os\.path\.exists\(MAP_FILE\):/);
 assert.match(source,/refusing to overwrite it/);
 assert.ok(source.indexOf('if os.path.exists(MAP_FILE):') <
  source.indexOf('levels.new_level(MAP_PACKAGE, False)'),'check existing map before creating any new level');
 assert.doesNotMatch(source,/os\.remove|shutil\.rmtree|\.delete_asset\(/);
});
test('UE5 CH01 map authoring binds native GameMode, player spawn and actual editor save',()=>{
 assert.match(source,/unreal\.load_class\(None, "\/Script\/Veilpoint\.VPStoryGameMode"\)/);
 assert.match(source,/unreal\.get_editor_subsystem\(unreal\.LevelEditorSubsystem\)/);
 assert.match(source,/unreal\.get_editor_subsystem\(unreal\.EditorActorSubsystem\)/);
 assert.match(source,/levels\.new_level\(MAP_PACKAGE, False\)/);
 assert.match(source,/world\.get_world_settings\(\)/);
 assert.match(source,/set_editor_property\("default_game_mode", native_mode\)/);
 assert.match(source,/unreal\.PlayerStart, unreal\.Vector\(0, 0, 160\)/);
 assert.match(source,/unreal\.DirectionalLight/);
 assert.match(source,/unreal\.SkyLight/);
 assert.match(source,/if not player_start or not sun or not skylight:/);
 assert.match(source,/EXPECTED_PUBLIC_PIECES = 11/);
 assert.match(source,/mesh\.set_collision_enabled\(/);
 assert.match(source,/unreal\.StaticMeshActor/);
 assert.match(source,/CH01_MAP_READY\.json/);
 assert.match(source,/if not levels\.save_current_level\(\) or not os\.path\.isfile\(MAP_FILE\):/);
 assert.match(nativeMode,/SpawnActor<AVPStoryWorldBootstrap>/);
 assert.match(nativeMode,/SpawnActor<AVPStoryMarker>/);
});
test('source default remains safe until Unreal Editor really saves and validates the map',()=>{
 assert.match(ini,/^GameDefaultMap=\/Engine\/Maps\/Entry$/m);
 assert.match(ini,/^EditorStartupMap=\/Engine\/Maps\/Entry$/m);
 assert.doesNotMatch(source,/GameDefaultMap\s*=|DefaultEngine\.ini.*write|write_text\(/);
 const docs=read('docs/UE5_WIN64_BUILD_GATE.md');
 assert.match(docs,/scripts\/ue5-author-ch01-map\.py/);
 assert.match(docs,/GameDefaultMap=\/Game\/Maps\/CH01_Coast/);
 assert.match(docs,/does \*\*not\*\*|No final textures/);
 assert.match(docs,/incomplete asset manually/);
});
