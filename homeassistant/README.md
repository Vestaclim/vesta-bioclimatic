# Vesta Psychro Home Assistant Panel

Cette branche fournit un vrai `panel_custom`, pas une carte Lovelace.

## Installation automatique depuis Terminal & SSH

Copier ce dossier `homeassistant/` dans Home Assistant, puis depuis Terminal & SSH :

```bash
cd /config/vesta-bioclimatic/homeassistant
./deploy_to_ha.sh
ha core check
```

Si la configuration est valide, redemarrer Home Assistant. `panel_custom` est une integration YAML et ne peut pas etre active par simple reload.

Le panneau apparait ensuite dans la sidebar sous `Vesta Psychro` et charge `/vesta-psychro`.

Note cache frontend : Home Assistant sert les fichiers `/local/` avec un cache long. Quand `vesta-psychro-panel.js` change, changer aussi le parametre `?v=...` de `module_url`, puis redemarrer Home Assistant pour forcer les navigateurs a charger le nouveau module.

## Installation manuelle

1. Copier `homeassistant/www/vesta-psychro` vers `/config/www/vesta-psychro`.
2. Copier `homeassistant/packages/vesta_house_model.yaml` vers `/config/packages/vesta_house_model.yaml`.
3. Ajouter le contenu de `homeassistant/config/panel_custom.yaml` dans `configuration.yaml`.
4. Verifier que `configuration.yaml` contient `homeassistant: packages: !include_dir_named packages`.
5. Executer `ha core check`.
6. Redemarrer Home Assistant.

Le package expose les coefficients editables, les volumes de piece et les capteurs calcules de vitesse/debit/brassage.

La zone de confort adaptatif du panel est calculee sur une base exterieure glissante de 7 jours. Le panel demande l'historique HA temperature/humidite du capteur exterieur et applique une ponderation exponentielle (`alpha = 0.8`) : les dernieres 24 h pesent plus que le septieme jour. Si l'historique HA n'est pas disponible, le panel se rabat temporairement sur la mesure exterieure instantanee et l'indique dans le tooltip de la section exterieure.

## Entites HA utilisees

- Pression : `sensor.airthings_tern_co2_000557_pression_atmospherique`
- Pieces : capteurs `sensor.climat_*_temperature` et `sensor.climat_*_humidite_relative`
- Ventilateurs :
  - `input_number.consigne_vitesse_ventilateur_living_signee`
  - `input_number.consigne_vitesse_ventilateur_bureau_signee`

Les commandes ventilateurs passent par `input_number.set_value` avec une valeur signee de `-6` a `+6`.

Convention :

- positif : souffle dans l'espace de vie ;
- negatif : aspiration depuis l'espace de vie vers le plafond.

## Modele maison et capteurs calcules

Le package `homeassistant/packages/vesta_house_model.yaml` cree notamment :

- `input_number.vesta_*_air_speed_transfer_factor`
- `input_number.vesta_*_aspiration_ceiling_mixing_factor`
- `sensor.vesta_*_room_volume`
- `sensor.vesta_*_fan_annulus_air_speed`
- `sensor.vesta_*_estimated_occupied_air_speed`
- `sensor.vesta_*_aspiration_mixing_flow`
- `sensor.vesta_*_blow_recirculation_equivalent`
- `sensor.vesta_*_aspiration_recirculation_equivalent`
- `input_select.vesta_*_last_command_source`
- `input_select.vesta_*_last_command_relation`
- `sensor.vesta_*_command_deviation`
- `sensor.vesta_*_command_trace_summary`

Les capteurs numeriques ont `state_class: measurement` pour etre correctement historises.

## Provenance des commandes

Avant de modifier une consigne ventilateur, le panel appelle `script.vesta_register_fan_command_intent` avec :

- la piece ;
- la vitesse signee demandee ;
- la source (`vesta_panel`) ;
- une raison courte.

Les automations `Vesta Trace Living/Bureau Fan Command Source` observent ensuite la vitesse signee reelle.

Elles classent le changement comme :

- `follows_pending_command` : le ventilateur suit exactement une intention Vesta recente ;
- `close_to_pending_command` : le changement est proche de la trajectoire attendue ;
- `diverges_from_pending_command` : l'utilisateur ou une integration diverge d'une intention recente ;
- `external_without_pending_command` : changement sans intention Vesta connue.

La source est classee comme `vesta_panel`, `vesta_control_engine`, `ha_user`, `ha_automation`, ou `external_device_or_cloud`.

Limite importante : une telecommande infrarouge et Smart Life peuvent toutes deux apparaitre comme `external_device_or_cloud` si l'integration ne fournit pas d'evenement ou de contexte distinct. Pour les separer, il faudra inspecter les attributs/evenements exposes par l'integration ventilateur.

Le patron generique pour adapter cette trace a d'autres actionneurs est decrit dans `docs/actuator_trace_tutorial.md`.

## InfluxDB

Si InfluxDB enregistre deja les domaines `sensor` et `input_number`, les valeurs Vesta seront tracees automatiquement.

Si InfluxDB utilise une liste d'inclusion stricte, fusionner les entites de `homeassistant/config/influxdb_vesta_entities.yaml` dans la section `influxdb.include.entities` existante.

Ne pas ajouter un second bloc top-level `influxdb:` si une configuration InfluxDB existe deja.
