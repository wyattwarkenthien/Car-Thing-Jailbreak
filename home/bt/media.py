"""Now-playing from a paired phone over Bluetooth (AVRCP), for bthelper.py.

BlueZ exposes the phone's player as org.bluez.MediaPlayer1 once the AVRCP channel is open.
The device's Python has no D-Bus module, so we talk to BlueZ with the `gdbus` command and
parse its GVariant text output.
"""
import re
import subprocess
import threading
import time

AVRCP_TARGET = "0000110c-0000-1000-8000-00805f9b34fb"
GDBUS = "gdbus"


def gdbus(args, timeout=6):
    try:
        p = subprocess.run([GDBUS] + args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           stdin=subprocess.DEVNULL, timeout=timeout)
        return p.returncode, p.stdout.decode("utf-8", "replace")
    except Exception as e:  # noqa
        return 1, str(e)


def call(path, method, *args, timeout=6):
    return gdbus(["call", "--system", "--dest", "org.bluez", "--object-path", path, "--method", method] + list(args), timeout)


# ---------------------------------------------------------------- GVariant text parser (subset)
class GV:
    def __init__(self, s):
        self.s, self.i = s, 0

    def ws(self):
        while self.i < len(self.s) and self.s[self.i] in " \t\n,":
            self.i += 1

    def value(self):
        self.ws()
        s, i = self.s, self.i
        if i >= len(s):
            return None
        c = s[i]
        if c == "@":  # type annotation like @a{sv}
            while self.i < len(s) and s[self.i] != " ":
                self.i += 1
            return self.value()
        if c == "(":
            return tuple(self.seq(")"))
        if c == "[":
            return self.seq("]")
        if c == "{":
            self.i += 1
            d = {}
            while True:
                self.ws()
                if self.s[self.i] == "}":
                    self.i += 1
                    return d
                k = self.value()
                self.ws()
                if self.s[self.i] == ":":
                    self.i += 1
                d[k] = self.value()
        if c == "<":
            self.i += 1
            v = self.value()
            self.ws()
            if self.i < len(s) and s[self.i] == ">":
                self.i += 1
            return v
        if c in "'\"":
            return self.string()
        m = re.compile(r"(?:(?:uint|int)(?:16|32|64)|byte|double|objectpath|boolean) ").match(s, i)
        if m:
            self.i = m.end()
            return self.value()
        m = re.compile(r"true|false|-?\d+(?:\.\d+)?(?:e-?\d+)?").match(s, i)
        if m:
            self.i = m.end()
            t = m.group(0)
            return True if t == "true" else False if t == "false" else (float(t) if "." in t or "e" in t else int(t))
        # unknown token: skip to the next separator
        while self.i < len(s) and s[self.i] not in ",)}]>":
            self.i += 1
        return None

    def seq(self, end):
        self.i += 1
        out = []
        while True:
            self.ws()
            if self.i >= len(self.s) or self.s[self.i] == end:
                self.i += 1
                return out
            out.append(self.value())

    def string(self):
        q = self.s[self.i]
        self.i += 1
        out = []
        while self.i < len(self.s):
            c = self.s[self.i]
            if c == "\\" and self.i + 1 < len(self.s):
                nxt = self.s[self.i + 1]
                out.append({"n": "\n", "t": "\t"}.get(nxt, nxt))
                self.i += 2
                continue
            if c == q:
                self.i += 1
                break
            out.append(c)
            self.i += 1
        return "".join(out)


def parse(text):
    try:
        return GV(text.strip()).value()
    except Exception:  # noqa
        return None


# ---------------------------------------------------------------- media
class Media:
    def __init__(self, log=print):
        self.log = log
        self.lock = threading.Lock()
        self.cache = None
        self.cache_at = 0.0
        self.last_kick = {}
        threading.Thread(target=self.keeper, daemon=True).start()

    def devices(self):
        """Paired, connected devices as (mac, path)."""
        code, out = gdbus(["introspect", "--system", "--dest", "org.bluez", "--object-path", "/org/bluez/hci0"], 6)
        res = []
        for m in re.finditer(r"node (dev_([0-9A-F_]{17}))", out):
            path = "/org/bluez/hci0/" + m.group(1)
            code, props = call(path, "org.freedesktop.DBus.Properties.GetAll", "org.bluez.Device1")
            d = parse(props)
            d = d[0] if isinstance(d, tuple) and d else {}
            if isinstance(d, dict) and d.get("Connected") and d.get("Paired"):
                res.append((m.group(2).replace("_", ":"), path, d.get("Alias") or d.get("Name") or ""))
        return res

    def player(self, dev_path):
        code, out = gdbus(["introspect", "--system", "--dest", "org.bluez", "--object-path", dev_path], 6)
        m = re.search(r"node (player\d+)", out)
        return dev_path + "/" + m.group(1) if m else None

    def kick(self, dev_path):
        """Open the AVRCP channel to a connected phone (BlueZ doesn't do it on its own)."""
        now = time.time()
        if now - self.last_kick.get(dev_path, 0) < 15:
            return
        self.last_kick[dev_path] = now
        code, out = call(dev_path, "org.bluez.Device1.ConnectProfile", AVRCP_TARGET, timeout=12)
        self.log("media: open AVRCP", dev_path, out.strip()[:120])

    def keeper(self):
        while True:
            try:
                for mac, path, name in self.devices():
                    if not self.player(path):
                        self.kick(path)
            except Exception as e:  # noqa
                self.log("media keeper", e)
            time.sleep(5)

    def state(self):
        now = time.time()
        with self.lock:
            if self.cache and now - self.cache_at < 0.8:
                return self.cache
        res = {"ok": True, "connected": False}
        for mac, path, name in self.devices():
            res.update({"connected": True, "phone": name, "mac": mac})
            p = self.player(path)
            if not p:
                res["player"] = False
                continue
            code, out = call(p, "org.freedesktop.DBus.Properties.GetAll", "org.bluez.MediaPlayer1")
            d = parse(out)
            d = d[0] if isinstance(d, tuple) and d else {}
            if not isinstance(d, dict):
                continue
            t = d.get("Track") or {}
            status = d.get("Status") or "stopped"
            res.update({
                "player": True, "source": "bluetooth", "path": p,
                "title": t.get("Title", ""), "artist": t.get("Artist", ""), "album": t.get("Album", ""),
                "duration": int(t.get("Duration") or 0), "position": int(d.get("Position") or 0),
                "at": int(time.time() * 1000), "playing": status == "playing", "status": status,
                "shuffle": (d.get("Shuffle") or "off") != "off", "repeat": d.get("Repeat") or "off",
                "track": t.get("TrackNumber"), "tracks": t.get("NumberOfTracks"),
                "active": bool(t.get("Title")),
            })
            break
        with self.lock:
            self.cache, self.cache_at = res, now
        return res

    def cmd(self, c):
        s = self.state()
        p = s.get("path")
        if not p:
            return {"ok": False, "reason": "noplayer"}
        methods = {"play": "Play", "pause": "Pause", "next": "Next", "prev": "Previous", "stop": "Stop"}
        if c == "toggle":
            c = "pause" if s.get("playing") else "play"
        if c in methods:
            code, out = call(p, "org.bluez.MediaPlayer1." + methods[c])
        elif c in ("shuffle", "repeat"):
            if c == "shuffle":
                val = "off" if s.get("shuffle") else "alltracks"
                prop = "Shuffle"
            else:
                order = ["off", "alltracks", "singletrack"]
                cur = s.get("repeat") if s.get("repeat") in order else "off"
                val = order[(order.index(cur) + 1) % len(order)]
                prop = "Repeat"
            code, out = call(p, "org.freedesktop.DBus.Properties.Set", "org.bluez.MediaPlayer1", prop, "<'%s'>" % val)
        else:
            return {"ok": False, "reason": "unknown"}
        with self.lock:
            self.cache_at = 0
        ok = code == 0
        if not ok:
            self.log("media cmd failed", c, out.strip()[:160])
        return {"ok": ok, "reason": "" if ok else "phone said no"}
