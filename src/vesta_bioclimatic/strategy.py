"""Decision layer: turns climate data into room actions and safe command proposals."""

from __future__ import annotations

from statistics import mean

from .givoni import ComfortBand, ashrae_status, givoni_hint
from .models import (
    ActuatorState,
    CommandProposal,
    FanState,
    HouseSnapshot,
    OpeningState,
    Recommendation,
    RoomAssessment,
    RoomSample,
    StrategyResult,
)
from .psychrometrics import absolute_humidity_g_m3


def _absolute(room: RoomSample) -> float:
    return room.absolute_humidity_g_m3 or absolute_humidity_g_m3(room.temp_c, room.rh_pct)


def _outdoor_absolute(snapshot: HouseSnapshot) -> float:
    return snapshot.outdoor.absolute_humidity_g_m3 or absolute_humidity_g_m3(
        snapshot.outdoor.temp_c,
        snapshot.outdoor.rh_pct,
    )


def _room_score(room: RoomSample, band: ComfortBand) -> float:
    """Operational room score used by the Python control strategy.

    The browser panel has a geometric psychrometric score based on distance to
    the adaptive comfort center. This Python score is intentionally broader: it
    starts from 100 and subtracts penalties for temperature, humidity, CO2 and
    VOC deviations. It is therefore better suited to control decisions and
    alerts, while the JS score is better suited to visual ranking on the chart.
    """
    score = 100.0
    if room.temp_c < room.target_min_c:
        score -= (room.target_min_c - room.temp_c) * 9.0
    if room.temp_c > room.target_max_c:
        score -= (room.temp_c - room.target_max_c) * 9.0
    if room.rh_pct > band.rh_max_pct:
        score -= (room.rh_pct - band.rh_max_pct) * 1.4
    if room.rh_pct < band.rh_min_pct:
        score -= (band.rh_min_pct - room.rh_pct) * 1.0
    if room.co2_ppm:
        if room.co2_ppm > band.co2_hard_ppm:
            score -= 24.0
        elif room.co2_ppm > band.co2_soft_ppm:
            score -= 10.0
    if room.voc_index:
        if room.voc_index > band.voc_hard:
            score -= 18.0
        elif room.voc_index > band.voc_soft:
            score -= 8.0
    return round(max(0.0, min(100.0, score)), 1)


def _room_action(room: RoomSample, snapshot: HouseSnapshot, band: ComfortBand) -> tuple[str, int]:
    outdoor_ah = _outdoor_absolute(snapshot)
    room_ah = _absolute(room)
    if room.co2_ppm and room.co2_ppm >= band.co2_hard_ppm:
        return "renouveler l'air maintenant", 1
    if room.voc_index and room.voc_index >= band.voc_hard:
        return "purger les COV", 1
    if room.rh_pct > band.rh_max_pct and outdoor_ah + 0.4 < room_ah:
        return "purge hygrique ciblee", 1
    if room.temp_c < room.target_min_c:
        return "chauffage doux ou apports solaires", 2
    if room.temp_c > room.target_max_c and snapshot.outdoor.temp_c + 0.8 < room.temp_c:
        return "ventilation fraiche prioritaire", 2
    if room.rh_pct > band.rh_max_pct:
        return "surveiller humidite et limiter apports", 3
    return "maintenir et surveiller", 4


def _assurance(score: float, rooms: list[RoomAssessment]) -> str:
    worst_priority = min((room.priority for room in rooms), default=4)
    if score >= 85 and worst_priority >= 3:
        return "haute"
    if score >= 70 and worst_priority >= 2:
        return "bonne"
    if score >= 55:
        return "fragile"
    return "faible"


def _fans_for_room(room: str, fans: list[FanState]) -> list[FanState]:
    return [fan for fan in fans if fan.room.lower() == room.lower()]


def _openings_for_room(room: str, openings: list[OpeningState]) -> list[OpeningState]:
    return [opening for opening in openings if opening.room.lower() == room.lower()]


def _heater_for_room(room: str, actuators: list[ActuatorState]) -> ActuatorState | None:
    for actuator in actuators:
        if actuator.room.lower() == room.lower() and actuator.kind in {"heater", "shelly_heater"}:
            return actuator
    return None


def _command_proposals(snapshot: HouseSnapshot, rooms: list[RoomAssessment]) -> list[CommandProposal]:
    commands: list[CommandProposal] = []
    solar = snapshot.outdoor.solar_w_m2 or 0.0
    rain = snapshot.outdoor.rain_mm_h or 0.0

    for assessment in rooms:
        room_fans = _fans_for_room(assessment.room, snapshot.fans)
        room_openings = _openings_for_room(assessment.room, snapshot.openings)
        heater = _heater_for_room(assessment.room, snapshot.actuators)

        if "renouveler" in assessment.action or "purge" in assessment.action or "ventilation" in assessment.action:
            for fan in room_fans:
                commands.append(
                    CommandProposal(
                        domain="fan",
                        entity_id=fan.entity_id,
                        service="turn_on",
                        data={"percentage": 70, "direction": fan.direction or "extraction"},
                        safety="autoriser si fenetre compatible ouverte ou CO2/COV prioritaire",
                        reason=f"{assessment.room}: {assessment.action}",
                        confidence=0.82,
                    )
                )
            for opening in room_openings:
                if rain <= 0.2 or opening.sheltered:
                    commands.append(
                        CommandProposal(
                            domain="cover",
                            entity_id=opening.entity_id,
                            service="open_cover",
                            data={"orientation": opening.orientation},
                            safety="ne pas ouvrir si pluie, vent fort, absence prolongee ou consigne securite",
                            reason=f"{assessment.room}: air neuf utile, exposition {opening.orientation}",
                            confidence=0.72,
                        )
                    )

        if "chauffage" in assessment.action and heater and heater.available:
            commands.append(
                CommandProposal(
                    domain="switch",
                    entity_id=heater.entity_id,
                    service="turn_on",
                    data={"max_power_w": heater.power_w or 1200},
                    safety="limiter duree, verifier presence, puissance et temperature cible",
                    reason=f"{assessment.room}: temperature {assessment.temp_c:.1f} C sous consigne",
                    confidence=0.68,
                )
            )

        if solar >= 350:
            for opening in room_openings:
                if opening.solar_exposed:
                    commands.append(
                        CommandProposal(
                            domain="cover",
                            entity_id=opening.entity_id,
                            service="close_cover",
                            data={"orientation": opening.orientation, "position": 35},
                            safety="laisser lumiere et issues selon presence",
                            reason=f"{assessment.room}: limiter apports solaires directs",
                            confidence=0.7,
                        )
                    )
    return commands


def _hourly_recommendations(snapshot: HouseSnapshot) -> list[Recommendation]:
    recommendations: list[Recommendation] = []
    if not snapshot.rooms:
        return recommendations
    indoor_avg_temp = mean(room.temp_c for room in snapshot.rooms)
    indoor_avg_ah = mean(_absolute(room) for room in snapshot.rooms)
    for forecast in snapshot.forecast[:24]:
        forecast_ah = forecast.absolute_humidity_g_m3 or absolute_humidity_g_m3(forecast.temp_c, forecast.rh_pct)
        hour = forecast.timestamp
        if forecast.temp_c + 0.8 < indoor_avg_temp and forecast_ah <= indoor_avg_ah + 0.4:
            recommendations.append(
                Recommendation(
                    level="useful",
                    title="Fenetre horaire de purge",
                    room=None,
                    action="ouvrir les flux traversants et lancer extraction douce",
                    reason="air exterieur plus frais et pas plus humide que la maison",
                    hour=hour,
                    confidence=0.78,
                )
            )
        elif forecast.solar_w_m2 and forecast.solar_w_m2 > 450:
            recommendations.append(
                Recommendation(
                    level="useful",
                    title="Protection solaire",
                    room=None,
                    action="fermer les protections exposees avant l'ensoleillement fort",
                    reason="rayonnement prevu eleve",
                    hour=hour,
                    confidence=0.72,
                )
            )
    return recommendations[:8]


def assess_house(snapshot: HouseSnapshot, band: ComfortBand | None = None) -> StrategyResult:
    band = band or ComfortBand()
    rooms: list[RoomAssessment] = []
    for room in snapshot.rooms:
        action, priority = _room_action(room, snapshot, band)
        rooms.append(
            RoomAssessment(
                room=room.name,
                score=_room_score(room, band),
                temp_c=room.temp_c,
                rh_pct=room.rh_pct,
                absolute_humidity_g_m3=round(_absolute(room), 2),
                co2_ppm=room.co2_ppm,
                voc_index=room.voc_index,
                ashrae_status=ashrae_status(room.temp_c, room.rh_pct, band),
                givoni_hint=givoni_hint(
                    room.temp_c,
                    room.rh_pct,
                    snapshot.outdoor.temp_c,
                    snapshot.outdoor.rh_pct,
                ),
                action=action,
                priority=priority,
            )
        )

    rooms.sort(key=lambda item: (item.priority, item.score))
    global_score = round(mean(room.score for room in rooms), 1) if rooms else 0.0
    top = rooms[0] if rooms else None
    givoni_mode = top.givoni_hint if top else "indisponible"
    primary_action = f"{top.room}: {top.action}" if top else "aucune donnee"

    recommendations: list[Recommendation] = [
        Recommendation(
            level="simple",
            title="Action principale",
            room=top.room if top else None,
            action=primary_action,
            reason=givoni_mode,
            confidence=0.82 if top else 0.0,
        )
    ]
    for room in rooms:
        recommendations.append(
            Recommendation(
                level="useful",
                title=f"{room.room} - {room.ashrae_status}",
                room=room.room,
                action=room.action,
                reason=f"{room.temp_c:.1f} C, {room.rh_pct:.0f} %, {room.absolute_humidity_g_m3:.1f} g/m3",
                confidence=0.74,
            )
        )
    commands = _command_proposals(snapshot, rooms)
    for command in commands:
        recommendations.append(
            Recommendation(
                level="excellent",
                title="Commande proposee",
                room=None,
                action=f"{command.domain}.{command.service} {command.entity_id}",
                reason=command.reason,
                confidence=command.confidence,
            )
        )
    recommendations.extend(_hourly_recommendations(snapshot))

    urgent = any(room.priority == 1 for room in rooms)
    horizon = 30 if urgent else 180 if global_score >= 80 else 90
    return StrategyResult(
        timestamp=snapshot.timestamp,
        global_score=global_score,
        assurance=_assurance(global_score, rooms),
        givoni_mode=givoni_mode,
        primary_action=primary_action,
        horizon_minutes=horizon,
        rooms=rooms,
        recommendations=recommendations,
        commands=commands,
    )
