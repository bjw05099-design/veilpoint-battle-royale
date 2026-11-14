import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {dedup, weld, simplify, prune} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import validator from 'gltf-validator';

const directory=path.resolve(process.argv[2]||'dist/game-assets/harbor');
const input=path.join(directory,'harbor.glb'),output=path.join(directory,'harbor-lod1.glb');
const validate=async filename=>{
 const report=await validator.validateBytes(new Uint8Array(fs.readFileSync(filename)),{
  uri:path.basename(filename),writeTimestamp:false,maxIssues:100,
  externalResourceFunction:()=>Promise.reject(Error('Export must be a self-contained GLB'))});
 fs.writeFileSync(filename+'.validation.json',JSON.stringify(report,null,2)+'\n');
 assert.equal(report.issues.numErrors,0,'Invalid glTF asset');
 return report;
};
await validate(input);
await MeshoptSimplifier.ready;
const io=new NodeIO(),document=await io.read(input);
const triangles=()=>document.getRoot().listMeshes().reduce((sum,mesh)=>sum+mesh.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
const before=triangles(),nodeCount=document.getRoot().listNodes().length;
assert.equal(nodeCount,10,'Visual GLB must contain ten meshes and no collision proxies');
assert.ok(!document.getRoot().listNodes().some(n=>n.getName().startsWith('UCX_')));
await document.transform(dedup(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.45,error:.002}),prune());
const after=triangles();
assert.ok(after>0&&after<=before,'LOD must not increase polygon count');
assert.equal(document.getRoot().listNodes().length,nodeCount,'LOD must preserve separate physical parts');
await io.write(output,document);
const report=await validate(output);
const evidence={schema:'veilpoint-harbor-asset-pipeline-v1',inputTriangles:before,lodTriangles:after,
 inputBytes:fs.statSync(input).size,lodBytes:fs.statSync(output).size,
 gltfErrors:report.issues.numErrors,gltfWarnings:report.issues.numWarnings,
 nodeCount,unrealImportVerified:false};
fs.writeFileSync(path.join(directory,'asset-pipeline.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
