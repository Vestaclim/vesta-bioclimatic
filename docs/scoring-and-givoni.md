# Scores, Givoni et reference exterieure

## Reference exterieure unique

Le panel utilise une seule reference exterieure pour deplacer la zone de confort :

- source prioritaire : historique exterieur 7 jours ;
- fallback : mesure exterieure instantanee ;
- nom affiche : Tpma ou base exterieure prevalente.

Toutes les fonctions du panel doivent passer par `comfortPoint()` :

- polygones Givoni ;
- centre de confort ;
- score visuel ;
- actions affichees ;
- tooltips.

Cela evite d'avoir plusieurs barycentres implicites.

## Methode actuelle

L'implementation actuelle calcule :

```text
bucket_i = moyenne des mesures exterieures de la tranche 24 h i
weight_i = alpha^i
Tpma = sum(bucket_i * weight_i) / sum(weight_i)
alpha = 0.8
i = 0 pour les dernieres 24 h, i = 6 pour le septieme jour
```

Cette approche est une approximation operationnelle de la temperature exterieure prevalente utilisee par les approches adaptatives. Elle est plus robuste qu'une moyenne simple car les derniers jours comptent davantage.

## Pourquoi le fallback instantane arrive

Le panel Home Assistant demande 7 jours d'historique depuis le navigateur. Ce n'est pas toujours garanti :

- Recorder HA peut conserver moins de 7 jours ;
- les entites peuvent etre exclues du Recorder ;
- les capteurs peuvent avoir change d'entity_id ;
- la requete WebSocket peut etre lourde ;
- le capteur exterieur peut ne pas avoir temperature et humidite synchronisees.

Quand cela arrive, le panel garde l'application utilisable avec la mesure exterieure instantanee et l'indique dans le tooltip.

## Verification Home Assistant

1. Ouvrir l'historique du capteur exterieur temperature sur 7 jours.
2. Ouvrir l'historique du capteur exterieur humidite sur 7 jours.
3. Verifier `recorder.purge_keep_days`.
4. Verifier les exclusions Recorder.
5. Si InfluxDB possede l'historique long, exposer une API qui calcule la Tpma cote serveur.

## Score visuel JS

Le score du panel est psychrometrique :

```text
dT = T_piece - T_centre
dW = W_piece - W_centre
distance = sqrt(dT^2 + (3*dW)^2)
score = 100 - distance / 8 * 100
```

`W` est l'humidite absolue exprimee en g/kg d'air sec dans le graphe.

Un point hors polygone de confort est penalise/plafonne afin que le statut reste coherent avec les frontieres froid, chaud, sec et humide.

## Score operationnel Python

Le score Python part de 100 et retire des penalites :

- temperature sous cible ;
- temperature au-dessus de cible ;
- humidite relative hors bande ;
- CO2 au-dessus des seuils ;
- COV au-dessus des seuils.

Il est mieux adapte aux decisions et aux priorites. La convergence cible est de faire calculer ce score cote Python/API, puis de l'afficher dans toutes les interfaces.
