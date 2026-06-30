import json
import tempfile
import unittest
from pathlib import Path

from vesta_bioclimatic.config_schema import SiteConfig
from vesta_bioclimatic.influx import InfluxClient
from vesta_bioclimatic.server import (
    CockpitService,
    _discover_influx_schema,
    _site_with_overlay,
    build_service,
)
from vesta_bioclimatic.sources import FileLiveSource, MemoryHistoryProvider


SITE_YAML = """
site_key: t
label: T
kind: home
groups:
  rdc: RDC
spaces:
  living:
    label: Living
    kind: interior
    group: rdc
    sensors:
      temperature: {measurement: temp, tags: {room: living}}
      humidity: {measurement: hum, tags: {room: living}}
"""


def write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


class OverlayTests(unittest.TestCase):
    def test_overlay_replaces_spaces_and_merges_groups(self):
        with tempfile.TemporaryDirectory() as tmp:
            site_path = write(Path(tmp) / "site.yaml", SITE_YAML)
            overlay = {
                "groups": {"module_vmc": "Module VMC"},
                "spaces": {
                    "echangeur": {"label": "Échangeur", "kind": "system", "group": "module_vmc",
                                  "sensors": {"temperature": {"measurement": "ex_t"}}},
                },
            }
            site = _site_with_overlay(site_path, overlay)
            self.assertEqual(set(site.spaces), {"echangeur"})
            self.assertEqual(site.spaces["echangeur"].kind, "system")
            self.assertEqual(site.groups["module_vmc"], "Module VMC")
            self.assertEqual(site.groups["rdc"], "RDC")  # original kept


class MappingServiceTests(unittest.TestCase):
    def _service(self, tmp: str) -> CockpitService:
        site_path = write(Path(tmp) / "site.yaml", SITE_YAML)
        values = write(Path(tmp) / "values.json", json.dumps({"living.temperature": 21.0, "living.humidity": 60.0}))
        # no persisted state/mapping yet
        return build_service(site_path, values, live="file", history="memory")

    def test_mapping_reflects_site(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = self._service(tmp)
            mapping = service.mapping()
            self.assertEqual(mapping["site_kind"], "home")
            living = next(s for s in mapping["spaces"] if s["key"] == "living")
            self.assertEqual(living["kind"], "interior")
            self.assertEqual(living["sensors"]["temperature"]["measurement"], "temp")
            self.assertEqual(living["sensors"]["temperature"]["tags"], {"room": "living"})

    def test_apply_mapping_updates_spaces(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = self._service(tmp)
            service.apply_mapping({
                "groups": {"rdc": "Rez-de-chaussée"},
                "spaces": {"living": {"label": "Salon", "kind": "interior", "group": "rdc",
                                       "sensors": {"temperature": {"measurement": "temp"}, "humidity": {"measurement": "hum"}}}},
            })
            living = next(s for s in service.mapping()["spaces"] if s["key"] == "living")
            self.assertEqual(living["label"], "Salon")
            self.assertEqual(service.site.groups["rdc"], "Rez-de-chaussée")
            # still serving points after the rebuild
            keys = {p["key"] for p in service.cockpit_view()["points"]}
            self.assertIn("living", keys)


class FakeClient(InfluxClient):
    def __init__(self, site, rows_by_fn):
        super().__init__(site.influx, token="fake")
        self._rows = rows_by_fn

    def query_csv(self, flux: str):
        for marker, rows in self._rows.items():
            if marker in flux:
                return rows
        return []


class SchemaDiscoveryTests(unittest.TestCase):
    def test_discover_schema_groups_results(self):
        site = SiteConfig.from_dict({"site_key": "t", "label": "T", "kind": "home",
                                     "influx": {"bucket": "b", "token_env": "X"}})
        client = FakeClient(site, {
            "schema.measurements": [{"_value": "climat_living"}, {"_value": "climat_patio"}],
            "schema.fieldKeys": [{"_value": "temperature"}, {"_value": "humidity"}, {"_value": "_start"}],
            "schema.tagKeys": [{"_value": "room"}, {"_value": "_measurement"}],
        })
        schema = client.discover_schema(bucket="b")
        self.assertEqual(schema["measurements"], ["climat_living", "climat_patio"])
        self.assertEqual(schema["fields"], ["humidity", "temperature"])  # _start filtered, sorted
        self.assertEqual(schema["tag_keys"], ["room"])  # _measurement filtered

    def test_discover_wrapper_uses_request_block(self):
        site = SiteConfig.from_dict({"site_key": "t", "label": "T", "kind": "home",
                                     "influx": {"bucket": "b", "token_env": "X"}})
        service = CockpitService(site, FileLiveSource(Path("/none")), MemoryHistoryProvider())

        class Stub(InfluxClient):
            def discover_schema(self, bucket=None, limit=500):
                return {"measurements": ["m"], "fields": ["f"], "tag_keys": ["t"], "_bucket": bucket}

        import vesta_bioclimatic.server as srv
        original = srv._influx_client_from_spec
        srv._influx_client_from_spec = lambda site, spec: Stub(site.influx, token="x")
        try:
            out = _discover_influx_schema(service, {"influx": {"bucket": "other"}})
        finally:
            srv._influx_client_from_spec = original
        self.assertEqual(out["_bucket"], "other")


if __name__ == "__main__":
    unittest.main()
