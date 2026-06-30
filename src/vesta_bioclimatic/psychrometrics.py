"""Psychrometric helpers used by the ASHRAE/Givoni strategy layer."""

from __future__ import annotations

from math import atan, exp, log, sqrt


STANDARD_PRESSURE_HPA = 1013.25


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def saturation_vapor_pressure_hpa(temp_c: float) -> float:
    """Magnus saturation vapor pressure over water, in hPa."""
    return 6.112 * exp((17.67 * temp_c) / (temp_c + 243.5))


def vapor_pressure_hpa(temp_c: float, relative_humidity_pct: float) -> float:
    rh = clamp(relative_humidity_pct, 0.0, 100.0)
    return saturation_vapor_pressure_hpa(temp_c) * rh / 100.0


def absolute_humidity_g_m3(temp_c: float, relative_humidity_pct: float) -> float:
    """Absolute humidity in g/m3."""
    e_hpa = vapor_pressure_hpa(temp_c, relative_humidity_pct)
    return 216.7 * e_hpa / (temp_c + 273.15)


def relative_humidity_from_absolute(temp_c: float, absolute_humidity: float) -> float:
    e_hpa = absolute_humidity * (temp_c + 273.15) / 216.7
    return clamp(100.0 * e_hpa / saturation_vapor_pressure_hpa(temp_c), 0.0, 100.0)


def mixing_ratio_g_kg(
    temp_c: float,
    relative_humidity_pct: float,
    pressure_hpa: float = STANDARD_PRESSURE_HPA,
) -> float:
    """Humidity ratio in g/kg of dry air."""
    e_hpa = vapor_pressure_hpa(temp_c, relative_humidity_pct)
    if e_hpa >= pressure_hpa:
        return float("inf")
    return 621.98 * e_hpa / (pressure_hpa - e_hpa)


def dew_point_c(temp_c: float, relative_humidity_pct: float) -> float:
    rh = clamp(relative_humidity_pct, 0.1, 100.0)
    alpha = (17.27 * temp_c) / (237.7 + temp_c) + log(rh / 100.0)
    return (237.7 * alpha) / (17.27 - alpha)


def enthalpy_kj_kg_dry_air(
    temp_c: float,
    relative_humidity_pct: float,
    pressure_hpa: float = STANDARD_PRESSURE_HPA,
) -> float:
    w = mixing_ratio_g_kg(temp_c, relative_humidity_pct, pressure_hpa) / 1000.0
    return 1.006 * temp_c + w * (2501.0 + 1.86 * temp_c)


def wet_bulb_c(temp_c: float, relative_humidity_pct: float) -> float:
    """Stull 2011 approximation, valid for common building-comfort ranges."""
    rh = clamp(relative_humidity_pct, 1.0, 100.0)
    return (
        temp_c * atan(0.151977 * sqrt(rh + 8.313659))
        + atan(temp_c + rh)
        - atan(rh - 1.676331)
        + 0.00391838 * rh**1.5 * atan(0.023101 * rh)
        - 4.686035
    )
