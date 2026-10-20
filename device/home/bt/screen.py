"""Screen sleep for the Car Thing: turn the backlight off and back on, for bthelper.py.

The stock "backlight" supervisord program (sp-als-backlight) sets brightness from the ambient light
sensor, so it is stopped while asleep (or it would turn the screen straight back on) and started
again on wake.
"""
import glob
import os
import subprocess
import threading

BL = "/sys/class/backlight"


def _write(path, value):
    try:
        with open(path, "w") as f:
            f.write(str(value))
        return True
    except Exception:  # noqa
        return False


def _read(path, default=None):
    try:
        with open(path) as f:
            return f.read().strip()
    except Exception:  # noqa
        return default


class Screen:
    def __init__(self, log=print):
        self.log = log
        self.lock = threading.Lock()
        self.asleep = False
        self.saved = {}

    def devices(self):
        return sorted(glob.glob(os.path.join(BL, "*")))

    def sleep(self):
        with self.lock:
            if self.asleep:
                return {"ok": True, "asleep": True}
            subprocess.run(["supervisorctl", "stop", "backlight"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
            for d in self.devices():
                self.saved[d] = _read(os.path.join(d, "brightness"))
                done = _write(os.path.join(d, "bl_power"), 4)  # 4 = FB_BLANK_POWERDOWN
                done = _write(os.path.join(d, "brightness"), 0) or done
                self.log("screen: off", d, "ok" if done else "failed")
            self.asleep = True
            return {"ok": True, "asleep": True, "devices": self.devices()}

    def wake(self):
        with self.lock:
            for d in self.devices():
                _write(os.path.join(d, "bl_power"), 0)
                level = self.saved.get(d)
                if not level or level == "0":
                    mx = _read(os.path.join(d, "max_brightness"), "255")
                    level = str(max(1, int(int(mx) * 0.6)))
                _write(os.path.join(d, "brightness"), level)
                self.log("screen: on", d, level)
            subprocess.run(["supervisorctl", "start", "backlight"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
            self.asleep = False
            return {"ok": True, "asleep": False}

    def set(self, on):
        return self.wake() if on else self.sleep()
