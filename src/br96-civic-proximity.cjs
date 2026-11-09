'use strict';
// Server-side civic surface proximity. This is derived from authenticated
// actor coordinates, never from a client-supplied marker or target.
function nearbyCivicSurfaces(actor, pavements, reach=12) {
  if (!actor || !Number.isFinite(actor.x) || !Number.isFinite(actor.z))
    throw new TypeError('server_actor_required');
  if (!Array.isArray(pavements) || !Number.isFinite(reach) || reach<0)
    throw new TypeError('invalid_civic_geometry');
  return pavements.filter(p => {
    if (!p || ![p.x,p.z,p.w,p.d].every(Number.isFinite) || p.w<=0 || p.d<=0)
      return false;
    const dx=Math.max(0,Math.abs(actor.x-p.x)-p.w/2);
    const dz=Math.max(0,Math.abs(actor.z-p.z)-p.d/2);
    return dx*dx+dz*dz<=reach*reach;
  }).map(p=>p.id);
}
module.exports={nearbyCivicSurfaces};
