# VESTA Bioclimatic — Exemple d’usage

> **Prototype visuel**
>
> Démonstration d’une interface bioclimatique augmentée par LLM pour l’analyse du confort intérieur et le pilotage d’équipements domotiques.
>
> Le prototype s’appuie sur un diagramme psychrométrique permettant de visualiser les conditions climatiques de différentes pièces : température sèche, humidité absolue, humidité relative, point de rosée, zone de confort et trajectoires possibles de rafraîchissement.
>
> Un serveur MCP expose l’état du système bioclimatique, les données capteurs et les équipements disponibles dans l’installation domotique. Ces données peuvent être analysées par un LLM afin de proposer des règles de pilotage contextualisées : ventilation nocturne, brassage d’air, rafraîchissement évaporatif, chauffage, déshumidification ou optimisation du confort pièce par pièce.
>
> L’acceptation d’une règle proposée peut déclencher l’envoi d’un prompt d’action au MCP système, permettant une intervention directe sur les équipements de confort. Un mode autopilote peut également être envisagé selon le niveau de confiance accordé aux recommandations générées, la criticité des actions et les garde-fous définis.

<img width="1708" height="969" alt="Prototype VESTA Bioclimatic — interface psychrométrique et recommandations de confort" src="https://github.com/user-attachments/assets/fe38f37f-3d70-4ab5-aaaf-37a05c47aa6f" />

