# Vesta fan airflow mapping

This note maps the two ceiling fans used by Vesta:

- Bureau: Create Wind Stylance Natural Wood S, diameter 1.12 m.
- Living: Create Wind Stylance Natural Wood M, diameter 1.32 m.

The startup airflow dataset is borrowed from the Create Wind Stylance ABS S/M table. The S RPM row is completed with Create Wind Calm ABS multi-size data because some Wind Stylance pages display a truncated S RPM row. The working assumption is that the Natural Wood units share the same motor family, control logic, and blade concept closely enough for comfort-control estimates.

Both fans have an estimated 0.20 m motor hub. The airflow speed estimate therefore uses the active annulus area, not the full swept disk.

## Sign convention

The YAML config uses this initial convention:

- `+1` to `+6`: `blow_to_occupied_space`, direct useful airflow into the occupied living space.
- `0`: off.
- `-1` to `-6`: `aspirate_to_ceiling`, air aspirated from the occupied living space toward the ceiling for mixing/destratification.

This must be validated once on site with a ribbon or tissue test. If the actual HA direction is inverted, change only `control_convention` in `config/fan_airflow.yaml`.

## Calculation

```text
gross_disk_area_m2 = pi * (diameter_m / 2)^2
effective_annulus_area_m2 = gross_disk_area_m2 - pi * (hub_diameter_m / 2)^2
annulus_air_speed_m_s = airflow_m3_min / 60 / effective_annulus_area_m2
estimated_occupant_air_speed_m_s = annulus_air_speed_m_s * occupant_air_speed_factor
aspiration_effective_mixing_m3_min = airflow_m3_min * aspiration_ceiling_mixing_factor
equivalent_room_recirculations_per_h = airflow_m3_min * 60 / room_volume_m3
aspiration_equivalent_room_recirculations_per_h = aspiration_effective_mixing_m3_min * 60 / room_volume_m3
```

Current initial factors:

- Bureau: occupant factor `0.35`, aspiration ceiling mixing factor `0.85`, ceiling clearance `0.50 m`.
- Living: occupant factor `0.28`, aspiration ceiling mixing factor `0.75`, ceiling clearance `0.30 m`.

The occupant factors are calibration values, not manufacturer data. They represent the fraction of annulus velocity likely felt at the normal occupied zone.

## Room geometry

| Room | Floor area m2 | Fan height m | Ceiling height estimate m | Volume estimate m3 | Notes |
|---|---:|---:|---:|---:|---|
| Bureau | 14.0 | 2.70 | 3.20 at fan center | 44.8 | About 2.50 m by 5.60 m; slightly sloped roof. |
| Living | 19.0 | 2.50 | 2.80 | 53.2 | Fan centered in the room. |

## Bureau

Blade set: S, diameter 1.12 m.

Active annulus area: `0.9538 m2`; full swept disk area: `0.9852 m2`; hub area fraction: `3.19 %`.

| Blow command | RPM | Flow m3/min | Annulus speed m/s | Estimated occupant speed m/s | Aspiration command | Effective mixing m3/min |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 100 | 82 | 1.43 | 0.50 | -1 | 70 |
| 2 | 130 | 100 | 1.75 | 0.61 | -2 | 85 |
| 3 | 160 | 128 | 2.24 | 0.78 | -3 | 109 |
| 4 | 180 | 140 | 2.45 | 0.86 | -4 | 119 |
| 5 | 200 | 165 | 2.88 | 1.01 | -5 | 140 |
| 6 | 220 | 180 | 3.15 | 1.10 | -6 | 153 |

Note: S speed 5 RPM is `200 rpm`. Some Wind Stylance ABS pages display the S RPM row as `100/130/160/180/220`, but Create Wind Calm ABS multi-size tables publish the complete S sequence as `100/130/160/180/200/220 rpm`.

Equivalent room recirculation, using the provisional `44.8 m3` room volume:

| Speed | Blow flow room volumes/h | Aspiration effective room volumes/h |
|---:|---:|---:|
| 1 | 110 | 94 |
| 2 | 134 | 114 |
| 3 | 171 | 146 |
| 4 | 188 | 159 |
| 5 | 221 | 188 |
| 6 | 241 | 205 |

## Living

Blade set: M, diameter 1.32 m.

Active annulus area: `1.3371 m2`; full swept disk area: `1.3685 m2`; hub area fraction: `2.30 %`.

| Blow command | RPM | Flow m3/min | Annulus speed m/s | Estimated occupant speed m/s | Aspiration command | Effective mixing m3/min |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 80 | 87 | 1.08 | 0.30 | -1 | 65 |
| 2 | 110 | 110 | 1.37 | 0.38 | -2 | 82 |
| 3 | 140 | 143 | 1.78 | 0.50 | -3 | 107 |
| 4 | 160 | 166 | 2.07 | 0.58 | -4 | 124 |
| 5 | 180 | 182 | 2.27 | 0.64 | -5 | 136 |
| 6 | 200 | 206 | 2.57 | 0.72 | -6 | 154 |

Equivalent room recirculation, using the provisional `53.2 m3` room volume:

| Speed | Blow flow room volumes/h | Aspiration effective room volumes/h |
|---:|---:|---:|
| 1 | 98 | 73 |
| 2 | 124 | 92 |
| 3 | 161 | 121 |
| 4 | 187 | 140 |
| 5 | 205 | 153 |
| 6 | 232 | 174 |

These are recirculation equivalents, not fresh-air changes.

## Control meaning

For comfort:

- Use positive blow speeds to extend the ASHRAE elevated-air-speed comfort zone.
- Prefer the lowest speed that reaches the target estimated occupant speed.
- Increase speed only when occupancy, temperature, humidity, and noise policy allow it.

For destratification:

- Use negative aspiration speeds as mixing flow, not direct perceived air speed.
- Start low, because the goal is convection/mixing without a draft sensation.
- Increase only if ceiling/room thermal gradient or heating context makes mixing useful.

For future calibration:

- Measure air speed at the desk and sofa for speeds 1, 3, and 6 in direct mode.
- Record subjective acceptability at night and work hours.
- Confirm the signed direction mapping in Home Assistant.
- Update `occupant_air_speed_factor` and `aspiration_ceiling_mixing_factor` in `config/fan_airflow.yaml`.
