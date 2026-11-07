#!/bin/bash
# Use the Car Thing as a microphone on this Mac (dictation, speech-to-text in Claude and other apps).
#
# Installs two free tools with Homebrew:
#   - BlackHole 2ch: a virtual audio device that shows up as a microphone (asks for your Mac password)
#   - sox: mixes and cleans up the Car Thing's four mics
# then a small background job (carthing-mic.sh) that streams the Car Thing's mics into BlackHole
# whenever it's plugged in over USB. Not meant for calls: there's no echo cancellation and a little delay.
#
#   bash install-mic.sh        Undo with: bash uninstall-mic.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Library/Application Support/carthing-mic"
LABEL=us.warkenthien.carthing-mic
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

BREW="$(command -v brew || ls /opt/homebrew/bin/brew /usr/local/bin/brew 2>/dev/null | head -1)"
if [ -z "$BREW" ]; then
  echo "This needs Homebrew. Install it from https://brew.sh, then run this script again."
  exit 1
fi

echo "1/4 Installing sox..."
command -v sox >/dev/null 2>&1 || [ -x /opt/homebrew/bin/sox ] || "$BREW" install sox

echo "2/4 Installing BlackHole 2ch (your Mac may ask for your password)..."
if [ ! -d /Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver ]; then
  "$BREW" install --cask blackhole-2ch
fi
if ! system_profiler SPAudioDataType 2>/dev/null | grep -q "BlackHole 2ch"; then
  echo "    Restarting macOS audio so BlackHole shows up (sound may blip for a second)..."
  sudo killall coreaudiod || true
  sleep 3
fi

echo "3/4 Turning off Spotify's original app on the Car Thing (it holds the mic)..."
bash "$DIR/../../device/spotify-off.sh" || echo "    (Car Thing not plugged in; the mic job will free the mic when it is.)"

echo "4/4 Starting the background job..."
mkdir -p "$APP" "$HOME/Library/LaunchAgents"
cp "$DIR/carthing-mic.sh" "$APP/carthing-mic.sh"
chmod 755 "$APP/carthing-mic.sh"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$APP/carthing-mic.sh</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>CTMIC_GAIN</key><string>24</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$APP/mic.log</string>
  <key>StandardErrorPath</key><string>$APP/mic.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 6
echo
tail -3 "$APP/mic.log" 2>/dev/null || true
echo
echo "Done. Now pick the Car Thing as your microphone:"
echo "  System Settings > Sound > Input > BlackHole 2ch"
echo "Too quiet or too loud? Change CTMIC_GAIN in $PLIST and run this script again."
