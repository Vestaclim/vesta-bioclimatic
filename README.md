# VESTA Bioclimatic

Cockpit psychrométrique et moteur bioclimatique pour suivre le confort d'une habitation, recommander des actions (ventilation, purge, chauffage) et tracer les commandes d'actionneurs (ventilateurs plafond, VMC...).

Le projet est pensé pour fonctionner dans deux contextes :

- **Intégré à Home Assistant** : panel `panel_custom` + package YAML, branché sur vos capteurs et helpers existants.
- **Portable** : noyau Python autonome (Raspberry Pi, mini-PC, serveur local), sans dépendance Home Assistant, prêt pour MQTT/API/InfluxDB.

## Structure du dépôt

```
src/vesta_bioclimatic/   noyau Python portable (psychrométrie, Givoni, stratégie, runtime, CLI)
homeassistant/          adapter Home Assistant : panel JS, package YAML, installateur
config/                 contrats YAML (maison, système technique, ventilateurs, géométrie, mapping Influx)
docs/                   documentation scientifique et opérationnelle
dev/                    harnais de prévisualisation du panel sans Home Assistant
examples/               exemples de snapshot / valeurs
tests/                  tests unitaires (Python) + validation du panel JS
```

## 1. Installation dans Home Assistant

Le panel est un Web Component natif (`panel_custom`), sans framework. Il lit vos entités via `hass.states` et l'historique via le WebSocket `history/history_during_period`.

```bash
python3 homeassistant/install_to_config.py /chemin/vers/config_ha
# ou
./homeassistant/deploy_to_ha.sh /chemin/vers/config_ha
```

Ce script :

- copie `homeassistant/www/vesta-psychro/` (panel JS + Plotly) dans `<config>/www/vesta-psychro/` ;
- copie `homeassistant/packages/vesta_house_model.yaml` dans `<config>/packages/` ;
- ajoute (ou fusionne, sans écraser) les sections `panel_custom` et `packages` de `configuration.yaml`, avec une sauvegarde horodatée (`configuration.yaml.vesta-backup-<date>`).

Après installation : `ha core check`, puis recharger les helpers/templates ou redémarrer Home Assistant.

### Adapter le mapping à votre maison

Le panel attend des entity_id précis, déclarés dans la constante `CONFIG` en tête de [vesta-psychro-panel.js](homeassistant/www/vesta-psychro/vesta-psychro-panel.js) (capteurs `sensor.climat_<piece>_temperature`/`_humidite_relative`, ventilateurs `input_number.consigne_vitesse_ventilateur_<piece>_signee`, etc.). Adaptez cette liste à vos `entity_id` réels — la fenêtre **Source live / Système live** du panel permet aussi un mapping partiel à la volée.

`config/site_house.yaml` est l'équivalent déclaratif côté Python : il ne couvre aujourd'hui que 3 pièces d'exemple (Patio, Living, Chambre). Pour que le noyau Python (scores, CLI, futur connecteur) reflète toute la maison, complétez ce fichier avec vos pièces réelles, capteurs et actionneurs, en suivant le même `entity_id` que dans `CONFIG`.

## 2. Prévisualiser le panel sans Home Assistant (`dev/`)

Pour itérer sur le design/responsive sans redéployer dans Home Assistant à chaque modification, un harnais autonome simule l'objet `hass` (capteurs, historique 7 jours synthétique, services) :

```bash
python3 -m http.server 4173 --directory dev
# puis ouvrir http://localhost:4173/
```

`dev/index.html` charge `vesta-psychro-panel.js` via le lien symbolique `dev/local -> ../homeassistant/www` et injecte un `hass` factice couvrant toutes les entités déclarées dans `CONFIG` (température/humidité par pièce, modèle de ventilateur, qualité de l'air, pression). Utile pour :

- tester le rendu desktop/tablette/mobile (le panel a des points de rupture à 1040px et 720px) ;
- vérifier une modification de CSS/JS avant de la pousser sur Home Assistant ;
- préparer le portage vers une interface web portable (le même `vesta-psychro-panel.js` pourra être servi par un backend Python).

Après toute modification du JS, incrémenter le suffixe `?v=` du `<script src>` dans `dev/index.html` pour éviter le cache navigateur pendant les itérations.

## 3. Noyau Python portable

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[standalone]"

PYTHONPATH=src python3 -m vesta_bioclimatic.cli --help
```

> **`--site` attend un fichier YAML** (ex. `config/site_house.yaml`), pas un nom de site, et **`--values` un fichier JSON de mesures** clé `<espace>.<métrique>` (ex. [examples/latest_values.json](examples/latest_values.json)). Exemples :
>
> ```bash
> vesta-bioclimatic view     --site config/site_house.yaml --values examples/latest_values.json   # CockpitView JSON
> vesta-bioclimatic snapshot --site config/site_house.yaml --values examples/latest_values.json   # HouseSnapshot JSON
> vesta-bioclimatic assess   examples/sample_snapshot.json                                         # StrategyResult JSON
> ```

Modules de `src/vesta_bioclimatic/` :

| Module | Rôle |
| --- | --- |
| `psychrometrics.py` | humidité absolue, ratio d'humidité, enthalpie, point de rosée, bulbe humide |
| `givoni.py` | bandes de confort adaptatives ASHRAE/Givoni |
| `models.py` | contrats (`RoomSample`, `HouseSnapshot`, `CommandProposal`, `StrategyResult`) |
| `strategy.py` | évaluation des pièces, score opérationnel (100 - pénalités), propositions d'action |
| `runtime.py` | assemble config YAML + mesures en `CockpitView` JSON |
| `influx.py` | client InfluxDB v2 côté serveur (lecture seule), aide au mapping |
| `config_schema.py` | schéma des fichiers YAML maison/système/actionneurs |
| `cli.py` | sous-commandes : `assess`, `view`, `snapshot`, `serve`, `init-config`, `inspect-influx` |
| `server.py` | pont portable : sert le panel et expose le `CockpitView` en JSON (`serve`) |

Le Python ne dépend ni de Home Assistant ni du navigateur : aucun token n'y transite, tout reste côté serveur (voir `config/site_house.yaml`, champ `influx.token_env`).

### Pont « CockpitView → panel » (mode portable)

Le noyau Python ne dessine rien : il produit un `CockpitView` (JSON). La **visualisation** est le panel JS — le même qu'en Home Assistant. La sous-commande `serve` fait le pont : elle sert le panel **et** expose le `CockpitView`, et le panel se rend à partir de cette vue au lieu des entités Home Assistant.

```bash
vesta-bioclimatic serve --site config/site_house.yaml --values examples/latest_values.json
# puis ouvrir http://127.0.0.1:8770/
```

Routes servies par [server.py](src/vesta_bioclimatic/server.py) :

- `GET /` → [web/index.html](web/index.html), page hôte qui interroge l'API toutes les 5 s et alimente le panel via sa propriété `cockpit` ;
- `GET /api/cockpit` → `CockpitView` JSON (dernier rafraîchissement du service) ;
- `GET /api/stream` → flux **SSE** : un événement `cockpit` poussé à chaque rafraîchissement (live temps réel, sans rechargement). La page hôte préfère le SSE et retombe sur le polling de `/api/cockpit` s'il est indisponible ;
- `GET /api/history[?window=12h&series=living.temperature,living.humidity]` → séries d'historique normalisées `{ window, series: { "<espace>.<métrique>": [{ ts, value }] } }` ;
- `GET /api/health` → état du service (source live, fournisseur d'historique, dernier rafraîchissement) ;
- `GET /api/connectivity` → connectivité résolue (source live, backend d'historique, espaces avec catégorie, sans secret) ; `POST /api/connectivity` → reconfigure live/historique à chaud depuis le panneau ;
- `GET /api/browse[?path=…]` → liste dossiers + fichiers `.json` côté serveur, pour l'explorateur de fichiers du panneau ;
- `GET /api/mapping` → espaces/métriques courants (le « besoin ») ; `POST /api/mapping` → applique un overlay de mapping (catégories, étages/modules, liaisons capteurs) à chaud et le persiste ;
- `POST /api/influx-schema` → découvre mesures/champs/tags d'un bucket InfluxDB (le « référentiel »), pour l'éditeur de mapping ;
- `GET /static/…` et `GET /local/vesta-psychro/…` → assets du panel (JS + Plotly).

Un unique `CockpitService` ([server.py](src/vesta_bioclimatic/server.py)) possède le `MeasurementStore` normalisé : une boucle de fond tire les valeurs d'une `LiveSource`, les enregistre dans un `HistoryProvider` et reconstruit le `CockpitView`. Chaque backend (fichier, MQTT, InfluxDB…) se réduit à ces deux abstractions ([sources.py](src/vesta_bioclimatic/sources.py)) — `MemoryHistoryProvider` (tampon circulaire) est le repli universel sans dépendance. En mode portable le panel tire ses traînées de `/api/history`.

Backends sélectionnables :

- `--history auto|memory|influx` : source de l'historique (`auto` = Influx si un token est configuré, sinon mémoire) ;
- `--live auto|file|influx` : source des valeurs live (`auto` = Influx quand l'historique l'est, sinon le fichier `--values`).

Pont vers un InfluxDB local (lecture seule, token côté serveur uniquement) :

```bash
export VESTA_INFLUX_TOKEN=...   # jamais dans le navigateur
vesta-bioclimatic serve --site config/site_house.yaml --history influx --live influx
```

`InfluxLiveSource` lit la dernière valeur de chaque capteur mappé, `InfluxHistoryProvider` interroge des plages (`aggregateWindow`) résolues depuis le mapping `<espace>.<métrique>` → `SensorRef` du YAML ([influx.py](src/vesta_bioclimatic/influx.py)). Si le backend est injoignable, `/api/health` le signale et `/api/history` renvoie une série vide annotée d'une erreur (le panel ne casse pas).

Live via MQTT (push temps réel ; `paho-mqtt` est un extra optionnel) :

```bash
pip install -e ".[mqtt]"
vesta-bioclimatic serve --site config/site_house.yaml --live mqtt --history memory
```

Bloc `mqtt:` dans le YAML (`host`, `port`, `base_topic`, `username`, `password_env`, `tls`). Deux formats de message sont normalisés sous `<base_topic>` ([mqtt.py](src/vesta_bioclimatic/mqtt.py)) :

- par métrique : topic `<base>/<espace>/<métrique>`, charge utile numérique → `{<espace>.<métrique>: valeur}` ;
- état groupé : topic `<base>/<espace>/state`, charge utile JSON `{ "temperature": 21.5, "humidity": 60 }`.

`connect_async` : un broker absent au démarrage ne bloque pas le serveur (reconnexion en arrière-plan). On peut combiner `--live mqtt` (live) avec `--history influx` (historique long) — chaque côté reste un adaptateur indépendant.

En mode portable, le panel affiche **le score opérationnel Python** (champ `score` de chaque point, et `global_score` dans l'en-tête) ; il désactive les chemins propres à Home Assistant (registre d'entités, WebSocket d'historique, commandes ventilateur). Côté JS, l'entrée est la propriété `cockpit` du composant (`set cockpit(view)`), pendante de `set hass(...)`. C'est la première étape concrète du §5 (unifier le score Python/JS) et du §7 (panel servi hors Home Assistant).

## 4. Configuration (`config/`)

| Fichier | Contenu |
| --- | --- |
| `site_house.yaml` | habitation : groupes/étages, pièces, capteurs, actionneurs |
| `site_system.yaml` | système technique : modules, échangeur, condenseur, extracteur |
| `fan_airflow.yaml` | tables ventilateurs (débit, RPM, convention de vitesse signée) |
| `house_geometry.yaml` | géométrie des pièces, volumes, zones d'occupation |
| `influx_mapping.yaml` | convention de tags pour le mapping InfluxDB |
| `actuators.yaml` | vocabulaire des actionneurs (ventilateur, VMC, chauffage, humidificateur) |

## 5. Score des pièces — comprendre la note de confort

Chaque pièce reçoit une **note de 0 à 100**. L'idée est simple : **plus l'air de la pièce est proche de l'air « idéal », plus la note est haute.** Cette section explique d'où vient ce chiffre, pourquoi il est calculé ainsi, et pourquoi l'humidité y pèse plus lourd que la température. Elle se lit aussi bien en diagonale (les exemples) qu'en détail (la physique).

### 5.1 L'idée de base : une distance à la cible

Le panel calcule en permanence une **cible de confort** : le centre de gravité de la zone de confort de Givoni, affiché dans la box du graphique sous la forme `◎ Cible 24,0 °C · 9,5 g/kg · HR 50 %`. C'est le point « parfait » du moment, exprimé en température sèche, en **humidité absolue** (grammes d'eau par kg d'air sec) et en humidité relative à la pression mesurée.

Le score mesure **la distance entre la pièce et cette cible**. Sur la cible exactement, la distance est nulle et **la note vaut 100/100**. Plus on s'en éloigne, plus la note descend.

### 5.2 La formule

```
ΔT = T_pièce − T_cible        (écart de température, en °C)
ΔW = W_pièce − W_cible        (écart d'humidité absolue, en g/kg)

distance = √( ΔT² + (3·ΔW)² )
score    = 100 − 12,5 × distance        (borné entre 0 et 100)
```

Deux choses sautent aux yeux :

- chaque **unité de distance coûte 12,5 points** (au-delà de 8 unités, la note tombe à 0) ;
- l'écart d'humidité est **multiplié par 3** avant d'être comparé à l'écart de température. C'est le cœur du sujet, expliqué en 5.4.

### 5.3 Des repères concrets

| Écart par rapport à la cible | Distance | Note |
| --- | --- | --- |
| Pile sur la cible | 0 | **100** |
| +1 °C (humidité idéale) | 1 | 87,5 |
| +2 °C | 2 | 75 |
| +1 g/kg d'humidité (température idéale) | 3 | 62,5 |
| +2 g/kg d'humidité | 6 | 25 |

Lecture : **dériver d'1 g/kg d'humidité absolue pénalise autant que dériver de 3 °C.** L'humidité est donc, dans ce score, trois fois plus « chère » que la température.

### 5.4 Pourquoi l'humidité pèse 3× la température

Ce facteur n'est **pas un curseur subjectif** : il découle de la physique de l'air humide et de la physiologie humaine, qui pointent toutes deux vers la **même constante** — la chaleur latente de vaporisation de l'eau. Trois fondements convergents.

**a) Fondement thermodynamique — l'enthalpie (≈ ×2,5).**
L'enthalpie de l'air humide (son contenu total en énergie) s'écrit `h = 1,006·T + W/1000·(2501 + 1,86·T)` (W en g/kg). En dérivant, on mesure ce que « coûte » en énergie chaque axe :

- par degré : `∂h/∂T ≈ 1,02 kJ/kg/°C` ;
- par gramme d'eau : `∂h/∂W ≈ 2,5 kJ/kg/(g/kg)`.

Le rapport est **≈ 2,5** : ajouter 1 g d'eau par kg d'air sec apporte environ **2,5 fois plus d'énergie** que chauffer l'air de 1 °C. C'est tout le poids de la **chaleur latente de vaporisation** (~2501 kJ/kg) : déplacer de l'humidité, c'est déplacer beaucoup d'énergie « cachée ». La distance `√(ΔT² + (3·ΔW)²)` approxime donc un **écart d'enthalpie** ; ses isolignes de score sont des ellipses allongées sur l'axe température (on tolère plus de dérive en °C qu'en g/kg pour la même note). C'est aussi pourquoi le score s'appuie sur l'**humidité absolue** (g/kg) et non l'humidité relative : c'est la grandeur qui porte l'enthalpie et la charge latente.

**b) Fondement physiologique — la même chaleur latente, côté corps.**
Ce n'est pas une seconde justification ajoutée à la première : c'est **exactement la même physique**. Le corps évacue sa chaleur principalement en **évaporant de la sueur**, et cette évaporation est gouvernée par la **même chaleur latente de l'eau** (~2,4 kJ/g) que le terme latent de l'enthalpie de l'air. Quand l'humidité absolue ambiante monte, le gradient qui permet à la sueur de s'évaporer s'effondre → le refroidissement physiologique chute. Les indices de ressenti le confirment quantitativement : en conditions chaudes, l'humidité contribue à la **température apparente** (heat index, humidex) autant ou davantage que le terme sensible. La grandeur qui « charge » l'air est donc aussi celle qui « décharge » le corps — d'où un poids physiologique au moins égal au rapport énergétique. S'y ajoutent les effets de **santé du bâtiment** : au-delà de ~60–70 % d'HR, moisissures, acariens et condensation ; sous ~30 %, inconfort respiratoire.

**c) Conséquence pratique — la dissymétrie de correction.**
La température se corrige **vite et à faible coût** (chauffage, free cooling, ventilation traversante). L'humidité absolue est **lente et coûteuse** à changer (déshumidification, grosse charge latente, ou attente d'un air extérieur favorable). Une dérive hygrique est donc, concrètement, une déviation **plus difficile à rattraper** : la pondérer fortement n'est pas une sévérité gratuite, c'est refléter le coût réel de retour à la cible.

> **En résumé** : la thermodynamique fixe le plancher (~2,5, par la chaleur latente), la physiologie de la thermorégulation — régie par cette **même** chaleur latente — confirme et resserre ce poids, et la dissymétrie de correction le valide en pratique. Le **3** se situe exactement à ce point de convergence : c'est une valeur **physiquement et physiologiquement fondée**, pas un arbitrage de conception.

### 5.5 Le plafond hors zone de confort

Si la pièce sort du **polygone de Givoni** (frontière du confort réellement vivable), le score est **plafonné** (max 64, et réduit de ~28 %). Objectif : qu'un point ayant franchi une frontière — par exemple proche du centre en projection mais hors de la zone — ne puisse **jamais** afficher une note excellente. La frontière compte autant que la distance.

### 5.6 Deux indicateurs, un seul à terme

- **Score visuel (JS)** — celui décrit ci-dessus : une distance psychrométrique pondérée, immédiate et lisible sur le graphique.
- **Score opérationnel (Python)** — part de 100 et applique des **pénalités** explicites (température hors cible, humidité relative hors bande, CO₂/COV au-delà de seuils doux puis durs).

Objectif (voir [docs/scoring-and-givoni.md](docs/scoring-and-givoni.md)) : exposer le score Python dans `CockpitView` et l'afficher dans le panel, le score géométrique restant un **indicateur graphique secondaire**, pour éviter deux sources de vérité.

## 6. Méthode Givoni et référence extérieure 7 jours (Tpma)

La zone de confort adaptative utilise une température extérieure prévalente (Tpma) : moyenne de 7 tranches glissantes de 24h, pondérées exponentiellement (`alpha = 0.8`, la plus récente pèse le plus). Si le panel affiche un repli instantané :

- vérifier que `recorder.purge_keep_days >= 7` ;
- vérifier que les capteurs extérieurs ne sont pas exclus du Recorder ;
- surveiller la console navigateur (timeout/échec du WebSocket `history/history_during_period`).

En mode portable, ce calcul migrera côté serveur (API historique/InfluxDB), supprimant cette dépendance au Recorder HA.

## 7. Mode portable (Raspberry Pi) — état et roadmap

| Brique | État |
| --- | --- |
| Noyau Python (psychrométrie, stratégie, scores, CLI) | ✅ fonctionnel, testé |
| Lecture InfluxDB v2 côté serveur | ✅ fonctionnel (`influx.py`) |
| Connecteur MQTT (valeurs live) | ✅ `MqttLiveSource` (extra `mqtt`), normalisation des topics (§3) |
| API historique (séries longues) | ✅ `GET /api/history` + `InfluxHistoryProvider` / `MemoryHistoryProvider` (§3) |
| Live temps réel vers le panel | ✅ `GET /api/stream` (SSE), repli polling (§3) |
| Panel JS servi hors Home Assistant | ✅ `serve` : live + historique + panneau de connectivité à onglets |

### Parité Home Assistant / portable

Les deux modes rendent **le même panel** sur **le même contrat** :

| | Mode Home Assistant | Mode portable (`serve`) |
| --- | --- | --- |
| Live | `hass.states` (WebSocket HA) | `GET /api/stream` (SSE) → propriété `cockpit` |
| Historique | `history/history_during_period` (Recorder) | `GET /api/history` (Influx / mémoire) |
| Données | entités HA → modèle interne | `CockpitView` + séries `<espace>.<métrique>` |
| Secrets | dans Home Assistant | côté serveur uniquement |

Le transport diffère, la forme des données non : `CockpitView` et les séries d'historique sont identiques. Le panneau « Connectivité » (icône d'état du bandeau) reflète le transport réel dans chaque mode.

### Configurer la source depuis l'interface (mode portable)

Le panneau permet de configurer la source **sans CLI ni YAML**, **live et historique choisis séparément**, sous forme de **profils enregistrés** (un seul actif à la fois par côté) :

- **Onglet Live** — un encadré « API de ce hub » affiche l'URL **Live (SSE)** (`GET /api/stream`, à copier dans un autre hub comme « Système Vesta distant »). En dessous, la liste des **profils live enregistrés** (carte avec résumé, boutons *Activer*/*Modifier*/*Supprimer*) ; le formulaire (*Nouveau profil* / *Enregistrer le profil*) propose : Fichier JSON · MQTT (push) · **Basé sur l'historique récent** · **Système Vesta distant (API)**.
- **Onglet Historique** — même principe : encadré « API de ce hub » avec l'URL **Historique** (`GET /api/history`), liste des **profils d'historique enregistrés**, formulaire : Mémoire · InfluxDB · Fichier d'historique JSON · **Système Vesta distant (API)**.
- **Onglet Mapping** — **éditeur interactif** (inchangé) : *Découvrir le schéma InfluxDB*, cartes d'espaces éditables, *Appliquer le mapping*/*Export YAML*. Un bouton **Importer un système Vesta distant** (`POST /api/remote-mapping`, URL du nœud distant) ajoute les espaces déjà normalisés de ce nœud à l'éditeur, sans remapping.

**Fédération (systèmes "miroir")** : le choix « Système Vesta distant (API) », côté Live ou Historique, connecte ce hub aux séries déjà normalisées (`<espace>.<métrique>`) d'un **autre nœud Vesta** (`VestaRemoteLiveSource` → `GET /api/values`, `VestaRemoteHistoryProvider` → `GET /api/history`) — utile pour agréger, depuis une seule interface, les données d'un second système (autre logement, autre Raspberry Pi, ou un noyau lancé sur un Mac) en plus de la source locale.

**Profils multiples** : chaque côté (Live / Historique) garde une **liste persistante** de profils nommés ; *Enregistrer le profil* ajoute/modifie un profil sans l'activer, *Activer* le rend actif (le hub **permute à chaud** `LiveSource`/`HistoryProvider` via `CockpitService.reconfigure`), *Supprimer* le retire (double-clic de confirmation). Un seul profil actif par côté.

**Pastille d'état** : **orange « Mode portable (données fixes) »** quand le live actif est un fichier JSON et l'historique actif est mémoire/fichier (rien de connecté) ; **verte « Connecté »** dès qu'une source live/historique distante, MQTT ou InfluxDB est active ; **rouge « Hub en erreur »** si `/api/health` signale une erreur (priorité sur les deux autres états).

Les chemins de fichiers (valeurs live, fichier d'historique) se choisissent via un **explorateur de fichiers côté serveur** (`GET /api/browse`). En mode Home Assistant, les formulaires sont masqués : la source se configure dans Home Assistant.

**Persistance** : l'ensemble des profils et le profil actif de chaque côté sont enregistrés dans un fichier d'état (`--state-file`, défaut `.vesta_connectivity.json` à côté de `--site`, permissions `0600`) et **réappliqués au démarrage**. `--no-state` ignore/désactive l'enregistrement. Ce fichier **peut contenir les secrets** (token InfluxDB, mot de passe MQTT) : il est en `0600`, hors dépôt (`.gitignore`), et ne doit pas être exposé. Les secrets ne sont jamais renvoyés par `/api/connectivity` (`has_password`/`has_token` à la place).

> Le `POST` reconfigure le serveur en cours : garder le binding sur `127.0.0.1` (défaut) tant qu'aucune authentification n'est ajoutée pour une exposition LAN.

## Tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
node --check homeassistant/www/vesta-psychro/vesta-psychro-panel.js
```

## Suivi des évolutions de cette session

- **Corrigé** : débordement horizontal des boutons "Cadrage" (Auto/Pièce/Confort/Complet/Manuel) entre 720px et 1040px de largeur — le groupe ne passait pas à la ligne et le dernier bouton ("Manuel") était coupé. Le cluster passe désormais sur deux lignes dans cette plage.
- **Corrigé** : la référence extérieure Tpma (7 jours pondérés) retombait systématiquement sur le repli instantané. `weightedOutdoorComfortBasis` appliquait `Number(point.ts)` à un timestamp ISO (chaîne), ce qui renvoyait `NaN` et vidait tous les buckets journaliers. Remplacé par `new Date(point.ts).getTime()`. Déployé sur le Home Assistant live (`vesta-psychro-panel-v202606130006`).
- **Corrigé** : deux pièces de l'étage 2 étaient invisibles dans le panel car `CONFIG` référençait des entités qui n'existent plus côté Home Assistant (`sensor.climat_bureau_*`, `sensor.climat_chambre_2_*`). Les capteurs réels avaient été renommés en `sensor.climat_bureau_sacha_*` et `sensor.climat_chambre_juliana_*` (y compris tout le modèle ventilateur/commande de "Bureau"). `CONFIG` mis à jour (id/areaId/entités) pour "Bureau (Sacha)" et "Chambre Juliana". Déployé sur le Home Assistant live (`vesta-psychro-panel-v202606130007`).
- **Ajouté** : harnais de développement (`dev/`) pour prévisualiser et tester le panel sans Home Assistant — base réutilisable pour le mode portable.
- **Ajouté (pont CockpitView → panel)** : sous-commande `vesta-bioclimatic serve` ([server.py](src/vesta_bioclimatic/server.py)) qui sert le panel et expose `GET /api/cockpit` (reconstruit à chaque requête depuis le YAML + le fichier de valeurs). Côté panel, nouvelle propriété `cockpit` (`set cockpit(view)`, pendante de `set hass`) : en mode portable le composant se rend à partir du `CockpitView` (points, étages via `group_labels`, pression) et **affiche le score opérationnel Python** par pièce et en global (helper `displayScore`, en-tête aligné), les chemins propres à Home Assistant (registre, historique WS, commandes ventilateur) étant désactivés. Page hôte [web/index.html](web/index.html) qui rafraîchit toutes les 5 s. Vérifié de bout en bout (serveur → API → panel) ; `CockpitView` enrichi d'un champ `group_labels` (additif). Première brique concrète du §5 (score unifié) et du §7 (panel hors HA). Panel déployé sur le Home Assistant live (`vesta-psychro-panel-v202606130012`).
- **Vérifié + fiabilisé (commande ventilateurs)** : audit complet de la chaîne de commande sur le Home Assistant live (entités `input_number.consigne_*`, scripts `regler_ventilateur_*` / `vesta_register_fan_command_intent`, automations d'application et helpers de suivi) — tout est présent, activé et sans erreur côté serveur (les deux ventilateurs répondent). Le risque réel était côté panel : `flushFanCommand` enchaînait `input_number.set_value` **après** le script de journalisation d'intention ; si cet appel de script était rejeté (ce que le frontend HA fait quand le script échoue en interne), la vraie commande n'était jamais envoyée. Découplé : la commande `set_value` part désormais systématiquement, la journalisation d'intention devient best-effort et ne peut plus bloquer la commande.
- **Ajouté** : unité explicite `kJ/kg` sur la valeur d'enthalpie de l'air humide.
- **Modifié (traînées)** : suppression des gros marqueurs translucides de survol de zone (les « pastilles » floues multicolores posées sur les bordures/angles des zones de Givoni — peu lisibles) ; les info-bulles de zone restent disponibles via l'overlay de survol. Restauration de la **trajectoire du centre de la zone de confort** (dérive de la zone de Givoni), désormais bornée à la **période de traces historiques sélectionnée** (ex. 12 h) au lieu des 7 jours pleins.
- **Ajouté (survol)** : un réticule en pointillés fins suit le curseur et pointe les deux axes ; partout sur le diagramme (hors zone/point), une info-bulle minimale affiche la température sèche, l'humidité absolue et l'humidité relative correspondant au point visé.
- **Corrigé (français)** : passe d'accentuation et de ponctuation sur l'ensemble des libellés, info-bulles, noms de zones, étiquettes de score et messages (tooltips Plotly, cartes de pièces, états ventilateur, base de confort Tpma…). _(Ensemble déployé sur le Home Assistant live, `vesta-psychro-panel-v202606130010`.)_
- **Ajouté (cible de confort)** : pastille discrète « ◎ Cible T · HA · HR » dans la box du graphique, donnant le centre de gravité de la zone de confort de Givoni à la pression mesurée (température sèche, humidité absolue, humidité relative). Au survol (et sur le badge « Score » du bandeau), une info-bulle explique le calcul du score : une pièce exactement sur ce point vaut 100/100 ; le score baisse de 12,5 points par unité de distance pondérée √(ΔT² + (3·ΔHA)²), l'humidité absolue pesant 3× la température, avec plafonnement hors zone de confort. Déployé sur le Home Assistant live (`vesta-psychro-panel-v202606130011`).
- **Ajouté** : la zone de confort Givoni est désormais subdivisée en 4 anneaux ISO emboîtés (4/4 au centre, le plus confortable, jusqu'à 1/4 sur la bordure du polygone, à risque de sortie de zone). Chaque pièce en confort affiche son anneau (ex. "confort 3/4") dans son sous-titre et sa carte. Un disque "résilience" (zone proche du centre, anneau 4/4) est tracé sous forme de halo flou translucide à la place de l'ancienne traînée "dérive zone confort" (peu lisible et retirée). Au survol du score d'une pièce ou de son point sur le graphique, une infobulle détaille le calcul pondéré du score (écarts température/humidité, poids x1/x3, anneau ISO, résilience). Déployé sur le Home Assistant live (`vesta-psychro-panel-v202606130008`).
- **Corrigé/Ajouté** : le disque de résilience est désormais un unique halo translucide (au lieu de 3 calques superposés). Les marqueurs invisibles de survol de zone (`Zone de confort adaptatif` / `Ventilation naturelle` / `Ventilation nocturne`, ~500 cercles de taille 18px à opacité 0.01) créaient des "traînées" floues colorées visibles sur les bordures de zone (visibles dans l'inspecteur HTML comme de nombreux `path.point`) : opacité passée à 0, le survol/tooltip de zone reste fonctionnel. À la sélection d'une pièce, deux lignes de repère fines et pointillées (verticale + horizontale) traversent tout le graphique au niveau du point sélectionné pour faciliter la comparaison visuelle avec les autres pièces. Corrigé un bug qui rendait le graphique systématiquement en mode "compact" (sélecteur `chart-wrap` invalide) : sur desktop, les marges/polices passent désormais en mode complet, ce qui place correctement les valeurs de l'axe d'humidité absolue à l'extérieur de la zone graphique, à quelques pixels de l'axe (comme pour l'axe de température). Déployé sur le Home Assistant live (`vesta-psychro-panel-v202606130009`).
- **Ajouté (hub de connectivité — MQTT live + API historique)** : un unique `CockpitService` ([server.py](src/vesta_bioclimatic/server.py)) normalise n'importe quelle terminaison en clés `<espace>.<métrique>` via deux abstractions ([sources.py](src/vesta_bioclimatic/sources.py)) : `LiveSource` (fichier, `InfluxLiveSource`, `MqttLiveSource`) et `HistoryProvider` (`MemoryHistoryProvider` sans dépendance, `InfluxHistoryProvider`). Nouvelles routes `GET /api/history` (séries normalisées), `GET /api/stream` (live SSE), `GET /api/health` et `GET /api/connectivity`. `influx.py` gagne les requêtes de plage (`aggregateWindow`) ; `mqtt.py` ajoute la normalisation des topics (`paho-mqtt` en extra optionnel). Sélection par drapeaux `--history auto|memory|influx` et `--live auto|file|influx|mqtt`. Côté panel : traînées portables tirées de `/api/history`, live via SSE (repli polling), et le modal « Sources de données » devient un **panneau de connectivité à 3 onglets** (Live / Historique / Avancé) avec état réel, boutons de test et contrat YAML. Robustesse : une source ou un backend injoignable n'interrompt pas le service (`/api/health` signale l'erreur, le panel ne casse pas). 23 nouveaux tests. Déployé sur le Home Assistant live (`vesta-psychro-panel-v202606150014`).
- **Ajouté (configuration de la source depuis l'interface)** : l'onglet **Live** du panneau de connectivité devient un formulaire — menu *Source de données* (Fichier / InfluxDB / MQTT+InfluxDB / MQTT+mémoire), champs conditionnels (URL/org/bucket/token InfluxDB, hôte/port/topic/identifiants MQTT) et bouton **Appliquer la connexion**. `POST /api/connectivity` reconstruit `LiveSource` + `HistoryProvider` depuis la requête et les permute **à chaud** sur le service en cours (`CockpitService.reconfigure`) ; le panel reflète la nouvelle source immédiatement. Secrets transmis au serveur mais **jamais réaffichés** (champs write-only, gardés en mémoire). Masqué en mode Home Assistant (la source s'y configure dans HA). 5 nouveaux tests (factory `build_sources_from_spec` + `reconfigure`). Vérifié de bout en bout : changement de source fichier depuis l'UI → le hub bascule et la pièce passe de 25,8 à 21,5 °C. Déployé sur le Home Assistant live (`vesta-psychro-panel-v202606150015`).
- **Amélioré (panneau de connectivité v2)** : Live et Historique deviennent des choix **indépendants** dans leurs onglets respectifs — *Source live* (Fichier / MQTT / **basé sur l'historique récent**) et *Source d'historique* (Mémoire / InfluxDB / Fichier d'historique). On peut donc faire « live = dernière valeur InfluxDB » ou ajouter MQTT pour un live plus frais en gardant InfluxDB en historique (`HistoryBackedLiveSource`, `FileHistoryProvider`, `POST` à `live`/`history` découplés). Les chemins de fichiers passent par un **explorateur côté serveur** (`GET /api/browse`, dossiers + `.json`). L'onglet **Avancé** devient **Mapping** : les séries `<espace>.<métrique>` y sont classées en **Logement** (par étages) et **Système** (par modules) selon le `kind`/`group` de chaque espace (`/api/connectivity` expose désormais les espaces catégorisés). 5 nouveaux tests. Déployé sur le Home Assistant live (`vesta-psychro-panel-v202606150016`).
- **Ajouté (persistance de la connectivité)** : la source appliquée depuis le panneau est enregistrée dans un fichier d'état `0600` (`--state-file`, défaut `.vesta_connectivity.json` à côté de `--site`, hors dépôt) et **réappliquée au démarrage** — la configuration survit aux redémarrages (`--no-state` pour ignorer). Le fichier peut contenir les secrets (token/mot de passe) ; ils ne sont jamais renvoyés par l'API. **Corrigé** : l'explorateur de fichiers restait ouvert en changeant d'onglet — il se referme désormais au changement d'onglet. 3 nouveaux tests. Déployé sur le Home Assistant live (`vesta-psychro-panel-v202606150017`).
- **Ajouté (éditeur de mapping interactif)** : l'onglet Mapping devient éditable. *Découvrir le schéma InfluxDB* (`POST /api/influx-schema` → `InfluxClient.discover_schema`) liste mesures/champs/tags disponibles. Chaque espace est une carte éditable (libellé, catégorie Intérieur/Extérieur/Système, groupe étage/module) avec liaison `measurement`/`field`/`tags` par métrique ; ajout/suppression d'espaces et de métriques. *Appliquer le mapping* (`POST /api/mapping`, `CockpitService.apply_mapping`) fusionne un overlay (`_site_with_overlay`) par-dessus le YAML, reconstruit les sources (résolution Influx mise à jour) et persiste dans `.vesta_mapping.json` (ré-appliqué au démarrage). *Export YAML* génère le bloc `spaces:`/`groups:`. 10 nouveaux tests. Vérifié de bout en bout : recatégorisation d'un espace + ajout d'un espace depuis l'UI → le serveur reflète le mapping. Déployé sur le Home Assistant live (`vesta-psychro-panel-v202606150018`).
- **Ajouté (fédération + profils multi-sources + pastille d'état)** : le panneau de connectivité expose désormais l'API de **ce hub** (URL Live SSE `/api/stream` dans l'onglet Live, URL Historique `/api/history` dans l'onglet Historique, avec bouton Copier) pour la coller comme « Système Vesta distant » dans un autre hub. Chaque côté (Live / Historique) gère une **liste de profils nommés persistants** (`conn_state` : `live_profiles`/`history_profiles` + `active_live`/`active_history`) — *Nouveau profil*/*Enregistrer le profil* (`POST /api/connectivity` `action=save_profile`), *Activer* (`action=activate_profile`, permutation à chaud) et *Supprimer* (`action=delete_profile`, double-clic de confirmation, repli automatique si le profil actif est supprimé). Nouveau choix **Système Vesta distant (API)** pour Live et Historique (`VestaRemoteLiveSource`/`VestaRemoteHistoryProvider`, déjà présents côté serveur — `GET /api/values` pour le live, `GET /api/history` pour l'historique, sans remapping). Onglet Mapping : bouton **Importer un système Vesta distant** (`POST /api/remote-mapping`) ajoute les espaces déjà normalisés d'un nœud distant à l'éditeur. **Pastille d'état** : orange « Mode portable (données fixes) » si live=fichier et historique=mémoire/fichier, verte « Connecté » dès qu'une source live/historique distante, MQTT ou InfluxDB est active, rouge « Hub en erreur » si `/api/health` échoue. Migration automatique de l'ancien format d'état (`.vesta_connectivity.json` à spec unique) vers le nouveau format à profils. 17 nouveaux tests (`tests/test_connectivity_profiles.py`). Déployé sur le Home Assistant live (`vesta-psychro-panel-v202606150019`).
- **Prochaines étapes recommandées** :
  1. Compléter `config/site_house.yaml` avec les pièces réelles (le panel JS référence déjà 9 pièces : Salon, Cuisine, Réserve, Salle de bain, Chambre 1/2, Bureau, Living, Patio).
  2. Activer simultanément une source **système** et une source **logement** (deux SiteConfig fusionnés) — aujourd'hui le hub sert un seul site à la fois ; l'éditeur de mapping catégorise déjà les espaces en logement/système.
  3. Brancher le hub sur l'InfluxDB local réel et un broker MQTT de production (validés ici par tests + dégradation propre, à confirmer en conditions réelles).

## Publication GitHub

Monorepo, branche `main` comme source de vérité ; tags de release `ha-vX.Y` / `python-vX.Y` pour les paquets publiés séparément si besoin.
