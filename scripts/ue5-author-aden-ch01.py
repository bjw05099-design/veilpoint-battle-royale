"""Author and reopen the native, sourced CH01 map in the Unreal Editor."""

import hashlib
import json
import os
import runpy
from pathlib import Path

import unreal

ADEN_PACKAGE = "/Game/Maps/CH01_Aden"
ADEN_MATERIAL = "/Game/Materials/M_AdenSourceVertex"
ADEN_BACKDROP_MATERIAL = "/Game/Materials/M_AdenSourceBackdrop"
ADEN_MODE = "/Script/Veilpoint.VPAdenStoryGameMode"
ADEN_ACTOR = "/Script/Veilpoint.VPAdenSourceWorld"
ATLAS_PACKAGE = "/Game/Maps/AdenAtlas"
GROUND_PACKAGE = "/Game/Maps/AdenGround"
PROP_SURFACE_PACKAGE = "/Game/Materials/AdenProps"
ATLAS_SOURCES = (("local_atlas", "aden-atlas-local.png", "T_AdenAtlasLocal"),
                 ("regional_atlas", "aden-atlas-region.png", "T_AdenAtlasRegional"),
                 ("detail_relief_atlas", "aden-atlas-detail-relief.png", "T_AdenAtlasDetailRelief"),
                 ("west_atlas", "aden-atlas-west.png", "T_AdenAtlasWest"))


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


def import_surface_texture(path, package, settings):
    target = package + "/" + path.stem
    assets = unreal.EditorAssetLibrary
    if assets.does_asset_exist(target):
        raise RuntimeError("Refusing to overwrite existing Aden surface asset: " + target)
    task = unreal.AssetImportTask()
    task.set_editor_property("filename", str(path))
    task.set_editor_property("destination_path", package)
    task.set_editor_property("destination_name", path.stem)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_existing", False)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    texture = assets.load_asset(target)
    if not isinstance(texture, unreal.Texture2D):
        raise RuntimeError("Aden surface import produced no Texture2D: " + target)
    texture.set_editor_property("compression_settings", settings)
    texture.set_editor_property("srgb", False)
    texture.set_editor_property("address_x", unreal.TextureAddress.TA_WRAP)
    texture.set_editor_property("address_y", unreal.TextureAddress.TA_WRAP)
    if not assets.save_loaded_asset(texture):
        raise RuntimeError("Could not save native Aden surface art: " + target)
    return texture


def import_ground_detail():
    project = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
    generator = runpy.run_path(str(Path(__file__).with_name("build-aden-ground-detail.py")))
    output = project / "Saved" / "Veilpoint" / "GroundDetailSource"
    paths = generator["create"](output)
    specs = (("ground_normal", unreal.TextureCompressionSettings.TC_NORMALMAP),
             ("ground_roughness", unreal.TextureCompressionSettings.TC_GRAYSCALE),
             ("ground_color_variation", unreal.TextureCompressionSettings.TC_GRAYSCALE),
             ("rock_normal", unreal.TextureCompressionSettings.TC_NORMALMAP),
             ("rock_roughness", unreal.TextureCompressionSettings.TC_GRAYSCALE),
             ("rock_color_variation", unreal.TextureCompressionSettings.TC_GRAYSCALE))
    textures = {prop: import_surface_texture(path, GROUND_PACKAGE, settings)
                for path, (prop, settings) in zip(paths, specs, strict=True)}
    prop_texture = import_surface_texture(generator["create_prop_finish"](output), PROP_SURFACE_PACKAGE,
                                          unreal.TextureCompressionSettings.TC_MASKS)
    return textures, prop_texture


def connect_ground_detail(material, textures, atlas_blend):
    graph = unreal.MaterialEditingLibrary
    uv = graph.create_material_expression(material, unreal.MaterialExpressionTextureCoordinate)
    uv.set_editor_property("coordinate_index", 1)
    surface_uv = graph.create_material_expression(material, unreal.MaterialExpressionTextureCoordinate)
    surface_uv.set_editor_property("coordinate_index", 2)
    strength = graph.create_material_expression(material, unreal.MaterialExpressionScalarParameter)
    strength.set_editor_property("parameter_name", "AdenGroundDetailStrength")
    strength.set_editor_property("default_value", 0.0)
    depth = graph.create_material_expression(material, unreal.MaterialExpressionPixelDepth)
    scaled = graph.create_material_expression(material, unreal.MaterialExpressionMultiply)
    scaled.set_editor_property("const_b", 1.0 / 6500.0)
    def link(source, output, target, pin):
        if not graph.connect_material_expressions(source, output, target, pin):
            raise RuntimeError("Aden ground detail could not connect "
                               + target.get_class().get_name() + " input " + (pin or "(first)"))

    def assign(source, output, prop):
        if not graph.connect_material_property(source, output, prop):
            raise RuntimeError("Aden ground detail material output could not be connected: " + str(prop))

    def sample(key, parameter, sampler):
        node = graph.create_material_expression(material, unreal.MaterialExpressionTextureSampleParameter2D)
        node.set_editor_property("texture", textures[key])
        node.set_editor_property("parameter_name", parameter)
        node.set_editor_property("sampler_type", sampler)
        link(uv, "", node, "")
        return node

    def mix(low, high, channel, alpha):
        node = graph.create_material_expression(material, unreal.MaterialExpressionLinearInterpolate)
        link(low, channel, node, "A")
        link(high, channel, node, "B")
        link(alpha, "", node, "Alpha")
        return node

    rock_weight = graph.create_material_expression(material, unreal.MaterialExpressionComponentMask)
    rock_weight.set_editor_property("r", True)
    rock_weight.set_editor_property("g", False)
    rock_weight.set_editor_property("b", False)
    rock_weight.set_editor_property("a", False)
    link(surface_uv, "", rock_weight, "")
    edge_weight = graph.create_material_expression(material, unreal.MaterialExpressionComponentMask)
    edge_weight.set_editor_property("r", False)
    edge_weight.set_editor_property("g", True)
    edge_weight.set_editor_property("b", False)
    edge_weight.set_editor_property("a", False)
    link(surface_uv, "", edge_weight, "")

    link(depth, "", scaled, "A")
    falloff = graph.create_material_expression(material, unreal.MaterialExpressionSubtract)
    falloff.set_editor_property("const_a", 1.0)
    link(scaled, "", falloff, "B")
    clamp = graph.create_material_expression(material, unreal.MaterialExpressionSaturate)
    link(falloff, "", clamp, "")
    distance_weight = graph.create_material_expression(material, unreal.MaterialExpressionMultiply)
    link(clamp, "", distance_weight, "A")
    link(strength, "", distance_weight, "B")
    weight = graph.create_material_expression(material, unreal.MaterialExpressionMultiply)
    link(distance_weight, "", weight, "A")
    link(edge_weight, "", weight, "B")

    normal_sampler = unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL
    normal = mix(sample("ground_normal", "AdenGroundNormal", normal_sampler),
                 sample("rock_normal", "AdenRockNormal", normal_sampler), "RGB", rock_weight)
    flat = graph.create_material_expression(material, unreal.MaterialExpressionConstant3Vector)
    flat.set_editor_property("constant", unreal.LinearColor(0.0, 0.0, 1.0, 1.0))
    normal_blend = graph.create_material_expression(material, unreal.MaterialExpressionLinearInterpolate)
    link(flat, "", normal_blend, "A")
    link(normal, "", normal_blend, "B")
    link(weight, "", normal_blend, "Alpha")
    assign(normal_blend, "", unreal.MaterialProperty.MP_NORMAL)

    grayscale = unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_GRAYSCALE
    rough = mix(sample("ground_roughness", "AdenGroundRoughness", grayscale),
                sample("rock_roughness", "AdenRockRoughness", grayscale), "R", rock_weight)
    rough_blend = graph.create_material_expression(material, unreal.MaterialExpressionLinearInterpolate)
    rough_blend.set_editor_property("const_a", .94)
    link(rough, "", rough_blend, "B")
    link(weight, "", rough_blend, "Alpha")
    assign(rough_blend, "", unreal.MaterialProperty.MP_ROUGHNESS)

    variation = mix(sample("ground_color_variation", "AdenGroundColorVariation", grayscale),
                    sample("rock_color_variation", "AdenRockColorVariation", grayscale), "R", rock_weight)
    remap = graph.create_material_expression(material, unreal.MaterialExpressionLinearInterpolate)
    remap.set_editor_property("const_a", .74)
    remap.set_editor_property("const_b", 1.26)
    link(variation, "", remap, "Alpha")
    tint = graph.create_material_expression(material, unreal.MaterialExpressionLinearInterpolate)
    tint.set_editor_property("const_a", 1.0)
    link(remap, "", tint, "B")
    link(weight, "", tint, "Alpha")
    albedo = graph.create_material_expression(material, unreal.MaterialExpressionMultiply)
    link(atlas_blend, "", albedo, "A")
    link(tint, "", albedo, "B")
    assign(albedo, "", unreal.MaterialProperty.MP_BASE_COLOR)


def import_sounds(samples, names, output):
    sounds = []
    for name in names:
        target = output + "/" + name
        if unreal.EditorAssetLibrary.does_asset_exist(target):
            raise RuntimeError("Refusing to overwrite existing Aden audio: " + target)
        task = unreal.AssetImportTask()
        task.set_editor_property("filename", str(samples / (name + ".wav")))
        task.set_editor_property("destination_path", output)
        task.set_editor_property("automated", True)
        task.set_editor_property("replace_existing", False)
        unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
        sound = unreal.EditorAssetLibrary.load_asset(target)
        if not isinstance(sound, unreal.SoundWave):
            raise RuntimeError("Aden audio import produced no SoundWave: " + name)
        if name == "SW_AdenStreetWind":
            sound.set_editor_property("looping", True)
        if not unreal.EditorAssetLibrary.save_loaded_asset(sound):
            raise RuntimeError("Could not save Aden audio: " + target)
        sounds.append(sound)
    return sounds


def import_field_audio():
    project = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
    samples = project / "Saved" / "Veilpoint" / "FieldAudioSource"
    generator = runpy.run_path(str(Path(__file__).with_name("build-aden-story-audio.py")))
    generator["create"](samples)
    names = ["SW_AdenStreetWind", "SW_AdenFoot1", "SW_AdenFoot2", "SW_AdenFoot3", "SW_AdenDossierCue"]
    return import_sounds(samples, names, "/Game/Audio/Aden")


def import_prologue_audio():
    project = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir()))
    samples = project / "Saved" / "Veilpoint" / "PrologueAudioSource"
    generator = runpy.run_path(str(Path(__file__).with_name("build-aden-story-audio.py")))
    assets = runpy.run_path(str(Path(__file__).with_name("build-aden-prologue-voice.py")))
    beds = generator["create_prologue_beds"](samples, assets["prologue_timings"]())
    takes = assets["validated_takes"]()
    for name, wave in takes:
        (samples / (name + ".wav")).write_bytes(wave)
    output = "/Game/Audio/Aden/Opening"
    return import_sounds(samples, [name for name, _ in takes], output), import_sounds(samples, beds, output)


def create_station_material(finish_texture):
    name = "M_AdenFieldStation"
    material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        name, "/Game/Materials", unreal.Material, unreal.MaterialFactoryNew())
    if not material:
        raise RuntimeError("Missing field station material")
    graph = unreal.MaterialEditingLibrary

    def node(kind, **properties):
        result = graph.create_material_expression(material, kind)
        for key, value in properties.items():
            result.set_editor_property(key, value)
        return result

    def connect(source, target, pin="", output=""):
        if not graph.connect_material_expressions(source, output, target, pin):
            raise RuntimeError("Aden prop surface could not connect " + target.get_class().get_name() + " " + pin)

    def scalar(name, default):
        return node(unreal.MaterialExpressionScalarParameter, parameter_name=name, default_value=default)

    def mask(source, channels):
        result = node(unreal.MaterialExpressionComponentMask, **{c: c in channels for c in "rgba"})
        connect(source, result)
        return result

    def binary(kind, left, right):
        result = node(kind)
        connect(left, result, "A")
        connect(right, result, "B")
        return result

    def lerp(low, high, alpha):
        result = node(unreal.MaterialExpressionLinearInterpolate)
        for value, pin in ((low, "A"), (high, "B"), (alpha, "Alpha")):
            if isinstance(value, (int, float)):
                result.set_editor_property("const_" + pin.lower(), value)
            else:
                connect(value, result, pin)
        return result

    multiply, divide, add = (unreal.MaterialExpressionMultiply, unreal.MaterialExpressionDivide,
                             unreal.MaterialExpressionAdd)
    local = node(unreal.MaterialExpressionLocalPosition)
    # These three primitive data values are the authored mesh component's XYZ scale.
    scale = node(unreal.MaterialExpressionVectorParameter, parameter_name="PropAxisScale",
                 default_value=unreal.LinearColor(1., 1., 1., 0.), use_custom_primitive_data=True,
                 primitive_data_index=0)
    scaled_position = node(multiply)
    connect(local, scaled_position, "A")
    connect(scale, scaled_position, "B", "RGB")
    position = binary(divide, scaled_position, scalar("PropTileCm", 48.))

    normal = node(unreal.MaterialExpressionPreSkinnedNormal)
    normal_pixels = node(unreal.MaterialExpressionVertexInterpolator)
    connect(normal, normal_pixels)
    weights = node(unreal.MaterialExpressionAbs)
    connect(normal_pixels, weights)
    weights_total = binary(unreal.MaterialExpressionDotProduct, weights,
                           node(unreal.MaterialExpressionConstant3Vector, constant=unreal.LinearColor(1., 1., 1., 1.)))
    weights = binary(divide, weights, weights_total)

    layers = []
    for plane, axis in (("gb", "r"), ("rb", "g"), ("rg", "b")):
        sample = node(unreal.MaterialExpressionTextureSampleParameter2D, parameter_name="PropFinish",
                      texture=finish_texture, sampler_type=unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)
        connect(mask(position, plane), sample)
        weighted = node(multiply)
        connect(sample, weighted, "A", "RGB")
        connect(mask(weights, axis), weighted, "B")
        layers.append(weighted)
    finish = binary(add, binary(add, layers[0], layers[1]), layers[2])

    tint = node(unreal.MaterialExpressionVectorParameter, parameter_name="Tint",
                default_value=unreal.LinearColor(.55, .34, .13, 1.))
    painted = node(multiply)
    connect(tint, painted, "A", "RGB")
    connect(lerp(1., lerp(.70, 1.30, mask(finish, "r")), scalar("FinishGrain", .25)), painted, "B")
    wear = binary(multiply, mask(finish, "b"), scalar("FinishWear", 0.))
    substrate = node(unreal.MaterialExpressionConstant3Vector, constant=unreal.LinearColor(.22, .24, .25, 1.))
    roughness = binary(add, scalar("FinishRoughness", .62), lerp(-.14, .14, mask(finish, "g")))
    outputs = ((lerp(painted, substrate, wear), unreal.MaterialProperty.MP_BASE_COLOR),
               (lerp(roughness, .48, wear), unreal.MaterialProperty.MP_ROUGHNESS),
               (lerp(scalar("FinishMetallic", 0.), .88, wear), unreal.MaterialProperty.MP_METALLIC))
    if not all(graph.connect_material_property(node, "", prop) for node, prop in outputs):
        raise RuntimeError("Aden prop material could not connect its surface properties")
    graph.layout_material_expressions(material)
    graph.recompile_material(material)
    if not unreal.EditorAssetLibrary.save_loaded_asset(material):
        raise RuntimeError("Field station material did not save")
    return material


def create_terrain_material(path, relief, detail=None):
    package, name = path.rsplit("/", 1)
    material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        name, package, unreal.Material, unreal.MaterialFactoryNew())
    if not material:
        raise RuntimeError("Cannot create native Aden terrain material: " + path)

    graph = unreal.MaterialEditingLibrary
    color = graph.create_material_expression(material, unreal.MaterialExpressionVertexColor)
    material.set_editor_property("two_sided", True)
    source_color = graph.create_material_expression(material, unreal.MaterialExpressionTextureSampleParameter2D)
    source_color.set_editor_property("parameter_name", "AdenRelief")
    source_color.set_editor_property("texture", relief)
    blend = graph.create_material_expression(material, unreal.MaterialExpressionLinearInterpolate)
    atlas_weight = graph.create_material_expression(material, unreal.MaterialExpressionMultiply)
    atlas_weight.set_editor_property("const_b", 0.28)
    inputs = ((color, "A", atlas_weight, "A"), (atlas_weight, "", blend, "Alpha"),
              (color, "", blend, "A"), (source_color, "RGB", blend, "B"))
    if not all(graph.connect_material_expressions(*connection) for connection in inputs):
        raise RuntimeError("Aden terrain material could not connect its sourced color: " + path)

    if detail is not None:
        connect_ground_detail(material, detail, blend)
    else:
        roughness = graph.create_material_expression(material, unreal.MaterialExpressionConstant)
        roughness.set_editor_property("r", .94)
        if not all(graph.connect_material_property(node, "", prop) for node, prop in
                   ((blend, unreal.MaterialProperty.MP_BASE_COLOR), (roughness, unreal.MaterialProperty.MP_ROUGHNESS))):
            raise RuntimeError("Aden backdrop material could not connect its surface properties")

    graph.layout_material_expressions(material)
    graph.recompile_material(material)
    if not unreal.EditorAssetLibrary.save_loaded_asset(material):
        raise RuntimeError("Aden terrain material did not save: " + path)
    return material


def author_aden_ch01(configure_daylight, verify_saved_daylight):
    assets = unreal.EditorAssetLibrary
    if any(assets.does_asset_exist(path) for path in (ADEN_PACKAGE, ADEN_MATERIAL, ADEN_BACKDROP_MATERIAL)):
        raise RuntimeError("Aden map or material exists; use a clean authoring checkout")
    mode, source_class = unreal.load_class(None, ADEN_MODE), unreal.load_class(None, ADEN_ACTOR)
    if not mode or not source_class:
        raise RuntimeError("Compile the native Aden runtime module first")
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    editor = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
    if not levels.new_level(ADEN_PACKAGE, False):
        raise RuntimeError("Cannot create the native Aden level")

    atlas = import_atlas_textures()
    ground_detail, prop_finish = import_ground_detail()
    ambience, *cues = import_field_audio()
    voice, beds = import_prologue_audio()
    station_material = create_station_material(prop_finish)
    station_mesh = assets.load_asset("/Engine/BasicShapes/Cube")
    if not station_mesh:
        raise RuntimeError("Native station mesh is missing")
    material = create_terrain_material(ADEN_MATERIAL, atlas["local_atlas"], ground_detail)
    backdrop = create_terrain_material(ADEN_BACKDROP_MATERIAL, atlas["local_atlas"])
    graph = unreal.MaterialEditingLibrary

    world = editor.get_editor_world()
    world.get_world_settings().set_editor_property("default_game_mode", mode)
    origin = unreal.Vector(0, 0, 0)
    source = actors.spawn_actor_from_class(source_class, origin, unreal.Rotator())
    if not source:
        raise RuntimeError("Cannot place native Aden source actor")
    source.set_editor_property("vertex_color_material", material)
    source.set_editor_property("backdrop_material", backdrop)
    source.set_editor_property("station_mesh", station_mesh)
    source.set_editor_property("station_material", station_material)
    source.set_editor_property("wind_sound", ambience)
    source.set_editor_property("step_sounds", cues[:3])
    source.set_editor_property("dossier_sound", cues[3])
    source.set_editor_property("prologue_voice", voice)
    source.set_editor_property("prologue_beds", beds)
    for prop, texture in {**atlas, **ground_detail}.items():
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
    for prop, expected in (("vertex_color_material", material), ("backdrop_material", backdrop)):
        saved_material = reloaded[0].get_editor_property(prop)
        if not saved_material or saved_material.get_path_name() != expected.get_path_name():
            raise RuntimeError("Reloaded Aden map lost its cooked material reference: " + prop)
        if not saved_material.get_editor_property("two_sided"):
            raise RuntimeError("Reloaded Aden material lost two-sided terrain rendering: " + prop)
    if editor.get_editor_world().get_world_settings().get_editor_property("default_game_mode") != mode:
        raise RuntimeError("Reloaded Aden map lost its story GameMode")
    for prop, texture in {**atlas, **ground_detail}.items():
        observed = reloaded[0].get_editor_property(prop)
        if not observed or observed.get_path_name() != texture.get_path_name():
            raise RuntimeError("Reloaded Aden map lost a ground or atlas texture: " + prop)
    station = reloaded[0]
    saved_station_material = station.get_editor_property("station_material")
    if not station.get_editor_property("station_mesh") or not saved_station_material:
        raise RuntimeError("Reloaded map lost field station references")
    saved_finish = graph.get_material_default_texture_parameter_value(saved_station_material, "PropFinish")
    if not saved_finish or saved_finish.get_path_name() != prop_finish.get_path_name():
        raise RuntimeError("Reloaded map lost the packed Aden prop finish texture")
    if not station.get_editor_property("wind_sound") or not station.get_editor_property("dossier_sound")             or len(station.get_editor_property("step_sounds")) != 3:
        raise RuntimeError("Reloaded map lost field audio references")
    for prop, expected in (("prologue_voice", voice), ("prologue_beds", beds)):
        observed = station.get_editor_property(prop)
        if [sound.get_path_name() for sound in observed if sound] != [sound.get_path_name() for sound in expected]:
            raise RuntimeError("Reloaded Aden map lost prologue sound references: " + prop)
    daylight = verify_saved_daylight(actors.get_all_level_actors())
    content = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir())
    map_file = os.path.join(content, "Maps", "CH01_Aden.umap")
    with open(map_file, "rb") as stream:
        binary = stream.read()
    if len(binary) < 2048:
        raise RuntimeError("Native Aden level has no valid saved map bytes")
    receipt = {"schema": "veilpoint-native-aden-authoring-v1", "map": ADEN_PACKAGE, "gameMode": ADEN_MODE,
               "mapSha256": hashlib.sha256(binary).hexdigest(), "mapBytes": len(binary),
               "sourceActorCount": len(reloaded), "atlasTextureCount": len(atlas), "groundDetailTextures": len(ground_detail),
               "terrainMaterialsSaved": True,
               "propFinishSaved": True,
               "fieldAudioCount": 5,
               "prologueVoiceCount": len(voice), "prologueBedCount": len(beds),
               "fieldStationSaved": True, "savedReloadVerified": True, "daylight": daylight}
    saved = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir())
    target = os.path.join(saved, "Veilpoint", "ch01-aden-map-receipt.json")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w", encoding="utf-8") as stream:
        json.dump(receipt, stream, indent=2)
        stream.write("\n")
    unreal.log("VEILPOINT: native sourced CH01 map saved and reopened: " + ADEN_PACKAGE)


def author_br_development():
    package = "/Game/Maps/BR_Development"
    mode = unreal.load_class(None, "/Script/Veilpoint.VPGameMode")
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    editor = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
    if not mode or unreal.EditorAssetLibrary.does_asset_exist(package) or not levels.new_level(package, False):
        raise RuntimeError("Cannot author fresh native BR development world")
    editor.get_editor_world().get_world_settings().set_editor_property("default_game_mode", mode)
    if not levels.save_current_level() or not levels.load_level(package):
        raise RuntimeError("Native BR development world failed saved reload")
    if editor.get_editor_world().get_world_settings().get_editor_property("default_game_mode") != mode:
        raise RuntimeError("Native BR development world lost its game mode")
    unreal.log("Native BR development world saved and reopened")
