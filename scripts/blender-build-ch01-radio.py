"""Original radio desk blockout, authored in Blender; no downloaded art/add-ons."""
import sys, json, hashlib
from pathlib import Path
import bpy
out = Path(sys.argv[sys.argv.index('--')+1]).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
specs = [
 ('DeskTop',(0,0,.77),(1.2,.65,.06),(.24,.16,.09),.85,0),
 ('LegA',(-.5,-.23,.37),(.06,.06,.74),(.13,.16,.17),.6,.65),
 ('LegB',(.5,-.23,.37),(.06,.06,.74),(.13,.16,.17),.6,.65),
 ('LegC',(-.5,.23,.37),(.06,.06,.74),(.13,.16,.17),.6,.65),
 ('LegD',(.5,.23,.37),(.06,.06,.74),(.13,.16,.17),.6,.65),
 ('Radio',(-.2,0,.89),(.45,.28,.18),(.08,.1,.09),.65,.2),
 ('Speaker',(.27,.05,.92),(.22,.2,.24),(.055,.06,.055),.9,0),
 ('Microphone',(.1,-.18,.93),(.035,.035,.26),(.08,.08,.08),.6,.4),
 ('Paper',(.35,-.18,.806),(.28,.2,.012),(.7,.65,.5),.95,0)]
parts=[]
for name,centre,size,color,roughness,metal in specs:
 bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
 obj=bpy.context.object;obj.name='VP_LB_'+name;obj.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mat=bpy.data.materials.new(name);mat.use_nodes=True
 shader=mat.node_tree.nodes.get('Principled BSDF')
 shader.inputs['Base Color'].default_value=(*color,1)
 shader.inputs['Roughness'].default_value=roughness
 shader.inputs['Metallic'].default_value=metal
 obj.data.materials.append(mat)
 parts.append(obj)
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.export_scene.gltf(filepath=str(out/'radio-desk.glb'),export_format='GLB',use_selection=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'radio-desk.blend'))
# Basic geometric proof is computed from the actual Blender meshes.
vertices=[obj.matrix_world @ v.co for obj in parts for v in obj.data.vertices]
lo=[min(v[i] for v in vertices) for i in range(3)]
hi=[max(v[i] for v in vertices) for i in range(3)]
assert len(parts)==9 and abs(lo[2])<.0001
assert all(abs(a-b)<.001 for a,b in zip([hi[i]-lo[i] for i in range(3)],[1.2,.65,1.06]))
proof={'schema':'veilpoint-radio-desk-v1','originalPrototypeArt':True,'blender':bpy.app.version_string,'objects':len(parts),'boundsMetres':[hi[i]-lo[i] for i in range(3)],'nativeImportVerified':False,'photorealArtVerified':False,'files':{n:hashlib.sha256((out/n).read_bytes()).hexdigest() for n in ['radio-desk.glb','radio-desk.blend']}}
(out/'receipt.json').write_text(json.dumps(proof,indent=2)+'\n')
# Render an actual model review image using CPU, independent of a GPU desktop.
from mathutils import Vector
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=12
scene.render.resolution_x=512
scene.render.resolution_y=512
scene.render.resolution_percentage=100
camera_data=bpy.data.cameras.new('ReviewCamera')
camera=bpy.data.objects.new('ReviewCamera',camera_data)
scene.collection.objects.link(camera)
camera.location=(1.8,-2,1.5)
camera.rotation_euler=(Vector((0,0,.5))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO'
camera_data.ortho_scale=1.8
scene.camera=camera
light_data=bpy.data.lights.new('ReviewKey','AREA');light_data.energy=350;light_data.shape='DISK';light_data.size=3
light=bpy.data.objects.new('ReviewKey',light_data);scene.collection.objects.link(light);light.location=(1,-1,3)
scene.world.color=(.25,.25,.25)
scene.render.filepath=str(out/'preview.png')
bpy.ops.render.render(write_still=True)
assert (out/'preview.png').stat().st_size>1024
