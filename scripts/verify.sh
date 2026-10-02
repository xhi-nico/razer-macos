#!/bin/bash
# Hermetic check: device files are valid, the tests pass, the native addon compiles, the app bundles.
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/check-devices.mjs
yarn -s test
yarn -s rebuild
yarn -s build
