#!/usr/bin/env python3
"""Install Vesta Psychro custom panel files into a Home Assistant /config tree."""

from __future__ import annotations

import argparse
import shutil
from datetime import datetime
from pathlib import Path


PANEL_SECTION = """\

# Vesta Psychro custom panel
panel_custom:
  - name: vesta-psychro-panel-v202606130005
    sidebar_title: Vesta Psychro
    sidebar_icon: mdi:chart-bell-curve-cumulative
    url_path: vesta-psychro
    module_url: /local/vesta-psychro/vesta-psychro-panel.js?v=202606130005
    require_admin: false
    config:
      title: Vesta Psychro
      history_hours: 12
"""

PANEL_ITEM = """\
  - name: vesta-psychro-panel-v202606130005
    sidebar_title: Vesta Psychro
    sidebar_icon: mdi:chart-bell-curve-cumulative
    url_path: vesta-psychro
    module_url: /local/vesta-psychro/vesta-psychro-panel.js?v=202606130005
    require_admin: false
    config:
      title: Vesta Psychro
      history_hours: 12
"""

PACKAGES_SECTION = """\

# Vesta Home Assistant packages
homeassistant:
  packages: !include_dir_named packages
"""

PACKAGES_LINE = "  packages: !include_dir_named packages\n"


def ensure_panel_custom(lines: list[str]) -> tuple[list[str], bool]:
    text = "".join(lines)
    if "vesta-psychro-panel" in text:
        return lines, False

    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("panel_custom:") and not line.startswith((" ", "\t")):
            suffix = stripped[len("panel_custom:"):].strip()
            if suffix:
                raise SystemExit(
                    "configuration.yaml uses a non-inline-editable panel_custom declaration. "
                    "Add homeassistant/config/panel_custom.yaml manually."
                )
            return lines[: index + 1] + [PANEL_ITEM] + lines[index + 1 :], True

    if text and not text.endswith("\n"):
        lines.append("\n")
    lines.extend(PANEL_SECTION.splitlines(keepends=True))
    return lines, True


def ensure_packages_include(lines: list[str]) -> tuple[list[str], bool, str]:
    text = "".join(lines)
    if "packages: !include_dir_named packages" in text:
        return lines, False, "already enabled"

    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("homeassistant:") and not line.startswith((" ", "\t")):
            suffix = stripped[len("homeassistant:"):].strip()
            if suffix:
                return lines, False, "manual merge needed: inline homeassistant declaration"
            section_end = index + 1
            while section_end < len(lines):
                next_line = lines[section_end]
                if next_line.strip() and not next_line.startswith((" ", "\t", "#")):
                    break
                section_end += 1
            section = "".join(lines[index + 1 : section_end])
            if "\n  packages:" in f"\n{section}":
                return lines, False, "manual merge needed: existing homeassistant.packages"
            return lines[: index + 1] + [PACKAGES_LINE] + lines[index + 1 :], True, "enabled"

    if text and not text.endswith("\n"):
        lines.append("\n")
    lines.extend(PACKAGES_SECTION.splitlines(keepends=True))
    return lines, True, "enabled"


def update_configuration(configuration: Path) -> None:
    text = configuration.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    lines, panel_changed = ensure_panel_custom(lines)
    lines, packages_changed, packages_status = ensure_packages_include(lines)

    if not panel_changed and not packages_changed:
        print(f"{configuration} already references vesta-psychro-panel; packages: {packages_status}")
        return

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = configuration.with_suffix(f".yaml.vesta-backup-{stamp}")
    shutil.copy2(configuration, backup)
    configuration.write_text("".join(lines), encoding="utf-8")
    changes = []
    if panel_changed:
        changes.append("panel_custom")
    if packages_changed:
        changes.append("packages")
    print(f"Updated {configuration} ({', '.join(changes)}); backup: {backup}")
    if packages_status != "enabled":
        print(f"Vesta packages not enabled automatically: {packages_status}")


def install(config_dir: Path, source_dir: Path) -> None:
    if not config_dir.exists():
        raise SystemExit(f"{config_dir} does not exist")
    www_target = config_dir / "www" / "vesta-psychro"
    www_source = source_dir / "www" / "vesta-psychro"
    if not www_source.exists():
        raise SystemExit(f"{www_source} does not exist")

    www_target.mkdir(parents=True, exist_ok=True)
    for name in ("vesta-psychro-panel.js", "plotly-2.35.2.min.js"):
        shutil.copy2(www_source / name, www_target / name)

    packages_source = source_dir / "packages"
    packages_target = config_dir / "packages"
    if packages_source.exists():
        packages_target.mkdir(parents=True, exist_ok=True)
        for source in packages_source.glob("*.yaml"):
            shutil.copy2(source, packages_target / source.name)

    configuration = config_dir / "configuration.yaml"
    if not configuration.exists():
        raise SystemExit(f"{configuration} does not exist")

    update_configuration(configuration)
    print(f"Installed panel assets in {www_target}")
    if packages_source.exists():
        print(f"Installed Vesta packages in {packages_target}")
    print("Next inside Home Assistant Terminal: ha core check")
    print("If valid, reload templates/helpers or restart Home Assistant to activate panel_custom and packages.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config-dir", type=Path, default=Path("/config"))
    parser.add_argument("--source-dir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    install(args.config_dir, args.source_dir)


if __name__ == "__main__":
    main()
