"""MQTT live source for the portable cockpit hub.

`paho-mqtt` is an optional dependency (extra `mqtt`); it is imported lazily so the
core engine and the memory/file/Influx paths keep working without it. The message
normalization is a pure function (`parse_mqtt_message`) so it can be unit-tested
without a broker.

Accepted payload shapes under `<base_topic>`:
- per-metric:  topic `<base>/<space>/<metric>`, payload a number       -> {"<space>.<metric>": value}
- state blob:  topic `<base>/<space>/state`,   payload a JSON object   -> {"<space>.<metric>": value, ...}
"""

from __future__ import annotations

import json
import os
import threading

from .config_schema import MqttConfig


def parse_mqtt_message(base_topic: str, topic: str, payload: bytes | str) -> dict[str, float]:
    """Normalize one MQTT message into `{<space>.<metric>: value}` updates.

    Unknown shapes and non-numeric values are ignored (returns an empty dict),
    so a noisy broker never injects garbage into the store.
    """
    base = base_topic.rstrip("/")
    if not (topic == base or topic.startswith(base + "/")):
        return {}
    remainder = topic[len(base):].lstrip("/")
    parts = [segment for segment in remainder.split("/") if segment]
    if len(parts) < 2:
        return {}
    text = payload.decode("utf-8", "ignore") if isinstance(payload, (bytes, bytearray)) else str(payload)

    if parts[-1] == "state":
        space = parts[-2]
        try:
            blob = json.loads(text)
        except (ValueError, TypeError):
            return {}
        if not isinstance(blob, dict):
            return {}
        updates: dict[str, float] = {}
        for metric, value in blob.items():
            numeric = _as_float(value)
            if numeric is not None:
                updates[f"{space}.{metric}"] = numeric
        return updates

    space, metric = parts[-2], parts[-1]
    numeric = _as_float(text)
    return {f"{space}.{metric}": numeric} if numeric is not None else {}


def _as_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class MqttLiveSource:
    """LiveSource fed by an MQTT broker.

    Maintains the latest `<space>.<metric>` values updated by the broker's
    callbacks; `read()` returns a snapshot. `start()` connects and runs the
    network loop in a background thread (called by CockpitService.start()).
    """

    def __init__(self, config: MqttConfig) -> None:
        self.config = config
        self._values: dict[str, float] = {}
        self._lock = threading.Lock()
        self._client = None

    def start(self) -> None:
        try:
            import paho.mqtt.client as mqtt  # lazy: optional dependency
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "MQTT support requires paho-mqtt. Install with `pip install vesta-bioclimatic[mqtt]`."
            ) from exc

        client = mqtt.Client()
        if self.config.username:
            password = self.config.password or (os.getenv(self.config.password_env) if self.config.password_env else None)
            client.username_pw_set(self.config.username, password)
        if self.config.tls:
            client.tls_set()
        client.on_connect = self._on_connect
        client.on_message = self._on_message
        # connect_async + loop_start so a broker that is down at startup doesn't
        # crash the server; paho reconnects in the background and (re)subscribes
        # via on_connect.
        client.connect_async(self.config.host, self.config.port)
        client.loop_start()
        self._client = client

    def stop(self) -> None:
        if self._client is not None:
            self._client.loop_stop()
            self._client.disconnect()
            self._client = None

    def _on_connect(self, client, userdata, flags, rc, *args) -> None:
        client.subscribe(f"{self.config.base_topic}/#")

    def _on_message(self, client, userdata, message) -> None:
        updates = parse_mqtt_message(self.config.base_topic, message.topic, message.payload)
        if updates:
            with self._lock:
                self._values.update(updates)

    def read(self) -> dict[str, float]:
        with self._lock:
            return dict(self._values)
