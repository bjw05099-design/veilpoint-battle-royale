"""Author and reopen the native, sourced CH01 map in the Unreal Editor."""

import hashlib
import json
import os

import unreal

ADEN_PACKAGE = "/Game/Maps/CH01_Aden"
ADEN_MATERIAL = "/Game/Materials/M_AdenSourceVertex"
ADEN_MODE = "/Script/Veilpoint.VPAdenStoryGameMode"
ADEN_ACTOR = "/Script/Veilpoint.VPAdenSourceWorld"
ATLAS_PACKAGE = "/Game/Maps/AdenAtlas"
ATLAS_SOURCES = (("local_atlas", "aden-atlas-local.png", "T_AdenAtlasLocal"),
                 ("regional_atlas", "aden-atlas-region.png", "T_AdenAtlasRegional"))


def import_atlas_textures():
    project = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
    source = os.path.join(project, "ContentSource", "Aden")
    with open(os.path.join(source, "aden-atlas.json"), encoding="utf-8") as stream:
        manifest = json.load(stream)
    if manifest.get("schema") != "veilpoint-native-aden-atlas-v1":
        raise RuntimeError("Incompatible Atlas manifest")
    textures = {}
    for prop, filename, asset in ATLAS_SOURCES:
        file = os.path.join(source, filename)
        with open(file, "rb") as stream:
            observed = hashlib.sha256(stream.read()).hexdigest()
        if observed != manifest["layers"][filename]["pngSha256"]:
            raise RuntimeError("Sourced Atlas texture hash is invalid: " + filename)
        target = ATLAS_PACKAGE + "/" + asset
        if unreal.EditorAssetLibrary.does_asset_exist(target):
            raise RuntimeError("Refusing to overwrite existing Atlas asset: " + target)
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", file)
        task.set_editor_property("destination_path", ATLAS_PACKAGE)
        task.set_editor_property("destination_name", asset)
        task.set_editor_property("automated", True)
        task.set_editor_property("replace_existing", False)
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
        texture = unreal.EditorAssetLibrary.load_asset(target)
        if not isinstance(texture, unreal.Texture2D):
            raise RuntimeError("Atlas asset was not registered as native Texture2D: " + target)
        texture.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_EDITOR_ICON)
        texture.set_editor_property("mip_gen_settings", unreal.TextureMipGenSettings.TMGS_NO_MIPMAPS)
        texture.set_editor_property("never_stream", True)
        if not unreal.EditorAssetLibrary.save_loaded_asset(texture):
            raise RuntimeError("Could not save cooked Atlas texture: " + target)
        textures[prop] = texture
    return textures


def author_aden_ch01(configure_daylight, verify_saved_daylight):
    assets = unreal.EditorAssetLibrary
    if assets.does_asset_exist(ADEN_PACKAGE) or assets.does_asset_exist(ADEN_MATERIAL):
        raise RuntimeError("Aden map or material exists; use a clean authoring checkout")
    mode, source_class = unreal.load_class(None, ADEN_MODE), unreal.load_class(None, ADEN_ACTOR)
    if not mode or not source_class:
        raise RuntimeError("Compile the native Aden runtime module first")
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    editor = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
    if not levels.new_level(ADEN_PACKAGE, False):
        raise RuntimeError("Cannot create the native Aden level")

    material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        "M_AdenSourceVertex", "/Game/Materials", unreal.Material, unreal.MaterialFactoryNew())
    if not material:
        raise RuntimeError("Cannot create native Aden vertex-color material")
    graph = unreal.MaterialEditingLibrary
    color = graph.create_material_expression(material, unreal.MaterialExpressionVertexColor)
    graph.connect_material_property(color, "", unreal.MaterialProperty.MP_BASE_COLOR)
    roughness = graph.create_material_expression(material, unreal.MaterialExpressionConstant)
    roughness.set_editor_property("r", 0.94)
    graph.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)
    graph.recompile_material(material)
    if not assets.save_loaded_asset(material):
        raise RuntimeError("Aden vertex-color material did not save")

    atlas = import_atlas_textures()
    world = editor.get_editor_world()
    world.get_world_settings().set_editor_property("default_game_mode", mode)
    origin = unreal.Vector(0, 0, 0)
    source = actors.spawn_actor_from_class(source_class, origin, unreal.Rotator())
    if not source:
        raise RuntimeError("Cannot place native Aden source actor")
    source.set_editor_property("vertex_color_material", material)
    for prop, texture in atlas.items():
        source.set_editor_property(prop, texture)
    source.set_actor_label("VP_Aden_PublicGeometry")
    sun = actors.spawn_actor_from_class(unreal.DirectionalLight, origin,
                                        unreal.Rotator(pitch=-48, yaw=18, roll=0))
    sky = actors.spawn_actor_from_class(unreal.SkyLight, origin)
    atmosphere = actors.spawn_actor_from_class(unreal.SkyAtmosphere, origin)
    if not sun or not sky or not atmosphere:
        raise RuntimeError("Cannot author Aden daylight")
    configure_daylight(sun, sky, atmosphere)
    if not levels.save_current_level() or not levels.load_level(ADEN_PACKAGE):
        raise RuntimeError("Cannot save and reopen the native Aden map")

    reloaded = [actor for actor in actors.get_all_level_actors() if actor.get_class() == source_class]
    if len(reloaded) != 1:
        raise RuntimeError("Reloaded Aden map must reference one registered source")
    saved_material = reloaded[0].get_editor_property("vertex_color_material")
    if not saved_material or saved_material.get_path_name() != ADEN_MATERIAL + ".M_AdenSourceVertex":
        raise RuntimeError("Reloaded Aden map lost its cooked material reference")
    if editor.get_editor_world().get_world_settings().get_editor_property("default_game_mode") != mode:
        raise RuntimeError("Reloaded Aden map lost its story GameMode")
    for prop, texture in atlas.items():
        observed = reloaded[0].get_editor_property(prop)
        if not observed or observed.get_path_name() != texture.get_path_name():
            raise RuntimeError("Reloaded Aden map lost its Atlas texture: " + prop)
    daylight = verify_saved_daylight(actors.get_all_level_actors())
    content = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir())
    map_file = os.path.join(content, "Maps", "CH01_Aden.umap")
    with open(map_file, "rb") as stream:
        binary = stream.read()
    if len(binary) < 2048:
        raise RuntimeError("Native Aden level has no valid saved map bytes")
    receipt = {"schema": "veilpoint-native-aden-authoring-v1", "map": ADEN_PACKAGE, "gameMode": ADEN_MODE,
               "mapSha256": hashlib.sha256(binary).hexdigest(), "mapBytes": len(binary),
               "sourceActorCount": len(reloaded), "atlasTextureCount": len(atlas), "savedReloadVerified": True, "daylight": daylight}
    saved = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir())
    target = os.path.join(saved, "Veilpoint", "ch01-aden-map-receipt.json")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w", encoding="utf-8") as stream:
        json.dump(receipt, stream, indent=2)
        stream.write("\n")
    unreal.log("VEILPOINT: native sourced CH01 map saved and reopened: " + ADEN_PACKAGE)
