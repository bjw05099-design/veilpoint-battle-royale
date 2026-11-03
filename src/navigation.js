/* VEILPOINT / PC navigation: public mission markers and the visible safe zone only.
 * This read-only view never changes the 60Hz world or exposes unseen opponents.
 */
(function (root, factory) {
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.VeilpointNavigation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TAU=Math.PI*2;
  function direction(player,target){
    if(!player||!target||![player.x,player.z,player.yaw,target.x,target.z].every(Number.isFinite))return null;
    const dx=target.x-player.x,dz=target.z-player.z;
    const meters=Math.hypot(dx,dz);
    const bearing=Math.atan2(dx,-dz);
    const delta=Math.atan2(Math.sin(bearing-player.yaw),Math.cos(bearing-player.yaw));
    const angle=Math.abs(delta);
    const side=delta<0?'왼쪽':'오른쪽';
    const label=meters<1?'현재 위치':angle<=Math.PI/12?'정면':
      angle<=Math.PI/3?side+' 앞':angle<=2*Math.PI/3?side:'뒤쪽';
    return Object.freeze({meters,delta,label});
  }
  function story(player,markers){
    if(!Array.isArray(markers)||!markers.length)return '현재 안내할 임무 표식 없음';
    let nearest=null,best=Infinity;
    for(const marker of markers){
      const nav=direction(player,marker);
      if(nav&&nav.meters<best){nearest={marker,nav};best=nav.meters;}
    }
    if(!nearest)return '현재 안내할 임무 표식 없음';
    // Straight-line distance is not a pathfinding claim; physical obstacles still apply.
    return '가장 가까운 임무 표식 · '+nearest.marker.label+' · '+nearest.nav.label+
      ' · 직선거리 약 '+Math.round(nearest.nav.meters)+'m (장애물 우회 필요 가능)';
  }
  function zone(player,zone){
    if(!zone||![zone.x,zone.z,zone.radius].every(Number.isFinite)||zone.radius<=0)
      return '안전 구역 안내 불가';
    const nav=direction(player,zone);
    if(!nav)return '안전 구역 안내 불가';
    const remaining=zone.radius-nav.meters;
    return remaining>=0?'현재 안전 구역 내부 · 경계까지 직선거리 약 '+Math.round(remaining)+'m':
      '안전 구역 밖 · 경계까지 직선거리 약 '+Math.ceil(-remaining)+'m · 중심은 '+nav.label;
  }
  return Object.freeze({direction,story,zone});
});
