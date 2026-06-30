import json
import tempfile
import unittest
from pathlib import Path

from vesta_bioclimatic.config_schema import SiteConfig
from vesta_bioclimatic.server import CockpitService, build_sources_from_spec
from vesta_bioclimatic.sources import FileLiveSource, MemoryHistoryProvider


def make_site() -> SiteConfig:
    return SiteConfig.from_dict(
        {
            "site_key": "t", "label": "T", "kind": "home",
            "groups": {"rdc": "RDC"},
            "influx": {"url": "http://x:8086", "org": "o", "bucket": "b", "token_env": "T_TOK"},
            "spaces": {
                "living": {"label": "Living", "kind": "interior", "group": "rdc",
                           "sensors": {"temperature": {"measurement": "t"}, "humidity": {"measurement": "h"}}},
            },
        }
    )


def write_values(values: dict) -> Path:
    handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    json.dump(values, handle)
    handle.close()
    return Path(handle.name)


class BuildSourcesFromSpecTests(unittest.TestCase):
    def test_file_memory(self):
        site = make_site()
        path = write_values({"living.temperature": 21.0, "living.humidity": 60.0})
        live, history, pressure = build_sources_from_spec(site, {"mode": "file_memory", "values_path": str(path), "pressure_hpa": 1008})
        self.assertIsInstance(live, FileLiveSource)
        self.assertIsInstance(history, MemoryHistoryProvider)
        self.assertEqual(pressure, 1008.0)
        self.assertEqual(live.read()["living.temperature"], 21.0)

    def test_file_mode_requires_path(self):
        with self.assertRaises(ValueError):
            build_sources_from_spec(make_site(), {"mode": "file_memory"})

    def test_mqtt_memory_carries_password(self):
        from vesta_bioclimatic.mqtt import MqttLiveSource

        site = make_site()
        live, history, _ = build_sources_from_spec(
            site,
            {"mode": "mqtt_memory", "mqtt": {"host": "broker", "base_topic": "vesta", "username": "u", "password": "secret"}},
        )
        self.assertIsInstance(live, MqttLiveSource)
        self.assertIsInstance(history, MemoryHistoryProvider)
        self.assertEqual(live.config.host, "broker")
        self.assertEqual(live.config.password, "secret")

    def test_influx_uses_request_connection(self):
        from vesta_bioclimatic.influx import InfluxHistoryProvider, InfluxLiveSource

        site = make_site()
        live, history, _ = build_sources_from_spec(
            site,
            {"mode": "influx", "influx": {"url": "http://db:8086", "bucket": "mybucket", "token": "tok"}},
        )
        self.assertIsInstance(live, InfluxLiveSource)
        self.assertIsInstance(history, InfluxHistoryProvider)
        self.assertEqual(live.client.config.bucket, "mybucket")
        self.assertEqual(live.client.token, "tok")
        # live and history share the same client (built from the request).
        self.assertIs(live.client, history.client)


class DecoupledLiveHistoryTests(unittest.TestCase):
    def test_independent_live_and_history(self):
        site = make_site()
        path = write_values({"living.temperature": 21.0, "living.humidity": 60.0})
        # live=file, history=influx are chosen independently
        live, history, _ = build_sources_from_spec(
            site, {"live": "file", "history": "influx", "values_path": str(path), "influx": {"bucket": "b2"}}
        )
        self.assertIsInstance(live, FileLiveSource)
        from vesta_bioclimatic.influx import InfluxHistoryProvider

        self.assertIsInstance(history, InfluxHistoryProvider)

    def test_live_from_history_uses_influx_latest(self):
        from vesta_bioclimatic.influx import InfluxLiveSource

        site = make_site()
        live, history, _ = build_sources_from_spec(site, {"live": "history", "history": "influx"})
        self.assertIsInstance(live, InfluxLiveSource)
        self.assertIs(live.client, history.client)  # shared connection

    def test_live_from_history_memory_is_history_backed(self):
        from vesta_bioclimatic.sources import HistoryBackedLiveSource, MemoryHistoryProvider

        site = make_site()
        live, history, _ = build_sources_from_spec(site, {"live": "history", "history": "memory"})
        self.assertIsInstance(live, HistoryBackedLiveSource)
        self.assertIsInstance(history, MemoryHistoryProvider)

    def test_history_file_provider(self):
        from vesta_bioclimatic.sources import FileHistoryProvider

        site = make_site()
        hist_file = write_values({"series": {"living.temperature": [{"ts": "2026-06-15T10:00:00Z", "value": 21.0}]}})
        _, history, _ = build_sources_from_spec(site, {"live": "history", "history": "file", "history_path": str(hist_file)})
        self.assertIsInstance(history, FileHistoryProvider)


class BrowseTests(unittest.TestCase):
    def test_browse_lists_dirs_and_json(self):
        from vesta_bioclimatic.server import _browse_dir

        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "sub").mkdir()
            (Path(tmp) / "values.json").write_text("{}")
            (Path(tmp) / "notes.txt").write_text("x")
            (Path(tmp) / ".hidden.json").write_text("{}")
            result = _browse_dir(tmp)
            names = {(e["name"], e["type"]) for e in result["entries"]}
            self.assertIn(("sub", "dir"), names)
            self.assertIn(("values.json", "file"), names)
            self.assertNotIn(("notes.txt", "file"), names)  # non-json filtered
            self.assertFalse(any(e["name"].startswith(".") for e in result["entries"]))
            self.assertIsNotNone(result["parent"])


class ReconfigureTests(unittest.TestCase):
    def test_reconfigure_swaps_source_and_refreshes(self):
        site = make_site()
        path_a = write_values({"living.temperature": 21.0, "living.humidity": 60.0})
        service = CockpitService(site, FileLiveSource(path_a), MemoryHistoryProvider())
        service.refresh()
        conn = service.connectivity()
        self.assertEqual((conn["live"], conn["history"]), ("file", "memory"))
        first = {p["key"]: p for p in service.cockpit_view()["points"]}
        self.assertEqual(first["living"]["temp_c"], 21.0)

        path_b = write_values({"living.temperature": 25.5, "living.humidity": 50.0})
        live, history, pressure = build_sources_from_spec(site, {"mode": "file_memory", "values_path": str(path_b)})
        service.reconfigure(live, history, pressure)

        after = {p["key"]: p for p in service.cockpit_view()["points"]}
        self.assertEqual(after["living"]["temp_c"], 25.5)


class PersistenceTests(unittest.TestCase):
    def test_save_load_roundtrip_and_perms(self):
        import os

        from vesta_bioclimatic.server import _load_state, _save_state

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / ".vesta_connectivity.json"
            spec = {"live": "mqtt", "history": "memory", "mqtt": {"host": "b", "password": "secret"}}
            _save_state(path, spec)
            self.assertEqual(_load_state(path), spec)
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)

    def test_default_state_file_next_to_site(self):
        from vesta_bioclimatic.server import default_state_file

        self.assertEqual(default_state_file(Path("/x/y/site.yaml")).name, ".vesta_connectivity.json")
        self.assertEqual(default_state_file(Path("/x/y/site.yaml")).parent, Path("/x/y"))

    def test_build_service_applies_persisted_spec(self):
        from vesta_bioclimatic.server import _save_state, build_service
        from vesta_bioclimatic.sources import FileLiveSource as FLS

        with tempfile.TemporaryDirectory() as tmp:
            site_path = Path(tmp) / "site.yaml"
            site_path.write_text(
                "site_key: t\nlabel: T\nkind: home\nspaces:\n  living:\n    label: Living\n    kind: interior\n",
                encoding="utf-8",
            )
            values = write_values({"living.temperature": 20.0, "living.humidity": 55.0})
            state = Path(tmp) / ".vesta_connectivity.json"
            _save_state(state, {"live": "file", "history": "memory", "values_path": str(values)})
            # CLI says live=auto/no values, but the persisted spec should win.
            service = build_service(site_path, None, state_file=state)
            self.assertIsInstance(service.live_source, FLS)
            self.assertEqual(service.state_file, state)


if __name__ == "__main__":
    unittest.main()
