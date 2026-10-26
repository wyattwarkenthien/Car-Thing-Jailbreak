#!/bin/bash
# Stop syncing your calendar to the Car Thing and clear it from the home screen.
LABEL=us.warkenthien.carthing-calendar
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
[ -n "$ADB" ] && "$ADB" shell 'rm -f /var/carthing/calendar.json' >/dev/null 2>&1
echo "Calendar sync removed. Your saved link is in ~/Library/Application Support/carthing-calendar (delete that folder to forget it)."
