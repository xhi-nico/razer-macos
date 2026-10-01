#!/bin/bash
# Hermetic check: device files are valid, the native addon compiles, the app bundles.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/check-devices.mjs
yarn -s rebuild
yarn -s build
