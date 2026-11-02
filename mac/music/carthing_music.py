#!/usr/bin/env python3
"""Show what your Mac is playing on the Car Thing, and control it from there.

Runs on the Mac as a LaunchAgent (install with install-music.sh). Works with the Music app and Spotify.
While the Car Thing is plugged in over USB, it:
  - reads the current track from Music / Spotify with AppleScript,
  - sends it to the Car Thing's helper through `adb forward` (the Car Thing never connects out to the Mac,
    which keeps USB stable), and
  - picks up the buttons you pressed in the Car Thing's Music app and runs them on the Mac.

Standard library only (Apple's /usr/bin/python3 is fine).

  python3 carthing_music.py          # run the loop (what the LaunchAgent does)
  python3 carthing_music.py --print  # print what's playing once and exit (handy for testing)
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

ADB_CANDIDATES = ["/Applications/DeskThing.app/Contents/Resources/mac/adb", "/opt/homebrew/bin/adb", "/usr/local/bin/adb"]
LOCAL_PORT = int(os.environ.get("CTMUSIC_PORT", "18737"))
BASE = "http://127.0.0.1:%d/api/" % LOCAL_PORT

# One script reads both players. "is running" checks keep it from launching an app that's closed.
READ = r'''
set out to ""
if application "Music" is running then
  tell application "Music"
    try
      set t to current track
      set out to out & "music" & tab & (player state as string) & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & ((duration of t) * 1000) & tab & ((player position) * 1000) & tab & (shuffle enabled as string) & tab & (song repeat as string) & linefeed
    end try
  end tell
end if
if application "Spotify" is running then
  tell application "Spotify"
    try
      set t to current track
      set out to out & "spotify" & tab & (player state as string) & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & (duration of t) & tab & ((player position) * 1000) & tab & (shuffling as string) & tab & (repeating as string) & linefeed
    end try
  end tell
end if
return out
'''

APPNAME = {"music": "Music", "spotify": "Spotify"}
last_app = None  # the app we last showed / controlled, preferred when both have a track


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def osa(script, timeout=6):
    p = subprocess.run(["/usr/bin/osascript", "-e", script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if p.returncode != 0 and p.stderr:
        err = p.stderr.decode("utf-8", "replace").strip()
        if "-1743" in err:
            log("macOS hasn't allowed this script to control Music/Spotify yet. Allow it in System Settings > Privacy & Security > Automation.")
        else:
            log("osascript:", err[:200])
    return p.stdout.decode("utf-8", "replace")


def num(s):
    try:
        return float(s.strip().replace(",", "."))
    except ValueError:
        return 0.0


def read_players():
    players = {}
    for line in osa(READ).splitlines():
        f = line.split("\t")
        if len(f) < 9 or f[0] not in APPNAME:
            continue
        app = f[0]
        state = f[1].strip()
        rep = f[8].strip()
        players[app] = {
            "app": app,
            "playing": state == "playing",
            "stopped": state == "stopped",
            "title": f[2], "artist": f[3], "album": f[4],
            "duration": int(num(f[5])), "position": int(num(f[6])),
            "shuffle": f[7].strip() == "true",
            # Music: off / one / all.  Spotify: true / false
            "repeat": {"one": "track", "all": "context", "true": "context"}.get(rep, "off"),
        }
    return players


def pick(players):
    global last_app
    live = [p for p in players.values() if not p["stopped"] and p["title"]]
    if not live:
        return None
    playing = [p for p in live if p["playing"]]
    if playing:
        choice = next((p for p in playing if p["app"] == last_app), playing[0])
    else:
        choice = next((p for p in live if p["app"] == last_app), live[0])
    last_app = choice["app"]
    return choice


def run_cmd(c, now):
    app = (now or {}).get("app") or last_app or "Music"
    name = APPNAME.get(app, "Music")
    cmd = c.get("c")
    if cmd in ("play", "pause"):
        s = cmd
    elif cmd == "toggle":
        s = "playpause"
    elif cmd == "next":
        s = "next track"
    elif cmd == "prev":
        # like most players: restart the song if we're more than 3s in
        s = "if player position > 3 then\nset player position to 0\nelse\nprevious track\nend if"
    elif cmd == "seek":
        s = "set player position to %.2f" % (num(c.get("ms") or "0") / 1000.0)
    elif cmd == "shuffle":
        on = "true" if c.get("on") == "1" else "false"
        s = ("set shuffle enabled to " if app == "music" else "set shuffling to ") + on
    elif cmd == "repeat":
        mode = c.get("mode") or ""
        if app == "music":
            s = "set song repeat to " + {"context": "all", "track": "one"}.get(mode, "off")
        else:
            s = "set repeating to " + ("true" if mode in ("context", "track") else "false")
    else:
        return
    osa('tell application "%s"\n%s\nend tell' % (name, s))


def computer_name():
    try:
        return subprocess.run(["/usr/sbin/scutil", "--get", "ComputerName"], stdout=subprocess.PIPE, timeout=5).stdout.decode().strip() or "Mac"
    except Exception:  # noqa
        return "Mac"


def find_adb():
    for c in ADB_CANDIDATES:
        if os.path.exists(c):
            return c
    return None


def forward(adb):
    """Point a local port at the Car Thing's helper. Returns True if a Car Thing is there."""
    try:
        devs = subprocess.run([adb, "devices"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15).stdout.decode()
        if not any(l.strip().endswith("\tdevice") for l in devs.splitlines()[1:]):
            return False
        subprocess.run([adb, "forward", "tcp:%d" % LOCAL_PORT, "tcp:8737"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        return True
    except Exception as e:  # noqa
        log("adb:", e)
        return False


def http(path, body=None, timeout=2.5):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def main():
    if "--print" in sys.argv:
        players = read_players()
        print(json.dumps({"players": players, "showing": pick(players)}, indent=2))
        return 0
    adb = find_adb()
    if not adb:
        log("adb not found; install DeskThing or `brew install android-platform-tools`")
        return 1
    name = computer_name()
    log("started for", name)
    linked = False
    last_push = 0.0
    now = None
    while True:
        try:
            if not linked:
                linked = forward(adb)
                if not linked:
                    time.sleep(5)
                    continue
                log("linked to the Car Thing")
            t = time.time()
            if t - last_push >= 1.0:
                now = pick(read_players())
                state = dict(now, device=name) if now else {"title": "", "playing": False, "device": name, "idle": True}
                http("mac/state", state)
                last_push = t
            cmds = http("mac/take").get("cmds") or []
            for c in cmds:
                run_cmd(c, now)
            if cmds:
                last_push = 0  # report the result right away
                time.sleep(0.25)
            else:
                time.sleep(0.3)
        except Exception as e:  # noqa  (unplugged, helper restarting, etc.)
            if linked:
                log("lost the Car Thing:", str(e)[:120])
            linked = False
            time.sleep(3)


if __name__ == "__main__":
    sys.exit(main() or 0)
