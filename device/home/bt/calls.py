"""Place calls on the paired iPhone through its hands-free service (HFP), for bthelper.py.

The Car Thing acts as a hands-free unit just long enough to tell the phone to dial:
  1. find the phone's Handsfree Audio Gateway RFCOMM channel (sdptool)
  2. connect and do the HFP service-level handshake (AT+BRSF, AT+CIND, AT+CMER)
  3. send ATD<number>;  and wait for the phone to report an outgoing call
  4. disconnect, so the call carries on on the phone itself (the Car Thing has no speaker)

Favourites come from favorites.json next to the home screen (a list of {"name", "number"}).
Only numbers from that file can be dialled.
"""
import json
import os
import re
import socket
import subprocess
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
FAV_PATHS = [os.path.join(HERE, "..", "favorites.json"), os.path.join(HERE, "favorites.json")]
HFP_AG = "0x111f"
HF_FEATURES = 0  # simplest hands-free unit: no codec negotiation, no audio features


def load_favorites():
    for p in FAV_PATHS:
        try:
            with open(p) as f:
                data = json.load(f)
            out = []
            for d in data:
                name = str(d.get("name", "")).strip()
                num = re.sub(r"[^0-9+*#]", "", str(d.get("number", "")))
                if name and num:
                    out.append({"name": name, "number": num})
            return out
        except Exception:  # noqa
            continue
    return []


class Line:
    """Reads CR/LF-separated AT responses from a socket."""

    def __init__(self, sock, log):
        self.sock, self.log, self.buf = sock, log, ""

    def send(self, cmd):
        self.log("hfp >", cmd)
        self.sock.sendall((cmd + "\r").encode())

    def read(self, timeout):
        end = time.time() + timeout
        while True:
            m = re.search(r"[\r\n]+", self.buf)
            if m and m.start() > 0:
                line, self.buf = self.buf[:m.start()], self.buf[m.end():]
                self.log("hfp <", line)
                return line
            if m:  # leading newlines
                self.buf = self.buf[m.end():]
                continue
            left = end - time.time()
            if left <= 0:
                return None
            self.sock.settimeout(left)
            try:
                chunk = self.sock.recv(512)
            except socket.timeout:
                return None
            if not chunk:
                return None
            self.buf += chunk.decode("utf-8", "replace")

    def command(self, cmd, timeout=6):
        """Send a command, collect lines until OK / ERROR. Returns (ok, lines)."""
        self.send(cmd)
        lines = []
        while True:
            line = self.read(timeout)
            if line is None:
                return False, lines
            if line == "OK":
                return True, lines
            if "ERROR" in line:
                return False, lines
            lines.append(line)


class Caller:
    def __init__(self, log=print, connect=None):
        self.log = log
        self.lock = threading.Lock()
        self.state = {"state": "idle", "name": "", "message": "", "at": 0}
        self.channel = {}
        self.connect = connect or self._connect  # injectable for tests

    # ------------------------------------------------------------ bluetooth plumbing
    def phone(self):
        try:
            out = subprocess.run(["bluetoothctl", "paired-devices"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5).stdout.decode()
        except Exception:  # noqa
            return None
        for mac in re.findall(r"([0-9A-F]{2}(?::[0-9A-F]{2}){5})", out):
            try:
                info = subprocess.run(["bluetoothctl", "info", mac], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5).stdout.decode()
            except Exception:  # noqa
                continue
            if "Connected: yes" in info and "0000111f" in info:
                return mac
        return None

    def find_channel(self, mac):
        if mac in self.channel:
            return self.channel[mac]
        try:
            out = subprocess.run(["sdptool", "search", "--bdaddr", mac, HFP_AG], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=15).stdout.decode()
        except Exception:  # noqa
            out = ""
        m = re.search(r"Handsfree Audio Gateway.*?Channel:\s*(\d+)", out, re.S) or re.search(r"Channel:\s*(\d+)", out)
        if not m:
            return None
        self.channel[mac] = int(m.group(1))
        return self.channel[mac]

    def _connect(self, mac, channel):
        s = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
        s.settimeout(10)
        s.connect((mac, channel))
        return s

    # ------------------------------------------------------------ calling
    def status(self):
        with self.lock:
            return dict(self.state)

    def set(self, **kw):
        with self.lock:
            self.state.update(kw)
            self.state["at"] = time.time()

    def call(self, index):
        favs = load_favorites()
        if not (0 <= index < len(favs)):
            return {"ok": False, "error": "no such favourite"}
        with self.lock:
            if self.state["state"] in ("connecting", "dialing"):
                return {"ok": False, "error": "busy"}
        fav = favs[index]
        self.set(state="connecting", name=fav["name"], message="")
        threading.Thread(target=self._dial, args=(fav,), daemon=True).start()
        return {"ok": True}

    def _dial(self, fav):
        mac = self.phone()
        if not mac:
            self.set(state="error", message="Your iPhone isn't connected. Check Settings › Bluetooth.")
            return
        ch = self.find_channel(mac)
        if not ch:
            self.set(state="error", message="Couldn't find your iPhone's calling service.")
            return
        sock = None
        try:
            sock = self.connect(mac, ch)
        except Exception as e:  # noqa
            self.channel.pop(mac, None)  # look it up again next time
            self.log("hfp connect failed", e)
            self.set(state="error", message="Your iPhone didn't accept the call request. Try again.")
            return
        try:
            io = Line(sock, self.log)
            ok, _ = io.command("AT+BRSF=%d" % HF_FEATURES)
            if not ok:
                raise RuntimeError("BRSF refused")
            ok, ind = io.command("AT+CIND=?")
            names = re.findall(r'\("([^"]+)"', " ".join(ind))
            io.command("AT+CIND?")
            ok, _ = io.command("AT+CMER=3,0,0,1")
            if not ok:
                raise RuntimeError("CMER refused")
            self.set(state="dialing")
            ok, _ = io.command("ATD%s;" % fav["number"], timeout=10)
            if not ok:
                raise RuntimeError("ATD refused")
            # wait for the phone to report the outgoing call (callsetup / call indicator)
            setup_idx = (names.index("callsetup") + 1) if "callsetup" in names else 0
            call_idx = (names.index("call") + 1) if "call" in names else 0
            end = time.time() + 6
            started = False
            while time.time() < end and not started:
                line = io.read(max(0.1, end - time.time()))
                if line is None:
                    break
                m = re.match(r"\+CIEV:\s*(\d+),(\d+)", line)
                if m and ((int(m.group(1)) == setup_idx and m.group(2) in ("2", "3")) or (int(m.group(1)) == call_idx and m.group(2) == "1")):
                    started = True
            self.set(state="calling", message="Calling on your iPhone")
        except Exception as e:  # noqa
            self.log("hfp dial failed", e)
            self.set(state="error", message="Your iPhone didn't place the call. Try again.")
        finally:
            # let go, so the call stays on the phone
            time.sleep(1.0)
            try:
                sock.close()
            except Exception:  # noqa
                pass
