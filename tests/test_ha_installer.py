import importlib.util
import tempfile
import unittest
from pathlib import Path


INSTALLER = Path("homeassistant/install_to_config.py")


def load_installer():
    spec = importlib.util.spec_from_file_location("vesta_ha_installer", INSTALLER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class HomeAssistantInstallerTest(unittest.TestCase):
    def test_appends_panel_custom_section_when_missing(self):
        installer = load_installer()
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "configuration.yaml"
            config.write_text("default_config:\n", encoding="utf-8")
            installer.update_configuration(config)
            text = config.read_text(encoding="utf-8")
            self.assertIn("panel_custom:", text)
            self.assertIn("name: vesta-psychro-panel", text)
            self.assertIn("packages: !include_dir_named packages", text)
            self.assertEqual(text.count("panel_custom:"), 1)

    def test_inserts_into_existing_panel_custom_section(self):
        installer = load_installer()
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "configuration.yaml"
            config.write_text(
                "panel_custom:\n"
                "  - name: existing-panel\n"
                "    url_path: existing\n",
                encoding="utf-8",
            )
            installer.update_configuration(config)
            text = config.read_text(encoding="utf-8")
            self.assertIn("name: vesta-psychro-panel", text)
            self.assertIn("name: existing-panel", text)
            self.assertIn("homeassistant:", text)
            self.assertIn("packages: !include_dir_named packages", text)
            self.assertEqual(text.count("panel_custom:"), 1)

    def test_does_not_duplicate_existing_panel(self):
        installer = load_installer()
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "configuration.yaml"
            config.write_text(installer.PANEL_SECTION + installer.PACKAGES_SECTION, encoding="utf-8")
            installer.update_configuration(config)
            text = config.read_text(encoding="utf-8")
            self.assertEqual(text.count("name: vesta-psychro-panel"), 1)
            self.assertEqual(text.count("packages: !include_dir_named packages"), 1)

    def test_inserts_packages_into_existing_homeassistant_section(self):
        installer = load_installer()
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "configuration.yaml"
            config.write_text(
                "homeassistant:\n"
                "  name: Vesta\n"
                "default_config:\n",
                encoding="utf-8",
            )
            installer.update_configuration(config)
            text = config.read_text(encoding="utf-8")
            self.assertIn("homeassistant:\n  packages: !include_dir_named packages\n  name: Vesta\n", text)

    def test_installs_package_file(self):
        installer = load_installer()
        with tempfile.TemporaryDirectory() as tmp:
            config_dir = Path(tmp)
            (config_dir / "configuration.yaml").write_text("default_config:\n", encoding="utf-8")
            installer.install(config_dir, Path("homeassistant"))
            self.assertTrue((config_dir / "www" / "vesta-psychro" / "vesta-psychro-panel.js").exists())
            self.assertTrue((config_dir / "packages" / "vesta_house_model.yaml").exists())


if __name__ == "__main__":
    unittest.main()
