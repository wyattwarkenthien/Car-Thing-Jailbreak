#!/bin/bash
# Show your calendar on the Car Thing's home screen.
# Installs a small background job on this Mac that, every 5 minutes, downloads your published
# calendar (.ics link) and copies the next 7 days of events to the Car Thing over USB.
#
#   bash install-calendar.sh                    # asks for your calendar link
#   bash install-calendar.sh "https://...ics"   # or pass it in
# Undo with: bash uninstall-calendar.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Library/Application Support/carthing-calendar"
LABEL=us.warkenthien.carthing-calendar
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

PY=/usr/bin/python3
if ! "$PY" -c 'import zoneinfo, json' >/dev/null 2>&1; then
  echo "This needs Python 3.9+, which comes with Apple's Command Line Tools."
  echo "Run:  xcode-select --install   then run this script again."
  exit 1
fi

mkdir -p "$APP"
cp "$DIR/carthing_calendar.py" "$APP/carthing_calendar.py"

URL="$1"
if [ -z "$URL" ]; then
  CUR="$("$PY" -c "import json,sys; print(json.load(open(sys.argv[1])).get('ics_url',''))" "$APP/config.json" 2>/dev/null || true)"
  if [ -n "$CUR" ]; then
    echo "Using your saved calendar link. (To change it: bash install-calendar.sh \"NEW LINK\")"
    URL="$CUR"
  else
    echo
    echo "Paste your calendar's ICS link and press Return."
    echo "(Outlook on the web: Settings > Calendar > Shared calendars > Publish a calendar > ICS)"
    read -r URL
  fi
fi
URL="$(echo "$URL" | tr -d '[:space:]')"
case "$URL" in
  https://*|http://*|webcal://*|webcals://*) ;;
  *) echo "That doesn't look like a calendar link (it should start with https:// and usually ends in .ics)."; exit 1 ;;
esac
"$PY" -c "import json,sys; json.dump({'ics_url': sys.argv[2]}, open(sys.argv[1],'w'))" "$APP/config.json" "$URL"
chmod 600 "$APP/config.json"

echo "Testing the link..."
if ! "$PY" "$APP/carthing_calendar.py" --print > "$APP/preview.json" 2> "$APP/preview.err"; then
  cat "$APP/preview.err" "$APP/preview.json" 2>/dev/null | tail -5
  echo "Couldn't read that calendar. Check the link and try again."
  exit 1
fi
COUNT="$("$PY" -c "import json,sys; print(len(json.load(open(sys.argv[1]))['events']))" "$APP/preview.json")"
echo "Found $COUNT events in the next 7 days."
rm -f "$APP/preview.json" "$APP/preview.err"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$APP/carthing_calendar.py</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$APP/sync.log</string>
  <key>StandardErrorPath</key><string>$APP/sync.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 3
echo
tail -2 "$APP/sync.log" 2>/dev/null || true
echo
echo "Done. Your calendar will update on the Car Thing every 5 minutes while it's plugged into this Mac."
