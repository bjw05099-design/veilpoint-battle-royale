/* VEILPOINT offline BR reproducible challenge setup. No networking or secrets. */
(function(root){
'use strict';
const ROSTERS=Object.freeze([1,4,18]);
const SITES=Object.freeze(['central','service','east','west','ferry']);
const LIGHTS=Object.freeze(['day','dusk']);
const WEAPONS=Object.freeze(['carbine','compact','marksman','shotgun','support','sidearm','precision']);
const MAX_SEED=9999999999;
const FIELDS=/^VP1\.([0-9a-z]{1,7})\.(1|4|18)\.([a-z]+)\.([a-z]+)\.([a-z]+)\.([0-9a-z]{7})$/;
function checksum(payload){
 // FNV-1a is a typo detector, not authentication or an online match ID.
 let v=2166136261;
 for(const ch of payload){v^=ch.charCodeAt(0);v=Math.imul(v,16777619)>>>0;}
 return v.toString(36).padStart(7,'0');
}
function validate(settings){
 if(!settings||typeof settings!=='object'||Array.isArray(settings)||
    !Number.isSafeInteger(settings.seed)||settings.seed<0||settings.seed>MAX_SEED||
    !ROSTERS.includes(settings.roster)||!SITES.includes(settings.site)||
    !LIGHTS.includes(settings.lighting)||!WEAPONS.includes(settings.weapon))
   throw new RangeError('Invalid offline BR challenge configuration');
 return {seed:settings.seed,roster:settings.roster,weapon:settings.weapon,
   site:settings.site,lighting:settings.lighting};
}
function encode(settings){
 const c=validate(settings);
 const payload=['VP1',c.seed.toString(36),c.roster,c.weapon,c.site,c.lighting].join('.');
 return payload+'.'+checksum(payload);
}
function decode(raw){
 if(typeof raw!=='string'||raw.length>95||raw!==raw.trim())throw new RangeError('Invalid BR challenge code');
 const match=FIELDS.exec(raw);
 if(!match)throw new RangeError('Invalid BR challenge code');
 const [,seedPart,rosterPart,weapon,site,lighting,check]=match;
 const payload=raw.slice(0,raw.lastIndexOf('.'));
 if(checksum(payload)!==check)throw new RangeError('BR challenge code checksum mismatch');
 const seed=parseInt(seedPart,36);
 const settings=validate({seed,roster:Number(rosterPart),weapon,site,lighting});
 if(settings.seed.toString(36)!==seedPart||encode(settings)!==raw)
  throw new RangeError('Noncanonical BR challenge code');
 return Object.freeze(settings);
}
const api=Object.freeze({encode,decode,MAX_SEED});
if(typeof module==='object'&&module.exports)module.exports=api;
root.VeilpointBRChallenge=api;
})(typeof globalThis==='object'?globalThis:this);
