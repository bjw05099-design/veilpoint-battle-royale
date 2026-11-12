const test=require('node:test');
const assert=require('node:assert/strict');
const {create,surfaceAt}=require('../src/story-footfall.js');
class AudioContextMock{
 constructor(){this.sampleRate=44100;this.currentTime=0;this.destination={};}
 createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)};}
 createBufferSource(){return {playbackRate:{value:1},connect(){},start(){},stop(){},disconnect(){}};}
 createBiquadFilter(){return {frequency:{setValueAtTime(){}},connect(){},disconnect(){}};}
 createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 close(){return Promise.resolve();}
}
test('CH01 footstep does not borrow stride distance across physical wet apron edge',()=>{
 const player={x:27.2,z:-40},world={scene:'nahrin',player,elapsed:0,obstacles:[]};
 const story={world,phase:'arrival'};
 const audio=create({AudioContextClass:AudioContextMock});
 assert.equal(audio.enable(),true);
 assert.equal(surfaceAt(story),'earth');
 audio.update(story,true);
 player.x=27.8;world.elapsed+=1/6;audio.update(story,true);
 assert.equal(audio.stats().cues,0);
 player.x=28.1;world.elapsed+=1/6;
 assert.equal(surfaceAt(story),'wet');
 audio.update(story,true);
 assert.equal(audio.stats().cues,0);
 player.x=28.8;world.elapsed+=1/6;audio.update(story,true);
 assert.equal(audio.stats().cues,0);
 player.x=29.5;world.elapsed+=1/6;audio.update(story,true);
 assert.equal(audio.stats().cues,1);
 audio.disable();
});
