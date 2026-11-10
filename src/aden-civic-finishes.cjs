'use strict';
// Original non-georeferenced civilian art material variants for optional UE5 lab.
// This does not alter terrain, entrances, collision, or surveyed Aden coverage.
const {createHash}=require('node:crypto');
const {SCENE_FORMAT}=require('./aden-civic-street-details.cjs');
const FINISHES=Object.freeze({
 'warm-lime':[[.76,.69,.57],[.69,.63,.54],[.81,.72,.60]],
 'sandstone-edge':[[.54,.48,.40],[.59,.51,.43],[.48,.44,.39]],
 'aged-wood':[[.37,.28,.20],[.31,.25,.19],[.43,.32,.22]],
 'painted-lattice':[[.48,.38,.27],[.38,.35,.29],[.54,.43,.33]],
 'muted-glass':[[.25,.34,.33],[.29,.36,.35],[.22,.31,.30]],
 'cloth-cream':[[.71,.62,.46],[.77,.68,.53],[.63,.58,.48]],
 'terra-frieze':[[.61,.43,.31],[.55,.39,.30],[.67,.48,.36]],
 'street-paving':[[.50,.48,.43],[.46,.45,.41],[.53,.50,.44]],
 'street-edge':[[.37,.36,.34],[.41,.39,.36],[.34,.34,.33]]
});
function applyCivilFinishes(scene){
 if(!scene||scene.format!==SCENE_FORMAT||
  scene.coordinateSystem!=='local-metre-unreferenced'||
  scene.actualAdenCoverageVerified!==false||
  scene.sensitiveOperationalSites!==false||
  !Array.isArray(scene.parts)||scene.parts.length===0)
  throw new TypeError('Original local civilian street required');
 const seen=new Set();
 const materials=scene.parts.map(p=>{
  if(!p||typeof p.id!=='string'||seen.has(p.id)||
   typeof p.finish!=='string'||!Object.hasOwn(FINISHES,p.finish))
   throw new TypeError('Invalid or duplicate civilian detail');
  seen.add(p.id);
  const variants=FINISHES[p.finish];
  const digest=createHash('sha256').update(p.id+'|'+p.finish).digest();
  const variant=digest[0]%variants.length;
  // Three per-finish material assets reuse the same native UE5 shader.
  // A per-part random scalar would require 181 separate material assets just
  // to convey imperceptible roughness jitter, wasting editor/game resources.
  const finishDigest=createHash('sha256').update(p.finish+'|'+variant).digest();
  const roughness=Number((.63+finishDigest[0]/255*.25).toFixed(4));
  return Object.freeze({partId:p.id,baseFinish:p.finish,
   variant,baseColor:Object.freeze([...variants[variant]]),
   roughness,metallic:0,emissive:false,
   collisionUnchanged:true});
 });
 return Object.freeze({format:'veilpoint-original-civil-finishes-v1',
  coordinateSystem:scene.coordinateSystem,originalArchitectureOnly:true,
  actualAdenCoverageVerified:false,sensitiveOperationalSites:false,
  sourceStreetFormat:scene.format,partCount:materials.length,
  assignments:Object.freeze(materials)});
}
module.exports={FINISHES,applyCivilFinishes};
