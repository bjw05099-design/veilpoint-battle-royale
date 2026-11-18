'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
async function verifyAdenBrowser({rpc,sleep,directory}){
 const faults=[];
 const read=async expression=>{
  const response=await rpc('Runtime.evaluate',{expression,returnByValue:true});
  if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));
  return response.result?.value;
 };
 const until=async(expression,message,timeout=35000)=>{
  const start=Date.now();
  while(Date.now()-start<timeout){if(await read(expression))return;await sleep(180);}
  throw Error(message);
 };
 const key=(code,key,virtual,type)=>rpc('Input.dispatchKeyEvent',
  {type,code,key,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual});
 const tap=async(code,label,virtual)=>{
  await key(code,label,virtual,'keyDown');await key(code,label,virtual,'keyUp');
 };
 const colors=`(()=>{
  const canvas=document.getElementById('map'),context=canvas.getContext('2d');
  const {width,height}=canvas,pixels=context.getImageData(0,0,width,height).data,seen=new Set();
  for(let y=16;y<height;y+=31)for(let x=16;x<width;x+=31){
   const pixel=4*(y*width+x);
   seen.add((pixels[pixel]<<16)|(pixels[pixel+1]<<8)|pixels[pixel+2]);
  }
  return seen.size;
 })()`;
 const url=pathToFileURL(path.resolve(directory,'index.html')).href;
 await rpc('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
 const navigation=await rpc('Page.navigate',{url});
 assert.equal(navigation.errorText,undefined,'Offline package must load from file URL');
 await rpc('Page.bringToFront');
 await until('document.getElementById("objective")?.textContent==="첫 수신 기록 확인"','Missing live objective');
 assert.ok(await read(colors)>4,'Street map must render the sourced terrain and geometry');
 const map=(await rpc('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data;
 await tap('KeyM','m',77);
 assert.equal(await read('document.getElementById("region").getAttribute("aria-pressed")'),'true');
 assert.match(await read('document.getElementById("scale").textContent'),/40\.96 × 35\.84km/);
 assert.ok(await read(colors)>4,'Regional map must render the source elevation ramp');
 const region=(await rpc('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data;
 assert.notEqual(map,region);
 await tap('KeyM','m',77);
 await tap('KeyV','v',86);
 assert.equal(await read('document.getElementById("view").getAttribute("aria-pressed")'),'true');
 assert.ok(await read(colors)>4,'Street perspective must render visible source terrain');
 const eye=(await rpc('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data;
 assert.notEqual(map,eye);
 for(let i=1;i<=3;i++){
  await key('KeyW','w',87,'keyDown');
  try{await until('document.getElementById("action")?.disabled===false','Could not reach stage '+i);}
  finally{await key('KeyW','w',87,'keyUp');}
  await tap('KeyF','f',70);
  if(i===3){
   await until('document.getElementById("report")?.hidden===false','Handoff choice missing');
   await tap('Digit2','2',50);
   assert.equal(await read('document.getElementById("entries-count").textContent'),'2');
   await tap('Digit1','1',49);
  }
  await until('document.getElementById("entries-count")?.textContent==='+JSON.stringify(String(i)),'F interaction did not advance stage '+i);
 }
 await until('document.getElementById("saved")?.textContent==="이 지점까지 자동 저장됨"','Checkpoint was not written');
 await rpc('Page.reload');
 await until('document.getElementById("phase")?.textContent==="현장 인계 완료"','Reload did not restore completed handoff');
 const sizes=[[1024,600],[2560,1440]];
 for(const [width,height]of sizes){
  await rpc('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const clipped=await read('document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight');
  if(clipped)faults.push(width+'x'+height);
 }
 assert.deepEqual(faults,[],'Story browser layout overflow');
 return {realBrowser:true,fileUrl:true,phasesCompleted:3,restored:true,
  wrongReportRejected:true,regionalOverviewVerified:true,canvasRenderVerified:true,
  viewports:[[1366,768],...sizes],map,eye,region};
}
module.exports={verifyAdenBrowser};
