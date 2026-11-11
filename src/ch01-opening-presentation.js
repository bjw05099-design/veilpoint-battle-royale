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
  let view=snapshot(raw),destroyed=false,finishedNotified=false;
  function render(){
   if(destroyed)return;
   host.hidden=!view.visible;
   host.classList.toggle('hidden',!view.visible);
   if(!view.visible)return;
   host.querySelector('[data-opening-place]').textContent=view.place;
   host.querySelector('[data-opening-speaker]').textContent=view.speaker;
   host.querySelector('[data-opening-line]').textContent=view.line;
  }
  function notifyIfFinished(){
   if(!view.visible&&!destroyed&&!finishedNotified){
    finishedNotified=true;
    if(typeof onFinish==='function')onFinish();
   }
  }
  const button=host.querySelector('[data-opening-next]');
  const advance=()=>{
   if(destroyed||!view.visible)return;
   view=next(view.state);render();notifyIfFinished();
  };
  button.addEventListener('click',advance);
  render();
  return {
   advance,
   tick(){
    if(!destroyed&&view.visible){view=tick(view.state);render();notifyIfFinished();}
    return view;
   },
   snapshot(){return view;},
   destroy(){
    destroyed=true;
    button.removeEventListener('click',advance);
    host.hidden=true;host.classList.add('hidden');
   }
  };
 }
 function attachMenu(doc){
  const button=doc.getElementById('chapterOpeningShow'),menu=doc.getElementById('menu');
  const host=doc.getElementById('chapterOpening');
  if(!button||!menu||!host)return null;
  const TICKS_PER_SECOND=60;
  let controller=null,frameId=0,lastTime=null,carry=0;
  function cancelPlayback(){
   if(frameId&&typeof window!=='undefined'&&
      typeof window.cancelAnimationFrame==='function')
    window.cancelAnimationFrame(frameId);
   frameId=0;lastTime=null;carry=0;
  }
  function frame(now){
   frameId=0;
   if(!controller||doc.hidden||!Number.isFinite(now))return;
   if(lastTime!==null)
    carry+=Math.max(0,Math.min(.1,(now-lastTime)/1000));
   lastTime=now;
   const ticks=Math.min(6,Math.floor(carry*TICKS_PER_SECOND));
   if(ticks){
    carry-=ticks/TICKS_PER_SECOND;
    for(let i=0;i<ticks&&controller;i++)controller.tick();
   }
   if(controller)schedulePlayback();
  }
  function schedulePlayback(){
   if(frameId||!controller||doc.hidden||typeof window==='undefined'||
      typeof window.requestAnimationFrame!=='function')return;
   frameId=window.requestAnimationFrame(frame);
  }
  function close(){
   cancelPlayback();
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
   schedulePlayback();
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
  doc.addEventListener?.('visibilitychange',()=>{
   // A suspended tab may resume minutes later: never skip hundreds of
   // story captions because the PC window was backgrounded.
   if(doc.hidden)cancelPlayback();
   else if(controller)schedulePlayback();
  });
  return {show,close,active(){return !!controller;}};
 }
 if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>attachMenu(document),{once:true});
  else attachMenu(document);
 }
 return Object.freeze({snapshot,next,tick,mount,attachMenu});
});
