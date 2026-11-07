"""Author an initial UE 5.8 native CH01 map INSIDE Unreal Editor.

Use Tools > Execute Python Script with this file after the Veilpoint C++ module
has compiled. This runs in an actual editor world, not a GitHub Node runner.
Never overwrite an existing .umap; manually review/delete before retrying.
"""
import os
import unreal

MAP_PACKAGE = "/Game/Maps/CH01_Coast"
PROJECT_CONTENT = os.path.join(unreal.Paths.project_content_dir(), "Maps")
MAP_FILE = os.path.join(PROJECT_CONTENT, "CH01_Coast.umap")


def author_ch01():
    # Do not risk deleting user-authored work or modifying the BR startup map.
    if os.path.exists(MAP_FILE):
        raise RuntimeError("CH01_Coast.umap already exists; refusing to overwrite it")
    native_mode = unreal.load_class(None, "/Script/Veilpoint.VPStoryGameMode")
    if not native_mode:
        raise RuntimeError("Native VPStoryGameMode missing: compile Unreal C++ first")

    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    editor = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
    if not levels or not actors or not editor:
        raise RuntimeError("Unreal Editor subsystems are not available")
    os.makedirs(PROJECT_CONTENT, exist_ok=True)
    if not levels.new_level(MAP_PACKAGE, False):
        raise RuntimeError("Could not create /Game/Maps/CH01_Coast")
    world = editor.get_editor_world()
    if not world:
        raise RuntimeError("New native story level did not create an editor world")
    settings = world.get_world_settings()
    settings.set_editor_property("default_game_mode", native_mode)

    # Actual mission geometry and its seven interactive markers are spawned
    # by AVPStoryGameMode at BeginPlay, not duplicated in this editor map.
    # Keep the spawn clear of the deterministic coastal route structures.
    spawn = actors.spawn_actor_from_class(
        unreal.PlayerStart, unreal.Vector(0, 0, 160), unreal.Rotator(0, 0, 0))
    sunlight = actors.spawn_actor_from_class(
        unreal.DirectionalLight, unreal.Vector(0, 0, 2000),
        unreal.Rotator(-48, 18, 0))
    ambient = actors.spawn_actor_from_class(
        unreal.SkyLight, unreal.Vector(0, 0, 900),
        unreal.Rotator(0, 0, 0))
    if not spawn or not sunlight or not ambient:
        raise RuntimeError("Missing spawn, sunlight or skylight: do not package")
    if not levels.save_current_level() or not os.path.isfile(MAP_FILE):
        raise RuntimeError("Native CH01 map did not save successfully")

    unreal.log("[VEILPOINT] CH01 authoring generated " + MAP_PACKAGE)
    unreal.log("[VEILPOINT] Inspect PIE with VPStoryGameMode; native UBT/PIE has NOT been verified by this script")
    unreal.log("[VEILPOINT] Browser demo and BR default map remain unchanged")
    return MAP_PACKAGE


author_ch01()
