#!/bin/bash
# Turn on Bluetooth for the home screen:
#   - btwake:   at every boot, power-cycles the Bluetooth chip and attaches it (the stock boot leaves it dead)
#   - bthelper: small Python service the Settings > Bluetooth and Music screens talk to
#   - bluetoothd: restarted with music remote control (AVRCP) turned on, via bt/bluetoothd.sh
# Both are added as supervisord programs. The original boot config is already backed up as
# /etc/supervisord.conf.orig, so restore.sh still undoes everything.
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/bluetooth-install-report.txt"
TARGET=/usr/share/carthing-home
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
[ -f "$DIR/home/bt/bthelper.py" ] || { echo "Missing $DIR/home/bt. Run build.sh first."; exit 1; }
"$ADB" start-server >/dev/null 2>&1
if ! "$ADB" devices -l | grep -q "spotify-car-thing"; then echo "Car Thing not found. Plug it in (no buttons held), wait for it to boot, and try again."; exit 1; fi
dev() { "$ADB" shell "$@"; }

cat > /tmp/carthing-bt.conf <<'EOF'

; ---- added by install-bluetooth.sh (Car Thing home screen) ----
[program:btwake]
command=/bin/sh /usr/share/carthing-home/bt/btwake.sh
priority=97
autostart=true
autorestart=true
startsecs=4
startretries=5
redirect_stderr=true
stdout_logfile=/var/log/btwake.log
stdout_logfile_maxbytes=100000
stdout_logfile_backups=1

[program:bthelper]
command=/usr/bin/python3 -u /usr/share/carthing-home/bt/bthelper.py
priority=99
autostart=true
autorestart=true
startsecs=2
redirect_stderr=true
stdout_logfile=/var/log/bthelper.log
stdout_logfile_maxbytes=200000
stdout_logfile_backups=1
EOF

{
echo "1/5 Making the system drive writable..."
dev 'mount -o remount,rw /'

echo "2/5 Checking the boot config backup..."
dev '[ -f /etc/supervisord.conf.orig ] || cp /etc/supervisord.conf /etc/supervisord.conf.orig; ls -la /etc/supervisord.conf*'

echo "3/5 Copying the home screen and Bluetooth helper..."
dev "rm -rf $TARGET"
"$ADB" push "$DIR/home" "$TARGET" >/dev/null
dev "chmod 755 $TARGET/bt/*.sh $TARGET/bt/*.py; ls -la $TARGET/bt"

echo "4/5 Adding Bluetooth to startup..."
# (old adbd doesn't pass exit codes back, so compare the printed count instead)
if [ "$(dev 'grep -c "program:btwake" /etc/supervisord.conf' | tr -dc '0-9')" != "0" ]; then
  echo "(already added)"
else
  "$ADB" push /tmp/carthing-bt.conf /tmp/carthing-bt.conf >/dev/null
  dev 'cat /tmp/carthing-bt.conf >> /etc/supervisord.conf && rm /tmp/carthing-bt.conf'
fi
if [ "$(dev 'grep -c "carthing-home/bt/bluetoothd.sh" /etc/supervisord.conf' | tr -dc '0-9')" = "0" ]; then
  echo "Turning on music remote control (AVRCP) for the Bluetooth service..."
  dev 'supervisorctl stop bluetoothd >/dev/null 2>&1; killall bluetoothd 2>/dev/null; sleep 1; killall -9 bluetoothd 2>/dev/null'
  dev "sed -i 's#^command=/etc/start_bluetoothd.sh#command=/bin/sh /usr/share/carthing-home/bt/bluetoothd.sh#' /etc/supervisord.conf"
fi
dev 'grep -n -E "^\[program|bluetoothd" /etc/supervisord.conf'
dev 'sync; mount -o remount,ro / 2>/dev/null || true'

echo "5/5 Starting Bluetooth (about 20 seconds)..."
dev 'supervisorctl reread; supervisorctl update; supervisorctl start bluetoothd 2>/dev/null; supervisorctl restart bthelper 2>/dev/null; supervisorctl restart chromium'
sleep 20
echo
echo "== services";   dev 'supervisorctl status'; sleep 5; dev 'supervisorctl status bluetoothd btwake bthelper'
echo "== radio";      dev 'hciconfig hci0 2>&1 | head -4'
echo "== helper";     dev 'wget -q -O - http://127.0.0.1:8737/api/status 2>&1 | head -c 600'; echo
echo "== music";      sleep 6; dev 'wget -q -O - http://127.0.0.1:8737/api/media 2>&1 | head -c 600'; echo
echo "== btwake log"; dev 'tail -8 /var/log/btwake.log 2>&1'
echo "== helper log"; dev 'tail -15 /var/log/bthelper.log 2>&1'
} 2>&1 | tee "$OUT"
rm -f /tmp/carthing-bt.conf
echo
echo "Done. Report saved to $OUT"
