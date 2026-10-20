#!/bin/bash
# READ-ONLY look at the Car Thing's Bluetooth support. Changes nothing on the device.
OUT="$(cd "$(dirname "$0")" && pwd)/bluetooth-report.txt"
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
"$ADB" start-server >/dev/null 2>&1
if ! "$ADB" devices -l | grep -q "spotify-car-thing"; then echo "Car Thing not found. Plug it in (no buttons held), wait for it to boot, and try again."; exit 1; fi
# each command is killed on the device after a few seconds so nothing can hang
S() { echo; echo "== $1"; "$ADB" shell "( $1 ) 2>&1 & p=\$!; ( sleep ${2:-4}; kill \$p 2>/dev/null ) & wait \$p 2>/dev/null" | head -80; }
echo "Checking Bluetooth on the Car Thing (about 30 seconds)..."
{
  S 'uname -a; cat /etc/os-release'
  S 'for b in bluetoothd bluetoothctl btmgmt hciconfig hcitool hciattach btattach dbus-daemon dbus-send busctl gdbus python3 python node lua sqlite3 socat nc busybox; do printf "%-14s " $b; command -v $b || echo -; done'
  S 'ls /usr/libexec/bluetooth /usr/lib/bluetooth /etc/bluetooth /var/lib/bluetooth 2>&1'
  S 'ls /sys/class/bluetooth; ls /dev | grep -i -E "tty(S|AML)|hci|rfkill"'
  S 'cat /sys/class/rfkill/*/type /sys/class/rfkill/*/state 2>&1'
  S 'hciconfig -a' 4
  S 'ps w | grep -i -E "blue|dbus|bt|hci" | grep -v grep'
  S 'dmesg | grep -i -E "bluetooth|hci|bcm|brcm|bt_" | tail -40'
  S 'ls /lib/firmware /lib/firmware/brcm 2>&1 | head -40'
  S 'grep -n -E "^\[program|command=" /etc/supervisord.conf'
  S 'ls /etc/init.d'
  S 'cat /etc/bluetooth/main.conf 2>/dev/null | grep -v "^#" | grep -v "^$" | head -40'
  S 'bluetoothctl show' 5
  S 'python3 -c "import sys,dbus;print(sys.version)"' 4
  S 'busybox --list | tr "\n" " "'
  S 'df -h; free'
} > "$OUT" 2>&1
echo "Done. Report saved to $OUT"
