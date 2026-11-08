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
   host.classList.toggle('hidden',!view.visible);
   if(!view.visible)return;
   host.querySelector('[data-opening-place]').textContent=view.place;
   host.querySelector('[data-opening-speaker]').textContent=view.speaker;
   host.querySelector('[data-opening-line]').textContent=view.line;
  }
  const button=host.querySelector('[data-opening-next]');
  const advance=()=>{view=next(view.state);render();};
  button.addEventListener('click',advance);
  render();
  return {advance,tick(){view=tick(view.state);render();return view;},snapshot(){return view;},destroy(){button.removeEventListener('click',advance);host.hidden=true;host.classList.add('hidden');}};
 }
 function attachMenu(doc){
  const button=doc.getElementById('chapterOpeningShow'),menu=doc.getElementById('menu');
  if(!button||!menu)return null;
  let controller=null;
  function show(){
   if(controller)controller.destroy();
   controller=mount(doc);
   if(!controller)return;
   menu.classList.add('hidden');
   const nextButton=doc.querySelector('#chapterOpening [data-opening-next]');
   nextButton.focus();
  }
  function advance(){
   if(!controller)return;
   // The mount handler advances first; this listener restores the original menu on completion.
   if(!controller.snapshot().visible){
    controller.destroy();controller=null;menu.classList.remove('hidden');button.focus();
   }
  }
  button.addEventListener('click',show);
  doc.querySelector('#chapterOpening [data-opening-next]').addEventListener('click',advance);
  return {show};
 }
 if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>attachMenu(document),{once:true});
  else attachMenu(document);
 }
 return Object.freeze({snapshot,next,tick,mount,attachMenu});
});
