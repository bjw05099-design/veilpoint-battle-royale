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
 function mount(doc,raw,onFinish){
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
  const advance=()=>{view=next(view.state);render();if(!view.visible&&typeof onFinish==='function')onFinish();};
  button.addEventListener('click',advance);
  render();
  return {advance,tick(){view=tick(view.state);render();return view;},snapshot(){return view;},destroy(){button.removeEventListener('click',advance);host.hidden=true;host.classList.add('hidden');}};
 }
 function attachMenu(doc){
  const button=doc.getElementById('chapterOpeningShow'),menu=doc.getElementById('menu');
  const host=doc.getElementById('chapterOpening');
  if(!button||!menu||!host)return null;
  let controller=null;
  function close(){
   if(!controller)return;
   controller.destroy();
   controller=null;
   menu.classList.remove('hidden');
   button.focus({preventScroll:true});
  }
  function show(){
   close();
   controller=mount(doc,undefined,close);
   if(!controller)return;
   menu.classList.add('hidden');
   const nextButton=host.querySelector('[data-opening-next]');
   nextButton.focus({preventScroll:true});
  }
  function onKeydown(event){
   if(!controller)return;
   // This is a true single-button PC dialog. Focus must not escape into
   // hidden game/menu controls when Shift+Tab or Tab is pressed. Otherwise
   // Space/Enter may activate a hidden button behind the opening scene.
   if(event.key==='Tab'){
    event.preventDefault();
    event.stopPropagation?.();
    host.querySelector('[data-opening-next]')?.focus({preventScroll:true});
    return;
   }
   // Escape belongs solely to this optional briefing. Suppress propagation
   // to the window's gameplay Escape handler as the menu becomes visible.
   if(event.key==='Escape'){
    event.preventDefault();
    event.stopPropagation?.();
    close();
   }
  }
  button.addEventListener('click',show);
  doc.addEventListener('keydown',onKeydown);
  return {show,close,active(){return !!controller;}};
 }
 if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>attachMenu(document),{once:true});
  else attachMenu(document);
 }
 return Object.freeze({snapshot,next,tick,mount,attachMenu});
});
