"""Read-only UE5 Editor audit of original civilian quarter geometry.

Run only after authoring the optional Aden_TerrainLab level. This script
does not assert PIE, runtime collision, real Aden provenance or GPU FPS.
"""
import json
import math
import os
import unreal

LEVEL = "/Game/Maps/Aden_TerrainLab"
PREFIX = "VP_CIV_"
OUT = os.path.join(unreal.Paths.project_saved_dir(), "civilian-quarter-audit.json")


def audit():
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    if not world or LEVEL not in world.get_path_name():
        raise RuntimeError("Audit requires the isolated Aden_TerrainLab editor world")
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    actors = [a for a in subsystem.get_all_level_actors()
              if a.get_actor_label().startswith(PREFIX)]
    findings = []
    seen = set()
    for actor in actors:
        label = actor.get_actor_label()
        if label in seen:
            findings.append({"actor": label, "error": "duplicate actor label"})
        seen.add(label)
        component = actor.get_component_by_class(unreal.StaticMeshComponent)
        if component is None or component.get_static_mesh() is None:
            findings.append({"actor": label, "error": "missing static mesh"})
            continue
        location = actor.get_actor_location()
        scale = actor.get_actor_scale3d()
        values = [location.x, location.y, location.z, scale.x, scale.y, scale.z]
        if not all(math.isfinite(v) for v in values) or min(scale.x, scale.y, scale.z) <= 0:
            findings.append({"actor": label, "error": "invalid transform"})
        # A native editor collision flag check, NOT a successful PIE collision test.
        if component.get_collision_enabled() == unreal.CollisionEnabled.NO_COLLISION:
            if not any(token in label for token in ("awning",)):
                findings.append({"actor": label, "error": "unexpected noncolliding solid"})
    if len(actors) != 39:
        findings.append({"error": "expected 39 original civic actors", "actual": len(actors)})
    report = {
        "format": "veilpoint-civic-editor-audit-v1",
        "level": LEVEL,
        "actorsFound": len(actors),
        "issues": findings,
        "checks": ["editor world identity", "actor count", "unique actor labels",
                   "mesh presence", "finite positive transforms", "collision flags"],
        "notVerified": ["UE5 PIE walking and doorway clearance",
                        "terrain runtime seam collision", "RTX 3070 performance",
                        "surveyed Aden buildings or elevations"],
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    unreal.log("[VEILPOINT] Civic editor audit: " + OUT)
    if findings:
        raise RuntimeError("Civic editor audit found {} issue(s)".format(len(findings)))
    return report


audit()
