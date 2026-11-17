'use strict';
const fs=require('node:fs'),path=require('node:path');const {build}=require('./prepare-ch01-production.cjs');const root=path.resolve(__dirname,'..');
const target=process.argv[2]||path.join(root,'dist/ch01-production');const data=build(target);
const html=fs.readFileSync(path.join(root,'tools/ch01-workshop.html'),'utf8').replace('/*CHAPTER_CODE*/',()=>fs.readFileSync(path.join(root,'src/ch01/last-broadcast.js'),'utf8')).replace('/*PRODUCTION_JSON*/',()=>JSON.stringify(data).replace(/</g,'\\u003c'));
fs.writeFileSync(path.join(target,'workshop.html'),html);console.log('Standalone CH01 authoring workshop built');
