"""Small InfluxDB v2 adapter used by the portable Python runtime."""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from io import StringIO
from typing import Iterable

import requests

from .config_schema import InfluxConfig, SensorRef, SiteConfig


@dataclass(frozen=True, slots=True)
class SeriesPoint:
    metric: str
    value: float
    time: datetime | None = None
    unit: str | None = None
    tags: dict[str, str] | None = None


class InfluxError(RuntimeError):
    pass


class InfluxClient:
    """Thin HTTP client, intentionally explicit and easy to replace."""

    def __init__(self, config: InfluxConfig, token: str | None = None) -> None:
        self.config = config
        self.token = token if token is not None else os.getenv(config.token_env)

    def _headers(self) -> dict[str, str]:
        if not self.token:
            raise InfluxError(
                f"Missing InfluxDB token. Set environment variable {self.config.token_env} "
                "or pass token=... to InfluxClient."
            )
        return {
            "Authorization": f"Token {self.token}",
            "Accept": "application/csv",
            "Content-Type": "application/vnd.flux",
        }

    def query_csv(self, flux: str) -> list[dict[str, str]]:
        url = f"{self.config.url.rstrip('/')}/api/v2/query?org={self.config.org}"
        response = requests.post(
            url,
            data=flux.encode("utf-8"),
            headers=self._headers(),
            timeout=20,
            verify=self.config.verify_ssl,
        )
        if response.status_code >= 400:
            raise InfluxError(f"InfluxDB query failed {response.status_code}: {response.text[:300]}")
        text = "\n".join(line for line in response.text.splitlines() if line and not line.startswith("#"))
        if not text:
            return []
        return list(csv.DictReader(StringIO(text)))

    def history(self, sensor: SensorRef, window: str, every: str | None = None) -> list[SeriesPoint]:
        """Return a downsampled time series for one sensor over `window`.

        `every` controls the aggregation bucket (mean); when omitted it is sized
        from the window to keep payloads around a few hundred points.
        """
        rows = self.query_csv(history_flux(self.config.bucket, sensor, window, every or _auto_every(window)))
        series: list[SeriesPoint] = []
        for row in rows:
            value = _float(row.get("_value"))
            time = _parse_time(row.get("_time"))
            if value is None or time is None:
                continue
            series.append(SeriesPoint(metric=sensor.metric, value=value, time=time, unit=sensor.unit, tags=sensor.tags))
        return series

    def latest(self, sensor: SensorRef, window: str | None = None) -> SeriesPoint | None:
        rows = self.query_csv(latest_flux(self.config.bucket, sensor, window or self.config.default_window))
        if not rows:
            return None
        row = rows[-1]
        value = _float(row.get("_value"))
        if value is None:
            return None
        return SeriesPoint(
            metric=sensor.metric,
            value=value,
            time=_parse_time(row.get("_time")),
            unit=sensor.unit,
            tags=sensor.tags,
        )

    def latest_for_site(self, site: SiteConfig) -> dict[str, SeriesPoint]:
        points: dict[str, SeriesPoint] = {}
        for space in site.spaces.values():
            for metric, sensor in space.sensors.items():
                point = self.latest(sensor)
                if point is not None:
                    points[f"{space.key}.{metric}"] = point
        return points

    def discover_schema(self, bucket: str | None = None, limit: int = 500) -> dict[str, list[str]]:
        """Discover what is available in the bucket (the 'référentiel'): the
        measurements, field keys and tag keys the mapping editor binds against."""
        bucket = bucket or self.config.bucket

        def values(fn: str) -> list[str]:
            rows = self.query_csv(f'import "influxdata/influxdb/schema"\n{fn}\n  |> limit(n: {int(limit)})')
            found = {row.get("_value") for row in rows if row.get("_value")}
            return sorted(value for value in found if value and not str(value).startswith("_"))

        return {
            "measurements": values(f'schema.measurements(bucket: "{_escape(bucket)}")'),
            "fields": values(f'schema.fieldKeys(bucket: "{_escape(bucket)}")'),
            "tag_keys": values(f'schema.tagKeys(bucket: "{_escape(bucket)}")'),
        }

    def schema_extract(self, bucket: str | None = None, window: str = "30d", limit: int = 300) -> list[dict[str, str]]:
        """Return a compact list of observed measurements/fields/tag keys."""

        flux = f'''
import "influxdata/influxdb/schema"
schema.measurementFieldKeys(bucket: "{bucket or self.config.bucket}")
  |> limit(n: {int(limit)})
'''
        return self.query_csv(flux)


def history_flux(bucket: str, sensor: SensorRef, window: str, every: str) -> str:
    joined = " and ".join(_sensor_filters(sensor))
    return f'''
from(bucket: "{_escape(bucket)}")
  |> range(start: -{window})
  |> filter(fn: (r) => {joined})
  |> aggregateWindow(every: {every}, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value"])
  |> sort(columns: ["_time"])
'''


def _sensor_filters(sensor: SensorRef) -> list[str]:
    filters = [
        f'r["_measurement"] == "{_escape(sensor.measurement)}"',
        f'r["_field"] == "{_escape(sensor.field)}"',
    ]
    for key, value in sensor.tags.items():
        filters.append(f'r["{_escape(key)}"] == "{_escape(value)}"')
    return filters


def _auto_every(window: str, target_points: int = 300, floor_seconds: int = 60) -> str:
    """Pick an aggregation bucket so a window yields ~target_points samples."""
    from .sources import parse_window

    total = parse_window(window).total_seconds()
    every = max(floor_seconds, int(total / max(1, target_points)))
    return f"{every}s"


def latest_flux(bucket: str, sensor: SensorRef, window: str) -> str:
    joined = " and ".join(_sensor_filters(sensor))
    return f'''
from(bucket: "{_escape(bucket)}")
  |> range(start: -{window})
  |> filter(fn: (r) => {joined})
  |> last()
'''


class InfluxLiveSource:
    """LiveSource backed by InfluxDB: the latest value of each mapped sensor."""

    def __init__(self, site: SiteConfig, client: "InfluxClient | None" = None, token: str | None = None) -> None:
        self.site = site
        self.client = client or InfluxClient(site.influx, token)

    def read(self) -> dict[str, float]:
        return {key: point.value for key, point in self.client.latest_for_site(self.site).items()}


class InfluxHistoryProvider:
    """HistoryProvider backed by InfluxDB range queries.

    Pull-based: `record()` is a no-op because the database already holds the
    series (written by Home Assistant, Telegraf, etc.). `<space>.<metric>` keys
    are resolved to the site's SensorRef mapping.
    """

    def __init__(self, site: SiteConfig, client: "InfluxClient | None" = None, token: str | None = None) -> None:
        self.site = site
        self.client = client or InfluxClient(site.influx, token)
        self._sensors: dict[str, SensorRef] = {
            f"{space.key}.{metric}": sensor
            for space in site.spaces.values()
            for metric, sensor in space.sensors.items()
        }

    def record(self, values: dict[str, float], ts) -> None:  # noqa: D401 - pull-based
        return None

    def history(self, series: list[str] | None, window: str):
        from .sources import SeriesSample

        keys = series if series else list(self._sensors.keys())
        result: dict[str, list] = {}
        for key in keys:
            sensor = self._sensors.get(key)
            if sensor is None:
                continue
            points = self.client.history(sensor, window)
            samples = [SeriesSample(ts=point.time, value=point.value) for point in points if point.time is not None]
            if samples:
                result[key] = samples
        return result


def suggest_yaml_mapping(rows: Iterable[dict[str, str]]) -> str:
    """Create a commented YAML scratchpad from an Influx schema extract."""

    lines = [
        "# Scratch mapping generated from InfluxDB metadata.",
        "# Copy relevant blocks into config/site_house.yaml or config/site_system.yaml.",
        "spaces:",
        "  example_space:",
        "    label: Example",
        "    kind: interior",
        "    group: RDC",
        "    sensors:",
    ]
    for index, row in enumerate(rows):
        measurement = row.get("_measurement") or row.get("measurement") or row.get("_value") or "unknown_measurement"
        field = row.get("_field") or row.get("field") or "value"
        lines.extend(
            [
                f"      # candidate_{index}:",
                f"      #   measurement: {measurement}",
                f"      #   field: {field}",
                "      #   tags:",
                "      #     room: example_space",
            ]
        )
    return "\n".join(lines) + "\n"


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None
