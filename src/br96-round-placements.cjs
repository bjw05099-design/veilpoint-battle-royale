'use strict';
// Deterministic server-owned squad placement ledger. No client-supplied ranks.
class RoundPlacements {
 constructor(){this.active=new Map();this.eliminated=[];this.finished=false;}
 register(squadId,memberIds){
  if(this.finished||this.active.has(squadId)||!Number.isInteger(squadId)||squadId<0||squadId>=16||
    !Array.isArray(memberIds)||memberIds.length<1||memberIds.length>6||
    new Set(memberIds).size!==memberIds.length||memberIds.some(id=>typeof id!=='string'||!id))
    throw new RangeError('invalid_squad');
  this.active.set(squadId,new Set(memberIds));
 }
 eliminateMember(squadId,memberId){
  if(this.finished)return null;
  const members=this.active.get(squadId);
  if(!members||!members.delete(memberId))return null;
  if(members.size)return null;
  this.active.delete(squadId);
  const record=Object.freeze({squadId,placement:this.active.size+1});
  this.eliminated.push(record);
  if(this.active.size<=1)this.finished=true;
  return record;
 }
 result(){
  const winner=this.finished&&this.active.size===1?[...this.active.keys()][0]:null;
  return {finished:this.finished,winner,placements:this.eliminated.map(x=>({...x})),
   remainingSquads:this.active.size};
 }
}
module.exports={RoundPlacements};
