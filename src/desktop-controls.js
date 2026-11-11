/* Shared PC-only control preferences for offline BR and CH01 browser slices. */
(function(root){
 'use strict';
 const STORAGE_KEY='veilpoint.desktopControls.v1';
 const DEFAULT_BINDINGS=Object.freeze({
  forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',sprint:'ShiftLeft',
  crouch:'KeyC',fire:'Space',reload:'KeyR',interact:'KeyF',assist:'KeyH',support:'KeyQ',
  headlamp:'KeyL',guidance:'KeyB',cacheMove:'KeyU'
 });
 const ACTIONS=Object.freeze(Object.keys(DEFAULT_BINDINGS));
 const RESERVED=new Set(['Escape','Enter','KeyG','KeyM','Digit1','Digit2']);
 // Ctrl/Alt are OS/IME modifiers filtered from gameplay keydown. Offering
 // them as remappable keys would silently save an unusable action binding.
 const VALID_CODE=/^(?:Key[A-Z]|Digit[0-9]|Shift(?:Left|Right)|Space|Arrow(?:Up|Down|Left|Right)|Numpad[0-9])$/;
 const DEFAULT=Object.freeze({sensitivity:1,invertY:false,bindings:DEFAULT_BINDINGS});
 const validCode=code=>typeof code==='string'&&VALID_CODE.test(code)&&!RESERVED.has(code);
 function normalize(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const sensitivity=Number.isFinite(source.sensitivity)&&source.sensitivity>=.25&&source.sensitivity<=3
   ?Math.round(source.sensitivity*100)/100:1;
  const invertY=typeof source.invertY==='boolean'?source.invertY:false;
  const bindings={...DEFAULT_BINDINGS};
  if(source.bindings&&typeof source.bindings==='object'&&!Array.isArray(source.bindings)){
   // Older saved profiles predate the CH01 guide and BR cache-shift action.
   // Preserve every existing PC binding, even when it already uses L or B.
   const expanded={...source.bindings};
   // Upgrade legacy E-interact profiles to the new default F only when the
   // physical F key is not already owned by a custom remapped action.
   if(expanded.interact==='KeyE'&&
      !ACTIONS.some(action=>action!=='interact'&&expanded[action]==='KeyF'))
     expanded.interact='KeyF';
   const additions=['headlamp','guidance','cacheMove'];
   const used=new Set(ACTIONS.filter(a=>!additions.includes(a)).map(a=>expanded[a]));
   for(const extra of additions){
    // Older profiles may reuse U for a real remapped action. Preserve their
    // previous control and relocate this newly introduced optional binding
    // to an actually free key instead of resetting the entire profile.
    if(expanded[extra]===undefined||
       used.has(expanded[extra]))
     expanded[extra]=[DEFAULT_BINDINGS[extra],'KeyK','KeyO','KeyI','KeyP','KeyJ','KeyU','KeyT','KeyY','KeyX','KeyZ','KeyV','KeyF','KeyN']
      .find(code=>!used.has(code));
    used.add(expanded[extra]);
   }
   const candidate=ACTIONS.map(a=>expanded[a]);
   if(candidate.every(validCode)&&new Set(candidate).size===candidate.length)
    for(const action of ACTIONS)bindings[action]=expanded[action];
   else {
    // Migrate only obsolete Ctrl/Alt bindings when possible, preserving
    // unrelated valid custom keys. If fallback defaults would collide with
    // another remap, reset the entire map rather than create duplicate actions.
    const obsolete=/^(?:Control|Alt)(?:Left|Right)$/;
    if(candidate.every(code=>validCode(code)||(typeof code==='string'&&obsolete.test(code)))){
     const migrated=ACTIONS.map((action,i)=>validCode(candidate[i])?candidate[i]:DEFAULT_BINDINGS[action]);
     if(new Set(migrated).size===ACTIONS.length)
      for(let i=0;i<ACTIONS.length;i++)bindings[ACTIONS[i]]=migrated[i];
    }
   }
  }
  return {sensitivity,invertY,bindings};
 }
 function load(storage){
  try{const raw=storage&&storage.getItem(STORAGE_KEY);return raw?normalize(JSON.parse(raw)):normalize(DEFAULT);}
  catch(_){return normalize(DEFAULT);}
 }
 function save(storage,value){
  // Some offline WebViews accept setItem without committing the value. Do not
  // claim PC remaps/sensitivity survived a restart until exact readback.
  try{
   if(!storage||typeof storage.setItem!=='function'||typeof storage.getItem!=='function')return false;
   const raw=JSON.stringify(normalize(value));
   storage.setItem(STORAGE_KEY,raw);
   return storage.getItem(STORAGE_KEY)===raw;
  }catch(_){return false;}
 }
 function bind(value,action,code){
  const next=normalize(value);
  if(!Object.prototype.hasOwnProperty.call(DEFAULT_BINDINGS,action))return {ok:false,reason:'unknown-action',value:next};
  if(!validCode(code))return {ok:false,reason:'reserved-key',value:next};
  const occupied=ACTIONS.find(a=>a!==action&&next.bindings[a]===code);
  if(occupied){
   // The new BR-only cache key must never prevent a previously existing
   // movement/fire/support remap. Swap to the displaced action's old,
   // already-validated key; collisions with all other actions remain errors.
   if(occupied==='cacheMove'&&action!=='cacheMove')
    next.bindings.cacheMove=next.bindings[action];
   else return {ok:false,reason:'key-in-use',value:next};
  }
  next.bindings[action]=code;
  return {ok:true,value:next};
 }
 // Pause/resume is an explicit PC menu action, including when a visible
 // menu button retains keyboard focus. Choice dialogs own Escape separately.
 // Repeated keys never toggle a paused session more than once.
 function pcMenuEscape(event,{running=false,mayResume=false}={}){
  if(!event||event.code!=='Escape')return null;
  if(event.repeat)return 'ignore';
  if(running)return 'pause';
  return mayResume?'resume':'ignore';
 }
 // HUD prompts must show the actual remapped physical key, not a
 // default E/R that no longer performs the advertised action.
 function keyLabel(code){
  if(typeof code!=='string')return '?';
  if(/^Key[A-Z]$/.test(code))return code.slice(3);
  if(/^Digit[0-9]$/.test(code))return code.slice(5);
  if(/^Numpad[0-9]$/.test(code))return 'NUM '+code.slice(6);
  if(code==='Space')return 'SPACE';
  if(code==='ShiftLeft')return 'SHIFT L';
  if(code==='ShiftRight')return 'SHIFT R';
  if(/^Arrow(?:Up|Down|Left|Right)$/.test(code))return code.slice(5).toUpperCase();
  return code;
 }
 // CH01 mission copy is authored with legacy default-key cues. Render the
 // bindings the PC player actually owns, including keyboard fire and uncommon
 // Numpad/Shift remaps. This changes HUD text only, never 60Hz gameplay input.
 function storyHintText(text,bindings){
  const map=bindings&&typeof bindings==='object'?bindings:DEFAULT_BINDINGS;
  const label=action=>keyLabel(map[action]);
  const replacement={
   'F키':['interact','키'],'F로':['interact','로'],
   'F를':['interact','를'],'F 누르':['interact',' 누르'],
   'E로':['interact','로'],'E를':['interact','를'],
   'E 누르':['interact',' 누르'],
   'R키':['reload','키'],'R 재장전':['reload',' 재장전'],
   'Q 상황 보고':['support',' 상황 보고'],
   'SPACE 발사':['fire',' 발사']
  };
  // One pass over the original text: if F was remapped to R, a second
  // replacement must not mislabel that interaction as the reload binding.
  return String(text??'').replace(
   /F키|F로|F를|F 누르|E로|E를|E 누르|R키|R 재장전|Q 상황 보고|SPACE 발사/g,
   original=>{const [action,suffix]=replacement[original];return label(action)+suffix;}
  );
 }
 // Browser/OS command chords are never gameplay input, even if their final
 // physical key is remapped to an action. Ordinary Shift remains playable.
 function isModifiedGameplayKey(event){
  return !!event&&(!!event.ctrlKey||!!event.altKey||!!event.metaKey);
 }
 function actionFor(code,value){
  // A detached or malformed PC profile can arrive during offline storage
  // recovery. Never let a keyboard event terminate the active game loop.
  if(typeof code!=='string'||!value||!value.bindings||typeof value.bindings!=='object')return null;
  const bindings=value.bindings;
  for(const action of ACTIONS)if(bindings[action]===code)return action;
  // Preserve original alternate PC movement keys until the primary key is remapped.
  const aliases={ArrowUp:'forward',ArrowDown:'back',ArrowLeft:'left',ArrowRight:'right',ShiftRight:'sprint',
   KeyN:'guidance'};
  const alias=aliases[code];
  return alias&&bindings[alias]===DEFAULT_BINDINGS[alias]?alias:null;
 }
 // A physical mouse button and a remappable keyboard key are independent
 // trigger sources. Releasing either must not cancel the other held input.
 // This latch stores input only; the 60Hz simulation owns shot cadence/ammo.
 function createTriggerLatch(){
  const held=new Set();
  return {
   press(source){if(source==='keyboard'||source==='mouse')held.add(source);return held.size>0;},
   release(source){held.delete(source);return held.size>0;},
   clear(){held.clear();},
   get held(){return held.size>0;}
  };
 }
 // Windows is a keyboard/mouse-first platform even on convertible hardware
 // whose only advertised pointer is coarse. Legacy touch handlers remain
 // dormant there, so no 60Hz gameplay runs without a locked desktop mouse.
 function isWindowsPC(navigator){
  if(!navigator||typeof navigator!=='object')return false;
  const modern=navigator.userAgentData&&navigator.userAgentData.platform;
  const platform=typeof modern==='string'&&modern?modern:navigator.platform;
  if(typeof platform==='string'&&/^(?:Windows|Win32|Win64)$/i.test(platform))return true;
  return typeof navigator.userAgent==='string'&&/\bWindows NT\b/i.test(navigator.userAgent);
 }
 // IME composition and browser/OS shortcuts never represent game commands.
 // Shift alone remains valid for sprint; keyup still releases held keys.
 function isGameplayShortcut(event){
  return !!event&&(event.isComposing===true||event.key==='Process'||
   event.keyCode===229||event.key==='Dead'||event.key==='AltGraph'||!!event.ctrlKey||!!event.altKey||!!event.metaKey||
   (typeof event.getModifierState==='function'&&event.getModifierState('AltGraph')));
 }
 // Menu hotkeys must not steal printable letters from focused text inputs,
 // native selects, or editable descendants (including custom PC comboboxes).
 // Buttons are deliberately not included: G remains an explicit close shortcut
 // when the player focuses an ordinary button in the settings dialog.
 function isTextEntryTarget(target){
  let node=target;
  const seen=new Set();
  for(let depth=0;node&&depth<32;depth++){
   if(typeof node!=='object'||seen.has(node))return false;
   seen.add(node);
   const tag=typeof node.tagName==='string'?node.tagName.toUpperCase():'';
   if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||node.isContentEditable===true)
    return true;
   const role=typeof node.getAttribute==='function'?node.getAttribute('role'):node.role;
   if(typeof role==='string'&&/^(?:textbox|searchbox|combobox|spinbutton|listbox)$/.test(role.trim().toLowerCase()))
    return true;
   const editable=typeof node.getAttribute==='function'?node.getAttribute('contenteditable'):null;
   if(editable!=null&&editable!=='false')return true;
   node=node.parentElement||node.parentNode||node.host||null;
  }
  return false;
 }
 function isInteractiveTarget(target){
  // Keyboard events often originate from a child span/icon/text node inside
  // a focused button or editable control. Check the composed ancestor chain,
  // not just event.target, so all three PC modes suppress ghost gameplay keys.
  // The bound also guards against malformed/cyclic synthetic event targets.
  let node=target;
  const seen=new Set();
  for(let depth=0;node&&depth<32;depth++){
   if(typeof node!=='object'||seen.has(node))return false;
   seen.add(node);
   const tag=typeof node.tagName==='string'?node.tagName.toUpperCase():'';
   if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||tag==='BUTTON'||
      tag==='OPTION'||tag==='SUMMARY'||node.isContentEditable===true)return true;
   // A focused help link, custom ARIA control or contenteditable region owns
   // its keyboard events. Otherwise Space can fire a weapon while navigating
   // PC menus even though ordinary form controls are already protected.
   if(tag==='A'&&(typeof node.href==='string'||
      (typeof node.hasAttribute==='function'&&node.hasAttribute('href'))))return true;
   const role=typeof node.getAttribute==='function'?node.getAttribute('role'):node.role;
   if(typeof role==='string'&&/^(?:button|link|checkbox|radio|switch|tab|menuitem|menuitemcheckbox|menuitemradio|slider|spinbutton|combobox|textbox|option)$/.test(role.trim().toLowerCase()))return true;
   const editable=typeof node.getAttribute==='function'?node.getAttribute('contenteditable'):null;
   // DOM getAttribute() returns null for missing attributes, but third-party
   // UI wrappers and synthetic event targets may return undefined. Neither
   // means contenteditable; otherwise ordinary gameplay loses key input.
   if(editable!=null&&editable!=='false')return true;
   node=node.parentElement||node.parentNode||node.host||null;
  }
  return false;
 }
 // Request unaccelerated PC mouse movement when the browser supports it.
 // Unsupported raw input falls back to standard pointer lock; permission
 // denial never retries behind the user's back. Remember capability per canvas.
 const rawUnsupported=new WeakSet();
 function requestPrecisionPointerLock(canvas,stillRequested=()=>true){
  if(!canvas||typeof canvas.requestPointerLock!=='function')throw new TypeError('pointer_lock_unavailable');
  // A pause or menu transition can supersede a pending browser permission
  // promise. Check before requesting AND after it settles, including the
  // cached ordinary-lock path, so late grants cannot recapture the PC mouse.
  const ensureCurrent=()=>{
   if(stillRequested())return;
   const doc=canvas.ownerDocument;
   if(doc&&doc.pointerLockElement===canvas&&typeof doc.exitPointerLock==='function'){
    try{doc.exitPointerLock();}catch(_){/* The request is still canceled. */}
   }
   throw new Error('pointer_lock_superseded');
  };
  const request=options=>{
   ensureCurrent();
   const result=canvas.requestPointerLock(options);
   if(!result||typeof result.then!=='function')ensureCurrent();
   return result;
  };
  const guard=result=>result&&typeof result.then==='function'
   ?result.then(value=>{ensureCurrent();return value;}):result;
  const fallback=()=>{
   ensureCurrent();
   rawUnsupported.add(canvas);
   return guard(request());
  };
  if(rawUnsupported.has(canvas))return guard(request());
  const isUnsupported=error=>error&&(error.name==='NotSupportedError'||error.name==='TypeError');
  try{
   const result=request({unadjustedMovement:true});
   // Handle rejection on the original promise, not a chained rejection:
   // the existing BR/CH01 pause handlers must run without an extra frame.
   return result&&typeof result.then==='function'
    ?result.then(value=>{ensureCurrent();return value;},
      error=>{if(!isUnsupported(error))throw error;return fallback();})
    :result;
  }catch(error){
   if(!isUnsupported(error))throw error;
   return fallback();
  }
 }
 function mouseDelta(dx,dy,value){
  const x=Number.isFinite(dx)?dx:0,y=Number.isFinite(dy)?dy:0;
  const sensitivity=value.sensitivity;
  return {yaw:x===0?0:x*.0023*sensitivity,pitch:y===0?0:-y*.00165*sensitivity*(value.invertY?-1:1)};
 }
 // A hidden menu button can retain keyboard focus after Start/Resume on some
 // desktop browsers. Move focus to the actual gameplay canvas before asking
 // for pointer lock, so Space/arrow keys reach the game rather than a button.
 function focusGameplay(document,canvas){
  if(!canvas)return false;
  try{
   const active=document&&document.activeElement;
   if(active&&active!==canvas&&typeof active.blur==='function')active.blur();
   if(typeof canvas.focus!=='function')return false;
   if(!Number.isInteger(canvas.tabIndex)||canvas.tabIndex<0)canvas.tabIndex=-1;
   canvas.focus({preventScroll:true});
   return !!document&&document.activeElement===canvas;
  }catch(_){return false;}
 }
 function attach(document,storage,onChange){
  let current=load(storage),capturing=false;
  const get=id=>document.getElementById(id);
  const sensitivity=get('desktopSensitivity'),invert=get('desktopInvertY');
  const action=get('desktopBindAction'),button=get('desktopBindKey'),status=get('desktopBindStatus');
  const fullscreen=get('desktopFullscreen'),reset=get('desktopReset');
  const selected=()=>Object.prototype.hasOwnProperty.call(DEFAULT_BINDINGS,action.value)?action.value:'reload';
  function refresh(){
   sensitivity.value=String(current.sensitivity);
   invert.checked=current.invertY;
   button.textContent=capturing?'다음 키 입력 · ESC 취소':current.bindings[selected()];
  }
  function change(next){
   current=normalize(next);
   const saved=save(storage,current);
   if(typeof onChange==='function')onChange();
   refresh();
   if(!saved)status.textContent='PC 조작 설정을 디스크에 저장하지 못했습니다. 현재 탭에만 적용됩니다.';
   return saved;
  }
  sensitivity.addEventListener('change',()=>change({...current,sensitivity:Number(sensitivity.value)}));
  invert.addEventListener('change',()=>change({...current,invertY:!!invert.checked}));
  action.addEventListener('change',refresh);
  button.addEventListener('click',()=>{capturing=true;status.textContent='원하는 키를 누르세요. ESC는 취소합니다.';refresh();});
  reset.addEventListener('click',()=>{
   capturing=false;
   if(change(DEFAULT))status.textContent='PC 조작 설정을 기본값으로 복원하고 저장했습니다.';
  });
  // Other Windows browser tabs share the same desktop binding key. A remote
  // remap (or localStorage.clear) must not leave BR/CH01 with stale held fire,
  // movement or mouse sensitivity. Storage events do not fire in the writer tab.
  const view=document.defaultView;
  if(view&&typeof view.addEventListener==='function')view.addEventListener('storage',event=>{
   if(event.key!==STORAGE_KEY&&event.key!==null)return;
   if(event.storageArea&&event.storageArea!==storage)return;
   const next=load(storage);
   if(!capturing&&JSON.stringify(next)===JSON.stringify(current))return;
   current=next;
   capturing=false;
   if(typeof onChange==='function')onChange();
   status.textContent='다른 탭의 PC 조작 설정을 적용했습니다.';
   refresh();
  });
  // Focusing a PC settings field does not blur the window. Discard any
  // movement/held-fire latch immediately, rather than letting the offline
  // 60Hz world keep acting on an old keydown while the player edits a menu.
  if(typeof document.addEventListener==='function')document.addEventListener('focusin',event=>{
   if(isInteractiveTarget(event.target)&&typeof onChange==='function')onChange();
  });
  fullscreen.addEventListener('click',()=>{
   const element=document.documentElement||get('app');
   try{
    const fn=document.fullscreenElement?document.exitFullscreen?.bind(document):element?.requestFullscreen?.bind(element);
    if(!fn){status.textContent='이 환경에서는 전체화면을 지원하지 않습니다.';return;}
    const result=fn();
    if(result&&typeof result.catch==='function')result.catch(()=>{status.textContent='전체화면 요청이 거부되었습니다.';});
   }catch(_){status.textContent='전체화면 요청이 거부되었습니다.';}
  });
  function captureKey(event){
   if(!capturing)return false;
   // Do not steal browser/OS chords while listening for a new game key.
   if(isModifiedGameplayKey(event))return false;
   if(isGameplayShortcut(event))return false;
   event.preventDefault();
   if(event.code==='Escape'){capturing=false;status.textContent='키 변경을 취소했습니다.';refresh();return true;}
   if(event.repeat)return true;
   const result=bind(current,selected(),event.code);
   if(!result.ok){status.textContent=result.reason==='key-in-use'?'이미 사용 중인 키입니다. 다른 키를 누르세요.':'사용할 수 없는 키입니다. 다른 키를 누르세요.';return true;}
   capturing=false;
   if(change(result.value))status.textContent='키 설정을 저장했습니다.';
   return true;
  }
  function cancel(){capturing=false;refresh();}
  refresh();
  return {get:()=>current,captureKey,cancel};
 }
 const api={STORAGE_KEY,DEFAULT_BINDINGS,ACTIONS,normalize,load,save,bind,keyLabel,storyHintText,actionFor,isModifiedGameplayKey,pcMenuEscape,isWindowsPC,isInteractiveTarget,isTextEntryTarget,isGameplayShortcut,mouseDelta,focusGameplay,requestPrecisionPointerLock,createTriggerLatch,attach};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.VeilpointDesktopControls=api;
})(typeof globalThis!=='undefined'?globalThis:this);
