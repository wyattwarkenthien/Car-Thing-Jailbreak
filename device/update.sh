#!/bin/bash
# Push a new version of the game (index.html in this folder) without changing anything else.
DIR="$(cd "$(dirname "$0")" && pwd)"
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
"$ADB" shell 'mount -o remount,rw /' && "$ADB" push "$DIR/index.html" /usr/share/westward/index.html && "$ADB" shell 'sync; mount -o remount,ro / ; supervisorctl restart chromium'
echo "Game updated."
