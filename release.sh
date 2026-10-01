#!/bin/bash
# Clean build of the installer: dist/Razer macOS-<version>-universal.dmg (ad-hoc signed).
set -euo pipefail

yarn clean
rm -rf ./node_modules ./dist

yarn
yarn dist
