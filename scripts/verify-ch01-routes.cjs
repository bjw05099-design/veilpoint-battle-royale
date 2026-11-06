'use strict';
// CH01 two-route release gate. The critical central and exit corridors are
// traversed through real 60Hz player movement and solid world collision.
// Optional distant markers are fast-forwarded, never claimed as walking QA.
// Neither a test script nor a CI runner replaces real human Windows play.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const Story=require('../src/story-slice.js');

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function runRoute(route){
  assert.ok(['evacuation','verification'].includes(route));
  let state=Story.createState(),checkpoints=[],walkSegments=[];
  const at=id=>{
    const target=Story.POINTS[id];
    assert.ok(target,'authored marker '+id+' must exist');
    state.world.player.x=target.x;state.world.player.z=target.z;
  };
  const check=label=>{
    const raw=Story.serialize(state);
    const recovered=Story.restore(raw);
    assert.equal(Story.serialize(recovered),raw,label+' checkpoint must round-trip exactly');
    const tasks=Story.missionTasks(recovered);
    checkpoints.push({label,phase:recovered.phase,elapsed:+recovered.world.elapsed.toFixed(5),
      sha256:sha(raw),taskStatus:tasks.map(task=>task.id+':'+task.status)});
    state=recovered;
  };
  // Physically traverse route-critical corridors rather than just granting
  // the next milestone by moving the state directly onto its trigger.
  const walkTo=(target,label)=>{
    const point=typeof target==='string'?Story.POINTS[target]:target;
    assert.ok(point&&Number.isFinite(point.x)&&Number.isFinite(point.z));
    const player=state.world.player;
    const start={x:player.x,z:player.z};
    let ticks=0,stalled=0,travelled=0;
    while(Math.hypot(player.x-point.x,player.z-point.z)>2.2&&ticks<1000){
      const dx=point.x-player.x,dz=point.z-player.z;
      player.yaw=Math.atan2(dx,-dz);
      const beforeX=player.x,beforeZ=player.z;
      Story.step(state,1/60,{forward:true});
      const moved=Math.hypot(player.x-beforeX,player.z-beforeZ);
      travelled+=moved;
      stalled=moved<1e-6?stalled+1:0;
      if(stalled>45)throw new Error(label+': physical route blocked by a solid');
      assert.notEqual(state.phase,'failed',label+': traversal must stay playable');
      ticks++;
    }
    const remaining=Math.hypot(player.x-point.x,player.z-point.z);
    assert.ok(remaining<=2.2,label+': did not reach an interactable physical location');
    assert.ok(ticks>0&&travelled>0,label+': expected actual 60Hz movement');
    walkSegments.push({label,ticks,distance:+travelled.toFixed(4),remaining:+remaining.toFixed(4),
      from:[+start.x.toFixed(4),+start.z.toFixed(4)],
      to:[+player.x.toFixed(4),+player.z.toFixed(4)]});
    check('walk-'+label);
  };
  const use=(marker,expected=marker,alreadyWalked=false)=>{
    if(!alreadyWalked)at(marker);
    assert.equal(Story.nearest(state)?.id,expected,'physical interaction '+marker);
    const result=Story.interact(state);
    assert.equal(result.ok,true,marker+': '+result.reason);
    assert.equal(result.event,expected,marker+' event');
    check(expected);
  };
  check('mission-start');
  walkTo('terminal','opening-to-terminal');
  use('terminal','terminal',true);
  assert.equal(state.phase,'engagement');
  // This scripted QA advances encounter aim/clock through game APIs, not by
  // directly setting the enemy cleared or granting a completed chapter.
  for(const actor of state.world.bots)for(let n=0;n<2;n++){
    state.world.player.yaw=Math.atan2(actor.x-state.world.player.x,
      -(actor.z-state.world.player.z));
    state.world.player.pitch=0;
    state.world.elapsed+=.21;
    assert.equal(Story.fire(state).hit,true);
  }
  assert.equal(state.phase,'records');
  check('encounter-completed');
  use('recordA');
  use('recordB');
  if(route==='verification')use('relay');
  // Optional evidence interactions above are accelerated. Rejoin the
  // authored central corridor and walk to the desk through actual collision.
  at('terminal');
  walkTo('decision','terminal-to-decision');
  use('decision','decision',true);
  assert.equal(state.phase,'decision');
  assert.equal(Story.choose(state,route).ok,true);
  assert.equal(state.phase,'exit');
  check('route-selected');

  if(route==='verification'){
    const half=state.gateClearanceDuration*30;
    for(let i=0;i<half;i++)Story.step(state,1/60,{});
    assert.equal(Story.situation(state).eastGateOpen,false);
    check('gate-halfway');
    for(let i=0;i<half+3;i++)Story.step(state,1/60,{});
    assert.equal(Story.situation(state).eastGateOpen,true);
    assert.equal(Story.missionTasks(state).find(x=>x.id==='exit').status,'available');
    check('gate-cleared');
    // The southern approach and east lateral corridor are both real moving
    // player paths; the physical gate is already released by its 60Hz timer.
    walkTo({x:0,z:-61},'decision-to-east-approach');
    walkTo('exitVerify','east-approach-to-exit');
    use('gateLog');
    use('reportDesk');
    use('exitVerify');
  }else{
    walkTo('exitEvac','decision-to-south-exit');
    use('muster');
    use('guide');
    assert.equal(state.guide.active,true);
    use('guideRelease');
    assert.equal(state.guide.released,true);
    use('aidPickup');
    at('exitEvac');
    assert.equal(Story.interact(state).reason,'cargo_handoff_required');
    check('cargo-exit-blocked');
    use('aidStage');
    assert.equal(state.world.carryingAid,false);
    use('aidResume');
    assert.equal(state.world.carryingAid,true);
    use('aidDrop');
    assert.equal(state.aidDelivered,true);
    use('exitEvac');
  }
  assert.equal(state.phase,'complete');
  assert.equal(state.world.status,'won');
  assert.equal(Story.missionTasks(state).find(x=>x.id==='exit').status,'done');
  const raw=Story.serialize(state);
  const verified=Story.reviewCompletedMission(raw);
  assert.equal(verified.report.route,route);
  assert.equal(verified.report.previewOnly,true);
  assert.equal(verified.report.campaignUnlocked,false);
  assert.equal(Story.serialize(verified.state),raw);
  if(route==='verification'){
    assert.equal(verified.report.gateLogReviewed,true);
    assert.equal(verified.report.logHandedOff,true);
    assert.equal(verified.report.clockDiscrepancy,'retransmission-confirmed');
  }else{
    assert.equal(verified.report.guideReleased,true);
    assert.equal(verified.report.aidDelivered,true);
    assert.equal(verified.report.musterConfirmed,true);
  }
  return {route,completed:true,previewOnly:true,finalCheckpointSha256:sha(raw),
    checkpointCount:checkpoints.length,checkpoints,walkSegments,
    report:{route:verified.report.route,civilianOutcome:verified.report.civilianOutcome,
      clockDiscrepancy:verified.report.clockDiscrepancy,guideReleased:verified.report.guideReleased,
      aidDelivered:verified.report.aidDelivered,logHandedOff:verified.report.logHandedOff}};
}
function generate(){
  return {schema:'veilpoint-ch01-route-check-v2',
    travelMode:'physical-central-corridors-plus-optional-marker-fast-forward',
    simulationHz:60,seedPolicy:'story-fixed-20261027',
    routes:[runRoute('evacuation'),runRoute('verification')]};
}
if(require.main===module){
  const result=JSON.stringify(generate(),null,2)+'\n';
  const index=process.argv.indexOf('--output');
  if(index>=0){
    const output=process.argv[index+1];
    if(!output||output.startsWith('--'))throw new Error('Expected --output file');
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,result);
    process.stdout.write('CH01 route verification passed: '+output+'\n');
  }else process.stdout.write(result);
}
module.exports={generate,runRoute};
