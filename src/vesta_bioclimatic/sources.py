"""Source adapters and history providers for the portable cockpit hub.

The hub design: whatever the backend (a values file, MQTT, InfluxDB, Home
Assistant, another DB), it is reduced to the same two abstractions so the rest of
the engine and the panel never depend on the source:

- `LiveSource.read()` returns the latest values normalized as `<space>.<metric>`.
- `HistoryProvider.history()` returns past series, same key space.

`MemoryHistoryProvider` keeps a bounded in-memory ring buffer fed by the refresh
loop; it is the universal fallback that needs no external dependency. Concrete
backends (Influx in particular) implement the same protocols.
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Protocol, runtime_checkable


@dataclass(frozen=True, slots=True)
class SeriesSample:
    """One historical measurement: a UTC timestamp and a numeric value."""

    ts: datetime
    value: float

    def to_dict(self) -> dict[str, object]:
        return {"ts": self.ts.astimezone(timezone.utc).isoformat(), "value": self.value}


_WINDOW_UNITS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_window(window: str, default_seconds: int = 12 * 3600) -> timedelta:
    """Parse a compact duration like '30m', '12h', '7d', '90s' into a timedelta."""
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*([smhd])\s*", str(window or ""))
    if not match:
        return timedelta(seconds=default_seconds)
    return timedelta(seconds=float(match.group(1)) * _WINDOW_UNITS[match.group(2)])


def _parse_iso(value) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


@runtime_checkable
class LiveSource(Protocol):
    """Returns the latest normalized values, keyed `<space>.<metric>`."""

    def read(self) -> dict[str, float]: ...


@runtime_checkable
class HistoryProvider(Protocol):
    """Returns past series, keyed `<space>.<metric>`."""

    def record(self, values: dict[str, float], ts: datetime) -> None:
        """Optional: in-memory providers store the latest sample; pull-based
        backends (Influx) ignore this and query their store directly."""

    def history(self, series: list[str] | None, window: str) -> dict[str, list[SeriesSample]]: ...


class FileLiveSource:
    """Reads a JSON dict of `<space>.<metric>` values from disk on each call.

    Re-read every time so editing the file is reflected on the next refresh.
    """

    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def read(self) -> dict[str, float]:
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        return {str(k): float(v) for k, v in payload.items()}


class FileHistoryProvider:
    """HistoryProvider backed by a JSON file of series.

    Accepts either `{"series": {"<space>.<metric>": [{"ts","value"}]}}` (the
    /api/history shape, so a saved response can be replayed) or the flat
    `{"<space>.<metric>": [{"ts","value"}]}`. Re-read on each call.
    """

    def __init__(self, path: Path) -> None:
        self.path = Path(path)

    def record(self, values: dict[str, float], ts: datetime) -> None:  # pull-based
        return None

    def history(self, series: list[str] | None, window: str) -> dict[str, list[SeriesSample]]:
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        data = raw.get("series", raw) if isinstance(raw, dict) else {}
        cutoff = datetime.now(timezone.utc) - parse_window(window)
        keys = series if series else list(data.keys())
        result: dict[str, list[SeriesSample]] = {}
        for key in keys:
            points = data.get(key) or []
            samples = []
            for point in points:
                ts = _parse_iso(point.get("ts") if isinstance(point, dict) else None)
                value = point.get("value") if isinstance(point, dict) else None
                if ts is None or value is None:
                    continue
                try:
                    samples.append(SeriesSample(ts=ts, value=float(value)))
                except (TypeError, ValueError):
                    continue
            recent = [sample for sample in samples if sample.ts >= cutoff]
            if recent:
                result[key] = recent
        return result


def _http_get_json(url: str, timeout: float) -> dict:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (trusted local URL)
        return json.loads(response.read().decode("utf-8"))


class VestaRemoteLiveSource:
    """LiveSource that consumes another Vesta node's already-normalized values.

    Federation without remapping: the remote node served `<space>.<metric>` keys
    via GET /api/values (it did its own mapping once), so they are taken as-is.
    """

    def __init__(self, base_url: str, timeout: float = 8.0) -> None:
        self.base_url = str(base_url or "").rstrip("/")
        self.timeout = timeout

    def read(self) -> dict[str, float]:
        if not self.base_url:
            raise ValueError("URL du système Vesta distant manquante.")
        data = _http_get_json(f"{self.base_url}/api/values", self.timeout)
        out: dict[str, float] = {}
        for key, value in (data or {}).items():
            try:
                out[str(key)] = float(value)
            except (TypeError, ValueError):
                continue
        return out


class VestaRemoteHistoryProvider:
    """HistoryProvider that proxies another Vesta node's GET /api/history — its
    normalized series are returned unchanged (no remapping)."""

    def __init__(self, base_url: str, timeout: float = 12.0) -> None:
        self.base_url = str(base_url or "").rstrip("/")
        self.timeout = timeout

    def record(self, values: dict[str, float], ts: datetime) -> None:  # pull-based
        return None

    def history(self, series: list[str] | None, window: str) -> dict[str, list[SeriesSample]]:
        if not self.base_url:
            raise ValueError("URL du système Vesta distant manquante.")
        params = {"window": window}
        if series:
            params["series"] = ",".join(series)
        url = f"{self.base_url}/api/history?{urllib.parse.urlencode(params)}"
        data = _http_get_json(url, self.timeout)
        if data.get("error"):
            raise RuntimeError(data["error"])
        result: dict[str, list[SeriesSample]] = {}
        for key, points in (data.get("series") or {}).items():
            samples = []
            for point in points:
                ts = _parse_iso(point.get("ts"))
                value = point.get("value")
                if ts is None or value is None:
                    continue
                try:
                    samples.append(SeriesSample(ts=ts, value=float(value)))
                except (TypeError, ValueError):
                    continue
            if samples:
                result[key] = samples
        return result


class HistoryBackedLiveSource:
    """LiveSource that derives live values from a HistoryProvider's most recent
    samples — the "live based on recent history" option. Works with any provider
    (Influx range, file history); the latest value of each series is the live one."""

    def __init__(self, provider: "HistoryProvider", window: str = "15m") -> None:
        self.provider = provider
        self.window = window

    def read(self) -> dict[str, float]:
        data = self.provider.history(None, self.window)
        return {key: samples[-1].value for key, samples in data.items() if samples}


class MemoryHistoryProvider:
    """Bounded in-memory ring buffer, fed by the refresh loop.

    Universal fallback with no external dependency: the cockpit can always draw
    trails over whatever it has observed since it started, even with no database.
    """

    def __init__(self, max_points: int = 4000) -> None:
        self.max_points = max_points
        self._buffers: dict[str, deque[SeriesSample]] = {}

    def record(self, values: dict[str, float], ts: datetime) -> None:
        for key, value in values.items():
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                continue
            buffer = self._buffers.get(key)
            if buffer is None:
                buffer = self._buffers.setdefault(key, deque(maxlen=self.max_points))
            buffer.append(SeriesSample(ts=ts, value=numeric))

    def history(self, series: list[str] | None, window: str) -> dict[str, list[SeriesSample]]:
        cutoff = datetime.now(timezone.utc) - parse_window(window)
        keys = series if series else list(self._buffers.keys())
        result: dict[str, list[SeriesSample]] = {}
        for key in keys:
            buffer = self._buffers.get(key)
            if not buffer:
                continue
            result[key] = [sample for sample in buffer if sample.ts >= cutoff]
        return result
