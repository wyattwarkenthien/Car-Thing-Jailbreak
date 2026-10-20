#!/bin/bash
# READ-ONLY: show what the Car Thing is booting into and what's installed. Changes nothing.
OUT="$(cd "$(dirname "$0")" && pwd)/check-report.txt"
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
"$ADB" start-server >/dev/null 2>&1
if ! "$ADB" devices -l | grep -q "spotify-car-thing"; then echo "Car Thing not found. Plug it in (no buttons held), wait for it to boot, and try again."; exit 1; fi
{
  echo "== boot page";      "$ADB" shell 'grep -o -- "--app=[^ ]*" /etc/supervisord.conf'
  echo "== installed";      "$ADB" shell 'ls -la /usr/share/carthing-home /usr/share/carthing-home/apps/westward /usr/share/westward 2>&1'
  echo "== has time zone setting"; "$ADB" shell 'grep -c "Device setting" /usr/share/carthing-home/index.html 2>&1'
  echo "== device clock";   "$ADB" shell 'date; date -u'
  echo "== mac clock";      date; date -u
  echo "== chromium";       "$ADB" shell 'supervisorctl status chromium'
  echo "== open page"
  "$ADB" forward tcp:9333 tcp:2222 >/dev/null 2>&1 && curl -s --max-time 5 http://127.0.0.1:9333/json | grep -E '"(url|title)"'
  "$ADB" forward --remove tcp:9333 >/dev/null 2>&1
} > "$OUT" 2>&1
cat "$OUT"
echo
echo "Done. Report saved to $OUT"
