# Vesta adaptive control architecture

## Current state

Vesta now separates:

- `config/house_geometry.yaml`: room geometry, estimated volumes, fan position, ceiling clearance, occupancy zones.
- `config/fan_airflow.yaml`: fan hardware, speed tables, sign convention, annulus airflow estimates, Home Assistant entity mapping.
- InfluxDB: future time-series store for measurements, commands, feedback events, and learned coefficients.

The current fan speed tables already use:

- the Create S/M airflow and RPM tables;
- the 0.20 m inactive motor hub, using active annulus area instead of full disk area;
- the room-specific fan height and clearance above the fan;
- room-specific transfer coefficients from annulus speed to estimated occupied-zone air speed;
- aspiration mixing coefficients for the constrained ceiling gap.

The current tables do not yet solve a full CFD or 3D airflow model. They are a calibrated engineering model suitable for Home Assistant control startup.

## Data flow

```text
House geometry YAML
        |
        v
Generated HA helpers / template sensors
        |
        v
Control engine and custom panel
        |
        v
Fan commands and comfort recommendations
        |
        v
InfluxDB traces measurements, commands, context, feedback, coefficients
```

## Coefficient types

Geometry coefficients should not all be treated the same.

| Coefficient | Example | Updated by feedback? | Updated by measurement? |
|---|---|---:|---:|
| Physical geometry | room volume, fan height, hub diameter | No | Yes |
| Hardware table | RPM, airflow per speed | No | Only if measured/replaced |
| Transfer factor | occupied-zone air speed factor | Yes, bounded | Yes |
| Comfort preference | max night speed, noise tolerance | Yes | Yes |
| Control policy | hysteresis, dwell time, aggressiveness | Yes, bounded | Yes |

Subjective feedback can adjust comfort and transfer coefficients, but it must not rewrite measured geometry.

## Feedback loop

Example user feedback:

```text
"Il fait trop chaud"
```

The agent should translate this into a structured event:

```json
{
  "room": "living",
  "feedback": "too_hot",
  "context": {
    "temperature_c": 26.8,
    "rh_pct": 54,
    "fan_signed_speed": 2,
    "estimated_air_speed_m_s": 0.38,
    "outdoor_temp_c": 24.1
  }
}
```

Then a deterministic calibrator applies bounded changes, for example:

```text
increase desired occupant air speed target slightly
or lower fan activation threshold for similar contexts
```

Example:

```text
living.default_living_zone.air_speed_transfer_factor:
  old: 0.28
  proposed: 0.30
  max_step: 0.02
  reason: repeated too_hot feedback while fan was active and noise was acceptable
```

For noise:

```text
"Il y a trop de bruit"
```

Do not reduce room geometry. Instead update:

```text
room_time_policy.max_signed_speed
noise_acceptability_by_speed
preferred_strategy = lower_speed_longer
```

## What should be traced

InfluxDB should record:

- sensor climate state: temperature, humidity, absolute humidity, CO2, VOC;
- outdoor and forecast context;
- fan signed speed, direction, percentage, command source;
- estimated annulus speed, occupied-zone speed, aspiration mixing flow;
- room volume and active coefficient versions as tags/fields;
- comfort score and ASHRAE/Givoni mode;
- user feedback events;
- coefficient update events with old value, new value, reason, bounds, and confidence.

## Reliability guardrails

- Keep geometry in YAML and version it.
- Expose editable parameters through HA helpers, not direct dashboard YAML writes.
- Let an agent propose changes, but let a deterministic calibrator bound and apply them.
- Store every applied change in InfluxDB.
- Keep a rollback path for coefficients.
- Use manual override states as hard constraints.
- Do not exceed room/time noise policies unless IAQ or safety requires it.

## Implementation order

1. Create HA helpers for editable coefficients per room and zone.
2. Generate template sensors for room volume, annulus speed, estimated air speed, and aspiration mixing flow.
3. Publish the same values into the Vesta custom panel.
4. Trace calculated values and fan commands into InfluxDB.
5. Design the feedback and override arbitration path. Avoid making buttons the final interface; a temporary test button can exist, but the target is an agent that understands natural language, timing, manual overrides, noise sensitivity, and climate deterioration.
6. Implement bounded coefficient updates from structured feedback and manual-override events.
7. Add forecast-aware control laws.
8. Add solar exposure inputs once geometry and openings are modeled.
9. Replace provisional geometry with measured geometry or vacuum-map-derived floor plans.
10. Add 3D/solar model as an external service feeding HA sensors.

## Point 5 direction

Manual actions are feedback. If Vesta turns a fan to `5` and the user turns it off three minutes later, this must be traced as an override event, not ignored as noise.

The Home Assistant package now provides a first provenance layer:

- every Vesta panel command registers a pending intent before changing the signed fan helper;
- the actual signed fan speed is observed afterward;
- the observed state is compared to the pending intent inside a time window controlled by user authority and automation aggressiveness;
- the event is classified as following, close to, diverging from, or external to the pending trajectory.

This is not yet a preference-learning loop. It is the trace layer required before learning.

The future arbitration model should track:

- last automatic command;
- last manual command;
- time between automation and manual correction;
- climate stability or deterioration since the correction;
- user authority coefficient;
- automation aggressiveness coefficient;
- quiet-hours/noise context;
- whether the user has repeatedly rejected similar actions.

If user authority is high, a manual correction should create a wider hold band. Vesta should wait for a stronger climate change before overriding the user again. If automation aggressiveness is high, Vesta can re-evaluate sooner, but should still avoid command ping-pong.

Natural language feedback should be converted into structured events by an agent, then bounded by deterministic policy before any coefficient is changed.

## Source attribution limits

Home Assistant state context can often distinguish:

- service calls made by Vesta;
- service calls made by a HA user;
- state changes caused by HA automations/scripts.

It cannot always distinguish:

- infrared remote control;
- Smart Life / Tuya mobile app;
- vendor cloud synchronization;
- a physical fan state change.

If those channels only appear as a fan state update with no `context.user_id`, no `context.parent_id`, and no source-specific attribute, Vesta must classify them as `external_device_or_cloud`.

To separate IR from Smart Life later, inspect the integration's emitted events, entity attributes, logbook context, and any diagnostic sensors provided by the fan integration.
