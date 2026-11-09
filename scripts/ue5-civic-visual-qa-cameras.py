"""Optional UE5 Editor-only civilian street visual QA camera bookmarks.

Open Aden_TerrainLab and author the original civic street before running.
No gameplay, existing actor, save-game, or geographic source is modified.
This is NOT automated PIE, a screenshot, or verified Aden geography.
"""
import json
import math
import os
import unreal

LEVEL = "/Game/Maps/Aden_TerrainLab"
ROOT = os.path.join(unreal.Paths.project_saved_dir(), "CityTiles")
SOURCE = os.path.join(ROOT, "CIVIL_STREET_DETAIL.json")
PREFIX = "VP_CIV_QA_CAMERA_"

def plan(scene):
    if (scene.get("format") != "veilpoint-original-civil-street-v1"
            or scene.get("coordinateSystem") != "local-metre-unreferenced"
            or scene.get("actualAdenCoverageVerified") is not False):
        raise RuntimeError("Refusing unverified or nonlocal scene")
    entrances = scene.get("entrances")
    if not isinstance(entrances, list) or len(entrances) != 3:
        raise RuntimeError("Expected three original public entrances")
    result = []
    for i, e in enumerate(entrances):
        # All visual QA camera positions are explicitly local and nongeoreferenced.
        x, z = e.get("x"), e.get("z")
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (x, z)):
            raise RuntimeError("Invalid civilian entrance coordinates")
        if not (5 <= x <= 507 and 5 <= z <= 507):
            raise RuntimeError("Entrance outside original local tile")
        result.append((i + 1, x, z))
    return result

def author():
    if not os.path.isfile(SOURCE) or os.path.getsize(SOURCE) > 260000:
        raise RuntimeError("Missing or oversized original civic street")
    with open(SOURCE, encoding="utf-8") as f:
        scene = json.load(f)
    positions = plan(scene)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    if not world or LEVEL not in world.get_path_name():
        raise RuntimeError("Open standalone Aden_TerrainLab before visual QA")
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    actors = subsystem.get_all_level_actors()
    labels = [a.get_actor_label() for a in actors]
    if any(label.startswith(PREFIX) for label in labels):
        raise RuntimeError("QA cameras already exist; refusing duplicates")
    if sum(label.startswith("VP_CIV_ST_") for label in labels) != 181:
        raise RuntimeError("Author all 181 civilian street pieces first")
    # Spawn preview-only camera actors. Use editor view to inspect composition,
    # facade variation and approach visibility manually. No capture is claimed.
    created = []
    for index, x, z in positions:
        actor = subsystem.spawn_actor_from_class(
            unreal.CameraActor,
            unreal.Vector(x * 100, z * 100, 180),
            unreal.Rotator(0, 0, 0))
        if not actor:
            raise RuntimeError("Camera spawn failed; do not save partial preview")
        actor.set_actor_label(PREFIX + str(index))
        created.append(actor)
    unreal.log("[VEILPOINT] Three optional original civilian visual QA cameras authored.")
    unreal.log("[VEILPOINT] Orient and inspect manually; no native PIE or surveyed coverage verified.")
    return len(created)

if __name__ == "__main__":
    author()
