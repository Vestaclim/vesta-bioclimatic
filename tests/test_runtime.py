import unittest

from vesta_bioclimatic.config_schema import SiteConfig
from vesta_bioclimatic.runtime import MeasurementStore, build_cockpit_view, build_snapshot


class RuntimeTest(unittest.TestCase):
    def site(self):
        return SiteConfig.from_dict(
            {
                "schema_version": 1,
                "site_key": "test_home",
                "label": "Test Home",
                "kind": "home",
                "groups": {"rdc": "RDC", "exterior": "Extérieur"},
                "spaces": {
                    "patio": {
                        "label": "Patio",
                        "kind": "exterior",
                        "group": "exterior",
                        "sensors": {
                            "temperature": {"measurement": "climate", "field": "temperature_c"},
                            "humidity": {"measurement": "climate", "field": "rh_pct"},
                        },
                    },
                    "living": {
                        "label": "Living",
                        "kind": "interior",
                        "group": "rdc",
                        "volume_m3": 53.2,
                        "sensors": {
                            "temperature": {"measurement": "climate", "field": "temperature_c"},
                            "humidity": {"measurement": "climate", "field": "rh_pct"},
                        },
                    },
                    "salon": {
                        "label": "Salon",
                        "kind": "interior",
                        "group": "rdc",
                        "sensors": {
                            "temperature": {"measurement": "climate", "field": "temperature_c"},
                            "humidity": {"measurement": "climate", "field": "rh_pct"},
                        },
                    },
                },
                "actuators": {
                    "living_fan": {
                        "label": "Ventilateur Living",
                        "kind": "ceiling_fan",
                        "space": "living",
                        "command_metric": "living_fan.command",
                        "actual_metric": "living_fan.actual",
                    }
                },
            }
        )

    def measurements(self):
        return MeasurementStore.from_plain_dict(
            {
                "patio.temperature": 20.0,
                "patio.humidity": 55.0,
                "living.temperature": 24.0,
                "living.humidity": 52.0,
                "salon.temperature": 23.0,
                "salon.humidity": 50.0,
                "living_fan.command": 3,
                "living_fan.actual": 2,
            }
        )

    def test_build_snapshot_from_site_and_measurements(self):
        snapshot = build_snapshot(self.site(), self.measurements())
        self.assertEqual(len(snapshot.rooms), 2)
        self.assertEqual(snapshot.outdoor.temp_c, 20.0)
        self.assertEqual(snapshot.fans[0].direction, "forward")

    def test_cockpit_view_groups_links_and_actuator_sync(self):
        view = build_cockpit_view(self.site(), self.measurements())
        self.assertIn("rdc", view.groups)
        self.assertIn(("living", "salon"), view.group_links)
        self.assertEqual(view.actuators[0].status, "pending_or_divergent")
        self.assertFalse(view.actuators[0].synchronized)


if __name__ == "__main__":
    unittest.main()
