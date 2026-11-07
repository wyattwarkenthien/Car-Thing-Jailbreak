#!/bin/bash
# Stream the Car Thing's microphones to this Mac as a microphone, for dictation and speech-to-text.
#
# Runs as a LaunchAgent (install with install-mic.sh). While the Car Thing is plugged in over USB, it:
#   - connects to the "ctmic" service on the Car Thing (ctmic.py, installed by install-mic.sh), which
#     records its four-mic array with `arecord`, mixed to one channel at 16 kHz, 16-bit (light on USB),
#   - reads that over the USB cable through `adb forward` (Mac -> Car Thing only, which keeps USB stable),
#   - filters out low rumble (fans, heating), boosts the level, and
#   - plays it into the "BlackHole 2ch" virtual audio device, which macOS then offers as a microphone.
#
# Settings (environment variables, set in the LaunchAgent plist):
#   CTMIC_GAIN    boost in dB (default 24; the raw mics are quiet)
#   CTMIC_DEVICE  output device name (default "BlackHole 2ch")
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb || echo /opt/homebrew/bin/adb)"
SOX="$(command -v sox || ls /opt/homebrew/bin/sox /usr/local/bin/sox 2>/dev/null | head -1)"
GAIN="${CTMIC_GAIN:-24}"
DEVICE="${CTMIC_DEVICE:-BlackHole 2ch}"
LPORT=18739

log() { echo "$(date '+%H:%M:%S') $*"; }
[ -x "$SOX" ] || { log "sox not found. Run install-mic.sh."; exit 1; }

"$ADB" start-server >/dev/null 2>&1
while true; do
  if "$ADB" devices -l 2>/dev/null | grep -q "spotify-car-thing"; then
    # Spotify's original app holds the mic (spotify-off.sh turns it off for good).
    "$ADB" shell 'supervisorctl stop superbird' </dev/null >/dev/null 2>&1
    "$ADB" forward tcp:$LPORT tcp:8739 >/dev/null 2>&1
    log "Car Thing found. Streaming its mic to \"$DEVICE\" (+$GAIN dB)."
    # -d: never read stdin (a LaunchAgent has none, and nc would quit at its end)
    nc -d 127.0.0.1 $LPORT |
      "$SOX" -q -t raw -r 16000 -e signed -b 16 -c 1 - -t coreaudio "$DEVICE" \
        highpass 80 gain -l "$GAIN" remix 1 1 rate 48000
    log "Stream stopped. The Car Thing's mic service says:"
    "$ADB" shell 'uptime; supervisorctl status ctmic; tail -3 /var/log/ctmic.log' </dev/null 2>&1 | sed 's/^/    /'
  fi
  sleep 5
done
