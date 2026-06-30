import unittest
from types import SimpleNamespace

from vesta_bioclimatic.config_schema import MqttConfig, SiteConfig
from vesta_bioclimatic.mqtt import MqttLiveSource, parse_mqtt_message


class ParseMqttMessageTests(unittest.TestCase):
    def test_per_metric_numeric(self):
        self.assertEqual(
            parse_mqtt_message("vesta", "vesta/living/temperature", b"21.5"),
            {"living.temperature": 21.5},
        )

    def test_state_json_blob(self):
        out = parse_mqtt_message("vesta", "vesta/living/state", b'{"temperature": 21.5, "humidity": 60}')
        self.assertEqual(out, {"living.temperature": 21.5, "living.humidity": 60.0})

    def test_nested_base_topic(self):
        self.assertEqual(
            parse_mqtt_message("vesta/site1", "vesta/site1/bureau/humidity", "48"),
            {"bureau.humidity": 48.0},
        )

    def test_ignores_other_base(self):
        self.assertEqual(parse_mqtt_message("vesta", "zigbee/living/temperature", b"21.5"), {})

    def test_ignores_non_numeric_per_metric(self):
        self.assertEqual(parse_mqtt_message("vesta", "vesta/living/temperature", b"warm"), {})

    def test_state_non_dict_ignored(self):
        self.assertEqual(parse_mqtt_message("vesta", "vesta/living/state", b"[1,2,3]"), {})

    def test_state_skips_non_numeric_fields(self):
        out = parse_mqtt_message("vesta", "vesta/living/state", b'{"temperature": 21.5, "mode": "auto"}')
        self.assertEqual(out, {"living.temperature": 21.5})

    def test_too_short_topic_ignored(self):
        self.assertEqual(parse_mqtt_message("vesta", "vesta/living", b"21.5"), {})


class MqttLiveSourceTests(unittest.TestCase):
    def test_on_message_updates_snapshot(self):
        source = MqttLiveSource(MqttConfig(base_topic="vesta"))
        source._on_message(None, None, SimpleNamespace(topic="vesta/living/temperature", payload=b"21.5"))
        source._on_message(None, None, SimpleNamespace(topic="vesta/living/humidity", payload=b"60"))
        source._on_message(None, None, SimpleNamespace(topic="vesta/chambre/state", payload=b'{"temperature": 22.0}'))
        self.assertEqual(
            source.read(),
            {"living.temperature": 21.5, "living.humidity": 60.0, "chambre.temperature": 22.0},
        )

    def test_latest_value_wins(self):
        source = MqttLiveSource(MqttConfig(base_topic="vesta"))
        source._on_message(None, None, SimpleNamespace(topic="vesta/living/temperature", payload=b"21.5"))
        source._on_message(None, None, SimpleNamespace(topic="vesta/living/temperature", payload=b"23.0"))
        self.assertEqual(source.read(), {"living.temperature": 23.0})


class MqttConfigTests(unittest.TestCase):
    def test_absent_block_is_none(self):
        site = SiteConfig.from_dict({"site_key": "t", "label": "T", "kind": "home"})
        self.assertIsNone(site.mqtt)

    def test_parsed_block(self):
        site = SiteConfig.from_dict(
            {"site_key": "t", "label": "T", "kind": "home", "mqtt": {"host": "broker", "port": 8883, "base_topic": "vesta/", "tls": True}}
        )
        self.assertEqual(site.mqtt.host, "broker")
        self.assertEqual(site.mqtt.port, 8883)
        self.assertEqual(site.mqtt.base_topic, "vesta")  # trailing slash stripped
        self.assertTrue(site.mqtt.tls)


def _mqtt_site() -> SiteConfig:
    return SiteConfig.from_dict(
        {
            "site_key": "t",
            "label": "T",
            "kind": "home",
            "groups": {"rdc": "RDC"},
            "mqtt": {"host": "127.0.0.1", "base_topic": "vesta"},
            "spaces": {
                "patio": {"label": "Patio", "kind": "exterior", "group": "exterior",
                          "sensors": {"temperature": {"measurement": "t"}, "humidity": {"measurement": "h"}}},
                "living": {"label": "Living", "kind": "interior", "group": "rdc",
                           "sensors": {"temperature": {"measurement": "t"}, "humidity": {"measurement": "h"}}},
            },
        }
    )


class MqttPipelineIntegrationTests(unittest.TestCase):
    def test_mqtt_messages_drive_cockpit_and_history(self):
        from vesta_bioclimatic.server import CockpitService
        from vesta_bioclimatic.sources import MemoryHistoryProvider

        site = _mqtt_site()
        source = MqttLiveSource(site.mqtt)
        # Simulate broker delivery (per-metric + a state blob).
        source._on_message(None, None, SimpleNamespace(topic="vesta/patio/temperature", payload=b"21.4"))
        source._on_message(None, None, SimpleNamespace(topic="vesta/patio/humidity", payload=b"67"))
        source._on_message(None, None, SimpleNamespace(topic="vesta/living/state", payload=b'{"temperature": 21.5, "humidity": 68}'))

        service = CockpitService(site, source, MemoryHistoryProvider())
        service.refresh()

        view = service.cockpit_view()
        points = {p["key"]: p for p in view["points"]}
        self.assertEqual(set(points), {"patio", "living"})
        self.assertEqual(points["living"]["temp_c"], 21.5)
        self.assertEqual(points["living"]["rh_pct"], 68.0)

        history = service.history(None, "1h")["series"]
        self.assertIn("living.temperature", history)
        self.assertEqual(history["living.temperature"][-1]["value"], 21.5)


class MqttSelectionTests(unittest.TestCase):
    def test_select_live_source_returns_mqtt(self):
        from vesta_bioclimatic.mqtt import MqttLiveSource as Source
        from vesta_bioclimatic.server import _select_live_source
        from vesta_bioclimatic.sources import MemoryHistoryProvider

        site = _mqtt_site()
        source = _select_live_source(site, "mqtt", "memory", None, MemoryHistoryProvider())
        self.assertIsInstance(source, Source)

    def test_select_live_source_mqtt_without_block_errors(self):
        from vesta_bioclimatic.server import _select_live_source
        from vesta_bioclimatic.sources import MemoryHistoryProvider

        site = SiteConfig.from_dict({"site_key": "t", "label": "T", "kind": "home"})
        with self.assertRaises(SystemExit):
            _select_live_source(site, "mqtt", "memory", None, MemoryHistoryProvider())


if __name__ == "__main__":
    unittest.main()
