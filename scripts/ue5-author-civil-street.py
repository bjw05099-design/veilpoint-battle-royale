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


FINISH_VARIANTS = {
    "warm-lime": ((.76,.69,.57),(.69,.63,.54),(.81,.72,.60)),
    "sandstone-edge": ((.54,.48,.40),(.59,.51,.43),(.48,.44,.39)),
    "aged-wood": ((.37,.28,.20),(.31,.25,.19),(.43,.32,.22)),
    "painted-lattice": ((.48,.38,.27),(.38,.35,.29),(.54,.43,.33)),
    "muted-glass": ((.25,.34,.33),(.29,.36,.35),(.22,.31,.30)),
    "cloth-cream": ((.71,.62,.46),(.77,.68,.53),(.63,.58,.48)),
    "terra-frieze": ((.61,.43,.31),(.55,.39,.30),(.67,.48,.36)),
    "street-paving": ((.50,.48,.43),(.46,.45,.41),(.53,.50,.44)),
    "street-edge": ((.37,.36,.34),(.41,.39,.36),(.34,.34,.33)),
}

def checked_finishes(scene):
    """An OPTIONAL verified sidecar, not a replacement for saved collision."""
    filename = os.path.join(ROOT, "CIVIL_FINISH_VARIANTS.json")
    if not os.path.exists(filename):
        return None  # Existing original street authoring stays compatible.
    doc = read_json_small(filename, 260000)
    if (doc.get("format") != "veilpoint-original-civil-finishes-v1"
            or doc.get("sourceStreetFormat") != scene["format"]
            or doc.get("sourceR16Sha256") != scene["sourceR16Sha256"]
            or doc.get("coordinateSystem") != "local-metre-unreferenced"
            or doc.get("originalArchitectureOnly") is not True
            or doc.get("actualAdenCoverageVerified") is not False
            or doc.get("sourceTerrainUnverified") is not True
            or doc.get("sensitiveOperationalSites") is not False
            or doc.get("partCount") != EXPECTED_PIECES):
        raise RuntimeError("Unverified civilian material variant source")
    entries = doc.get("assignments")
    if not isinstance(entries, list) or len(entries) != EXPECTED_PIECES:
        raise RuntimeError("Incomplete original facade material assignments")
    verified = {}
    for part, item in zip(scene["parts"], entries):
        if not isinstance(item, dict) or item.get("partId") != part["id"] or item.get("baseFinish") != part["finish"]:
            raise RuntimeError("Civic material assignment does not match authored actor order")
        variants = FINISH_VARIANTS[part["finish"]]
        pick = hashlib.sha256((part["id"] + "|" + part["finish"]).encode("utf-8")).digest()[0] % len(variants)
        rough_byte = hashlib.sha256((part["finish"] + "|" + str(pick)).encode("utf-8")).digest()[0]
        roughness = round(.63 + rough_byte / 255 * .25, 4)
        if (type(item.get("variant")) is not int or item["variant"] != pick
                or item.get("baseColor") != list(variants[pick])
                or item.get("roughness") != roughness
                or item.get("metallic") != 0 or item.get("emissive") is not False
                or item.get("collisionUnchanged") is not True):
            raise RuntimeError("Civic finish assignment cannot be reproduced from the original part ID")
        verified[part["id"]] = (part["finish"], pick, variants[pick], roughness)
    return verified



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


def material_for(name, rgb, roughness=None):
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
    if roughness is not None:
        scalar = unreal.MaterialEditingLibrary.create_material_expression(
            result, unreal.MaterialExpressionConstant, -350, 180)
        if not scalar:
            raise RuntimeError("Could not create civic roughness node")
        scalar.set_editor_property("r", roughness)
        if not unreal.MaterialEditingLibrary.connect_material_property(
                scalar, "", unreal.MaterialProperty.MP_ROUGHNESS):
            raise RuntimeError("Could not wire civic material Roughness")
    errors = unreal.MaterialEditingLibrary.recompile_material(result)
    if errors:
        raise RuntimeError("Original civic material compilation failed: " + str(errors))
    if not unreal.EditorAssetLibrary.save_loaded_asset(result):
        raise RuntimeError("Could not save original civic material")
    return result


def author_scene():
    scene = check_scene()
    # Verify ALL 181 optional material records and their source terrain before
    # spawning any actor or creating native editor assets.
    finishes = checked_finishes(scene)
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
    materials = {name: material_for(name, rgb) for name, rgb in COLORS.items()} if finishes is None else {}
    if finishes is not None:
        # 9 finishes x 3 deterministic variants = 27 real reusable UE5
        # shader assets, not one material per actor (181 redundant shaders).
        for finish, variants in FINISH_VARIANTS.items():
            for index, rgb in enumerate(variants):
                rough_byte = hashlib.sha256((finish + "|" + str(index)).encode("utf-8")).digest()[0]
                roughness = round(.63 + rough_byte / 255 * .25, 4)
                materials[(finish, index)] = material_for(
                    finish + "_V" + str(index), rgb, roughness)
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
        if finishes is None:
            mesh.set_material(0, materials[p["finish"]])
        else:
            finish, variant, _, _ = finishes[p["id"]]
            mesh.set_material(0, materials[(finish, variant)])
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
    unreal.log("[VEILPOINT] %s real UE5 facade materials; original verified collision unchanged." %
               ("27 deterministic variation" if finishes is not None else "9 fallback"))
    unreal.log("[VEILPOINT] 33 continuous promenade pavers and 3 walk-in "+
               "public door approaches; not a surveyed real Aden district.")
    unreal.log("[VEILPOINT] Native PIE collision, performance and city "+
               "reference QA are STILL REQUIRED.")
    return created


author_scene()
