#!/usr/bin/env python3
"""Runs ON THE CAR THING (pushed to /tmp by carthing-mic.sh). Serves the raw microphone stream to one client.

Listens on 127.0.0.1:8739 (the Mac reaches it with `adb forward`, so the Car Thing never connects out),
waits for one connection, then sends arecord's raw output (4 channels, 48 kHz, S32_LE) until the
client disconnects. Exits after that; the Mac job starts it again. Standard library only.
"""
import socket
import subprocess
import sys

PORT = 8739
CMD = ["arecord", "-q", "-D", "hw:0,0", "-c", "4", "-f", "S32_LE", "-r", "48000", "-t", "raw"]

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", PORT))
srv.listen(1)
srv.settimeout(30)
try:
    conn, _ = srv.accept()
except socket.timeout:
    sys.exit("ctmic: no client connected")
srv.close()

rec = subprocess.Popen(CMD, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
try:
    while True:
        chunk = rec.stdout.read(16384)
        if not chunk:
            err = rec.stderr.read().decode("utf-8", "replace").strip()
            sys.exit("ctmic: arecord stopped" + (": " + err if err else ""))
        conn.sendall(chunk)
except (BrokenPipeError, ConnectionResetError):
    pass  # the Mac disconnected
finally:
    rec.kill()
    conn.close()
