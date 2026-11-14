"""Build original game geometry with Blender; run in --factory-startup mode.

Usage: blender -b --factory-startup --python-exit-code 1 --python this.py -- recipe.json output
Exports editable .blend, visual GLB, FBX with named convex collision boxes,
and a receipt. Does not import downloaded blend files or execute add-ons.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy


def material(name, color, roughness, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat


def box(name, location, dimensions, mat=None, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new('Manufactured edge', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.modifiers.new('Face normals', 'WEIGHTED_NORMAL')
    return obj


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('recipe', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    recipe = json.loads(args.recipe.read_text(encoding='utf-8'))
    if recipe['schema'] != 'veilpoint-harbor-blender-v1' or recipe['units'] != 'metres':
        raise ValueError('Unsupported source recipe')
    pieces = recipe['pieces']
    if len(pieces) != 8 or recipe['doorwayWidth'] != 4:
        raise ValueError('Incomplete physical hall')
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    concrete = material('VP_weathered_concrete', (.33, .31, .26), .92)
    metal = material('VP_roof_metal', (.22, .25, .26), .68, .65)
    timber = material('VP_shipping_timber', (.30, .18, .085), .87)
    visual, collision = [], []
    for index, part in enumerate(pieces):
        name = 'VP_Harbor_'+('Wall_' if part['type'].endswith('wall') else 'Cargo_')+str(index+1).zfill(2)
        pos = (part['x'], -part['z'], part['h']/2)
        size = (part['w'], part['d'], part['h'])
        visual.append(box(name, pos, size, concrete if index < 6 else timber, .018))
        collision.append(box('UCX_'+name+'_00', pos, size))
    room = recipe['room']
    visual.append(box('VP_Harbor_Roof', (0, 0, room['h']+.09), (room['w'], room['d'], .18), metal, .008))
    collision.append(box('UCX_VP_Harbor_Roof_00', (0, 0, room['h']+.09), (room['w'], room['d'], .18)))
    visual.append(box('VP_Harbor_Floor', (0, 0, .008), (room['w'], room['d'], .016), concrete))
    for obj in collision:
        obj.display_type = 'WIRE'
        obj.hide_render = True
    bpy.ops.object.select_all(action='DESELECT')
    for obj in visual:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = visual[0]
    bpy.ops.export_scene.gltf(filepath=str(out/'harbor.glb'), export_format='GLB',
                              use_selection=True, export_apply=True, export_extras=True)
    for obj in collision:
        obj.select_set(True)
    bpy.ops.export_scene.fbx(filepath=str(out/'harbor.fbx'), use_selection=True,
                             object_types={'MESH'}, add_leaf_bones=False, bake_anim=False,
                             axis_forward='-Y', axis_up='Z', apply_unit_scale=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'harbor.blend'))
    files = {name: {'bytes': (out/name).stat().st_size,
                   'sha256': hashlib.sha256((out/name).read_bytes()).hexdigest()}
             for name in ['harbor.glb', 'harbor.fbx', 'harbor.blend']}
    receipt = {'schema': 'veilpoint-blender-export-v1', 'blender': bpy.app.version_string,
               'sourceSha256': recipe['sourceSha256'], 'visualObjects': len(visual),
               'convexCollisionObjects': len(collision), 'doorwayWidthMetres': 4,
               'dimensionsMetres': [room['w'], room['d'], room['h']+.18],
               'originalPrototypeGeometry': True, 'unrealImportVerified': False, 'files': files}
    (out/'blender-export.json').write_text(json.dumps(receipt, indent=2)+'\n', encoding='utf-8')
    print('VEILPOINT Blender exports verified: '+str(out))


if __name__ == '__main__':
    main()
