"""ASHRAE/Givoni comfort classification primitives."""

from __future__ import annotations

from dataclasses import dataclass

from .psychrometrics import absolute_humidity_g_m3


@dataclass(frozen=True, slots=True)
class ComfortBand:
    temp_min_c: float = 20.0
    temp_max_c: float = 26.0
    rh_min_pct: float = 30.0
    rh_max_pct: float = 60.0
    co2_soft_ppm: float = 900.0
    co2_hard_ppm: float = 1200.0
    voc_soft: float = 250.0
    voc_hard: float = 500.0


def ashrae_status(temp_c: float, rh_pct: float, band: ComfortBand | None = None) -> str:
    band = band or ComfortBand()
    if band.temp_min_c <= temp_c <= band.temp_max_c and band.rh_min_pct <= rh_pct <= band.rh_max_pct:
        return "confort ASHRAE"
    if temp_c < band.temp_min_c:
        return "froid"
    if temp_c > band.temp_max_c:
        return "chaud"
    if rh_pct > band.rh_max_pct:
        return "humide"
    return "sec"


def givoni_hint(
    indoor_temp_c: float,
    indoor_rh_pct: float,
    outdoor_temp_c: float,
    outdoor_rh_pct: float,
) -> str:
    indoor_ah = absolute_humidity_g_m3(indoor_temp_c, indoor_rh_pct)
    outdoor_ah = absolute_humidity_g_m3(outdoor_temp_c, outdoor_rh_pct)
    if indoor_temp_c > 26.0 and outdoor_temp_c + 0.8 < indoor_temp_c and outdoor_ah <= indoor_ah + 0.5:
        return "ventilation naturelle / purge nocturne"
    if indoor_temp_c > 26.0 and outdoor_ah < 8.5:
        return "potentiel rafraichissement evaporatif"
    if indoor_temp_c < 20.0:
        return "chauffage ou apports solaires"
    if indoor_rh_pct > 60.0 and outdoor_ah + 0.5 < indoor_ah:
        return "purge hygrique"
    if indoor_rh_pct > 60.0:
        return "limiter les apports humides"
    return "maintien confort"
