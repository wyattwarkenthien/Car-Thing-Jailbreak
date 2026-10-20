#!/bin/bash
# Set the Car Thing's clock and time zone from this Mac, over USB.
# Run it whenever the time looks wrong (e.g. after the Car Thing has been unplugged).
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
"$ADB" start-server >/dev/null 2>&1
if ! "$ADB" devices -l | grep -q "spotify-car-thing"; then echo "Car Thing not found. Plug it in (no buttons held), wait for it to boot, and try again."; exit 1; fi

# Mac time zone name, e.g. America/Chicago
TZNAME="$(readlink /etc/localtime | sed 's#.*/zoneinfo/##')"
NOW_UTC="$(date -u '+%Y-%m-%d %H:%M:%S')"

echo "Setting time to $NOW_UTC UTC..."
"$ADB" shell "date -u -s '$NOW_UTC' >/dev/null && (hwclock -w -u 2>/dev/null || true)"

echo "Setting time zone to $TZNAME..."
RESULT="$("$ADB" shell "mount -o remount,rw / ; \
  if [ -f /usr/share/zoneinfo/$TZNAME ]; then ln -sf /usr/share/zoneinfo/$TZNAME /etc/localtime && echo ok; else echo missing; fi; \
  sync; mount -o remount,ro / 2>/dev/null")"
if echo "$RESULT" | grep -q ok; then
  echo "Time zone set."
else
  echo "This firmware has no time zone files, so the clock will show UTC. Tell Claude and we'll handle the offset in the home screen instead."
fi

echo "Car Thing now says: $("$ADB" shell date)"
"$ADB" shell 'supervisorctl restart chromium' >/dev/null 2>&1 || true
echo "Done. The screen will reload in a few seconds."
