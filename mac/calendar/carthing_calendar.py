#!/usr/bin/env python3
"""Sync your calendar to the Car Thing's home screen.

Runs on the Mac (every 5 minutes via a LaunchAgent, see install-calendar.sh):
  1. downloads your published calendar (.ics link, e.g. Outlook "Publish a calendar")
  2. works out the events in the next 7 days, including recurring meetings
  3. copies them to the Car Thing over USB with `adb push` (to /var/carthing/calendar.json)

Your calendar link lives in ~/Library/Application Support/carthing-calendar/config.json.
Standard library only; works with the Python 3.9 that ships with Apple's Command Line Tools.

  python3 carthing_calendar.py            # sync once
  python3 carthing_calendar.py --print    # show what would be sent, don't push
  python3 carthing_calendar.py --file x.ics --print   # test with a local file
"""
import calendar as cal
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import time

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

APP = os.path.expanduser(os.environ.get("CTCAL_HOME", "~/Library/Application Support/carthing-calendar"))
CONFIG = os.path.join(APP, "config.json")
DEVICE_PATH = "/var/carthing/calendar.json"
DAYS_AHEAD = 7
MAX_EVENTS = 40
ADB_CANDIDATES = ["/Applications/DeskThing.app/Contents/Resources/mac/adb", "/opt/homebrew/bin/adb", "/usr/local/bin/adb"]

# Outlook / Exchange use Windows time zone names
WINDOWS_TZ = {
    "Central Standard Time": "America/Chicago", "Eastern Standard Time": "America/New_York",
    "Mountain Standard Time": "America/Denver", "US Mountain Standard Time": "America/Phoenix",
    "Pacific Standard Time": "America/Los_Angeles", "Alaskan Standard Time": "America/Anchorage",
    "Hawaiian Standard Time": "Pacific/Honolulu", "Atlantic Standard Time": "America/Halifax",
    "Canada Central Standard Time": "America/Regina", "Central America Standard Time": "America/Guatemala",
    "Newfoundland Standard Time": "America/St_Johns", "GMT Standard Time": "Europe/London",
    "Greenwich Standard Time": "Atlantic/Reykjavik", "W. Europe Standard Time": "Europe/Berlin",
    "Romance Standard Time": "Europe/Paris", "Central Europe Standard Time": "Europe/Budapest",
    "Central European Standard Time": "Europe/Warsaw", "E. Europe Standard Time": "Europe/Chisinau",
    "FLE Standard Time": "Europe/Kiev", "GTB Standard Time": "Europe/Bucharest",
    "Russian Standard Time": "Europe/Moscow", "India Standard Time": "Asia/Kolkata",
    "China Standard Time": "Asia/Shanghai", "Tokyo Standard Time": "Asia/Tokyo",
    "Korea Standard Time": "Asia/Seoul", "Singapore Standard Time": "Asia/Singapore",
    "AUS Eastern Standard Time": "Australia/Sydney", "E. Australia Standard Time": "Australia/Brisbane",
    "New Zealand Standard Time": "Pacific/Auckland", "UTC": "UTC", "Coordinated Universal Time": "UTC",
}
WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def log(*a):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def local_tz_name():
    for k in ("CTCAL_TZ", "TZ"):
        v = os.environ.get(k, "").lstrip(":")
        if v and "/" in v:
            return v
    try:
        p = os.path.realpath("/etc/localtime")
        if "zoneinfo/" in p:
            return p.split("zoneinfo/", 1)[1]
    except Exception:  # noqa
        pass
    return "UTC"


def zone(name):
    if not name or ZoneInfo is None:
        return None
    name = name.strip().strip('"')
    for cand in (WINDOWS_TZ.get(name), name):
        if not cand:
            continue
        try:
            return ZoneInfo(cand)
        except Exception:  # noqa
            continue
    return None


# ---------------------------------------------------------------- ICS parsing
def unfold(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    out = []
    for line in text.split("\n"):
        if line[:1] in (" ", "\t") and out:
            out[-1] += line[1:]
        else:
            out.append(line)
    return out


def parse_line(line):
    # NAME;PARAM=VAL;PARAM="V:AL":VALUE   (colons can appear inside quoted params)
    i, q = 0, False
    while i < len(line):
        c = line[i]
        if c == '"':
            q = not q
        elif c == ":" and not q:
            break
        i += 1
    head, value = line[:i], line[i + 1:]
    parts = re.findall(r'(?:[^;"]|"[^"]*")+', head)
    name = parts[0].upper() if parts else ""
    params = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.upper()] = v.strip('"')
    return name, params, value


def unescape(s):
    return re.sub(r"\\([nN,;\\])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), s)


def parse_ics(text):
    events, cur, depth = [], None, []
    for line in unfold(text):
        if not line.strip():
            continue
        name, params, value = parse_line(line)
        if name == "BEGIN":
            depth.append(value.upper())
            if value.upper() == "VEVENT":
                cur = {"EXDATE": []}
            continue
        if name == "END":
            if depth:
                depth.pop()
            if value.upper() == "VEVENT" and cur is not None:
                events.append(cur)
                cur = None
            continue
        if cur is None or (depth and depth[-1] != "VEVENT"):
            continue  # skip VALARM etc. inside events, and anything outside events
        if name == "EXDATE":
            cur["EXDATE"].append((params, value))
        else:
            cur[name] = (params, value)
    return events


def parse_dt(params, value, default_tz):
    """-> (aware datetime, is_all_day). All-day values become midnight in default_tz."""
    value = value.strip()
    if params.get("VALUE", "").upper() == "DATE" or re.match(r"^\d{8}$", value):
        d = dt.datetime.strptime(value[:8], "%Y%m%d")
        return d.replace(tzinfo=default_tz), True
    utc = value.endswith("Z")
    d = dt.datetime.strptime(value.rstrip("Z")[:15], "%Y%m%dT%H%M%S")
    if utc:
        return d.replace(tzinfo=dt.timezone.utc), False
    tz = zone(params.get("TZID")) or default_tz
    return d.replace(tzinfo=tz), False


def parse_duration(s):
    m = re.match(r"^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$", s.strip())
    if not m:
        return dt.timedelta(0)
    sign = -1 if m.group(1) == "-" else 1
    w, d, h, mi, se = [int(x or 0) for x in m.groups()[1:]]
    return sign * dt.timedelta(weeks=w, days=d, hours=h, minutes=mi, seconds=se)


# ---------------------------------------------------------------- recurrence
def parse_rrule(s):
    r = {}
    for part in s.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            r[k.upper()] = v
    return r


def month_days(year, month, rule, start):
    """Days of the month an occurrence falls on, for MONTHLY / YEARLY rules."""
    last = cal.monthrange(year, month)[1]
    if "BYMONTHDAY" in rule:
        days = []
        for x in rule["BYMONTHDAY"].split(","):
            n = int(x)
            d = n if n > 0 else last + n + 1
            if 1 <= d <= last:
                days.append(d)
        return sorted(set(days))
    if "BYDAY" in rule:
        days = []
        for tok in rule["BYDAY"].split(","):
            m = re.match(r"^([+-]?\d+)?([A-Z]{2})$", tok)
            if not m:
                continue
            wd = WEEKDAYS[m.group(2)]
            matches = [d for d in range(1, last + 1) if dt.date(year, month, d).weekday() == wd]
            if m.group(1):
                n = int(m.group(1))
                if -len(matches) <= n <= len(matches) and n != 0:
                    days.append(matches[n - 1] if n > 0 else matches[n])
            else:
                days.extend(matches)
        days = sorted(set(days))
        if "BYSETPOS" in rule and days:
            pick = []
            for x in rule["BYSETPOS"].split(","):
                n = int(x)
                if -len(days) <= n <= len(days) and n != 0:
                    pick.append(days[n - 1] if n > 0 else days[n])
            days = sorted(set(pick))
        return days
    return [start.day] if start.day <= last else []


def occurrences(start, rule, window_end):
    """Yield occurrence starts (aware datetimes, same wall-clock time as start) up to window_end."""
    freq = rule.get("FREQ", "").upper()
    interval = max(1, int(rule.get("INTERVAL", "1") or 1))
    count = int(rule["COUNT"]) if "COUNT" in rule else None
    until = None
    if "UNTIL" in rule:
        u, _ = parse_dt({}, rule["UNTIL"], start.tzinfo)
        until = u
    tz = start.tzinfo
    wall = start.replace(tzinfo=None)
    n = 0

    def emit(d):
        aware = d.replace(tzinfo=tz)
        return aware

    def done(aware):
        return (until is not None and aware > until) or aware > window_end

    guard = 0
    if freq == "DAILY":
        k = 0
        while True:
            d = wall + dt.timedelta(days=k * interval)
            a = emit(d)
            if done(a):
                return
            n += 1
            yield a
            if count and n >= count:
                return
            k += 1
    elif freq == "WEEKLY":
        wkst = WEEKDAYS.get(rule.get("WKST", "MO").upper(), 0)
        days = sorted(WEEKDAYS[x[-2:]] for x in rule.get("BYDAY", "").split(",") if x[-2:] in WEEKDAYS) or [wall.weekday()]
        week0 = (wall - dt.timedelta(days=(wall.weekday() - wkst) % 7)).replace(hour=0, minute=0, second=0, microsecond=0)
        p = 0
        while guard < 20000:
            guard += 1
            base = week0 + dt.timedelta(weeks=p * interval)
            for wd in sorted(days, key=lambda x: (x - wkst) % 7):
                d = base + dt.timedelta(days=(wd - wkst) % 7)
                d = d.replace(hour=wall.hour, minute=wall.minute, second=wall.second)
                if d < wall:
                    continue
                a = emit(d)
                if done(a):
                    return
                n += 1
                yield a
                if count and n >= count:
                    return
            p += 1
    elif freq in ("MONTHLY", "YEARLY"):
        months = [int(x) for x in rule.get("BYMONTH", "").split(",") if x] or None
        p = 0
        while guard < 5000:
            guard += 1
            if freq == "MONTHLY":
                total = wall.year * 12 + (wall.month - 1) + p * interval
                periods = [(total // 12, total % 12 + 1)]
            else:
                y = wall.year + p * interval
                periods = [(y, m) for m in (months or [wall.month])]
            for (y, m) in periods:
                for day in month_days(y, m, rule, wall):
                    d = dt.datetime(y, m, day, wall.hour, wall.minute, wall.second)
                    if d < wall:
                        continue
                    a = emit(d)
                    if done(a):
                        return
                    n += 1
                    yield a
                    if count and n >= count:
                        return
            p += 1
    else:
        yield start


# ---------------------------------------------------------------- build the list
def build(events_raw, now, local):
    window_start = now - dt.timedelta(hours=12)
    window_end = now + dt.timedelta(days=DAYS_AHEAD)
    overrides = {}  # (uid, original start utc) -> True
    singles = []
    for ev in events_raw:
        if "RECURRENCE-ID" in ev:
            p, v = ev["RECURRENCE-ID"]
            rid, _ = parse_dt(p, v, local)
            overrides[(ev.get("UID", ({}, ""))[1], rid.astimezone(dt.timezone.utc))] = True
    out = []
    for ev in events_raw:
        if "DTSTART" not in ev:
            continue
        status = ev.get("STATUS", ({}, ""))[1].upper()
        if status == "CANCELLED":
            continue
        title = unescape(ev.get("SUMMARY", ({}, ""))[1]).strip() or "(No title)"
        location = unescape(ev.get("LOCATION", ({}, ""))[1]).strip()
        p, v = ev["DTSTART"]
        start, all_day = parse_dt(p, v, local)
        if "DTEND" in ev:
            end, _ = parse_dt(ev["DTEND"][0], ev["DTEND"][1], local)
        elif "DURATION" in ev:
            end = start + parse_duration(ev["DURATION"][1])
        else:
            end = start + (dt.timedelta(days=1) if all_day else dt.timedelta(0))
        length = end - start
        uid = ev.get("UID", ({}, ""))[1]
        if "RRULE" in ev and "RECURRENCE-ID" not in ev:
            exdates = set()
            for (ep, evv) in ev["EXDATE"]:
                for one in evv.split(","):
                    if one.strip():
                        x, _ = parse_dt(ep, one, start.tzinfo or local)
                        exdates.add(x.astimezone(dt.timezone.utc))
            starts = occurrences(start, parse_rrule(ev["RRULE"][1]), window_end)
        else:
            exdates = set()
            starts = [start]
        for s in starts:
            su = s.astimezone(dt.timezone.utc)
            if su in exdates:
                continue
            if "RECURRENCE-ID" not in ev and (uid, su) in overrides:
                continue  # this occurrence was moved/edited; the override event is listed on its own
            e = s + length
            if e <= window_start or s >= window_end:
                continue
            item = {"title": title, "start": int(su.timestamp() * 1000), "end": int(e.astimezone(dt.timezone.utc).timestamp() * 1000), "allDay": all_day}
            if all_day:
                item["date"] = s.strftime("%Y-%m-%d")
                item["endDate"] = (e - dt.timedelta(seconds=1)).strftime("%Y-%m-%d")
            if location:
                item["location"] = location[:80]
            out.append(item)
    out.sort(key=lambda x: (x["start"], not x["allDay"], x["title"]))
    # drop exact duplicates (same title + start), which some calendars publish
    seen, uniq = set(), []
    for x in out:
        k = (x["title"], x["start"])
        if k not in seen:
            seen.add(k)
            uniq.append(x)
    return uniq[:MAX_EVENTS]


# ---------------------------------------------------------------- fetch + push
def fetch(url):
    url = re.sub(r"^webcals?://", "https://", url.strip())
    curl = "/usr/bin/curl" if os.path.exists("/usr/bin/curl") else "curl"
    p = subprocess.run([curl, "-sSL", "--max-time", "30", "-A", "CarThingCalendar/1.0", "-w", "\n%{http_code}", url],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=40)
    body = p.stdout
    nl = body.rfind(b"\n")
    code = body[nl + 1:].decode().strip() if nl >= 0 else "0"
    text = body[:nl].decode("utf-8", "replace") if nl >= 0 else ""
    if code != "200" or "BEGIN:VCALENDAR" not in text:
        raise RuntimeError("couldn't download the calendar (HTTP %s). %s" % (code, p.stderr.decode()[:200]))
    return text


def find_adb():
    for c in ADB_CANDIDATES:
        if os.path.exists(c):
            return c
    return None


def push(data):
    adb = find_adb()
    if not adb:
        log("adb not found; install DeskThing or `brew install android-platform-tools`")
        return False
    devs = subprocess.run([adb, "devices", "-l"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15).stdout.decode()
    if "spotify-car-thing" not in devs and "superbird" not in devs:
        log("Car Thing not connected; will try again next time")
        return False
    fd, tmp = tempfile.mkstemp(suffix=".json")
    with os.fdopen(fd, "w") as f:
        json.dump(data, f)
    try:
        subprocess.run([adb, "shell", "mkdir -p /var/carthing"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        r = subprocess.run([adb, "push", tmp, DEVICE_PATH + ".new"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
        subprocess.run([adb, "shell", "mv %s.new %s" % (DEVICE_PATH, DEVICE_PATH)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        ok = r.returncode == 0
        log("pushed %d events to the Car Thing" % len(data["events"]) if ok else "push failed: " + r.stdout.decode()[:200])
        return ok
    finally:
        os.unlink(tmp)


def main():
    args = sys.argv[1:]
    local_name = local_tz_name()
    local = zone(local_name) or dt.timezone.utc
    if "--file" in args:
        text = open(args[args.index("--file") + 1], encoding="utf-8", errors="replace").read()
    else:
        try:
            cfg = json.load(open(CONFIG))
        except Exception:  # noqa
            log("no calendar link set up yet; run install-calendar.sh")
            return 1
        try:
            text = fetch(cfg["ics_url"])
        except Exception as e:  # noqa
            log("calendar download failed:", e)
            return 1
    now = dt.datetime.now(dt.timezone.utc)
    if "--now" in args:  # testing
        now = dt.datetime.fromisoformat(args[args.index("--now") + 1])
    events = build(parse_ics(text), now, local)
    data = {"updated": int(now.timestamp() * 1000), "tz": local_name, "events": events}
    if "--print" in args:
        print(json.dumps(data, indent=1))
        return 0
    return 0 if push(data) else 1


if __name__ == "__main__":
    sys.exit(main())
