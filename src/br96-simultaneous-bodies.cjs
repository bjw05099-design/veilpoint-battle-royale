'use strict';
// Resolve simultaneous civilian-body positions without giving the earliest
// roster slot an update-order advantage. There is no client-supplied collision
// override, remote location data or weapon logic.
function settleBodyProposals(proposals,radius){
 if(!Array.isArray(proposals)||proposals.length>96||
    !Number.isFinite(radius)||radius<=0)throw new TypeError('invalid_body_proposals');
 const safe=2*radius-1e-8;
 let rollbacks=0;
 // Every rollback permanently resets one proposal to its starting location.
 // Since starting 96-body positions are already nonoverlapping, the
 // constraint must converge in at most N passes; one pass is NOT sufficient:
 // rolling back C after a B-C conflict can make C collide with A's move even
 // if A-C was previously checked.
 for(let pass=0;pass<=proposals.length;pass++){
  let changed=false;
  for(let i=0;i<proposals.length;i++){
   const a=proposals[i];
   for(let j=i+1;j<proposals.length;j++){
    const b=proposals[j];
    if(Math.hypot(a.next.x-b.next.x,a.next.z-b.next.z)>=safe)continue;
    for(const p of [a,b]){
     if(Math.hypot(p.next.x-p.actor.x,p.next.z-p.actor.z)>1e-10){
      p.next={x:p.actor.x,z:p.actor.z};rollbacks++;changed=true;
     }
    }
   }
  }
  if(!changed)return Object.freeze({rollbacks,passes:pass+1});
 }
 throw new Error('nonconvergent_body_collision');
}
module.exports={settleBodyProposals};
