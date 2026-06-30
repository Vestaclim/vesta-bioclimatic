"""CLI for local validation, Raspberry Pi installs, and Influx-backed runtime."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config_schema import load_site_config
from .influx import InfluxClient, suggest_yaml_mapping
from .models import HouseSnapshot
from .runtime import MeasurementStore, build_cockpit_view, build_snapshot
from .strategy import assess_house


def main() -> None:
    if len(sys.argv) == 2 and not sys.argv[1].startswith("-") and sys.argv[1] not in {
        "assess",
        "view",
        "init-config",
        "inspect-influx",
        "snapshot",
        "serve",
    }:
        _print_assessment(Path(sys.argv[1]))
        return

    parser = argparse.ArgumentParser(prog="vesta-bioclimatic")
    sub = parser.add_subparsers(dest="command")

    assess = sub.add_parser("assess", help="Assess a HouseSnapshot JSON file")
    assess.add_argument("snapshot", type=Path)

    view = sub.add_parser("view", help="Build cockpit view from YAML config and latest-values JSON")
    view.add_argument("--site", type=Path, required=True)
    view.add_argument("--values", type=Path, required=True, help="JSON dict keyed as '<space>.<metric>'")

    init = sub.add_parser("init-config", help="Copy commented YAML templates into a directory")
    init.add_argument("target", type=Path)

    inspect = sub.add_parser("inspect-influx", help="Read compact Influx schema metadata and print YAML mapping hints")
    inspect.add_argument("--site", type=Path, required=True)
    inspect.add_argument("--window", default="30d")
    inspect.add_argument("--limit", type=int, default=300)

    snapshot = sub.add_parser("snapshot", help="Build a HouseSnapshot JSON from YAML config and latest-values JSON")
    snapshot.add_argument("--site", type=Path, required=True)
    snapshot.add_argument("--values", type=Path, required=True)

    serve = sub.add_parser("serve", help="Serve the cockpit panel fed by the Python CockpitView (portable bridge)")
    serve.add_argument("--site", type=Path, required=True)
    serve.add_argument("--values", type=Path, default=None, help="JSON dict keyed as '<space>.<metric>', re-read each refresh (required unless --live influx)")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8770)
    serve.add_argument("--pressure", type=float, default=1013.25, help="Atmospheric pressure in hPa")
    serve.add_argument("--history", default="auto", choices=["auto", "memory", "influx"], help="History backend (auto: Influx if a token is configured, else memory)")
    serve.add_argument("--live", default="auto", choices=["auto", "file", "influx", "mqtt"], help="Live source (auto: Influx when history is Influx, else the --values file; mqtt needs an mqtt: block)")
    serve.add_argument("--state-file", type=Path, default=None, help="Where to persist the panel-applied connectivity (default: .vesta_connectivity.json next to --site)")
    serve.add_argument("--no-state", action="store_true", help="Ignore and do not write the persisted connectivity (use CLI flags only)")

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        return

    if args.command == "assess":
        _print_assessment(args.snapshot)
    elif args.command == "view":
        site = load_site_config(args.site)
        values = MeasurementStore.from_plain_dict(json.loads(args.values.read_text(encoding="utf-8")))
        print(json.dumps(build_cockpit_view(site, values).to_dict(), ensure_ascii=False, indent=2))
    elif args.command == "snapshot":
        site = load_site_config(args.site)
        values = MeasurementStore.from_plain_dict(json.loads(args.values.read_text(encoding="utf-8")))
        print(json.dumps(build_snapshot(site, values).to_dict(), ensure_ascii=False, indent=2))
    elif args.command == "init-config":
        _copy_templates(args.target)
    elif args.command == "inspect-influx":
        site = load_site_config(args.site)
        rows = InfluxClient(site.influx).schema_extract(window=args.window, limit=args.limit)
        print(suggest_yaml_mapping(rows))
    elif args.command == "serve":
        from .server import serve as serve_cockpit

        serve_cockpit(args.site, args.values, host=args.host, port=args.port, pressure_hpa=args.pressure, history=args.history, live=args.live, state_file=args.state_file, no_state=args.no_state)


def _print_assessment(path: Path) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    result = assess_house(HouseSnapshot.from_dict(payload))
    print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))


def _copy_templates(target: Path) -> None:
    source = Path(__file__).resolve().parents[2] / "config"
    target.mkdir(parents=True, exist_ok=True)
    for name in ("site_house.yaml", "site_system.yaml", "actuators.yaml", "influx_mapping.yaml"):
        src = source / name
        if src.exists():
            (target / name).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Installed Vesta YAML templates in {target}")


if __name__ == "__main__":
    main()
