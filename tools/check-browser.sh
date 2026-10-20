#!/bin/bash
# Why is the Car Thing's browser not showing the home screen? Reads logs and memory, restarts the browser once.
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/browser-report.txt"
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
"$ADB" start-server >/dev/null 2>&1
if ! "$ADB" devices -l | grep -q "spotify-car-thing"; then echo "Car Thing not found. Plug it in (no buttons held), wait for it to boot, and try again."; exit 1; fi
page() { "$ADB" forward tcp:9333 tcp:2222 >/dev/null 2>&1; curl -s --max-time 5 http://127.0.0.1:9333/json | grep -E '"(url|title|type)"'; "$ADB" forward --remove tcp:9333 >/dev/null 2>&1; }
echo "Checking the browser (about 40 seconds)..."
{
  echo "== memory"; "$ADB" shell 'free; uptime'
  echo "== processes"; "$ADB" shell 'ps w | grep -E "[c]hrome|[p]ython|[b]luetooth|[s]uperbird" | cut -c1-150'
  echo "== out-of-memory kills"; "$ADB" shell 'grep -i -E "earlyoom|oom|killed" /var/log/messages | tail -15; dmesg | grep -i -E "oom|killed process" | tail -10'
  echo "== chromium errors"; "$ADB" shell 'tail -40 /var/log/chromium.err'
  echo "== open page (before restart)"; page
  echo "== restarting browser"; "$ADB" shell 'supervisorctl restart chromium'
  sleep 15
  echo "== open page (after restart)"; page
  echo "== chromium errors (after restart)"; "$ADB" shell 'tail -25 /var/log/chromium.err'
  echo "== memory (after)"; "$ADB" shell 'free'
} > "$OUT" 2>&1
echo "Done. Report saved to $OUT"
