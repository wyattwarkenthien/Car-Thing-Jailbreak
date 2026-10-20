#!/bin/bash
# Install the Car Thing link on this Mac: a small background service that gives the Car Thing's
# Music app Spotify control and cover art over the USB cable. Starts automatically at login.
# Undo with: bash uninstall-link.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Library/Application Support/carthing-link"
PLIST="$HOME/Library/LaunchAgents/us.warkenthien.carthing-link.plist"
LABEL=us.warkenthien.carthing-link

PY="$(command -v python3 || true)"
if [ -z "$PY" ] || ! "$PY" -c 'import json, http.server' >/dev/null 2>&1; then
  echo "This needs Python 3, which comes with Apple's Command Line Tools."
  echo "Run:  xcode-select --install   then run this script again."
  exit 1
fi
[ "$PY" = "/usr/bin/python3" ] || echo "Using Python at $PY"

mkdir -p "$APP"
cp "$DIR/carthing_link.py" "$APP/carthing_link.py"

# Spotify Client ID (from developer.spotify.com > your app > Settings)
CUR="$("$PY" -c "import json,sys; print(json.load(open(sys.argv[1])).get('spotify_client_id',''))" "$APP/config.json" 2>/dev/null || true)"
if [ -n "$1" ]; then CID="$1"
elif [ -n "$CUR" ]; then CID="$CUR"; echo "Using your saved Spotify Client ID."
else
  echo
  echo "Paste your Spotify Client ID (developer.spotify.com > your app > Settings) and press Return:"
  read -r CID
fi
CID="$(echo "$CID" | tr -dc 'a-zA-Z0-9')"
[ ${#CID} -ge 20 ] || { echo "That doesn't look like a Client ID (it's 32 letters and numbers)."; exit 1; }
"$PY" -c "import json,sys; json.dump({'spotify_client_id': sys.argv[2]}, open(sys.argv[1],'w'))" "$APP/config.json" "$CID"
chmod 600 "$APP/config.json"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$APP/carthing_link.py</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$APP/link.log</string>
  <key>StandardErrorPath</key><string>$APP/link.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -s --max-time 2 http://127.0.0.1:8740/status >/dev/null 2>&1 && break
  sleep 1
done
if ! curl -s --max-time 2 http://127.0.0.1:8740/status >/dev/null 2>&1; then
  echo "The link didn't start. Last lines of its log:"; tail -20 "$APP/link.log" 2>/dev/null; exit 1
fi
echo
echo "Car Thing link is running and will start automatically when you log in."
echo "Opening Spotify login in your browser..."
open "http://127.0.0.1:8740/spotify/login"
