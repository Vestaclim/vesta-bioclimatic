import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from vesta_bioclimatic.config_schema import SiteConfig
from vesta_bioclimatic.server import (
    CockpitService,
    _redact_profile,
    _redact_spec,
    _seed_conn_state,
    build_service,
    build_sources_from_profiles,
)
from vesta_bioclimatic.sources import (
    VestaRemoteHistoryProvider,
    VestaRemoteLiveSource,
    FileLiveSource,
    MemoryHistoryProvider,
    SeriesSample,
)


def make_site() -> SiteConfig:
    return SiteConfig.from_dict(
        {
            "site_key": "t", "label": "T", "kind": "home",
            "spaces": {
                "living": {"label": "Living", "kind": "interior",
                            "sensors": {"temperature": {"measurement": "t"}, "humidity": {"measurement": "h"}}},
            },
        }
    )


def write_values(values: dict) -> Path:
    handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    json.dump(values, handle)
    handle.close()
    return Path(handle.name)


class VestaRemoteSourceTests(unittest.TestCase):
    def test_remote_live_source_reads_values(self):
        source = VestaRemoteLiveSource("http://10.0.0.5:8770/")
        with mock.patch("vesta_bioclimatic.sources._http_get_json", return_value={"living.temperature": "21.5", "bad": "x"}) as fake:
            values = source.read()
        self.assertEqual(values["living.temperature"], 21.5)
        self.assertNotIn("bad", values)
        fake.assert_called_once_with("http://10.0.0.5:8770/api/values", source.timeout)

    def test_remote_live_source_requires_url(self):
        with self.assertRaises(ValueError):
            VestaRemoteLiveSource("").read()

    def test_remote_history_provider_parses_series(self):
        payload = {"series": {"living.temperature": [{"ts": "2026-06-15T10:00:00Z", "value": 21.0}]}}
        provider = VestaRemoteHistoryProvider("http://10.0.0.5:8770")
        with mock.patch("vesta_bioclimatic.sources._http_get_json", return_value=payload):
            data = provider.history(["living.temperature"], "12h")
        self.assertEqual(data["living.temperature"], [SeriesSample(ts=mock.ANY, value=21.0)])

    def test_remote_history_provider_propagates_error(self):
        provider = VestaRemoteHistoryProvider("http://10.0.0.5:8770")
        with mock.patch("vesta_bioclimatic.sources._http_get_json", return_value={"error": "boom"}):
            with self.assertRaises(RuntimeError):
                provider.history(None, "12h")


class BuildSourcesFromProfilesTests(unittest.TestCase):
    def test_independent_live_and_history_specs(self):
        site = make_site()
        path = write_values({"living.temperature": 21.0, "living.humidity": 60.0})
        live_spec = {"live": "file", "values_path": str(path)}
        history_spec = {"history": "remote", "remote": {"url": "http://10.0.0.5:8770"}}
        live, history, pressure = build_sources_from_profiles(site, live_spec, history_spec)
        self.assertIsInstance(live, FileLiveSource)
        self.assertIsInstance(history, VestaRemoteHistoryProvider)
        self.assertEqual(pressure, 1013.25)

    def test_remote_live_with_local_influx_history(self):
        from vesta_bioclimatic.influx import InfluxHistoryProvider

        site = make_site()
        live_spec = {"live": "remote", "remote": {"url": "http://10.0.0.5:8770"}}
        history_spec = {"history": "influx", "influx": {"bucket": "b2", "token": "tok"}}
        live, history, _ = build_sources_from_profiles(site, live_spec, history_spec)
        self.assertIsInstance(live, VestaRemoteLiveSource)
        self.assertIsInstance(history, InfluxHistoryProvider)


class SpecRoundTripTests(unittest.TestCase):
    def test_seed_conn_state_from_file_sources(self):
        site = make_site()
        path = write_values({"living.temperature": 21.0})
        live = FileLiveSource(path)
        history = MemoryHistoryProvider()
        state = _seed_conn_state(live, history, 1009.5)
        self.assertEqual(state["live_profiles"][0]["spec"], {"live": "file", "values_path": str(path)})
        self.assertEqual(state["history_profiles"][0]["spec"], {"history": "memory"})
        self.assertEqual(state["pressure_hpa"], 1009.5)
        # the seeded specs round-trip through build_sources_from_profiles
        live2, history2, _ = build_sources_from_profiles(
            site, state["live_profiles"][0]["spec"], state["history_profiles"][0]["spec"]
        )
        self.assertIsInstance(live2, FileLiveSource)
        self.assertIsInstance(history2, MemoryHistoryProvider)

    def test_seed_conn_state_from_remote_sources(self):
        live = VestaRemoteLiveSource("http://10.0.0.5:8770")
        history = VestaRemoteHistoryProvider("http://10.0.0.5:8770")
        state = _seed_conn_state(live, history, 1013.25)
        self.assertEqual(state["live_profiles"][0]["spec"], {"live": "remote", "remote": {"url": "http://10.0.0.5:8770"}})
        self.assertEqual(state["history_profiles"][0]["spec"], {"history": "remote", "remote": {"url": "http://10.0.0.5:8770"}})


class RedactionTests(unittest.TestCase):
    def test_redact_spec_strips_secrets(self):
        spec = {"live": "mqtt", "mqtt": {"host": "b", "password": "secret"}}
        redacted = _redact_spec(spec)
        self.assertNotIn("password", redacted["mqtt"])
        self.assertTrue(redacted["mqtt"]["has_password"])
        # original untouched
        self.assertEqual(spec["mqtt"]["password"], "secret")

    def test_redact_profile(self):
        profile = {"id": "p1", "name": "MQTT maison", "spec": {"history": "influx", "influx": {"bucket": "b", "token": "x"}}}
        redacted = _redact_profile(profile)
        self.assertEqual(redacted["id"], "p1")
        self.assertNotIn("token", redacted["spec"]["influx"])
        self.assertTrue(redacted["spec"]["influx"]["has_token"])


class ProfileManagementTests(unittest.TestCase):
    def _service(self) -> CockpitService:
        site = make_site()
        path = write_values({"living.temperature": 21.0, "living.humidity": 55.0})
        service = CockpitService(site, FileLiveSource(path), MemoryHistoryProvider())
        service.conn_state = {
            "live_profiles": [{"id": "p1", "name": "Fichier", "spec": {"live": "file", "values_path": str(path)}}],
            "active_live": "p1",
            "history_profiles": [{"id": "h1", "name": "Mémoire", "spec": {"history": "memory"}}],
            "active_history": "h1",
            "pressure_hpa": 1013.25,
        }
        return service

    def test_status_portable_then_connected(self):
        service = self._service()
        service.refresh()
        self.assertEqual(service.connectivity()["status"], "portable")

        pid = service.save_profile("live", {"name": "Distant", "spec": {"live": "remote", "remote": {"url": "http://10.0.0.5:8770"}}})
        service.activate_profile("live", pid)
        self.assertIsInstance(service.live_source, VestaRemoteLiveSource)
        self.assertEqual(service.connectivity()["status"], "connected")

    def test_delete_active_profile_falls_back(self):
        service = self._service()
        pid = service.save_profile("live", {"name": "Distant", "spec": {"live": "remote", "remote": {"url": "http://10.0.0.5:8770"}}})
        service.activate_profile("live", pid)
        service.delete_profile("live", pid)
        self.assertEqual(service.conn_state["active_live"], "p1")
        self.assertIsInstance(service.live_source, FileLiveSource)

    def test_save_profile_preserves_secret_when_omitted(self):
        service = self._service()
        pid = service.save_profile("history", {"name": "Influx", "spec": {"history": "influx", "influx": {"bucket": "b", "token": "tok"}}})
        # re-save without a token: existing token must be preserved
        service.save_profile("history", {"id": pid, "name": "Influx", "spec": {"history": "influx", "influx": {"bucket": "b2"}}})
        saved = next(p for p in service.conn_state["history_profiles"] if p["id"] == pid)
        self.assertEqual(saved["spec"]["influx"]["token"], "tok")
        self.assertEqual(saved["spec"]["influx"]["bucket"], "b2")

    def test_activate_unknown_profile_raises(self):
        service = self._service()
        with self.assertRaises(ValueError):
            service.activate_profile("live", "missing")

    def test_invalid_kind_raises(self):
        service = self._service()
        with self.assertRaises(ValueError):
            service.save_profile("bogus", {"name": "x", "spec": {}})


class BuildServiceMigrationTests(unittest.TestCase):
    def test_legacy_state_migrates_to_profiles(self):
        from vesta_bioclimatic.server import _save_state

        with tempfile.TemporaryDirectory() as tmp:
            site_path = Path(tmp) / "site.yaml"
            site_path.write_text(
                "site_key: t\nlabel: T\nkind: home\nspaces:\n  living:\n    label: Living\n    kind: interior\n",
                encoding="utf-8",
            )
            values = write_values({"living.temperature": 20.0, "living.humidity": 55.0})
            state = Path(tmp) / ".vesta_connectivity.json"
            _save_state(state, {"live": "file", "history": "memory", "values_path": str(values)})

            service = build_service(site_path, None, state_file=state)
            self.assertIn("live_profiles", service.conn_state)
            self.assertEqual(service.conn_state["live_profiles"][0]["spec"]["values_path"], str(values))
            self.assertEqual(service.connectivity()["status"], "portable")

    def test_new_format_state_round_trips(self):
        from vesta_bioclimatic.server import _save_state

        with tempfile.TemporaryDirectory() as tmp:
            site_path = Path(tmp) / "site.yaml"
            site_path.write_text(
                "site_key: t\nlabel: T\nkind: home\nspaces:\n  living:\n    label: Living\n    kind: interior\n",
                encoding="utf-8",
            )
            values = write_values({"living.temperature": 20.0, "living.humidity": 55.0})
            state = Path(tmp) / ".vesta_connectivity.json"
            conn_state = {
                "live_profiles": [{"id": "p1", "name": "Fichier", "spec": {"live": "file", "values_path": str(values)}}],
                "active_live": "p1",
                "history_profiles": [{"id": "h1", "name": "Mémoire", "spec": {"history": "memory"}}],
                "active_history": "h1",
                "pressure_hpa": 1001.0,
            }
            _save_state(state, conn_state)

            service = build_service(site_path, None, state_file=state)
            self.assertEqual(service.conn_state["active_live"], "p1")
            self.assertEqual(service.pressure_hpa, 1001.0)
            self.assertIsInstance(service.live_source, FileLiveSource)


if __name__ == "__main__":
    unittest.main()
