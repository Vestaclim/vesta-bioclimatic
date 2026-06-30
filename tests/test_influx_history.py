import os
import unittest
from datetime import datetime, timezone

from vesta_bioclimatic.config_schema import SiteConfig
from vesta_bioclimatic.influx import (
    InfluxClient,
    InfluxHistoryProvider,
    InfluxLiveSource,
    _auto_every,
    history_flux,
)


def make_site() -> SiteConfig:
    return SiteConfig.from_dict(
        {
            "site_key": "t",
            "label": "T",
            "kind": "home",
            "influx": {"url": "http://x:8086", "org": "o", "bucket": "b", "token_env": "TEST_TOK"},
            "groups": {"rdc": "RDC"},
            "spaces": {
                "living": {
                    "label": "Living",
                    "kind": "interior",
                    "group": "rdc",
                    "sensors": {
                        "temperature": {"measurement": "temperature", "field": "value", "tags": {"room": "living"}},
                        "humidity": {"measurement": "humidity", "field": "value", "tags": {"room": "living"}},
                    },
                }
            },
        }
    )


class FakeClient(InfluxClient):
    """InfluxClient with the HTTP layer replaced by canned CSV rows per measurement."""

    def __init__(self, site, rows_by_measurement):
        super().__init__(site.influx, token="fake")
        self._rows = rows_by_measurement
        self.queries = []

    def query_csv(self, flux: str):
        self.queries.append(flux)
        for measurement, rows in self._rows.items():
            if f'== "{measurement}"' in flux:
                return rows
        return []


class FluxBuilderTests(unittest.TestCase):
    def test_auto_every_scales_with_window(self):
        self.assertEqual(_auto_every("12h"), "144s")   # 43200/300
        self.assertEqual(_auto_every("30m"), "60s")    # floored
        self.assertEqual(_auto_every("7d"), "2016s")

    def test_history_flux_has_filters_and_aggregation(self):
        site = make_site()
        sensor = site.spaces["living"].sensors["temperature"]
        flux = history_flux("b", sensor, "12h", "144s")
        self.assertIn('r["_measurement"] == "temperature"', flux)
        self.assertIn('r["room"] == "living"', flux)
        self.assertIn("aggregateWindow(every: 144s, fn: mean", flux)
        self.assertIn("range(start: -12h)", flux)


class InfluxHistoryProviderTests(unittest.TestCase):
    def test_history_maps_keys_to_samples(self):
        site = make_site()
        rows = {
            "temperature": [
                {"_time": "2026-06-15T10:00:00Z", "_value": "21.5"},
                {"_time": "2026-06-15T10:05:00Z", "_value": "21.8"},
            ],
            "humidity": [{"_time": "2026-06-15T10:00:00Z", "_value": "60"}],
        }
        provider = InfluxHistoryProvider(site, client=FakeClient(site, rows))
        result = provider.history(["living.temperature", "living.humidity"], "12h")
        self.assertEqual([s.value for s in result["living.temperature"]], [21.5, 21.8])
        self.assertEqual(result["living.temperature"][0].ts, datetime(2026, 6, 15, 10, 0, tzinfo=timezone.utc))
        self.assertEqual([s.value for s in result["living.humidity"]], [60.0])

    def test_record_is_noop(self):
        site = make_site()
        provider = InfluxHistoryProvider(site, client=FakeClient(site, {}))
        self.assertIsNone(provider.record({"living.temperature": 21.0}, datetime.now(timezone.utc)))

    def test_unknown_series_skipped(self):
        site = make_site()
        provider = InfluxHistoryProvider(site, client=FakeClient(site, {}))
        self.assertEqual(provider.history(["ghost.metric"], "1h"), {})


class InfluxLiveSourceTests(unittest.TestCase):
    def test_reads_latest_per_sensor(self):
        site = make_site()
        rows = {
            "temperature": [{"_time": "2026-06-15T10:05:00Z", "_value": "21.8"}],
            "humidity": [{"_time": "2026-06-15T10:05:00Z", "_value": "60"}],
        }
        source = InfluxLiveSource(site, client=FakeClient(site, rows))
        values = source.read()
        self.assertEqual(values, {"living.temperature": 21.8, "living.humidity": 60.0})


class SelectionTests(unittest.TestCase):
    def test_auto_uses_memory_without_token(self):
        from vesta_bioclimatic.server import _select_history_provider
        from vesta_bioclimatic.sources import MemoryHistoryProvider

        site = make_site()
        os.environ.pop("TEST_TOK", None)
        self.assertIsInstance(_select_history_provider(site, "auto"), MemoryHistoryProvider)

    def test_auto_uses_influx_with_token(self):
        from vesta_bioclimatic.server import _select_history_provider

        site = make_site()
        os.environ["TEST_TOK"] = "secret"
        try:
            self.assertIsInstance(_select_history_provider(site, "auto"), InfluxHistoryProvider)
        finally:
            os.environ.pop("TEST_TOK", None)


if __name__ == "__main__":
    unittest.main()
