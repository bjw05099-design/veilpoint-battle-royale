"""Execute real authoring helpers against a saved-default-collision fixture.

Actual editor reload and packaged world probes remain mandatory native checks.
"""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest

SOURCE = Path(__file__).resolve().parents[1]/'scripts/ue5-author-ch01-map.py'
tree = ast.parse(SOURCE.read_text(encoding='utf-8'))
helpers = ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef)
    and node.name in {'persist_collision_profile', 'verify_collision_profile'}], type_ignores=[])
env = {'unreal': SimpleNamespace(CollisionEnabled=SimpleNamespace(NO_COLLISION=0, QUERY_AND_PHYSICS=3))}
exec(compile(helpers, str(SOURCE), 'exec'), env)


class Component:
    def __init__(self):
        self.default = True
        self.profile = 'BlockAll'
        self.mode = 3
    def get_editor_property(self, name):
        assert name == 'use_default_collision'
        return self.default
    def set_editor_property(self, name, value):
        assert name == 'use_default_collision'
        self.default = value
    def set_collision_profile_name(self, value):
        self.profile = value
        self.mode = 0 if value == 'NoCollision' else 3
    def get_collision_profile_name(self):
        return self.profile
    def get_collision_enabled(self):
        return self.mode
    def get_path_name(self):
        return 'SavedCubePavingFixture'
    def saved_reload(self):
        if self.default:
            self.set_collision_profile_name('BlockAll')


class CollisionProfiles(unittest.TestCase):
    def test_enabled_flag_alone_does_not_override_the_asset_default_on_reload(self):
        component = Component()
        component.mode = 0
        component.saved_reload()
        self.assertEqual(component.mode, 3)
        with self.assertRaises(RuntimeError):
            env['verify_collision_profile'](component, False)

    def test_real_helper_preserves_both_paving_and_solid_profiles_on_reload(self):
        for solid in (False, True):
            component = Component()
            env['persist_collision_profile'](component, solid)
            component.saved_reload()
            env['verify_collision_profile'](component, solid)
            self.assertFalse(component.default)
            self.assertEqual(component.mode, 3 if solid else 0)

    def test_saved_profile_mode_or_default_corruption_is_rejected(self):
        for field, value in [('default', True), ('profile', 'BlockAll'), ('mode', 3)]:
            component = Component()
            env['persist_collision_profile'](component, False)
            setattr(component, field, value)
            with self.assertRaises(RuntimeError):
                env['verify_collision_profile'](component, False)


if __name__ == '__main__':
    unittest.main()
