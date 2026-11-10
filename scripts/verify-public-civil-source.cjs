'use strict';
// Fail-closed provenance gate for future public, civilian elevation inputs.
// This validates declared evidence; it does NOT authenticate external licenses.
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const ALLOWED=new Set(['public-civilian-elevation','public-civilian-shoreline']);
const LICENSES=new Set(['CC0-1.0','CC-BY-4.0','ODbL-1.0','public-domain']);
const HEX=/^[a-f0-9]{64}$/;
function verify(record,root){
 if(!record||typeof record!=='object'||Array.isArray(record))throw Error('record object required');
 if(!ALLOWED.has(record.kind))throw Error('only civilian terrain or shoreline sources allowed');
 if(!LICENSES.has(record.license))throw Error('license not on reviewed allowlist');
 if(record.license==='ODbL-1.0'&&!record.attribution)throw Error('ODbL attribution required');
 if(record.license==='CC-BY-4.0'&&!record.attribution)throw Error('CC-BY attribution required');
 if(typeof record.sourceUrl!=='string'||!/^https:\/\//.test(record.sourceUrl))throw Error('HTTPS source required');
 const u=new URL(record.sourceUrl);
 if(u.username||u.password||!u.hostname.includes('.'))throw Error('invalid public source URL');
 for(const k of ['observedOn','retrievedOn','licenseReviewedOn']){
  const v=record[k];
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||
     Number.isNaN(Date.parse(v))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)
   throw Error(k+' must be a real ISO calendar date');
 }
 if(record.observedOn>record.retrievedOn||record.licenseReviewedOn>record.retrievedOn)
  throw Error('date chronology invalid');
 if(record.restrictedSite||record.operationalDetail||record.claimsSurveyedAden===true)
  throw Error('restricted operational content or unverified surveyed claim rejected');
 if(typeof record.localFile!=='string'||!/^[-\w./]+$/.test(record.localFile)||
    record.localFile.startsWith('/')||record.localFile.split('/').some(
      part=>!part||part==='.'||part==='..'))
  throw Error('unsafe relative localFile');
 if(typeof record.sha256!=='string'||!HEX.test(record.sha256))throw Error('SHA256 required');
 const base=fs.realpathSync(root);
 // An uploaded local terrain archive may contain redirects or directory links.
 // The pathname must reference real files underneath this declared root,
 // not a different source hidden behind a symlink/junction.
 let local=base;
 for(const component of record.localFile.split('/')){
  local=path.join(local,component);
  if(fs.lstatSync(local).isSymbolicLink())
   throw Error('linked or redirected civilian input rejected');
 }
 const file=fs.realpathSync(local);
 if(!file.startsWith(base+path.sep))throw Error('file outside input root');
 const stat=fs.statSync(file);
 if(!stat.isFile()||stat.size===0||stat.size>64*1024*1024)throw Error('invalid file size');
 const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(actual!==record.sha256)throw Error('source hash mismatch');
 return Object.freeze({kind:record.kind,license:record.license,observedOn:record.observedOn,
  retrievedOn:record.retrievedOn,sha256:actual,bytes:stat.size,
  verifiedLocalIntegrity:true,verifiedExternalAuthenticity:false,
  verifiedAdenCoverage:false,usableForNativeTerrain:false});
}
// A multi-tile public input is only as reliable as its least trustworthy
// file. Validate every civilian elevation/coastline source before generating
// any local terrain manifest. Never mistake a matching hash for permission
// to publish, surveyed Aden coverage or native UE5 readiness.
function verifyCollection(records,root){
 if(!Array.isArray(records)||records.length===0||records.length>49)
  throw Error('civilian source batch must contain 1 to 49 records');
 const paths=new Set(),verified=[];
 for(const record of records){
  if(!record||typeof record.localFile!=='string'||paths.has(record.localFile))
   throw Error('duplicate or invalid civilian source file');
  paths.add(record.localFile);
  verified.push(verify(record,root));
 }
 const entries=records.map((record,index)=>Object.freeze({
  kind:verified[index].kind,localFile:record.localFile,sha256:verified[index].sha256
 })).sort((a,b)=>a.localFile.localeCompare(b.localFile));
 const manifestSha256=crypto.createHash('sha256')
   .update(JSON.stringify(entries)).digest('hex');
 return Object.freeze({
  format:'veilpoint-local-civil-source-audit-v1',
  manifestSha256,inputCount:verified.length,
  verifiedLocalIntegrity:true,verifiedExternalAuthenticity:false,
  verifiedAdenCoverage:false,usableForNativeTerrain:false,
  records:Object.freeze(verified)
 });
}
module.exports={verify,verifyCollection};
