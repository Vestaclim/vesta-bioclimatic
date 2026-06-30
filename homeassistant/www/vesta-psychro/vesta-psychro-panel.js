const PLOTLY_URL = "/local/vesta-psychro/plotly-2.35.2.min.js";
const P0 = 1013.25;
const X_MIN = -15;
const X_DEFAULT_MIN = 0;
const X_MAX = 38;
const Y_MIN = 0;
const Y_MAX = 24;
const PLOT_MARGIN = { l: 54, r: 92, t: 30, b: 84 };
const FAN_COMMAND_DEBOUNCE_MS = 650;
const FAN_COMMAND_RESEND_GUARD_MS = 1600;
const FAN_COMMAND_CONFIRM_MS = 2800;
const COMFORT_BASIS_DAYS = 7;
const COMFORT_TPMA_ALPHA = 0.8;
// Comfort polygon scale factors (relative to the adaptive comfort center) used
// to split the Givoni comfort zone into 4 ISO "rings": ring 4 (innermost,
// best comfort) down to ring 1 (closest to the comfort boundary, risk of
// drifting out of the zone). COMFORT_RESILIENCE_FACTOR defines a smaller disc
// inside ring 4 where comfort is considered resilient to short drifts.
const COMFORT_RING_FACTORS = [.34, .58, .78];
const COMFORT_RESILIENCE_FACTOR = .16;

// Deployment mapping.
// Keep the technical HA ids stable, but expose generic labels so the repository
// can be published or reused without personal room names leaking into the UI.
const CONFIG = {
  pressureEntity: "sensor.airthings_tern_co2_000557_pression_atmospherique",
  rooms: [
    { id: "patio", areaId: "patio", name: "Patio", floor: "Extérieur", temp: "sensor.climat_patio_temperature", rh: "sensor.climat_patio_humidite_relative", color: "#7dd3fc", outdoor: true },
    { id: "salon", areaId: "salon", name: "Salon", floor: "RDC", temp: "sensor.climat_salon_temperature", rh: "sensor.climat_salon_humidite_relative", color: "#34d399" },
    {
      id: "living",
      areaId: "living",
      name: "Living",
      floor: "RDC",
      temp: "sensor.climat_living_temperature",
      rh: "sensor.climat_living_humidite_relative",
      color: "#60a5fa",
      fanCommand: "input_number.consigne_vitesse_ventilateur_living_signee",
      fanRoomKey: "living",
      fanModel: {
        actualSigned: "sensor.ventilateur_living_vitesse_signee",
        signed: "sensor.vesta_living_fan_signed_speed",
        volume: "sensor.vesta_living_room_volume",
        nominalAirflow: "sensor.vesta_living_fan_nominal_airflow",
        annulusAirSpeed: "sensor.vesta_living_fan_annulus_air_speed",
        occupiedAirSpeed: "sensor.vesta_living_estimated_occupied_air_speed",
        aspirationMixing: "sensor.vesta_living_aspiration_mixing_flow",
        blowRecirculation: "sensor.vesta_living_blow_recirculation_equivalent",
        aspirationRecirculation: "sensor.vesta_living_aspiration_recirculation_equivalent",
        transferFactor: "input_number.vesta_living_air_speed_transfer_factor",
        aspirationFactor: "input_number.vesta_living_aspiration_ceiling_mixing_factor",
        commandSource: "input_select.vesta_living_last_command_source",
        commandRelation: "input_select.vesta_living_last_command_relation"
      }
    },
    { id: "cuisine", areaId: "cuisine", name: "Cuisine", floor: "RDC", temp: "sensor.climat_cuisine_temperature", rh: "sensor.climat_cuisine_humidite_relative", color: "#f59e0b" },
    { id: "reserve", areaId: "reserve", name: "Réserve", floor: "RDC", temp: "sensor.climat_reserve_temperature", rh: "sensor.climat_reserve_humidite_relative", color: "#fbbf24" },
    { id: "sdb", areaId: "salle_de_bain", name: "Salle de bain", floor: "RDC", temp: "sensor.climat_sdb_temperature", rh: "sensor.climat_sdb_humidite_relative", color: "#22d3ee" },
    {
      id: "chambre",
      areaId: "chambre",
      name: "Chambre 1",
      floor: "1",
      temp: "sensor.climat_chambre_temperature",
      rh: "sensor.climat_chambre_humidite_relative",
      color: "#a78bfa",
      airQuality: {
        co2: "sensor.airthings_tern_co2_000557_dioxyde_de_carbone",
        voc: "sensor.airthings_tern_co2_000557_composes_organiques_volatils_parties",
        noise: "sensor.airthings_tern_co2_000557_ambient_noise",
        light: "sensor.airthings_tern_co2_000557_eclairement"
      }
    },
    {
      id: "bureau_sacha",
      areaId: "bureau_sacha",
      name: "Bureau (Sacha)",
      floor: "2",
      temp: "sensor.climat_bureau_sacha_temperature",
      rh: "sensor.climat_bureau_sacha_humidite_relative",
      color: "#fb7185",
      fanCommand: "input_number.consigne_vitesse_ventilateur_bureau_sacha_signee",
      fanRoomKey: "bureau_sacha",
      fanModel: {
        actualSigned: "sensor.ventilateur_bureau_sacha_vitesse_signee",
        signed: "sensor.vesta_bureau_sacha_fan_signed_speed",
        volume: "sensor.vesta_bureau_sacha_room_volume",
        nominalAirflow: "sensor.vesta_bureau_sacha_fan_nominal_airflow",
        annulusAirSpeed: "sensor.vesta_bureau_sacha_fan_annulus_air_speed",
        occupiedAirSpeed: "sensor.vesta_bureau_sacha_estimated_occupied_air_speed",
        aspirationMixing: "sensor.vesta_bureau_sacha_aspiration_mixing_flow",
        blowRecirculation: "sensor.vesta_bureau_sacha_blow_recirculation_equivalent",
        aspirationRecirculation: "sensor.vesta_bureau_sacha_aspiration_recirculation_equivalent",
        transferFactor: "input_number.vesta_bureau_sacha_air_speed_transfer_factor",
        aspirationFactor: "input_number.vesta_bureau_sacha_aspiration_ceiling_mixing_factor",
        commandSource: "input_select.vesta_bureau_sacha_last_command_source",
        commandRelation: "input_select.vesta_bureau_sacha_last_command_relation"
      }
    },
    { id: "chambre_juliana", areaId: "chambre_juliana", name: "Chambre Juliana", floor: "2", temp: "sensor.climat_chambre_juliana_temperature", rh: "sensor.climat_chambre_juliana_humidite_relative", color: "#f472b6" }
  ]
};

const css = `
  :host {
    color-scheme: dark;
    --bg: #081016;
    --panel: rgba(255,255,255,.09);
    --panel-strong: rgba(255,255,255,.14);
    --line: rgba(226,232,240,.18);
    --text: #edf7f6;
    --muted: #9fb2ba;
    --cyan: #7dd3fc;
    --green: #34d399;
    --shadow: 0 24px 80px rgba(0,0,0,.38);
    --blur: blur(26px) saturate(150%);
    display: block;
    min-height: 100%;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--text);
    background:
      radial-gradient(circle at 14% 10%, rgba(125,211,252,.18), transparent 32%),
      radial-gradient(circle at 84% 20%, rgba(52,211,153,.14), transparent 34%),
      linear-gradient(145deg, #061017 0%, #0d171d 48%, #111827 100%);
  }
  * { box-sizing: border-box; }
  main {
    height: calc(100vh - var(--header-height, 0px));
    min-height: 720px;
    display: grid;
    grid-template-areas: "left stage right";
    grid-template-columns: 318px minmax(0, 1fr) 318px;
    gap: 14px;
    padding: 14px;
  }
  .glass {
    border: 1px solid var(--line);
    background: linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.055));
    box-shadow: var(--shadow);
    backdrop-filter: var(--blur);
    -webkit-backdrop-filter: var(--blur);
    border-radius: 18px;
  }
  aside:first-child { grid-area: left; }
  section.stage { grid-area: stage; }
  .right { grid-area: right; }
  aside, section.stage, .right { min-height: 0; overflow: hidden; }
  aside, .right { display: flex; flex-direction: column; }
  aside:first-child header { display: none; }
  header { padding: 16px 18px 11px; border-bottom: 1px solid var(--line); }
  h1, h2, p { margin: 0; }
  h1 { font-size: 20px; font-weight: 760; letter-spacing: 0; }
  h2 { margin: 12px 0 10px; font-size: 13px; color: var(--muted); font-weight: 650; text-transform: uppercase; letter-spacing: .08em; }
  p { color: var(--muted); line-height: 1.45; font-size: 13px; margin-top: 7px; }
  .status {
    display: inline-flex; gap: 8px; align-items: center; margin-top: 12px; padding: 7px 10px;
    border-radius: 999px; border: 1px solid rgba(52,211,153,.36);
    background: rgba(52,211,153,.12); color: #a7f3d0; font-size: 12px; font-weight: 700;
    width: fit-content; cursor: pointer;
  }
  button.status { font: inherit; }
  .dot { width: 7px; height: 7px; border-radius: 99px; background: var(--green); box-shadow: 0 0 14px var(--green); }
  .pane-scroll { overflow: auto; padding: 12px 14px 14px; }
  aside:first-child .pane-scroll { padding-top: 16px; }
  .panel-section { margin-bottom: 16px; }
  .sensor-intro {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    margin: 2px 0 14px; color: var(--muted); font-size: 12px;
  }
  .sensor-intro strong { color: var(--text); font-size: 12px; font-variant-numeric: tabular-nums; }
  .sensor-toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    margin: 0 0 10px;
  }
  .sensor-toolbar .status { margin-top: 0; min-height: 30px; padding: 6px 10px; }
  .sensor-count {
    color: rgba(226,232,240,.88); font-size: 12px; font-weight: 760;
    white-space: nowrap; font-variant-numeric: tabular-nums;
  }
  .trace-control {
    display: grid; gap: 7px; margin: 0 0 15px; padding: 10px 11px 11px;
    border-radius: 15px; border: 1px solid rgba(226,232,240,.14);
    background: linear-gradient(145deg, rgba(255,255,255,.070), rgba(255,255,255,.035));
  }
  .trace-control label {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    color: var(--muted); font-size: 11px; white-space: nowrap;
  }
  .trace-control label span { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .trace-control strong { color: var(--text); font-size: 12px; font-variant-numeric: tabular-nums; }
  .trace-instrument {
    --range-fill: linear-gradient(90deg, rgba(125,211,252,.24), rgba(125,211,252,.46), rgba(52,211,153,.76));
    position: relative; height: 24px; padding: 0 2px;
  }
  .trace-instrument input[type="range"] {
    height: 24px; background: transparent; position: relative; z-index: 2; margin: 0;
  }
  .trace-instrument .instrument-track {
    top: 9px; left: 8px; right: 8px; height: 6px;
    background:
      linear-gradient(90deg, rgba(226,232,240,.12), rgba(226,232,240,.12)),
      repeating-linear-gradient(90deg, transparent 0 calc(4.166% - 1px), rgba(226,232,240,.26) calc(4.166% - 1px) 4.166%);
  }
  .section-title {
    display: flex; align-items: center; gap: 8px; width: 100%;
    margin: 10px 0 8px; padding: 0; border: 0; background: transparent;
    color: var(--muted); text-align: left; cursor: default;
  }
  .section-title h2 { margin: 0; flex: 1; }
  .section-title[data-section-toggle] { cursor: pointer; }
  .section-metric {
    display: inline-flex; align-items: center; gap: 5px; max-width: 142px;
    padding: 4px 7px; border-radius: 999px;
    border: 1px solid rgba(125,211,252,.20);
    background: rgba(125,211,252,.075);
    color: rgba(226,232,240,.84); font-size: 10.5px; font-weight: 720;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
  .section-arrow {
    width: 18px; height: 18px; display: grid; place-items: center;
    border-radius: 99px; border: 1px solid rgba(226,232,240,.16);
    color: rgba(203,213,225,.82); font-size: 13px; transition: transform .16s ease;
  }
  .panel-section.collapsed .section-arrow { transform: rotate(-90deg); }
  .panel-section.collapsed .section-body { display: none; }
  .control {
    padding: 10px 12px; margin-bottom: 9px; border-radius: 13px; border: 1px solid var(--line);
    background: rgba(255,255,255,.055);
  }
  .control.compact { padding: 9px 10px; }
  .control label, .fan-control label {
    display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
    color: var(--muted); font-size: 11.5px; margin-bottom: 7px;
  }
  .control strong, .fan-control strong { color: var(--text); font-size: 13px; font-variant-numeric: tabular-nums; }
  .info-strip {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    min-height: 36px; padding: 9px 11px; margin-bottom: 9px;
    border-radius: 13px; border: 1px solid rgba(226,232,240,.16);
    background: rgba(255,255,255,.052); color: var(--muted); font-size: 11.5px;
  }
  .info-strip strong { color: var(--text); font-size: 13px; font-variant-numeric: tabular-nums; }
  input[type="range"] {
    width: 100%; appearance: none; height: 4px; border-radius: 99px;
    background: rgba(226,232,240,.18); outline: none;
  }
  .instrument {
    --range-fill: linear-gradient(90deg, rgba(125,211,252,.24), rgba(52,211,153,.72));
    position: relative; padding: 8px 2px 2px;
  }
  .instrument.fan {
    --range-fill: linear-gradient(90deg, rgba(96,165,250,.72), rgba(248,113,113,.46), rgba(52,211,153,.82));
  }
  .instrument input[type="range"] {
    height: 28px; background: transparent; position: relative; z-index: 2; margin: 0;
  }
  .instrument-track, .dual-track {
    position: absolute; left: 10px; right: 10px; top: 19px; height: 6px; border-radius: 999px;
    background:
      linear-gradient(90deg, rgba(226,232,240,.13), rgba(226,232,240,.13)),
      repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), rgba(226,232,240,.28) calc(10% - 1px) 10%);
    border: 1px solid rgba(226,232,240,.12);
    overflow: hidden;
  }
  .instrument-track::after, .dual-track::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit;
    background: var(--range-fill);
    clip-path: inset(0 var(--fill-right, 0%) 0 var(--fill-left, 0%));
  }
  .instrument.fan .instrument-track {
    background:
      linear-gradient(90deg, rgba(226,232,240,.13), rgba(226,232,240,.13)),
      repeating-linear-gradient(90deg, transparent 0 calc(8.333% - 1px), rgba(226,232,240,.30) calc(8.333% - 1px) 8.333%);
  }
  .dual-slider { position: relative; height: 38px; margin-top: 3px; }
  .dual-slider input[type="range"] {
    position: absolute; inset: 0; height: 38px; margin: 0; background: transparent; pointer-events: none;
  }
  .dual-slider input[type="range"]::-webkit-slider-thumb { pointer-events: auto; }
  .dual-slider input[type="range"]::-moz-range-thumb { pointer-events: auto; }
  .zero-marker {
    position: absolute; top: 13px; left: 50%; width: 2px; height: 18px;
    border-radius: 99px; background: rgba(248,113,113,.88);
    box-shadow: 0 0 10px rgba(248,113,113,.55); pointer-events: none; z-index: 1;
  }
  .range-hints {
    display: flex; justify-content: space-between; margin-top: 2px;
    color: rgba(159,178,186,.76); font-size: 10px; font-variant-numeric: tabular-nums;
  }
  input[type="range"][list] { margin-bottom: 2px; }
  input[type="range"]::-webkit-slider-thumb {
    appearance: none; width: 16px; height: 16px; border-radius: 99px;
    border: 2px solid rgba(255,255,255,.86); background: var(--cyan);
    box-shadow: 0 0 18px rgba(125,211,252,.8);
  }
  datalist.fan-ticks {
    display: flex; justify-content: space-between; color: var(--muted);
    font-size: 10px; line-height: 1; padding: 0 2px; margin-top: 4px;
  }
  datalist.fan-ticks option { padding: 0; }
  .toggle-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-bottom: 10px; }
  .toggle-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .toggle-grid.five { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .toggle {
    border: 1px solid var(--line); background: rgba(255,255,255,.06); color: var(--muted);
    border-radius: 11px; min-height: 34px; padding: 0 8px; font-weight: 720; cursor: pointer;
    font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .toggle.active {
    color: #eafdf9; border-color: rgba(125,211,252,.58);
    background: linear-gradient(135deg, rgba(125,211,252,.26), rgba(52,211,153,.20));
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.04), 0 0 18px rgba(125,211,252,.10);
  }
  .stage { display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; isolation: isolate; }
  .topbar {
    position: relative;
    display: grid; gap: 8px; padding: 10px 14px 9px; border-bottom: 1px solid var(--line);
    background: linear-gradient(90deg, rgba(255,255,255,.035), rgba(52,211,153,.04));
  }
  .topbar-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .stage-title { flex: 1; min-width: 180px; }
  .topbar h1 { flex: 1; min-width: 180px; font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .topbar p { margin-top: 2px; font-size: 11.5px; line-height: 1.25; }
  .badge {
    border: 1px solid var(--line); background: rgba(255,255,255,.07); color: var(--muted);
    border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 760; white-space: nowrap;
    min-width: 74px; text-align: center; font-variant-numeric: tabular-nums;
  }
  #clock { color: rgba(226,232,240,.82); }
  #global-score { color: #d9f99d; border-color: rgba(132,204,22,.24); background: rgba(132,204,22,.08); }
  .pressure-pill {
    display: inline-flex; align-items: center; gap: 7px; min-height: 29px;
    padding: 5px 10px; border-radius: 999px; border: 1px solid rgba(226,232,240,.22);
    background: rgba(255,255,255,.08); color: var(--muted); font-size: 11.5px; white-space: nowrap;
  }
  .pressure-pill strong { color: var(--text); font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .chart-control-strip {
    display: grid; grid-template-columns: minmax(0, 1fr);
    align-items: center; gap: 8px; min-width: 0;
  }
  .mini-control {
    display: grid; grid-template-columns: auto minmax(92px, 1fr); align-items: center; column-gap: 10px;
    min-width: 0; min-height: 34px; padding: 6px 9px; border-radius: 13px;
    border: 1px solid rgba(226,232,240,.14);
    background: linear-gradient(145deg, rgba(255,255,255,.072), rgba(255,255,255,.035));
  }
  .mini-control label {
    display: inline-flex; align-items: center; gap: 7px; margin: 0;
    color: var(--muted); font-size: 10.5px;
    white-space: nowrap; min-width: 0;
  }
  .mini-control label span {
    display: inline-flex; align-items: center; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .mini-control strong { color: var(--text); font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .mini-control input[type="range"] { height: 3px; min-width: 0; }
  .mini-control > input[type="range"] { align-self: center; }
  .mini-control .instrument { padding: 0 2px; height: 20px; }
  .mini-control .instrument input[type="range"] { height: 20px; }
  .mini-control .instrument-track { top: 8px; height: 5px; }
  .context-symbol { color: var(--cyan); font-weight: 820; margin-right: 4px; }
  .tool-groups { display: flex; flex-wrap: nowrap; gap: 7px; justify-content: flex-end; min-width: 0; }
  .tool-group {
    display: flex; align-items: center; gap: 6px; padding: 4px 5px 4px 7px; border-radius: 999px;
    border: 1px solid rgba(226,232,240,.12); background: rgba(8,16,22,.16);
  }
  .tool-label {
    color: rgba(203,213,225,.68); font-size: 9px; font-weight: 820;
    text-transform: uppercase; letter-spacing: .06em; padding: 0 2px;
  }
  .control-cluster { display: flex; flex-wrap: nowrap; gap: 4px; min-width: 0; }
  .control-cluster .toggle {
    display: inline-flex; align-items: center; gap: 5px; min-height: 25px; padding: 0 7px; border-radius: 999px;
    border-color: rgba(226,232,240,.16);
    background: rgba(255,255,255,.045);
    color: rgba(226,232,240,.72);
  }
  .control-cluster .toggle .mini-icon {
    width: 16px; height: 16px; display: grid; place-items: center; border-radius: 999px;
    background: rgba(255,255,255,.07); color: rgba(203,213,225,.88); font-size: 10px; font-weight: 850;
  }
  .control-cluster .toggle.active {
    color: #eafdf9;
    border-color: rgba(125,211,252,.44);
    background: linear-gradient(145deg, rgba(125,211,252,.20), rgba(52,211,153,.14));
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.04), 0 0 18px rgba(125,211,252,.08);
  }
  .control-cluster .toggle.active .mini-icon {
    background: rgba(125,211,252,.20); color: #baf3ff;
    box-shadow: 0 0 12px rgba(125,211,252,.16);
  }
  .config-modal {
    position: fixed; inset: 0; z-index: 40; display: none; place-items: center;
    padding: 20px; background: rgba(2,6,10,.48); backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  .config-modal.visible { display: grid; }
  .config-sheet {
    width: min(720px, 100%); max-height: min(780px, 92vh); overflow: auto;
    border-radius: 22px; border: 1px solid rgba(226,232,240,.18);
    background: linear-gradient(145deg, rgba(20,34,42,.94), rgba(11,18,28,.94));
    box-shadow: 0 28px 90px rgba(0,0,0,.48);
  }
  .config-head {
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
    padding: 18px 20px; border-bottom: 1px solid rgba(226,232,240,.14);
  }
  .config-head h1 { font-size: 18px; }
  .config-head p { margin-top: 4px; font-size: 12px; }
  .config-close {
    width: 34px; height: 34px; border-radius: 999px; border: 1px solid rgba(226,232,240,.16);
    background: rgba(255,255,255,.06); color: var(--text); cursor: pointer;
  }
  .config-body { padding: 18px 20px 20px; display: grid; gap: 14px; }
  .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .config-field {
    display: grid; gap: 6px; padding: 12px; border-radius: 16px;
    border: 1px solid rgba(226,232,240,.13); background: rgba(255,255,255,.045);
  }
  .config-field label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  .config-field input, .config-field select, .config-field textarea {
    width: 100%; border: 0; outline: 0; border-radius: 10px;
    background: rgba(8,16,22,.46); color: var(--text); padding: 9px 10px;
    font: inherit; font-size: 12px;
  }
  .config-field textarea { min-height: 118px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .config-field.full { grid-column: 1 / -1; }
  .config-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  .config-note {
    padding: 12px 14px; border-radius: 16px; border: 1px solid rgba(125,211,252,.24);
    background: rgba(125,211,252,.08); color: rgba(226,232,240,.88); font-size: 12px; line-height: 1.45;
  }
  .config-tabs {
    display: flex; gap: 6px; padding: 12px 20px 0; border-bottom: 1px solid rgba(226,232,240,.12);
  }
  .config-tab {
    appearance: none; border: 0; cursor: pointer; padding: 9px 14px; font: inherit; font-size: 12.5px;
    color: var(--muted); background: transparent; border-bottom: 2px solid transparent; border-radius: 8px 8px 0 0;
  }
  .config-tab:hover { color: var(--text); background: rgba(255,255,255,.04); }
  .config-tab.active { color: #bae6fd; border-bottom-color: #38bdf8; }
  .config-pane { display: none; gap: 12px; }
  .config-pane.active { display: grid; }
  .conn-status {
    display: inline-flex; align-items: center; gap: 8px; align-self: start;
    padding: 7px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;
    border: 1px solid rgba(226,232,240,.16); background: rgba(255,255,255,.05); color: var(--muted);
  }
  .conn-status .dot { width: 9px; height: 9px; border-radius: 999px; background: currentColor; box-shadow: 0 0 10px currentColor; }
  .conn-status.ok { color: #34d399; border-color: rgba(52,211,153,.4); background: rgba(52,211,153,.1); }
  .conn-status.err { color: #fb7185; border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.1); }
  .conn-status.warn { color: #fbbf24; border-color: rgba(251,191,36,.4); background: rgba(251,191,36,.1); }
  .conn-endpoints {
    display: grid; gap: 7px; padding: 11px 13px; border-radius: 12px;
    border: 1px solid rgba(125,211,252,.24); background: rgba(125,211,252,.06);
  }
  .conn-endpoints-label { color: #bae6fd; font-size: 11.5px; line-height: 1.4; }
  .conn-endpoint-row { display: flex; align-items: center; gap: 8px; }
  .conn-endpoint-row span { color: var(--muted); font-size: 11px; min-width: 64px; }
  .conn-endpoint-row code {
    flex: 1; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    color: var(--text); background: rgba(8,16,22,.45); border-radius: 8px; padding: 6px 9px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .conn-profiles { display: grid; gap: 8px; }
  .conn-profile {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(226,232,240,.13); background: rgba(255,255,255,.035);
  }
  .conn-profile.active { border-color: rgba(52,211,153,.4); background: rgba(52,211,153,.07); }
  .conn-profile-info { display: grid; gap: 3px; min-width: 0; }
  .conn-profile-name { font-size: 12.5px; font-weight: 600; }
  .conn-profile-summary { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .conn-profile-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .conn-profile-actions .toggle.active { color: #34d399; border-color: rgba(52,211,153,.4); background: rgba(52,211,153,.1); }
  .conn-profiles-empty { padding: 11px 13px; border-radius: 12px; border: 1px solid rgba(226,232,240,.12); background: rgba(8,16,22,.4); color: var(--muted); font-size: 12px; }
  .conn-rows { display: grid; gap: 7px; }
  .conn-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(226,232,240,.11); background: rgba(255,255,255,.04);
  }
  .conn-row span { color: var(--muted); font-size: 12px; }
  .conn-row strong { font-size: 12.5px; font-variant-numeric: tabular-nums; text-align: right; }
  .conn-row.conn-error { border-color: rgba(251,113,133,.34); background: rgba(251,113,133,.08); }
  .conn-row.conn-error strong { color: #fda4af; font-weight: 500; }
  .conn-row[hidden] { display: none !important; }
  .conn-field { display: grid; gap: 6px; }
  .conn-field label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
  .conn-field select, .conn-field input {
    border: 0; outline: 0; border-radius: 10px; background: rgba(8,16,22,.46); color: var(--text);
    padding: 9px 10px; font: inherit; font-size: 12px; width: 100%;
  }
  .conn-config { display: grid; gap: 10px; }
  .conn-group { display: none; gap: 9px; padding: 11px; border-radius: 14px; border: 1px solid rgba(226,232,240,.11); background: rgba(255,255,255,.035); }
  .conn-group.show { display: grid; }
  .conn-hint { color: var(--muted); font-size: 10px; text-transform: none; letter-spacing: 0; font-weight: 400; }
  .conn-ha-note, .conn-note {
    padding: 11px 13px; border-radius: 12px; border: 1px solid rgba(125,211,252,.24);
    background: rgba(125,211,252,.08); color: rgba(226,232,240,.86); font-size: 12px; line-height: 1.5;
  }
  .conn-note[hidden] { display: none; }
  .conn-note strong { color: #bae6fd; font-weight: 500; }
  .conn-file { display: flex; gap: 8px; }
  .conn-file input { flex: 1; }
  .conn-file .toggle { white-space: nowrap; }
  .conn-browser {
    margin-top: 12px; border-radius: 14px; border: 1px solid rgba(226,232,240,.16);
    background: rgba(8,16,22,.7); overflow: hidden;
  }
  .conn-browser[hidden] { display: none; }
  .conn-browser-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid rgba(226,232,240,.12); }
  .conn-browser-path { flex: 1; font-size: 11px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
  .conn-browser-head .config-close { width: 26px; height: 26px; }
  .conn-browser-list { max-height: 220px; overflow: auto; padding: 6px; display: grid; gap: 3px; }
  .conn-browser-item {
    display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 9px; cursor: pointer;
    font-size: 12px; color: var(--text); background: transparent; border: 0; text-align: left; width: 100%; font-family: inherit;
  }
  .conn-browser-item:hover { background: rgba(255,255,255,.06); }
  .conn-browser-item .ic { width: 16px; color: var(--muted); }
  .conn-browser-item.is-file .ic { color: #bae6fd; }
  .conn-map-cats { display: grid; gap: 12px; }
  .conn-map-cat-title { color: rgba(203,213,225,.78); font-size: 11px; font-weight: 760; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 6px; }
  .conn-map-group { margin-bottom: 8px; }
  .conn-map-group-label { color: var(--muted); font-size: 11px; margin-bottom: 5px; }
  .map-ref-body { display: grid; gap: 8px; padding: 10px; border-radius: 12px; border: 1px solid rgba(226,232,240,.12); background: rgba(8,16,22,.4); }
  .map-ref-body[hidden] { display: none; }
  .map-ref-row { display: grid; gap: 5px; }
  .map-ref-row .conn-map-group-label { margin: 0; }
  .map-spaces { display: grid; gap: 10px; }
  .map-space { border-radius: 14px; border: 1px solid rgba(226,232,240,.14); background: rgba(255,255,255,.04); padding: 11px; display: grid; gap: 9px; }
  .map-space-head { display: grid; grid-template-columns: 1fr auto auto auto; gap: 7px; align-items: center; }
  .map-space-head input, .map-space-head select {
    border: 0; outline: 0; border-radius: 9px; background: rgba(8,16,22,.5); color: var(--text); padding: 7px 9px; font: inherit; font-size: 12px;
  }
  .map-space-head .ms-group { width: 120px; }
  .ms-remove, .msr-remove {
    width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(251,113,133,.3);
    background: rgba(251,113,133,.1); color: #fda4af; cursor: pointer; font-size: 14px; line-height: 1;
  }
  .map-sensors { display: grid; gap: 6px; padding-left: 4px; }
  .map-sensor { display: grid; grid-template-columns: 0.9fr 1fr 0.8fr 1fr auto; gap: 6px; align-items: center; }
  .map-sensor input {
    border: 0; outline: 0; border-radius: 8px; background: rgba(8,16,22,.5); color: var(--text); padding: 6px 8px; font: inherit; font-size: 11.5px; width: 100%;
  }
  .map-sensor input::placeholder { color: rgba(159,178,186,.5); }
  .ms-add-metric {
    justify-self: start; padding: 5px 10px; border-radius: 8px; border: 1px dashed rgba(226,232,240,.24);
    background: transparent; color: var(--muted); cursor: pointer; font: inherit; font-size: 11px;
  }
  .ms-add-metric:hover { color: var(--text); border-color: rgba(226,232,240,.4); }
  .conn-result {
    padding: 11px 13px; border-radius: 12px; border: 1px solid rgba(226,232,240,.12);
    background: rgba(8,16,22,.4); color: rgba(226,232,240,.86); font-size: 12px; line-height: 1.5;
  }
  .conn-mapping-head { color: var(--muted); font-size: 11.5px; }
  .conn-mapping-head code { color: #bae6fd; font-size: 11px; }
  .conn-mapping { display: flex; flex-wrap: wrap; gap: 6px; }
  .conn-chip {
    padding: 4px 9px; border-radius: 999px; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    border: 1px solid rgba(125,211,252,.24); background: rgba(125,211,252,.08); color: #bae6fd;
  }
  .chart-wrap {
    position: relative; min-height: 0; width: 100%; height: 100%;
    overflow: hidden; contain: layout paint; isolation: isolate; cursor: crosshair;
  }
  #chart { position: absolute; inset: 0; min-height: 0; width: 100%; height: 100%; overflow: hidden !important; }
  #chart .js-plotly-plot,
  #chart .plot-container,
  #chart .svg-container,
  #chart .main-svg,
  #chart .draglayer,
  #chart .hoverlayer {
    overflow: hidden !important;
    max-width: 100% !important;
    max-height: 100% !important;
  }
  #chart .draglayer,
  #chart .nsewdrag,
  #chart .drag,
  #chart .cursor-crosshair { cursor: crosshair !important; }
  .chart-hit-layer { position: absolute; inset: 0; z-index: 8; pointer-events: none; }
  .hover-guide { position: absolute; opacity: 0; transition: opacity .08s ease; }
  .chart-hit-layer.guides-visible .hover-guide { opacity: 1; }
  .hover-guide-x {
    width: 0; border-left: 1px dashed rgba(203,213,225,.5);
  }
  .hover-guide-y {
    height: 0; border-top: 1px dashed rgba(203,213,225,.5);
  }
  .hit-marker { display: none; }
  .chart-legend {
    position: absolute; left: 14px; bottom: 38px; z-index: 7;
    display: none; flex-wrap: wrap; gap: 5px; max-width: min(560px, calc(100% - 126px));
    padding: 6px; border-radius: 12px; border: 1px solid rgba(226,232,240,.12);
    background: rgba(8,16,22,.36); backdrop-filter: blur(14px) saturate(145%);
    -webkit-backdrop-filter: blur(14px) saturate(145%);
  }
  .legend-item {
    display: inline-flex; align-items: center; gap: 5px; min-height: 20px;
    color: rgba(203,213,225,.84); font-size: 10.5px; white-space: nowrap;
  }
  .legend-dot { width: 7px; height: 7px; border-radius: 99px; box-shadow: 0 0 9px currentColor; }
  .chart-tooltip {
    position: absolute; z-index: 9; max-width: 230px; pointer-events: none;
    padding: 9px 10px; border-radius: 10px;
    border: 1px solid rgba(226,232,240,.22);
    background: rgba(8,16,22,.78);
    color: #f8fafc; box-shadow: 0 14px 38px rgba(0,0,0,.35);
    backdrop-filter: blur(18px) saturate(150%);
    -webkit-backdrop-filter: blur(18px) saturate(150%);
    opacity: 0; transform: translate(-50%, calc(-100% - 12px)) scale(.98);
    transition: opacity .09s ease, transform .09s ease;
    font-size: 12px; line-height: 1.35;
  }
  .chart-tooltip.visible { opacity: 1; transform: translate(-50%, calc(-100% - 15px)) scale(1); }
  .chart-tooltip b { display: block; margin-bottom: 3px; font-size: 12.5px; }
  .chart-tooltip span { color: rgba(203,213,225,.9); }
  .comfort-target {
    position: absolute; left: 12px; top: 10px; z-index: 7;
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 9px 5px 7px; border-radius: 999px;
    border: 1px solid rgba(52,211,153,.30); background: rgba(8,22,17,.46);
    backdrop-filter: blur(12px) saturate(150%); -webkit-backdrop-filter: blur(12px) saturate(150%);
    color: rgba(209,250,229,.92); font-size: 11px; font-weight: 640; letter-spacing: .005em;
    white-space: nowrap; cursor: help; user-select: none;
    box-shadow: 0 4px 18px rgba(0,0,0,.28);
    transition: border-color .12s ease, background .12s ease;
  }
  .comfort-target:hover, .comfort-target:focus-visible {
    outline: none; border-color: rgba(52,211,153,.6); background: rgba(8,28,21,.6);
  }
  .comfort-target .ct-icon { font-size: 13px; color: #34d399; text-shadow: 0 0 10px rgba(52,211,153,.5); line-height: 1; }
  .comfort-target .ct-text { font-variant-numeric: tabular-nums; }
  .axis-title-overlay {
    position: absolute; z-index: 6; pointer-events: none;
    color: rgba(203,213,225,.86); font-size: 11px; font-weight: 680;
    text-shadow: 0 1px 8px rgba(0,0,0,.55);
  }
  .axis-title-overlay.x { left: 50%; bottom: 11px; transform: translateX(-50%); }
  .axis-title-overlay.y {
    right: 9px; top: 50%; transform: translateY(-50%) rotate(90deg);
    transform-origin: center; white-space: nowrap;
  }
  #chart .scatterlayer .fills path,
  #chart .scatterlayer .fill path,
  #chart .scatterlayer path.js-fill,
  #chart .shapelayer path {
    pointer-events: none !important;
  }
  #chart .zoombox,
  #chart .select-outline,
  #chart .select-box {
    fill: rgba(125,211,252,.14) !important;
    stroke: rgba(125,211,252,.92) !important;
    stroke-width: 1.5px !important;
    stroke-dasharray: 5 4 !important;
  }
  .manual-range,
  .manual-range.visible { display: none; }
  .range-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .room-list { display: grid; gap: 8px; }
  .floor-group { display: grid; gap: 7px; }
  .floor-group + .floor-group { margin-top: 14px; }
  .floor-title {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    color: rgba(203,213,225,.74); font-size: 10.5px; font-weight: 760; letter-spacing: .07em;
    text-transform: uppercase;
  }
  .floor-title span:last-child { color: rgba(159,178,186,.72); font-weight: 650; letter-spacing: 0; text-transform: none; }
  .outdoor-zone.hidden { display: none; }
  .room {
    display: grid; grid-template-columns: 10px 1fr auto; align-items: center; gap: 10px;
    padding: 11px; border-radius: 14px; border: 1px solid var(--line);
    background: rgba(255,255,255,.055); cursor: pointer;
  }
  .room.selected { border-color: rgba(125,211,252,.75); background: rgba(125,211,252,.10); }
  .room.outdoor-muted { opacity: .48; filter: saturate(.55); }
  .swatch { width: 10px; height: 34px; border-radius: 99px; box-shadow: 0 0 18px currentColor; }
  .room b { font-size: 13px; }
  .room span { display: block; color: var(--muted); font-size: 12px; margin-top: 2px; }
  .score {
    min-width: 44px; min-height: 36px; display: grid; place-items: center;
    border-radius: 12px; font-size: 20px; font-weight: 820; font-variant-numeric: tabular-nums;
    border: 1px solid rgba(255,255,255,.16);
  }
  .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .metric {
    min-width: 0; min-height: 72px; padding: 11px 12px;
    border: 1px solid var(--line); border-radius: 13px; background: rgba(255,255,255,.055);
    display: grid; align-content: center;
  }
  .metric span {
    color: var(--muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: .045em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .metric strong {
    display: block; margin-top: 5px; font-size: clamp(17px, 1.45vw, 20px);
    font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .metric-icon { display: inline-flex; align-items: center; gap: 6px; }
  .air-quality {
    display: none; margin-top: 12px; padding: 12px; border-radius: 16px;
    border: 1px solid rgba(125,211,252,.18); background: rgba(125,211,252,.055);
  }
  .air-quality.visible { display: block; }
  .air-quality h2 { margin: 0 0 9px; }
  .air-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .action-card {
    margin-top: 12px; padding: 14px; border-radius: 16px;
    border: 1px solid rgba(52,211,153,.30); background: rgba(52,211,153,.08);
  }
  .action-card b { display: block; margin-bottom: 6px; font-size: 14px; }
  .action-card span { color: var(--muted); font-size: 12px; line-height: 1.45; }
  .fan-control {
    margin-top: 12px; padding: 14px; border-radius: 16px; border: 1px solid var(--line);
    background: rgba(255,255,255,.055); display: none;
  }
  .fan-control.visible { display: block; }
  .fan-control.pending {
    border-color: rgba(125,211,252,.36);
    background: linear-gradient(145deg, rgba(125,211,252,.10), rgba(255,255,255,.045));
  }
  .fan-control.stale {
    border-color: rgba(245,158,11,.34);
    background: linear-gradient(145deg, rgba(245,158,11,.09), rgba(255,255,255,.045));
  }
  .fan-head {
    align-items: center !important;
    margin-bottom: 8px !important;
  }
  .fan-command-chip {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    min-width: 64px; height: 28px; padding: 0 9px;
    border-radius: 999px; border: 1px solid rgba(226,232,240,.16);
    background: rgba(8,16,22,.20);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
  }
  .fan-status {
    width: 15px; height: 15px; display: inline-grid; place-items: center;
    border-radius: 99px; border: 1px solid rgba(226,232,240,.22);
    color: rgba(226,232,240,.86); font-size: 10px; line-height: 1;
  }
  .fan-status.synced {
    color: rgba(134,239,172,.96);
    border-color: rgba(52,211,153,.44);
    background: rgba(52,211,153,.12);
    box-shadow: 0 0 12px rgba(52,211,153,.20);
  }
  .fan-status.pending {
    position: relative; color: transparent;
    border-color: rgba(125,211,252,.60);
    background: rgba(125,211,252,.10);
    box-shadow: 0 0 12px rgba(125,211,252,.26);
  }
  .fan-status.pending::before,
  .fan-status.pending::after {
    content: ""; position: absolute; left: 4px; right: 4px; height: 3px;
    border-radius: 99px; background: rgba(125,211,252,.96);
  }
  .fan-status.pending::before { top: 3px; }
  .fan-status.pending::after { bottom: 3px; }
  .fan-status.pending { animation: fan-pending-spin 1.15s linear infinite; }
  .fan-status.stale {
    color: rgba(253,186,116,.95);
    border-color: rgba(245,158,11,.50);
    background: rgba(245,158,11,.12);
    box-shadow: 0 0 12px rgba(245,158,11,.22);
  }
  @keyframes fan-pending-spin { to { transform: rotate(180deg); } }
  .fan-sync {
    display: flex; align-items: center; justify-content: flex-end; gap: 8px;
    min-height: 14px; margin: 4px 0 0; color: rgba(203,213,225,.62); font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .fan-sync strong { color: rgba(226,232,240,.78); font-size: 10px; font-weight: 650; }
  .fan-sync:empty { display: none; }
  .fan-scale { display: flex; justify-content: space-between; color: var(--muted); font-size: 10px; margin-top: 8px; }
  .fan-model {
    margin-top: 12px; padding: 14px; border-radius: 16px; border: 1px solid var(--line);
    background: rgba(255,255,255,.055); display: none;
  }
  .fan-model.visible { display: block; }
  .fan-model-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .fan-model-item { padding: 10px; border-radius: 12px; background: rgba(8,16,22,.26); border: 1px solid rgba(226,232,240,.10); }
  .fan-model-item span { display: block; color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
  .fan-model-item strong { display: block; margin-top: 5px; font-size: 15px; font-variant-numeric: tabular-nums; }
  .notice { color: var(--muted); font-size: 12px; margin-top: 10px; min-height: 18px; }
  ::-webkit-scrollbar { width: 7px; }
  ::-webkit-scrollbar-thumb { background: rgba(226,232,240,.22); border-radius: 99px; }
  @media (max-width: 1040px) {
    main {
      height: auto; min-height: 100vh; grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "stage" "left" "right";
    }
    aside, section.stage, .right { overflow: visible; }
    .stage { height: 76svh; min-height: 560px; overflow: hidden; }
    .chart-wrap { min-width: 0; }
    .chart-control-strip { grid-template-columns: 1fr 1fr; }
    .tool-groups { grid-column: 1 / -1; display: grid; justify-content: flex-start; grid-template-columns: 1fr 1fr; }
    .control-cluster { flex-wrap: wrap; row-gap: 4px; }
    .tool-group { align-items: flex-start; padding-top: 5px; padding-bottom: 5px; }
  }
  @media (max-width: 720px) {
    :host { overflow-x: hidden; }
    main { padding: 8px; gap: 10px; overflow-x: hidden; }
    header { padding: 14px 16px 10px; }
    aside:first-child header { display: none; }
    .stage { height: auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    .topbar { display: contents; }
    .topbar-row {
      order: 1; padding: 10px 12px 8px; flex-wrap: wrap;
      border-bottom: 1px solid rgba(226,232,240,.12);
      background: linear-gradient(90deg, rgba(255,255,255,.035), rgba(52,211,153,.04));
    }
    .stage-title { flex-basis: 100%; min-width: 0; }
    .topbar p { font-size: 11px; max-width: 32ch; }
    .topbar h1 { flex-basis: 100%; min-width: 0; font-size: 16px; line-height: 1.15; }
    .topbar .status { margin-top: 0; padding: 5px 8px; min-height: 28px; font-size: 10.5px; }
    .badge, .pressure-pill { padding: 5px 8px; font-size: 10.5px; min-height: 28px; }
    .chart-control-strip {
      order: 3; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 7px; overflow: hidden; padding: 8px 12px 10px;
      border-top: 1px solid rgba(226,232,240,.10);
      background: linear-gradient(90deg, rgba(255,255,255,.025), rgba(52,211,153,.025));
    }
    .manual-range.visible { display: none; }
    .mini-control {
      grid-template-columns: minmax(70px, auto) minmax(70px, 1fr);
      min-width: 0; min-height: 38px; padding: 7px 9px;
    }
    .mini-control label { font-size: 10px; }
    .mini-control strong { font-size: 11px; }
    .tool-groups {
      grid-column: 1 / -1; display: grid; grid-template-columns: 1fr;
      gap: 7px; min-width: 0;
    }
    .tool-group {
      width: 100%; min-width: 0; display: grid; grid-template-columns: 72px 1fr; align-items: center; gap: 6px;
      padding: 6px; border: 1px solid rgba(226,232,240,.12); background: rgba(8,16,22,.15);
    }
    .tool-label { display: block; font-size: 8.5px; padding-left: 2px; }
    .control-cluster { flex-wrap: wrap; gap: 5px; min-width: 0; }
    .control-cluster .toggle {
      flex: 0 0 34px; width: 34px; height: 34px; min-height: 34px; padding: 0; justify-content: center;
    }
    .control-cluster .toggle .mini-icon { width: 22px; height: 22px; font-size: 11px; }
    .toggle-text { display: none; }
    .pressure-pill { width: fit-content; }
    .chart-wrap { order: 2; height: clamp(330px, 92vw, 430px); min-height: 330px; }
    .chart-legend { display: none; }
    .legend-item { font-size: 9.5px; }
    .chart-tooltip { max-width: 150px; font-size: 10.5px; padding: 7px 8px; }
    .chart-tooltip b { font-size: 11px; }
    .axis-title-overlay.x { bottom: 5px; font-size: 9.5px; }
    .axis-title-overlay.y { display: none; }
    .right .metric-grid, .air-grid { grid-template-columns: 1fr 1fr; }
    .metric { min-height: 66px; padding: 9px 10px; }
    .metric strong { font-size: 18px; }
  }
  @media (max-width: 1040px) and (max-height: 600px) {
    main { padding: 8px; gap: 10px; overflow-x: hidden; }
    aside:first-child header { display: none; }
    .stage { height: auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    .topbar { display: contents; }
    .topbar-row {
      order: 1; padding: 8px 12px 7px; flex-wrap: wrap;
      border-bottom: 1px solid rgba(226,232,240,.12);
      background: linear-gradient(90deg, rgba(255,255,255,.035), rgba(52,211,153,.04));
    }
    .stage-title { flex: 1 1 220px; min-width: 0; }
    .topbar h1 { min-width: 0; font-size: 14px; line-height: 1.1; }
    .topbar p { display: none; }
    .topbar .status, .badge, .pressure-pill { margin-top: 0; padding: 4px 7px; min-height: 26px; font-size: 10px; }
    .chart-wrap { order: 2; height: clamp(260px, 62svh, 360px); min-height: 260px; }
    .chart-control-strip {
      order: 3; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 6px; overflow: hidden; padding: 7px 12px 9px;
      border-top: 1px solid rgba(226,232,240,.10);
      background: linear-gradient(90deg, rgba(255,255,255,.025), rgba(52,211,153,.025));
    }
    .tool-groups { grid-column: 1 / -1; display: grid; justify-content: flex-start; grid-template-columns: 1fr 1fr; }
    .tool-group { padding: 5px 6px; border: 1px solid rgba(226,232,240,.12); background: rgba(8,16,22,.15); display: grid; }
    .toggle-text, .chart-legend, .axis-title-overlay.y, .manual-range.visible { display: none; }
    .tool-label { display: block; font-size: 8.5px; }
    .control-cluster .toggle { width: 32px; height: 32px; min-height: 32px; padding: 0; justify-content: center; }
    .control-cluster .toggle .mini-icon { width: 21px; height: 21px; font-size: 10px; }
    .mini-control { min-height: 40px; padding: 6px 8px; }
    .mini-control label { font-size: 9.5px; }
    .mini-control strong { font-size: 10.5px; }
    .axis-title-overlay.x { bottom: 5px; font-size: 9px; }
    .chart-tooltip { max-width: 148px; font-size: 10px; padding: 7px 8px; }
  }
`;

const template = `
  <main>
    <aside class="glass">
      <header>
        <h1>Vesta Psychro</h1>
        <p>Cockpit psychrométrique temps réel : confort, trajectoires, cadrage et actions climatiques par pièce.</p>
        <button class="status" type="button" data-config-open title="Configurer les sources live"><i class="dot"></i><span class="live-label">Source live</span></button>
      </header>
      <div class="pane-scroll">
        <div class="sensor-toolbar">
          <button class="status" type="button" data-config-open title="Configurer les sources live"><i class="dot"></i><span class="live-label">Source live</span></button>
          <strong class="sensor-count" id="sensor-count">-- capteurs actifs</strong>
        </div>
        <div class="trace-control" title="Durée d'historique affichée pour les trajectoires. 0 h masque les traces.">
          <label><span><i class="context-symbol">〰</i>Traces historiques</span><strong id="label-trail">12 h</strong></label>
          <div class="trace-instrument" id="trail-instrument">
            <span class="instrument-track"></span>
            <input id="trail-hours" type="range" min="0" max="24" step="1" value="12">
          </div>
        </div>
        <section class="panel-section outdoor-zone" id="outdoor-zone">
          <button class="section-title" data-section-toggle="outdoor-list-wrap">
            <h2>Extérieur</h2><span class="section-metric" id="comfort-basis-chip" title="Tpma Givoni indisponible">☼ --</span><span class="section-arrow">⌄</span>
          </button>
          <div class="section-body" id="outdoor-list-wrap">
            <div class="room-list" id="outdoor-list"></div>
          </div>
        </section>
        <section class="panel-section" id="rooms-section">
          <button class="section-title" data-section-toggle="room-list-wrap">
            <h2>Intérieur</h2><span class="section-arrow">⌄</span>
          </button>
          <div class="section-body" id="room-list-wrap">
            <div class="room-list" id="room-list"></div>
          </div>
        </section>
      </div>
    </aside>
    <section class="stage glass">
      <div class="topbar">
        <div class="topbar-row">
          <div class="stage-title">
            <h1>Vesta Psychro</h1>
            <p>Cockpit psychrométrique temps réel : confort, trajectoires, cadrage et actions climatiques par pièce.</p>
          </div>
          <span class="pressure-pill" title="Pression atmosphérique mesurée"><span class="context-symbol">◉</span><strong id="label-pressure">-- hPa</strong></span>
          <span class="badge" id="clock">--:--:--</span>
          <span class="badge" id="global-score">Score --</span>
        </div>
        <div class="chart-control-strip">
          <div class="tool-groups">
            <div class="tool-group">
              <span class="tool-label">Affichage</span>
              <div class="control-cluster">
                <button class="toggle active" data-toggle="zones" title="Afficher les domaines bioclimatiques"><span class="mini-icon">▱</span><span class="toggle-text">Zones</span></button>
                <button class="toggle active" data-toggle="vectors" title="Afficher les vecteurs d'action"><span class="mini-icon">↘</span><span class="toggle-text">Actions</span></button>
                <button class="toggle" data-toggle="floorLinks" title="Relier les capteurs par étage Home Assistant"><span class="mini-icon">⌁</span><span class="toggle-text">Étages</span></button>
              </div>
            </div>
            <div class="tool-group">
              <span class="tool-label">Cadrage</span>
              <div class="control-cluster">
                <button class="toggle active" data-range="auto" title="Cadrage automatique"><span class="mini-icon">◎</span><span class="toggle-text">Auto</span></button>
                <button class="toggle" data-range="selected" title="Cadrage sur la pièce sélectionnée"><span class="mini-icon">●</span><span class="toggle-text">Pièce</span></button>
                <button class="toggle" data-range="comfort" title="Cadrage zone de confort"><span class="mini-icon">◇</span><span class="toggle-text">Confort</span></button>
                <button class="toggle" data-range="full" title="Cadrage complet"><span class="mini-icon">□</span><span class="toggle-text">Complet</span></button>
                <button class="toggle" data-range="manual" title="Cadrage manuel par rectangle, molette conservée"><span class="mini-icon">⌕</span><span class="toggle-text">Manuel</span></button>
              </div>
            </div>
          </div>
        </div>
        <div class="control manual-range" id="manual-range">
          <div class="range-pair">
            <label>T min <strong id="label-x-min">16 °C</strong></label>
            <label>T max <strong id="label-x-max">30 °C</strong></label>
          </div>
          <div class="dual-slider" id="manual-x-dual">
            <span class="dual-track"></span>
            <input id="manual-x-min" type="range" min="-15" max="38" step="0.5" value="16">
            <input id="manual-x-max" type="range" min="-15" max="38" step="0.5" value="30">
          </div>
          <div class="range-hints"><span>-15 °C</span><span>0 °C</span><span>38 °C</span></div>
          <div class="range-pair" style="margin-top:10px">
            <label>HA min <strong id="label-y-min">2 g/kg</strong></label>
            <label>HA max <strong id="label-y-max">16 g/kg</strong></label>
          </div>
          <div class="dual-slider" id="manual-y-dual">
            <span class="dual-track"></span>
            <input id="manual-y-min" type="range" min="0" max="24" step="0.5" value="2">
            <input id="manual-y-max" type="range" min="0" max="24" step="0.5" value="16">
          </div>
          <div class="range-hints"><span>0 g/kg</span><span>12</span><span>24 g/kg</span></div>
        </div>
      </div>
      <div class="chart-wrap">
        <div id="chart"></div>
        <div class="chart-hit-layer" id="chart-hit-layer"></div>
        <div class="chart-tooltip" id="chart-tooltip"></div>
        <div class="chart-legend" id="chart-legend"></div>
        <div class="comfort-target" id="comfort-target" tabindex="0">
          <span class="ct-icon" aria-hidden="true">◎</span>
          <span class="ct-text" id="comfort-target-text">Cible confort --</span>
        </div>
        <span class="axis-title-overlay x">Température sèche (°C)</span>
        <span class="axis-title-overlay y">Humidité absolue (g/kg d'air sec)</span>
      </div>
    </section>
    <aside class="right glass">
      <header>
        <h1 id="selected-title">Living</h1>
        <p id="selected-subtitle">Point courant, dérive nocturne et action recommandée.</p>
      </header>
      <div class="pane-scroll">
        <div class="metric-grid">
          <div class="metric" title="Température sèche"><span class="metric-icon">℃ T sec</span><strong id="m-temp">--</strong></div>
          <div class="metric" title="Humidité relative"><span class="metric-icon">◌ HR</span><strong id="m-rh">--</strong></div>
          <div class="metric" title="Humidité absolue, rapport d'humidité de l'air sec"><span class="metric-icon">≋ HA</span><strong id="m-ha">--</strong></div>
          <div class="metric" title="Enthalpie de l'air humide"><span class="metric-icon">∑ Enthalpie</span><strong id="m-h">--</strong></div>
          <div class="metric" title="Point de rosée"><span class="metric-icon">◇ Rosée</span><strong id="m-dew">--</strong></div>
          <div class="metric" title="Température de bulbe humide"><span class="metric-icon">≈ Bulbe humide</span><strong id="m-wet">--</strong></div>
        </div>
        <div class="air-quality" id="air-quality">
          <h2>Qualité d'air</h2>
          <div class="air-grid">
            <div class="metric" title="Dioxyde de carbone"><span class="metric-icon">CO₂</span><strong id="aq-co2">--</strong></div>
            <div class="metric" title="Composés organiques volatils"><span class="metric-icon">COV</span><strong id="aq-voc">--</strong></div>
            <div class="metric" title="Bruit ambiant"><span class="metric-icon">dB</span><strong id="aq-noise">--</strong></div>
            <div class="metric" title="Éclairement"><span class="metric-icon">lx</span><strong id="aq-light">--</strong></div>
          </div>
        </div>
        <div class="action-card">
          <b id="action-title">Action</b>
          <span id="action-detail">--</span>
        </div>
        <div class="fan-model" id="fan-model">
          <h2>Modele air</h2>
          <div class="fan-model-grid">
            <div class="fan-model-item"><span>Volume pièce</span><strong id="fm-volume">--</strong></div>
            <div class="fan-model-item"><span>Debit nominal</span><strong id="fm-airflow">--</strong></div>
            <div class="fan-model-item"><span>Vitesse anneau</span><strong id="fm-annulus">--</strong></div>
            <div class="fan-model-item"><span>Air ressenti</span><strong id="fm-occupied">--</strong></div>
            <div class="fan-model-item"><span>Aspiration</span><strong id="fm-aspiration">--</strong></div>
            <div class="fan-model-item"><span>Volumes/h</span><strong id="fm-recirculation">--</strong></div>
            <div class="fan-model-item"><span>Coeff. ressenti</span><strong id="fm-transfer">--</strong></div>
            <div class="fan-model-item"><span>Coeff. plafond</span><strong id="fm-aspiration-factor">--</strong></div>
            <div class="fan-model-item"><span>Source cmd</span><strong id="fm-command-source">--</strong></div>
            <div class="fan-model-item"><span>Relation</span><strong id="fm-command-relation">--</strong></div>
          </div>
        </div>
        <div class="fan-control" id="fan-control">
          <label class="fan-head">
            <span id="fan-control-name">Ventilateur</span>
            <strong class="fan-command-chip" id="fan-command-chip">
              <i class="fan-status synced" id="fan-status-icon">✓</i>
              <span id="fan-control-value">0</span>
            </strong>
          </label>
          <div class="instrument fan" id="fan-command-instrument">
            <span class="instrument-track"></span>
            <span class="zero-marker"></span>
            <input id="fan-command" type="range" min="-6" max="6" step="1" value="0">
            <div class="range-hints"><span>Aspiration</span><span>⏻</span><span>Soufflage</span></div>
          </div>
          <div class="fan-sync" id="fan-sync"><strong id="fan-sync-label">retour confirmé</strong></div>
        </div>
        <div class="notice" id="notice"></div>
      </div>
    </aside>
    <div class="config-modal" id="config-modal" aria-hidden="true">
      <div class="config-sheet">
        <div class="config-head">
          <div>
            <h1>Connectivité</h1>
            <p>Live, historique et mapping — les secrets (tokens InfluxDB, MQTT, API) restent côté serveur.</p>
          </div>
          <button class="config-close" id="config-close" title="Fermer">×</button>
        </div>
        <div class="config-tabs" role="tablist">
          <button class="config-tab active" type="button" data-tab="live" role="tab">Live</button>
          <button class="config-tab" type="button" data-tab="history" role="tab">Historique</button>
          <button class="config-tab" type="button" data-tab="mapping" role="tab">Mapping</button>
        </div>
        <div class="config-body">
          <section class="config-pane active" data-pane="live">
            <div class="conn-status" id="conn-live-status"><i class="dot"></i><span>État inconnu</span></div>
            <div class="conn-ha-note" id="conn-ha-note" hidden>En mode Home Assistant, le transport est la box (states + Recorder) — la source se configure dans Home Assistant, pas ici.</div>
            <div class="conn-endpoints" id="conn-live-endpoints">
              <div class="conn-endpoints-label">API de ce hub — à renseigner comme « Système Vesta distant (API) » dans un autre hub</div>
              <div class="conn-endpoint-row"><span>Live (SSE)</span><code id="ep-stream-url">—</code><button class="toggle" type="button" data-copy="ep-stream-url">Copier</button></div>
            </div>
            <div class="conn-mapping-head">Sources live enregistrées — une seule active à la fois</div>
            <div class="conn-profiles" id="conn-live-profiles"></div>
            <div class="conn-config" id="conn-config">
              <div class="conn-field"><label>Nom du profil</label><input id="cf-live-name" placeholder="Ex. Capteurs du salon"></div>
              <div class="conn-field">
                <label>Source live</label>
                <select id="conn-live-select">
                  <option value="file">Fichier JSON</option>
                  <option value="mqtt">MQTT (push temps réel)</option>
                  <option value="history">Basé sur l'historique récent</option>
                  <option value="remote">Système Vesta distant (API)</option>
                </select>
              </div>
              <div class="conn-group" data-group="live-file">
                <div class="conn-field"><label>Fichier de valeurs (JSON)</label><div class="conn-file"><input id="cf-values" placeholder="examples/latest_values.json"><button class="toggle" type="button" data-browse="cf-values">Parcourir</button></div></div>
              </div>
              <div class="conn-group" data-group="mqtt">
                <div class="conn-field"><label>Hôte broker</label><input id="cf-mqtt-host" placeholder="127.0.0.1"></div>
                <div class="conn-field"><label>Port</label><input id="cf-mqtt-port" type="number" placeholder="1883"></div>
                <div class="conn-field"><label>Base topic</label><input id="cf-mqtt-topic" placeholder="vesta"></div>
                <div class="conn-field"><label>Utilisateur</label><input id="cf-mqtt-user" autocomplete="off" placeholder="(optionnel)"></div>
                <div class="conn-field"><label>Mot de passe <span class="conn-hint">(jamais réaffiché)</span></label><input id="cf-mqtt-pass" type="password" autocomplete="off" placeholder="(optionnel)"></div>
              </div>
              <div class="conn-group" data-group="live-remote">
                <div class="conn-field"><label>URL du système Vesta distant</label><input id="cf-live-remote-url" placeholder="http://192.168.1.50:8770"></div>
              </div>
              <div class="conn-note" data-group="live-history" hidden>Le live reprend le backend choisi dans l'onglet <strong>Historique</strong> (sa valeur la plus récente). Idéal avec InfluxDB ; ajoutez MQTT pour un live plus frais tout en gardant InfluxDB en historique.</div>
              <div class="config-actions">
                <button class="toggle" type="button" id="conn-new-live">Nouveau profil</button>
                <button class="toggle" type="button" id="conn-test-live">Tester</button>
                <button class="toggle active" type="button" id="conn-save-live">Enregistrer le profil</button>
              </div>
            </div>
            <div class="conn-rows">
              <div class="conn-row"><span>Transport actif</span><strong id="conn-live-source">—</strong></div>
              <div class="conn-row"><span>Dernier rafraîchissement</span><strong id="conn-live-refresh">—</strong></div>
              <div class="conn-row"><span>Détail</span><strong id="conn-live-detail">—</strong></div>
              <div class="conn-row conn-error" id="conn-live-error-row" hidden><span>Erreur</span><strong id="conn-live-error">—</strong></div>
            </div>
          </section>
          <section class="config-pane" data-pane="history">
            <div class="conn-endpoints" id="conn-hist-endpoints">
              <div class="conn-endpoints-label">API de ce hub — à renseigner comme « Système Vesta distant (API) » dans un autre hub</div>
              <div class="conn-endpoint-row"><span>Historique</span><code id="ep-history-url">—</code><button class="toggle" type="button" data-copy="ep-history-url">Copier</button></div>
            </div>
            <div class="conn-mapping-head">Sources d'historique enregistrées — une seule active à la fois</div>
            <div class="conn-profiles" id="conn-hist-profiles"></div>
            <div class="conn-config" id="conn-hist-config">
              <div class="conn-field"><label>Nom du profil</label><input id="cf-hist-name" placeholder="Ex. InfluxDB local"></div>
              <div class="conn-field">
                <label>Source d'historique</label>
                <select id="conn-hist-select">
                  <option value="memory">Mémoire (tampon circulaire)</option>
                  <option value="influx">InfluxDB</option>
                  <option value="file">Fichier d'historique (JSON)</option>
                  <option value="remote">Système Vesta distant (API)</option>
                </select>
              </div>
              <div class="conn-group" data-group="hist-influx">
                <div class="conn-field"><label>URL InfluxDB</label><input id="cf-influx-url" placeholder="http://localhost:8086"></div>
                <div class="conn-field"><label>Organisation</label><input id="cf-influx-org" placeholder="vesta"></div>
                <div class="conn-field"><label>Bucket</label><input id="cf-influx-bucket" placeholder="homeassistant"></div>
                <div class="conn-field"><label>Token <span class="conn-hint">(envoyé au serveur, jamais réaffiché ; vide = variable d'env)</span></label><input id="cf-influx-token" type="password" autocomplete="off" placeholder="•••••"></div>
              </div>
              <div class="conn-group" data-group="hist-file">
                <div class="conn-field"><label>Fichier d'historique (JSON)</label><div class="conn-file"><input id="cf-history-path" placeholder="/data/vesta_history.json"><button class="toggle" type="button" data-browse="cf-history-path">Parcourir</button></div></div>
              </div>
              <div class="conn-group" data-group="hist-remote">
                <div class="conn-field"><label>URL du système Vesta distant</label><input id="cf-hist-remote-url" placeholder="http://192.168.1.50:8770"></div>
              </div>
              <div class="conn-note" data-group="hist-memory">La mémoire accumule l'historique observé depuis le démarrage du serveur — sans dépendance, mais perdu au redémarrage.</div>
              <div class="conn-field">
                <label>Fenêtre de test</label>
                <select id="conn-hist-window">
                  <option value="1h">1 h</option>
                  <option value="12h" selected>12 h</option>
                  <option value="24h">24 h</option>
                  <option value="7d">7 j</option>
                </select>
              </div>
              <div class="config-actions">
                <button class="toggle" type="button" id="conn-new-hist">Nouveau profil</button>
                <button class="toggle" type="button" id="conn-test-hist">Tester l'historique</button>
                <button class="toggle active" type="button" id="conn-save-hist">Enregistrer le profil</button>
              </div>
            </div>
            <div class="conn-rows">
              <div class="conn-row"><span>Fournisseur actif</span><strong id="conn-hist-provider">—</strong></div>
            </div>
            <div class="conn-result" id="conn-hist-result">Lancez un test pour mesurer la profondeur disponible.</div>
          </section>
          <section class="config-pane" data-pane="mapping">
            <div class="conn-ha-note" id="map-ha-note" hidden>En mode Home Assistant, le mapping vient des entités HA (constante CONFIG du panel) — l'éditeur ci-dessous est actif en mode portable.</div>
            <div class="map-ref">
              <div class="config-actions" style="justify-content:flex-start">
                <button class="toggle" type="button" id="map-discover">Découvrir le schéma InfluxDB</button>
                <span class="conn-hint" id="map-discover-status"></span>
              </div>
              <div class="map-ref-body" id="map-ref-body" hidden></div>
              <div class="config-actions" style="justify-content:flex-start">
                <button class="toggle" type="button" id="map-import-remote">Importer un système Vesta distant</button>
                <input id="map-remote-url" placeholder="http://192.168.1.50:8770" style="flex:1; min-width:160px; border:0; outline:0; border-radius:10px; background:rgba(8,16,22,.46); color:var(--text); padding:9px 10px; font:inherit; font-size:12px;">
                <span class="conn-hint" id="map-import-status"></span>
              </div>
            </div>
            <div class="conn-mapping-head">Espaces &amp; métriques — liez les séries source à <code>&lt;espace&gt;.&lt;métrique&gt;</code> et catégorisez</div>
            <div class="map-spaces" id="map-spaces"></div>
            <div class="config-actions" style="justify-content:space-between">
              <button class="toggle" type="button" id="map-add-space">+ Ajouter un espace</button>
              <button class="toggle active" type="button" id="map-apply">Appliquer le mapping</button>
            </div>
            <div class="conn-rows">
              <div class="conn-row"><span>Pression</span><strong id="conn-pressure">—</strong></div>
              <div class="conn-row"><span>Secret</span><strong>Côté serveur uniquement</strong></div>
            </div>
            <div class="config-field full">
              <label>Export YAML (à coller dans config/site_house.yaml)</label>
              <textarea id="influx-snippet" readonly></textarea>
            </div>
            <div class="config-actions">
              <button class="toggle" type="button" id="influx-generate">Générer</button>
              <button class="toggle active" type="button" id="influx-copy">Copier</button>
            </div>
          </section>
          <div class="conn-browser" id="conn-browser" hidden>
            <div class="conn-browser-head">
              <button class="toggle" type="button" id="conn-browser-up">↑ Dossier parent</button>
              <span class="conn-browser-path" id="conn-browser-path">—</span>
              <button class="config-close" type="button" id="conn-browser-close">×</button>
            </div>
            <div class="conn-browser-list" id="conn-browser-list"></div>
          </div>
        </div>
      </div>
    </div>
  </main>
`;

const pSat = T => 6.112 * Math.exp((17.67 * T) / (T + 243.5));
const mixing = (T, rh, P = P0) => {
  const pv = pSat(T) * Math.max(0, Math.min(100, rh)) / 100;
  return 621.98 * pv / Math.max(P - pv, .01);
};
const rhFromMixing = (T, W, P = P0) => {
  const pv = W * P / (621.98 + Math.max(W, 0));
  return Math.max(0, Math.min(100, pv / pSat(T) * 100));
};
const dewPoint = (T, rh) => {
  const a = 17.67, b = 243.5;
  const ln = Math.log(Math.max(rh / 100, .001));
  const alpha = a * T / (b + T);
  return b * (alpha + ln) / (a - alpha - ln);
};
const wetBulb = (T, rh, P) => {
  const Td = dewPoint(T, rh);
  return T - (0.00066 * P / 10) * (T - Td) * (1 + 0.00115 * Td);
};
const enthalpy = (T, W) => 1.006 * T + W / 1000 * (2501 + 1.86 * T);
const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function hexToRgb(hex) {
  const clean = String(hex || "#ffffff").replace("#", "");
  const value = Number.parseInt(clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean, 16);
  if (!Number.isFinite(value)) return { r: 255, g: 255, b: 255 };
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

function polygonCentroid(poly) {
  if (!Array.isArray(poly) || poly.length < 3) return null;
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-6) return null;
  return { t: cx / (6 * area), w: cy / (6 * area) };
}

function scalePolygon(poly, center, factor) {
  return poly.map(([t, w]) => [
    center.t + (t - center.t) * factor,
    center.w + (w - center.w) * factor
  ]);
}

function polygonContains(poly, point) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = ((yi > point.w) !== (yj > point.w)) &&
      point.t < (xj - xi) * (point.w - yi) / ((yj - yi) || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function scoreColor(score) {
  const s = clamp(score, 0, 100);
  const hue = 4 + s * 1.35;
  const light = 38 + s * .18;
  return `hsl(${hue} 78% ${light}%)`;
}

function scoreBgColor(score, alpha) {
  const s = clamp(score, 0, 100);
  const hue = 4 + s * 1.35;
  return `hsla(${hue} 78% 50% / ${alpha})`;
}

function floorSortKey(floor) {
  const label = String(floor || "").toLowerCase();
  if (label.includes("rdc") || label.includes("rez")) return 0;
  const numeric = Number(label.replace(/[^\d.-]/g, ""));
  if (Number.isFinite(numeric)) return numeric;
  if (label.includes("ext")) return -10;
  return 99;
}

function ensurePlotly() {
  if (window.Plotly) return Promise.resolve(window.Plotly);
  if (!window.__vestaPlotlyPromise) {
    window.__vestaPlotlyPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PLOTLY_URL;
      script.async = true;
      script.onload = () => resolve(window.Plotly);
      script.onerror = () => reject(new Error(`Unable to load ${PLOTLY_URL}`));
      document.head.appendChild(script);
    });
  }
  return window.__vestaPlotlyPromise;
}

class VestaPsychroPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${css}</style>${template}`;
    this.state = {
      zones: true,
      trails: true,
      vectors: true,
      floorLinks: false,
      night: false,
      rangeMode: "auto",
      selected: "living",
      pressure: 1009,
      historyHours: 12,
      comfortBasisDays: COMFORT_BASIS_DAYS,
      historyStatus: "pending",
      manualRange: { xMin: 16, xMax: 30, yMin: 2, yMax: 16 },
      outdoorSelected: new Set(CONFIG.rooms.filter(room => room.outdoor).map(room => room.id))
    };
    this.rooms = CONFIG.rooms.map(room => ({ ...room, t: NaN, rhValue: NaN, w: NaN, history: [] }));
    this.outdoorComfortHistory = [];
    this.comfortBasis = null;
    this._plotlyReady = false;
    this._historyTimer = 0;
    this._historyKey = "";
    this._comfortHistoryTimer = 0;
    this._fanPending = new Map();
    this._fanSendTimers = new Map();
    this._fanEditing = false;
    this._comfortHistoryKey = "";
    this._bound = false;
    this._plotEventsBound = false;
    this._clampingPlot = false;
    this._lastTooltipModel = null;
    this._lastRanges = { x: [X_DEFAULT_MIN, X_MAX], y: [Y_MIN, Y_MAX] };
    this._areaById = new Map();
    this._floorById = new Map();
    this._registryLoadStarted = false;
  }

  connectedCallback() {
    this.bind();
    ensurePlotly()
      .then(() => {
        this._plotlyReady = true;
        this.plot();
      })
      .catch(error => this.setNotice(error.message));
    this._clockTimer = window.setInterval(() => {
      this.$("clock").textContent = new Date().toLocaleTimeString("fr-FR");
    }, 1000);
  }

  disconnectedCallback() {
    window.clearInterval(this._clockTimer);
    window.clearTimeout(this._historyTimer);
    window.clearTimeout(this._comfortHistoryTimer);
  }

  set hass(hass) {
    this._hass = hass;
    this.scheduleRegistryLoad();
    this.applyHassState();
    this.scheduleHistoryLoad(false);
    this.scheduleComfortHistoryLoad(false);
    this.plot();
  }

  get hass() {
    return this._hass;
  }

  // Portable bridge: feed the panel a CockpitView produced by the Python engine
  // (build_cockpit_view) instead of Home Assistant entities. Setting this puts
  // the panel in "portable" mode — it renders from the view's points/scores and
  // skips Home-Assistant-only paths (entity registry, history WebSocket, fan
  // command services). See src/vesta_bioclimatic/server.py.
  set cockpit(view) {
    if (!view || !Array.isArray(view.points)) return;
    const firstView = !this._portable;
    this._portable = true;
    this.ingestCockpit(view);
    if (this._plotlyReady) this.plot();
    // Pull trails once on the first view and whenever the trail window is on;
    // throttled so repeated live updates don't spam /api/history.
    if (this.state.trails && (firstView || !this._cockpitHistoryAt || Date.now() - this._cockpitHistoryAt > 20000)) {
      this._cockpitHistoryAt = Date.now();
      this.loadCockpitHistory();
    }
  }

  get cockpit() {
    return this._cockpit;
  }

  // Palette reused for portable points (Home Assistant mode carries its own
  // per-room colors in CONFIG; the CockpitView does not).
  portableColor(index) {
    const palette = ["#60a5fa", "#34d399", "#f59e0b", "#a78bfa", "#22d3ee", "#fb7185", "#f472b6", "#fbbf24", "#4ade80"];
    return palette[index % palette.length];
  }

  ingestCockpit(view) {
    this._cockpit = view;
    if (Number.isFinite(view.pressure_hpa)) this.state.pressure = view.pressure_hpa;
    const labels = view.group_labels || {};
    const existingColors = new Map(this.rooms.map(room => [room.id, room.color]));
    // Carry trails across rebuilds: every live update rebuilds this.rooms, so
    // without this the accumulated history would be wiped between (throttled)
    // /api/history reloads and the trail would flicker to nothing.
    const existingHistory = new Map(this.rooms.map(room => [room.id, room.history]));
    let colorIndex = 0;
    this.rooms = (view.points || []).map(point => {
      const outdoor = point.kind === "exterior";
      const w = Number.isFinite(point.humidity_ratio_g_kg)
        ? point.humidity_ratio_g_kg
        : mixing(point.temp_c, point.rh_pct, this.state.pressure);
      const updated = point.updated_at ? new Date(point.updated_at) : null;
      return {
        id: point.key,
        name: point.label,
        floor: outdoor ? "Extérieur" : (labels[point.group] || point.group || "Intérieur"),
        outdoor,
        color: existingColors.get(point.key) || this.portableColor(colorIndex++),
        temp: null,
        rh: null,
        t: point.temp_c,
        rhValue: point.rh_pct,
        w,
        history: existingHistory.get(point.key) || [],
        pyScore: Number.isFinite(point.score) ? point.score : null,
        updatedLabel: updated && Number.isFinite(updated.getTime())
          ? updated.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
          : "live"
      };
    });
    this.state.outdoorSelected = new Set(this.rooms.filter(room => room.outdoor).map(room => room.id));
    if (!this.rooms.some(room => room.id === this.state.selected)) {
      const firstInterior = this.rooms.find(room => !room.outdoor);
      if (firstInterior) this.state.selected = firstInterior.id;
    }
    this.comfortBasis = null;
    this._globalScore = Number.isFinite(view.global_score) ? view.global_score : null;
    this.shadowRoot.querySelectorAll(".live-label").forEach(label => { label.textContent = "Source portable"; });
    this.$("label-pressure").textContent = `${this.state.pressure.toFixed(1)} hPa`;
  }

  set panel(panel) {
    this._panel = panel;
    const hours = Number(panel?.config?.history_hours);
    if (Number.isFinite(hours)) {
      this.state.historyHours = Math.max(0, Math.min(24, hours));
      this.state.trails = this.state.historyHours > 0;
      this.$("trail-hours").value = String(this.state.historyHours);
      this.updateTraceLabel();
      this.updateInstrumentControls();
    }
  }

  get panel() {
    return this._panel;
  }

  $(id) {
    return this.shadowRoot.getElementById(id);
  }

  scheduleRegistryLoad() {
    if (!this._hass?.callWS || this._registryLoadStarted) return;
    this._registryLoadStarted = true;
    window.setTimeout(() => this.loadHaRegistries(), 80);
  }

  async loadHaRegistries() {
    if (!this._hass?.callWS) return;
    try {
      const [areas, floors] = await Promise.all([
        this._hass.callWS({ type: "config/area_registry/list" }),
        this._hass.callWS({ type: "config/floor_registry/list" })
      ]);
      this._areaById = new Map((areas || []).map(area => [area.area_id || area.id, area]));
      this._floorById = new Map((floors || []).map(floor => [floor.floor_id || floor.id, floor]));
      this.applyRoomRegistryMetadata();
      this.plot();
    } catch (error) {
      this.setNotice(`Registre zones/étages HA indisponible : ${error.message || error}`);
    }
  }

  applyRoomRegistryMetadata() {
    this.rooms.forEach(room => {
      const area = this._areaById.get(room.areaId || room.id);
      if (!area) return;
      room.areaName = area.name || room.name;
      room.floorId = area.floor_id || room.floorId;
      const floor = this._floorById.get(room.floorId);
      room.floor = floor?.name || room.floor || "Sans étage";
      if (!this._hass?.states?.[room.temp] && area.temperature_entity_id) room.temp = area.temperature_entity_id;
      if (!this._hass?.states?.[room.rh] && area.humidity_entity_id) room.rh = area.humidity_entity_id;
    });
  }

  bind() {
    if (this._bound) return;
    this._bound = true;
    this.shadowRoot.querySelectorAll(".toggle[data-toggle]").forEach(button => {
      button.addEventListener("click", () => {
        const key = button.dataset.toggle;
        this.state[key] = !this.state[key];
        button.classList.toggle("active", this.state[key]);
        this.plot();
      });
    });
    this.shadowRoot.querySelectorAll("[data-range]").forEach(button => {
      button.addEventListener("click", () => {
        this.state.rangeMode = button.dataset.range;
        this.shadowRoot.querySelectorAll("[data-range]").forEach(item => item.classList.toggle("active", item === button));
        this.updateManualRangeControls();
        this.plot();
      });
    });
    this.shadowRoot.querySelectorAll("[data-section-toggle]").forEach(button => {
      button.addEventListener("click", () => {
        const section = button.closest(".panel-section");
        section?.classList.toggle("collapsed");
      });
    });
    this.shadowRoot.addEventListener("click", event => {
      const opener = event.target?.closest?.("[data-config-open]");
      if (!opener) return;
      event.preventDefault();
      event.stopPropagation();
      this.showConfigModal();
    }, true);
    ["manual-x-min", "manual-x-max", "manual-y-min", "manual-y-max"].forEach(id => {
      this.$(id).addEventListener("input", () => {
        this.state.manualRange = this.normalizedManualRange();
        this.updateManualRangeControls();
        if (this.state.rangeMode === "manual") this.plot();
      });
    });
    this.$("trail-hours").addEventListener("input", event => {
      this.state.historyHours = Number(event.target.value);
      this.state.trails = this.state.historyHours > 0;
      this.updateTraceLabel();
      this.updateInstrumentControls();
      this.scheduleHistoryLoad(true);
      this.plot();
    });
    const fanSlider = this.$("fan-command");
    fanSlider.addEventListener("pointerdown", () => { this._fanEditing = true; });
    fanSlider.addEventListener("touchstart", () => { this._fanEditing = true; }, { passive: true });
    fanSlider.addEventListener("focus", () => { this._fanEditing = true; });
    fanSlider.addEventListener("blur", () => { this._fanEditing = false; });
    fanSlider.addEventListener("change", event => {
      this._fanEditing = false;
      this.sendFanCommand(Number(event.target.value));
    });
    fanSlider.addEventListener("input", event => {
      const room = this.selectedRoom();
      const state = room?.fanCommand ? this.fanCommandState(room) : {};
      this.updateFanDisplay(Number(event.target.value), { ...state, preview: true });
    });
    this.$("config-close")?.addEventListener("click", () => this.hideConfigModal());
    this.$("config-modal")?.addEventListener("click", event => {
      if (event.target === this.$("config-modal")) this.hideConfigModal();
    });
    this.$("influx-generate")?.addEventListener("click", () => this.generateInfluxSnippet());
    this.$("influx-copy")?.addEventListener("click", () => this.copyInfluxSnippet());
    this.shadowRoot.querySelectorAll(".config-tab").forEach(tab => {
      tab.addEventListener("click", () => this.switchConfigTab(tab.dataset.tab));
    });
    this.$("conn-test-live")?.addEventListener("click", () => this.refreshConnectivity(true));
    this.$("conn-test-hist")?.addEventListener("click", () => this.testHistory());
    this.$("conn-live-select")?.addEventListener("change", () => this.updateConnGroups());
    this.$("conn-hist-select")?.addEventListener("change", () => this.updateConnGroups());
    this.$("conn-new-live")?.addEventListener("click", () => this.newProfile("live"));
    this.$("conn-new-hist")?.addEventListener("click", () => this.newProfile("history"));
    this.$("conn-save-live")?.addEventListener("click", () => this.saveProfile("live"));
    this.$("conn-save-hist")?.addEventListener("click", () => this.saveProfile("history"));
    this.$("conn-live-profiles")?.addEventListener("click", event => this.onProfileListClick(event));
    this.$("conn-hist-profiles")?.addEventListener("click", event => this.onProfileListClick(event));
    this.shadowRoot.querySelectorAll("[data-copy]").forEach(btn => {
      btn.addEventListener("click", () => this.copyEndpoint(btn.dataset.copy));
    });
    this.shadowRoot.querySelectorAll("[data-browse]").forEach(btn => {
      btn.addEventListener("click", () => this.openBrowser(btn.dataset.browse));
    });
    this.$("conn-browser-up")?.addEventListener("click", () => this.browseTo(this._browseParent));
    this.$("conn-browser-close")?.addEventListener("click", () => { this.$("conn-browser").hidden = true; });
    this.$("map-discover")?.addEventListener("click", () => this.discoverInflux());
    this.$("map-import-remote")?.addEventListener("click", () => this.importRemoteMapping());
    this.$("map-add-space")?.addEventListener("click", () => this.addMapSpace());
    this.$("map-apply")?.addEventListener("click", () => this.applyMapping());
    this.$("map-spaces")?.addEventListener("click", event => this.onMapSpacesClick(event));
    const chartWrap = this.shadowRoot.querySelector(".chart-wrap");
    chartWrap?.addEventListener("mousemove", event => this.updateChartTooltip(event), true);
    chartWrap?.addEventListener("pointermove", event => this.updateChartTooltip(event), true);
    chartWrap?.addEventListener("mouseleave", () => this.hideChartTooltip(), true);
    this.updateManualRangeControls();
    this.updateInstrumentControls();
  }

  normalizedManualRange() {
    let xMin = clamp(Number(this.$("manual-x-min").value), X_MIN, X_MAX - 1);
    let xMax = clamp(Number(this.$("manual-x-max").value), X_MIN + 1, X_MAX);
    let yMin = clamp(Number(this.$("manual-y-min").value), Y_MIN, Y_MAX - 1);
    let yMax = clamp(Number(this.$("manual-y-max").value), Y_MIN + 1, Y_MAX);
    if (xMax - xMin < 2) xMax = clamp(xMin + 2, X_MIN + 2, X_MAX);
    if (xMax - xMin < 2) xMin = clamp(xMax - 2, X_MIN, X_MAX - 2);
    if (yMax - yMin < 1.5) yMax = clamp(yMin + 1.5, Y_MIN + 1.5, Y_MAX);
    if (yMax - yMin < 1.5) yMin = clamp(yMax - 1.5, Y_MIN, Y_MAX - 1.5);
    return { xMin, xMax, yMin, yMax };
  }

  updateManualRangeControls() {
    const range = this.normalizedManualRange();
    this.state.manualRange = range;
    this.$("manual-x-min").value = String(range.xMin);
    this.$("manual-x-max").value = String(range.xMax);
    this.$("manual-y-min").value = String(range.yMin);
    this.$("manual-y-max").value = String(range.yMax);
    this.$("label-x-min").textContent = `${range.xMin.toFixed(1)} °C`;
    this.$("label-x-max").textContent = `${range.xMax.toFixed(1)} °C`;
    this.$("label-y-min").textContent = `${range.yMin.toFixed(1)} g/kg`;
    this.$("label-y-max").textContent = `${range.yMax.toFixed(1)} g/kg`;
    this.updateDualTrack("manual-x-dual", range.xMin, range.xMax, X_MIN, X_MAX);
    this.updateDualTrack("manual-y-dual", range.yMin, range.yMax, Y_MIN, Y_MAX);
    this.$("manual-range").classList.toggle("visible", this.state.rangeMode === "manual");
  }

  updateDualTrack(id, minValue, maxValue, min, max) {
    const el = this.$(id);
    if (!el) return;
    const left = clamp((minValue - min) / (max - min) * 100, 0, 100);
    const right = clamp(100 - (maxValue - min) / (max - min) * 100, 0, 100);
    el.style.setProperty("--fill-left", `${left}%`);
    el.style.setProperty("--fill-right", `${right}%`);
  }

  updateInstrumentControls() {
    const trail = this.$("trail-instrument");
    if (trail) {
      const value = Number(this.$("trail-hours").value);
      const right = 100 - clamp(value / 24 * 100, 0, 100);
      trail.style.setProperty("--fill-left", "0%");
      trail.style.setProperty("--fill-right", `${right}%`);
    }
    const fan = this.$("fan-command-instrument");
    if (fan) {
      const signed = Number(this.$("fan-command").value);
      const left = signed < 0 ? clamp((signed + 6) / 12 * 100, 0, 50) : 50;
      const right = signed > 0 ? 100 - clamp((signed + 6) / 12 * 100, 50, 100) : 50;
      fan.style.setProperty("--fill-left", `${left}%`);
      fan.style.setProperty("--fill-right", `${right}%`);
    }
  }

  updateTraceLabel() {
    const hours = Math.round(Number(this.state.historyHours) || 0);
    const label = hours <= 0 ? "off" : hours === 1 ? "1 h" : `${hours} h`;
    this.$("label-trail").textContent = label;
  }

  numericState(entityId) {
    const value = Number(this._hass?.states?.[entityId]?.state);
    return Number.isFinite(value) ? value : null;
  }

  entityText(entityId, digits = 1, unitFallback = "") {
    const entity = this._hass?.states?.[entityId];
    if (!entity) return "--";
    const value = Number(entity.state);
    const unit = entity.attributes?.unit_of_measurement || unitFallback;
    if (!Number.isFinite(value)) return entity.state || "--";
    return `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
  }

  applyHassState() {
    if (!this._hass) return;
    this.applyRoomRegistryMetadata();
    const pressure = this.numericState(CONFIG.pressureEntity);
    if (pressure !== null) this.state.pressure = pressure;
    this.rooms.forEach(room => {
      const tempEntity = this._hass.states?.[room.temp];
      const rhEntity = this._hass.states?.[room.rh];
      const t = this.numericState(room.temp);
      const rh = this.numericState(room.rh);
      if (t !== null) room.t = t;
      if (rh !== null) room.rhValue = rh;
      if (Number.isFinite(room.t) && Number.isFinite(room.rhValue)) {
        room.w = mixing(room.t, room.rhValue, this.state.pressure);
      }
      const rawUpdated = tempEntity?.last_changed || tempEntity?.last_updated || rhEntity?.last_changed || rhEntity?.last_updated;
      const updated = rawUpdated ? new Date(rawUpdated) : null;
      room.updatedLabel = updated && Number.isFinite(updated.getTime())
        ? updated.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "inconnue";
    });
    this.$("label-pressure").textContent = `${this.state.pressure.toFixed(1)} hPa`;
    this.shadowRoot.querySelectorAll(".live-label").forEach(label => {
      label.textContent = this._hass ? "Système live" : "Source live";
    });
  }

  selectedRoom() {
    const selected = this.rooms.find(room => room.id === this.state.selected && (!room.outdoor || this.outdoorVisible(room)));
    return selected || this.rooms.find(room => !room.outdoor && Number.isFinite(room.t)) || this.rooms[2];
  }

  outdoorVisible(room) {
    return !room?.outdoor || this.state.outdoorSelected.has(room.id);
  }

  selectedOutdoorRooms() {
    return this.rooms.filter(room => room.outdoor && this.outdoorVisible(room));
  }

  patio() {
    return this.rooms.find(room => room.outdoor) || this.rooms[0];
  }

  comfortModel(Text, P) {
    const Tc = 0.31 * Text + 17.8;
    const Tmin = Tc - 3.5;
    const Tmax = Tc + 3.5;
    const FS = (t, rh) => Math.min(mixing(t, rh, P), 16);
    const centerT = (Tmin + Tmax) / 2;
    const centerW = (FS(centerT, 20) + FS(centerT, 80)) / 2;
    return { Tc, Tmin, Tmax, centerT, centerW, FS };
  }

  comfortPolygon(model) {
    const pts = 72;
    const C = linspace(model.Tmin, model.Tmax - 2, pts).map(t => [t, model.FS(t, 80)]);
    C.push([model.Tmax, model.FS(model.Tmax, 50)]);
    linspace(model.Tmax, model.Tmin, pts).forEach(t => C.push([t, model.FS(t, 20)]));
    return C;
  }

  comfortPoint() {
    const patio = this.patio();
    if (this.comfortBasis && Number.isFinite(this.comfortBasis.t)) return this.comfortBasis;
    return {
      t: patio.t,
      rh: patio.rhValue,
      w: patio.w,
      source: "instantane patio",
      method: "Repli instantané faute d'historique extérieur suffisant."
    };
  }

  updateComfortBasisChip() {
    const chip = this.$("comfort-basis-chip");
    if (!chip) return;
    const basis = this.comfortPoint();
    if (!basis || !Number.isFinite(basis.t)) {
      chip.textContent = "☼ --";
      chip.title = "Tpma extérieure indisponible.";
      return;
    }
    const isWeighted = basis === this.comfortBasis;
    chip.textContent = isWeighted ? `☼ 7 j · ${basis.t.toFixed(1)} °C` : `☼ instant. · ${basis.t.toFixed(1)} °C`;
    chip.title = isWeighted
      ? `${basis.method} Données utilisées : ${basis.dailyCount || 0} tranches journalières, ${basis.count || 0} mesures. Cette référence unique de température extérieure prévalente déplace la zone de confort et sert aux scores et actions.`
      : `${basis.method} Cette valeur est temporaire jusqu'au chargement de l'historique extérieur.`;
  }

  // Geometric psychrometric score used by the visual panel (see README §5).
  // The unique adaptive comfort center is computed from comfortPoint(); the
  // score decreases with dry-bulb distance and humidity-ratio distance. The
  // humidity ratio is weighted x3: this approximates an enthalpy distance. The
  // weight is physically grounded, not a tuning knob — the latent heat of water
  // sets both the air's latent enthalpy term (~2.5x sensible) and the body's
  // evaporative cooling, and the practical asymmetry of correcting humidity vs
  // temperature confirms it (README §5.4). Points outside the comfort
  // polygon are deliberately capped so an apparent near-center point cannot be
  // shown as excellent when it crossed a boundary.
  score(room, model, comfortPoly = null) {
    const dT = room.t - model.centerT;
    const dW = room.w - model.centerW;
    const distanceScore = Math.max(0, Math.min(100, 100 - Math.sqrt(dT * dT + (dW * 3) * (dW * 3)) / 8 * 100));
    if (!comfortPoly) return distanceScore;
    const inside = polygonContains(comfortPoly, room);
    return inside ? distanceScore : Math.min(64, distanceScore * .72);
  }

  // Score shown in the room list / side panel. In portable mode the panel is fed
  // a CockpitView whose points already carry the Python operational score; that
  // value is authoritative and preferred. In Home Assistant mode (no pyScore) it
  // falls back to the JS geometric score. This is the single display path so the
  // two engines never show two different numbers (README §5).
  displayScore(room, model, comfortPoly = null) {
    return Number.isFinite(room.pyScore) ? Math.round(room.pyScore) : Math.round(this.score(room, model, comfortPoly));
  }

  // Locates a room inside the 4 ISO comfort rings (see COMFORT_RING_FACTORS),
  // and flags the small "resilience" disc near the comfort center
  // (COMFORT_RESILIENCE_FACTOR). Returns null when the room is outside the
  // comfort polygon entirely.
  comfortRingInfo(room, model, comfortPoly = null) {
    const poly = comfortPoly || this.comfortPolygon(model);
    if (!polygonContains(poly, room)) return null;
    const center = { t: model.centerT, w: model.centerW };
    let ring = 1;
    if (polygonContains(scalePolygon(poly, center, COMFORT_RING_FACTORS[2]), room)) ring = 2;
    if (polygonContains(scalePolygon(poly, center, COMFORT_RING_FACTORS[1]), room)) ring = 3;
    if (polygonContains(scalePolygon(poly, center, COMFORT_RING_FACTORS[0]), room)) ring = 4;
    const resilient = ring === 4 && polygonContains(scalePolygon(poly, center, COMFORT_RESILIENCE_FACTOR), room);
    return { ring, resilient };
  }

  // Short, weighted explanation of a room's score for the score tooltip:
  // states the temperature and humidity-ratio gaps to the comfort center
  // (humidity weighs 3x in the distance formula), whether the room sits
  // inside the comfort polygon, and its ISO ring / resilience position.
  scoreExplanation(room, model, comfortPoly, score, sep = " ") {
    const poly = comfortPoly || this.comfortPolygon(model);
    const dT = room.t - model.centerT;
    const dW = room.w - model.centerW;
    const parts = [`Score ${score}/100.`];
    parts.push(`Écart température vs centre confort : ${dT >= 0 ? "+" : ""}${dT.toFixed(1)} °C (poids x1).`);
    parts.push(`Écart humidité vs centre confort : ${dW >= 0 ? "+" : ""}${dW.toFixed(2)} g/kg (poids x3).`);
    if (!polygonContains(poly, room)) {
      parts.push("Hors de la zone de confort Givoni : score plafonné.");
    } else {
      const ring = this.comfortRingInfo(room, model, poly);
      if (ring) {
        parts.push(`Anneau de confort ISO ${ring.ring}/4${ring.resilient ? " + zone de résilience (proche du centre)" : ""}.`);
      }
    }
    return parts.join(sep);
  }

  // Comfort target = the comfort-zone center of gravity, expressed for the
  // current pressure: dry-bulb temperature, absolute humidity (ratio) and the
  // relative humidity that pair implies. A room sitting exactly on this point
  // scores 100/100; the score falls by 12.5 points per unit of weighted
  // distance sqrt(ΔT² + (3·ΔHA)²) — absolute humidity weighs 3x temperature.
  updateComfortTarget(model) {
    const chip = this.$("comfort-target");
    const text = this.$("comfort-target-text");
    if (!chip || !text) return;
    const t = model.centerT;
    const w = model.centerW;
    const rh = rhFromMixing(t, w, this.state.pressure);
    text.textContent = `Cible ${t.toFixed(1)} °C · ${w.toFixed(1)} g/kg · HR ${rh.toFixed(0)} %`;
    const title = [
      `Cible de confort — centre de gravité de la zone de Givoni à ${this.state.pressure.toFixed(0)} hPa :`,
      `• Température sèche : ${t.toFixed(1)} °C`,
      `• Humidité absolue : ${w.toFixed(2)} g/kg d'air sec`,
      `• Humidité relative : ${rh.toFixed(0)} %`,
      "",
      "Une pièce exactement sur ce point obtient un score de 100/100.",
      "Le score baisse avec la distance pondérée au centre : √(ΔT² + (3·ΔHA)²), soit −12,5 points par unité.",
      "L'humidité absolue pèse 3× la température. Hors de la zone de confort, le score est plafonné."
    ].join("\n");
    chip.title = title;
    const globalScore = this.$("global-score");
    if (globalScore) {
      globalScore.title = `Score moyen des pièces intérieures (0–100), distance pondérée au centre de confort.\n${title}`;
    }
  }

  zone(room, model, comfortPoly = null) {
    if (room.outdoor) return "air neuf";
    const poly = comfortPoly || this.comfortPolygon(model);
    if (polygonContains(poly, room)) return "confort";
    if (room.t > model.Tmax) return "chaud";
    if (room.t < model.Tmin) return "froid";
    if (room.w > model.FS(room.t, 80)) return "humide";
    if (room.w < model.FS(room.t, 20)) return "trop sec";
    return "hors confort";
  }

  // Human-readable zone label: when a room is in "confort", append its ISO
  // ring (4/4 .. 1/4) and the resilience flag for ring 4, e.g.
  // "confort 4/4 · resilience" or "confort 2/4".
  zoneLabel(room, model, comfortPoly = null, zone = null) {
    const z = zone || this.zone(room, model, comfortPoly);
    if (z !== "confort") return z;
    const ring = this.comfortRingInfo(room, model, comfortPoly);
    if (!ring) return z;
    return `confort ${ring.ring}/4${ring.resilient ? " · résilience" : ""}`;
  }

  actionFor(room, patio, model) {
    const z = this.zone(room, model);
    const cooler = patio.t + .7 < room.t;
    const drier = patio.w + .35 < room.w;
    if (room.outdoor) return ["Référence air neuf", "Patio : point de comparaison pour purge thermique et hygrique."];
    if ((z === "humide" || drier) && drier) return ["Purge hygrique ciblée", "Ouvrir le flux exposé le plus sûr, extraction douce, suivre la trajectoire vers le patio."];
    if ((z === "chaud" || cooler) && cooler) return ["Free cooling", "Ventilation traversante courte, protéger les façades exposées au soleil."];
    if (z === "froid") return ["Conserver chaleur", "Limiter ouverture, favoriser apports solaires ou chauffage doux surveillé."];
    if (z === "confort" && this.score(room, model, this.comfortPolygon(model)) < 82) return ["Recentrer confort", "Brassage doux, vérifier CO2/COV, garder une petite dérive vers le centre."];
    return ["Maintenir", "Maison dans la zone de confort, surveillance simple."];
  }

  givoniPolygons(Text, P) {
    const m = this.comfortModel(Text, P);
    const pts = 72;
    const f = (t, hr) => mixing(t, hr, P);
    const F = (t, hr) => Math.min(mixing(t, hr, P), 16);
    const pv16 = 16 * P / (621.98 + 16);
    const ps80 = pv16 / .8;
    const y = Math.log(ps80 / 6.112);
    const tTrans = 243.5 * y / (17.67 - y);
    let shared = linspace(m.Tmax - 2, m.Tmin, pts);
    if (m.Tmin < tTrans && tTrans < m.Tmax - 2) shared = [...shared, tTrans].sort((a, b) => b - a);
    const top = shared.map(t => [t, F(t, 80)]);
    const C = this.comfortPolygon(m);
    const center = polygonCentroid(C);
    if (center) {
      m.centerT = center.t;
      m.centerW = center.w;
    }
    const V = [[m.Tmin, F(m.Tmin, 20)], [m.Tmin + 24, F(m.Tmin, 20)], [m.Tmin + 24, F(m.Tmin + 24, 20)], [m.Tmax + 13, F(m.Tmax - 2, 80)], [m.Tmax - 2, F(m.Tmax - 2, 80)]];
    linspace(m.Tmax - 2, m.Tmin, pts).forEach(t => V.push([t, F(t, 80)]));
    const VN = [[m.Tmin, F(m.Tmin, 20)], [m.Tmin, f(m.Tmin, 100)]];
    linspace(m.Tmin, m.Tmax, pts).forEach(t => VN.push([t, f(t, 100)]));
    VN.push([m.Tmax + 5, f(m.Tmax + 5, 50)], [m.Tmax + 5, F(m.Tmax + 5, 20)]);
    linspace(m.Tmax + 5, m.Tmin, pts).forEach(t => VN.push([t, F(t, 20)]));
    const M = [[m.Tmin, F(m.Tmin, 20)], [m.Tmin + 17, F(m.Tmin, 20)], [m.Tmin + 17, F(m.Tmin + 17, 30)], [m.Tmax + 8, F(m.Tmax - 2, 80)], ...top];
    const EC = [[m.Tmin, F(m.Tmin, 20)], [m.Tmin + 2.5 * F(m.Tmin, 20), 0], [m.Tmin + 21, 0], [m.Tmin + 21, F(m.Tmin + 21, 10)], [m.Tmin + 19, F(m.Tmin + 19, 20)], [m.Tmin + 16, F(m.Tmin + 16, 30)], ...top];
    return { C, V, VN, M, EC, model: m };
  }

  polyTrace(poly, name, fill, line) {
    const closed = [...poly, poly[0]];
    return {
      x: closed.map(p => p[0]), y: closed.map(p => p[1]),
      type: "scatter", mode: "lines", fill: "toself",
      fillcolor: fill, line: { color: line, width: name.includes("confort") ? 1.7 : 1 },
      name,
      hoverinfo: "skip",
      showlegend: false
    };
  }

  polygonShape(poly, fill, line, width = 1) {
    return {
      type: "path",
      path: this.svgPath(poly),
      xref: "x",
      yref: "y",
      layer: "below",
      fillcolor: fill,
      line: { color: line, width }
    };
  }

  svgPath(poly) {
    if (!poly?.length) return "";
    const [first, ...rest] = poly;
    return `M ${first[0]} ${first[1]} ${rest.map(p => `L ${p[0]} ${p[1]}`).join(" ")} Z`;
  }

  // Trajectory of the Givoni comfort-zone center over the selected trail
  // window (historyHours): shows how the adaptive comfort target drifted as the
  // outdoor reference moved. For each past outdoor (patio) sample within the
  // window, the comfort polygon center is recomputed and the centers are joined
  // by a dotted line — the "dérive de la zone de confort" trace, scoped to the
  // selected trail period rather than the full 7-day comfort basis.
  comfortTrailTraces(patioHistory, pressure) {
    if (!Array.isArray(patioHistory) || patioHistory.length < 2) return [];
    const hours = this.state.historyHours || 0;
    if (hours <= 0) return [];
    const cutoff = Date.now() - hours * 3600 * 1000;
    const recent = patioHistory.filter(point => {
      const ts = point.ts instanceof Date ? point.ts.getTime() : new Date(point.ts).getTime();
      return Number.isFinite(ts) && ts >= cutoff;
    });
    if (recent.length < 2) return [];
    const centers = this.compressTrail(recent.map(point => {
      const center = polygonCentroid(this.comfortPolygon(this.comfortModel(point.t, pressure)));
      return center ? {
        t: center.t,
        w: center.w,
        rh: point.rh,
        ts: point.ts,
        hour: point.hour,
        count: point.count || 1
      } : null;
    }).filter(Boolean));
    return this.trailSegmentTraces(centers, "#a7f3d0", "Dérive de la zone de confort", false, "dot");
  }

  // The 3 ISO comfort rings inside the comfort polygon (COMFORT_RING_FACTORS),
  // splitting it into 4 zones: ring 4 (innermost) to ring 1 (the polygon
  // boundary itself, not drawn here).
  comfortContourTraces(poly, model) {
    const center = { t: model.centerT, w: model.centerW };
    return COMFORT_RING_FACTORS.map((factor, index) => {
      const scaled = scalePolygon(poly, center, factor);
      const closed = [...scaled, scaled[0]];
      const ring = COMFORT_RING_FACTORS.length - index + 1;
      const label = `Confort ${ring}/4`;
      return {
        x: closed.map(p => p[0]),
        y: closed.map(p => p[1]),
        type: "scatter",
        mode: "lines",
        line: {
          color: `rgba(167,243,208,${[.42, .30, .20][index]})`,
          width: [1.45, 1.1, .9][index],
          dash: index === 0 ? "solid" : "dot",
          shape: "spline",
          smoothing: 1.1
        },
        name: label,
        hoverinfo: "skip",
        showlegend: false
      };
    });
  }

  compressTrail(points) {
    const sorted = points
      .filter(p => Number.isFinite(p.t) && Number.isFinite(p.w))
      .sort((a, b) => new Date(a.ts || 0) - new Date(b.ts || 0));
    if (sorted.length <= 2) return sorted;
    const clusters = [];
    sorted.forEach(point => {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(point.t - last.t) < .13 && Math.abs(point.w - last.w) < .09) {
        last.t = (last.t * last.count + point.t) / (last.count + 1);
        last.w = (last.w * last.count + point.w) / (last.count + 1);
        last.rh = (last.rh * last.count + point.rh) / (last.count + 1);
        last.count += 1;
        last.ts = point.ts || last.ts;
        last.hour = `${last.firstHour} → ${point.hour || last.hour}`;
      } else {
        clusters.push({ ...point, count: 1, firstHour: point.hour });
      }
    });
    return clusters.map(({ firstHour, ...point }) => point);
  }

  smoothTrail(points) {
    if (points.length < 4) return points;
    return points.map((point, index) => {
      if (index === 0 || index === points.length - 1) return point;
      const prev = points[index - 1];
      const next = points[index + 1];
      return {
        ...point,
        t: prev.t * .22 + point.t * .56 + next.t * .22,
        w: prev.w * .22 + point.w * .56 + next.w * .22
      };
    });
  }

  trailPointsForRoom(room) {
    const current = {
      t: room.t,
      w: room.w,
      rh: room.rhValue,
      ts: new Date().toISOString(),
      hour: room.updatedLabel || "maintenant"
    };
    const raw = [...(room.history || []), current];
    return this.smoothTrail(this.compressTrail(raw));
  }

  trailSegmentTraces(points, color, name, selected, dash = "solid") {
    if (points.length < 2) return [];
    const traces = [];
    const segmentCount = points.length - 1;
    for (let i = 0; i < segmentCount; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const ageRatio = segmentCount <= 1 ? 1 : (i + 1) / segmentCount;
      const alpha = (selected ? .20 : .08) + ageRatio * (selected ? .78 : .45);
      traces.push({
        x: [a.t, b.t],
        y: [a.w, b.w],
        customdata: [[a.hour, a.rh, a.count || 1], [b.hour, b.rh, b.count || 1]],
        type: "scatter",
        mode: "lines",
        line: {
          color: rgba(color, alpha),
          width: selected ? 2.45 : 1.45,
          shape: "spline",
          smoothing: 1.25,
          dash
        },
        name,
        hovertemplate: `<b>${name}</b><br>Mesure : %{customdata[0]}<br>T : %{x:.1f} °C<br>HA : %{y:.2f} g/kg<br>HR : %{customdata[1]:.0f} %<br>Mesures agrégées : %{customdata[2]}<extra></extra>`,
        showlegend: false
      });
    }
    return traces;
  }

  // Soft, blurred-looking disc around the comfort center, marking the
  // "resilience" zone (COMFORT_RESILIENCE_FACTOR): a margin inside ring 4
  // where comfort is robust to short drifts. Drawn as a single translucent
  // fill (no stroke) to read as a soft halo rather than a sharp boundary.
  resilienceDiscTraces(poly, model) {
    const center = { t: model.centerT, w: model.centerW };
    const disc = scalePolygon(poly, center, COMFORT_RESILIENCE_FACTOR);
    const closed = [...disc, disc[0]];
    return [{
      x: closed.map(p => p[0]),
      y: closed.map(p => p[1]),
      type: "scatter",
      mode: "lines",
      fill: "toself",
      fillcolor: "rgba(167,243,208,.10)",
      line: { color: "rgba(167,243,208,0)", width: 0 },
      name: "Zone de résilience (confort 4/4)",
      hoverinfo: "skip",
      showlegend: false
    }];
  }

  actionVectorTrace(room, target, title) {
    const selected = room.id === this.state.selected;
    return {
      x: [room.t, target.t],
      y: [room.w, target.w],
      type: "scatter",
      mode: "lines+markers",
      line: {
        color: rgba(room.color, selected ? .78 : .34),
        width: selected ? 1.65 : .9,
        dash: selected ? "solid" : "dot",
        shape: "spline",
        smoothing: .85
      },
      marker: {
        color: [rgba(room.color, selected ? .8 : .34), rgba(room.color, selected ? 1 : .55)],
        size: [2.5, selected ? 8 : 5],
        symbol: ["circle", "diamond"],
        line: { width: 0 }
      },
      name: `${room.name} - action`,
      customdata: [[room.name, title], [room.name, title]],
      hovertemplate: `<b>%{customdata[0]}</b><br>Action: %{customdata[1]}<br>Cible: %{x:.1f} °C / %{y:.2f} g/kg<extra></extra>`,
      showlegend: false
    };
  }

  roomHaloTrace(room) {
    const selected = room.id === this.state.selected;
    const size = selected ? 27 : room.outdoor ? 22 : 20;
    return {
      x: [room.t],
      y: [room.w],
      type: "scatter",
      mode: "markers",
      marker: {
        color: rgba(room.color, selected ? .16 : .08),
        size,
        symbol: "circle",
        opacity: room.outdoor ? .78 : 1,
        line: { color: rgba(room.color, selected ? .62 : .34), width: selected ? 1.25 : .9 }
      },
      name: `${room.name} - halo`,
      hoverinfo: "skip",
      showlegend: false
    };
  }

  floorLinkTraces() {
    const groups = new Map();
    this.rooms
      .filter(room => !room.outdoor && Number.isFinite(room.t) && Number.isFinite(room.w))
      .forEach(room => {
        const floor = room.floor || "Intérieur";
        if (!groups.has(floor)) groups.set(floor, []);
        groups.get(floor).push(room);
      });
    const palette = ["#7dd3fc", "#a78bfa", "#34d399", "#f59e0b", "#fb7185"];
    const traces = [];
    [...groups.entries()].filter(([, rooms]) => rooms.length > 1).forEach(([floor, rooms], index) => {
      const color = palette[index % palette.length];
      const center = {
        t: rooms.reduce((sum, room) => sum + room.t, 0) / rooms.length,
        w: rooms.reduce((sum, room) => sum + room.w, 0) / rooms.length
      };
      const x = [];
      const y = [];
      const customdata = [];
      rooms.forEach(room => {
        x.push(room.t, center.t, null);
        y.push(room.w, center.w, null);
        customdata.push([floor, room.name], [floor, "barycentre"], [floor, ""]);
      });
      traces.push({
        x, y, customdata,
        type: "scatter",
        mode: "lines",
        line: {
          color: rgba(color, .62),
          width: 1.6,
          dash: "dot",
          shape: "spline",
          smoothing: 1.1
        },
        name: `Réseau ${floor}`,
        hovertemplate: `<b>%{customdata[0]}</b><br>%{customdata[1]}<extra></extra>`,
        showlegend: false
      });
      traces.push({
        x: [center.t],
        y: [center.w],
        text: [`${floor}`],
        customdata: [[floor, `${rooms.length} capteurs`]],
        type: "scatter",
        mode: "markers+text",
        textposition: "top center",
        textfont: { color: rgba(color, .92), size: 11 },
        marker: {
          color: rgba(color, .18),
          size: 22,
          symbol: "circle",
          line: { color: rgba(color, .72), width: 1.2 }
        },
        name: `Barycentre ${floor}`,
        hovertemplate: `<b>%{customdata[0]}</b><br>%{customdata[1]}<br>T: %{x:.1f} °C<br>HA: %{y:.2f} g/kg<extra></extra>`,
        showlegend: false
      });
    });
    return traces;
  }

  humidityLabelTraces(P, ranges) {
    const xMin = ranges?.x?.[0] ?? X_MIN;
    const xMax = ranges?.x?.[1] ?? X_MAX;
    const yMin = ranges?.y?.[0] ?? Y_MIN;
    const yMax = ranges?.y?.[1] ?? Y_MAX;
    const compact = this._compactChart;
    const labels = compact ? [20, 40, 60, 80, 100] : Array.from({ length: 10 }, (_, i) => (i + 1) * 10);
    return labels.map(rh => {
      const candidates = linspace(xMin + .5, xMax - .7, 180).filter(t => {
        const w = mixing(t, rh, P);
        return w >= yMin + .18 && w <= yMax - .18;
      });
      if (!candidates.length) return null;
      const labelT = candidates[candidates.length - 1];
      const labelW = mixing(labelT, rh, P);
      return {
        x: [labelT],
        y: [labelW],
        text: [`${rh}%`],
        type: "scatter",
        mode: "text",
        textposition: "middle left",
        textfont: { color: rh === 100 ? "rgba(226,232,240,.90)" : "rgba(203,213,225,.68)", size: compact ? 8 : 11 },
        hoverinfo: "skip",
        showlegend: false
      };
    }).filter(Boolean);
  }

  rangesFor(mode, model) {
    if (mode === "full") return { x: [X_DEFAULT_MIN, X_MAX], y: [Y_MIN, Y_MAX] };
    if (mode === "manual") {
      const r = this.state.manualRange;
      return { x: [r.xMin, r.xMax], y: [r.yMin, r.yMax] };
    }
    if (mode === "comfort") {
      return {
        x: [Math.max(X_MIN, model.Tmin - 3), Math.min(X_MAX, model.Tmax + 7)],
        y: [Math.max(0, model.centerW - 5), Math.min(Y_MAX, model.centerW + 8)]
      };
    }
    const sourceRooms = mode === "selected"
      ? [this.selectedRoom(), ...this.selectedOutdoorRooms()].filter(Boolean)
      : this.rooms.filter(room => !room.outdoor || this.outdoorVisible(room));
    const points = [];
    sourceRooms.forEach(room => {
      if (Number.isFinite(room.t) && Number.isFinite(room.w)) points.push([room.t, room.w]);
      if (this.state.trails) room.history.forEach(point => points.push([point.t, point.w]));
    });
    points.push([model.Tmin, model.FS(model.Tmin, 20)], [model.Tmax, model.FS(model.Tmax, 80)]);
    points.push([model.centerT, model.centerW]);
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    const padX = mode === "selected" ? 2.6 : 3.2;
    const padY = mode === "selected" ? 1.6 : 2.2;
    return {
      x: [Math.max(X_MIN, Math.min(...xs) - padX), Math.min(X_MAX, Math.max(...xs) + padX)],
      y: [Math.max(0, Math.min(...ys) - padY), Math.min(Y_MAX, Math.max(...ys) + padY)]
    };
  }

  plot() {
    if (!this._plotlyReady || !window.Plotly) return;
    const validRooms = this.rooms.filter(room => Number.isFinite(room.t) && Number.isFinite(room.rhValue));
    if (validRooms.length < 2) return;
    this.rooms.forEach(room => { room.w = mixing(room.t, room.rhValue, this.state.pressure); });
    const P = this.state.pressure;
    const patio = this.patio();
    const comfort = this.comfortPoint();
    const { C, V, VN, M, EC, model } = this.givoniPolygons(comfort.t, P);
    const ranges = this.rangesFor(this.state.rangeMode, model);
    this._lastRanges = ranges;
    const chartWrap = this.shadowRoot.querySelector(".chart-wrap");
    const compactChart = (chartWrap?.clientWidth || 0) < 720 || (chartWrap?.clientHeight || 0) < 520;
    this._compactChart = compactChart;
    const plotMargin = compactChart ? { l: 12, r: 34, t: 8, b: 38 } : { ...PLOT_MARGIN };
    const traces = [];
    const tempRange = linspace(X_MIN, X_MAX, 420);
    this.updateComfortBasisChip();

    if (this.state.zones) {
      traces.push(this.polyTrace(V, "Ventilation nocturne", "rgba(14,116,144,.055)", "rgba(125,211,252,.34)"));
      traces.push(this.polyTrace(VN, "Ventilation naturelle", "rgba(37,99,235,.055)", "rgba(96,165,250,.34)"));
      traces.push(this.polyTrace(M, "Inertie thermique", "rgba(146,64,14,.05)", "rgba(245,158,11,.30)"));
      traces.push(this.polyTrace(EC, "Rafraîchissement évaporatif", "rgba(88,28,135,.052)", "rgba(167,139,250,.32)"));
      traces.push(this.polyTrace(C, "Zone de confort adaptatif", "rgba(20,83,45,.30)", "rgba(34,197,94,.70)"));
      traces.push(...this.comfortContourTraces(C, model));
      traces.push(...this.resilienceDiscTraces(C, model));
    }

    for (let rh = 10; rh <= 100; rh += 10) {
      const x = [], y = [];
      tempRange.forEach(t => {
        const w = mixing(t, rh, P);
        if (w <= Y_MAX) { x.push(t); y.push(w); }
      });
      traces.push({
        x, y, type: "scatter", mode: "lines",
        line: { color: rh === 100 ? "rgba(226,232,240,.82)" : "rgba(226,232,240,.20)", width: rh === 100 ? 1.5 : .8 },
        showlegend: false, hoverinfo: "skip"
      });
    }
    traces.push(...this.humidityLabelTraces(P, ranges));
    if (this.state.trails) traces.push(...this.comfortTrailTraces(this.outdoorComfortHistory, P));
    if (this.state.floorLinks) traces.push(...this.floorLinkTraces());

    this.rooms.forEach(room => {
      if (room.outdoor && !this.outdoorVisible(room)) return;
      if (this.state.trails && room.history.length > 1) {
        const trail = this.trailPointsForRoom(room);
        traces.push(...this.trailSegmentTraces(
          trail,
          room.color,
          `${room.name} — traînée`,
          room.id === this.state.selected
        ));
      }
      traces.push(this.roomHaloTrace(room));
      traces.push({
        x: [room.t], y: [room.w], type: "scatter", mode: "markers",
        marker: {
          color: room.color,
          size: room.id === this.state.selected ? 7.4 : 5.2,
          symbol: "circle",
          opacity: room.outdoor ? .78 : room.id === this.state.selected ? 1 : .92,
          line: { width: 0 }
        },
        name: room.name,
        showlegend: false,
        hovertemplate: room.outdoor
          ? `<b>${room.name}</b><br>Dernière mesure : ${room.updatedLabel || "inconnue"}<br>T : %{x:.1f} °C<br>HA : %{y:.2f} g/kg<br>HR : ${room.rhValue.toFixed(0)} %<br>Zone : ${this.zone(room, model, C)}<extra></extra>`
          : `<b>${room.name}</b><br>Dernière mesure : ${room.updatedLabel || "inconnue"}<br>T : %{x:.1f} °C<br>HA : %{y:.2f} g/kg<br>HR : ${room.rhValue.toFixed(0)} %<br>Zone : ${this.zoneLabel(room, model, C)}<br>${this.scoreExplanation(room, model, C, Math.round(this.score(room, model, C)), "<br>")}<extra></extra>`
      });
    });

    if (this.state.vectors) {
      this.rooms.filter(r => !r.outdoor).forEach(room => {
        const [title] = this.actionFor(room, patio, model);
        const target = title.includes("Purge") || title.includes("cooling")
          ? { t: patio.t, w: patio.w }
          : { t: model.centerT, w: model.centerW };
        traces.push(this.actionVectorTrace(room, target, title));
      });
    }

    this._lastTooltipModel = { model, C, V, VN, M, EC, comfort };

    const shapes = [];
    const selected = this.selectedRoom();
    if (selected && Number.isFinite(selected.t) && Number.isFinite(selected.w)) {
      const crosshairLine = { color: rgba(selected.color, .4), width: .75, dash: "dot" };
      shapes.push(
        { type: "line", xref: "x", yref: "paper", x0: selected.t, x1: selected.t, y0: 0, y1: 1, line: crosshairLine, layer: "above" },
        { type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: selected.w, y1: selected.w, line: crosshairLine, layer: "above" }
      );
    }

    window.Plotly.react(this.$("chart"), traces, {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      dragmode: this.state.rangeMode === "manual" ? "zoom" : "pan",
      margin: plotMargin,
      shapes,
      xaxis: {
        range: ranges.x, dtick: compactChart ? 2 : 1, nticks: compactChart ? 7 : undefined, tickangle: 0, zeroline: false,
        gridcolor: "rgba(226,232,240,.10)", linecolor: "rgba(226,232,240,.35)",
        tickfont: { color: "#9fb2ba", size: compactChart ? 8 : 11 },
        automargin: !compactChart,
        constrain: "domain",
        minallowed: X_MIN,
        maxallowed: X_MAX
      },
      yaxis: {
        range: ranges.y, dtick: compactChart ? 2 : 1, nticks: compactChart ? 7 : undefined, zeroline: false,
        gridcolor: "rgba(226,232,240,.10)", linecolor: "rgba(226,232,240,.35)",
        tickfont: { color: "#9fb2ba", size: compactChart ? 8 : 11 },
        side: "right",
        automargin: !compactChart,
        constrain: "domain",
        minallowed: Y_MIN,
        maxallowed: Y_MAX
      },
      legend: {
        x: .01, y: .99, bgcolor: "rgba(8,16,22,.58)",
        bordercolor: "rgba(226,232,240,.14)", borderwidth: 1,
        font: { color: "#9fb2ba", size: 11 },
        orientation: "h",
        itemsizing: "constant"
      },
      showlegend: false,
      hovermode: "closest",
      hoverdistance: 42,
      spikedistance: -1,
      hoverlabel: {
        bgcolor: "rgba(8,16,22,.76)",
        bordercolor: "rgba(226,232,240,.20)",
        font: { color: "#f8fafc", size: 12 }
      },
      font: { color: "#edf7f6" }
    }, {
      responsive: true,
      displayModeBar: false,
      scrollZoom: true,
      doubleClick: "reset",
      modeBarButtonsToRemove: ["lasso2d", "select2d"]
    });
    this.renderSide(model, patio);
    this.renderLegend();
    this.bindPlotEvents();
    this.renderHitMarkers();
    window.setTimeout(() => this.renderHitMarkers(), 250);
  }

  bindPlotEvents() {
    const chart = this.$("chart");
    if (!chart || this._plotEventsBound) return;
    this._plotEventsBound = true;
    chart.on("plotly_relayout", event => {
      if (this._clampingPlot || !event) return;
      if ("xaxis.range[0]" in event && "xaxis.range[1]" in event) {
        this._lastRanges.x = [Number(event["xaxis.range[0]"]), Number(event["xaxis.range[1]"])];
      } else if (Array.isArray(event["xaxis.range"])) {
        this._lastRanges.x = [Number(event["xaxis.range"][0]), Number(event["xaxis.range"][1])];
      }
      if ("yaxis.range[0]" in event && "yaxis.range[1]" in event) {
        this._lastRanges.y = [Number(event["yaxis.range[0]"]), Number(event["yaxis.range[1]"])];
      } else if (Array.isArray(event["yaxis.range"])) {
        this._lastRanges.y = [Number(event["yaxis.range"][0]), Number(event["yaxis.range"][1])];
      }
      if (this.state.rangeMode === "manual" && this._lastRanges.x?.length === 2 && this._lastRanges.y?.length === 2) {
        const xRange = this.clampedRange(this._lastRanges.x, X_MIN, X_MAX, 2);
        const yRange = this.clampedRange(this._lastRanges.y, Y_MIN, Y_MAX, 1.5);
        this.state.manualRange = {
          xMin: xRange[0],
          xMax: xRange[1],
          yMin: yRange[0],
          yMax: yRange[1]
        };
        this.updateManualRangeControls();
      }
      window.requestAnimationFrame(() => this.renderHitMarkers());
      if (
        "xaxis.range[0]" in event || "xaxis.range[1]" in event ||
        "yaxis.range[0]" in event || "yaxis.range[1]" in event ||
        event["xaxis.autorange"] || event["yaxis.autorange"]
      ) {
        window.requestAnimationFrame(() => this.clampPlotRanges());
      }
    });
    chart.on("plotly_doubleclick", () => {
      window.requestAnimationFrame(() => this.plot());
      return false;
    });
  }

  plotAxes() {
    const chart = this.$("chart");
    const layout = chart?._fullLayout;
    const xaxis = layout?.xaxis;
    const yaxis = layout?.yaxis;
    if (!chart || !xaxis || !yaxis) return null;
    const rect = chart.getBoundingClientRect();
    return {
      chart,
      rect,
      xaxis,
      yaxis,
      plotW: xaxis._length || Math.max(1, rect.width - PLOT_MARGIN.l - PLOT_MARGIN.r),
      plotH: yaxis._length || Math.max(1, rect.height - PLOT_MARGIN.t - PLOT_MARGIN.b),
      xOffset: xaxis._offset ?? PLOT_MARGIN.l,
      yOffset: yaxis._offset ?? PLOT_MARGIN.t
    };
  }

  chartCoordinates(event) {
    const ranges = this._lastRanges;
    const axes = this.plotAxes();
    if (!axes || !ranges?.x || !ranges?.y) return null;
    const px = event.clientX - axes.rect.left;
    const py = event.clientY - axes.rect.top;
    const plotX = px - axes.xOffset;
    const plotY = py - axes.yOffset;
    const plotW = axes.plotW;
    const plotH = axes.plotH;
    if (plotX < -8 || plotY < -8 || plotX > plotW + 8 || plotY > plotH + 8) return null;
    const xSpan = ranges.x[1] - ranges.x[0];
    const ySpan = ranges.y[1] - ranges.y[0];
    const t = typeof axes.xaxis.p2l === "function"
      ? axes.xaxis.p2l(plotX)
      : ranges.x[0] + (plotX / plotW) * xSpan;
    const w = typeof axes.yaxis.p2l === "function"
      ? axes.yaxis.p2l(plotY)
      : ranges.y[1] - (plotY / plotH) * ySpan;
    return {
      px,
      py,
      t,
      w,
      plotW,
      plotH,
      xOffset: axes.xOffset,
      yOffset: axes.yOffset
    };
  }

  nearestTooltipRoom(coords) {
    let best = null;
    this.rooms
      .filter(room => Number.isFinite(room.t) && Number.isFinite(room.w) && (!room.outdoor || this.outdoorVisible(room)))
      .forEach(room => {
        const point = this.dataToChartPixel(room.t, room.w);
        if (!point) return;
        const px = point.x;
        const py = point.y;
        const dist = Math.hypot(coords.px - px, coords.py - py);
        if (!best || dist < best.dist) best = { room, dist, px, py };
      });
    return best && best.dist <= 18 ? best : null;
  }

  zoneTooltip(coords) {
    const m = this._lastTooltipModel;
    if (!m) return null;
    const point = { t: coords.t, w: coords.w };
    const zones = [
      ["Zone de confort adaptatif", m.C, `Référence : ${m.comfort?.source || "patio"}<br>${m.comfort?.method || ""}<br>Centre : ${m.model.centerT.toFixed(1)} °C / ${m.model.centerW.toFixed(2)} g/kg`],
      ["Ventilation naturelle", m.VN, "Domaine indicatif : ouvrir si l'air extérieur rapproche la pièce du centre."],
      ["Ventilation nocturne", m.V, "Domaine indicatif : purge thermique courte si l'extérieur est favorable."],
      ["Inertie thermique", m.M, "Domaine indicatif : protéger les apports et utiliser la masse thermique."],
      ["Rafraîchissement évaporatif", m.EC, "Domaine indicatif : stratégie hygrique à valider selon l'humidité réelle."]
    ];
    const zone = zones.find(([, poly]) => polygonContains(poly, point));
    if (!zone) return null;
    return {
      title: zone[0],
      html: `${zone[2]}<br><span>${coords.t.toFixed(1)} °C · ${coords.w.toFixed(2)} g/kg</span>`
    };
  }

  dataToChartPixel(t, w) {
    const axes = this.plotAxes();
    const ranges = this._lastRanges;
    if (!axes || !ranges?.x || !ranges?.y) return null;
    const plotW = axes.plotW;
    const plotH = axes.plotH;
    const x = typeof axes.xaxis.l2p === "function"
      ? axes.xaxis.l2p(t)
      : (t - ranges.x[0]) / (ranges.x[1] - ranges.x[0]) * plotW;
    const y = typeof axes.yaxis.l2p === "function"
      ? axes.yaxis.l2p(w)
      : (ranges.y[1] - w) / (ranges.y[1] - ranges.y[0]) * plotH;
    return {
      x: axes.xOffset + x,
      y: axes.yOffset + y
    };
  }

  markerTooltip(marker, title, html) {
    const tooltip = this.$("chart-tooltip");
    const wrap = this.shadowRoot.querySelector(".chart-wrap");
    if (!tooltip || !wrap) return;
    const markerRect = marker.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const x = clamp(markerRect.left + markerRect.width / 2 - wrapRect.left, 96, Math.max(96, wrapRect.width - 96));
    const y = clamp(markerRect.top + markerRect.height / 2 - wrapRect.top, 42, Math.max(42, wrapRect.height - 12));
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.innerHTML = `<b>${title}</b>${html}`;
    tooltip.classList.add("visible");
  }

  renderHitMarkers() {
    const layer = this.$("chart-hit-layer");
    if (!layer) return;
    layer.innerHTML = "";
  }

  updateChartTooltip(event) {
    const tooltip = this.$("chart-tooltip");
    const coords = this.chartCoordinates(event);
    if (!tooltip || !coords) {
      this.hideChartTooltip();
      return;
    }
    // Dotted crosshair following the cursor, pointing at both axes — gives a
    // read of the pointed temperature / absolute humidity without hiding the
    // view behind a large tooltip.
    this.updateHoverCrosshair(coords);
    const nearest = this.nearestTooltipRoom(coords);
    let content;
    if (nearest) {
      const { room } = nearest;
      content = {
        title: room.name,
        html: `Dernière mesure : ${room.updatedLabel || "inconnue"}<br><span>${room.t.toFixed(1)} °C · ${room.w.toFixed(2)} g/kg · HR ${room.rhValue.toFixed(0)} %</span>`
      };
    } else {
      content = (this.state.zones && this.zoneTooltip(coords)) || this.pointerReadout(coords);
    }
    const wrap = this.shadowRoot.querySelector(".chart-wrap");
    const wrapRect = wrap.getBoundingClientRect();
    const x = clamp(event.clientX - wrapRect.left, 96, Math.max(96, wrapRect.width - 96));
    const y = clamp(event.clientY - wrapRect.top, 42, Math.max(42, wrapRect.height - 12));
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.innerHTML = `<b>${content.title}</b>${content.html}`;
    tooltip.classList.add("visible");
  }

  // Minimal always-available readout for any point of the diagram: the dry-bulb
  // temperature and absolute humidity under the cursor, plus the relative
  // humidity that pair implies at the current pressure.
  pointerReadout(coords) {
    const t = coords.t;
    const w = Math.max(0, coords.w);
    const rh = rhFromMixing(t, w, this.state.pressure);
    return {
      title: "Point visé",
      html: `<span>${t.toFixed(1)} °C · ${w.toFixed(2)} g/kg · HR ${rh.toFixed(0)} %</span>`
    };
  }

  updateHoverCrosshair(coords) {
    const layer = this.$("chart-hit-layer");
    if (!layer) return;
    let v = layer.querySelector(".hover-guide-x");
    let h = layer.querySelector(".hover-guide-y");
    if (!v) { v = document.createElement("div"); v.className = "hover-guide hover-guide-x"; layer.appendChild(v); }
    if (!h) { h = document.createElement("div"); h.className = "hover-guide hover-guide-y"; layer.appendChild(h); }
    v.style.left = `${coords.px}px`;
    v.style.top = `${coords.yOffset}px`;
    v.style.height = `${coords.plotH}px`;
    h.style.top = `${coords.py}px`;
    h.style.left = `${coords.xOffset}px`;
    h.style.width = `${coords.plotW}px`;
    layer.classList.add("guides-visible");
  }

  hideChartTooltip() {
    this.$("chart-tooltip")?.classList.remove("visible");
    this.$("chart-hit-layer")?.classList.remove("guides-visible");
  }

  clampPlotRanges() {
    const chart = this.$("chart");
    const layout = chart?._fullLayout;
    if (!layout?.xaxis?.range || !layout?.yaxis?.range || !window.Plotly) return;
    const xRange = this.clampedRange(layout.xaxis.range, X_MIN, X_MAX, 2);
    const yRange = this.clampedRange(layout.yaxis.range, Y_MIN, Y_MAX, 1.5);
    const same =
      Math.abs(xRange[0] - layout.xaxis.range[0]) < .001 &&
      Math.abs(xRange[1] - layout.xaxis.range[1]) < .001 &&
      Math.abs(yRange[0] - layout.yaxis.range[0]) < .001 &&
      Math.abs(yRange[1] - layout.yaxis.range[1]) < .001;
    if (same) return;
    this._clampingPlot = true;
    window.Plotly.relayout(chart, {
      "xaxis.range": xRange,
      "yaxis.range": yRange
    }).finally(() => {
      this._clampingPlot = false;
    });
  }

  clampedRange(range, min, max, minSpan) {
    let low = Number(range[0]);
    let high = Number(range[1]);
    if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return [min, max];
    const span = Math.max(high - low, minSpan);
    if (span >= max - min) return [min, max];
    low = clamp(low, min, max - span);
    high = low + span;
    if (high > max) {
      high = max;
      low = high - span;
    }
    return [low, high];
  }

  renderLegend() {
    const legend = this.$("chart-legend");
    if (!legend) return;
    legend.innerHTML = "";
  }

  renderRooms(model) {
    const list = this.$("room-list");
    list.innerHTML = "";
    const comfortPoly = this.comfortPolygon(model);
    const entries = this.rooms
      .filter(room => !room.outdoor && Number.isFinite(room.t) && Number.isFinite(room.rhValue))
      .map(room => ({ room, score: this.displayScore(room, model, comfortPoly) }))
      .sort((a, b) => floorSortKey(a.room.floor) - floorSortKey(b.room.floor) || String(a.room.floor || "").localeCompare(String(b.room.floor || "")) || b.score - a.score);
    const groups = new Map();
    entries.forEach(entry => {
      const floor = entry.room.floor || "Intérieur";
      if (!groups.has(floor)) groups.set(floor, []);
      groups.get(floor).push(entry);
    });
    [...groups.entries()].forEach(([floor, group]) => {
      const groupNode = document.createElement("div");
      groupNode.className = "floor-group";
      const avg = group.reduce((sum, item) => sum + item.score, 0) / Math.max(1, group.length);
      groupNode.innerHTML = `<div class="floor-title"><span>${floor}</span><span>${group.length} capteurs · score ${Math.round(avg)}</span></div>`;
      group.forEach(({ room, score }) => {
        const z = this.zone(room, model, comfortPoly);
        const label = this.zoneLabel(room, model, comfortPoly, z);
        const color = scoreColor(score);
        const node = document.createElement("div");
        node.className = `room ${room.id === this.state.selected ? "selected" : ""}`;
        node.title = `${room.name} - ${label} - score ${score} - ${room.t.toFixed(1)} °C / ${room.rhValue.toFixed(0)} %`;
        node.innerHTML = `<i class="swatch" style="color:${room.color};background:${room.color}"></i>
          <div><b>${room.name}</b><span>${room.t.toFixed(1)} °C · ${room.rhValue.toFixed(0)} % · ${label}</span></div>
          <div class="score" title="${this.scoreExplanation(room, model, comfortPoly, score)}" style="color:${color};background:${scoreBgColor(score, .13)};border-color:${scoreBgColor(score, .34)}">${score}</div>`;
        node.addEventListener("click", () => {
          this.state.selected = room.id;
          this.plot();
        });
        groupNode.appendChild(node);
      });
      list.appendChild(groupNode);
    });
    this.renderOutdoorRooms();
    const total = this.rooms.filter(room => Number.isFinite(room.t) && Number.isFinite(room.rhValue)).length;
    this.$("sensor-count").textContent = `${total} capteurs actifs`;
  }

  renderOutdoorRooms() {
    const zone = this.$("outdoor-zone");
    const list = this.$("outdoor-list");
    zone.classList.remove("hidden");
    list.innerHTML = "";
    this.rooms
      .filter(room => room.outdoor && Number.isFinite(room.t) && Number.isFinite(room.rhValue))
      .forEach(room => {
        const visible = this.outdoorVisible(room);
        const node = document.createElement("div");
        node.className = `room ${room.id === this.state.selected ? "selected" : ""} ${visible ? "" : "outdoor-muted"}`;
        node.title = `${room.name} — ${visible ? "visible" : "masqué"} — air extérieur — ${room.t.toFixed(1)} °C / ${room.rhValue.toFixed(0)} %`;
        node.innerHTML = `<i class="swatch" style="color:${room.color};background:${room.color}"></i>
          <div><b>${room.name}</b><span>${room.t.toFixed(1)} °C · ${room.rhValue.toFixed(0)} % · air extérieur</span></div>
          <div class="score" style="color:#7dd3fc;background:rgba(125,211,252,.12);border-color:rgba(125,211,252,.32)">air</div>`;
        node.addEventListener("click", () => {
          if (this.state.outdoorSelected.has(room.id) && this.state.selected === room.id) {
            this.state.outdoorSelected.delete(room.id);
            this.state.selected = this.rooms.find(item => !item.outdoor)?.id || "living";
          } else {
            this.state.outdoorSelected.add(room.id);
            this.state.selected = room.id;
          }
          this.plot();
        });
        list.appendChild(node);
      });
  }

  renderSide(model, patio) {
    this.renderRooms(model);
    const room = this.selectedRoom();
    const [title, detail] = this.actionFor(room, patio, model);
    const comfortPoly = this.comfortPolygon(model);
    const selectedScore = this.displayScore(room, model, comfortPoly);
    this.$("selected-title").textContent = room.name;
    this.$("selected-subtitle").textContent = room.outdoor
      ? "référence air extérieur"
      : `${this.zoneLabel(room, model, comfortPoly)} · score ${selectedScore}`;
    this.$("m-temp").textContent = `${room.t.toFixed(1)} °C`;
    this.$("m-rh").textContent = `${room.rhValue.toFixed(0)} %`;
    this.$("m-ha").textContent = `${room.w.toFixed(2)} g/kg`;
    this.$("m-h").textContent = `${enthalpy(room.t, room.w).toFixed(1)} kJ/kg`;
    this.$("m-dew").textContent = `${dewPoint(room.t, room.rhValue).toFixed(1)} °C`;
    this.$("m-wet").textContent = `${wetBulb(room.t, room.rhValue, this.state.pressure).toFixed(1)} °C`;
    this.$("action-title").textContent = title;
    this.$("action-detail").textContent = detail;
    const occupied = this.rooms.filter(r => !r.outdoor && Number.isFinite(r.w));
    // Prefer the Python engine's global score in portable mode; otherwise average
    // the per-room display scores (which themselves prefer the Python score when
    // present) so the header never contradicts the room badges.
    const avg = Number.isFinite(this._globalScore)
      ? this._globalScore
      : occupied.reduce((acc, r) => acc + this.displayScore(r, model, comfortPoly), 0) / Math.max(1, occupied.length);
    this.$("global-score").textContent = `Score ${Math.round(avg)}`;
    this.updateComfortTarget(model);
    this.renderFanModel();
    this.renderFanControl();
    this.renderAirQuality();
    this.renderHitMarkers();
    window.setTimeout(() => this.renderHitMarkers(), 250);
  }

  renderAirQuality() {
    const room = this.selectedRoom();
    const panel = this.$("air-quality");
    const aq = room.airQuality;
    if (!panel || !aq) {
      panel?.classList.remove("visible");
      return;
    }
    panel.classList.add("visible");
    this.$("aq-co2").textContent = this.entityText(aq.co2, 0, "ppm");
    this.$("aq-voc").textContent = this.entityText(aq.voc, 0, "ppb");
    this.$("aq-noise").textContent = this.entityText(aq.noise, 0, "dBA");
    this.$("aq-light").textContent = this.entityText(aq.light, 0, "lx");
  }

  renderFanModel() {
    const room = this.selectedRoom();
    const model = room.fanModel;
    const panel = this.$("fan-model");
    if (!model) {
      panel.classList.remove("visible");
      return;
    }
    panel.classList.add("visible");
    const signed = this.numericState(model.signed) ?? this.numericState(room.fanCommand) ?? 0;
    const recirculationEntity = signed < 0 ? model.aspirationRecirculation : model.blowRecirculation;
    this.$("fm-volume").textContent = this.entityText(model.volume, 1);
    this.$("fm-airflow").textContent = this.entityText(model.nominalAirflow, 0);
    this.$("fm-annulus").textContent = this.entityText(model.annulusAirSpeed, 2);
    this.$("fm-occupied").textContent = this.entityText(model.occupiedAirSpeed, 2);
    this.$("fm-aspiration").textContent = this.entityText(model.aspirationMixing, 0);
    this.$("fm-recirculation").textContent = this.entityText(recirculationEntity, 0);
    this.$("fm-transfer").textContent = this.entityText(model.transferFactor, 2);
    this.$("fm-aspiration-factor").textContent = this.entityText(model.aspirationFactor, 2);
    this.$("fm-command-source").textContent = this.entityText(model.commandSource, 0);
    this.$("fm-command-relation").textContent = this.entityText(model.commandRelation, 0);
  }

  renderFanControl() {
    const room = this.selectedRoom();
    const control = this.$("fan-control");
    if (!room.fanCommand) {
      control.classList.remove("visible");
      return;
    }
    const state = this.fanCommandState(room);
    control.classList.add("visible");
    control.classList.toggle("pending", state.pending && !state.stale);
    control.classList.toggle("stale", state.stale);
    this.$("fan-control-name").textContent = `Ventilateur ${room.name}`;
    if (!this._fanEditing) this.$("fan-command").value = String(Math.round(state.display));
    this.updateFanDisplay(this._fanEditing ? Number(this.$("fan-command").value) : state.display, {
      actual: state.actual,
      command: state.command,
      pending: state.pending,
      stale: state.stale,
      sentAge: state.sentAge
    });
  }

  signedFanLabel(value) {
    const signed = this.signedFanValue(value);
    return signed === 0 ? "0 arrêt" : `${signed > 0 ? "+" : ""}${signed} ${signed > 0 ? "soufflage" : "aspiration"}`;
  }

  signedFanCompact(value) {
    const signed = this.signedFanValue(value);
    if (signed === 0) return "0";
    return `${signed > 0 ? "+" : ""}${signed} ${signed > 0 ? "↓" : "↑"}`;
  }

  signedFanValue(value) {
    const numeric = Number(value);
    return Math.round(Math.max(-6, Math.min(6, Number.isFinite(numeric) ? numeric : 0)));
  }

  fanActualSigned(room) {
    const actualEntity = room.fanModel?.actualSigned;
    return actualEntity ? this.numericState(actualEntity) : null;
  }

  fanCommandState(room) {
    const actual = this.fanActualSigned(room);
    const command = this.numericState(room.fanCommand);
    const now = Date.now();
    const pending = this._fanPending.get(room.id);
    const actualRounded = actual === null ? null : this.signedFanValue(actual);
    if (pending && actualRounded !== null && actualRounded === pending.signed) {
      pending.matchedAt = pending.matchedAt || now;
      const confirmed = now - pending.matchedAt >= FAN_COMMAND_CONFIRM_MS;
      if (confirmed) {
        this._fanPending.delete(room.id);
        return {
          actual: actualRounded,
          command,
          display: actualRounded,
          pending: null,
          stale: false,
          sentAge: now - (pending.sentAt || pending.requestedAt || now)
        };
      }
    } else if (pending) {
      pending.matchedAt = 0;
    }
    if (pending) {
      const sentAge = now - (pending.sentAt || pending.requestedAt || now);
      const stale = pending.sentAt && sentAge > 90000;
      return {
        actual: actualRounded,
        command,
        display: pending.signed,
        pending,
        stale,
        sentAge
      };
    }
    const fallback = actual ?? command ?? 0;
    return {
      actual: actualRounded,
      command,
      display: this.signedFanValue(fallback),
      pending: null,
      stale: false,
      sentAge: 0
    };
  }

  updateFanDisplay(value, detail = {}) {
    const signed = this.signedFanValue(value);
    this.$("fan-command").value = String(signed);
    this.$("fan-control-value").textContent = this.signedFanCompact(signed);
    const status = this.$("fan-status-icon");
    const sync = this.$("fan-sync-label");
    const chip = this.$("fan-command-chip");
    const actualCompact = detail.actual === null || detail.actual === undefined ? "--" : this.signedFanCompact(detail.actual);
    let statusClass = "synced";
    let statusText = "✓";
    let statusTitle = `Retour confirmé : ${this.signedFanLabel(signed)}`;
    let syncText = "";
    if (detail.pending) {
      statusClass = detail.stale ? "stale" : "pending";
      statusText = detail.stale ? "!" : "";
      const actualLabel = detail.actual === null || detail.actual === undefined ? "retour réel indisponible" : `retour réel ${this.signedFanLabel(detail.actual)}`;
      statusTitle = `${detail.stale ? "Commande non confirmée" : "Commande en cours"} : ${this.signedFanLabel(detail.pending.signed)} ; ${actualLabel}`;
      syncText = `${actualCompact === "--" ? "retour --" : `retour ${actualCompact}`}${detail.stale ? " · à vérifier" : ""}`;
    } else if (detail.actual !== undefined && detail.actual !== null) {
      statusTitle = `Retour confirmé : ${this.signedFanLabel(detail.actual)}`;
      syncText = "";
    } else if (detail.command !== undefined && detail.command !== null) {
      statusClass = "stale";
      statusText = "!";
      statusTitle = `Retour réel indisponible ; consigne HA : ${this.signedFanLabel(detail.command)}`;
      syncText = `consigne ${this.signedFanCompact(detail.command)}`;
    } else {
      statusClass = "stale";
      statusText = "!";
      statusTitle = "Retour ventilateur indisponible";
      syncText = "retour --";
    }
    if (status) {
      status.className = `fan-status ${statusClass}`;
      status.textContent = statusText;
      status.title = statusTitle;
      status.setAttribute("aria-label", statusTitle);
    }
    if (chip) chip.title = `${detail.preview ? "Position visee" : "Commande"}: ${this.signedFanLabel(signed)}. ${statusTitle}`;
    if (sync) {
      sync.textContent = syncText;
      sync.parentElement.style.display = syncText ? "flex" : "none";
    }
    this.updateInstrumentControls();
  }

  sendFanCommand(value) {
    const room = this.selectedRoom();
    if (!room.fanCommand || !this._hass) return;
    const signed = this.signedFanValue(value);
    const actual = this.fanActualSigned(room);
    const actualSigned = actual === null ? null : this.signedFanValue(actual);
    const command = this.numericState(room.fanCommand);
    const existing = this._fanPending.get(room.id);
    if (!existing && actualSigned === signed && this.signedFanValue(command) === signed) {
      this.updateFanDisplay(signed, { actual: actualSigned, command });
      return;
    }
    if (existing && this.signedFanValue(existing.signed) === signed) {
      this.updateFanDisplay(signed, { pending: existing, actual: actualSigned, command });
      return;
    }
    const pending = {
      ...(existing || {}),
      signed,
      requestedAt: Date.now(),
      matchedAt: 0,
      source: "vesta_panel",
      dirty: Boolean(existing?.inFlight),
      inFlight: Boolean(existing?.inFlight),
      sentAt: existing?.sentAt || 0,
      lastSent: existing?.lastSent ?? null
    };
    this._fanPending.set(room.id, pending);
    this.updateFanDisplay(signed, { pending, actual: actualSigned, command });
    this.scheduleFanCommandFlush(room.id, existing?.inFlight ? FAN_COMMAND_RESEND_GUARD_MS : FAN_COMMAND_DEBOUNCE_MS);
  }

  scheduleFanCommandFlush(roomId, delay = FAN_COMMAND_DEBOUNCE_MS) {
    window.clearTimeout(this._fanSendTimers.get(roomId));
    this._fanSendTimers.set(roomId, window.setTimeout(() => this.flushFanCommand(roomId), delay));
  }

  flushFanCommand(roomId) {
    const room = this.rooms.find(item => item.id === roomId);
    const pending = this._fanPending.get(roomId);
    if (!room?.fanCommand || !this._hass || !pending) return;
    if (pending.inFlight) {
      pending.dirty = true;
      return;
    }
    const signed = this.signedFanValue(pending.signed);
    const now = Date.now();
    pending.inFlight = true;
    pending.dirty = false;
    pending.sentAt = now;
    pending.lastSent = signed;
    pending.signed = signed;
    pending.matchedAt = 0;
    this._fanPending.set(roomId, pending);
    this.updateFanDisplay(signed, {
      pending,
      actual: this.fanActualSigned(room),
      command: this.numericState(room.fanCommand)
    });
    // Bookkeeping intent is best-effort and must NEVER gate the real command:
    // HA's frontend can reject a script service call when the script errors
    // internally, which previously skipped input_number.set_value entirely and
    // silently broke the fan command. Fire it separately and swallow failures.
    if (room.fanRoomKey) {
      this._hass.callService("script", "vesta_register_fan_command_intent", {
        room: room.fanRoomKey,
        signed_speed: signed,
        source: "vesta_panel",
        reason: `panel slider ${room.name}`
      }).catch(error => console.warn("[vesta] register fan intent failed (command still sent)", error));
    }
    this._hass.callService("input_number", "set_value", {
      entity_id: room.fanCommand,
      value: signed
    }).then(() => {
      const latest = this._fanPending.get(roomId);
      if (!latest) return;
      latest.inFlight = false;
      this._fanPending.set(roomId, latest);
      this.setNotice(`Commande ${room.name} : ${this.signedFanCompact(signed)} envoyée.`);
      if (latest.dirty || this.signedFanValue(latest.signed) !== signed) {
        this.scheduleFanCommandFlush(roomId, FAN_COMMAND_RESEND_GUARD_MS);
      }
      this.renderFanControl();
    }).catch(error => {
      const latest = this._fanPending.get(roomId);
      if (latest) latest.inFlight = false;
      this._fanPending.delete(roomId);
      window.clearTimeout(this._fanSendTimers.get(roomId));
      this.renderFanControl();
      this.setNotice(`Erreur commande ventilateur: ${error.message || error}`);
    });
  }

  setNotice(message) {
    this.$("notice").textContent = message || "";
  }

  showConfigModal() {
    this._connEditing = false;
    this._mappingLoaded = false;
    this.switchConfigTab("live");
    this.refreshConnectivity();
    this.$("config-modal")?.classList.add("visible");
    this.$("config-modal")?.setAttribute("aria-hidden", "false");
  }

  hideConfigModal() {
    this.$("config-modal")?.classList.remove("visible");
    this.$("config-modal")?.setAttribute("aria-hidden", "true");
  }

  switchConfigTab(name) {
    this.shadowRoot.querySelectorAll(".config-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.tab === name);
    });
    this.shadowRoot.querySelectorAll(".config-pane").forEach(pane => {
      pane.classList.toggle("active", pane.dataset.pane === name);
    });
    // The file browser is shared across panes — close it when leaving its tab.
    if (this.$("conn-browser")) this.$("conn-browser").hidden = true;
    if (name === "mapping" && !this._mappingLoaded) this.loadMappingEditor();
  }

  setConnStatus(state, label) {
    const node = this.$("conn-live-status");
    if (!node) return;
    node.classList.remove("ok", "err", "warn");
    if (state) node.classList.add(state);
    const text = node.querySelector("span");
    if (text) text.textContent = label;
  }

  // Populate the connectivity tabs. In portable mode the truth comes from the
  // hub's /api/connectivity + /api/health; in Home Assistant mode the transport
  // is HA itself (states + recorder), shown without any server call.
  async refreshConnectivity(isTest = false) {
    const pressure = `${this.state.pressure.toFixed(1)} hPa`;
    this.$("conn-pressure").textContent = pressure;
    if (!this._portable) {
      const live = !!this._hass;
      this.setConnStatus(live ? "ok" : "warn", live ? "Home Assistant connecté" : "En attente de Home Assistant");
      this.$("conn-config").hidden = true;
      this.$("conn-hist-config").hidden = true;
      this.$("conn-ha-note").hidden = false;
      this.$("conn-live-source").textContent = "Home Assistant (states)";
      this.$("conn-live-refresh").textContent = "flux natif HA";
      this.$("conn-live-detail").textContent = `${this.rooms.filter(r => Number.isFinite(r.t)).length} entités actives`;
      this.$("conn-live-error-row").hidden = true;
      this.$("conn-hist-provider").textContent = "Recorder Home Assistant (WebSocket)";
      this.$("map-ha-note").hidden = false;
      this.$("map-spaces").innerHTML = "<div class=\"conn-map-group\">Mapping géré par Home Assistant (constante CONFIG du panel).</div>";
      this.generateInfluxSnippet();
      if (isTest) this.setNotice(live ? "Home Assistant joignable." : "Home Assistant indisponible.");
      return;
    }
    const origin = window.location.origin;
    if (this.$("ep-stream-url")) this.$("ep-stream-url").textContent = `${origin}/api/stream`;
    if (this.$("ep-history-url")) this.$("ep-history-url").textContent = `${origin}/api/history`;
    try {
      const response = await fetch("/api/connectivity", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const info = await response.json();
      this._connectivity = info;
      const health = info.health || {};
      if (!health.ok) {
        this.setConnStatus("err", `Hub en erreur${health.last_error ? " : " + health.last_error : ""}`);
      } else if (info.status === "portable") {
        this.setConnStatus("warn", "Mode portable (données fixes)");
      } else {
        this.setConnStatus("ok", "Connecté (source live/historique distante)");
      }
      this.$("conn-live-source").textContent = this.sourceLabel(info.live_source);
      this.$("conn-live-refresh").textContent = health.last_refresh
        ? new Date(health.last_refresh).toLocaleTimeString("fr-FR")
        : "—";
      this.$("conn-live-detail").textContent =
        info.live_source === "MqttLiveSource" && info.mqtt
          ? `${info.mqtt.host}:${info.mqtt.port} · ${info.mqtt.base_topic}/#`
          : info.live === "history" && info.influx
            ? `historique InfluxDB · ${info.influx.bucket}`
            : info.live_source === "VestaRemoteLiveSource" && info.remote
              ? `système Vesta distant · ${info.remote.url}`
              : `${(info.series || []).length} séries normalisées`;
      const errorRow = this.$("conn-live-error-row");
      errorRow.hidden = !health.last_error;
      if (health.last_error) this.$("conn-live-error").textContent = health.last_error;
      this.$("conn-hist-provider").textContent = this.providerLabel(info.history_provider);
      this.$("map-ha-note").hidden = true;
      this.$("conn-pressure").textContent = `${Number(info.pressure_hpa ?? this.state.pressure).toFixed(1)} hPa`;
      this.$("conn-ha-note").hidden = true;
      this.$("conn-config").hidden = false;
      this.$("conn-hist-config").hidden = false;
      this.renderProfileList("live", info.live_profiles || [], info.active_live);
      this.renderProfileList("history", info.history_profiles || [], info.active_history);
      if (!this._connEditing) {
        const activeLive = (info.live_profiles || []).find(p => p.id === info.active_live);
        const activeHistory = (info.history_profiles || []).find(p => p.id === info.active_history);
        this.loadProfileSpecIntoForm("live", activeLive);
        this.loadProfileSpecIntoForm("history", activeHistory);
      }
      this.generateInfluxSnippet();
      if (isTest) this.setNotice(health.ok ? "Hub joignable." : `Hub en erreur : ${health.last_error || "?"}`);
    } catch (error) {
      this.setConnStatus("err", "Hub injoignable");
      this.$("conn-live-detail").textContent = String(error.message || error);
      if (isTest) this.setNotice(`Hub injoignable : ${error.message || error}`);
    }
  }

  // Load a saved profile's spec into the live/history form (used to prefill the
  // active profile, or when the user clicks "Modifier" on a saved one). Secrets
  // (token/password) are never returned, so those inputs stay blank — leaving
  // them empty keeps the server's stored value on save.
  loadProfileSpecIntoForm(kind, profile) {
    const spec = profile?.spec || {};
    if (kind === "live") {
      if (this.$("cf-live-name")) this.$("cf-live-name").value = profile?.name || "";
      const select = this.$("conn-live-select");
      if (select) select.value = spec.live || "file";
      if (this.$("cf-values")) this.$("cf-values").value = spec.values_path || "examples/latest_values.json";
      if (this.$("cf-mqtt-host")) this.$("cf-mqtt-host").value = spec.mqtt?.host || "";
      if (this.$("cf-mqtt-port")) this.$("cf-mqtt-port").value = spec.mqtt?.port || "";
      if (this.$("cf-mqtt-topic")) this.$("cf-mqtt-topic").value = spec.mqtt?.base_topic || "";
      if (this.$("cf-mqtt-user")) this.$("cf-mqtt-user").value = spec.mqtt?.username || "";
      if (this.$("cf-live-remote-url")) this.$("cf-live-remote-url").value = spec.remote?.url || "";
    } else {
      if (this.$("cf-hist-name")) this.$("cf-hist-name").value = profile?.name || "";
      const select = this.$("conn-hist-select");
      if (select) select.value = spec.history || "memory";
      if (this.$("cf-influx-url")) this.$("cf-influx-url").value = spec.influx?.url || "";
      if (this.$("cf-influx-org")) this.$("cf-influx-org").value = spec.influx?.org || "";
      if (this.$("cf-influx-bucket")) this.$("cf-influx-bucket").value = spec.influx?.bucket || "";
      if (this.$("cf-history-path")) this.$("cf-history-path").value = spec.history_path || "";
      if (this.$("cf-hist-remote-url")) this.$("cf-hist-remote-url").value = spec.remote?.url || "";
    }
    this._editingProfile = this._editingProfile || {};
    this._editingProfile[kind] = profile?.id || null;
    this.updateConnGroups();
  }

  // Clear the form to start a new (unsaved) profile for the given kind.
  newProfile(kind) {
    this._editingProfile = this._editingProfile || {};
    this._editingProfile[kind] = null;
    if (kind === "live") {
      if (this.$("cf-live-name")) this.$("cf-live-name").value = "";
      if (this.$("conn-live-select")) this.$("conn-live-select").value = "file";
      if (this.$("cf-values")) this.$("cf-values").value = "examples/latest_values.json";
      ["cf-mqtt-host", "cf-mqtt-port", "cf-mqtt-topic", "cf-mqtt-user", "cf-mqtt-pass", "cf-live-remote-url"].forEach(id => {
        if (this.$(id)) this.$(id).value = "";
      });
    } else {
      if (this.$("cf-hist-name")) this.$("cf-hist-name").value = "";
      if (this.$("conn-hist-select")) this.$("conn-hist-select").value = "memory";
      ["cf-influx-url", "cf-influx-org", "cf-influx-bucket", "cf-influx-token", "cf-history-path", "cf-hist-remote-url"].forEach(id => {
        if (this.$(id)) this.$(id).value = "";
      });
    }
    this.updateConnGroups();
  }

  updateConnGroups() {
    const live = this.$("conn-live-select")?.value || "file";
    const history = this.$("conn-hist-select")?.value || "memory";
    const visible = {
      "live-file": live === "file",
      "mqtt": live === "mqtt",
      "live-history": live === "history",
      "live-remote": live === "remote",
      "hist-influx": history === "influx",
      "hist-file": history === "file",
      "hist-memory": history === "memory",
      "hist-remote": history === "remote"
    };
    this.shadowRoot.querySelectorAll(".conn-group, .conn-note[data-group]").forEach(node => {
      const show = !!visible[node.dataset.group];
      if (node.classList.contains("conn-group")) node.classList.toggle("show", show);
      else node.hidden = !show;
    });
    // Mark the form as being edited so periodic refreshes don't clobber input.
    this._connEditing = true;
  }

  // Render the saved profiles for a kind ("live"/"history") as cards with
  // Activer/Modifier/Supprimer actions — exactly one profile is active.
  renderProfileList(kind, profiles, activeId) {
    const container = this.$(kind === "live" ? "conn-live-profiles" : "conn-hist-profiles");
    if (!container) return;
    if (!profiles.length) {
      container.innerHTML = "<div class=\"conn-profiles-empty\">Aucun profil enregistré.</div>";
      return;
    }
    container.innerHTML = profiles.map(profile => {
      const active = profile.id === activeId;
      const pendingDelete = this._pendingDelete === `${kind}:${profile.id}`;
      return `
        <div class="conn-profile ${active ? "active" : ""}">
          <div class="conn-profile-info">
            <div class="conn-profile-name">${this.escAttr(profile.name || "Profil")}</div>
            <div class="conn-profile-summary">${this.escAttr(this.profileSummary(kind, profile.spec || {}))}</div>
          </div>
          <div class="conn-profile-actions">
            <button class="toggle ${active ? "active" : ""}" type="button" data-activate="${kind}:${this.escAttr(profile.id)}" ${active ? "disabled" : ""}>${active ? "Actif" : "Activer"}</button>
            <button class="toggle" type="button" data-edit="${kind}:${this.escAttr(profile.id)}">Modifier</button>
            <button class="toggle" type="button" data-delete="${kind}:${this.escAttr(profile.id)}">${pendingDelete ? "Confirmer ?" : "Supprimer"}</button>
          </div>
        </div>`;
    }).join("");
  }

  profileSummary(kind, spec) {
    if (kind === "live") {
      switch (spec.live) {
        case "mqtt": return `MQTT · ${spec.mqtt?.host || "?"}:${spec.mqtt?.port || "?"} · ${spec.mqtt?.base_topic || ""}/#`;
        case "history": return "Basé sur l'historique récent";
        case "remote": return `Système Vesta distant · ${spec.remote?.url || "?"}`;
        default: return `Fichier JSON · ${spec.values_path || "examples/latest_values.json"}`;
      }
    }
    switch (spec.history) {
      case "influx": return `InfluxDB · ${spec.influx?.bucket || "?"}`;
      case "file": return `Fichier · ${spec.history_path || "?"}`;
      case "remote": return `Système Vesta distant · ${spec.remote?.url || "?"}`;
      default: return "Mémoire (tampon circulaire)";
    }
  }

  onProfileListClick(event) {
    const activate = event.target.closest("[data-activate]");
    const edit = event.target.closest("[data-edit]");
    const del = event.target.closest("[data-delete]");
    const target = activate || edit || del;
    if (!target) return;
    const [kind, id] = (activate?.dataset.activate || edit?.dataset.edit || del?.dataset.delete).split(":");
    if (activate) this.activateProfile(kind, id);
    else if (edit) this.editProfile(kind, id);
    else if (del) this.confirmDeleteProfile(kind, id);
  }

  // Two-click delete (avoids window.confirm, which freezes inside the HA
  // shadow DOM / automated browser contexts): first click arms the button
  // ("Confirmer ?") for 4s, second click within that window deletes.
  confirmDeleteProfile(kind, id) {
    const key = `${kind}:${id}`;
    if (this._pendingDelete === key) {
      window.clearTimeout(this._pendingDeleteTimer);
      this._pendingDelete = null;
      this.deleteProfile(kind, id);
      return;
    }
    this._pendingDelete = key;
    window.clearTimeout(this._pendingDeleteTimer);
    this._pendingDeleteTimer = window.setTimeout(() => {
      this._pendingDelete = null;
      const info = this._connectivity || {};
      this.renderProfileList("live", info.live_profiles || [], info.active_live);
      this.renderProfileList("history", info.history_profiles || [], info.active_history);
    }, 4000);
    const info = this._connectivity || {};
    this.renderProfileList("live", info.live_profiles || [], info.active_live);
    this.renderProfileList("history", info.history_profiles || [], info.active_history);
  }

  editProfile(kind, id) {
    const info = this._connectivity || {};
    const profiles = (kind === "live" ? info.live_profiles : info.history_profiles) || [];
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;
    this.loadProfileSpecIntoForm(kind, profile);
  }

  copyEndpoint(id) {
    const text = this.$(id)?.textContent || "";
    navigator.clipboard?.writeText(text)
      .then(() => this.setNotice("URL copiée."))
      .catch(() => this.setNotice("Copie impossible, sélection manuelle disponible."));
  }

  collectLiveSpec() {
    const live = this.$("conn-live-select")?.value || "file";
    const spec = { live, pressure_hpa: this.state.pressure };
    if (live === "file") spec.values_path = this.$("cf-values")?.value.trim() || "examples/latest_values.json";
    if (live === "mqtt") {
      spec.mqtt = {
        host: this.$("cf-mqtt-host")?.value.trim() || undefined,
        port: Number(this.$("cf-mqtt-port")?.value) || undefined,
        base_topic: this.$("cf-mqtt-topic")?.value.trim() || undefined,
        username: this.$("cf-mqtt-user")?.value.trim() || undefined,
        password: this.$("cf-mqtt-pass")?.value || undefined
      };
    }
    if (live === "remote") {
      spec.remote = { url: this.$("cf-live-remote-url")?.value.trim() || undefined };
    }
    return spec;
  }

  collectHistorySpec() {
    const history = this.$("conn-hist-select")?.value || "memory";
    const spec = { history, pressure_hpa: this.state.pressure };
    if (history === "influx") {
      spec.influx = {
        url: this.$("cf-influx-url")?.value.trim() || undefined,
        org: this.$("cf-influx-org")?.value.trim() || undefined,
        bucket: this.$("cf-influx-bucket")?.value.trim() || undefined,
        token: this.$("cf-influx-token")?.value || undefined
      };
    }
    if (history === "file") spec.history_path = this.$("cf-history-path")?.value.trim() || undefined;
    if (history === "remote") {
      spec.remote = { url: this.$("cf-hist-remote-url")?.value.trim() || undefined };
    }
    return spec;
  }

  // Save the current form as a profile (new, or update the one being edited).
  // Saving does not activate it — use "Activer" on the profile card for that.
  async saveProfile(kind) {
    if (!this._portable) return;
    const spec = kind === "live" ? this.collectLiveSpec() : this.collectHistorySpec();
    const nameInput = this.$(kind === "live" ? "cf-live-name" : "cf-hist-name");
    const name = nameInput?.value.trim() || (kind === "live" ? "Source live" : "Source historique");
    const profile = { name, spec };
    const editingId = (this._editingProfile || {})[kind];
    if (editingId) profile.id = editingId;
    this.setNotice("Enregistrement du profil…");
    try {
      const response = await fetch("/api/connectivity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_profile", kind, profile })
      });
      const info = await response.json();
      if (!response.ok || info.error) throw new Error(info.error || `HTTP ${response.status}`);
      this._editingProfile = this._editingProfile || {};
      this._editingProfile[kind] = info.saved_id;
      if (this.$("cf-influx-token")) this.$("cf-influx-token").value = "";
      if (this.$("cf-mqtt-pass")) this.$("cf-mqtt-pass").value = "";
      this.setNotice(`Profil enregistré : ${name}.`);
      this._connEditing = false;
      this.refreshConnectivity();
    } catch (error) {
      this.setNotice(`Échec de l'enregistrement : ${error.message || error}`);
    }
  }

  // Make a saved profile the active live/history source; the hub hot-swaps it.
  async activateProfile(kind, id) {
    if (!this._portable) return;
    this.setNotice("Activation du profil…");
    try {
      const response = await fetch("/api/connectivity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate_profile", kind, id, pressure_hpa: this.state.pressure })
      });
      const info = await response.json();
      if (!response.ok || info.error) throw new Error(info.error || `HTTP ${response.status}`);
      this._connEditing = false;
      this.setNotice(`Profil activé : ${this.sourceLabel(info.live_source)} · ${this.providerLabel(info.history_provider)}.`);
      this.refreshConnectivity();
      this.loadCockpitHistory();
    } catch (error) {
      this.setNotice(`Échec de l'activation : ${error.message || error}`);
    }
  }

  async deleteProfile(kind, id) {
    if (!this._portable) return;
    try {
      const response = await fetch("/api/connectivity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_profile", kind, id })
      });
      const info = await response.json();
      if (!response.ok || info.error) throw new Error(info.error || `HTTP ${response.status}`);
      this.setNotice("Profil supprimé.");
      this._connEditing = false;
      this.refreshConnectivity();
      this.loadCockpitHistory();
    } catch (error) {
      this.setNotice(`Échec de la suppression : ${error.message || error}`);
    }
  }

  // Import another Vesta node's already-normalized spaces (GET /api/mapping
  // proxied through /api/remote-mapping) into the mapping editor — no remapping
  // needed since the remote node already exposes `<space>.<metric>` keys.
  async importRemoteMapping() {
    if (!this._portable) return;
    const url = this.$("map-remote-url")?.value.trim();
    const status = this.$("map-import-status");
    if (!url) {
      if (status) status.textContent = "Indiquez l'URL du système distant.";
      return;
    }
    if (status) status.textContent = "Import en cours…";
    try {
      const response = await fetch("/api/remote-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      this.syncMappingDraft();
      const existingKeys = new Set((this._mappingDraft?.spaces || []).map(space => space.key));
      const imported = (data.spaces || []).map(space => ({
        key: space.key,
        label: space.label,
        kind: space.kind,
        group: space.group || "",
        sensors: Object.entries(space.sensors || {}).map(([metric, ref]) => ({
          metric, measurement: ref.measurement || "", field: ref.field || "value", tags: ref.tags || {}
        }))
      }));
      const added = imported.filter(space => !existingKeys.has(space.key));
      this._mappingDraft.spaces.push(...added);
      this.renderMappingEditor();
      if (status) status.textContent = `${added.length} espace(s) importé(s) sur ${imported.length}.`;
    } catch (error) {
      if (status) status.textContent = `Import impossible : ${error.message || error}`;
    }
  }

  // Server-side file picker: the values/history file lives on the hub, so the
  // panel browses the server's filesystem (.json files + folders) via /api/browse.
  async openBrowser(targetId) {
    this._browseTarget = targetId;
    const current = this.$(targetId)?.value.trim();
    this.$("conn-browser").hidden = false;
    await this.browseTo(current || "");
  }

  async browseTo(path) {
    const list = this.$("conn-browser-list");
    if (list) list.textContent = "Chargement…";
    try {
      const response = await fetch(`/api/browse?path=${encodeURIComponent(path || "")}`, { cache: "no-store" });
      const data = await response.json();
      this._browseParent = data.parent;
      this.$("conn-browser-path").textContent = data.path || "/";
      this.$("conn-browser-up").disabled = !data.parent;
      if (!list) return;
      list.innerHTML = "";
      if (data.error) { list.textContent = data.error; return; }
      (data.entries || []).forEach(entry => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `conn-browser-item ${entry.type === "file" ? "is-file" : ""}`;
        item.innerHTML = `<span class="ic">${entry.type === "dir" ? "📁" : "📄"}</span><span>${entry.name}</span>`;
        item.addEventListener("click", () => {
          if (entry.type === "dir") return this.browseTo(entry.path);
          if (this.$(this._browseTarget)) this.$(this._browseTarget).value = entry.path;
          this.$("conn-browser").hidden = true;
        });
        list.appendChild(item);
      });
      if (!data.entries?.length) list.textContent = "Aucun dossier ni fichier .json ici.";
    } catch (error) {
      if (list) list.textContent = `Parcours impossible : ${error.message || error}`;
    }
  }

  sourceLabel(name) {
    return {
      FileLiveSource: "Fichier de valeurs (JSON)",
      InfluxLiveSource: "InfluxDB (dernière valeur)",
      MqttLiveSource: "MQTT (push temps réel)",
      HistoryBackedLiveSource: "Basé sur l'historique récent",
      VestaRemoteLiveSource: "Système Vesta distant (API)"
    }[name] || name || "—";
  }

  providerLabel(name) {
    return {
      MemoryHistoryProvider: "Mémoire (tampon circulaire)",
      InfluxHistoryProvider: "InfluxDB (plages)",
      FileHistoryProvider: "Fichier d'historique (JSON)",
      VestaRemoteHistoryProvider: "Système Vesta distant (API)"
    }[name] || name || "—";
  }

  connChips(keys) {
    return [...new Set(keys)].filter(Boolean).map(key => `<span class="conn-chip">${key}</span>`).join("");
  }

  escAttr(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  slug(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  tagsToStr(tags) {
    return Object.entries(tags || {}).map(([k, v]) => `${k}=${v}`).join(", ");
  }

  strToTags(text) {
    const tags = {};
    String(text || "").split(",").forEach(pair => {
      const [k, ...rest] = pair.split("=");
      const key = k.trim();
      if (key && rest.length) tags[key] = rest.join("=").trim();
    });
    return tags;
  }

  // Load the current mapping (the "besoin") from the hub into the editable draft.
  async loadMappingEditor() {
    if (!this._portable) return;
    this._mappingLoaded = true;
    try {
      const response = await fetch("/api/mapping", { cache: "no-store" });
      const data = await response.json();
      this._mappingDraft = {
        spaces: (data.spaces || []).map(space => ({
          key: space.key,
          label: space.label,
          kind: space.kind,
          group: space.group || "",
          sensors: Object.entries(space.sensors || {}).map(([metric, ref]) => ({
            metric, measurement: ref.measurement || "", field: ref.field || "value", tags: ref.tags || {}
          }))
        }))
      };
      this.renderMappingEditor();
    } catch (error) {
      this.$("map-spaces").innerHTML = `<div class="conn-map-group">Mapping indisponible : ${error.message || error}</div>`;
    }
  }

  renderMappingEditor() {
    const container = this.$("map-spaces");
    if (!container) return;
    const kindOpt = (sel, val, label) => `<option value="${val}" ${sel === val ? "selected" : ""}>${label}</option>`;
    container.innerHTML = (this._mappingDraft?.spaces || []).map((space, i) => `
      <div class="map-space" data-i="${i}" data-key="${this.escAttr(space.key || "")}">
        <div class="map-space-head">
          <input class="ms-label" value="${this.escAttr(space.label)}" placeholder="Nom de l'espace">
          <select class="ms-kind">
            ${kindOpt(space.kind, "interior", "Intérieur (logement)")}
            ${kindOpt(space.kind, "exterior", "Extérieur (logement)")}
            ${kindOpt(space.kind, "system", "Système")}
          </select>
          <input class="ms-group" value="${this.escAttr(space.group)}" placeholder="étage / module">
          <button class="ms-remove" type="button" data-remove-space="${i}" title="Supprimer l'espace">×</button>
        </div>
        <div class="map-sensors">
          ${(space.sensors || []).map((sr, j) => `
            <div class="map-sensor" data-i="${i}" data-j="${j}">
              <input class="msr-metric" value="${this.escAttr(sr.metric)}" placeholder="métrique">
              <input class="msr-measurement" value="${this.escAttr(sr.measurement)}" placeholder="measurement">
              <input class="msr-field" value="${this.escAttr(sr.field)}" placeholder="field">
              <input class="msr-tags" value="${this.escAttr(this.tagsToStr(sr.tags))}" placeholder="room=living">
              <button class="msr-remove" type="button" data-remove-metric="${i}:${j}" title="Supprimer la métrique">×</button>
            </div>`).join("")}
          <button class="ms-add-metric" type="button" data-add-metric="${i}">+ métrique</button>
        </div>
      </div>`).join("") || "<div class=\"conn-map-group\">Aucun espace. Ajoutez-en un.</div>";
    this.generateInfluxSnippet();
  }

  // Read the current DOM back into the draft so add/remove preserve edits.
  syncMappingDraft() {
    const cards = [...this.shadowRoot.querySelectorAll("#map-spaces .map-space")];
    this._mappingDraft = {
      spaces: cards.map(card => ({
        key: card.dataset.key || "",
        label: card.querySelector(".ms-label").value,
        kind: card.querySelector(".ms-kind").value,
        group: card.querySelector(".ms-group").value,
        sensors: [...card.querySelectorAll(".map-sensor")].map(row => ({
          metric: row.querySelector(".msr-metric").value,
          measurement: row.querySelector(".msr-measurement").value,
          field: row.querySelector(".msr-field").value,
          tags: this.strToTags(row.querySelector(".msr-tags").value)
        }))
      }))
    };
  }

  onMapSpacesClick(event) {
    const removeSpace = event.target.closest("[data-remove-space]");
    const addMetric = event.target.closest("[data-add-metric]");
    const removeMetric = event.target.closest("[data-remove-metric]");
    if (!removeSpace && !addMetric && !removeMetric) return;
    this.syncMappingDraft();
    if (removeSpace) {
      this._mappingDraft.spaces.splice(Number(removeSpace.dataset.removeSpace), 1);
    } else if (addMetric) {
      const space = this._mappingDraft.spaces[Number(addMetric.dataset.addMetric)];
      space.sensors.push({ metric: "", measurement: "", field: "value", tags: {} });
    } else if (removeMetric) {
      const [i, j] = removeMetric.dataset.removeMetric.split(":").map(Number);
      this._mappingDraft.spaces[i].sensors.splice(j, 1);
    }
    this.renderMappingEditor();
  }

  addMapSpace() {
    this.syncMappingDraft();
    (this._mappingDraft = this._mappingDraft || { spaces: [] }).spaces.push({
      key: "", label: "Nouvel espace", kind: "interior", group: "",
      sensors: [{ metric: "temperature", measurement: "", field: "value", tags: {} }, { metric: "humidity", measurement: "", field: "value", tags: {} }]
    });
    this.renderMappingEditor();
  }

  // Build the overlay spec (spaces + group labels) from the editor.
  collectMappingOverlay() {
    this.syncMappingDraft();
    const spaces = {};
    const groups = {};
    this._mappingDraft.spaces.forEach((space, index) => {
      const key = space.key || this.slug(space.label) || `espace_${index + 1}`;
      const sensors = {};
      space.sensors.forEach(sr => {
        const metric = (sr.metric || "").trim();
        if (!metric) return;
        sensors[metric] = { measurement: (sr.measurement || "").trim(), field: (sr.field || "value").trim(), tags: sr.tags || {} };
      });
      spaces[key] = { label: (space.label || key).trim(), kind: space.kind, group: (space.group || "").trim(), sensors };
      if (space.group) groups[space.group.trim()] = space.group.trim();
    });
    return { spaces, groups };
  }

  async discoverInflux() {
    const status = this.$("map-discover-status");
    if (status) status.textContent = "Découverte en cours…";
    const influx = {
      url: this.$("cf-influx-url")?.value.trim() || undefined,
      org: this.$("cf-influx-org")?.value.trim() || undefined,
      bucket: this.$("cf-influx-bucket")?.value.trim() || undefined,
      token: this.$("cf-influx-token")?.value || undefined
    };
    try {
      const response = await fetch("/api/influx-schema", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ influx })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      const body = this.$("map-ref-body");
      const section = (title, items) => items?.length
        ? `<div class="map-ref-row"><div class="conn-map-group-label">${title} (${items.length})</div><div class="conn-mapping">${this.connChips(items)}</div></div>`
        : "";
      body.innerHTML = section("Mesures", data.measurements) + section("Champs", data.fields) + section("Tags", data.tag_keys)
        || "<div class=\"conn-map-group\">Aucun schéma renvoyé.</div>";
      body.hidden = false;
      if (status) status.textContent = "Schéma récupéré — recopiez mesures/champs/tags dans les espaces.";
    } catch (error) {
      if (status) status.textContent = `Échec : ${error.message || error}`;
    }
  }

  async applyMapping() {
    if (!this._portable) return;
    const overlay = this.collectMappingOverlay();
    if (!Object.keys(overlay.spaces).length) { this.setNotice("Ajoutez au moins un espace."); return; }
    this.setNotice("Application du mapping…");
    try {
      const response = await fetch("/api/mapping", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(overlay)
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      this.setNotice(`Mapping appliqué : ${data.spaces?.length || 0} espace(s).`);
      this._mappingLoaded = false;
      this.loadMappingEditor();
      this.loadCockpitHistory();
    } catch (error) {
      this.setNotice(`Échec du mapping : ${error.message || error}`);
    }
  }

  async testHistory() {
    const window = this.$("conn-hist-window")?.value || "12h";
    const result = this.$("conn-hist-result");
    if (!this._portable) {
      if (result) result.textContent = "En mode Home Assistant, l'historique provient du Recorder (WebSocket natif) — testez via les traînées du graphique.";
      return;
    }
    if (result) result.textContent = "Test en cours…";
    try {
      const response = await fetch(`/api/history?window=${encodeURIComponent(window)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      const series = data.series || {};
      const keys = Object.keys(series);
      const total = keys.reduce((sum, key) => sum + series[key].length, 0);
      let oldest = null;
      keys.forEach(key => series[key].forEach(point => {
        const ts = new Date(point.ts).getTime();
        if (Number.isFinite(ts) && (oldest === null || ts < oldest)) oldest = ts;
      }));
      const depth = oldest ? `depuis ${new Date(oldest).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "aucune donnée";
      if (result) result.textContent = `${keys.length} série(s) · ${total} point(s) sur ${window} · ${depth}.`;
    } catch (error) {
      if (result) result.textContent = `Historique indisponible : ${error.message || error}`;
    }
  }

  // Build a YAML contract describing the resolved connectivity: the same
  // normalized <space>.<metric> series whatever the backend, with secrets kept
  // server-side. In portable mode it reflects /api/connectivity; in HA mode it
  // documents the HA transport.
  // Export the current mapping as a YAML `spaces:`/`groups:` block, ready to
  // paste into config/site_house.yaml (the "export to YAML" path).
  generateInfluxSnippet() {
    let overlay;
    if (this._portable && this._mappingDraft) {
      overlay = this.collectMappingOverlay();
    } else {
      // HA mode: derive from the panel's CONFIG rooms.
      const spaces = {};
      const groups = {};
      this.rooms.filter(r => r.temp).forEach(r => {
        spaces[r.id] = { label: r.name, kind: r.outdoor ? "exterior" : "interior", group: r.floor || "", sensors: { temperature: { measurement: r.temp, field: "value", tags: {} }, humidity: { measurement: r.rh, field: "value", tags: {} } } };
        if (r.floor) groups[r.floor] = r.floor;
      });
      overlay = { spaces, groups };
    }
    const lines = ["# Mapping Vesta — à coller dans config/site_house.yaml"];
    if (Object.keys(overlay.groups).length) {
      lines.push("groups:");
      Object.entries(overlay.groups).forEach(([k, v]) => lines.push(`  ${k}: ${JSON.stringify(v)}`));
    }
    lines.push("spaces:");
    Object.entries(overlay.spaces).forEach(([key, space]) => {
      lines.push(`  ${key}:`);
      lines.push(`    label: ${JSON.stringify(space.label)}`);
      lines.push(`    kind: ${space.kind}`);
      if (space.group) lines.push(`    group: ${JSON.stringify(space.group)}`);
      const metrics = Object.entries(space.sensors || {});
      if (metrics.length) {
        lines.push("    sensors:");
        metrics.forEach(([metric, ref]) => {
          lines.push(`      ${metric}:`);
          lines.push(`        measurement: ${JSON.stringify(ref.measurement || "")}`);
          if (ref.field && ref.field !== "value") lines.push(`        field: ${JSON.stringify(ref.field)}`);
          if (ref.tags && Object.keys(ref.tags).length) {
            lines.push("        tags:");
            Object.entries(ref.tags).forEach(([tk, tv]) => lines.push(`          ${tk}: ${JSON.stringify(tv)}`));
          }
        });
      }
    });
    const snippet = lines.join("\n");
    const target = this.$("influx-snippet");
    if (target) target.value = snippet;
    return snippet;
  }

  copyInfluxSnippet() {
    const text = this.$("influx-snippet")?.value || this.generateInfluxSnippet();
    navigator.clipboard?.writeText(text)
      .then(() => this.setNotice("Export YAML copié."))
      .catch(() => this.setNotice("Copie impossible, sélection manuelle disponible."));
  }

  scheduleHistoryLoad(force) {
    if (this._portable) {
      if (this.state.historyHours <= 0) {
        this.rooms.forEach(room => { room.history = []; });
        this.outdoorComfortHistory = [];
        if (this._plotlyReady) this.plot();
        return;
      }
      this.loadCockpitHistory();
      return;
    }
    if (!this._hass?.callWS) return;
    if (this.state.historyHours <= 0) {
      window.clearTimeout(this._historyTimer);
      this.rooms.forEach(room => { room.history = []; });
      this.setNotice("Traînées masquées.");
      return;
    }
    const key = `${this.state.historyHours}:${this.rooms.map(room => `${room.temp}|${room.rh}`).join(",")}`;
    if (!force && key === this._historyKey && this.rooms.some(room => room.history.length)) return;
    this._historyKey = key;
    window.clearTimeout(this._historyTimer);
    this._historyTimer = window.setTimeout(() => this.loadHistory(), force ? 80 : 900);
  }

  scheduleComfortHistoryLoad(force) {
    if (!this._hass?.callWS) return;
    const patio = this.patio();
    const key = `${COMFORT_BASIS_DAYS}:${COMFORT_TPMA_ALPHA}:${patio.temp}|${patio.rh}`;
    if (!force && key === this._comfortHistoryKey && this.comfortBasis) return;
    this._comfortHistoryKey = key;
    window.clearTimeout(this._comfortHistoryTimer);
    this._comfortHistoryTimer = window.setTimeout(() => this.loadComfortHistory(), force ? 120 : 1200);
  }

  async loadHistory() {
    if (!this._hass?.callWS) return;
    const end = new Date();
    const start = new Date(end.getTime() - this.state.historyHours * 3600 * 1000);
    const entityIds = this.rooms.flatMap(room => [room.temp, room.rh]);
    try {
      this.setNotice("Chargement historique HA...");
      const response = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: entityIds,
        minimal_response: false,
        no_attributes: true,
        significant_changes_only: false
      });
      const byEntity = this.normalizeHistory(response, entityIds);
      this.rooms.forEach(room => {
        room.history = this.combineHistory(byEntity[room.temp] || [], byEntity[room.rh] || []);
      });
      this.setNotice(`Historique HA: ${this.state.historyHours} h`);
      this.plot();
    } catch (error) {
      this.rooms.forEach(room => { room.history = []; });
      this.setNotice(`Historique indisponible : ${error.message || error}`);
      this.plot();
    }
  }

  // Load the outdoor reference used by the adaptive comfort model.
  // Home Assistant may refuse or truncate a 7-day browser-side history request
  // when Recorder retention/exclusions are not compatible; in that case the UI
  // falls back to the instant outdoor point and explains it in the chip tooltip.
  async loadComfortHistory() {
    if (!this._hass?.callWS) return;
    const patio = this.patio();
    const end = new Date();
    const start = new Date(end.getTime() - COMFORT_BASIS_DAYS * 24 * 3600 * 1000);
    const entityIds = [patio.temp, patio.rh];
    try {
      const response = await this._hass.callWS({
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: entityIds,
        minimal_response: false,
        no_attributes: true,
        significant_changes_only: false
      });
      const byEntity = this.normalizeHistory(response, entityIds);
      const points = this.combineHistory(byEntity[patio.temp] || [], byEntity[patio.rh] || []);
      this.outdoorComfortHistory = points;
      if (points.length) {
        const basis = this.weightedOutdoorComfortBasis(points, end);
        this.comfortBasis = basis.count > 0 ? {
          t: basis.t,
          rh: basis.rh,
          w: mixing(basis.t, basis.rh, this.state.pressure),
          count: basis.count,
          dailyCount: basis.dailyCount,
          source: `Tpma ${COMFORT_BASIS_DAYS} j pondérés`,
          method: `Tpma Givoni/adaptatif : moyenne extérieure prévalente calculée sur ${COMFORT_BASIS_DAYS} jours glissants. Les mesures sont agrégées par tranches de 24 h, puis pondérées exponentiellement avec alpha=${COMFORT_TPMA_ALPHA} ; la tranche la plus récente pèse davantage que la plus ancienne.`
        } : null;
        this.updateComfortBasisChip();
      } else {
        this.comfortBasis = null;
        this.updateComfortBasisChip();
      }
      this.plot();
    } catch (error) {
      this.outdoorComfortHistory = [];
      this.comfortBasis = null;
      this.updateComfortBasisChip();
      this.setNotice(`Base confort extérieure indisponible : ${error.message || error}`);
      this.plot();
    }
  }

  // Givoni/adaptive comfort basis used by the panel:
  // 1. split the last 7 rolling days into 24 h buckets;
  // 2. average outdoor dry-bulb temperature and RH inside each bucket;
  // 3. apply an exponentially decreasing weight, so J-1 matters more than J-7.
  //
  // This is intentionally centralized; zones, scores and action labels all read
  // from comfortPoint(), preventing parallel comfort centers from diverging.
  weightedOutdoorComfortBasis(points, end = new Date()) {
    const buckets = Array.from({ length: COMFORT_BASIS_DAYS }, () => ({ t: 0, rh: 0, count: 0 }));
    const endMs = end.getTime();
    points.forEach(point => {
      const ts = point.ts instanceof Date ? point.ts.getTime() : new Date(point.ts).getTime();
      if (!Number.isFinite(ts) || !Number.isFinite(point.t) || !Number.isFinite(point.rh)) return;
      const ageDays = (endMs - ts) / 86400000;
      const bucket = Math.floor(ageDays);
      if (bucket < 0 || bucket >= COMFORT_BASIS_DAYS) return;
      buckets[bucket].t += point.t;
      buckets[bucket].rh += point.rh;
      buckets[bucket].count += 1;
    });
    let weightedT = 0;
    let weightedRh = 0;
    let weightSum = 0;
    let count = 0;
    let dailyCount = 0;
    buckets.forEach((bucket, index) => {
      if (!bucket.count) return;
      const weight = Math.pow(COMFORT_TPMA_ALPHA, index);
      weightedT += (bucket.t / bucket.count) * weight;
      weightedRh += (bucket.rh / bucket.count) * weight;
      weightSum += weight;
      count += bucket.count;
      dailyCount += 1;
    });
    if (!weightSum) {
      const patio = this.patio();
      return { t: patio.t, rh: patio.rhValue, count: 0, dailyCount: 0 };
    }
    return {
      t: weightedT / weightSum,
      rh: weightedRh / weightSum,
      count,
      dailyCount
    };
  }

  normalizeHistory(response, entityIds) {
    const byEntity = {};
    entityIds.forEach(id => { byEntity[id] = []; });
    if (Array.isArray(response)) {
      if (Array.isArray(response[0])) {
        response.forEach((series, index) => {
          const entityId = entityIds[index];
          if (entityId) byEntity[entityId] = series;
        });
      } else {
        response.forEach(item => {
          const entityId = item.entity_id;
          if (entityId && byEntity[entityId]) byEntity[entityId].push(item);
        });
      }
    } else if (response && typeof response === "object") {
      Object.entries(response).forEach(([entityId, series]) => {
        if (byEntity[entityId] && Array.isArray(series)) byEntity[entityId] = series;
      });
    }
    return byEntity;
  }

  historyValue(record) {
    const value = Number(record?.state ?? record?.s);
    const rawTime = record?.last_changed ?? record?.last_updated ?? record?.lc ?? record?.lu;
    let time = rawTime instanceof Date ? rawTime : new Date(rawTime);
    if (typeof rawTime === "number") time = new Date(rawTime > 1e12 ? rawTime : rawTime * 1000);
    return Number.isFinite(value) && Number.isFinite(time.getTime()) ? { value, time } : null;
  }

  // Portable mode: pull the normalized history series from the hub's
  // /api/history (keyed <space>.<metric>) and rebuild each room's trail in the
  // same {t, rh, w, ts, hour} shape the chart already consumes. The outdoor
  // (patio) trail also feeds the comfort-center trajectory.
  async loadCockpitHistory() {
    if (!this._portable) return;
    const hours = this.state.historyHours || 12;
    try {
      const response = await fetch(`/api/history?window=${hours}h`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const series = data.series || {};
      this.rooms.forEach(room => {
        room.history = this.combineSeries(series[`${room.id}.temperature`] || [], series[`${room.id}.humidity`] || []);
      });
      const patio = this.patio();
      this.outdoorComfortHistory = patio ? (this.rooms.find(room => room.id === patio.id)?.history || []) : [];
      if (this._plotlyReady) this.plot();
    } catch (error) {
      console.warn("[vesta portable] history unavailable", error);
    }
  }

  // Pair a temperature series and a humidity series (each [{ts, value}]) into
  // trail points, matching each temperature to the nearest-in-time humidity
  // sample within 10 minutes — same tolerance as the Home Assistant path.
  combineSeries(tempSamples, rhSamples) {
    const toPoints = samples => samples
      .map(sample => ({ time: new Date(sample.ts), value: Number(sample.value) }))
      .filter(sample => Number.isFinite(sample.value) && Number.isFinite(sample.time.getTime()))
      .sort((a, b) => a.time - b.time);
    const temps = toPoints(tempSamples);
    const rhs = toPoints(rhSamples);
    if (!temps.length || !rhs.length) return [];
    const points = [];
    let rhIndex = 0;
    temps.forEach(temp => {
      while (rhIndex + 1 < rhs.length && rhs[rhIndex + 1].time <= temp.time) rhIndex += 1;
      const nearest = [rhs[rhIndex], rhs[rhIndex + 1]]
        .filter(Boolean)
        .sort((a, b) => Math.abs(a.time - temp.time) - Math.abs(b.time - temp.time))[0];
      if (!nearest || Math.abs(nearest.time - temp.time) > 10 * 60 * 1000) return;
      points.push({
        t: temp.value,
        rh: nearest.value,
        w: mixing(temp.value, nearest.value, this.state.pressure),
        ts: temp.time.toISOString(),
        hour: temp.time.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
      });
    });
    return points;
  }

  combineHistory(tempSeries, rhSeries) {
    const temps = tempSeries.map(record => this.historyValue(record)).filter(Boolean);
    const rhs = rhSeries.map(record => this.historyValue(record)).filter(Boolean);
    const points = [];
    let rhIndex = 0;
    temps.forEach(temp => {
      while (rhIndex + 1 < rhs.length && rhs[rhIndex + 1].time <= temp.time) rhIndex += 1;
      const candidates = [rhs[rhIndex], rhs[rhIndex + 1]].filter(Boolean);
      const nearest = candidates.sort((a, b) => Math.abs(a.time - temp.time) - Math.abs(b.time - temp.time))[0];
      if (!nearest || Math.abs(nearest.time - temp.time) > 10 * 60 * 1000) return;
      points.push({
        t: temp.value,
        rh: nearest.value,
        w: mixing(temp.value, nearest.value, this.state.pressure),
        ts: temp.time.toISOString(),
        hour: temp.time.toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
      });
    });
    return points;
  }
}

const PANEL_ELEMENT_NAME = "vesta-psychro-panel-v202606150019";
if (!customElements.get(PANEL_ELEMENT_NAME)) {
  customElements.define(PANEL_ELEMENT_NAME, VestaPsychroPanel);
}
window.VestaPsychroPanel = { config: CONFIG, element: PANEL_ELEMENT_NAME };
