#!/bin/bash
# Push a new build of the home screen and apps (the home/ folder here) without touching anything else.
DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET=/usr/share/carthing-home
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
"$ADB" shell 'mount -o remount,rw /' &&
  "$ADB" shell "rm -rf $TARGET" &&
  "$ADB" push "$DIR/home" "$TARGET" >/dev/null &&
  "$ADB" shell 'sync; mount -o remount,ro / ; supervisorctl restart bthelper 2>/dev/null; supervisorctl restart chromium'
echo "Updated."
