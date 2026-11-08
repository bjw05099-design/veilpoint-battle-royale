/* Accessible CH01 opening captions. Pure state transition and DOM mounting are separate.
 * The opening is optional; it never gates a saved CH01 checkpoint.
 */
(function(root,factory){
 const api=factory(root.VeilpointOpeningPlayback||(typeof module==='object'&&module.exports?require('./ch01-opening-playback.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointOpeningPresentation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Playback){
 'use strict';
 if(!Playback)throw new Error('playback_required');
 function snapshot(raw){
  const state=Playback.restore(raw),scene=Playback.current(state);
  return {state,visible:!!scene,place:scene?scene.place:'',speaker:scene?scene.speaker:'',line:scene?scene.line:''};
 }
 function next(raw){return snapshot(Playback.skip(raw));}
 function tick(raw){return snapshot(Playback.tick(raw));}
 function mount(doc,raw){
  const host=doc.getElementById('chapterOpening');
  if(!host)return null;
  let view=snapshot(raw);
  function render(){
   host.hidden=!view.visible;
   if(!view.visible)return;
   host.querySelector('[data-opening-place]').textContent=view.place;
   host.querySelector('[data-opening-speaker]').textContent=view.speaker;
   host.querySelector('[data-opening-line]').textContent=view.line;
  }
  const button=host.querySelector('[data-opening-next]');
  const advance=()=>{view=next(view.state);render();};
  button.addEventListener('click',advance);
  render();
  return {advance,tick(){view=tick(view.state);render();return view;},snapshot(){return view;},destroy(){button.removeEventListener('click',advance);host.hidden=true;}};
 }
 return Object.freeze({snapshot,next,tick,mount});
});
