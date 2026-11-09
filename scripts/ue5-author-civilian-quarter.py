"""Author an ORIGINAL public civilian blockout in the ALREADY OPEN
/Game/Maps/Aden_TerrainLab editor map (never BR, CH01 or a real city map).

Preconditions:
  node scripts/prepare-ue5-terrain-lab.cjs
  node scripts/prepare-ue5-civilian-quarter.cjs Unreal/Veilpoint/Saved/CityTiles
  Open Aden_TerrainLab and use Tools > Execute Python Script.

39 independently sized, colliding/unobstructed parts give three distinct
fictional walk-in public buildings at genuine *local* terrain elevations.
Not surveyed Aden, actual historic structures, protected/active facilities,
or true photogrammetric materials. Requires native UE5 editor execution.
"""
import hashlib
import json
import os
import re
import unreal

PACKAGE = "/Game/Maps/Aden_TerrainLab"
ROOT = os.path.join(unreal.Paths.project_saved_dir(), "CityTiles")
KIT = os.path.join(ROOT, "CIVILIAN_QUARTER.json")
ASSET_PREFIX = "/Game/Materials/M_Civil_"
MATERIALS = {
    "salt-plaster": (0.72, 0.69, 0.58),
    "weathered-stone": (0.48, 0.44, 0.40),
    "ochre-plaster": (0.67, 0.49, 0.32),
    "stone-paving": (0.47, 0.44, 0.39),
    "light-terracotta": (0.62, 0.44, 0.33),
    "canvas-shade": (0.69, 0.59, 0.43),
}


def checked_layout():
    if not os.path.isfile(KIT) or os.path.getsize(KIT) > 150000:
        raise RuntimeError("Missing or oversize ORIGINAL civic quarter layout")
    with open(KIT, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if (data.get("format") != "veilpoint-original-civilian-quarter-v1"
            or data.get("coordinateSystem") != "local-metre-unreferenced"
            or data.get("actualAdenCoverageVerified") is not False
            or data.get("restrictedFacilityModel") is not False
            or data.get("terrainSampleSourceUnverified") is not True
            or data.get("terrainSourceTile") != "aden:0:0"):
        raise RuntimeError("Civic kit must be locally authored, fictional and unverified")
    src = data.get("sourceR16Sha256")
    tile_file = os.path.join(ROOT, "aden_x0_z0_505.r16")
    if not isinstance(src, str) or not re.fullmatch(r"[a-f0-9]{64}", src):
        raise RuntimeError("Civil kit terrain hash missing")
    if not os.path.isfile(tile_file) or os.path.getsize(tile_file) != 505 * 505 * 2:
        raise RuntimeError("Source R16 tile missing or invalid")
    with open(tile_file, "rb") as handle:
        digest = hashlib.sha256(handle.read()).hexdigest()
    if src != digest:
        raise RuntimeError("Civilian foundations no longer match terrain R16")
    buildings = data.get("buildings")
    parts = data.get("parts")
    if not isinstance(buildings, list) or len(buildings) != 3:
        raise RuntimeError("Expected exactly three independent public buildings")
    if not isinstance(parts, list) or len(parts) != 39:
        raise RuntimeError("Expected 39 original modular civil building parts")
    names = set()
    for p in parts:
        if not isinstance(p, dict):
            raise RuntimeError("Invalid civil part")
        name = p.get("id")
        if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9-]{5,90}", name):
            raise RuntimeError("Unsafe civil part identifier")
        if name in names:
            raise RuntimeError("Duplicate civil part")
        names.add(name)
        if p.get("finish") not in MATERIALS or not isinstance(p.get("solid"), bool):
            raise RuntimeError("Unapproved architectural material or collision")
        for dim in ("x", "z", "y", "w", "d", "h"):
            value = p.get(dim)
            if not isinstance(value, (int, float)) or not -500 < value < 3000:
                raise RuntimeError("Invalid local-metre geometry coordinate")
        if not (0.1 <= p["w"] <= 30 and 0.1 <= p["d"] <= 30
                and 0.05 <= p["h"] <= 8):
            raise RuntimeError("Invalid modular civil component dimensions")
    return data


def original_material(name, rgb):
    asset_name = "M_Civil_" + name.replace("-", "_")
    path = "/Game/Materials/" + asset_name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        found = unreal.load_asset(path)
        if not isinstance(found, unreal.Material):
            raise RuntimeError("Existing material path is not a UE Material: " + path)
        return found
    if not unreal.EditorAssetLibrary.does_directory_exist("/Game/Materials"):
        if not unreal.EditorAssetLibrary.make_directory("/Game/Materials"):
            raise RuntimeError("Unable to make original civilian materials folder")
    material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        asset_name, "/Game/Materials", unreal.Material, unreal.MaterialFactoryNew())
    if not material:
        raise RuntimeError("Material could not be created: " + asset_name)
    color = unreal.MaterialEditingLibrary.create_material_expression(
        material, unreal.MaterialExpressionConstant3Vector, -400, 0)
    if not color:
        raise RuntimeError("Unable to author civilian material color")
    color.set_editor_property("constant", unreal.LinearColor(*rgb, 1.0))
    if not unreal.MaterialEditingLibrary.connect_material_property(
            color, "", unreal.MaterialProperty.MP_BASE_COLOR):
        raise RuntimeError("Civilian material graph not connected")
    failures = unreal.MaterialEditingLibrary.recompile_material(material)
    if failures:
        raise RuntimeError("Civilian material compilation: " + str(failures))
    if not unreal.EditorAssetLibrary.save_loaded_asset(material):
        raise RuntimeError("Civilian material not saved")
    return material


def author_civil_quarter():
    data = checked_layout()
    world = unreal.get_editor_subsystem(
        unreal.UnrealEditorSubsystem).get_editor_world()
    if not world or PACKAGE not in world.get_path_name():
        raise RuntimeError("Open Aden_TerrainLab first; BR/CH01 cannot be altered")
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if not actors:
        raise RuntimeError("EditorActorSubsystem not available")
    previous = {a.get_actor_label() for a in actors.get_all_level_actors()}
    if any(label.startswith("VP_CIV_") for label in previous):
        raise RuntimeError("Original civic kit already exists; refusing duplicate")
    cube = unreal.load_asset("/Engine/BasicShapes/Cube")
    if not cube:
        raise RuntimeError("Native 100cm cube mesh unavailable")
    materials = {
        name: original_material(name, rgb) for name, rgb in MATERIALS.items()
    }
    created = 0
    for p in data["parts"]:
        # Browser geographic x,z becomes Unreal world X,Y; all data in metres.
        location = unreal.Vector(p["x"] * 100.0, p["z"] * 100.0, p["y"] * 100.0)
        actor = actors.spawn_actor_from_class(
            unreal.StaticMeshActor, location, unreal.Rotator(0, 0, 0))
        if not actor:
            raise RuntimeError("Static building block spawn failed; do not save")
        actor.set_actor_label("VP_CIV_" + p["id"])
        component = actor.get_component_by_class(unreal.StaticMeshComponent)
        if not component:
            raise RuntimeError("Civil architecture mesh component missing")
        component.set_static_mesh(cube)
        actor.set_actor_scale3d(unreal.Vector(p["w"], p["d"], p["h"]))
        component.set_material(0, materials[p["finish"]])
        component.set_collision_enabled(
            unreal.CollisionEnabled.QUERY_AND_PHYSICS if p["solid"]
            else unreal.CollisionEnabled.NO_COLLISION)
        created += 1
    if created != 39:
        raise RuntimeError("Incomplete original civil quarter; do not save")
    editor_levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if not editor_levels.save_current_level():
        raise RuntimeError("Could not save civil blockout preview")
    unreal.log("[VEILPOINT] Authored 3 original public walk-in buildings / 39 pieces.")
    unreal.log("[VEILPOINT] The geometry is NOT a measured/verified Aden district.")
    unreal.log("[VEILPOINT] Run PIE entrance, collision and frame-time checks.")
    return created


author_civil_quarter()
