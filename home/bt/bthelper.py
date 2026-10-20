#!/usr/bin/env python3
"""Bluetooth helper for the Car Thing home screen.

Runs on the Car Thing (supervisord program "bthelper"). Keeps one bluetoothctl session open
as the pairing agent, and serves a tiny JSON API on 127.0.0.1 for the home screen:

  /api/status                 controller state, paired + nearby devices, pending prompt
  /api/scan?on=1|0            start / stop scanning
  /api/pair?mac=AA:BB:..      pair (then trust) a device
  /api/connect?mac=..         connect / disconnect / forget a device
  /api/disconnect?mac=..
  /api/forget?mac=..
  /api/answer?yes=1|0         answer a pairing prompt (passkey confirmation etc.)
  /api/media                  what's playing on the connected phone (AVRCP)
  /api/media/cmd?c=play|pause|toggle|next|prev|shuffle|repeat
  /api/favorites              the favourite contacts (names only) from favorites.json
  /api/call?i=N               call favourite N on the phone (hands-free dialing)
  /api/callstatus             idle | connecting | dialing | calling | error
  /api/screen?on=0|1          backlight off (sleep) / on (wake)

Only listens on localhost. Standard library only (the device has no python dbus module).
"""
import json
import os
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from media import Media  # noqa: E402
from calls import Caller, load_favorites  # noqa: E402
from screen import Screen  # noqa: E402

PORT = int(os.environ.get("BTHELPER_PORT", "8737"))
BTCTL = os.environ.get("BTCTL", "bluetoothctl")
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|[\x01\x02]")
MAC_RE = re.compile(r"^[0-9A-F]{2}(:[0-9A-F]{2}){5}$")
DEV_LINE = re.compile(r"Device ([0-9A-F]{2}(?::[0-9A-F]{2}){5})(?: (.*))?$")


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def run(args, timeout=5):
    """One-shot bluetoothctl command; returns cleaned output ('' on failure)."""
    try:
        p = subprocess.run([BTCTL] + args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           stdin=subprocess.DEVNULL, timeout=timeout)
        return ANSI.sub("", p.stdout.decode("utf-8", "replace"))
    except Exception as e:  # noqa
        log("run failed", args, e)
        return ""


def nameless(mac, name):
    return not name or name == mac.replace(":", "-")


class Bt:
    def __init__(self):
        self.lock = threading.RLock()
        self.proc = None
        self.prompt = None      # dict shown on screen until answered
        self.busy = None        # {'mac', 'action'}
        self.message = ""
        self.scanning = False
        self.last_mac = None    # most recent device mentioned by bluetoothctl
        self.names = {}         # mac -> name seen while scanning
        self.seen = {}          # mac -> last time seen while scanning
        self.controller = False
        self.cache = None
        self.cache_at = 0.0
        threading.Thread(target=self.watch, daemon=True).start()

    # ------------------------------------------------------------ agent session
    def start_session(self):
        with self.lock:
            if self.proc and self.proc.poll() is None:
                self.proc.kill()
            log("starting bluetoothctl session")
            self.proc = subprocess.Popen([BTCTL], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                         stderr=subprocess.STDOUT, bufsize=0)
            self.prompt = None
            self.scanning = False
        threading.Thread(target=self.reader, args=(self.proc,), daemon=True).start()
        for c in ("power on", "agent KeyboardDisplay", "default-agent", "pairable on", "discoverable on"):
            self.send(c)
            time.sleep(0.3)

    def send(self, line):
        with self.lock:
            p = self.proc
        if not p or p.poll() is not None:
            return False
        try:
            p.stdin.write((line + "\n").encode())
            p.stdin.flush()
            log(">", line)
            return True
        except Exception as e:  # noqa
            log("send failed", e)
            return False

    def reader(self, proc):
        buf = ""
        while True:
            try:
                chunk = os.read(proc.stdout.fileno(), 4096)
            except Exception:  # noqa
                chunk = b""
            if not chunk:
                break
            buf += ANSI.sub("", chunk.decode("utf-8", "replace"))
            parts = re.split(r"[\r\n]", buf)
            buf = parts.pop()
            for line in parts:
                self.handle(line.strip())
            # agent questions end with "(yes/no):" and no newline
            if "(yes/no)" in buf or "Enter PIN code" in buf or "Enter passkey" in buf:
                self.handle(buf.strip())
                buf = ""
        log("bluetoothctl session ended")
        with self.lock:
            self.scanning = False

    def handle(self, line):
        line = re.sub(r"^\[[^\]]*\]# ?", "", line).strip()  # drop "[bluetooth]# " prompt
        if not line:
            return
        log("<", line)
        m = DEV_LINE.search(line)
        with self.lock:
            if m:
                mac, rest = m.group(1), (m.group(2) or "")
                self.last_mac = mac
                if line.startswith("[NEW]"):
                    self.names[mac] = rest
                    self.seen[mac] = time.time()
                elif line.startswith("[DEL]"):
                    self.seen.pop(mac, None)
                elif line.startswith("[CHG]"):
                    if rest.startswith("Name: ") or rest.startswith("Alias: "):
                        self.names[mac] = rest.split(": ", 1)[1]
                    if rest.startswith("RSSI") or rest.startswith("Name") or rest.startswith("ManufacturerData"):
                        self.seen[mac] = time.time()
                self.cache_at = 0
            if "Discovering: yes" in line:
                self.scanning = True
            elif "Discovering: no" in line:
                self.scanning = False
            elif "No default controller available" in line:
                self.controller = False

            # ---- agent prompts
            pk = re.search(r"Confirm passkey (\d+)", line)
            if pk:
                self.prompt = {"kind": "confirm", "passkey": pk.group(1).zfill(6), "mac": self.target_mac()}
            elif "Accept pairing (yes/no)" in line:
                self.prompt = {"kind": "authorize", "mac": self.target_mac()}
            elif "Authorize service" in line:
                # an already-paired device asking to use a service: allow it
                threading.Thread(target=self.send, args=("yes",), daemon=True).start()
            elif re.search(r"Passkey: (\d+)", line) and "[agent]" in line:
                self.prompt = {"kind": "display", "passkey": re.search(r"Passkey: (\d+)", line).group(1).zfill(6),
                               "mac": self.target_mac()}
            elif "Enter PIN code" in line or "Enter passkey" in line:
                self.prompt = {"kind": "pin", "mac": self.target_mac()}
                threading.Thread(target=self.send, args=("0000",), daemon=True).start()

            # ---- results
            if "Pairing successful" in line:
                mac = (self.busy or {}).get("mac") or self.last_mac
                self.message = "Paired with " + self.label(mac)
                self.busy = None
                self.prompt = None
                if mac:
                    threading.Thread(target=self.send, args=("trust " + mac,), daemon=True).start()
            elif line.startswith("Failed to pair"):
                self.message = "Pairing didn't work. " + self.reason(line)
                self.busy = None
                self.prompt = None
            elif "Connection successful" in line:
                self.message = "Connected to " + self.label((self.busy or {}).get("mac") or self.last_mac)
                self.busy = None
            elif line.startswith("Failed to connect"):
                self.message = "Couldn't connect. " + self.reason(line)
                self.busy = None
            elif "Successful disconnected" in line or "Disconnection successful" in line:
                self.message = "Disconnected"
                self.busy = None
            elif "Device has been removed" in line:
                self.message = "Device forgotten"
                self.busy = None
            elif "Request canceled" in line or ("Paired: no" in line and self.prompt):
                self.prompt = None

    def target_mac(self):
        return (self.busy or {}).get("mac") or self.last_mac

    def label(self, mac):
        if not mac:
            return "device"
        n = self.names.get(mac)
        return mac if nameless(mac, n) else n

    @staticmethod
    def reason(line):
        if "AuthenticationFailed" in line or "AuthenticationRejected" in line:
            return "The code was rejected or cancelled."
        if "AuthenticationTimeout" in line or "Timeout" in line:
            return "It timed out. Try again."
        if "ConnectionAttemptFailed" in line or "Page Timeout" in line or "Host is down" in line:
            return "The device didn't answer. Keep its Bluetooth screen open and try again."
        if "AlreadyExists" in line:
            return "It's already paired."
        if "profile-unavailable" in line or "NotAvailable" in line:
            return "The phone didn't offer anything to connect to."
        return ""

    # ------------------------------------------------------------ controller watch
    def watch(self):
        while True:
            out = run(["show"], timeout=5)
            present = "Controller" in out and "No default controller" not in out
            with self.lock:
                was = self.controller
                self.controller = present
                alive = self.proc is not None and self.proc.poll() is None
            if present and (not was or not alive):
                self.start_session()
            time.sleep(3)

    # ------------------------------------------------------------ status
    def status(self):
        now = time.time()
        with self.lock:
            if self.cache and now - self.cache_at < 1.5:
                base = self.cache
            else:
                base = None
        if base is None:
            show = run(["show"])
            controller = "Controller" in show and "No default controller" not in show
            info = {}
            for line in show.splitlines():
                if ":" in line:
                    k, v = line.strip().split(":", 1)
                    info[k.strip()] = v.strip()
            paired = []
            known = {}
            if controller:
                for line in run(["paired-devices"]).splitlines():
                    m = DEV_LINE.search(line.strip())
                    if m:
                        mac = m.group(1)
                        d = run(["info", mac])
                        name = re.search(r"Alias: (.*)", d) or re.search(r"Name: (.*)", d)
                        paired.append({"mac": mac, "name": name.group(1).strip() if name else mac,
                                       "connected": "Connected: yes" in d})
                for line in run(["devices"]).splitlines():
                    m = DEV_LINE.search(line.strip())
                    if m:
                        known[m.group(1)] = (m.group(2) or "").strip()
            base = {"controller": controller, "powered": info.get("Powered") == "yes",
                    "discoverable": info.get("Discoverable") == "yes",
                    "name": info.get("Alias") or info.get("Name") or "Car Thing",
                    "address": (show.split("Controller ", 1)[1].split(" ")[0] if "Controller " in show else ""),
                    "paired": paired, "known": known}
            with self.lock:
                self.cache, self.cache_at = base, now
        with self.lock:
            paired_macs = set(d["mac"] for d in base["paired"])
            found = []
            for mac, t in sorted(self.seen.items(), key=lambda kv: -kv[1]):
                if mac in paired_macs or now - t > 90:
                    continue
                name = self.names.get(mac) or base["known"].get(mac, "")
                if nameless(mac, name):
                    continue
                found.append({"mac": mac, "name": name})
            return {"ok": True, "controller": base["controller"], "powered": base["powered"],
                    "discoverable": base["discoverable"], "name": base["name"], "address": base["address"],
                    "scanning": self.scanning, "prompt": self.with_name(self.prompt), "busy": self.busy,
                    "message": self.message, "paired": base["paired"], "found": found[:12]}

    def with_name(self, p):
        if not p:
            return None
        q = dict(p)
        q["name"] = self.label(p.get("mac"))
        return q

    # ------------------------------------------------------------ actions
    def act(self, action, q):
        mac = (q.get("mac") or [""])[0].upper()
        needs_mac = action in ("pair", "connect", "disconnect", "forget")
        if needs_mac and not MAC_RE.match(mac):
            return {"ok": False, "error": "bad mac"}
        with self.lock:
            self.cache_at = 0
            if action == "scan":
                on = (q.get("on") or ["1"])[0] == "1"
                if on:
                    self.seen = {}
                self.scanning = on
                self.message = ""
            elif action in ("pair", "connect", "disconnect", "forget"):
                self.busy = {"mac": mac, "action": action}
                self.message = ""
                self.last_mac = mac
            elif action == "answer":
                if not self.prompt:
                    return {"ok": False, "error": "no prompt"}
                yes = (q.get("yes") or ["0"])[0] == "1"
                kind = self.prompt.get("kind")
                self.prompt = None
                if kind == "display":
                    return {"ok": True}
                if not yes:
                    self.busy = None
                    self.message = "Pairing cancelled"
        if action == "scan":
            self.send("scan on" if on else "scan off")
        elif action == "pair":
            if self.scanning:
                self.send("scan off")
                time.sleep(0.3)
            self.send("pair " + mac)
        elif action == "connect":
            self.send("connect " + mac)
        elif action == "disconnect":
            self.send("disconnect " + mac)
        elif action == "forget":
            self.send("remove " + mac)
        elif action == "answer":
            self.send("yes" if yes else "no")
        else:
            return {"ok": False, "error": "unknown action"}
        return {"ok": True}


BT = None
MEDIA = None
CALLER = None
SCREEN = None


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/api/status":
            body = BT.status()
        elif u.path == "/api/media":
            body = MEDIA.state()
        elif u.path == "/api/media/cmd":
            body = MEDIA.cmd((q.get("c") or [""])[0])
        elif u.path == "/api/favorites":
            body = {"ok": True, "favorites": [{"name": f["name"]} for f in load_favorites()]}
        elif u.path == "/api/call":
            try:
                body = CALLER.call(int((q.get("i") or ["-1"])[0]))
            except ValueError:
                body = {"ok": False, "error": "bad index"}
        elif u.path == "/api/callstatus":
            body = dict(CALLER.status(), ok=True)
        elif u.path == "/api/screen":
            body = SCREEN.set((q.get("on") or ["1"])[0] == "1")
        elif u.path.startswith("/api/"):
            body = BT.act(u.path[5:], q)
        else:
            self.send_response(404)
            self.end_headers()
            return
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    global BT, MEDIA, CALLER, SCREEN
    BT = Bt()
    MEDIA = Media(log)
    CALLER = Caller(log)
    SCREEN = Screen(log)
    log("bthelper listening on 127.0.0.1:%d" % PORT)
    Server(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
