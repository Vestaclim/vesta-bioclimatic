# Vesta actuator trace tutorial

This tutorial explains how to adapt the Vesta command trace pattern to another actuator, another house, or another control strategy.

## Core idea

Vesta should never only say:

```text
the actuator changed
```

It should say:

```text
what Vesta intended
what actually happened
who probably caused it
whether the real action follows, approximates, or diverges from the calculated trajectory
what context was active when it happened
```

The current implementation applies this first to ceiling fans, but the pattern is generic.

## The four layers

### 1. Intent

An intent is a command Vesta or a known HA surface is about to send.

For a fan:

```text
room = living
actuator = ceiling_fan
requested_value = +3
source = vesta_panel
reason = panel slider Living
```

For a shutter:

```text
room = living
actuator = shutter
requested_value = 35 %
source = vesta_control_engine
reason = solar protection before high irradiance
```

For a VMC/extractor:

```text
room = bathroom
actuator = extractor
requested_value = 70 %
source = vesta_control_engine
reason = humidity purge trajectory
```

### 2. Observation

Observation is the real state after the command.

Examples:

```text
fan signed speed = +3
shutter position = 35 %
extractor percentage = 70 %
light brightness = 45 %
```

Observation must come from the real entity state, not from the requested helper only.

### 3. Relation

The observed state is compared to the pending intent inside a time window.

Current relation vocabulary:

```text
follows_pending_command
close_to_pending_command
diverges_from_pending_command
external_without_pending_command
```

For example:

```text
Vesta requested fan +5.
Three minutes later the fan is 0.
Relation = diverges_from_pending_command.
```

But:

```text
Vesta requested shutter 35 %.
The shutter reports 34 %.
Relation = close_to_pending_command.
```

This avoids treating normal actuator rounding as user feedback.

### 4. Source

The source is Vesta's best classification of who caused the change.

Current source vocabulary:

```text
vesta_panel
vesta_control_engine
ha_user
ha_automation
external_device_or_cloud
unknown
```

Home Assistant can often identify:

- a known Vesta service call;
- a HA user action through `context.user_id`;
- a HA automation/script through `context.parent_id`.

Home Assistant cannot always separate:

- infrared remote control;
- Smart Life / Tuya app;
- vendor cloud sync;
- physical device state change.

If the integration does not expose enough context, Vesta should classify those as:

```text
external_device_or_cloud
```

That is still useful: it means "not a known Vesta trajectory".

## How to adapt to a new actuator

### Step 1: Normalize the command value

Pick one numeric value that represents the control axis.

Examples:

| Actuator | Normalized value |
|---|---|
| Ceiling fan | signed speed `-6..+6` |
| Extractor / VMC | percentage `0..100` |
| Shutter / cover | position `0..100` |
| Light | brightness `0..100` |
| Heater | power or setpoint |

For multi-axis devices, start with one axis. Add more later.

### Step 2: Create intent helpers

For each actuator, create:

```text
last_requested_value
last_observed_value
pending_command_source
last_command_source
last_command_relation
pending_command_at
last_command_at
pending_command_reason
last_command_note
```

Use HA helpers for these values so they are visible, reloadable, and traceable.

### Step 3: Register known intents before service calls

Any Vesta-controlled surface should call an intent script before changing the actuator.

For example:

```text
script.vesta_register_fan_command_intent
```

Future generic version:

```text
script.vesta_register_actuator_intent
```

The important rule:

```text
intent first, command second
```

Otherwise the observer may see the state change before Vesta has recorded why it happened.

### Step 4: Observe the real entity

Create an automation that triggers on the real actuator state.

For fans today:

```text
sensor.vesta_living_fan_signed_speed
sensor.vesta_bureau_fan_signed_speed
```

For shutters tomorrow:

```text
cover.living_shutter current_position
```

For extractors:

```text
fan.bathroom_extractor percentage
```

### Step 5: Compare intent and observation

Use:

```text
delta = abs(observed - requested)
age = now - pending_command_at
window = function(user_authority, automation_aggressiveness, strategy_type)
```

Suggested windows:

| Strategy | Example | Window |
|---|---|---:|
| Reactive | fan comfort correction | 15-60 s |
| Semi-reactive | humidity extraction | 2-10 min |
| Inertial | solar shading, thermal mass | 10-60 min |

If an action targets thermal inertia, do not judge it too quickly.

### Step 6: Classify relation

Example generic rules:

```text
same value within window -> follows_pending_command
small delta within window -> close_to_pending_command
large delta within window -> diverges_from_pending_command
no known pending intent -> external_without_pending_command
```

Small delta depends on actuator:

```text
fan: 0 or 1 step
shutter: 2-5 %
light: 3-8 %
VMC: 5-10 %
```

### Step 7: Trace everything

InfluxDB should receive:

```text
requested value
observed value
source
relation
delta
age
strategy type
reason
room
weather context
comfort context
user authority
automation aggressiveness
```

That is the dataset needed before learning preferences.

## What to customize in another house

### Geometry

Edit:

```text
config/house_geometry.yaml
```

Change:

```text
rooms
volumes
openings
fan positions
occupancy zones
solar exposure placeholders
```

### Hardware

Edit:

```text
config/fan_airflow.yaml
```

For other actuators, create equivalent files later:

```text
config/ventilation_airflow.yaml
config/shading_model.yaml
config/lighting_model.yaml
```

### Home Assistant entities

Adapt:

```text
homeassistant/packages/vesta_house_model.yaml
```

Replace entity IDs:

```text
sensor.*
fan.*
cover.*
light.*
input_number.*
```

### Control personality

Tune:

```text
input_number.vesta_control_user_authority
input_number.vesta_control_automation_aggressiveness
```

Interpretation:

```text
high user authority -> manual action creates a wider hold band
high automation aggressiveness -> Vesta may re-evaluate sooner
```

These are not comfort coefficients; they are arbitration coefficients.

## Practical reading guide

If you want to understand tomorrow what happened:

1. Look at the actuator state.
2. Look at `last_command_source`.
3. Look at `last_command_relation`.
4. Look at `last_requested_value` versus `last_observed_value`.
5. Look at `last_command_note`.
6. If needed, inspect the InfluxDB timeline around the event.

Interpretation examples:

```text
source = vesta_panel
relation = follows_pending_command
```

The panel command worked. No user preference learning is needed.

```text
source = external_device_or_cloud
relation = external_without_pending_command
```

Something outside Vesta changed the actuator. This may be user intent, IR, Smart Life, cloud sync, or physical control.

```text
source = vesta_control_engine
relation = diverges_from_pending_command
```

Vesta calculated a command, but the real state diverged quickly. This is a strong candidate for override analysis.

## Stability notes

- Helpers that store dynamic state should not use `initial`, so HA can restore them after restart.
- InfluxDB is the long-term audit log.
- HA helpers are the current state and operator interface.
- YAML config is the versioned source of physical assumptions.
- The learning layer should never directly rewrite physical geometry from subjective feedback.

## Current implementation status

Implemented today:

- Fan intent registration from the Vesta panel.
- Fan observation using signed fan speed sensors.
- Source/relation classification.
- Trace entities suitable for InfluxDB.
- Panel display of command source and relation.

Not implemented yet:

- Generic actuator intent script.
- Trajectory library per actuator type.
- Natural-language feedback agent.
- Bounded preference-learning engine.
- Notifications asking follow-up questions when the action diverges from all plausible trajectories.
