#!/bin/bash
# Westward 1848 - install the game as the Car Thing's boot screen.
# Backs up everything it touches. Undo with:  bash restore.sh (in this folder)
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
"$ADB" start-server >/dev/null 2>&1
if ! "$ADB" devices -l | grep -q "spotify-car-thing"; then echo "Car Thing not found. Plug it in (no buttons held), wait for it to boot, and try again."; exit 1; fi
dev() { "$ADB" shell "$@"; }
echo "1/5 Making the system drive writable..."
dev 'mount -o remount,rw /'
echo "2/5 Backing up the current startup config and web app..."
dev '[ -f /etc/supervisord.conf.orig ] || cp /etc/supervisord.conf /etc/supervisord.conf.orig'
mkdir -p "$DIR/backup"
"$ADB" pull /etc/supervisord.conf "$DIR/backup/supervisord.conf" >/dev/null
"$ADB" pull /usr/share/qt-superbird-app/webapp "$DIR/backup/" >/dev/null 2>&1 || true
echo "3/5 Copying the game onto the Car Thing..."
dev 'mkdir -p /usr/share/westward'
"$ADB" push "$DIR/index.html" /usr/share/westward/index.html >/dev/null
echo "4/5 Setting the game as the start page..."
dev "sed -i 's#--app=file:///[^ ]*#--app=file:///usr/share/westward/index.html#' /etc/supervisord.conf"
dev 'grep -o "\-\-app=[^ ]*" /etc/supervisord.conf'
dev 'sync; mount -o remount,ro / 2>/dev/null || true'
echo "5/5 Restarting the Car Thing..."
dev 'reboot' || true
echo
echo "Done! The Car Thing will restart into Westward 1848 in about 30 seconds."
echo "Backup saved in $DIR/backup.  To undo: bash $DIR/restore.sh"
