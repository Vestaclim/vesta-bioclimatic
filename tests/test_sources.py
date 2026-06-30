import unittest
from datetime import datetime, timedelta, timezone

from vesta_bioclimatic.sources import (
    MemoryHistoryProvider,
    SeriesSample,
    parse_window,
)


class ParseWindowTests(unittest.TestCase):
    def test_units(self):
        self.assertEqual(parse_window("90s"), timedelta(seconds=90))
        self.assertEqual(parse_window("30m"), timedelta(minutes=30))
        self.assertEqual(parse_window("12h"), timedelta(hours=12))
        self.assertEqual(parse_window("7d"), timedelta(days=7))

    def test_invalid_falls_back_to_default(self):
        self.assertEqual(parse_window("", default_seconds=42), timedelta(seconds=42))
        self.assertEqual(parse_window("garbage", default_seconds=42), timedelta(seconds=42))


class MemoryHistoryProviderTests(unittest.TestCase):
    def test_records_and_filters_by_window(self):
        provider = MemoryHistoryProvider()
        now = datetime.now(timezone.utc)
        # Two samples in window, one well outside it.
        provider.record({"living.temperature": 21.0}, now - timedelta(hours=1))
        provider.record({"living.temperature": 22.0}, now - timedelta(minutes=10))
        provider.record({"living.temperature": 20.0}, now - timedelta(days=2))

        result = provider.history(["living.temperature"], "12h")
        values = [sample.value for sample in result["living.temperature"]]
        self.assertEqual(values, [21.0, 22.0])

    def test_history_all_series_when_none_requested(self):
        provider = MemoryHistoryProvider()
        now = datetime.now(timezone.utc)
        provider.record({"a.temperature": 1.0, "b.humidity": 50.0}, now)
        result = provider.history(None, "1h")
        self.assertEqual(set(result.keys()), {"a.temperature", "b.humidity"})

    def test_non_numeric_values_are_skipped(self):
        provider = MemoryHistoryProvider()
        provider.record({"x.temperature": "nan-ish"}, datetime.now(timezone.utc))
        self.assertEqual(provider.history(None, "1h"), {})

    def test_ring_buffer_is_bounded(self):
        provider = MemoryHistoryProvider(max_points=3)
        base = datetime.now(timezone.utc)
        for i in range(10):
            provider.record({"k.v": float(i)}, base + timedelta(seconds=i))
        samples = provider.history(["k.v"], "1h")["k.v"]
        self.assertEqual(len(samples), 3)
        self.assertEqual([s.value for s in samples], [7.0, 8.0, 9.0])

    def test_sample_to_dict_is_iso_utc(self):
        sample = SeriesSample(ts=datetime(2026, 6, 15, 10, 0, tzinfo=timezone.utc), value=21.5)
        self.assertEqual(sample.to_dict(), {"ts": "2026-06-15T10:00:00+00:00", "value": 21.5})


if __name__ == "__main__":
    unittest.main()
