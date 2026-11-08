'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const ids=['vpAudioEnabled','vpAudioMaster','vpAudioAmbience','vpAudioEffects',
 'vpAudioMusic','vpAudioVoice'];
test('three PC game modes have the same five broad volume controls, default ON and no hidden auto-music',()=>{
 for(const page of ['index.html','story.html','br96.html']){
  const html=read(page);
  for(const id of ids)assert.match(html,new RegExp('id="'+id+'"'),'missing '+id+' in '+page);
  assert.match(html,/id="vpAudioEnabled"[^>]*checked/,'all modes sound on in settings');
  assert.match(html,/id="vpAudioSaveStatus"/);
  assert.match(html,/audio-preferences\.js/);
  assert.ok(html.indexOf('audio-preferences.js')<html.indexOf(page==='br96.html'?'br96-client.js':
    page==='index.html'?'src/app.js':'src/story-app.js'),'shared module loads before the app');
 }
 const app=read('src/app.js');
 assert.match(app,/AudioPrefs\.attach/);
 assert.match(app,/\['graphicsTabAudio','audio'\]/);
 assert.match(app,/AudioPrefs\.gain\(prefs,'ambience'\)/);
 assert.match(app,/AudioPrefs\.gain\(prefs,'effects'\)/);
 const story=read('src/story-app.js');
 assert.match(story,/storyMenuViews=\['tools','settings','audio'/);
 assert.match(story,/AudioPrefs\.gain\(prefs,'effects'\)/);
 const br96=read('src/br96-client.js');
 assert.match(br96,/unlockDefaultAudio/);
 assert.match(br96,/AudioPrefs\.gain\(prefs,'ambience'\)/);
});
test('BR96 strict local host serves only the new audio preferences script and never reads storage from the server',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const address=await host.listen(),base='http://127.0.0.1:'+address.port;
 try{
  const response=await fetch(base+'/audio-preferences.js');
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/javascript/);
  assert.match(await response.text(),/VeilpointAudioPreferences/);
  assert.equal((await fetch(base+'/audio-preferences.js?token=secret')).status,400);
  assert.equal((await fetch(base+'/not-a-file.js')).status,404);
 }finally{await host.close();}
});
