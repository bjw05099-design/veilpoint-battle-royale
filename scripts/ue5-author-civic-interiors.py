"""Author ORIGINAL, civilian public interior geometry in the isolated UE5
Aden_TerrainLab editor map. Run AFTER ue5-author-civilian-quarter.py and
node scripts/prepare-ue5-civic-interiors.cjs Unreal/Veilpoint/Saved/CityTiles.

This creates actual StaticMeshActors with collision for ordinary furniture and
noncolliding overhead lighting. It does not create surveyed Aden architecture,
a mission/weapon, or full-city map coverage. UE5 editor PIE remains unverified
until an operator runs it in the native engine.
"""
import hashlib
import json
import os
import re
import unreal

MAP = "/Game/Maps/Aden_TerrainLab"
ROOT = os.path.join(unreal.Paths.project_saved_dir(), "CityTiles")
INPUT = os.path.join(ROOT, "CIVIC_INTERIORS.json")
ALLOWED_FINISHES = {
    "salt-plaster", "weathered-stone", "ochre-plaster",
    "stone-paving", "light-terracotta", "canvas-shade",
}
IDENTIFIER = re.compile(r"[a-z0-9-]{5,110}\Z")


def checked_input():
    if not os.path.isfile(INPUT) or os.path.getsize(INPUT) > 180000:
        raise RuntimeError("Missing or oversized ORIGINAL civilian interior layout")
    with open(INPUT, "r", encoding="utf-8") as stream:
        doc = json.load(stream)
    if (doc.get("format") != "veilpoint-original-civic-interiors-v1"
            or doc.get("coordinateSystem") != "local-metre-unreferenced"
            or doc.get("actualAdenCoverageVerified") is not False
            or doc.get("realAdenInteriorsVerified") is not False
            or doc.get("sourceTerrainUnverified") is not True
            or doc.get("terrainSourceTile") != "aden:0:0"):
        raise RuntimeError("The civic interior data is not an original local test layout")
    digest = doc.get("sourceR16Sha256")
    local = os.path.join(ROOT, "aden_x0_z0_505.r16")
    if (not isinstance(digest, str) or not re.fullmatch("[a-f0-9]{64}", digest)
            or not os.path.isfile(local) or os.path.getsize(local) != 505 * 505 * 2):
        raise RuntimeError("Civilian interiors missing original R16 source")
    with open(local, "rb") as stream:
        if hashlib.sha256(stream.read()).hexdigest() != digest:
            raise RuntimeError("Original civic interior R16 source was modified")
    buildings = doc.get("interiors")
    parts = doc.get("parts")
    if not isinstance(buildings, list) or len(buildings) != 3 or not isinstance(parts, list):
        raise RuntimeError("Expected exactly three original civilian public interiors")
    if not (40 <= len(parts) <= 90):
        raise RuntimeError("Incomplete original interior furniture/partitions")
    ids, owners = set(), set()
    for building in buildings:
        if (not isinstance(building, dict) or
                not isinstance(building.get("id"), str) or
                not IDENTIFIER.fullmatch(building["id"]) or
                building.get("sourceBuilding") != building["id"] or
                building.get("publicInterior") is not True or
                building.get("walkableCentreAisleMetres", 0) < 3.0):
            raise RuntimeError("Unknown fictional civic interior")
        owners.add(building["id"])
    if len(owners) != 3:
        raise RuntimeError("Duplicate original civic interior owner")
    for part in parts:
        if not isinstance(part, dict) or not isinstance(part.get("id"), str):
            raise RuntimeError("Invalid original interior actor")
        name = part["id"]
        if (not IDENTIFIER.fullmatch(name) or name in ids or
                part.get("owner") not in owners or
                part.get("finish") not in ALLOWED_FINISHES or
                not isinstance(part.get("solid"), bool)):
            raise RuntimeError("Duplicate/unsafe civic interior actor")
        ids.add(name)
        for dim in ("x", "z", "y", "w", "d", "h"):
            value = part.get(dim)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not -500 < value < 3000:
                raise RuntimeError("Invalid metre-scale interior geometry")
        if not (0.10 <= part["w"] <= 15 and 0.10 <= part["d"] <= 15 and
                0.05 <= part["h"] <= 5.0):
            raise RuntimeError("Invalid interior width/depth/height")
    return doc


def author_interiors():
    doc = checked_input()
    world = unreal.get_editor_subsystem(
        unreal.UnrealEditorSubsystem).get_editor_world()
    if not world or MAP not in world.get_path_name():
        raise RuntimeError("Open the isolated Aden_TerrainLab map; never alter BR/CH01 levels")
    actor_api = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if not actor_api:
        raise RuntimeError("UE5 actor editing subsystem unavailable")
    existing = {actor.get_actor_label() for actor in actor_api.get_all_level_actors()}
    if any(label.startswith("VP_CIV_INT_") for label in existing):
        raise RuntimeError("Original civic interiors already exist; no duplicates")
    for building in doc["interiors"]:
        prefix = "VP_CIV_" + building["id"] + "-"
        if not any(label.startswith(prefix) for label in existing):
            raise RuntimeError("Expected original civic shell must be authored first: " + prefix)
    cube = unreal.load_asset("/Engine/BasicShapes/Cube")
    if cube is None:
        raise RuntimeError("Unreal native cube mesh not available")
    materials = {}
    for finish in ALLOWED_FINISHES:
        asset = "/Game/Materials/M_Civil_" + finish.replace("-", "_")
        value = unreal.load_asset(asset)
        if not isinstance(value, unreal.Material):
            raise RuntimeError("Create the original civic shell materials first: " + asset)
        materials[finish] = value
    # All checks above run before any editor actors are spawned.
    made = 0
    for item in doc["parts"]:
        position = unreal.Vector(item["x"] * 100, item["z"] * 100, item["y"] * 100)
        actor = actor_api.spawn_actor_from_class(
            unreal.StaticMeshActor, position, unreal.Rotator(0, 0, 0))
        if actor is None:
            raise RuntimeError("Failed to author an actual civic interior mesh actor")
        actor.set_actor_label("VP_CIV_INT_" + item["id"])
        mesh = actor.get_component_by_class(unreal.StaticMeshComponent)
        if mesh is None:
            raise RuntimeError("Civic interior mesh missing collision component")
        mesh.set_static_mesh(cube)
        actor.set_actor_scale3d(unreal.Vector(item["w"], item["d"], item["h"]))
        mesh.set_material(0, materials[item["finish"]])
        mesh.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS
                                   if item["solid"]
                                   else unreal.CollisionEnabled.NO_COLLISION)
        made += 1
    if made != len(doc["parts"]):
        raise RuntimeError("Incomplete native authored original interior")
    if not unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level():
        raise RuntimeError("UE5 civic interiors could not be saved")
    unreal.log("[VEILPOINT] Authored %d REAL editor StaticMeshActors in 3 fictional civilian interiors." % made)
    unreal.log("[VEILPOINT] No surveyed Aden buildings; UE5 PIE/Win64 compile and RTX FPS unverified.")
    return made


author_interiors()
