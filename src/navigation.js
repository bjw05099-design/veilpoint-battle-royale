/* VEILPOINT / PC navigation: public mission markers and the visible safe zone only.
 * This read-only view never changes the 60Hz world or exposes unseen opponents.
 */
(function (root, factory) {
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.VeilpointNavigation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
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
  // Segment-versus-AABB test in the horizontal collision plane. The HUD
  // warns about an obstructed direct line without pretending to route-find.
  function directLineBlocked(player,target,obstacles){
    if(!player||!target||!Array.isArray(obstacles))return false;
    if(![player.x,player.z,target.x,target.z].every(Number.isFinite))return false;
    const dx=target.x-player.x,dz=target.z-player.z;
    for(const o of obstacles){
      if(!o||![o.x,o.z,o.w,o.d].every(Number.isFinite)||o.w<=0||o.d<=0)continue;
      // A small clearance margin reflects the player's collision footprint.
      const minX=o.x-o.w/2-.85,maxX=o.x+o.w/2+.85;
      const minZ=o.z-o.d/2-.85,maxZ=o.z+o.d/2+.85;
      let enter=0,leave=1,miss=false;
      for(const [origin,delta,min,max] of [[player.x,dx,minX,maxX],[player.z,dz,minZ,maxZ]]){
        if(Math.abs(delta)<1e-9){if(origin<min||origin>max){miss=true;break;}continue;}
        const a=(min-origin)/delta,b=(max-origin)/delta;
        enter=Math.max(enter,Math.min(a,b));
        leave=Math.min(leave,Math.max(a,b));
        if(enter>leave){miss=true;break;}
      }
      if(!miss&&leave>=0&&enter<=1)return true;
    }
    return false;
  }
  // PC guidance selection follows the public objective's stable identity, not
  // the temporary array offset. Escort prompts and optional records may appear
  // or disappear as the 60Hz world changes; a stale index must never retarget.
  function markerIndex(markers,selectedId){
    if(!Array.isArray(markers)||typeof selectedId!=='string'||!selectedId)return null;
    const index=markers.findIndex(m=>m&&m.id===selectedId);
    return index>=0?index:null;
  }
  function nextMarkerId(markers,selectedId=null){
    if(!Array.isArray(markers)||markers.length===0)return null;
    const index=markerIndex(markers,selectedId);
    const next=index===null?0:index+1;
    return next<markers.length&&markers[next]&&typeof markers[next].id==='string'
      ?markers[next].id:null;
  }
  function story(player,markers,selectedIndex=null,obstacles=null){
    if(!Array.isArray(markers)||!markers.length)return '현재 안내할 임무 표식 없음';
    let nearest=null,best=Infinity;
    for(const marker of markers){
      const nav=direction(player,marker);
      if(nav&&nav.meters<best){nearest={marker,nav};best=nav.meters;}
    }
    if(!nearest)return '현재 안내할 임무 표식 없음';
    const selected=Number.isInteger(selectedIndex)&&selectedIndex>=0&&selectedIndex<markers.length
      ?{marker:markers[selectedIndex],nav:direction(player,markers[selectedIndex])}:null;
    if(selected&&selected.nav)nearest=selected;
    // Straight-line distance is not a pathfinding claim; physical obstacles still apply.
    return (selected&&selected.nav?'선택한 임무 표식':'가장 가까운 임무 표식')+' · '+nearest.marker.label+' · '+nearest.nav.label+
      ' · 직선거리 약 '+Math.round(nearest.nav.meters)+'m '+(directLineBlocked(player,nearest.marker,obstacles)?'(직선 경로 차단 · 장애물 우회 필요)':'(장애물 우회 필요 가능)');
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
  return Object.freeze({direction,directLineBlocked,markerIndex,nextMarkerId,story,zone});
});
