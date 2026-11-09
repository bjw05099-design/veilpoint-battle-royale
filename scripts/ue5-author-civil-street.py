"""Add ORIGINAL civilian facade shading and one continuous 1:1 pedestrian
street to the existing optional Aden_TerrainLab editor level.

This is a civilian architectural visual PROTOTYPE, not a reconstruction of
any actual Aden address, verified architectural survey or production level.
Requires the ORIGINAL 3-building civic quarter to have been authored first.

Prepare (after generating original R16 and public civilian quarter):
  node scripts/prepare-ue5-civil-street.cjs Unreal/Veilpoint/Saved/CityTiles
Open /Game/Maps/Aden_TerrainLab, then Tools > Execute Python Script.
"""
import hashlib
import json
import math
import os
import re
import unreal

LEVEL = "/Game/Maps/Aden_TerrainLab"
ROOT = os.path.join(unreal.Paths.project_saved_dir(), "CityTiles")
FACADE = os.path.join(ROOT, "CIVIL_STREET_DETAIL.json")
QUARTER = os.path.join(ROOT, "CIVILIAN_QUARTER.json")
CENTRAL = os.path.join(ROOT, "aden_x0_z0_505.r16")
PREFIX = "VP_CIV_ST_"
EXPECTED_PIECES = 181
COLORS = {
    "warm-lime": (0.76, 0.69, 0.57),
    "sandstone-edge": (0.54, 0.48, 0.40),
    "aged-wood": (0.37, 0.28, 0.20),
    "painted-lattice": (0.48, 0.38, 0.27),
    "muted-glass": (0.25, 0.34, 0.33),
    "cloth-cream": (0.71, 0.62, 0.46),
    "terra-frieze": (0.61, 0.43, 0.31),
    "street-paving": (0.50, 0.48, 0.43),
    "street-edge": (0.37, 0.36, 0.34),
}


def read_json_small(filename, max_bytes=260000):
    if not os.path.isfile(filename) or os.path.getsize(filename) > max_bytes:
        raise RuntimeError("Missing or oversized local civic street source: " +
                           os.path.basename(filename))
    with open(filename, "r", encoding="utf-8") as handle:
        return json.load(handle)


def check_scene():
    scene = read_json_small(FACADE)
    quarter = read_json_small(QUARTER, 150000)
    if (scene.get("format") != "veilpoint-original-civil-street-v1"
            or scene.get("coordinateSystem") != "local-metre-unreferenced"
            or scene.get("actualAdenCoverageVerified") is not False
            or scene.get("originalArchitectureOnly") is not True
            or scene.get("sourceTerrainUnverified") is not True
            or scene.get("sensitiveOperationalSites") is not False
            or scene.get("linkedOriginalQuarterFormat") !=
            "veilpoint-original-civilian-quarter-v1"
            or quarter.get("format") !=
            "veilpoint-original-civilian-quarter-v1"
            or quarter.get("actualAdenCoverageVerified") is not False):
        raise RuntimeError("Only original non-georeferenced public city art is supported")
    digest = scene.get("sourceR16Sha256")
    if (not isinstance(digest, str)
            or re.fullmatch(r"[a-f0-9]{64}", digest) is None
            or digest != quarter.get("sourceR16Sha256")):
        raise RuntimeError("Street and original civic quarter source hashes differ")
    if not os.path.isfile(CENTRAL) or os.path.getsize(CENTRAL) != 505 * 505 * 2:
        raise RuntimeError("Missing original R16 heightfield")
    with open(CENTRAL, "rb") as handle:
        if hashlib.sha256(handle.read()).hexdigest() != digest:
            raise RuntimeError("The local street no longer matches verified terrain")
    pieces = scene.get("parts")
    streets = scene.get("streets")
    entrances = scene.get("entrances")
    if (not isinstance(pieces, list) or len(pieces) != EXPECTED_PIECES
            or not isinstance(streets, list) or len(streets) != 33
            or not isinstance(entrances, list) or len(entrances) != 3):
        raise RuntimeError("Incomplete original civic street scene")
    unique = set()
    for p in pieces:
        if not isinstance(p, dict):
            raise RuntimeError("Invalid original street component")
        label = p.get("id")
        if (not isinstance(label, str) or
                not re.fullmatch(r"[a-z0-9-]{6,100}", label)
                or label in unique):
            raise RuntimeError("Unsafe, missing or duplicate street part identity")
        unique.add(label)
        if p.get("finish") not in COLORS or type(p.get("solid")) is not bool:
            raise RuntimeError("Unapproved original civic facade finish or collision")
        for dim in ("x", "z", "y", "w", "d", "h"):
            value = p.get(dim)
            if (not isinstance(value, (int, float)) or
                    not math.isfinite(value)):
                raise RuntimeError("Invalid local metre street geometry")
        if not (0 <= p["x"] <= 512 and 0 <= p["z"] <= 512
                and -500 <= p["y"] <= 3010
                and 0.015 <= p["w"] <= 30
                and 0.015 <= p["d"] <= 30
                and 0.015 <= p["h"] <= 30):
            raise RuntimeError("Street scale/extent outside original preview")
    return scene


def material_for(name, rgb):
    asset_name = "M_CivilStreet_" + name.replace("-", "_")
    asset_path = "/Game/Materials/" + asset_name
    if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
        existing = unreal.load_asset(asset_path)
        if not isinstance(existing, unreal.Material):
            raise RuntimeError("Street material path already used by another asset")
        return existing
    if not unreal.EditorAssetLibrary.does_directory_exist("/Game/Materials"):
        if not unreal.EditorAssetLibrary.make_directory("/Game/Materials"):
            raise RuntimeError("Could not create civil material folder")
    result = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        asset_name, "/Game/Materials", unreal.Material,
        unreal.MaterialFactoryNew())
    if not result:
        raise RuntimeError("Could not create a civilian facade color material")
    color = unreal.MaterialEditingLibrary.create_material_expression(
        result, unreal.MaterialExpressionConstant3Vector, -350, 0)
    if not color:
        raise RuntimeError("Could not create civic material color node")
    color.set_editor_property("constant", unreal.LinearColor(*rgb, 1.0))
    if not unreal.MaterialEditingLibrary.connect_material_property(
            color, "", unreal.MaterialProperty.MP_BASE_COLOR):
        raise RuntimeError("Could not wire civilian material Base Color")
    errors = unreal.MaterialEditingLibrary.recompile_material(result)
    if errors:
        raise RuntimeError("Original civic material compilation failed: " + str(errors))
    if not unreal.EditorAssetLibrary.save_loaded_asset(result):
        raise RuntimeError("Could not save original civic material")
    return result


def author_scene():
    scene = check_scene()
    world = unreal.get_editor_subsystem(
        unreal.UnrealEditorSubsystem).get_editor_world()
    if not world or LEVEL not in world.get_path_name():
        raise RuntimeError("Open the standalone Aden_TerrainLab only")
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    labels = [actor.get_actor_label() for actor in actors.get_all_level_actors()]
    if any(label.startswith(PREFIX) for label in labels):
        raise RuntimeError("This original street has already been authored; refusing duplicate")
    if not any(label.startswith("VP_CIV_civic-market-shop-") for label in labels):
        raise RuntimeError("Author the three original 39-piece civilian buildings first")
    cube = unreal.load_asset("/Engine/BasicShapes/Cube")
    if not cube:
        raise RuntimeError("Original mesh primitive missing")
    materials = {name: material_for(name, rgb) for name, rgb in COLORS.items()}
    created = 0
    for p in scene["parts"]:
        actor = actors.spawn_actor_from_class(
            unreal.StaticMeshActor,
            unreal.Vector(p["x"] * 100, p["z"] * 100, p["y"] * 100),
            unreal.Rotator(0, 0, 0))
        if not actor:
            raise RuntimeError("Civil facade actor not spawned; scene not saved")
        actor.set_actor_label(PREFIX + p["id"])
        mesh = actor.get_component_by_class(unreal.StaticMeshComponent)
        if not mesh:
            raise RuntimeError("Civic visual component missing")
        mesh.set_static_mesh(cube)
        actor.set_actor_scale3d(
            unreal.Vector(p["w"], p["d"], p["h"]))
        mesh.set_material(0, materials[p["finish"]])
        mesh.set_collision_enabled(
            unreal.CollisionEnabled.QUERY_AND_PHYSICS if p["solid"]
            else unreal.CollisionEnabled.NO_COLLISION)
        created += 1
    if created != EXPECTED_PIECES:
        raise RuntimeError("Incomplete street scene; refusing to save")
    editor = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    if not editor.save_current_level():
        raise RuntimeError("Standalone civilian street scene was not saved")
    unreal.log("[VEILPOINT] Created 181 ORIGINAL facade, louver, "+
               "pavement and ordinary civilian lighting blocks.")
    unreal.log("[VEILPOINT] 33 continuous promenade pavers and 3 walk-in "+
               "public door approaches; not a surveyed real Aden district.")
    unreal.log("[VEILPOINT] Native PIE collision, performance and city "+
               "reference QA are STILL REQUIRED.")
    return created


author_scene()
