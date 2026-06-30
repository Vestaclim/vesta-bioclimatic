"""Configuration contracts for portable Vesta Python deployments."""

from __future__ import annotations

from dataclasses import dataclass, field as dc_field
from pathlib import Path
from typing import Any, Literal


SiteKind = Literal["home", "system"]
SpaceKind = Literal["interior", "exterior", "system"]
ActuatorKind = Literal["ceiling_fan", "extractor", "vmc", "heat_recovery", "heater", "cooler", "humidifier", "dehumidifier"]


@dataclass(slots=True)
class SensorRef:
    """Maps one logical datum to an InfluxDB series or external identifier."""

    metric: str
    measurement: str
    field: str = "value"
    tags: dict[str, str] = dc_field(default_factory=dict)
    unit: str | None = None
    entity_id: str | None = None

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "SensorRef":
        return cls(
            metric=str(payload["metric"]),
            measurement=str(payload["measurement"]),
            field=str(payload.get("field", "value")),
            tags={str(k): str(v) for k, v in payload.get("tags", {}).items()},
            unit=payload.get("unit"),
            entity_id=payload.get("entity_id"),
        )


@dataclass(slots=True)
class SpaceConfig:
    """A home room, exterior sensor group, or system module/node."""

    key: str
    label: str
    kind: SpaceKind = "interior"
    group: str | None = None
    role: str | None = None
    floor_area_m2: float | None = None
    volume_m3: float | None = None
    orientation_deg: float | None = None
    sensors: dict[str, SensorRef] = dc_field(default_factory=dict)
    metadata: dict[str, Any] = dc_field(default_factory=dict)

    @classmethod
    def from_dict(cls, key: str, payload: dict[str, Any]) -> "SpaceConfig":
        sensors = {
            metric: SensorRef.from_dict({"metric": metric, **sensor})
            for metric, sensor in payload.get("sensors", {}).items()
        }
        return cls(
            key=key,
            label=str(payload.get("label", key)),
            kind=payload.get("kind", "interior"),
            group=payload.get("floor") or payload.get("module") or payload.get("group"),
            role=payload.get("role"),
            floor_area_m2=_float_or_none(payload.get("floor_area_m2")),
            volume_m3=_float_or_none(payload.get("volume_m3") or payload.get("estimated_volume_m3")),
            orientation_deg=_float_or_none(payload.get("orientation_deg")),
            sensors=sensors,
            metadata={k: v for k, v in payload.items() if k not in {"label", "kind", "floor", "module", "group", "role", "floor_area_m2", "volume_m3", "estimated_volume_m3", "orientation_deg", "sensors"}},
        )


@dataclass(slots=True)
class ActuatorConfig:
    key: str
    label: str
    kind: ActuatorKind
    space: str
    command_metric: str | None = None
    actual_metric: str | None = None
    signed_min: int = -6
    signed_max: int = 6
    model_key: str | None = None
    metadata: dict[str, Any] = dc_field(default_factory=dict)

    @classmethod
    def from_dict(cls, key: str, payload: dict[str, Any]) -> "ActuatorConfig":
        return cls(
            key=key,
            label=str(payload.get("label", key)),
            kind=payload.get("kind", "ceiling_fan"),
            space=str(payload["space"]),
            command_metric=payload.get("command_metric"),
            actual_metric=payload.get("actual_metric"),
            signed_min=int(payload.get("signed_min", -6)),
            signed_max=int(payload.get("signed_max", 6)),
            model_key=payload.get("model_key"),
            metadata={k: v for k, v in payload.items() if k not in {"label", "kind", "space", "command_metric", "actual_metric", "signed_min", "signed_max", "model_key"}},
        )


@dataclass(slots=True)
class InfluxConfig:
    url: str = "http://localhost:8086"
    org: str = "vesta"
    bucket: str = "homeassistant"
    token_env: str = "VESTA_INFLUX_TOKEN"
    default_window: str = "2h"
    verify_ssl: bool = True

    @classmethod
    def from_dict(cls, payload: dict[str, Any] | None) -> "InfluxConfig":
        payload = payload or {}
        return cls(
            url=str(payload.get("url", "http://localhost:8086")),
            org=str(payload.get("org", "vesta")),
            bucket=str(payload.get("bucket", "homeassistant")),
            token_env=str(payload.get("token_env", "VESTA_INFLUX_TOKEN")),
            default_window=str(payload.get("default_window", "2h")),
            verify_ssl=bool(payload.get("verify_ssl", True)),
        )


@dataclass(slots=True)
class MqttConfig:
    """Optional MQTT broker for live values (portable mode).

    `base_topic` is the prefix Vesta subscribes to (`<base>/#`). Two payload
    shapes are accepted under it: per-metric `<base>/<space>/<metric>` with a
    numeric payload, and `<base>/<space>/state` with a JSON object of metrics.
    The password, if any, lives in an env var (never in the file).
    """

    host: str = "127.0.0.1"
    port: int = 1883
    base_topic: str = "vesta"
    username: str | None = None
    password_env: str | None = None
    tls: bool = False
    # In-memory password set via the panel (POST /api/connectivity); never read
    # from the YAML file and never serialized back out.
    password: str | None = None

    @classmethod
    def from_dict(cls, payload: dict[str, Any] | None) -> "MqttConfig | None":
        if not payload:
            return None
        return cls(
            host=str(payload.get("host", "127.0.0.1")),
            port=int(payload.get("port", 1883)),
            base_topic=str(payload.get("base_topic", "vesta")).rstrip("/"),
            username=payload.get("username"),
            password_env=payload.get("password_env"),
            tls=bool(payload.get("tls", False)),
        )


@dataclass(slots=True)
class SiteConfig:
    schema_version: int
    site_key: str
    label: str
    kind: SiteKind
    groups: dict[str, str]
    spaces: dict[str, SpaceConfig]
    actuators: dict[str, ActuatorConfig]
    influx: InfluxConfig
    pressure_metric: str | None = None
    mqtt: MqttConfig | None = None

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "SiteConfig":
        spaces = {key: SpaceConfig.from_dict(key, value) for key, value in payload.get("spaces", {}).items()}
        actuators = {key: ActuatorConfig.from_dict(key, value) for key, value in payload.get("actuators", {}).items()}
        return cls(
            schema_version=int(payload.get("schema_version", 1)),
            site_key=str(payload.get("site_key", "vesta")),
            label=str(payload.get("label", "Vesta")),
            kind=payload.get("kind", "home"),
            groups={str(k): str(v) for k, v in payload.get("groups", {}).items()},
            spaces=spaces,
            actuators=actuators,
            influx=InfluxConfig.from_dict(payload.get("influx")),
            pressure_metric=payload.get("pressure_metric"),
            mqtt=MqttConfig.from_dict(payload.get("mqtt")),
        )


def _float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def load_yaml_dict(path: str | Path) -> dict[str, Any]:
    """Load a YAML file, keeping PyYAML optional for minimal installs."""

    try:
        import yaml  # type: ignore[import-not-found]
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "YAML loading requires PyYAML. Install with `pip install pyyaml` "
            "or `pip install vesta-bioclimatic[standalone]`."
        ) from exc
    return yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}


def load_site_config(path: str | Path) -> SiteConfig:
    return SiteConfig.from_dict(load_yaml_dict(path))
