"""Portable HTTP bridge: serve the cockpit panel and a live CockpitView JSON.

This is the "Python CockpitView -> panel" bridge and the connectivity hub. The
same `vesta-psychro-panel.js` that runs inside Home Assistant is served here as a
static asset, but instead of reading Home Assistant entities it is fed the
`CockpitView` produced by the Python engine, plus a normalized history series.

A single `CockpitService` owns the normalized `MeasurementStore`: a background
loop pulls the latest values from a `LiveSource`, records them into a
`HistoryProvider`, and rebuilds the `CockpitView`. Every backend (file, MQTT,
InfluxDB, …) is reduced to those two abstractions, so the routes below never
depend on the source.

Routes:
  GET /                      -> web/index.html (host page)
  GET /static/<file>         -> panel assets
  GET /local/vesta-psychro/.. -> panel assets (path the panel hardcodes for Plotly)
  GET /api/cockpit           -> CockpitView JSON (latest refresh)
  GET /api/history[?window=&series=] -> normalized history series JSON
  GET /api/health            -> service + source/provider status

Only the Python stdlib is used here; backends live in sources.py / influx.py.
"""

from __future__ import annotations

import json
import mimetypes
import os
import queue
import threading
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .config_schema import InfluxConfig, MqttConfig, SiteConfig, SpaceConfig, load_site_config
from .runtime import MeasurementStore, build_cockpit_view
from .sources import FileLiveSource, HistoryProvider, LiveSource, MemoryHistoryProvider

REPO_ROOT = Path(__file__).resolve().parents[2]
PANEL_DIR = REPO_ROOT / "homeassistant" / "www" / "vesta-psychro"
WEB_DIR = REPO_ROOT / "web"


class CockpitService:
    """Owns the normalized store, refreshes it from a LiveSource, and records
    history. Thread-safe: a background loop refreshes while requests read."""

    def __init__(
        self,
        site: SiteConfig,
        live_source: LiveSource,
        history_provider: HistoryProvider,
        pressure_hpa: float = 1013.25,
        refresh_seconds: float = 5.0,
    ) -> None:
        self.site = site
        self.live_source = live_source
        self.history_provider = history_provider
        self.pressure_hpa = pressure_hpa
        self.refresh_seconds = max(1.0, refresh_seconds)
        self._lock = threading.Lock()
        self._store = MeasurementStore({})
        self._view: dict[str, object] = {}
        self._last_refresh: datetime | None = None
        self._last_error: str | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._subscribers: set[queue.Queue] = set()
        self._subscribers_lock = threading.Lock()
        # Set by build_service. state_file/mapping_file persist the panel-applied
        # connectivity and mapping; site_path lets a mapping change rebuild the
        # sources against the updated spaces. conn_state holds the saved live/
        # history source profiles (multi-source aggregation, one active each).
        self.state_file: Path | None = None
        self.mapping_file: Path | None = None
        self.site_path: Path | None = None
        self.conn_state: dict = {}

    def refresh(self) -> None:
        """Pull latest values, record them into history, rebuild the view.

        Resilient by design: a flaky source or a transient build error records
        last_error and keeps the last good view rather than crashing the loop.
        """
        ts = datetime.now(timezone.utc)
        try:
            values = self.live_source.read()
            store = MeasurementStore.from_plain_dict(values)
            self.history_provider.record(values, ts)
            view = build_cockpit_view(self.site, store, pressure_hpa=self.pressure_hpa).to_dict()
        except Exception as exc:  # source or build failure must not kill the service
            with self._lock:
                self._last_error = str(exc)
            return
        with self._lock:
            self._store = store
            self._view = view
            self._last_refresh = ts
            self._last_error = None
        self._publish(view)

    def subscribe(self) -> "queue.Queue":
        """Register an SSE listener; returns a queue fed the latest CockpitView."""
        q: queue.Queue = queue.Queue(maxsize=8)
        with self._subscribers_lock:
            self._subscribers.add(q)
        return q

    def unsubscribe(self, q: "queue.Queue") -> None:
        with self._subscribers_lock:
            self._subscribers.discard(q)

    def _publish(self, view: dict[str, object]) -> None:
        with self._subscribers_lock:
            subscribers = list(self._subscribers)
        for q in subscribers:
            try:
                q.put_nowait(view)
            except queue.Full:
                # Slow consumer: drop the stalest frame and keep the latest.
                try:
                    q.get_nowait()
                    q.put_nowait(view)
                except (queue.Empty, queue.Full):
                    pass

    def is_stopped(self) -> bool:
        return self._stop.is_set()

    def reconfigure(self, live_source: LiveSource, history_provider: HistoryProvider, pressure_hpa: float) -> None:
        """Hot-swap the live source / history backend on the running service.

        Stops a previous push source (MQTT), swaps the references, starts the new
        push source, and refreshes immediately so the panel reflects the change.
        """
        old = self.live_source
        if hasattr(old, "stop"):
            try:
                old.stop()
            except Exception:
                pass
        self.history_provider = history_provider
        self.pressure_hpa = pressure_hpa
        self.live_source = live_source
        if hasattr(live_source, "start"):
            live_source.start()
        self.refresh()

    def mapping(self) -> dict[str, object]:
        """Current spaces/metrics mapping (the 'besoin'), for the Mapping editor."""
        site = self.site
        return {
            "site_kind": site.kind,
            "group_labels": dict(site.groups),
            "spaces": [
                {
                    "key": space.key,
                    "label": space.label,
                    "kind": space.kind,
                    "group": space.group,
                    "sensors": {
                        metric: {"measurement": ref.measurement, "field": ref.field, "tags": dict(ref.tags)}
                        for metric, ref in space.sensors.items()
                    },
                }
                for space in site.spaces.values()
            ],
        }

    def apply_mapping(self, overlay: dict) -> None:
        """Replace the spaces/groups mapping and rebuild sources against it.

        The overlay (edited in the panel) is merged over the YAML site config and
        becomes the effective spaces; the active live/history profiles are rebuilt
        against it so Influx sensor resolution picks up the new mapping.
        """
        if self.site_path is None:
            raise RuntimeError("site_path inconnu: mapping non modifiable")
        self.site = _site_with_overlay(self.site_path, overlay)
        self._reconfigure_from_state()

    def _active_specs(self) -> tuple[dict, dict]:
        """The specs of the currently active live/history profiles (or defaults)."""
        return _active_specs_from_state(self.conn_state)

    def _reconfigure_from_state(self) -> None:
        """Rebuild live/history sources from the active profiles and hot-swap."""
        live_spec, history_spec = self._active_specs()
        live_source, history_provider, pressure = build_sources_from_profiles(self.site, live_spec, history_spec)
        self.reconfigure(live_source, history_provider, self.conn_state.get("pressure_hpa", pressure))

    def _persist_conn_state(self) -> None:
        if self.state_file is not None:
            _save_state(self.state_file, self.conn_state)

    def save_profile(self, kind: str, profile: dict) -> str:
        """Add or update a saved live/history source profile.

        Secrets (mqtt password / influx token) the panel never echoes back are
        preserved from the existing profile if the incoming spec omits them.
        """
        key, _active_key = _profile_keys(kind)
        profiles = self.conn_state.setdefault(key, [])
        spec = dict(profile.get("spec") or {})
        pid = str(profile.get("id") or uuid.uuid4().hex[:8])
        name = str(profile.get("name") or "Profil")
        existing = next((p for p in profiles if p.get("id") == pid), None)
        old_spec = (existing or {}).get("spec") or {}
        for block, secret in (("mqtt", "password"), ("influx", "token")):
            if isinstance(spec.get(block), dict) and not spec[block].get(secret):
                kept = (old_spec.get(block) or {}).get(secret)
                if kept:
                    spec[block][secret] = kept
        if existing:
            existing["name"] = name
            existing["spec"] = spec
        else:
            profiles.append({"id": pid, "name": name, "spec": spec})
        self._persist_conn_state()
        return pid

    def delete_profile(self, kind: str, profile_id: str) -> None:
        key, active_key = _profile_keys(kind)
        profiles = self.conn_state.get(key) or []
        self.conn_state[key] = [p for p in profiles if p.get("id") != profile_id]
        if self.conn_state.get(active_key) == profile_id:
            remaining = self.conn_state[key]
            self.conn_state[active_key] = remaining[0]["id"] if remaining else None
            self._reconfigure_from_state()
        self._persist_conn_state()

    def activate_profile(self, kind: str, profile_id: str, pressure_hpa: float | None = None) -> None:
        key, active_key = _profile_keys(kind)
        profiles = self.conn_state.get(key) or []
        if not any(p.get("id") == profile_id for p in profiles):
            raise ValueError("Profil introuvable.")
        # Snapshot current state so we can roll back if the source can't be built.
        previous_active = self.conn_state.get(active_key)
        previous_pressure = self.conn_state.get("pressure_hpa")
        self.conn_state[active_key] = profile_id
        if pressure_hpa is not None:
            self.conn_state["pressure_hpa"] = pressure_hpa
        try:
            self._reconfigure_from_state()
        except Exception:
            self.conn_state[active_key] = previous_active
            if pressure_hpa is not None:
                self.conn_state["pressure_hpa"] = previous_pressure
            raise
        self._persist_conn_state()

    def start(self) -> None:
        # Push sources (MQTT) need their network loop running before the first read.
        if hasattr(self.live_source, "start"):
            self.live_source.start()
        self.refresh()

        def _loop() -> None:
            while not self._stop.wait(self.refresh_seconds):
                self.refresh()

        self._thread = threading.Thread(target=_loop, name="cockpit-refresh", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if hasattr(self.live_source, "stop"):
            self.live_source.stop()

    def cockpit_view(self) -> dict[str, object]:
        with self._lock:
            return dict(self._view)

    def values(self) -> dict[str, float]:
        """Raw normalized store `<space>.<metric>: value` — what a remote Vesta node
        consumes for federation (already mapped, no remapping needed)."""
        with self._lock:
            return dict(self._store.values)

    def history(self, series: list[str] | None, window: str) -> dict[str, object]:
        data = self.history_provider.history(series, window)
        return {
            "window": window,
            "series": {key: [sample.to_dict() for sample in samples] for key, samples in data.items()},
        }

    def connectivity(self) -> dict[str, object]:
        """Resolved connectivity for the panel's connectivity tabs (no secrets)."""
        site = self.site
        with self._lock:
            series = sorted(self._store.values.keys())
        live_name = type(self.live_source).__name__
        history_name = type(self.history_provider).__name__
        live = {"FileLiveSource": "file", "MqttLiveSource": "mqtt", "InfluxLiveSource": "history",
                "HistoryBackedLiveSource": "history", "VestaRemoteLiveSource": "remote"}.get(live_name, "file")
        history = {"InfluxHistoryProvider": "influx", "FileHistoryProvider": "file",
                   "MemoryHistoryProvider": "memory", "VestaRemoteHistoryProvider": "remote"}.get(history_name, "memory")
        remote_url = getattr(self.live_source, "base_url", None) or getattr(self.history_provider, "base_url", None)
        state = self.conn_state or {}
        # Orange ("portable"): only fixed-file/in-memory sources, nothing live or
        # remote. Green ("connected"): a live push/poll or remote backend is active.
        status = "portable" if (live == "file" and history in ("memory", "file")) else "connected"
        return {
            "live": live,
            "history": history,
            "live_source": live_name,
            "history_provider": history_name,
            "pressure_hpa": self.pressure_hpa,
            "refresh_seconds": self.refresh_seconds,
            "site_kind": site.kind,
            "status": status,
            "live_profiles": [_redact_profile(p) for p in (state.get("live_profiles") or [])],
            "active_live": state.get("active_live"),
            "history_profiles": [_redact_profile(p) for p in (state.get("history_profiles") or [])],
            "active_history": state.get("active_history"),
            "remote": ({"url": remote_url} if remote_url else None),
            "mqtt": (
                {"host": site.mqtt.host, "port": site.mqtt.port, "base_topic": site.mqtt.base_topic}
                if site.mqtt
                else None
            ),
            "influx": ({"url": site.influx.url, "bucket": site.influx.bucket} if site.influx else None),
            "series": series,
            "spaces": [
                {"key": space.key, "label": space.label, "kind": space.kind, "group": space.group}
                for space in site.spaces.values()
            ],
            "group_labels": dict(site.groups),
            "health": self.health(),
        }

    def health(self) -> dict[str, object]:
        with self._lock:
            return {
                "ok": self._last_error is None and bool(self._view),
                "last_refresh": self._last_refresh.isoformat() if self._last_refresh else None,
                "last_error": self._last_error,
                "live_source": type(self.live_source).__name__,
                "history_provider": type(self.history_provider).__name__,
                "spaces": len(self.site.spaces),
            }


def _make_handler(service: CockpitService):
    class CockpitHandler(BaseHTTPRequestHandler):
        server_version = "VestaCockpit/1.0"

        def _send(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _send_json(self, payload: object, status: int = 200) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self._send(status, body, "application/json; charset=utf-8")

        def _send_file(self, path: Path) -> None:
            if not path.is_file():
                self._send(404, b"Not found", "text/plain; charset=utf-8")
                return
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if content_type.startswith("text/") or content_type in {"application/javascript", "application/json"}:
                content_type += "; charset=utf-8"
            self._send(200, path.read_bytes(), content_type)

        def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
            parsed = urlparse(self.path)
            route = parsed.path
            query = parse_qs(parsed.query)
            if route in ("/", "/index.html"):
                self._send_file(WEB_DIR / "index.html")
            elif route == "/api/cockpit":
                self._send_json(service.cockpit_view())
            elif route == "/api/values":
                self._send_json(service.values())
            elif route == "/api/history":
                window = (query.get("window") or ["12h"])[0]
                series_param = (query.get("series") or [""])[0]
                series = [s for s in series_param.split(",") if s] or None
                try:
                    self._send_json(service.history(series, window))
                except Exception as exc:  # unreachable/misconfigured backend must not 500 the panel
                    self._send_json({"window": window, "series": {}, "error": str(exc)}, status=200)
            elif route == "/api/stream":
                self._serve_stream()
            elif route == "/api/health":
                self._send_json(service.health())
            elif route == "/api/connectivity":
                self._send_json(service.connectivity())
            elif route == "/api/mapping":
                self._send_json(service.mapping())
            elif route == "/api/browse":
                start = (query.get("path") or [""])[0]
                self._send_json(_browse_dir(start))
            elif route.startswith("/static/") or route.startswith("/local/vesta-psychro/"):
                # Both prefixes map to the panel asset dir: /static/ is the portable
                # convention, /local/vesta-psychro/ is the path the panel hardcodes for
                # Plotly (so the same file works unchanged in HA and portable mode).
                # Only a bare filename is honored, preventing path traversal.
                name = Path(route.split("/vesta-psychro/", 1)[-1] if "/vesta-psychro/" in route else route[len("/static/"):]).name
                self._send_file(PANEL_DIR / name)
            else:
                self._send(404, b"Not found", "text/plain; charset=utf-8")

        def _serve_stream(self) -> None:
            """Server-Sent Events: push the CockpitView on every service refresh.

            One thread per connection (ThreadingHTTPServer), so blocking on the
            subscriber queue is fine. A periodic comment keeps the connection
            alive and detects dead clients.
            """
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Accel-Buffering", "no")  # disable proxy buffering
            self.end_headers()
            if self.command == "HEAD":
                return
            subscription = service.subscribe()
            try:
                self._write_event("cockpit", service.cockpit_view())
                while not service.is_stopped():
                    try:
                        view = subscription.get(timeout=20)
                        self._write_event("cockpit", view)
                    except queue.Empty:
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass  # client went away
            finally:
                service.unsubscribe(subscription)

        def _write_event(self, event: str, payload: object) -> None:
            body = f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")
            self.wfile.write(body)
            self.wfile.flush()

        do_HEAD = do_GET  # noqa: N815

        def do_POST(self) -> None:  # noqa: N802
            route = urlparse(self.path).path
            if route not in ("/api/connectivity", "/api/mapping", "/api/influx-schema", "/api/remote-mapping"):
                self._send(404, b"Not found", "text/plain; charset=utf-8")
                return
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                body = json.loads(raw or b"{}")
            except ValueError as exc:
                self._send_json({"error": f"JSON invalide: {exc}"}, status=400)
                return
            if route == "/api/influx-schema":
                try:
                    self._send_json(_discover_influx_schema(service, body))
                except Exception as exc:
                    self._send_json({"error": str(exc)}, status=200)
                return
            if route == "/api/remote-mapping":
                try:
                    self._send_json(_fetch_remote_mapping(body.get("url")))
                except Exception as exc:
                    self._send_json({"error": str(exc)}, status=200)
                return
            try:
                if route == "/api/connectivity":
                    action = body.get("action")
                    if action == "save_profile":
                        saved_id = service.save_profile(str(body.get("kind")), body.get("profile") or {})
                        self._send_json({**service.connectivity(), "saved_id": saved_id})
                    elif action == "delete_profile":
                        service.delete_profile(str(body.get("kind")), str(body.get("id")))
                        self._send_json(service.connectivity())
                    elif action == "activate_profile":
                        pressure = body.get("pressure_hpa")
                        service.activate_profile(
                            str(body.get("kind")), str(body.get("id")), float(pressure) if pressure is not None else None
                        )
                        self._send_json(service.connectivity())
                    else:
                        raise ValueError(f"Action de connectivité inconnue : {action!r}")
                else:  # /api/mapping
                    service.apply_mapping(body)
                    if service.mapping_file is not None:
                        _save_state(service.mapping_file, body)
                    self._send_json(service.mapping())
            except Exception as exc:  # bad spec / unreachable backend
                self._send_json({"error": str(exc)}, status=400)

        def log_message(self, fmt: str, *args) -> None:  # quieter terminal
            return

    return CockpitHandler


def default_state_file(site_path: Path) -> Path:
    """Where the panel-applied connectivity is remembered: a dotfile next to the
    site config, so each site keeps its own last-applied source."""
    return Path(site_path).resolve().parent / ".vesta_connectivity.json"


def _save_state(path: Path, spec: dict) -> None:
    """Persist the applied connectivity spec (incl. secrets) with 0600 perms."""
    try:
        path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
        os.chmod(path, 0o600)
    except OSError:
        pass  # persistence is best-effort; never break a successful apply


def _load_state(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def build_service(
    site_path: Path,
    values_path: Path | None,
    pressure_hpa: float = 1013.25,
    history: str = "auto",
    live: str = "auto",
    refresh_seconds: float = 5.0,
    state_file: Path | None = None,
) -> CockpitService:
    """Assemble a CockpitService from config + chosen source/provider.

    `history` selects the history backend ('memory' is the dependency-free
    default; 'influx' uses range queries; 'auto' uses Influx when a token is
    configured, else memory). `live` selects where live values come from
    ('file' reads --values; 'influx' reads the latest of each mapped sensor;
    'auto' follows the history choice).

    If `state_file` holds a previously applied spec, it takes precedence over the
    CLI-derived source — the panel's last choice wins across restarts.
    """
    site = load_site_config(site_path)
    mapping_file = default_mapping_file(site_path)
    overlay = _load_state(mapping_file)
    if overlay:
        try:
            site = _site_with_overlay(site_path, overlay)
        except Exception:
            overlay = None
    persisted = _load_state(state_file) if state_file is not None else None
    conn_state: dict | None = None
    if persisted and isinstance(persisted, dict) and "live_profiles" in persisted:
        conn_state = persisted
        try:
            live_spec, history_spec = _active_specs_from_state(conn_state)
            live_source, history_provider, resolved_pressure = build_sources_from_profiles(site, live_spec, history_spec)
            pressure_hpa = conn_state.get("pressure_hpa", resolved_pressure)
        except Exception:
            conn_state = None
    if conn_state is None and persisted:
        try:
            live_source, history_provider, pressure_hpa = build_sources_from_spec(site, persisted)
        except Exception:
            persisted = None
    if conn_state is None and not persisted:
        history_provider = _select_history_provider(site, history)
        live_source = _select_live_source(site, live, history, values_path, history_provider)
    if conn_state is None:
        conn_state = _seed_conn_state(live_source, history_provider, pressure_hpa)
    service = CockpitService(site, live_source, history_provider, pressure_hpa=pressure_hpa, refresh_seconds=refresh_seconds)
    service.state_file = state_file
    service.mapping_file = mapping_file
    service.site_path = site_path
    service.conn_state = conn_state
    return service


def default_mapping_file(site_path: Path) -> Path:
    """Where the panel-edited spaces/metrics mapping overlay is remembered."""
    return Path(site_path).resolve().parent / ".vesta_mapping.json"


def _site_with_overlay(site_path: Path, overlay: dict) -> SiteConfig:
    """Reload the site config and apply a mapping overlay (edited spaces/groups).

    The overlay's `spaces` (if present) replace the YAML spaces; `groups` merge
    in. This keeps the YAML untouched while letting the panel own the mapping.
    """
    site = load_site_config(site_path)
    if overlay.get("groups"):
        site.groups = {**site.groups, **{str(k): str(v) for k, v in overlay["groups"].items()}}
    spaces = overlay.get("spaces")
    if spaces:
        site.spaces = {key: SpaceConfig.from_dict(key, payload) for key, payload in spaces.items()}
    return site


def _influx_token_present(site: SiteConfig) -> bool:
    return bool(os.getenv(site.influx.token_env)) if site.influx else False


_MODE_TO_PAIR = {
    "file_memory": ("file", "memory"),
    "influx": ("history", "influx"),
    "mqtt_influx": ("mqtt", "influx"),
    "mqtt_memory": ("mqtt", "memory"),
}


def build_sources_from_spec(site: SiteConfig, spec: dict) -> tuple[LiveSource, HistoryProvider, float]:
    """Build (live_source, history_provider, pressure) from a panel POST spec.

    Live and history are chosen independently: `live` in {file, mqtt, history}
    (history = derive the live value from the history backend) and `history` in
    {influx, memory, file}. `influx`/`mqtt` blocks carry connection details;
    secrets are used to build in-memory clients and never echoed back by
    /api/connectivity. A legacy combined `mode` is still accepted.
    """
    if "live" not in spec and "history" not in spec and spec.get("mode") in _MODE_TO_PAIR:
        live_choice, history_choice = _MODE_TO_PAIR[spec["mode"]]
    else:
        live_choice = str(spec.get("live", "file"))
        history_choice = str(spec.get("history", "memory"))
    pressure = float(spec.get("pressure_hpa", 1013.25) or 1013.25)

    history_provider = _history_from_spec(site, history_choice, spec)
    live_source = _live_from_spec(site, live_choice, spec, history_provider)
    return live_source, history_provider, pressure


def build_sources_from_profiles(site: SiteConfig, live_spec: dict, history_spec: dict) -> tuple[LiveSource, HistoryProvider, float]:
    """Build (live_source, history_provider, pressure) from the active live and
    history profile specs (each shaped like a `build_sources_from_spec` spec, but
    only the keys relevant to that side)."""
    live_spec = live_spec or {}
    history_spec = history_spec or {}
    pressure = float(live_spec.get("pressure_hpa") or history_spec.get("pressure_hpa") or 1013.25)
    history_choice = str(history_spec.get("history", "memory"))
    live_choice = str(live_spec.get("live", "file"))
    history_provider = _history_from_spec(site, history_choice, history_spec)
    live_source = _live_from_spec(site, live_choice, live_spec, history_provider)
    return live_source, history_provider, pressure


def _profile_keys(kind: str) -> tuple[str, str]:
    if kind == "live":
        return "live_profiles", "active_live"
    if kind == "history":
        return "history_profiles", "active_history"
    raise ValueError(f"Type de profil inconnu : {kind!r}")


def _active_specs_from_state(state: dict | None) -> tuple[dict, dict]:
    """The specs of the active live/history profiles in a conn_state dict, or
    sensible defaults (fixed file live, in-memory history) if none is active."""
    state = state or {}
    live_spec = next(
        (p.get("spec") or {} for p in (state.get("live_profiles") or []) if p.get("id") == state.get("active_live")),
        None,
    )
    history_spec = next(
        (p.get("spec") or {} for p in (state.get("history_profiles") or []) if p.get("id") == state.get("active_history")),
        None,
    )
    return live_spec or {"live": "file"}, history_spec or {"history": "memory"}


def _spec_for_live_source(source: object) -> dict:
    """Describe an already-built LiveSource as a profile spec, so it can be saved
    and rebuilt later via `_live_from_spec`."""
    from .mqtt import MqttLiveSource
    from .influx import InfluxLiveSource
    from .sources import VestaRemoteLiveSource, FileLiveSource, HistoryBackedLiveSource

    if isinstance(source, FileLiveSource):
        return {"live": "file", "values_path": str(source.path)}
    if isinstance(source, MqttLiveSource):
        config = source.config
        return {
            "live": "mqtt",
            "mqtt": {
                "host": config.host,
                "port": config.port,
                "base_topic": config.base_topic,
                "username": config.username,
                "password": config.password,
                "tls": config.tls,
            },
        }
    if isinstance(source, VestaRemoteLiveSource):
        return {"live": "remote", "remote": {"url": source.base_url}}
    if isinstance(source, (InfluxLiveSource, HistoryBackedLiveSource)):
        return {"live": "history"}
    return {"live": "file"}


def _spec_for_history_provider(provider: object) -> dict:
    """Describe an already-built HistoryProvider as a profile spec, so it can be
    saved and rebuilt later via `_history_from_spec`."""
    from .influx import InfluxHistoryProvider
    from .sources import VestaRemoteHistoryProvider, FileHistoryProvider

    if isinstance(provider, InfluxHistoryProvider):
        config = provider.client.config
        return {
            "history": "influx",
            "influx": {"url": config.url, "org": config.org, "bucket": config.bucket, "token": provider.client.token},
        }
    if isinstance(provider, FileHistoryProvider):
        return {"history": "file", "history_path": str(provider.path)}
    if isinstance(provider, VestaRemoteHistoryProvider):
        return {"history": "remote", "remote": {"url": provider.base_url}}
    return {"history": "memory"}


def _seed_conn_state(live_source: object, history_provider: object, pressure_hpa: float) -> dict:
    """Build a single-profile conn_state describing the sources a service was
    constructed with — the starting point before the panel adds more profiles."""
    live_id, history_id = "default-live", "default-history"
    return {
        "live_profiles": [{"id": live_id, "name": "Source initiale", "spec": _spec_for_live_source(live_source)}],
        "active_live": live_id,
        "history_profiles": [
            {"id": history_id, "name": "Historique initial", "spec": _spec_for_history_provider(history_provider)}
        ],
        "active_history": history_id,
        "pressure_hpa": pressure_hpa,
    }


def _redact_spec(spec: dict) -> dict:
    """Drop secrets (mqtt password / influx token) from a profile spec, replacing
    them with a boolean presence flag so the panel knows one is set."""
    out = dict(spec or {})
    if isinstance(out.get("mqtt"), dict):
        mqtt = dict(out["mqtt"])
        if mqtt.pop("password", None):
            mqtt["has_password"] = True
        out["mqtt"] = mqtt
    if isinstance(out.get("influx"), dict):
        influx = dict(out["influx"])
        if influx.pop("token", None):
            influx["has_token"] = True
        out["influx"] = influx
    return out


def _redact_profile(profile: dict) -> dict:
    return {"id": profile.get("id"), "name": profile.get("name"), "spec": _redact_spec(profile.get("spec") or {})}


def _influx_client_from_spec(site: SiteConfig, spec: dict):
    from .influx import InfluxClient

    block = spec.get("influx") or {}
    config = InfluxConfig(
        url=str(block.get("url") or site.influx.url),
        org=str(block.get("org") or site.influx.org),
        bucket=str(block.get("bucket") or site.influx.bucket),
        token_env=site.influx.token_env,
        default_window=site.influx.default_window,
        verify_ssl=bool(block.get("verify_ssl", site.influx.verify_ssl)),
    )
    token = block.get("token") or os.getenv(config.token_env)
    return InfluxClient(config, token=token)


def _remote_url(spec: dict) -> str:
    url = (spec.get("remote") or {}).get("url")
    if not url:
        raise ValueError("L'URL du système Vesta distant est requise.")
    return str(url)


def _history_from_spec(site: SiteConfig, choice: str, spec: dict) -> HistoryProvider:
    if choice == "remote":
        from .sources import VestaRemoteHistoryProvider

        return VestaRemoteHistoryProvider(_remote_url(spec))
    if choice == "influx":
        from .influx import InfluxHistoryProvider

        return InfluxHistoryProvider(site, client=_influx_client_from_spec(site, spec))
    if choice == "file":
        path = spec.get("history_path")
        if not path:
            raise ValueError("Le fournisseur d'historique Fichier requiert un chemin (history_path).")
        from .sources import FileHistoryProvider

        return FileHistoryProvider(Path(path))
    return MemoryHistoryProvider()


def _live_from_spec(site: SiteConfig, choice: str, spec: dict, history_provider: HistoryProvider) -> LiveSource:
    if choice == "remote":
        from .sources import VestaRemoteLiveSource

        return VestaRemoteLiveSource(_remote_url(spec))
    if choice == "mqtt":
        from .mqtt import MqttLiveSource

        block = spec.get("mqtt") or {}
        config = MqttConfig(
            host=str(block.get("host") or "127.0.0.1"),
            port=int(block.get("port") or 1883),
            base_topic=str(block.get("base_topic") or "vesta").rstrip("/"),
            username=(block.get("username") or None),
            password=(block.get("password") or None),
            tls=bool(block.get("tls", False)),
        )
        return MqttLiveSource(config)
    if choice == "history":
        # Derive live from the history backend: Influx uses the efficient latest()
        # query; any other provider reads its most recent samples.
        from .influx import InfluxHistoryProvider, InfluxLiveSource
        from .sources import HistoryBackedLiveSource

        if isinstance(history_provider, InfluxHistoryProvider):
            return InfluxLiveSource(site, client=history_provider.client)
        return HistoryBackedLiveSource(history_provider)
    path = spec.get("values_path")
    if not path:
        raise ValueError("La source live Fichier requiert un chemin (values_path).")
    return FileLiveSource(Path(path))


def _fetch_remote_mapping(url: str | None) -> dict:
    """Proxy a remote Vesta node's GET /api/mapping so its already-normalized
    spaces can be imported into the editor in one click (no remapping)."""
    from .sources import _http_get_json

    if not url:
        raise ValueError("URL du système Vesta distant manquante.")
    return _http_get_json(f"{str(url).rstrip('/')}/api/mapping", 8.0)


def _discover_influx_schema(service: CockpitService, body: dict) -> dict:
    """Discover the Influx schema for the mapping editor — using the connection in
    the request, or the currently configured Influx client if none is given.

    The panel never echoes tokens back, so a request with url/org/bucket but no
    token should fall back to the active HistoryProvider's client (which has the
    stored token) rather than failing with "Missing token".
    """
    from .influx import InfluxHistoryProvider

    influx_block = body.get("influx") or {}
    has_token = bool(influx_block.get("token")) or bool(os.getenv("VESTA_INFLUX_TOKEN"))
    if not has_token and isinstance(service.history_provider, InfluxHistoryProvider):
        client = service.history_provider.client
    else:
        client = _influx_client_from_spec(service.site, {"influx": influx_block})
    return client.discover_schema(bucket=influx_block.get("bucket") or None)


def _browse_dir(path: str) -> dict:
    """List directories and .json files under `path` for the panel file picker.

    Server-side (the values/history file lives on the hub, not the browser).
    Defaults to the home directory. Hidden entries are skipped. Errors (e.g.
    permission denied) are returned as a field, never raised.
    """
    base = Path(path).expanduser() if path else Path.home()
    try:
        base = base.resolve()
        if base.is_file():
            base = base.parent
        if not base.is_dir():
            base = Path.home().resolve()
        entries = []
        for child in sorted(base.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            if child.name.startswith("."):
                continue
            is_dir = child.is_dir()
            if not is_dir and child.suffix.lower() != ".json":
                continue
            entries.append({"name": child.name, "type": "dir" if is_dir else "file", "path": str(child)})
        parent = str(base.parent) if base.parent != base else None
        return {"path": str(base), "parent": parent, "entries": entries}
    except Exception as exc:  # permission denied, etc.
        return {"path": str(base), "parent": None, "entries": [], "error": str(exc)}


def _select_history_provider(site: SiteConfig, history: str) -> HistoryProvider:
    use_influx = history == "influx" or (history == "auto" and _influx_token_present(site))
    if use_influx:
        from .influx import InfluxHistoryProvider

        return InfluxHistoryProvider(site)
    return MemoryHistoryProvider()


def _select_live_source(
    site: SiteConfig,
    live: str,
    history: str,
    values_path: Path | None,
    history_provider: HistoryProvider,
) -> LiveSource:
    if live == "mqtt" or (live == "auto" and site.mqtt is not None and values_path is None and not _influx_token_present(site)):
        if site.mqtt is None:
            raise SystemExit("--live mqtt requires an `mqtt:` block in the site config.")
        from .mqtt import MqttLiveSource

        return MqttLiveSource(site.mqtt)
    use_influx = live == "influx" or (
        live == "auto" and history in ("influx", "auto") and _influx_token_present(site)
    )
    if use_influx:
        from .influx import InfluxHistoryProvider, InfluxLiveSource

        # Share the client when history is already Influx-backed.
        client = history_provider.client if isinstance(history_provider, InfluxHistoryProvider) else None
        return InfluxLiveSource(site, client=client)
    if values_path is None:
        raise SystemExit("A --values file is required when the live source is not InfluxDB or MQTT.")
    return FileLiveSource(values_path)


def serve(
    site_path: Path,
    values_path: Path | None,
    host: str = "127.0.0.1",
    port: int = 8770,
    pressure_hpa: float = 1013.25,
    history: str = "auto",
    live: str = "auto",
    state_file: Path | None = None,
    no_state: bool = False,
) -> None:
    """Run the portable cockpit server until interrupted."""
    resolved_state = None if no_state else (state_file or default_state_file(site_path))
    service = build_service(
        site_path, values_path, pressure_hpa=pressure_hpa, history=history, live=live, state_file=resolved_state
    )
    service.start()
    httpd = ThreadingHTTPServer((host, port), _make_handler(service))
    state_note = f", state={resolved_state}" if resolved_state else ""
    print(
        f"Vesta cockpit portable sur http://{host}:{port}/  "
        f"(site={site_path}, live={type(service.live_source).__name__}, history={type(service.history_provider).__name__}{state_note})"
    )
    print("Ctrl+C pour arreter.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nArret du serveur cockpit.")
    finally:
        service.stop()
        httpd.server_close()
