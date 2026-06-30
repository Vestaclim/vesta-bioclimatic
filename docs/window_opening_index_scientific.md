# Indice directionnel d'ouverture de fenêtre — approche mathématique et scientifique

## 1. Intention fonctionnelle

Cette fonctionnalité définit un indice directionnel d'ouverture de fenêtre :

```text
I_window ∈ [-1 ; +1]
```

avec la convention suivante :

| Valeur | Sens physique | Sens opérationnel |
| ---: | --- | --- |
| `+1` | Flux extérieur → intérieur fortement favorable | Utiliser la fenêtre comme entrée d'air |
| `0` | Ouverture non utile, incertaine ou défavorable | Garder fermé / isolé / volet adapté |
| `-1` | Flux intérieur → extérieur fortement favorable | Utiliser la fenêtre comme sortie d'air / extraction |

L'objectif n'est pas de prédire parfaitement un écoulement d'air complexe. L'objectif est de produire une décision robuste, explicable et calibrable :

```text
ouvrir quelle fenêtre,
dans quel sens probable,
à quel degré,
avec quelle confiance,
pour quel bénéfice mesurable.
```

Le score doit rester cohérent quand une information manque. Dans ce cas, l'indice devient plus conservateur et la confiance baisse. Si une information provient d'une source open data ou météo distante, elle est utilisable, mais moins fiable qu'une mesure locale.

---

## 2. Séparation fondamentale : indice et confiance

Le système doit produire deux sorties séparées :

```text
I_window   ∈ [-1 ; +1]  # recommandation directionnelle
K_window   ∈ [0 ; 1]    # confiance dans cette recommandation
```

Cette séparation est essentielle.

Un indice peut être favorable avec une confiance faible :

```text
I_window = +0.55
K_window = 0.32
```

Lecture :

```text
L'ouverture semble favorable, mais les données disponibles sont insuffisantes ou peu locales.
```

À l'inverse, une fermeture peut avoir une confiance élevée :

```text
I_window = 0.00
K_window = 0.91
```

Lecture :

```text
Il pleut fort ou l'air extérieur est clairement défavorable : la décision de fermeture est fiable.
```

---

## 3. Forme générale de l'indice

L'indice combine quatre blocs :

```text
I_window = S_direction
         × S_flow
         × S_benefit
         × S_constraints
```

avec :

| Terme | Domaine | Rôle |
| --- | ---: | --- |
| `S_direction` | `[-1 ; +1]` | Sens probable du flux |
| `S_flow` | `[0 ; 1]` | Intensité probable du débit |
| `S_benefit` | `[0 ; 1]` | Utilité climatique / sanitaire de l'échange |
| `S_constraints` | `[0 ; 1]` | Réduction par contraintes réelles |

Puis :

```text
I_window = clamp(I_window, -1, +1)
```

Cette structure évite une erreur classique : inverser le sens physique du flux parce que l'air est défavorable. Le sens du flux dépend des pressions. Le bénéfice dépend de la qualité thermodynamique et sanitaire de l'air échangé.

---

## 4. Données, provenance et confiance

Chaque variable utilisée par le modèle doit porter une provenance :

```text
measured_local      # capteur local proche et récent
measured_remote     # capteur local mais éloigné de la fenêtre ou de la pièce
derived_local       # grandeur calculée depuis des mesures locales
open_data_local     # météo/open data géographiquement proche
open_data_regional  # station météo éloignée ou modèle météo régional
estimated_static    # valeur géométrique ou coefficient renseigné manuellement
default_assumption  # valeur par défaut
missing             # donnée absente
```

### 4.1 Poids de confiance par provenance

Proposition de coefficient :

| Provenance | Coefficient `k_source` |
| --- | ---: |
| `measured_local` | `1.00` |
| `derived_local` | `0.90` |
| `measured_remote` | `0.75` |
| `open_data_local` | `0.65` |
| `open_data_regional` | `0.45` |
| `estimated_static` | `0.55` |
| `default_assumption` | `0.25` |
| `missing` | `0.00` |

Exemple :

```json
{
  "wind_direction": {
    "value": 240,
    "unit": "deg",
    "source": "open_data_local",
    "confidence": 0.65
  }
}
```

### 4.2 Fraîcheur temporelle

La confiance baisse si la donnée est ancienne :

```text
k_freshness = exp(- age_seconds / tau_seconds)
```

Valeurs recommandées :

| Variable | `tau_seconds` |
| --- | ---: |
| température / humidité intérieure | 900 |
| température / humidité extérieure | 600 |
| vent vitesse / direction | 300 |
| pluie | 180 |
| rayonnement solaire | 300 |
| CO₂ / COV | 600 |
| géométrie fenêtre | ∞ |

La confiance effective d'une donnée devient :

```text
k_data = k_source × k_freshness × k_quality
```

où `k_quality` peut intégrer la plausibilité physique, les ruptures de capteur ou les valeurs hors plage.

---

## 5. Gestion scientifique des données manquantes

Une donnée manquante ne doit pas rendre l'indice incohérent. Elle doit :

1. neutraliser ou simplifier la partie du modèle concernée ;
2. réduire la confiance ;
3. éviter de créer une fausse précision.

### 5.1 Exemple : direction du vent manquante

Si `wind_direction` manque mais `wind_speed` existe :

- le modèle peut utiliser la vitesse du vent pour estimer un potentiel de ventilation ;
- le modèle ne peut pas déterminer si la fenêtre est au vent ou sous le vent ;
- le signe directionnel doit donc provenir d'autres sources : tirage thermique, VMC, configuration multi-fenêtres ;
- si ces autres sources sont faibles, `S_direction` tend vers `0`.

Règle :

```text
if wind_direction is missing:
    S_wind_direction = 0
    K_direction *= 0.45 if wind_speed measured
    K_direction *= 0.25 if wind_speed also missing
```

Lecture :

```text
Le vent peut aider, mais son effet directionnel n'est pas fiable.
```

### 5.2 Exemple : vent open data

Si `wind_direction` vient d'une station météo ou d'un modèle open data :

```text
S_wind_direction = computed normally
K_direction *= 0.65  # open_data_local
```

La recommandation reste cohérente, mais la confiance est inférieure à une girouette locale. Elle reste supérieure au cas sans direction de vent.

### 5.3 Exemple : rayonnement solaire manquant

Si `solar_radiation_global` manque, mais azimut/élévation solaire sont calculables :

```text
solar_power_window = clear_sky_proxy × cloud_factor_proxy × incidence
```

Confiance :

```text
K_solar = 0.45 à 0.65 selon source météo nuages/UV
```

Si aucune donnée solaire ni météo n'est disponible :

```text
solar_penalty = conservative_seasonal_default
K_solar = 0.25
```

En été, l'hypothèse par défaut doit être prudente pour les façades exposées.

### 5.4 Exemple : pluie manquante

La pluie est une contrainte de sécurité opérationnelle. En absence de donnée :

```text
rain_factor = 0.80
K_constraints *= 0.60
```

Si pluie open data :

```text
rain_factor = computed
K_constraints *= 0.65
```

Si pluviomètre local :

```text
rain_factor = computed
K_constraints *= 1.00
```

---

## 6. Direction probable du flux

La direction du flux est estimée par la pression différentielle totale :

```text
ΔP_total = ΔP_wind + ΔP_stack + ΔP_mechanical + ΔP_cross
```

où :

| Terme | Origine |
| --- | --- |
| `ΔP_wind` | pression dynamique du vent sur la façade |
| `ΔP_stack` | tirage thermique / effet cheminée |
| `ΔP_mechanical` | VMC, extracteur, ventilation forcée |
| `ΔP_cross` | autres fenêtres ouvertes, ventilation traversante |

Le signe de `ΔP_total` définit la direction :

```text
S_direction = tanh(ΔP_total / P_ref)
```

avec :

```text
P_ref = 2 Pa
```

Pourquoi `tanh` ?

- elle borne naturellement le résultat entre `-1` et `+1` ;
- elle évite qu'un pic de vent donne une certitude excessive ;
- elle conserve une zone quasi linéaire autour de zéro.

---

## 7. Pression du vent

### 7.1 Formule de base

La pression dynamique du vent est :

```text
q_wind = 0.5 × ρ_air × V_wind²
```

avec :

| Symbole | Signification | Valeur typique |
| --- | --- | --- |
| `ρ_air` | densité de l'air | `1.2 kg/m³` |
| `V_wind` | vitesse du vent | `m/s` |

La pression sur la fenêtre dépend du coefficient de pression de façade :

```text
ΔP_wind = q_wind × Cp_window
```

### 7.2 Coefficient de pression simplifié

Pour une première version :

```text
θ = angular_difference(wind_from_direction, window_azimuth_normal)
Cp_window = clamp(cos(θ), -0.50, +0.80)
```

Interprétation :

| `θ` | Situation | `Cp_window` approximatif |
| ---: | --- | ---: |
| `0°` | vent face à la fenêtre | positif |
| `90°` | vent tangent | proche de zéro |
| `180°` | façade sous le vent | négatif |

En pratique, l'environnement urbain, les bâtiments voisins, les toitures, les arbres et les effets de coin modifient fortement `Cp_window`. Ce coefficient doit donc être calibrable.

### 7.3 Cas sans direction du vent

Si `wind_direction` est absente :

```text
Cp_window = 0
ΔP_wind_directional = 0
```

Mais on peut conserver un potentiel non directionnel :

```text
S_flow_wind_potential = tanh(V_wind / V_ref)
```

avec une confiance réduite.

---

## 8. Tirage thermique / effet cheminée

Le tirage thermique vient de la différence de densité entre air intérieur et extérieur.

Approximation :

```text
ΔP_stack = ρ_air × g × H_eff × (T_indoor - T_outdoor) / T_indoor_K
```

avec :

| Symbole | Signification |
| --- | --- |
| `g` | `9.81 m/s²` |
| `H_eff` | hauteur effective entre entrée/sortie ou fenêtre et plan neutre |
| `T_indoor_K` | température intérieure en Kelvin |

Signe :

```text
T_indoor > T_outdoor → air intérieur plus léger → tendance extraction haute
T_indoor < T_outdoor → air extérieur plus léger relativement → dynamique inversée ou faible
```

Si le bâtiment n'a qu'une seule fenêtre ouverte connue, le tirage seul est incertain :

```text
K_stack *= 0.50
```

Si plusieurs ouvertures sont connues et hiérarchisées en hauteur :

```text
K_stack *= 0.80 à 1.00
```

---

## 9. Débit probable

La loi d'orifice donne une estimation du débit :

```text
Q_window = Cd × A_eff × sqrt(2 × |ΔP_total| / ρ_air)
```

avec :

| Symbole | Signification | Valeur initiale |
| --- | --- | --- |
| `Cd` | coefficient de décharge | `0.60 à 0.65` |
| `A_eff` | surface effective d'ouverture | `surface × facteur ouvrant` |
| `ΔP_total` | pression différentielle totale | Pa |
| `ρ_air` | densité air | kg/m³ |

Score de débit :

```text
S_flow = tanh(Q_window / Q_ref)
```

Débit de référence :

```text
Q_ref = room_volume / τ_ref
```

avec :

```text
τ_ref = 900 s  # renouvellement significatif en 15 min
```

Ce choix donne un score proche de `0.76` quand le débit atteint environ un volume de pièce en 15 minutes :

```text
tanh(1) ≈ 0.76
```

Ce choix est volontairement opérationnel : il relie le score à une action perceptible à l'échelle d'une pièce.

---

## 10. Bénéfice climatique de l'air extérieur

Le bénéfice doit dépendre du mode bioclimatique.

### 10.1 Grandeurs fondamentales

On calcule :

```text
ΔT  = T_indoor - T_outdoor
ΔAH = AH_indoor - AH_outdoor
Δw  = w_indoor - w_outdoor
Δh  = h_indoor - h_outdoor
```

avec :

| Grandeur | Unité | Usage |
| --- | --- | --- |
| `ΔT` | °C | confort sensible |
| `ΔAH` | g/m³ | purge hydrique directe |
| `Δw` | g/kg air sec | psychrométrie normalisée |
| `Δh` | kJ/kg air sec | énergie totale de l'air humide |

En été :

```text
Δh > 0 → air extérieur moins énergétique → favorable
ΔAH > 0 → air extérieur plus sec → favorable
ΔT > 0 → air extérieur plus frais → favorable
```

### 10.2 Normalisation scientifique

On utilise `tanh(x / scale)`.

```text
N(x, scale) = tanh(x / scale)
```

Pourquoi ?

- `N(0) = 0` : pas d'écart, pas de bénéfice ;
- `N(scale) ≈ 0.76` : un écart physiquement significatif donne un score fort ;
- la fonction sature progressivement ;
- les valeurs extrêmes ne dominent pas tout le modèle.

Échelles proposées :

| Grandeur | Échelle | Justification opérationnelle |
| --- | ---: | --- |
| `Δh` | `4 kJ/kg` | écart net d'énergie humide perceptible |
| `ΔT` | `3 °C` | écart thermique sensible mais non extrême |
| `ΔAH` | `2 g/m³` | écart hydrique significatif en logement |
| `Δw` | `1.5 g/kg` | équivalent psychrométrique normalisé |

### 10.3 Score été / free-cooling

```text
S_h  = tanh(Δh  / 4.0)
S_T  = tanh(ΔT  / 3.0)
S_AH = tanh(ΔAH / 2.0)

S_benefit_summer_raw =
    0.50 × S_h
  + 0.25 × S_AH
  + 0.20 × S_T
  + 0.05 × S_air_quality
```

Pourquoi l'enthalpie pèse le plus ?

Parce qu'en été, la question principale est l'énergie totale amenée ou retirée par l'air. Un air légèrement plus frais mais beaucoup plus humide peut être défavorable. L'enthalpie capture mieux ce compromis que la température seule.

Pourquoi garder `ΔT` ?

Parce que le confort ressenti dépend aussi de la température sèche et de la température opérative. Une baisse de température d'air peut être utile même si le gain enthalpique est modéré.

Pourquoi garder `ΔAH` ?

Parce que dans une stratégie de purge hydrique domestique, la masse d'eau par m³ est très lisible et directement actionnable.

Puis :

```text
S_benefit_summer = clamp_positive(S_benefit_summer_raw)
```

avec :

```text
clamp_positive(x) = max(0, min(1, x))
```

Un air extérieur défavorable ne doit pas générer une recommandation inverse. Il doit ramener le bénéfice à zéro.

### 10.4 Score purge hydrique

```text
S_benefit_hydric_raw =
    0.65 × tanh(ΔAH / 2.0)
  + 0.25 × tanh(Δw  / 1.5)
  + 0.10 × S_air_quality
  - 0.20 × S_solar_penalty_summer
```

Ce mode peut être activé si :

```text
AH_indoor > AH_target_high
or
dew_point_indoor > dew_point_target
or
indoor_humidity_trend rising
```

La purge hydrique peut être autorisée même si `T_outdoor` est légèrement supérieure à `T_indoor`, à condition que :

```text
ΔAH > threshold
solar_penalty low
duration short
```

### 10.5 Score hiver / IAQ

En hiver, l'ouverture de fenêtre est principalement justifiée par la qualité d'air ou l'humidité excessive.

```text
S_CO2 = normalize(CO2_indoor, 800, 1400)
S_VOC = normalize(VOC_indoor, VOC_low, VOC_high)
S_PM  = normalize(PM25_indoor, 10, 35)

S_IAQ = max(S_CO2, S_VOC, S_PM)
```

Coût thermique :

```text
S_heat_loss = normalize(T_indoor - T_outdoor, 5, 20)
```

Bénéfice hiver :

```text
S_benefit_winter_raw =
    0.55 × S_IAQ
  + 0.25 × S_benefit_hydric
  + 0.15 × S_overheating
  - 0.25 × S_heat_loss
```

Puis :

```text
S_benefit_winter = clamp_positive(S_benefit_winter_raw)
```

Le modèle doit alors recommander plutôt :

```text
open_micro / open_short / purge_5_min
```

qu'une ouverture prolongée.

---

## 11. Solaire, orientation et protection

Le solaire doit influencer deux décisions distinctes :

1. **ouvrir ou fermer la fenêtre** ;
2. **ouvrir ou fermer le volet / store**.

### 11.1 Géométrie solaire

On définit le vecteur normal de la fenêtre :

```text
n_window = vector_from_azimuth_tilt(window_azimuth_normal, window_tilt)
```

et le vecteur solaire :

```text
s_sun = vector_from_solar_azimuth_elevation(solar_azimuth, solar_elevation)
```

Incidence :

```text
C_incidence = max(0, dot(n_window, s_sun))
```

Puissance solaire sur vitrage :

```text
P_solar_window =
    G_global
  × C_incidence
  × A_glass
  × SHGC
  × (1 - shading_factor)
```

avec :

| Terme | Signification |
| --- | --- |
| `G_global` | rayonnement global W/m² |
| `C_incidence` | alignement soleil / fenêtre |
| `A_glass` | surface vitrée |
| `SHGC` | facteur solaire du vitrage |
| `shading_factor` | effet volet, store, masque |

### 11.2 Pénalité été

```text
S_solar_penalty_summer = normalize(P_solar_window, 80, 400)
```

Puis :

```text
S_constraints *= (1 - α_solar × S_solar_penalty_summer)
```

avec :

```text
α_solar = 0.6 à 1.0 selon sensibilité pièce
```

En été, si le soleil frappe directement la fenêtre, la recommandation dominante peut devenir :

```text
keep_closed + close_shutter
```

même si l'air extérieur paraît légèrement favorable.

### 11.3 Gain hiver

En hiver, le solaire favorise surtout le volet ouvert, fenêtre fermée :

```text
S_shutter_open_winter = normalize(P_solar_window, 80, 300)
```

L'ouverture de fenêtre reste pilotée par IAQ, humidité ou surchauffe.

---

## 12. Contraintes opérationnelles

Les contraintes réduisent le score sans changer son sens physique.

```text
S_constraints =
    F_rain
  × F_gust
  × F_pollution
  × F_noise
  × F_security
  × F_condensation
```

### 12.1 Pluie

```text
F_rain = 1 - normalize(rain_rate × rain_exposure, 0.1, 2.0)
```

Si la pluie est manquante :

```text
F_rain = 0.80
K_rain = 0.60
```

Si pluie open data :

```text
K_rain = 0.65
```

Si pluviomètre local :

```text
K_rain = 1.00
```

### 12.2 Rafales

```text
F_gust = 1 - normalize(wind_gust, 8, 15)
```

Les seuils sont à calibrer selon les ouvrants.

### 12.3 Pollution extérieure

```text
F_pollution = 1 - normalize(PM25_outdoor, 10, 35)
```

Si `PM25_outdoor` est absent :

```text
F_pollution = 0.90
K_pollution = 0.40
```

Si une API qualité d'air locale est disponible :

```text
F_pollution = computed
K_pollution = 0.55 à 0.70
```

### 12.4 Condensation

Si température de surface mesurée :

```text
F_condensation = 0 if dew_point_air > surface_temperature - margin
```

Si non mesurée :

```text
surface_temperature_estimate = T_indoor - wall_cooling_margin
```

avec :

```text
wall_cooling_margin = 2 à 5 °C selon isolation / paroi
```

Confiance réduite :

```text
K_condensation = 0.45
```

---

## 13. Construction de la confiance globale

La confiance globale ne doit pas être une simple moyenne. Elle doit refléter les blocs critiques.

On calcule une confiance par bloc :

```text
K_direction
K_flow
K_benefit
K_constraints
K_context
```

Puis :

```text
K_window =
    K_direction^w_direction
  × K_flow^w_flow
  × K_benefit^w_benefit
  × K_constraints^w_constraints
  × K_context^w_context
```

Pondérations initiales :

| Bloc | Poids |
| --- | ---: |
| `K_direction` | `0.25` |
| `K_flow` | `0.20` |
| `K_benefit` | `0.30` |
| `K_constraints` | `0.20` |
| `K_context` | `0.05` |

Pourquoi une moyenne géométrique pondérée ?

- une donnée critique très faible doit faire baisser fortement la confiance ;
- une excellente mesure de température ne compense pas totalement une direction de vent inconnue ;
- les dimensions restent séparées et auditables.

Forme explicite :

```text
K_window = exp(
    0.25 × ln(K_direction)
  + 0.20 × ln(K_flow)
  + 0.30 × ln(K_benefit)
  + 0.20 × ln(K_constraints)
  + 0.05 × ln(K_context)
)
```

avec un plancher numérique :

```text
K_i = max(K_i, 0.05)
```

pour éviter `ln(0)`.

---

## 14. Cohérence du score en données incomplètes

### 14.1 Principe de neutralisation

Quand une donnée manque, le sous-score correspondant doit tendre vers une valeur neutre, et la confiance doit baisser.

| Type de donnée manquante | Effet sur indice | Effet sur confiance |
| --- | --- | --- |
| Température intérieure | indice très conservateur | forte baisse |
| Humidité intérieure | mode hydrique impossible | forte baisse bénéfice |
| Température extérieure | indice très conservateur | forte baisse |
| Humidité extérieure | pas de purge hydrique fiable | baisse bénéfice |
| Direction du vent | direction vent neutralisée | baisse direction |
| Vitesse du vent | débit vent neutralisé | baisse débit |
| Pluie | facteur prudent | baisse contrainte |
| Solaire | proxy ou pénalité saisonnière | baisse contexte |
| Géométrie fenêtre | surface et orientation par défaut | baisse débit / solaire |

### 14.2 Exemple formel : direction du vent absente

Cas mesuré complet :

```text
wind_speed measured_local      → k = 1.00
wind_direction measured_local  → k = 1.00
```

Cas open data :

```text
wind_speed open_data_local      → k = 0.65
wind_direction open_data_local  → k = 0.65
```

Cas direction absente :

```text
wind_speed measured_local      → k = 1.00
wind_direction missing         → k = 0.00
```

Alors :

```text
ΔP_wind_directional = 0
S_flow_wind_potential = tanh(wind_speed / V_ref)
K_direction reduced
```

L'indice peut encore s'appuyer sur :

```text
ΔP_stack
ΔP_mechanical
configuration_other_windows
```

Si ces termes sont faibles :

```text
S_direction ≈ 0
I_window ≈ 0
K_window faible à moyen
```

Résultat attendu :

```json
{
  "index_decision": 0.08,
  "confidence": 0.38,
  "direction": "uncertain",
  "dominant_reason": "wind_direction_missing",
  "recommended_action": "keep_closed_or_manual_check"
}
```

### 14.3 Exemple : vent open data

```json
{
  "wind_speed": {
    "value": 3.2,
    "source": "open_data_local",
    "confidence": 0.65
  },
  "wind_direction": {
    "value": 250,
    "source": "open_data_local",
    "confidence": 0.65
  }
}
```

Le modèle calcule normalement `ΔP_wind`, mais :

```text
K_direction ≤ 0.65
K_flow ≤ 0.65
```

Résultat possible :

```json
{
  "index_decision": 0.42,
  "confidence": 0.55,
  "direction": "outdoor_to_indoor",
  "dominant_reason": "outdoor_air_lower_enthalpy_open_data_wind",
  "recommended_action": "open_partial_with_monitoring"
}
```

Lecture :

```text
Action plausible, mais à surveiller. Une mesure locale renforcerait la décision.
```

---

## 15. Décision temporelle : instantané, tendance, prévision

L'indice instantané doit être complété par une stabilisation temporelle.

```text
I_now       = indice instantané
I_10min     = médiane ou moyenne pondérée sur 10 min
I_forecast  = projection 30 à 60 min
```

Score décisionnel :

```text
I_decision = 0.35 × I_now
           + 0.40 × I_10min
           + 0.25 × I_forecast
```

La pondération favorise la tendance récente, car elle filtre :

- bruit capteur ;
- pics courts d'humidité absolue ;
- oscillations de vent ;
- rayonnement ponctuel.

### 15.1 Hystérésis

```text
if abs(I_decision) < 0.10:
    action = keep_current_state
```

Seuils :

| `abs(I_decision)` | Action |
| ---: | --- |
| `< 0.10` | ne rien changer |
| `0.10 – 0.35` | suggestion faible |
| `0.35 – 0.65` | ouverture partielle |
| `> 0.65` | ouverture franche |

### 15.2 Durée minimale

```text
minimum_hold_time = 5 à 10 minutes
```

Une recommandation ne doit pas changer d'état à chaque fluctuation de capteur.

---

## 16. Recommandation d'action

L'indice est transformé en action selon signe, amplitude et confiance.

```text
if K_window < 0.30:
    action = manual_check_or_keep_closed
elif abs(I_decision) < 0.10:
    action = keep_closed_or_keep_current
elif I_decision > 0:
    action = open_as_intake
elif I_decision < 0:
    action = open_as_exhaust
```

Ratio d'ouverture :

```text
opening_ratio = clamp(
    abs(I_decision) × K_window × opening_gain,
    min_opening,
    max_opening
)
```

avec :

```text
opening_gain = 0.8
min_opening = 0.10
max_opening = 0.70
```

Exemple :

```text
I_decision = +0.60
K_window = 0.75

opening_ratio = 0.60 × 0.75 × 0.8 = 0.36
```

Recommandation :

```text
ouvrir à environ 35 %
```

---

## 17. Contrat de sortie recommandé

```python
@dataclass
class DataQuality:
    value: float | None
    unit: str
    source: Literal[
        "measured_local",
        "measured_remote",
        "derived_local",
        "open_data_local",
        "open_data_regional",
        "estimated_static",
        "default_assumption",
        "missing",
    ]
    confidence: float
    age_seconds: float | None
    quality_flags: list[str]

@dataclass
class WindowOpeningAssessment:
    window_id: str
    room_id: str

    index_now: float
    index_10min: float | None
    index_forecast: float | None
    index_decision: float

    confidence: float
    confidence_direction: float
    confidence_flow: float
    confidence_benefit: float
    confidence_constraints: float

    direction: Literal[
        "outdoor_to_indoor",
        "indoor_to_outdoor",
        "uncertain",
    ]

    mode: Literal[
        "summer",
        "winter",
        "shoulder",
        "hydric_purge",
        "iaq_purge",
    ]

    score_direction: float
    score_flow: float
    score_benefit: float
    score_constraints: float

    delta_pressure_total_pa: float | None
    estimated_flow_m3s: float | None
    delta_enthalpy_kjkg: float | None
    delta_absolute_humidity_gm3: float | None
    solar_power_window_w: float | None

    recommended_action: Literal[
        "keep_closed",
        "keep_current",
        "manual_check",
        "open_micro",
        "open_partial",
        "open_wide",
        "use_as_intake",
        "use_as_exhaust",
        "close_shutter",
        "open_shutter",
    ]

    recommended_opening_ratio: float
    review_after_minutes: int
    dominant_reason: str
    warnings: list[str]
    data_quality: dict[str, DataQuality]
```

---

## 18. Exemple de sortie avec vent open data

```json
{
  "window_id": "living_south_east",
  "room_id": "living",
  "index_now": 0.51,
  "index_10min": 0.43,
  "index_forecast": 0.38,
  "index_decision": 0.44,
  "confidence": 0.56,
  "confidence_direction": 0.58,
  "confidence_flow": 0.55,
  "confidence_benefit": 0.82,
  "confidence_constraints": 0.74,
  "direction": "outdoor_to_indoor",
  "mode": "summer",
  "score_direction": 0.71,
  "score_flow": 0.62,
  "score_benefit": 0.78,
  "score_constraints": 0.92,
  "delta_pressure_total_pa": 1.8,
  "estimated_flow_m3s": 0.042,
  "delta_enthalpy_kjkg": 4.6,
  "delta_absolute_humidity_gm3": 2.1,
  "solar_power_window_w": 35,
  "recommended_action": "open_partial",
  "recommended_opening_ratio": 0.20,
  "review_after_minutes": 5,
  "dominant_reason": "outdoor_air_lower_enthalpy_and_lower_absolute_humidity",
  "warnings": [
    "wind_direction_from_open_data_not_local_sensor"
  ],
  "data_quality": {
    "wind_direction": {
      "value": 250,
      "unit": "deg",
      "source": "open_data_local",
      "confidence": 0.65,
      "age_seconds": 420,
      "quality_flags": []
    }
  }
}
```

---

## 19. Exemple de sortie avec direction du vent manquante

```json
{
  "window_id": "living_south_east",
  "room_id": "living",
  "index_now": 0.12,
  "index_10min": 0.08,
  "index_forecast": null,
  "index_decision": 0.09,
  "confidence": 0.34,
  "confidence_direction": 0.22,
  "confidence_flow": 0.48,
  "confidence_benefit": 0.81,
  "confidence_constraints": 0.70,
  "direction": "uncertain",
  "mode": "summer",
  "score_direction": 0.18,
  "score_flow": 0.51,
  "score_benefit": 0.76,
  "score_constraints": 0.92,
  "delta_pressure_total_pa": null,
  "estimated_flow_m3s": null,
  "delta_enthalpy_kjkg": 4.4,
  "delta_absolute_humidity_gm3": 1.9,
  "solar_power_window_w": 40,
  "recommended_action": "manual_check",
  "recommended_opening_ratio": 0.00,
  "review_after_minutes": 5,
  "dominant_reason": "air_is_favorable_but_flow_direction_uncertain",
  "warnings": [
    "wind_direction_missing",
    "recommendation_not_automatable"
  ]
}
```

---

## 20. Exemple de configuration YAML avec provenance

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
      source: estimated_static

    position:
      floor_height_m: 4.8
      sill_height_m: 0.9
      source: estimated_static

    rain:
      exposure_factor: 0.7
      source: estimated_static

    solar:
      glass_area_m2: 1.45
      shgc: 0.55
      source: estimated_static
      shutter_entity: cover.volet_living_south_east

    sensors:
      window_state:
        entity_id: binary_sensor.living_south_east_window
        source: measured_local

      room_temperature:
        entity_id: sensor.climat_living_temperature
        source: measured_local

      room_humidity:
        entity_id: sensor.climat_living_humidite_relative
        source: measured_local

      outdoor_temperature:
        entity_id: sensor.patio_temperature
        source: measured_local

      outdoor_humidity:
        entity_id: sensor.patio_humidite
        source: measured_local

      wind_speed:
        entity_id: sensor.open_meteo_wind_speed
        source: open_data_local

      wind_direction:
        entity_id: sensor.open_meteo_wind_direction
        source: open_data_local

      rain_rate:
        entity_id: sensor.patio_rain_rate
        source: measured_local
```

---

## 21. MVP mathématique recommandé

Pour une première implémentation stable :

```text
ΔT  = T_indoor - T_outdoor
ΔAH = AH_indoor - AH_outdoor
Δh  = h_indoor - h_outdoor
```

```text
S_benefit =
    max(0,
        0.50 × tanh(Δh  / 4.0)
      + 0.30 × tanh(ΔAH / 2.0)
      + 0.20 × tanh(ΔT  / 3.0)
    )
```

Si vent directionnel disponible :

```text
θ = angular_difference(wind_from_direction, window_azimuth_normal)
Cp = clamp(cos(θ), -0.50, +0.80)
ΔP_wind = 0.5 × ρ × V² × Cp
```

Si direction du vent manquante :

```text
ΔP_wind = 0
K_direction *= 0.45 if wind_speed available else 0.25
```

Tirage :

```text
ΔP_stack = ρ × g × H_eff × (T_indoor - T_outdoor) / T_indoor_K
```

Direction :

```text
S_direction = tanh((ΔP_wind + ΔP_stack + ΔP_mechanical) / 2.0)
```

Débit :

```text
Q = Cd × A_eff × sqrt(2 × abs(ΔP_total) / ρ)
S_flow = tanh(Q / Q_ref)
```

Contraintes :

```text
S_constraints = F_rain × F_gust × F_pollution × F_solar × F_security
```

Indice :

```text
I_window = S_direction × S_flow × S_benefit × S_constraints
```

Confiance :

```text
K_window = geometric_weighted_mean(
  K_direction=0.25,
  K_flow=0.20,
  K_benefit=0.30,
  K_constraints=0.20,
  K_context=0.05
)
```

Décision :

```text
I_decision = 0.35 × I_now + 0.40 × I_10min + 0.25 × I_forecast
```

---

## 22. Justification scientifique synthétique

Cette approche s'appuie sur des principes physiques standards :

| Domaine | Principe utilisé |
| --- | --- |
| Psychrométrie | enthalpie, humidité absolue, point de rosée, VPD |
| Ventilation naturelle | pression dynamique du vent, coefficients de pression, loi d'orifice |
| Effet cheminée | différence de densité liée à température et hauteur |
| Confort adaptatif | température, humidité, vitesse d'air, rayonnement |
| Solaire | incidence entre vecteur solaire et normale de fenêtre |
| Décision robuste | lissage temporel, saturation `tanh`, confiance par provenance |

Le résultat attendu n'est pas une vérité absolue. C'est une recommandation explicable dont la qualité s'améliore par calibration locale.

---

## 23. Calibration par observation réelle

Chaque action proposée peut être évaluée après coup :

```text
gain_T  = T_before  - T_after
gain_AH = AH_before - AH_after
gain_h  = h_before  - h_after
```

On peut alors ajuster :

| Paramètre | Ce que l'observation permet de corriger |
| --- | --- |
| `Cp_window` | effet réel du vent selon direction |
| `Cd` | débit réel de l'ouvrant |
| `A_eff` | surface utile réelle |
| `thermal_mass_index` | vitesse de réponse de la pièce |
| `solar_shading_factor` | impact réel du volet / masque |
| `thresholds` | seuils d'action trop agressifs ou trop prudents |

La calibration doit être progressive, conservatrice et traçable.

---

## 24. Résumé exécutif

L'indice proposé ne doit pas être un simple feu vert / feu rouge météo. Il doit être un **indice directionnel de ventilation naturelle assistée par données**, combinant :

```text
physique du flux
+ psychrométrie
+ solaire
+ contraintes réelles
+ qualité des données
+ mémoire temporelle
```

La règle centrale est :

```text
une donnée absente ne casse pas l'indice ;
elle neutralise la contribution concernée et réduit la confiance.
```

La hiérarchie de confiance recommandée est :

```text
mesure locale > grandeur dérivée locale > mesure locale distante > open data locale > open data régionale > estimation statique > hypothèse par défaut > donnée manquante
```

Cette approche permet d'implémenter une première version utile immédiatement, tout en ouvrant la voie à un moteur bioclimatique calibré par observation réelle.
