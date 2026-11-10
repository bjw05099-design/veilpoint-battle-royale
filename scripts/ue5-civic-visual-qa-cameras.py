"""Optional UE5 Editor-only civilian street visual QA camera bookmarks.

Open Aden_TerrainLab and author the original civic street before running.
No gameplay, existing actor, save-game, or geographic source is modified.
This is NOT automated PIE, a screenshot, or verified Aden geography.
"""
import json
import math
import os
import hashlib
import struct
import unreal

LEVEL = "/Game/Maps/Aden_TerrainLab"
ROOT = os.path.join(unreal.Paths.project_saved_dir(), "CityTiles")
SOURCE = os.path.join(ROOT, "CIVIL_STREET_DETAIL.json")
QUARTER = os.path.join(ROOT, "CIVILIAN_QUARTER.json")
MANIFEST = os.path.join(ROOT, "IMPORT_MANIFEST.json")
CENTER_R16 = os.path.join(ROOT, "aden_x0_z0_505.r16")
PREFIX = "VP_CIV_QA_CAMERA_"

def height_at(raw, manifest, x, z):
    """Sample the actual hash-validated synthetic terrain under a QA camera."""
    step = manifest.get("quantizationMetresPerStep")
    center = manifest.get("recommendedLandscapeActorZCm")
    if not all(isinstance(v, (int, float)) and math.isfinite(v)
               for v in (step, center)) or not 0.0001 < step <= 1:
        raise RuntimeError("Invalid preview R16 height transform")
    u, v = x * 504 / 512, z * 504 / 512
    col, row = min(503, math.floor(u)), min(503, math.floor(v))
    fx, fz = u - col, v - row
    def sample(cx, cz):
        level = struct.unpack_from("<H", raw, 2 * (cz * 505 + cx))[0]
        return center / 100 + (level - 32768) * step
    return ((sample(col, row) * (1 - fx) + sample(col + 1, row) * fx) *
            (1 - fz) + (sample(col, row + 1) * (1 - fx) +
                        sample(col + 1, row + 1) * fx) * fz)


def plan(scene, quarter, manifest, raw):
    if (scene.get("format") != "veilpoint-original-civil-street-v1"
            or scene.get("coordinateSystem") != "local-metre-unreferenced"
            or scene.get("actualAdenCoverageVerified") is not False
            or quarter.get("format") != "veilpoint-original-civilian-quarter-v1"
            or quarter.get("coordinateSystem") != "local-metre-unreferenced"
            or quarter.get("actualAdenCoverageVerified") is not False):
        raise RuntimeError("Refusing unverified or nonlocal scene")
    digest = hashlib.sha256(raw).hexdigest()
    if (not isinstance(scene.get("sourceR16Sha256"), str)
            or scene["sourceR16Sha256"] != digest
            or quarter.get("sourceR16Sha256") != digest):
        raise RuntimeError("Civilian visual QA source R16 hash mismatch")
    entrances = scene.get("entrances")
    buildings = quarter.get("buildings")
    if not isinstance(entrances, list) or len(entrances) != 3 or not isinstance(buildings, list) or len(buildings) != 3:
        raise RuntimeError("Expected three original public entrances")
    by_id = {b["id"]: b for b in buildings if isinstance(b, dict) and isinstance(b.get("id"), str)}
    if len(by_id) != 3:
        raise RuntimeError("Original civic building identities missing")
    seen = set()
    result = []
    for i, e in enumerate(entrances):
        # Actual authored layout uses nested publicStreetMetres and
        # publicFrontMetres. It does NOT contain top-level x/z fields.
        if not isinstance(e, dict) or e.get("id") not in by_id or e["id"] in seen:
            raise RuntimeError("Civilian entrance ownership mismatch")
        seen.add(e["id"])
        street, front = e.get("publicStreetMetres"), e.get("publicFrontMetres")
        if not isinstance(street, dict) or not isinstance(front, dict):
            raise RuntimeError("Missing actual source entry coordinates")
        x, z, toward_x, toward_z = (
            street.get("x"), street.get("z"), front.get("x"), front.get("z"))
        if not all(isinstance(v, (int, float)) and math.isfinite(v)
                   for v in (x, z, toward_x, toward_z)):
            raise RuntimeError("Invalid civilian entry coordinates")
        if not (5 <= x <= 507 and 5 <= z <= 507 and
                5 <= toward_x <= 507 and 5 <= toward_z <= 507):
            raise RuntimeError("Entrance outside original local tile")
        if math.hypot(toward_x - x, toward_z - z) < 1:
            raise RuntimeError("QA camera requires a true street-side approach")
        ground = height_at(raw, manifest, x, z)
        if not math.isfinite(ground):
            raise RuntimeError("Invalid actual R16 ground elevation")
        yaw = math.degrees(math.atan2(toward_z - z, toward_x - x))
        result.append((i + 1, x, z, ground + 1.7, yaw))
    return result


def author():
    if not os.path.isfile(SOURCE) or os.path.getsize(SOURCE) > 260000:
        raise RuntimeError("Missing or oversized original civic street")
    with open(SOURCE, encoding="utf-8") as f:
        scene = json.load(f)
    for filename in (QUARTER, MANIFEST, CENTER_R16):
        if not os.path.isfile(filename):
            raise RuntimeError("Missing locally authored QA source: " + os.path.basename(filename))
    if os.path.getsize(CENTER_R16) != 505 * 505 * 2:
        raise RuntimeError("Invalid exact native R16 byte size")
    with open(QUARTER, encoding="utf-8") as f:
        quarter = json.load(f)
    with open(MANIFEST, encoding="utf-8") as f:
        manifest = json.load(f)
    with open(CENTER_R16, "rb") as f:
        heightmap = f.read()
    positions = plan(scene, quarter, manifest, heightmap)
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
    for index, x, z, ground_eye, yaw in positions:
        actor = subsystem.spawn_actor_from_class(
            unreal.CameraActor,
            unreal.Vector(x * 100, z * 100, ground_eye * 100),
            unreal.Rotator(0, yaw, 0))
        if not actor:
            raise RuntimeError("Camera spawn failed; do not save partial preview")
        actor.set_actor_label(PREFIX + str(index))
        created.append(actor)
    unreal.log("[VEILPOINT] Three optional original civilian visual QA cameras authored.")
    unreal.log("[VEILPOINT] Orient and inspect manually; no native PIE or surveyed coverage verified.")
    return len(created)

if __name__ == "__main__":
    author()
