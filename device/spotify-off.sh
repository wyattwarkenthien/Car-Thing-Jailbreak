#!/bin/bash
# Turn off Spotify's original app (the "superbird" service), which still runs in the background after the
# jailbreak. It holds the microphone open around the clock (listening for "Hey Spotify"), uses memory the
# games could use, and can interfere with Bluetooth. Nothing in this project needs it.
#
#   bash spotify-off.sh          turn it off now and at every boot
#   bash spotify-off.sh --undo   turn it back on
#
# update.sh and install.sh run this for you. restore.sh also brings it back, along with everything else.
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
"$ADB" start-server >/dev/null 2>&1
if ! "$ADB" devices -l | grep -q "spotify-car-thing"; then echo "Car Thing not found. Plug it in (no buttons held), wait for it to boot, and try again."; exit 1; fi
dev() { "$ADB" shell "$@"; }
CONF=/etc/supervisord.conf

dev 'mount -o remount,rw /'
dev "[ -f $CONF.orig ] || cp $CONF $CONF.orig"
if [ "$(dev "grep -c '^\[program:superbird\]' $CONF" | tr -dc '0-9')" = "0" ]; then
  echo "No superbird service on this Car Thing. Nothing to do."
  dev 'sync; mount -o remount,ro / 2>/dev/null'
  exit 0
fi

# Remove any autostart line inside [program:superbird] (the default is to start), then add ours.
dev "sed -i '/^\[program:superbird\]/,/^\[/{/^autostart=/d}' $CONF"
if [ "$1" = "--undo" ]; then
  dev 'sync; mount -o remount,ro / 2>/dev/null; supervisorctl reread >/dev/null; supervisorctl update >/dev/null; supervisorctl start superbird >/dev/null 2>&1'
  echo "Spotify's original app is back on."
else
  dev "sed -i '/^\[program:superbird\]/a autostart=false' $CONF"
  dev 'sync; mount -o remount,ro / 2>/dev/null; supervisorctl reread >/dev/null; supervisorctl update >/dev/null; supervisorctl stop superbird >/dev/null 2>&1'
  echo "Spotify's original app is off (now and at every boot)."
fi
dev "grep -A2 '^\[program:superbird\]' $CONF; supervisorctl status superbird"
