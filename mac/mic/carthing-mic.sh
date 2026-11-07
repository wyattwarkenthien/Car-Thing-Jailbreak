#!/bin/bash
# Stream the Car Thing's microphones to this Mac as a microphone, for dictation and speech-to-text.
#
# Runs as a LaunchAgent (install with install-mic.sh). While the Car Thing is plugged in over USB, it:
#   - starts ctmic.py on the Car Thing, which records its four-mic array (48 kHz, 32-bit, 4 channels: its
#     native format) with `arecord` and serves it on the Car Thing's port 8739,
#   - reads that over the USB cable through `adb forward` (Mac -> Car Thing only, which keeps USB stable),
#   - mixes the four mics into one, filters out low rumble (fans, heating), boosts the level, and
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
MIX="1v0.25,2v0.25,3v0.25,4v0.25"

log() { echo "$(date '+%H:%M:%S') $*"; }
[ -x "$SOX" ] || { log "sox not found. Run install-mic.sh."; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
LPORT=18739

"$ADB" start-server >/dev/null 2>&1
while true; do
  if "$ADB" devices -l 2>/dev/null | grep -q "spotify-car-thing"; then
    # Free the mic: Spotify's original app holds it (spotify-off.sh turns it off for good),
    # and a stream left over from an earlier session would too.
    "$ADB" shell 'supervisorctl stop superbird >/dev/null 2>&1; killall arecord; pkill -f "/tmp/ctmi[c].py"' >/dev/null 2>&1
    "$ADB" push "$HERE/ctmic.py" /tmp/ctmic.py >/dev/null 2>&1
    "$ADB" forward tcp:$LPORT tcp:8739 >/dev/null
    # Start the server detached on the Car Thing. (Run in the background from a LaunchAgent, a plain
    # `adb shell` sees no input and closes, which would kill the server.)
    "$ADB" shell -n 'nohup python3 /tmp/ctmic.py >/tmp/ctmic.log 2>&1 </dev/null &' </dev/null >/dev/null 2>&1
    # Python takes a few seconds to start on the Car Thing. Wait until it's listening on port 8739
    # (0x2223 in /proc/net/tcp, state 0A = listening), up to 15 seconds, before connecting.
    for i in $(seq 1 15); do
      sleep 1
      "$ADB" shell 'grep -i ":2223 00000000:0000 0A" /proc/net/tcp' 2>/dev/null | grep -q 0A && break
    done
    log "Car Thing found. Streaming its mic to \"$DEVICE\" (+$GAIN dB)."
    nc -d 127.0.0.1 $LPORT |   # -d: never read stdin (a LaunchAgent has none, and nc would quit at its end)
      "$SOX" -q -t raw -r 48000 -e signed -b 32 -c 4 - -t coreaudio "$DEVICE" \
        remix "$MIX" "$MIX" highpass 80 gain -l "$GAIN"
    "$ADB" shell -n 'cat /tmp/ctmic.log 2>/dev/null; killall arecord 2>/dev/null' </dev/null 2>/dev/null | sed 's/^/    car thing: /'
    "$ADB" forward --remove tcp:$LPORT >/dev/null 2>&1
    log "Stream stopped (unplugged, rebooted or busy). Retrying."
  fi
  sleep 5
done
