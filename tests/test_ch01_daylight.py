"""Exercise production light configuration without pretending to render UE."""
import ast
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


if __name__ == "__main__":
    unittest.main()
