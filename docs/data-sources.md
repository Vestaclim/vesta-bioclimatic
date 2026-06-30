# Sources de donnees : MQTT, API, InfluxDB

## Principe

Le frontend ne se connecte jamais directement a InfluxDB avec un token. Il consomme :

- MQTT pour le temps reel ;
- API historique pour les series ;
- snapshot JSON pour un mode statique simple.

InfluxDB reste derriere un backend Python, une integration locale ou un proxy applicatif.

## MQTT live

Topic recommande :

```text
vesta/site/{site_key}/space/{space_key}/state
```

Payload minimal :

```json
{
  "space": "living",
  "ts": "2026-06-13T10:00:00Z",
  "temperature": 23.4,
  "humidity": 52.0
}
```

Payload complet possible :

```json
{
  "space": "chambre_1",
  "ts": "2026-06-13T10:00:00Z",
  "temperature": 22.8,
  "humidity": 56.0,
  "pressure": 1014.2,
  "co2": 720,
  "voc": 110,
  "noise": 32,
  "illuminance": 80
}
```

Actionneur :

```json
{
  "space": "living",
  "actuator": "living_ceiling_fan",
  "command": 3,
  "actual": 3,
  "source": "vesta_control_engine",
  "ts": "2026-06-13T10:00:00Z"
}
```

## API historique

Endpoint cible :

```text
GET /history?space={space}&metrics=temperature,humidity&start={start}&end={end}&bucket=1h
```

Reponse :

```json
{
  "space": "patio",
  "metrics": ["temperature", "humidity"],
  "points": [
    {"ts": "2026-06-12T10:00:00Z", "temperature": 18.2, "humidity": 62},
    {"ts": "2026-06-12T11:00:00Z", "temperature": 19.1, "humidity": 59}
  ]
}
```

Endpoint Tpma pre-calcule :

```text
GET /comfort-basis?space=patio&days=7&alpha=0.8
```

Reponse :

```json
{
  "method": "rolling_7d_exponential",
  "alpha": 0.8,
  "temperature": 17.8,
  "humidity": 61.5,
  "daily_count": 7,
  "point_count": 336
}
```

## InfluxDB

Structure robuste recommandee :

Measurement unique : `vesta_climate`

Tags :

- `site`
- `space`
- `space_name`
- `group`
- `kind`: `interior`, `exterior`, `system`
- `metric`: `temperature`, `humidity`, `pressure`, `co2`, `voc`, `command`, `actual`
- `source`

Field :

- `value`

Exemple :

```text
vesta_climate,site=home,space=living,group=rdc,kind=interior,metric=temperature,source=mqtt value=23.4
vesta_climate,site=home,space=living,group=rdc,kind=interior,metric=humidity,source=mqtt value=52
```

## Installation portable

1. Declarer les pieces/modules dans `config/site_house.yaml` ou `config/site_system.yaml`.
2. Associer chaque mesure Influx/MQTT/API a un metric Vesta.
3. Garder les secrets dans l'environnement serveur.
4. Exposer un endpoint JSON normalise pour l'interface.
5. Ne jamais copier de token dans le JS public.
