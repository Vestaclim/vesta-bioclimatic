"""Runtime assembly: SiteConfig + measurements -> snapshot + cockpit view."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field as dc_field
from datetime import datetime, timezone
from statistics import mean
from typing import Any

from .config_schema import SiteConfig, SpaceConfig
from .givoni import ComfortBand
from .models import ActuatorState, FanState, HouseSnapshot, OutdoorSample, RoomSample
from .psychrometrics import (
    dew_point_c,
    enthalpy_kj_kg_dry_air,
    mixing_ratio_g_kg,
    wet_bulb_c,
)
from .strategy import assess_house


@dataclass(slots=True)
class MeasurementStore:
    """Normalized latest values keyed as '<space>.<metric>'.

    Connectors are expected to translate their native vocabulary first:
    Home Assistant entities, MQTT payloads and Influx series all become the same
    keys here. That keeps the Python engine independent from the data source.
    """

    values: dict[str, float]
    updated_at: dict[str, datetime] = dc_field(default_factory=dict)

    @classmethod
    def from_plain_dict(cls, payload: dict[str, float | int]) -> "MeasurementStore":
        return cls(values={str(k): float(v) for k, v in payload.items()})

    def get(self, space: str, metric: str, default: float | None = None) -> float | None:
        return self.values.get(f"{space}.{metric}", default)


@dataclass(slots=True)
class CockpitPoint:
    key: str
    label: str
    kind: str
    group: str | None
    temp_c: float
    rh_pct: float
    humidity_ratio_g_kg: float
    score: float | None = None
    updated_at: str | None = None


@dataclass(slots=True)
class ActuatorView:
    key: str
    label: str
    kind: str
    space: str
    command: float | None
    actual: float | None
    synchronized: bool | None
    status: str


@dataclass(slots=True)
class CockpitView:
    timestamp: str
    site_key: str
    label: str
    kind: str
    global_score: float
    pressure_hpa: float
    points: list[CockpitPoint]
    groups: dict[str, list[str]]
    group_links: list[tuple[str, str]]
    actuators: list[ActuatorView]
    recommendations: list[dict[str, Any]]
    group_labels: dict[str, str] = dc_field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_snapshot(site: SiteConfig, measurements: MeasurementStore) -> HouseSnapshot:
    """Build the strategy input from static YAML plus live measurements."""
    outdoor_spaces = [space for space in site.spaces.values() if space.kind == "exterior"]
    interior_spaces = [space for space in site.spaces.values() if space.kind == "interior"]
    outdoor_space = outdoor_spaces[0] if outdoor_spaces else None
    outdoor = _outdoor_sample(outdoor_space, measurements) if outdoor_space else OutdoorSample(temp_c=20.0, rh_pct=50.0)
    rooms = [_room_sample(space, measurements) for space in interior_spaces if _has_temp_rh(space, measurements)]
    fans: list[FanState] = []
    actuators: list[ActuatorState] = []
    for actuator in site.actuators.values():
        actual = measurements.values.get(actuator.actual_metric or "")
        command = measurements.values.get(actuator.command_metric or "")
        is_on = (actual if actual is not None else command or 0) != 0
        if actuator.kind == "ceiling_fan":
            fans.append(
                FanState(
                    entity_id=actuator.key,
                    room=actuator.space,
                    is_on=is_on,
                    speed_pct=None if actual is None else abs(actual) / max(abs(actuator.signed_min), actuator.signed_max) * 100,
                    direction="forward" if (actual or command or 0) >= 0 else "reverse",
                    airflow="blow" if (actual or command or 0) >= 0 else "aspiration",
                )
            )
        else:
            actuators.append(ActuatorState(entity_id=actuator.key, room=actuator.space, kind=actuator.kind, is_on=is_on))
    return HouseSnapshot(
        timestamp=datetime.now(timezone.utc).isoformat(),
        rooms=rooms,
        outdoor=outdoor,
        fans=fans,
        actuators=actuators,
    )


def build_cockpit_view(
    site: SiteConfig,
    measurements: MeasurementStore,
    pressure_hpa: float = 1013.25,
    band: ComfortBand | None = None,
) -> CockpitView:
    """Build the JSON-friendly view consumed by a web UI or API.

    This is the portable counterpart of the Home Assistant custom panel: it
    exposes points, group links, actuator synchronization and recommendations
    without assuming that Home Assistant exists.
    """
    snapshot = build_snapshot(site, measurements)
    result = assess_house(snapshot, band)
    scores = {room.room: room.score for room in result.rooms}
    points: list[CockpitPoint] = []
    for space in site.spaces.values():
        if not _has_temp_rh(space, measurements):
            continue
        temp = measurements.get(space.key, "temperature")
        rh = measurements.get(space.key, "humidity")
        assert temp is not None and rh is not None
        points.append(
            CockpitPoint(
                key=space.key,
                label=space.label,
                kind=space.kind,
                group=space.group,
                temp_c=temp,
                rh_pct=rh,
                humidity_ratio_g_kg=mixing_ratio_g_kg(temp, rh, pressure_hpa),
                score=scores.get(space.label),
                updated_at=_latest_update(space, measurements),
            )
        )
    groups = _groups(site, points)
    return CockpitView(
        timestamp=snapshot.timestamp,
        site_key=site.site_key,
        label=site.label,
        kind=site.kind,
        global_score=result.global_score,
        pressure_hpa=pressure_hpa,
        points=points,
        groups=groups,
        group_links=_group_links(points),
        actuators=[_actuator_view(actuator, measurements) for actuator in site.actuators.values()],
        recommendations=[asdict(item) for item in result.recommendations],
        group_labels=dict(site.groups),
    )


def psychro_metrics(temp_c: float, rh_pct: float, pressure_hpa: float = 1013.25) -> dict[str, float]:
    return {
        "humidity_ratio_g_kg": round(mixing_ratio_g_kg(temp_c, rh_pct, pressure_hpa), 3),
        "enthalpy_kj_kg": round(enthalpy_kj_kg_dry_air(temp_c, rh_pct, pressure_hpa), 3),
        "dew_point_c": round(dew_point_c(temp_c, rh_pct), 3),
        "wet_bulb_c": round(wet_bulb_c(temp_c, rh_pct), 3),
    }


def _has_temp_rh(space: SpaceConfig, measurements: MeasurementStore) -> bool:
    return measurements.get(space.key, "temperature") is not None and measurements.get(space.key, "humidity") is not None


def _room_sample(space: SpaceConfig, measurements: MeasurementStore) -> RoomSample:
    temp = measurements.get(space.key, "temperature")
    rh = measurements.get(space.key, "humidity")
    assert temp is not None and rh is not None
    return RoomSample(
        name=space.label,
        temp_c=temp,
        rh_pct=rh,
        co2_ppm=measurements.get(space.key, "co2"),
        voc_index=measurements.get(space.key, "voc"),
    )


def _outdoor_sample(space: SpaceConfig, measurements: MeasurementStore) -> OutdoorSample:
    temp = measurements.get(space.key, "temperature", 20.0)
    rh = measurements.get(space.key, "humidity", 50.0)
    assert temp is not None and rh is not None
    return OutdoorSample(
        temp_c=temp,
        rh_pct=rh,
        solar_w_m2=measurements.get(space.key, "solar"),
        wind_m_s=measurements.get(space.key, "wind"),
        rain_mm_h=measurements.get(space.key, "rain"),
    )


def _groups(site: SiteConfig, points: list[CockpitPoint]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for point in points:
        key = point.group or ("Exterior" if point.kind == "exterior" else "Ungrouped")
        grouped.setdefault(key, []).append(point.key)
    return grouped


def _group_links(points: list[CockpitPoint]) -> list[tuple[str, str]]:
    links: list[tuple[str, str]] = []
    by_group: dict[str, list[CockpitPoint]] = {}
    for point in points:
        if point.group:
            by_group.setdefault(point.group, []).append(point)
    for group_points in by_group.values():
        ordered = sorted(group_points, key=lambda p: p.key)
        links.extend((a.key, b.key) for a, b in zip(ordered, ordered[1:]))
    return links


def _actuator_view(actuator, measurements: MeasurementStore) -> ActuatorView:
    command = measurements.values.get(actuator.command_metric or "")
    actual = measurements.values.get(actuator.actual_metric or "")
    synchronized = None
    status = "unobserved"
    if command is not None and actual is not None:
        synchronized = round(command) == round(actual)
        status = "synchronized" if synchronized else "pending_or_divergent"
    elif command is not None:
        status = "command_only"
    elif actual is not None:
        status = "actual_only"
    return ActuatorView(
        key=actuator.key,
        label=actuator.label,
        kind=actuator.kind,
        space=actuator.space,
        command=command,
        actual=actual,
        synchronized=synchronized,
        status=status,
    )


def _latest_update(space: SpaceConfig, measurements: MeasurementStore) -> str | None:
    dates = [
        measurements.updated_at.get(f"{space.key}.{metric}")
        for metric in ("temperature", "humidity")
        if measurements.updated_at.get(f"{space.key}.{metric}") is not None
    ]
    if not dates:
        return None
    return max(dates).isoformat()
