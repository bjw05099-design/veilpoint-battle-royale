'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Prefs=require('../src/audio-preferences.js');
function storage(){
 const data=new Map();
 return {data,getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v)};
}
test('the broad sound buses start ON and share deterministic clamped volume math',()=>{
 const memory=storage(),defaults=Prefs.read(memory);
 assert.deepEqual(defaults,{enabled:true,master:100,ambience:100,effects:100,music:100,voice:100});
 for(const bus of Prefs.CHANNELS)assert.equal(Prefs.gain(defaults,bus),1);
 const changed={...defaults,master:50,ambience:25,effects:80,music:0,voice:60};
 assert.equal(Prefs.persist(memory,changed),true);
 assert.deepEqual(Prefs.read(memory),changed);
 assert.equal(Prefs.gain(changed,'ambience'),.125);
 assert.equal(Prefs.gain(changed,'effects'),.4);
 assert.equal(Prefs.gain(changed,'music'),0);
 assert.equal(Prefs.gain(changed,'voice'),.3);
 assert.equal(Prefs.gain({...changed,enabled:false},'effects'),0);
 assert.throws(()=>Prefs.gain(changed,'unknown'),/unknown_audio_bus/);
});
test('malformed local storage never creates amplification or turns all sound off unexpectedly',()=>{
 const memory=storage();
 for(const raw of ['{not-json','[]','null','{"enabled":"false","master":9999,"ambience":-10,"voice":"100"}']){
  memory.data.set(Prefs.KEY,raw);
  const p=Prefs.read(memory);
  assert.equal(p.enabled,true);
  for(const bus of Prefs.CHANNELS)assert.ok(p[bus]>=0&&p[bus]<=100);
 }
 assert.equal(Prefs.persist(memory,{...Prefs.DEFAULT,master:NaN}),false);
 assert.equal(Prefs.persist(memory,{...Prefs.DEFAULT,master:101}),false);
 assert.equal(Prefs.persist(memory,{...Prefs.DEFAULT,voice:-1}),false);
 const denied={getItem(){throw Error('blocked');},setItem(){throw Error('denied');}};
 assert.deepEqual(Prefs.read(denied),Prefs.DEFAULT);
 assert.equal(Prefs.persist(denied,{...Prefs.DEFAULT}),false);
 const ignored={getItem:()=>null,setItem(){}};
 assert.equal(Prefs.persist(ignored,{...Prefs.DEFAULT}),false,'write without identical read-back is not stored');
});
test('PC sliders update visible labels, call live bus updates and retain values across modes',()=>{
 const memory=storage(),nodes=new Map(),updates=[];
 function node(id){
  const n={id,value:'100',checked:true,textContent:'',listeners:{},
   addEventListener(event,fn){this.listeners[event]=fn;}};
  nodes.set(id,n);return n;
 }
 const ids=['vpAudioEnabled','vpAudioMaster','vpAudioAmbience','vpAudioEffects',
  'vpAudioMusic','vpAudioVoice','vpAudioSaveStatus'];
 for(const id of ids)node(id);
 for(const id of ids.filter(id=>id!=='vpAudioEnabled'&&id!=='vpAudioSaveStatus'))
  node(id+'Value');
 const doc={getElementById:id=>nodes.get(id)||null};
 const controls=Prefs.attach(doc,memory,p=>updates.push(p));
 assert.equal(updates.length,1);
 assert.equal(nodes.get('vpAudioEnabled').checked,true);
 nodes.get('vpAudioMaster').value='35';
 nodes.get('vpAudioMaster').listeners.input();
 assert.equal(controls.get().master,35);
 assert.equal(nodes.get('vpAudioMasterValue').textContent,'35%');
 nodes.get('vpAudioEnabled').checked=false;
 nodes.get('vpAudioEnabled').listeners.change();
 assert.equal(controls.get().enabled,false);
 assert.equal(Prefs.read(memory).enabled,false);
 const reopened=Prefs.attach(doc,memory,p=>updates.push(p));
 assert.deepEqual(reopened.get(),controls.get());
 assert.equal(nodes.get('vpAudioMaster').value,'35');
});
