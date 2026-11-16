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
PROJECT_CONTENT = os.path.abspath(os.path.join(
    unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir()), "Maps"))
MAP_FILE = os.path.join(PROJECT_CONTENT, "CH01_Coast.umap")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAYOUT_FILE = os.path.join(ROOT, "scripts", "ch01-original-public-court.json")
RECEIPT_FILE = os.path.abspath(os.path.join(
    unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir()), "CH01_MAP_READY.json"))
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
            or data.get("courtCentreCm") != [11000, -3700]
            or data.get("minClearCentreAisleCm") < 650):
        raise RuntimeError("Unapproved or misrepresented original CH01 geometry")
    # Keep the authored court away from the existing world-collision cluster:
    # the old 68m/-66m centre overlapped a 15m x 27m building at 70m/-78m.
    # The new 110m/-37m walkable plaza has its own clearance verification.
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
        if (not 9200 <= x <= 12800 or not -5200 <= y <= -2300
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
            if abs(x - 11000) < (w / 2 + 325) and abs(y + 3700) < (d / 2 + 550):
                raise RuntimeError("Solid geometry blocks the central walkable aisle")
    return data, hashlib.sha256(raw).hexdigest()


def configure_daylight(sun, skylight, atmosphere):
    """Use dynamic daylight: this project deliberately disables baked lighting."""
    if not atmosphere:
        raise RuntimeError("Sky Atmosphere required for a captured daylight sky")
    direct = sun.get_component_by_class(unreal.DirectionalLightComponent)
    ambient = skylight.get_component_by_class(unreal.SkyLightComponent)
    if not direct or not ambient:
        raise RuntimeError("Daylight components unavailable")
    direct.set_mobility(unreal.ComponentMobility.MOVABLE)
    direct.set_intensity(50000.0)
    direct.set_editor_property("atmosphere_sun_light", True)
    ambient.set_mobility(unreal.ComponentMobility.MOVABLE)
    ambient.set_intensity(1.0)
    ambient.set_editor_property("real_time_capture", True)
    return {"sunLux": 50000.0, "movable": True,
            "skyAtmosphere": True, "skyRealTimeCapture": True}


def verify_saved_daylight(actors):
    """Read the reloaded map, rather than certifying setter calls alone."""
    suns = [a for a in actors if isinstance(a, unreal.DirectionalLight)]
    skies = [a for a in actors if isinstance(a, unreal.SkyLight)]
    atmospheres = [a for a in actors if isinstance(a, unreal.SkyAtmosphere)]
    if (len(suns), len(skies), len(atmospheres)) != (1, 1, 1):
        raise RuntimeError("Saved CH01 map must contain one sun, sky light and atmosphere")
    direct = suns[0].get_component_by_class(unreal.DirectionalLightComponent)
    ambient = skies[0].get_component_by_class(unreal.SkyLightComponent)
    if not direct or not ambient:
        raise RuntimeError("Saved CH01 daylight components missing")
    sun_lux = direct.get_editor_property("intensity")
    sky_intensity = ambient.get_editor_property("intensity")
    forward_z = suns[0].get_actor_forward_vector().z
    observed = {"sunLux": sun_lux, "skyIntensity": sky_intensity,
                "sunForwardZ": forward_z,
                "sunRotation": str(suns[0].get_actor_rotation()),
                "sunMobility": str(direct.get_editor_property("mobility")),
                "skyMobility": str(ambient.get_editor_property("mobility")),
                "atmosphereSun": direct.get_editor_property("atmosphere_sun_light"),
                "realTimeCapture": ambient.get_editor_property("real_time_capture")}
    if (direct.get_editor_property("mobility") != unreal.ComponentMobility.MOVABLE
            or ambient.get_editor_property("mobility") != unreal.ComponentMobility.MOVABLE
            or not direct.get_editor_property("atmosphere_sun_light")
            or not ambient.get_editor_property("real_time_capture")
            or not math.isclose(sun_lux, 50000.0, rel_tol=0.001)
            or not math.isclose(sky_intensity, 1.0, rel_tol=0.001)
            or not forward_z < -0.2):
        raise RuntimeError("Saved CH01 daylight is disabled, below the horizon or altered: "
                           + json.dumps(observed, sort_keys=True))
    return {"sunLux": sun_lux, "skyIntensity": sky_intensity,
            "sunForwardZ": forward_z, "movable": True,
            "skyAtmosphere": True, "skyRealTimeCapture": True,
            "savedReloadVerified": True}


def create_civic_finishes():
    """Original opaque PBR blockout finishes, saved and referenced by the map."""
    specs = {
        "Paving": ((0.26, 0.21, 0.15), 0.9, 0.0),
        "Wall": ((0.48, 0.43, 0.34), 0.78, 0.0),
        "Metal": ((0.12, 0.16, 0.17), 0.45, 0.7),
    }
    result = {}
    library = unreal.MaterialEditingLibrary
    for name, (color, roughness, metallic) in specs.items():
        asset_name = "M_CH01_" + name
        asset_path = "/Game/Materials/" + asset_name
        if unreal.EditorAssetLibrary.does_asset_exist(asset_path):
            raise RuntimeError("Refusing to overwrite an existing civic material: " + asset_path)
        material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
            asset_name, "/Game/Materials", unreal.Material, unreal.MaterialFactoryNew())
        if not material:
            raise RuntimeError("Cannot create civic finish: " + name)
        # Native streets use ISM components; their shader permutation must be
        # cooked even though the authored court uses ordinary StaticMeshActors.
        material.set_editor_property("used_with_instanced_static_meshes", True)
        base = library.create_material_expression(material, unreal.MaterialExpressionConstant3Vector)
        base.set_editor_property("constant", unreal.LinearColor(*color, 1.0))
        library.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)
        for value, prop in ((roughness, unreal.MaterialProperty.MP_ROUGHNESS),
                            (metallic, unreal.MaterialProperty.MP_METALLIC)):
            scalar = library.create_material_expression(material, unreal.MaterialExpressionConstant)
            scalar.set_editor_property("r", value)
            library.connect_material_property(scalar, "", prop)
        library.recompile_material(material)
        if not unreal.EditorAssetLibrary.save_loaded_asset(material):
            raise RuntimeError("Civic finish did not save: " + name)
        result[name] = material
    return result


def verify_saved_finishes(actors, finishes):
    count = 0
    expected = {material.get_path_name() for material in finishes.values()}
    for actor in actors:
        if not actor.get_actor_label().startswith(LABEL_PREFIX):
            continue
        mesh = actor.get_component_by_class(unreal.StaticMeshComponent)
        material = mesh.get_material(0) if mesh else None
        if not material or material.get_path_name() not in expected:
            raise RuntimeError("Saved civic actor lost its authored material")
        if not material.get_editor_property("used_with_instanced_static_meshes"):
            raise RuntimeError("Saved civic finish cannot render native instanced street meshes")
        count += 1
    if count != EXPECTED_PUBLIC_PIECES:
        raise RuntimeError("Saved civic material coverage is incomplete")
    return {"savedActorsWithMaterials": count, "materials": sorted(expected),
            "instancedStaticMeshUsageVerified": True,
            "photorealArtVerified": False}


def import_original_harbor(actors, finishes):
    """Import actual Blender FBX, retain open doors and named UCX collision."""
    source_dir = os.path.join(ROOT, "Unreal", "Veilpoint", "ContentSource", "OriginalHarbor")
    source = os.path.join(source_dir, "harbor.fbx")
    with open(os.path.join(source_dir, "blender-export.json"), encoding="utf-8") as stream:
        provenance = json.load(stream)
    with open(source, "rb") as stream:
        digest = hashlib.sha256(stream.read()).hexdigest()
    if digest != provenance["files"]["harbor.fbx"]["sha256"] or not provenance["originalPrototypeGeometry"]:
        raise RuntimeError("Original Blender harbor source integrity failed")
    options = unreal.FbxImportUI()
    options.set_editor_property("import_mesh", True)
    options.set_editor_property("import_as_skeletal", False)
    options.set_editor_property("import_materials", False)
    options.set_editor_property("import_textures", False)
    options.set_editor_property("automated_import_should_detect_type", False)
    options.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_STATIC_MESH)
    settings = options.get_editor_property("static_mesh_import_data")
    settings.set_editor_property("combine_meshes", False)
    settings.set_editor_property("auto_generate_collision", False)
    settings.set_editor_property("one_convex_hull_per_ucx", True)
    settings.set_editor_property("transform_vertex_to_absolute", True)
    with open(os.path.join(source_dir, "unreal-parts.json"), encoding="utf-8") as stream:
        manifest = json.load(stream)
    if (manifest.get("schema") != "veilpoint-harbor-unreal-parts-v1"
            or manifest.get("sourceSha256") != provenance["sourceSha256"]
            or len(manifest.get("parts", [])) != 10
            or sum(part.get("ucxCount", 0) for part in manifest["parts"]) != 9):
        raise RuntimeError("Incomplete per-mesh Blender FBX manifest")
    tasks = []
    for part in manifest["parts"]:
        if not re.fullmatch(r"VP_Harbor_[A-Za-z0-9_]+\.fbx", part["file"]):
            raise RuntimeError("Unsafe original harbor part filename")
        filename = os.path.join(source_dir, "unreal-parts", part["file"])
        with open(filename, "rb") as stream:
            if hashlib.sha256(stream.read()).hexdigest() != part["sha256"]:
                raise RuntimeError("Original harbor FBX part integrity failed")
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", filename)
        task.set_editor_property("destination_path", "/Game/OriginalHarbor")
        task.set_editor_property("destination_name", part["name"])
        task.set_editor_property("automated", True)
        task.set_editor_property("replace_existing", False)
        task.set_editor_property("save", True)
        task.set_editor_property("options", options)
        task.set_editor_property("factory", unreal.FbxFactory())
        tasks.append(task)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
    meshes = [unreal.load_asset(path) for task in tasks for path in task.get_editor_property("imported_object_paths")]
    meshes = [mesh for mesh in meshes if isinstance(mesh, unreal.StaticMesh)]
    if len(meshes) != 10:
        raise RuntimeError("Blender harbor import must produce exactly ten visual meshes: " + str(len(meshes)))
    subsystem = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
    imported = []
    convex = 0
    for mesh in meshes:
        count = subsystem.get_convex_collision_count(mesh)
        is_floor = "Floor" in mesh.get_name()
        if not is_floor and count < 1:
            raise RuntimeError("Original harbor mesh lost its named UCX collider: " + mesh.get_name())
        convex += count
        actor = actors.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(11000, -7500, -5), unreal.Rotator(0, 0, 0))
        actor.set_actor_label("VP_CH01_HARBOR_" + mesh.get_name())
        component = actor.get_component_by_class(unreal.StaticMeshComponent)
        component.set_static_mesh(mesh)
        component.set_material(0, finishes["Metal" if "Roof" in mesh.get_name() else "Wall"])
        component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION if is_floor else unreal.CollisionEnabled.QUERY_AND_PHYSICS)
        imported.append(actor.get_actor_label())
    if convex != 9:
        raise RuntimeError("Original harbor must preserve nine convex colliders: " + str(convex))
    return {"sourceFbxSha256": digest, "visualMeshes": len(imported), "convexColliders": convex,
            "actors": imported, "locationCm": [11000, -7500, -5],
            "originalBlenderGeometry": True, "perMeshFbxImport": True, "photorealArtVerified": False}


def verify_saved_harbor(actors, proof):
    observed = [actor for actor in actors if actor.get_actor_label().startswith("VP_CH01_HARBOR_")]
    if len(observed) != 10:
        raise RuntimeError("Saved map lost imported harbor actors")
    mins, maxs = [float("inf")] * 3, [float("-inf")] * 3
    for actor in observed:
        centre, extent = actor.get_actor_bounds(False)
        for i, axis in enumerate(("x", "y", "z")):
            mins[i] = min(mins[i], getattr(centre, axis) - getattr(extent, axis))
            maxs[i] = max(maxs[i], getattr(centre, axis) + getattr(extent, axis))
    dimensions = [maxs[i] - mins[i] for i in range(3)]
    if any(abs(actual - expected) > 10 for actual, expected in zip(dimensions, (1600, 2000, 918))):
        raise RuntimeError("Imported FBX units, axes or bounds changed: " + str(dimensions))
    proof["savedReloadVerified"] = True
    proof["dimensionsCm"] = dimensions
    return proof


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
        # Python uses (roll, pitch, yaw), unlike C++ FRotator(pitch, yaw, roll).
        # Positional (-48,18,0) aimed light UP, putting the sun below the horizon.
        unreal.Rotator(pitch=-48, yaw=18, roll=0))
    skylight = actors.spawn_actor_from_class(
        unreal.SkyLight, unreal.Vector(0, 0, 900), unreal.Rotator(0, 0, 0))
    atmosphere = actors.spawn_actor_from_class(
        unreal.SkyAtmosphere, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    if not player_start or not sun or not skylight:
        raise RuntimeError("Cannot author CH01 spawn and daylight: do not package")
    player_start.set_actor_label("VP_CH01_StoryPlayerStart")
    sun.set_actor_label("VP_CH01_Daylight")
    skylight.set_actor_label("VP_CH01_AmbientSky")
    daylight = configure_daylight(sun, skylight, atmosphere)
    atmosphere.set_actor_label("VP_CH01_SkyAtmosphere")
    finishes = create_civic_finishes()

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
        finish = ("Wall" if piece["kind"] == "structural-column"
                  else "Metal" if piece["kind"] in {"raised-canopy", "street-furniture"}
                  else "Paving")
        mesh.set_material(0, finishes[finish])
        actor.set_actor_scale3d(unreal.Vector(
            piece["widthCm"] / 100.0,
            piece["depthCm"] / 100.0,
            piece["heightCm"] / 100.0))
        mesh.set_collision_enabled(
            unreal.CollisionEnabled.QUERY_AND_PHYSICS if piece["solid"]
            else unreal.CollisionEnabled.NO_COLLISION)
        spawned.append(actor.get_actor_label())

    harbor_proof = import_original_harbor(actors, finishes)

    if len(spawned) != EXPECTED_PUBLIC_PIECES or len(set(spawned)) != len(spawned):
        raise RuntimeError("CH01 original public space incomplete or duplicated")
    if not levels.save_current_level() or not os.path.isfile(MAP_FILE):
        raise RuntimeError("Real native CH01_Coast.umap did not save successfully")
    if not levels.load_level(MAP_PACKAGE):
        raise RuntimeError("Saved CH01 map could not be reloaded for daylight verification")
    saved_actors = actors.get_all_level_actors()
    daylight = verify_saved_daylight(saved_actors)
    finish_proof = verify_saved_finishes(saved_actors, finishes)
    harbor_proof = verify_saved_harbor(saved_actors, harbor_proof)
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
        "daylight": daylight,
        "civicFinishes": finish_proof,
        "originalHarbor": harbor_proof,
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
