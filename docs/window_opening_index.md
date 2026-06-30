# Indice directionnel d'ouverture de fenêtre

## 1. Objet de la fonctionnalité

Cette fonctionnalité définit un indicateur instantané, borné entre `-1` et `+1`, destiné à recommander l'état d'une fenêtre en fonction du contexte bioclimatique intérieur / extérieur, de la géométrie du bâtiment et des contraintes opérationnelles.

L'indicateur vise à répondre à une question simple :

> Pour une fenêtre donnée, à cet instant, l'ouverture améliore-t-elle réellement le confort, la qualité d'air ou la performance énergétique de la pièce ?

Convention de signe :

| Valeur | Interprétation | Action indicative |
| ---: | --- | --- |
| `+1` | Insufflation extérieure vers intérieur fortement favorable | Ouvrir, idéalement côté entrée d'air |
| `0` | Ouverture non utile ou défavorable | Garder fermé, isolé, volet adapté |
| `-1` | Extraction intérieure vers extérieur fortement favorable | Ouvrir comme sortie d'air / purge |

Le score doit rester interprétable. Il ne remplace pas un modèle CFD complet du bâtiment ; il constitue un noyau décisionnel robuste, calibrable et exploitable en temps réel dans Home Assistant, MQTT, InfluxDB ou le noyau Python portable de VESTA Bioclimatic.

---

## 2. Principe physique

Une fenêtre ouverte produit un échange d'air selon trois familles de phénomènes :

1. **Potentiel climatique** : l'air extérieur est-il plus favorable que l'air intérieur ?
2. **Potentiel de débit** : existe-t-il une force motrice suffisante pour échanger de l'air ?
3. **Contraintes réelles** : pluie, pollution, bruit, sécurité, rafales, soleil direct, occupation.

L'indice final est donc construit comme un produit de scores partiels :

```text
window_index = direction_flux
             * score_debit
             * score_benefice_air
             * score_contraintes
```

avec :

```text
window_index ∈ [-1 ; +1]
```

Le signe est porté par `direction_flux` :

```text
+1 : flux probable extérieur -> intérieur
-1 : flux probable intérieur -> extérieur
 0 : direction indéterminée ou débit négligeable
```

---

## 3. Variables d'entrée

### 3.1 Mesures intérieures par pièce

| Variable | Unité | Rôle |
| --- | --- | --- |
| `temperature_indoor` | °C | Température sèche de la pièce |
| `relative_humidity_indoor` | % | Humidité relative intérieure |
| `absolute_humidity_indoor` | g/m³ | Masse de vapeur par volume d'air |
| `humidity_ratio_indoor` | g/kg air sec | Variable psychrométrique normalisée |
| `enthalpy_indoor` | kJ/kg air sec | Énergie totale air sec + vapeur |
| `dew_point_indoor` | °C | Risque de condensation |
| `co2_indoor` | ppm | Besoin hygiénique de renouvellement d'air |
| `voc_indoor` | index ou ppb | Pollution intérieure |
| `pm25_indoor` | µg/m³ | Particules fines intérieures |
| `room_air_volume` | m³ | Volume d'air à renouveler |
| `thermal_mass_index` | 0..1 | Inertie thermique estimée de la pièce |
| `occupancy` | bool / niveau | Présence ou usage de la pièce |

### 3.2 Mesures extérieures

| Variable | Unité | Rôle |
| --- | --- | --- |
| `temperature_outdoor` | °C | Température sèche extérieure |
| `relative_humidity_outdoor` | % | Humidité relative extérieure |
| `absolute_humidity_outdoor` | g/m³ | Comparaison hydrique directe |
| `humidity_ratio_outdoor` | g/kg air sec | Comparaison psychrométrique |
| `enthalpy_outdoor` | kJ/kg air sec | Potentiel de free-cooling |
| `dew_point_outdoor` | °C | Risque de condensation ou d'apport humide |
| `pressure_outdoor` | hPa | Densité air / contexte météo |
| `wind_speed` | m/s | Pression dynamique disponible |
| `wind_gust` | m/s | Sécurité mécanique |
| `wind_direction` | ° | Orientation du vent météo |
| `rain_rate` | mm/h | Risque d'entrée d'eau |
| `solar_radiation_global` | W/m² | Contrainte ou opportunité solaire |
| `uv_index` | index | Proxy d'ensoleillement si radiation absente |
| `pm25_outdoor` | µg/m³ | Qualité d'air extérieur |
| `noise_outdoor` | dBA | Contrainte de confort |

### 3.3 Géométrie de fenêtre

| Variable | Unité | Rôle |
| --- | --- | --- |
| `window_azimuth_normal` | ° | Direction de la normale sortante de la fenêtre |
| `window_tilt` | ° | Inclinaison ; fenêtre verticale ≈ 90° |
| `window_width` | m | Largeur utile |
| `window_height` | m | Hauteur utile |
| `opening_ratio` | 0..1 | Fraction d'ouverture réelle |
| `effective_open_area` | m² | Surface aérodynamique ouverte |
| `discharge_coefficient` | - | Coefficient de passage, typiquement 0,55 à 0,70 |
| `floor_height` | m | Hauteur par rapport au sol / référence |
| `rain_exposure` | 0..1 | Exposition à la pluie selon façade / débord |
| `solar_shading_factor` | 0..1 | Masque solaire : volet, balcon, store, végétation |
| `solar_heat_gain_coefficient` | 0..1 | Facteur solaire du vitrage |

### 3.4 État des actionneurs et du bâtiment

| Variable | Rôle |
| --- | --- |
| `window_state` | ouverte / fermée / entrouverte |
| `shutter_position` | protection solaire et isolation |
| `door_state` | continuité de circulation d'air |
| `vmc_state` | extraction mécanique éventuelle |
| `extractor_state` | cuisine, salle d'eau, conduit technique |
| `fan_speed_signed` | brassage intérieur, assistance au flux |
| `other_windows_state` | ventilation traversante ou effet cheminée |
| `security_mode` | présence / absence / nuit |
| `season_mode` | été, hiver, mi-saison, automatique |
| `comfort_target_temperature` | consigne adaptative |
| `comfort_target_humidity_ratio` | cible hygrométrique |

---

## 4. Calculs psychrométriques

Les grandeurs psychrométriques doivent être calculées dans le noyau existant `psychrometrics.py` quand c'est possible, afin de conserver une convention unique entre le cockpit, les scores de confort et les futures stratégies.

Grandeurs minimales :

```text
absolute_humidity       g/m³
humidity_ratio          kg/kg ou g/kg air sec
enthalpy                kJ/kg air sec
dew_point               °C
vapor_pressure_deficit  kPa
```

Différences utiles :

```text
delta_temperature = temperature_indoor - temperature_outdoor
delta_absolute_humidity = absolute_humidity_indoor - absolute_humidity_outdoor
delta_humidity_ratio = humidity_ratio_indoor - humidity_ratio_outdoor
delta_enthalpy = enthalpy_indoor - enthalpy_outdoor
```

En été, `delta_enthalpy > 0` signifie que l'air extérieur contient moins d'énergie totale que l'air intérieur. C'est le signal principal de free-cooling.

En purge hydrique, `delta_absolute_humidity > 0` signifie que l'air extérieur contient moins de vapeur d'eau par m³ que l'air intérieur.

---

## 5. Direction probable du flux

La direction du flux est estimée à partir de la pression totale disponible sur la fenêtre :

```text
delta_pressure = delta_pressure_wind
               + delta_pressure_stack
               + delta_pressure_mechanical
```

### 5.1 Pression dynamique du vent

```text
delta_pressure_wind = 0.5 * rho_air * wind_speed² * cp_window
```

avec :

```text
cp_window ≈ cp_max * cos(wind_incidence_angle)
```

où :

```text
wind_incidence_angle = angle_between(wind_direction, window_azimuth_normal)
```

Interprétation simplifiée :

| Incidence vent / fenêtre | Effet probable |
| --- | --- |
| Vent face à la fenêtre | Surpression extérieure, insufflation |
| Vent parallèle | Débit faible ou instable |
| Vent depuis l'arrière / façade opposée | Dépression locale, extraction possible |

Le coefficient `cp_window` doit rester calibrable. Une valeur simplifiée suffit pour démarrer :

```text
cp_window = clamp(cos(angle), -0.5, +0.8)
```

### 5.2 Tirage thermique

Le tirage thermique est lié à la différence de température et à la hauteur entre entrées/sorties d'air :

```text
delta_pressure_stack ≈ rho_air * g * height_delta * (temperature_indoor - temperature_outdoor) / temperature_indoor_kelvin
```

En été, si l'intérieur est plus chaud que l'extérieur, le tirage favorise souvent l'extraction par les ouvertures hautes.

En hiver, si l'intérieur est nettement plus chaud, le tirage peut extraire de l'air chaud par les points hauts et faire entrer de l'air froid par les points bas.

### 5.3 Effets mécaniques

Les actionneurs peuvent imposer un signe :

```text
vmc/extracteur actif -> tendance à l'insufflation par les ouvertures disponibles
ventilateur d'extraction -> tendance extraction locale
ventilateur plafond -> modifie surtout le brassage, peu la pression nette
```

---

## 6. Estimation de débit

Débit volumique approximatif :

```text
q_window = discharge_coefficient
         * effective_open_area
         * sqrt(2 * abs(delta_pressure) / rho_air)
```

Score de débit borné :

```text
score_debit = tanh(q_window / q_reference)
```

avec par défaut :

```text
q_reference = room_air_volume / 900
```

Cette référence correspond à un renouvellement significatif de la pièce sur environ 15 minutes.

Interprétation :

| `score_debit` | Lecture opérationnelle |
| ---: | --- |
| 0.00 à 0.20 | Flux faible / incertain |
| 0.20 à 0.50 | Ventilation utile mais lente |
| 0.50 à 0.80 | Ventilation efficace |
| 0.80 à 1.00 | Ventilation forte |

---

## 7. Bénéfice climatique de l'air extérieur

### 7.1 Mode été / rafraîchissement

Le score climatique d'été privilégie l'enthalpie et l'humidité absolue :

```text
score_enthalpy = tanh(delta_enthalpy / 4.0)
score_temperature = tanh(delta_temperature / 3.0)
score_humidity = tanh(delta_absolute_humidity / 2.0)
```

Puis :

```text
score_air_summer = 0.45 * score_enthalpy
                 + 0.25 * score_temperature
                 + 0.20 * score_humidity
                 + 0.10 * score_vpd
```

Le score est favorable quand l'extérieur est plus frais, moins enthalpique ou plus sec.

### 7.2 Mode purge hydrique

La purge hydrique peut être favorable même si la température extérieure est légèrement supérieure, à condition que la masse de vapeur extérieure soit inférieure et que le risque solaire soit contrôlé.

```text
score_hydric_purge = 0.60 * tanh(delta_absolute_humidity / 2.0)
                   + 0.25 * tanh(delta_humidity_ratio / 1.5)
                   + 0.15 * score_air_quality
```

### 7.3 Mode hiver / qualité d'air

En hiver, l'ouverture de fenêtre est généralement un coût thermique. Elle devient pertinente pour la qualité d'air, l'humidité excessive ou la surchauffe solaire.

```text
score_iaq = max(
  normalize(co2_indoor, 800, 1400),
  normalize(voc_indoor, voc_low, voc_high),
  normalize(pm25_indoor, pm25_low, pm25_high)
)
```

```text
score_heat_loss = normalize(temperature_indoor - temperature_outdoor, 5, 20)
```

```text
score_air_winter = 0.50 * score_iaq
                 + 0.25 * score_hydric_purge
                 + 0.15 * score_overheating
                 - 0.20 * score_heat_loss
```

La décision peut alors recommander une ouverture courte et intense plutôt qu'une ouverture prolongée.

---

## 8. Solaire : distinguer fenêtre et volet

Le solaire ne doit pas seulement modifier le score d'ouverture. Il doit aussi produire une recommandation de protection solaire.

### 8.1 Incidence solaire sur la fenêtre

```text
solar_incidence = dot(window_normal_vector, sun_vector)
solar_incidence = max(0, solar_incidence)
```

Puissance solaire incidente :

```text
solar_power_window = solar_radiation_global
                   * solar_incidence
                   * window_glass_area
                   * solar_heat_gain_coefficient
                   * (1 - solar_shading_factor)
```

### 8.2 Interprétation bioclimatique

| Contexte | Soleil direct sur fenêtre | Recommandation |
| --- | --- | --- |
| Été / pièce chaude | Défavorable | Volet fermé ou protection maximale |
| Été / purge nocturne | Généralement faible | Fenêtre possible si air favorable |
| Hiver / pièce froide | Favorable | Volet ouvert, fenêtre fermée |
| Hiver / CO₂ élevé | Solaire peut compenser partiellement | Purge courte possible |
| Mi-saison | Arbitrage | Selon consigne adaptative |

Score solaire d'été :

```text
score_solar_penalty_summer = normalize(solar_power_window, 80, 400)
```

Score solaire d'hiver :

```text
score_solar_gain_winter = normalize(solar_power_window, 80, 400)
```

---

## 9. Contraintes et garde-fous

Les contraintes sont multiplicatives. Elles peuvent réduire l'indice à zéro même si l'air extérieur semble favorable.

```text
score_constraints = rain_factor
                  * gust_factor
                  * pollution_factor
                  * noise_factor
                  * security_factor
                  * condensation_factor
```

### 9.1 Pluie

```text
rain_factor = 1 - normalize(rain_rate * rain_exposure, 0.1, 2.0)
```

Si `rain_rate` est fort ou si la façade est très exposée, la fenêtre doit rester fermée.

### 9.2 Rafales

```text
gust_factor = 1 - normalize(wind_gust, gust_safe, gust_danger)
```

Exemple :

```text
gust_safe = 8 m/s
gust_danger = 15 m/s
```

### 9.3 Pollution extérieure

```text
pollution_factor = 1 - normalize(pm25_outdoor, 10, 35)
```

À adapter selon les normes locales et la sensibilité des occupants.

### 9.4 Condensation

Risque si l'air entrant peut amener une surface intérieure sous point de rosée ou si l'air intérieur humide rencontre une surface froide.

```text
condensation_factor = 0 si dew_point_indoor > min_surface_temperature - margin
```

Si aucune température de surface n'est disponible, utiliser une approximation prudente :

```text
min_surface_temperature ≈ min(temperature_indoor - 3, temperature_wall_estimate)
```

---

## 10. Formule finale

### 10.1 Sélection du mode

```text
mode = summer | winter | shoulder | hydric_purge | iaq_purge
```

Le mode peut être défini par saison, consigne, température extérieure, température intérieure, rayonnement et état d'occupation.

### 10.2 Score bénéfice air

```text
score_benefit = max(0, selected_air_score)
```

Le `max(0, ...)` évite qu'un air défavorable inverse artificiellement le sens du flux. Le sens du flux reste physique ; le bénéfice reste climatique.

### 10.3 Indice directionnel

```text
window_index = direction_flux
             * score_debit
             * score_benefit
             * score_constraints
```

Puis :

```text
window_index = clamp(window_index, -1, +1)
```

---

## 11. Lissage temporel et anti-oscillation

Un indice purement instantané peut être trompeur, notamment lors de creux courts d'humidité absolue ou de bascules de vent.

On calcule donc trois valeurs :

```text
index_now       : valeur instantanée
index_10min     : médiane ou moyenne glissante sur 10 minutes
index_forecast  : projection 30 à 60 minutes
```

Décision stabilisée :

```text
index_decision = 0.35 * index_now
               + 0.40 * index_10min
               + 0.25 * index_forecast
```

Hystérésis recommandée :

| Seuil | Action |
| ---: | --- |
| `abs(index_decision) < 0.10` | Ne rien changer |
| `0.10 à 0.35` | Suggestion faible / micro-ouverture |
| `0.35 à 0.65` | Ouverture partielle |
| `> 0.65` | Ouverture franche |

Durée minimale avant inversion de recommandation :

```text
minimum_hold_time = 5 à 10 minutes
```

---

## 12. Score de confiance

L'indice doit être accompagné d'une confiance séparée :

```text
confidence ∈ [0 ; 1]
```

La confiance dépend de :

| Facteur | Effet |
| --- | --- |
| Capteurs récents | augmente |
| Capteurs indisponibles | diminue |
| Vent stable | augmente |
| Vent faible ou variable | diminue |
| Pluie détectée clairement | augmente la confiance dans la fermeture |
| Écart enthalpique fort | augmente |
| Écart faible | diminue |
| Plusieurs fenêtres ouvertes inconnues | diminue |

Exemple :

```json
{
  "window_index": 0.62,
  "confidence": 0.78,
  "direction": "outdoor_to_indoor",
  "dominant_reason": "outdoor_air_lower_enthalpy",
  "recommended_action": "open_partial",
  "recommended_opening_ratio": 0.35,
  "review_after_minutes": 5
}
```

---

## 13. Contrat de sortie proposé

### 13.1 Objet Python

```python
@dataclass
class WindowOpeningAssessment:
    window_id: str
    room_id: str
    index_now: float
    index_10min: float | None
    index_forecast: float | None
    index_decision: float
    confidence: float
    direction: Literal["outdoor_to_indoor", "indoor_to_outdoor", "uncertain"]
    mode: Literal["summer", "winter", "shoulder", "hydric_purge", "iaq_purge"]
    score_debit: float
    score_benefit: float
    score_constraints: float
    solar_power_window: float | None
    recommended_action: Literal[
        "keep_closed",
        "open_micro",
        "open_partial",
        "open_wide",
        "use_as_exhaust",
        "close_shutter",
        "open_shutter"
    ]
    recommended_opening_ratio: float
    dominant_reason: str
    warnings: list[str]
```

### 13.2 Exemple JSON

```json
{
  "window_id": "living_south_east",
  "room_id": "living",
  "index_now": 0.58,
  "index_10min": 0.44,
  "index_forecast": 0.37,
  "index_decision": 0.46,
  "confidence": 0.74,
  "direction": "outdoor_to_indoor",
  "mode": "summer",
  "score_debit": 0.68,
  "score_benefit": 0.71,
  "score_constraints": 0.95,
  "solar_power_window": 42,
  "recommended_action": "open_partial",
  "recommended_opening_ratio": 0.35,
  "dominant_reason": "outdoor_air_lower_enthalpy_and_lower_absolute_humidity",
  "warnings": []
}
```

---

## 14. Intégration configuration YAML

Exemple de géométrie déclarative :

```yaml
windows:
  living_south_east:
    room: living
    azimuth_normal_deg: 128
    tilt_deg: 90
    width_m: 1.70
    height_m: 0.97
    opening:
      type: casement
      max_ratio: 0.60
      effective_area_factor: 0.45
      discharge_coefficient: 0.62
    position:
      floor_height_m: 4.8
      sill_height_m: 0.9
    rain:
      exposure_factor: 0.7
    solar:
      glass_area_m2: 1.45
      shgc: 0.55
      shading_factor_entity: sensor.living_south_east_shading_factor
      shutter_entity: cover.volet_living_south_east
    sensors:
      window_state: binary_sensor.living_south_east_window
```

---

## 15. Intégration Home Assistant

Entités recommandées par fenêtre :

```text
sensor.vesta_window_living_south_east_index
sensor.vesta_window_living_south_east_confidence
sensor.vesta_window_living_south_east_direction
sensor.vesta_window_living_south_east_recommended_action
sensor.vesta_window_living_south_east_recommended_opening_ratio
sensor.vesta_window_living_south_east_dominant_reason
```

Affichage cockpit :

```text
Fenêtre Living Sud-Est
Indice : +0.46
Confiance : 0.74
Action : ouvrir partiellement 35 %
Flux : extérieur -> intérieur
Cause : air extérieur moins enthalpique et plus sec
Réévaluation : 5 min
```

---

## 16. Calibration progressive

La performance réelle doit être améliorée par apprentissage local. Chaque ouverture peut produire un événement d'observation :

```json
{
  "event": "window_opening_trial",
  "window_id": "living_south_east",
  "opening_ratio": 0.35,
  "started_at": "2026-06-24T18:10:00+02:00",
  "duration_minutes": 20,
  "before": {
    "room_temperature": 29.8,
    "room_absolute_humidity": 16.4,
    "room_enthalpy": 61.2
  },
  "after": {
    "room_temperature": 29.1,
    "room_absolute_humidity": 15.7,
    "room_enthalpy": 59.4
  },
  "weather": {
    "wind_speed": 2.4,
    "wind_direction": 80,
    "solar_radiation": 120,
    "rain_rate": 0
  }
}
```

Gains observables :

```text
gain_temperature = temperature_before - temperature_after
gain_humidity = absolute_humidity_before - absolute_humidity_after
gain_enthalpy = enthalpy_before - enthalpy_after
```

Ces observations permettent de calibrer :

| Paramètre | Méthode |
| --- | --- |
| `discharge_coefficient` | comparaison débit estimé / effet réel |
| `effective_area_factor` | selon type d'ouvrant |
| `cp_window` | selon direction du vent |
| `thermal_mass_index` | vitesse de réponse de la pièce |
| `solar_shading_factor` | comparaison radiation / montée thermique |
| seuils d'action | réduction des faux positifs |

---

## 17. Stratégie produit

Cette fonctionnalité peut devenir une brique centrale du moteur bioclimatique :

```text
Indice fenêtre -> recommandation ouvrant -> action volet -> action ventilateur -> stratégie pièce -> stratégie maison
```

Elle peut être exploitée à trois niveaux :

1. **Assistant humain** : recommandation lisible dans le cockpit.
2. **Automatisation prudente** : action sur volets, ventilateurs, VMC, notifications.
3. **Pilotage avancé** : scénarios multi-fenêtres, purge nocturne, anti-surchauffe, optimisation IAQ/énergie.

Le niveau 1 doit être implémenté avant toute action automatique.

---

## 18. Limites connues

| Limite | Conséquence | Réponse proposée |
| --- | --- | --- |
| Fenêtre seule sans autre ouverture | Flux souvent bidirectionnel | Direction avec faible confiance |
| Vent urbain turbulent | Erreur sur pression façade | Calibration locale |
| Capteur extérieur mal placé | Mauvaise décision climatique | Capteur patio/toiture qualifié |
| Pluie latérale | Risque d'entrée d'eau | Facteur d'exposition façade |
| Rayonnement local absent | Solaire mal évalué | Modèle azimut/élévation + proxy UV |
| Absence de température de surface | Condensation mal prédite | Approximation prudente |
| Occupation inconnue | Action potentiellement gênante | Mode manuel / notification |

---

## 19. Première version implémentable

MVP recommandé :

1. Calculer `delta_enthalpy`, `delta_absolute_humidity`, `delta_temperature`.
2. Ajouter direction vent / normale fenêtre.
3. Calculer un `score_air_summer` et un `score_debit` simplifié.
4. Appliquer contraintes pluie + rafales + solaire été.
5. Produire `index_now`, `confidence`, `recommended_action`.
6. Afficher dans le cockpit sans automatisation directe.
7. Historiser les décisions et résultats pour calibration.

Formule MVP :

```text
score_air = 0.5 * tanh(delta_enthalpy / 4)
          + 0.3 * tanh(delta_absolute_humidity / 2)
          + 0.2 * tanh(delta_temperature / 3)
```

```text
wind_alignment = cos(angle_between(wind_direction, window_azimuth_normal))
direction_flux = sign(wind_alignment)
score_debit = tanh(wind_speed / 2.5) * abs(wind_alignment)
```

```text
index_now = direction_flux
          * score_debit
          * max(0, score_air)
          * rain_factor
          * gust_factor
          * solar_summer_factor
```

---

## 20. Résumé

L'indice directionnel d'ouverture de fenêtre formalise une intuition bioclimatique simple : une fenêtre doit être ouverte seulement si l'air extérieur, la force motrice du flux et le contexte du bâtiment rendent l'échange réellement utile.

La valeur `-1..+1` donne une lecture opérationnelle immédiate :

```text
-1 : utiliser la fenêtre comme extraction
 0 : garder fermé / isolé / protégé
+1 : utiliser la fenêtre comme insufflation
```

La valeur doit toujours être accompagnée d'une confiance, d'une cause dominante et d'une recommandation concrète.

Cette approche permet de passer d'un tableau de capteurs à un moteur décisionnel explicable, compatible avec la philosophie VESTA Bioclimatic : psychrométrie, sobriété, confort adaptatif, action locale et calibration par observation réelle.
