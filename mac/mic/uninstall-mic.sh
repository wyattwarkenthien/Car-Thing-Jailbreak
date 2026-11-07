#!/bin/bash
# Stop using the Car Thing as a microphone: removes the background job.
# BlackHole and sox stay installed; remove them with:  brew uninstall --cask blackhole-2ch && brew uninstall sox
LABEL=us.warkenthien.carthing-mic
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
rm -rf "$HOME/Library/Application Support/carthing-mic"
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
"$ADB" shell 'killall arecord' >/dev/null 2>&1 || true
echo "Removed. Switch your input back in System Settings > Sound > Input."
