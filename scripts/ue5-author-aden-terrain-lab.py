"""Author a separate UE5 1:1 local civilian-terrain inspection level.

Run inside Unreal Editor Tools > Execute Python Script, AFTER compiling the
new AVPCityTerrainStreamActor. This creates a NEW level; it never modifies
the existing BR or CH01 maps. The input heights must already be prepared by
scripts/export-ue5-heightmaps.cjs and independently checked.

This script is NOT an assertion that UnrealBuildTool, PIE or World Partition
have run successfully in GitHub CI. It authors an opt-in ProceduralMesh test
map, NOT a finished native World Partition/Landscape shipping city.
"""
import os
import unreal

PACKAGE = "/Game/Maps/Aden_TerrainLab"
CONTENT_MAPS = os.path.join(unreal.Paths.project_content_dir(), "Maps")
LEVEL_FILE = os.path.join(CONTENT_MAPS, "Aden_TerrainLab.umap")


def author_terrain_lab():
    if os.path.isfile(LEVEL_FILE):
        raise RuntimeError("Aden_TerrainLab already exists; refusing overwrite")
    native = unreal.load_class(None, "/Script/Veilpoint.VPCityTerrainStreamActor")
    if not native:
        raise RuntimeError(
            "Compile Veilpoint C++ and enable ProceduralMeshComponent first")

    editor = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if not editor or not levels or not actors:
        raise RuntimeError("Editor subsystems unavailable")

    os.makedirs(CONTENT_MAPS, exist_ok=True)
    if not levels.new_level(PACKAGE, False):
        raise RuntimeError("Could not create terrain lab map")
    world = editor.get_editor_world()
    if not world:
        raise RuntimeError("Missing new editor world")

    # Base GameMode offers a flying inspection pawn; no battle-royale,
    # story mission markers, NPCs, opponents or live multiplayer.
    game_mode = unreal.load_class(None, "/Script/Engine.GameModeBase")
    if not game_mode:
        raise RuntimeError("GameModeBase unavailable")
    world.get_world_settings().set_editor_property(
        "default_game_mode", game_mode)

    terrain = actors.spawn_actor_from_class(
        native, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    spawn = actors.spawn_actor_from_class(
        unreal.PlayerStart, unreal.Vector(0, 0, 26000),
        unreal.Rotator(0, 0, 0))
    sun = actors.spawn_actor_from_class(
        unreal.DirectionalLight, unreal.Vector(0, 0, 30000),
        unreal.Rotator(-48, 20, 0))
    sky = actors.spawn_actor_from_class(
        unreal.SkyLight, unreal.Vector(0, 0, 13000),
        unreal.Rotator(0, 0, 0))
    if not terrain or not spawn or not sun or not sky:
        raise RuntimeError("Could not create all native terrain preview actors")
    terrain.set_editor_property("load_radius_tiles", 1)
    terrain.set_editor_property("sample_stride", 8)
    terrain.set_editor_property("create_terrain_collision", True)

    if not levels.save_current_level() or not os.path.isfile(LEVEL_FILE):
        raise RuntimeError("Native preview level did not save")

    unreal.log("[VEILPOINT] Authored " + PACKAGE)
    unreal.log("[VEILPOINT] Copy verified *.r16 and IMPORT_MANIFEST.json into "
               "<Project>/Saved/CityTiles BEFORE PIE.")
    unreal.log("[VEILPOINT] If absent, the map is intentionally EMPTY "
               "(never pretend missing tiles are real Aden).")
    unreal.log("[VEILPOINT] UE5 PIE/UBT and RTX3070 testing still REQUIRED.")
    return PACKAGE


author_terrain_lab()
