"""Create a REAL UE5.8 CH01 .umap with original, colliding civilian geometry.

Run only inside an installed Unreal Editor, ideally through the explicit
scripts/prepare-native-ch01-win64.ps1 Windows gate. All public-court data is
fictional/unreferenced and does NOT establish an accurate Aden reconstruction.
The native story GameMode builds its own nonduplicated mission blockout at PIE.
A successful Python receipt certifies level authoring, NOT UBT, PIE or FPS.
"""
import hashlib
import json
import math
import os
import re
import unreal

MAP_PACKAGE = "/Game/Maps/CH01_Coast"
PROJECT_CONTENT = os.path.join(unreal.Paths.project_content_dir(), "Maps")
MAP_FILE = os.path.join(PROJECT_CONTENT, "CH01_Coast.umap")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAYOUT_FILE = os.path.join(ROOT, "scripts", "ch01-original-public-court.json")
RECEIPT_FILE = os.path.join(unreal.Paths.project_saved_dir(), "CH01_MAP_READY.json")
LABEL_PREFIX = "VP_CH01_PUBLIC_"
EXPECTED_PUBLIC_PIECES = 11
ACTOR_ID = re.compile(r"[a-z0-9-]{8,100}\Z")
# Native story-marker locations are NOT recreated in the .umap: GameMode owns
# their actual progression and physical collision on BeginPlay.
EXISTING_ACTION_SITES_CM = (
    (650, 0), (650, -650), (1700, -500), (1700, 500),
    (2800, -400), (2800, 400), (4600, -1400), (4600, 1400)
)


def read_original_court():
    if not os.path.isfile(LAYOUT_FILE) or os.path.getsize(LAYOUT_FILE) > 16000:
        raise RuntimeError("Missing or oversized original CH01 public-court geometry")
    with open(LAYOUT_FILE, "rb") as stream:
        raw = stream.read()
    data = json.loads(raw.decode("utf-8"))
    if (data.get("format") != "veilpoint-ch01-original-public-court-v1"
            or data.get("coordinateSystem") != "unreferenced-native-ue-centimetres"
            or data.get("actualAdenCoverageVerified") is not False
            or data.get("restrictedOperationalSites") is not False
            or data.get("includesRealFacilityLayout") is not False
            or data.get("runtimeStoryBootstrapGeometryUnchanged") is not True
            or data.get("entryEndsRemainOpen") is not True
            or data.get("courtCentreCm") != [6800, -6600]
            or data.get("minClearCentreAisleCm") < 650):
        raise RuntimeError("Unapproved or misrepresented original CH01 geometry")
    pieces = data.get("pieces")
    if not isinstance(pieces, list) or len(pieces) != EXPECTED_PUBLIC_PIECES:
        raise RuntimeError("The original CH01 public-court actors are incomplete")
    seen = set()
    for item in pieces:
        if not isinstance(item, dict) or set(item) != {
            "id", "kind", "xCm", "yCm", "zCm", "widthCm",
            "depthCm", "heightCm", "solid"
        }:
            raise RuntimeError("Unknown court actor schema")
        identifier = item["id"]
        if not isinstance(identifier, str) or not ACTOR_ID.fullmatch(identifier) or identifier in seen:
            raise RuntimeError("Duplicate or unsafe original actor identity")
        seen.add(identifier)
        if type(item["solid"]) is not bool:
            raise RuntimeError("Ambiguous collision flag in CH01 map")
        if item["kind"] not in {
            "walkable-paving", "structural-column", "raised-canopy",
            "street-furniture", "nonblocking-surface"
        }:
            raise RuntimeError("Unapproved CH01 civic actor category")
        for field in ("xCm", "yCm", "zCm", "widthCm", "depthCm", "heightCm"):
            value = item[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise RuntimeError("Nonfinite original court geometry")
        x, y, z = item["xCm"], item["yCm"], item["zCm"]
        w, d, h = item["widthCm"], item["depthCm"], item["heightCm"]
        if (not 5000 <= x <= 8200 or not -8000 <= y <= -5200
                or not 0 <= z <= 500 or not 1 <= h <= 350
                or not 10 <= w <= 2600 or not 10 <= d <= 1800):
            # Thin purely decorative markings are deliberately 1cm high.
            if item["kind"] != "nonblocking-surface" or h != 1:
                raise RuntimeError("Court actor outside bounded original local geometry")
        # Keep public action markers and the initial player start clear.
        for site_x, site_y in ((0, 0),) + EXISTING_ACTION_SITES_CM:
            margin_x = w / 2 + 350
            margin_y = d / 2 + 350
            if abs(x - site_x) < margin_x and abs(y - site_y) < margin_y:
                raise RuntimeError("Authoring would obstruct an existing story action")
        # The public ground-level centre aisle must remain fully open.
        # Overhead canopy is legitimate if its underside exceeds 260cm.
        floor_height = z - h / 2
        if item["solid"] and floor_height < 260:
            if abs(x - 6800) < (w / 2 + 325) and abs(y + 6600) < (d / 2 + 550):
                raise RuntimeError("Solid geometry blocks the central walkable aisle")
    return data, hashlib.sha256(raw).hexdigest()


def author_ch01():
    # Fail closed before spawning anything or changing the game's main map.
    if os.path.exists(MAP_FILE):
        raise RuntimeError("CH01_Coast.umap already exists; refusing to overwrite it")
    if os.path.exists(RECEIPT_FILE):
        raise RuntimeError("Prior CH01 map receipt exists; manual review required")
    layout, layout_hash = read_original_court()
    native_mode = unreal.load_class(None, "/Script/Veilpoint.VPStoryGameMode")
    if not native_mode:
        raise RuntimeError("VPStoryGameMode C++ missing: compile Unreal editor module first")
    cube = unreal.load_asset("/Engine/BasicShapes/Cube")
    if not cube:
        raise RuntimeError("Engine cube asset unavailable for physical court authoring")
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    editor = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
    if not levels or not actors or not editor:
        raise RuntimeError("Unreal Editor authoring subsystems unavailable")

    os.makedirs(PROJECT_CONTENT, exist_ok=True)
    if not levels.new_level(MAP_PACKAGE, False):
        raise RuntimeError("Could not create native CH01_Coast editor level")
    world = editor.get_editor_world()
    if not world:
        raise RuntimeError("CH01 editor world was not created")
    world.get_world_settings().set_editor_property("default_game_mode", native_mode)

    player_start = actors.spawn_actor_from_class(
        unreal.PlayerStart, unreal.Vector(0, 0, 160), unreal.Rotator(0, 0, 0))
    sun = actors.spawn_actor_from_class(
        unreal.DirectionalLight, unreal.Vector(0, 0, 2000),
        unreal.Rotator(-48, 18, 0))
    skylight = actors.spawn_actor_from_class(
        unreal.SkyLight, unreal.Vector(0, 0, 900), unreal.Rotator(0, 0, 0))
    if not player_start or not sun or not skylight:
        raise RuntimeError("Cannot author CH01 spawn and daylight: do not package")
    player_start.set_actor_label("VP_CH01_StoryPlayerStart")
    sun.set_actor_label("VP_CH01_Daylight")
    skylight.set_actor_label("VP_CH01_AmbientSky")

    spawned = []
    for piece in layout["pieces"]:
        actor = actors.spawn_actor_from_class(
            unreal.StaticMeshActor,
            unreal.Vector(piece["xCm"], piece["yCm"], piece["zCm"]),
            unreal.Rotator(0, 0, 0))
        if not actor:
            raise RuntimeError("Physical public court actor did not spawn: " + piece["id"])
        actor.set_actor_label(LABEL_PREFIX + piece["id"])
        mesh = actor.get_component_by_class(unreal.StaticMeshComponent)
        if not mesh:
            raise RuntimeError("Public court actor has no mesh/collision component")
        mesh.set_static_mesh(cube)
        actor.set_actor_scale3d(unreal.Vector(
            piece["widthCm"] / 100.0,
            piece["depthCm"] / 100.0,
            piece["heightCm"] / 100.0))
        mesh.set_collision_enabled(
            unreal.CollisionEnabled.QUERY_AND_PHYSICS if piece["solid"]
            else unreal.CollisionEnabled.NO_COLLISION)
        spawned.append(actor.get_actor_label())

    if len(spawned) != EXPECTED_PUBLIC_PIECES or len(set(spawned)) != len(spawned):
        raise RuntimeError("CH01 original public space incomplete or duplicated")
    if not levels.save_current_level() or not os.path.isfile(MAP_FILE):
        raise RuntimeError("Real native CH01_Coast.umap did not save successfully")
    with open(MAP_FILE, "rb") as stream:
        map_bytes = stream.read()
    if len(map_bytes) < 2048:
        raise RuntimeError("Authored UE5 map is unexpectedly empty")

    receipt = {
        "format": "veilpoint-ch01-map-authoring-proof-v1",
        "mapPackage": MAP_PACKAGE,
        "mapFile": MAP_FILE,
        "mapBytes": len(map_bytes),
        "mapSha256": hashlib.sha256(map_bytes).hexdigest(),
        "sourceLayoutSha256": layout_hash,
        "authoredCivilianActors": len(spawned),
        "authoringMode": "/Script/Veilpoint.VPStoryGameMode",
        "fictionalGeometryOnly": True,
        "nativePIEVerified": False,
        "nativeWin64Packaged": False,
        "actualAdenCoverageVerified": False
    }
    os.makedirs(os.path.dirname(RECEIPT_FILE), exist_ok=True)
    # Receipt is emitted AFTER UE5 saved the actual .umap and its bytes were read.
    with open(RECEIPT_FILE, "w", encoding="utf-8") as output:
        json.dump(receipt, output, ensure_ascii=False, indent=2, sort_keys=True)
        output.write("\n")
    unreal.log("[VEILPOINT] Native CH01 editor map authored: " + MAP_PACKAGE)
    unreal.log("[VEILPOINT] Spawn + 11 original colliding/noncolliding public-court actors saved")
    unreal.log("[VEILPOINT] Map receipt and SHA256 saved: " + RECEIPT_FILE)
    unreal.log_warning("[VEILPOINT] Native PIE, UBT build and actual RTX3070 performance NOT verified")
    return MAP_PACKAGE


author_ch01()
