"""Data contracts for the portable Vesta bioclimatic engine."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Literal


ActionLevel = Literal["simple", "useful", "excellent"]


@dataclass(slots=True)
class OpeningState:
    entity_id: str
    room: str
    orientation: str
    is_open: bool | None = None
    solar_exposed: bool = False
    sheltered: bool = False


@dataclass(slots=True)
class FanState:
    entity_id: str
    room: str
    is_on: bool
    speed_pct: float | None = None
    direction: str | None = None
    airflow: str | None = None


@dataclass(slots=True)
class ActuatorState:
    entity_id: str
    room: str
    kind: str
    is_on: bool | None = None
    power_w: float | None = None
    available: bool = True


@dataclass(slots=True)
class RoomSample:
    name: str
    temp_c: float
    rh_pct: float
    absolute_humidity_g_m3: float | None = None
    co2_ppm: float | None = None
    voc_index: float | None = None
    occupied: bool | None = None
    target_min_c: float = 20.0
    target_max_c: float = 26.0


@dataclass(slots=True)
class OutdoorSample:
    temp_c: float
    rh_pct: float
    absolute_humidity_g_m3: float | None = None
    solar_w_m2: float | None = None
    wind_m_s: float | None = None
    rain_mm_h: float | None = None
    timestamp: str | None = None


@dataclass(slots=True)
class HouseSnapshot:
    timestamp: str
    rooms: list[RoomSample]
    outdoor: OutdoorSample
    forecast: list[OutdoorSample] = field(default_factory=list)
    fans: list[FanState] = field(default_factory=list)
    openings: list[OpeningState] = field(default_factory=list)
    actuators: list[ActuatorState] = field(default_factory=list)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "HouseSnapshot":
        return cls(
            timestamp=payload.get("timestamp") or datetime.now().isoformat(),
            rooms=[RoomSample(**item) for item in payload.get("rooms", [])],
            outdoor=OutdoorSample(**payload["outdoor"]),
            forecast=[OutdoorSample(**item) for item in payload.get("forecast", [])],
            fans=[FanState(**item) for item in payload.get("fans", [])],
            openings=[OpeningState(**item) for item in payload.get("openings", [])],
            actuators=[ActuatorState(**item) for item in payload.get("actuators", [])],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class CommandProposal:
    domain: str
    entity_id: str
    service: str
    data: dict[str, Any]
    safety: str
    reason: str
    confidence: float


@dataclass(slots=True)
class RoomAssessment:
    room: str
    score: float
    temp_c: float
    rh_pct: float
    absolute_humidity_g_m3: float
    co2_ppm: float | None
    voc_index: float | None
    ashrae_status: str
    givoni_hint: str
    action: str
    priority: int


@dataclass(slots=True)
class Recommendation:
    level: ActionLevel
    title: str
    room: str | None
    action: str
    reason: str
    hour: str | None = None
    confidence: float = 0.7


@dataclass(slots=True)
class StrategyResult:
    timestamp: str
    global_score: float
    assurance: str
    givoni_mode: str
    primary_action: str
    horizon_minutes: int
    rooms: list[RoomAssessment]
    recommendations: list[Recommendation]
    commands: list[CommandProposal]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
