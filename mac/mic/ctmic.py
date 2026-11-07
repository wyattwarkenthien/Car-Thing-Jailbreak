#!/usr/bin/env python3
"""Runs ON THE CAR THING as the supervisord service "ctmic" (installed by mac/mic/install-mic.sh).

Serves the raw microphone stream to the Mac. Listens on 127.0.0.1:8739 (the Mac reaches it with
`adb forward`, so the Car Thing never connects out), and for each connection runs arecord in the mic's
native format (4 channels, 48 kHz, S32_LE) and sends its output until the Mac disconnects. The mic is
only open while a Mac is connected. Standard library only.
"""
import socket
import subprocess
import time

PORT = 8739
CMD = ["arecord", "-q", "-D", "hw:0,0", "-c", "4", "-f", "S32_LE", "-r", "48000", "-t", "raw"]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def serve(conn):
    subprocess.call(["killall", "arecord"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rec = subprocess.Popen(CMD, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    sent = 0
    try:
        while True:
            chunk = rec.stdout.read(16384)
            if not chunk:
                err = rec.stderr.read().decode("utf-8", "replace").strip()
                log("arecord stopped" + (": " + err if err else ""))
                return
            conn.sendall(chunk)
            sent += len(chunk)
    except (BrokenPipeError, ConnectionResetError, OSError):
        pass  # the Mac disconnected
    finally:
        rec.kill()
        rec.wait()
        conn.close()
        log("client gone after %.1f s of audio" % (sent / (48000 * 16)))


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", PORT))
    srv.listen(1)
    log("listening on", PORT)
    while True:
        conn, _ = srv.accept()
        log("Mac connected, streaming mic")
        serve(conn)


if __name__ == "__main__":
    main()
