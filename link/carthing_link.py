#!/usr/bin/env python3
"""Car Thing link: runs on the Mac and gives the Car Thing internet-backed music features.

The Car Thing has no internet (and its Python can't do HTTPS), so it reaches this service over
the USB cable: we keep `adb reverse tcp:8740 tcp:8740` set up, which makes 127.0.0.1:8740 on the
Car Thing land here.

  /status                      link + Spotify login state
  /spotify/login               (open on the Mac) log in to Spotify
  /callback                    Spotify OAuth redirect (http://127.0.0.1:8740/callback)
  /spotify/state               what's playing on your Spotify account (any device)
  /spotify/cmd?c=play|pause|next|prev|seek&ms=|volume&v=|shuffle&on=|repeat&mode=
  /art/lookup?title=&artist=&album=   cover art for any song (iTunes Search), as an /img URL
  /img?u=<https url>           image proxy (Spotify / Apple image hosts only)

Outbound HTTPS goes through /usr/bin/curl so it uses the Mac's own certificates.
Standard library only.
"""
import base64
import hashlib
import json
import os
import secrets
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, quote, urlencode, urlparse

PORT = int(os.environ.get("CTLINK_PORT", "8740"))
HOME = os.path.expanduser(os.environ.get("CTLINK_HOME", "~/Library/Application Support/carthing-link"))
CONFIG = os.path.join(HOME, "config.json")
TOKENS = os.path.join(HOME, "spotify-tokens.json")
ACCOUNTS = os.environ.get("CTLINK_SPOTIFY_ACCOUNTS", "https://accounts.spotify.com")
API = os.environ.get("CTLINK_SPOTIFY_API", "https://api.spotify.com/v1")
ITUNES = os.environ.get("CTLINK_ITUNES", "https://itunes.apple.com/search")
REDIRECT = "http://127.0.0.1:%d/callback" % PORT
SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing"
IMG_HOSTS = (".scdn.co", ".spotifycdn.com", ".mzstatic.com")
TEST_IMG = os.environ.get("CTLINK_TEST_IMG", "")  # tests only: extra allowed image URL prefix
ADB_CANDIDATES = ["/Applications/DeskThing.app/Contents/Resources/mac/adb", "/opt/homebrew/bin/adb", "/usr/local/bin/adb"]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def load(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:  # noqa
        return default


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def curl(method, url, headers=None, form=None, binary=False, timeout=8):
    """Returns (status, body). body is bytes if binary else text."""
    args = ["/usr/bin/curl", "-sS", "-X", method, "--max-time", str(timeout), "-w", "\n%{http_code}", url]
    if not os.path.exists(args[0]):
        args[0] = "curl"
    for k, v in (headers or {}).items():
        args += ["-H", "%s: %s" % (k, v)]
    if form is not None:
        args += ["--data", urlencode(form)]
    elif method in ("PUT", "POST"):
        args += ["-H", "Content-Length: 0"]
    try:
        p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout + 2)
    except Exception as e:  # noqa
        log("curl failed", url, e)
        return 0, b"" if binary else ""
    out = p.stdout
    nl = out.rfind(b"\n")
    code = int(out[nl + 1:] or 0) if nl >= 0 else 0
    body = out[:nl] if nl >= 0 else out
    return code, body if binary else body.decode("utf-8", "replace")


# ---------------------------------------------------------------- Spotify
class Spotify:
    def __init__(self):
        self.lock = threading.Lock()
        self.verifier = None
        self.state_token = None
        self.last = None
        self.last_at = 0.0

    def client_id(self):
        return load(CONFIG, {}).get("spotify_client_id", "").strip()

    def tokens(self):
        return load(TOKENS, {})

    def authorized(self):
        return bool(self.tokens().get("refresh_token"))

    def login_url(self):
        self.verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode()
        challenge = base64.urlsafe_b64encode(hashlib.sha256(self.verifier.encode()).digest()).rstrip(b"=").decode()
        self.state_token = secrets.token_urlsafe(16)
        return ACCOUNTS + "/authorize?" + urlencode({
            "client_id": self.client_id(), "response_type": "code", "redirect_uri": REDIRECT,
            "code_challenge_method": "S256", "code_challenge": challenge, "scope": SCOPES, "state": self.state_token})

    def finish_login(self, code, state):
        if not self.verifier or state != self.state_token:
            return False, "This login link expired. Start again from the Car Thing link page."
        status, body = curl("POST", ACCOUNTS + "/api/token", form={
            "grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT,
            "client_id": self.client_id(), "code_verifier": self.verifier})
        self.verifier = None
        if status != 200:
            return False, "Spotify said no (%s): %s" % (status, body[:200])
        t = json.loads(body)
        t["expires_at"] = time.time() + int(t.get("expires_in", 3600)) - 60
        save(TOKENS, t)
        log("spotify: logged in")
        return True, ""

    def access_token(self):
        with self.lock:
            t = self.tokens()
            if not t.get("refresh_token"):
                return None
            if t.get("access_token") and time.time() < t.get("expires_at", 0):
                return t["access_token"]
            status, body = curl("POST", ACCOUNTS + "/api/token", form={
                "grant_type": "refresh_token", "refresh_token": t["refresh_token"], "client_id": self.client_id()})
            if status != 200:
                log("spotify: refresh failed", status, body[:200])
                if status in (400, 401):
                    save(TOKENS, {})  # token revoked; needs a new login
                return None
            n = json.loads(body)
            t["access_token"] = n["access_token"]
            t["expires_at"] = time.time() + int(n.get("expires_in", 3600)) - 60
            if n.get("refresh_token"):
                t["refresh_token"] = n["refresh_token"]
            save(TOKENS, t)
            return t["access_token"]

    def call(self, method, path):
        tok = self.access_token()
        if not tok:
            return 401, ""
        return curl(method, API + path, headers={"Authorization": "Bearer " + tok})

    def state(self):
        now = time.time()
        if self.last is not None and now - self.last_at < 0.9:
            return self.last
        status, body = self.call("GET", "/me/player?additional_types=episode")
        if status == 401:
            s = {"ok": False, "reason": "login"}
        elif status == 204 or (status == 200 and not body.strip()):
            s = {"ok": True, "active": False}
        elif status == 200:
            s = self.normalize(json.loads(body))
        elif status == 429:
            s = self.last or {"ok": False, "reason": "busy"}
        else:
            s = {"ok": False, "reason": "error", "status": status}
        self.last, self.last_at = s, now
        return s

    @staticmethod
    def normalize(p):
        item = p.get("item") or {}
        if item.get("type") == "episode":
            images = item.get("images") or (item.get("show") or {}).get("images") or []
            artist = (item.get("show") or {}).get("name", "")
            album = (item.get("show") or {}).get("publisher", "")
        else:
            images = (item.get("album") or {}).get("images") or []
            artist = ", ".join(a.get("name", "") for a in item.get("artists") or [])
            album = (item.get("album") or {}).get("name", "")
        img = images[0]["url"] if images else ""
        dev = p.get("device") or {}
        return {
            "ok": True, "active": bool(item), "source": "spotify",
            "playing": bool(p.get("is_playing")), "title": item.get("name", ""), "artist": artist, "album": album,
            "art": ("/img?u=" + quote(img, safe="")) if img else "",
            "duration": item.get("duration_ms", 0), "position": p.get("progress_ms") or 0,
            "at": int(time.time() * 1000), "shuffle": bool(p.get("shuffle_state")),
            "repeat": p.get("repeat_state", "off"), "volume": dev.get("volume_percent"),
            "device": dev.get("name", ""), "device_type": dev.get("type", ""),
            "can_volume": dev.get("supports_volume", True) is not False,
        }

    def cmd(self, c, q):
        g = lambda k, d="": (q.get(k) or [d])[0]  # noqa
        routes = {
            "play": ("PUT", "/me/player/play"), "pause": ("PUT", "/me/player/pause"),
            "next": ("POST", "/me/player/next"), "prev": ("POST", "/me/player/previous"),
            "seek": ("PUT", "/me/player/seek?position_ms=%d" % max(0, int(float(g("ms", "0") or 0)))),
            "volume": ("PUT", "/me/player/volume?volume_percent=%d" % min(100, max(0, int(float(g("v", "50") or 50))))),
            "shuffle": ("PUT", "/me/player/shuffle?state=%s" % ("true" if g("on") == "1" else "false")),
            "repeat": ("PUT", "/me/player/repeat?state=%s" % (g("mode") if g("mode") in ("off", "context", "track") else "off")),
        }
        if c not in routes:
            return {"ok": False, "error": "unknown command"}
        status, body = self.call(*routes[c])
        self.last_at = 0  # refresh state on next poll
        if status in (200, 202, 204):
            return {"ok": True}
        reason = "login" if status == 401 else ("premium" if status == 403 else ("nodevice" if status == 404 else "error"))
        return {"ok": False, "reason": reason, "status": status, "detail": body[:200]}


SPOTIFY = Spotify()

# ---------------------------------------------------------------- art + images
ART_CACHE = {}
IMG_CACHE = {}
IMG_ORDER = []


def art_lookup(title, artist, album):
    key = (title.lower(), artist.lower(), album.lower())
    if key in ART_CACHE:
        return ART_CACHE[key]
    term = " ".join(x for x in (artist, album or title) if x)
    url = ""
    for t in (term, artist + " " + title):
        status, body = curl("GET", ITUNES + "?" + urlencode({"term": t, "media": "music", "entity": "song", "limit": 10}))
        if status != 200:
            continue
        try:
            results = json.loads(body).get("results", [])
        except Exception:  # noqa
            results = []
        def score(r):
            s = 0
            if r.get("trackName", "").lower() == title.lower(): s += 3
            if r.get("artistName", "").lower() == artist.lower(): s += 2
            if album and r.get("collectionName", "").lower() == album.lower(): s += 2
            return s
        results.sort(key=score, reverse=True)
        if results and results[0].get("artworkUrl100"):
            url = results[0]["artworkUrl100"].replace("100x100bb", "600x600bb")
            break
    res = {"ok": bool(url), "art": ("/img?u=" + quote(url, safe="")) if url else ""}
    ART_CACHE[key] = res
    return res


def get_image(u):
    host = urlparse(u).hostname or ""
    allowed = urlparse(u).scheme == "https" and host.endswith(IMG_HOSTS)
    if not allowed and not (TEST_IMG and u.startswith(TEST_IMG)):
        return None, None
    if u in IMG_CACHE:
        return IMG_CACHE[u]
    status, body = curl("GET", u, binary=True, timeout=10)
    if status != 200 or not body:
        return None, None
    ctype = "image/png" if body[:4] == b"\x89PNG" else "image/jpeg"
    IMG_CACHE[u] = (ctype, body)
    IMG_ORDER.append(u)
    while len(IMG_ORDER) > 40:
        IMG_CACHE.pop(IMG_ORDER.pop(0), None)
    return ctype, body


# ---------------------------------------------------------------- adb reverse keeper
def find_adb():
    for p in ADB_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


LINK = {"adb": None, "device": False, "reverse": False}


def keep_reverse():
    while True:
        adb = find_adb()
        LINK["adb"] = adb
        if adb:
            try:
                devs = subprocess.run([adb, "devices", "-l"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=8).stdout.decode()
                LINK["device"] = "spotify-car-thing" in devs or "superbird" in devs
                if LINK["device"]:
                    lst = subprocess.run([adb, "reverse", "--list"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=8).stdout.decode()
                    if "tcp:%d" % PORT not in lst:
                        subprocess.run([adb, "reverse", "tcp:%d" % PORT, "tcp:%d" % PORT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
                        log("adb reverse set up")
                    LINK["reverse"] = True
                else:
                    LINK["reverse"] = False
            except Exception as e:  # noqa
                log("adb check failed", e)
        time.sleep(5)


# ---------------------------------------------------------------- web
PAGE = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Car Thing link</title><style>body{font:17px -apple-system,Helvetica,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#222}
h1{font-size:26px}.ok{color:#1a7f37}.bad{color:#b42318}a.btn{display:inline-block;background:#1db954;color:#fff;padding:12px 20px;border-radius:99px;text-decoration:none;font-weight:600}
code{background:#f2f2f2;padding:2px 6px;border-radius:4px}</style><h1>Car Thing link</h1>%s"""


class Handler(BaseHTTPRequestHandler):
    def send(self, code, body, ctype="application/json", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body)
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store" if ctype.startswith(("application", "text")) else "max-age=86400")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        g = lambda k: (q.get(k) or [""])[0]  # noqa
        try:
            if u.path == "/status":
                return self.send(200, {"ok": True, "spotify": {"configured": bool(SPOTIFY.client_id()), "authorized": SPOTIFY.authorized()},
                                       "carthing": LINK["device"], "reverse": LINK["reverse"]})
            if u.path in ("/", "/spotify/login"):
                if not SPOTIFY.client_id():
                    return self.send(200, PAGE % "<p class=bad>No Spotify Client ID yet. Run <code>install-link.sh</code> again and paste it in.</p>", "text/html; charset=utf-8")
                if u.path == "/" and SPOTIFY.authorized():
                    return self.send(200, PAGE % "<p class=ok>✓ Connected to Spotify. You can close this tab.</p><p><a href='/spotify/login'>Log in again</a></p>", "text/html; charset=utf-8")
                return self.send(302, "", "text/plain", {"Location": SPOTIFY.login_url()})
            if u.path == "/callback":
                if g("error"):
                    return self.send(200, PAGE % ("<p class=bad>Spotify login was cancelled (%s).</p><p><a class=btn href='/spotify/login'>Try again</a></p>" % g("error")), "text/html; charset=utf-8")
                ok, err = SPOTIFY.finish_login(g("code"), g("state"))
                msg = "<p class=ok>✓ Connected to Spotify. You can close this tab — the Car Thing's Music app will pick it up.</p>" if ok else \
                    "<p class=bad>%s</p><p><a class=btn href='/spotify/login'>Try again</a></p>" % err
                return self.send(200, PAGE % msg, "text/html; charset=utf-8")
            if u.path == "/spotify/state":
                return self.send(200, SPOTIFY.state())
            if u.path == "/spotify/cmd":
                return self.send(200, SPOTIFY.cmd(g("c"), q))
            if u.path == "/art/lookup":
                return self.send(200, art_lookup(g("title"), g("artist"), g("album")))
            if u.path == "/img":
                ctype, body = get_image(g("u"))
                if not body:
                    return self.send(404, {"ok": False})
                return self.send(200, body, ctype)
            return self.send(404, {"ok": False})
        except Exception as e:  # noqa
            log("error", self.path, repr(e))
            return self.send(500, {"ok": False, "error": "internal"})

    def log_message(self, *a):
        pass


class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    threading.Thread(target=keep_reverse, daemon=True).start()
    log("Car Thing link on http://127.0.0.1:%d" % PORT)
    if "--login" in sys.argv:
        threading.Timer(1.0, lambda: webbrowser.open("http://127.0.0.1:%d/spotify/login" % PORT)).start()
    Server(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
