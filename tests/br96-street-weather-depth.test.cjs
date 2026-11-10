'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Street=require('../src/br96-street-view.js');
const {coastalWeatherAtTick}=require('../src/br-coastal-weather.cjs');
test('BR96 street camera blends public weather gradually with depth instead of a flat-color pop',()=>{
 const clear=coastalWeatherAtTick(0),haze=coastalWeatherAtTick(3600);
 const close=Street.weatherFogFraction(1,haze.visibilityMeters,haze.code);
 const far=Street.weatherFogFraction(10,haze.visibilityMeters,haze.code);
 assert.equal(close,0);
 assert.ok(far>close&&far<1);
 assert.ok(Street.weatherFogFraction(10,haze.visibilityMeters,haze.code)>
   Street.weatherFogFraction(10,clear.visibilityMeters,clear.code));
 assert.notEqual(Street.shade('building',10,12,'sea-haze'),
   Street.shade('building',10,18,'clear'));
 assert.notEqual(Street.shade('warehouse',3,12,'sea-haze'),
   Street.shade('warehouse',10,12,'sea-haze'));
 for(const bad of [-1,Infinity,NaN])assert.throws(()=>
   Street.weatherFogFraction(bad,12,'sea-haze'),/invalid_weather_fog/);
});
test('fog respects authoritative 96-player sight limits and never reveals non-disclosed rivals',()=>{
 const me={id:1,x:0,z:0},rival={id:9,x:0,z:-14};
 const clear=coastalWeatherAtTick(0),haze=coastalWeatherAtTick(3600);
 const common={subject:me,obstacles:[],squad:[],visible:[rival],yaw:0};
 const a=Street.frame({...common,visibilityMeters:clear.visibilityMeters});
 const b=Street.frame({...common,visibilityMeters:haze.visibilityMeters});
 assert.equal(a.seen.some(p=>p.id===9),true);
 assert.equal(b.seen.some(p=>p.id===9),false);
 assert.deepEqual(Street.frame({...common,visible:[],visibilityMeters:clear.visibilityMeters}).seen,[]);
 assert.equal(a.maxDistance,18);
 assert.equal(b.maxDistance,12);
});
test('actual PC canvas draw shades buildings and allied silhouettes from public round conditions',()=>{
 const ctx={styles:[],alphas:[],_fill:'',
  set fillStyle(v){this._fill=v;this.styles.push(v);},get fillStyle(){return this._fill;},
  set globalAlpha(v){this.alphas.push(v);},get globalAlpha(){return 1;},
  fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};
 const props={width:1024,height:600,subject:{id:1,x:0,z:0},yaw:0,
  obstacles:[{x:0,z:-7,w:3,d:1,h:3,type:'building'}],
  squad:[{id:2,x:1,z:-5,eligible:true}],visible:[]};
 Street.draw(ctx,{...props,visibilityMeters:12,weather:coastalWeatherAtTick(3600)});
 assert.ok(ctx.styles.some(v=>/^rgb\(/.test(v)),'physical walls have depth-tinted colors');
 assert.ok(ctx.alphas.some(x=>x<1&&x>=0),'distant visible person fades into haze');
 assert.equal(ctx.alphas.at(-1),1,'drawing does not leak alpha state to HUD');
 assert.equal(ctx.styles[0],'#667b7e','haze changes the real painted sky');
 ctx.styles=[];ctx.alphas=[];
 Street.draw(ctx,{...props,visibilityMeters:18,weather:coastalWeatherAtTick(0)});
 assert.equal(ctx.styles[0],'#708b92','clear weather has a distinct public sky');
});
