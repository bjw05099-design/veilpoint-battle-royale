"""Export the committed editable radio .blend to one visual+UCX per FBX."""
import hashlib
import json
import sys
from pathlib import Path
import bpy

source, output = [Path(a).resolve() for a in sys.argv[sys.argv.index('--')+1:]]
assert source.is_file() and not output.exists(), 'Require source and fresh export directory'
receipt = json.loads((source.parent/'receipt.json').read_text(encoding='utf-8'))
digest = hashlib.sha256(source.read_bytes()).hexdigest()
assert digest == receipt['files']['radio-desk.blend'], 'Committed Blender source hash mismatch'
output.mkdir(parents=True)
bpy.ops.wm.open_mainfile(filepath=str(source))
objects = sorted((o for o in bpy.context.scene.objects if o.type == 'MESH'), key=lambda o:o.name)
assert len(objects) == 9 and all(o.name.startswith('VP_LB_') for o in objects)
parts = []
for obj in objects:
    bpy.ops.object.select_all(action='DESELECT')
    # All authored parts are boxes; a matching single convex collider keeps
    # the actual leg gaps open. Export separately for legacy FBX UCX import.
    collider = obj.copy()
    collider.data = obj.data.copy()
    collider.name = 'UCX_'+obj.name+'_00'
    bpy.context.collection.objects.link(collider)
    obj.select_set(True)
    collider.select_set(True)
    bpy.context.view_layer.objects.active = obj
    filename = obj.name+'.fbx'
    bpy.ops.export_scene.fbx(filepath=str(output/filename), use_selection=True,
        object_types={'MESH'}, apply_unit_scale=True, axis_forward='-Y', axis_up='Z',
        bake_anim=False, add_leaf_bones=False)
    bpy.data.objects.remove(collider, do_unlink=True)
    parts.append({'name':obj.name,'file':filename,'sha256':hashlib.sha256((output/filename).read_bytes()).hexdigest(),'ucxCount':1})
(output/'unreal-parts.json').write_text(json.dumps({'schema':'veilpoint-radio-unreal-parts-v1',
    'sourceSha256':digest,'parts':parts,'dimensionsCm':[120,65,106],
    'originalPrototypeArt':True,'nativeImportVerified':False},indent=2)+'\n',encoding='utf-8')
print('VEILPOINT radio: 9 actual FBX exports, 9 UCX hulls from committed Blender original')
