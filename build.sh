#!/bin/bash
# Build everything that goes on the Car Thing into device/home/
#   device/home/index.html                 home screen
#   device/home/apps/westward/index.html   Westward 1848
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Building Westward 1848..."
cd "$ROOT/source"
[ -d node_modules ] || npm install
node build.mjs
mkdir -p "$ROOT/device/home/apps/westward"
cp out/index.html "$ROOT/device/home/apps/westward/index.html"

echo "Building home screen..."
cd "$ROOT/home"
[ -d node_modules ] || npm install
node build.mjs

echo "Done. Install with: bash device/install.sh"
