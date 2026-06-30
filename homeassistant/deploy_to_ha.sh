#!/usr/bin/env sh
set -eu

SRC_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

python3 "$SRC_DIR/install_to_config.py" --config-dir /config --source-dir "$SRC_DIR"
