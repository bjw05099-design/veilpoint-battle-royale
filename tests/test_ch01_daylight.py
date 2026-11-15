"""Exercise production light configuration without pretending to render UE."""
import ast
import math
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

source = Path(__file__).resolve().parents[1] / "scripts/ue5-author-ch01-map.py"
tree = ast.parse(source.read_text(encoding="utf-8"))
function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "configure_daylight")


class Component:
    def __init__(self):
        self.properties = {}

    def set_mobility(self, value):
        self.properties["mobility"] = value

    def set_intensity(self, value):
        self.properties["intensity"] = value

    def set_editor_property(self, name, value):
        self.properties[name] = value

    def get_editor_property(self, name):
        return self.properties[name]


class Sun:
    def __init__(self, component, forward_z=-0.743):
        self.component, self.forward_z = component, forward_z

    def get_component_by_class(self, cls):
        return self.component

    def get_actor_forward_vector(self):
        return SimpleNamespace(z=self.forward_z)

    def get_actor_rotation(self):
        return "test rotation"


class Sky:
    def __init__(self, component):
        self.component = component

    def get_component_by_class(self, cls):
        return self.component


class Atmosphere:
    pass


class DaylightTests(unittest.TestCase):
    def setUp(self):
        self.direct, self.ambient = Component(), Component()
        self.sun = SimpleNamespace(get_component_by_class=lambda cls: self.direct)
        self.sky = SimpleNamespace(get_component_by_class=lambda cls: self.ambient)
        engine = SimpleNamespace(DirectionalLightComponent=object(), SkyLightComponent=object(),
                                 ComponentMobility=SimpleNamespace(MOVABLE="movable"))
        scope = {"unreal": engine}
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"), scope)
        self.configure = scope["configure_daylight"]
        engine.DirectionalLight, engine.SkyLight, engine.SkyAtmosphere = Sun, Sky, Atmosphere
        verify = next(n for n in tree.body if isinstance(n, ast.FunctionDef)
                      and n.name == "verify_saved_daylight")
        scope.update(math=math, json=json)
        exec(compile(ast.Module(body=[verify], type_ignores=[]), str(source), "exec"), scope)
        self.verify = scope["verify_saved_daylight"]
        self.saved_sun, self.saved_sky = Sun(self.direct), Sky(self.ambient)
        self.saved = [self.saved_sun, self.saved_sky, Atmosphere()]

    def test_no_baked_lighting_dependency_and_visible_sky(self):
        self.configure(self.sun, self.sky, object())
        self.assertEqual(self.direct.properties["mobility"], "movable")
        self.assertGreaterEqual(self.direct.properties["intensity"], 10000)
        self.assertTrue(self.direct.properties["atmosphere_sun_light"])
        self.assertEqual(self.ambient.properties["mobility"], "movable")
        self.assertGreater(self.ambient.properties["intensity"], 0)
        self.assertTrue(self.ambient.properties["real_time_capture"])

    def test_missing_atmosphere_rejected(self):
        with self.assertRaises(RuntimeError):
            self.configure(self.sun, self.sky, None)

    def test_missing_light_component_rejected(self):
        missing = SimpleNamespace(get_component_by_class=lambda cls: None)
        with self.assertRaises(RuntimeError):
            self.configure(missing, self.sky, object())

    def test_reloaded_light_values_are_used_in_receipt(self):
        self.configure(self.sun, self.sky, object())
        receipt = self.verify(self.saved)
        self.assertTrue(receipt["savedReloadVerified"])
        self.assertAlmostEqual(receipt["sunForwardZ"], -0.743)
        self.assertEqual(receipt["sunLux"], 50000)

    def test_missing_or_duplicate_saved_lights_rejected(self):
        self.configure(self.sun, self.sky, object())
        for actors in (self.saved[:-1], self.saved + [self.saved_sun]):
            with self.subTest(actors=actors), self.assertRaises(RuntimeError):
                self.verify(actors)

    def test_below_horizon_or_unpersisted_changes_rejected(self):
        for name, value in (("intensity", 0), ("mobility", "static"),
                            ("atmosphere_sun_light", False)):
            self.configure(self.sun, self.sky, object())
            self.direct.properties[name] = value
            with self.subTest(property=name), self.assertRaises(RuntimeError):
                self.verify(self.saved)
        self.configure(self.sun, self.sky, object())
        self.saved_sun.forward_z = 0.743
        with self.assertRaises(RuntimeError):
            self.verify(self.saved)

    def test_authoring_uses_python_rotation_names_and_downward_sun(self):
        # Execute the actual constructor expression with Python's documented
        # roll/pitch/yaw order: this catches the C++ positional-order mistake.
        sun_spawn = next(n for n in ast.walk(tree) if isinstance(n, ast.Assign)
                         and any(isinstance(t, ast.Name) and t.id == "sun" for t in n.targets))
        expression = sun_spawn.value.args[2]
        def rotator(roll=0., pitch=0., yaw=0.):
            return SimpleNamespace(roll=roll, pitch=pitch, yaw=yaw)
        result = eval(compile(ast.Expression(expression), str(source), "eval"),
                      {"unreal": SimpleNamespace(Rotator=rotator)})
        self.assertLess(math.sin(math.radians(result.pitch)), -0.2)
        self.assertEqual(result.yaw, 18)
        self.assertEqual(result.roll, 0)

    def test_all_unreal_python_rotations_name_nonzero_axes(self):
        for script in source.parent.glob("*.py"):
            for node in ast.walk(ast.parse(script.read_text(encoding="utf-8"))):
                if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                        and isinstance(node.func.value, ast.Name)
                        and node.func.value.id == "unreal" and node.func.attr == "Rotator"):
                    with self.subTest(script=script.name, line=node.lineno):
                        self.assertTrue(all(isinstance(a, ast.Constant) and a.value == 0
                                            for a in node.args),
                                        "Name nonzero Python rotation axes; C++ has a different order")


if __name__ == "__main__":
    unittest.main()
