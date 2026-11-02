#!/bin/bash
# Show what this Mac is playing (Music or Spotify) on the Car Thing's Music app, and control it from there.
# Installs a small background job that runs while you're logged in. It talks to the Car Thing over the USB
# cable (adb forward), so the Car Thing just needs to be plugged into this Mac.
#   bash install-music.sh        Undo with: bash uninstall-music.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Library/Application Support/carthing-music"
LABEL=us.warkenthien.carthing-music
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PY=/usr/bin/python3
if ! "$PY" -c 'import json' >/dev/null 2>&1; then
  echo "This needs Apple's Python, which comes with the Command Line Tools."
  echo "Run:  xcode-select --install   then run this script again."
  exit 1
fi
mkdir -p "$APP"
cp "$DIR/carthing_music.py" "$APP/carthing_music.py"

echo "Checking what's playing (macOS may ask to let Terminal control Music or Spotify: click OK)..."
"$PY" "$APP/carthing_music.py" --print | grep -E '"(app|title|artist)"' | head -6 || true

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$APP/carthing_music.py</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$APP/music.log</string>
  <key>StandardErrorPath</key><string>$APP/music.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 4
echo
tail -3 "$APP/music.log" 2>/dev/null || true
echo
echo "Done. Open Music on the Car Thing while something plays on this Mac."
echo "If macOS asks whether \"python3\" may control Music or Spotify, click OK."
