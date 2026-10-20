#!/bin/bash
# Install the home screen (with Westward 1848 inside it) as the Car Thing's boot screen.
# Safe to run again: the original startup config is only backed up the first time.
# Undo with:  bash restore.sh (in this folder)
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET=/usr/share/carthing-home
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
[ -f "$DIR/home/index.html" ] || { echo "Missing $DIR/home/index.html. Run build.sh first."; exit 1; }
"$ADB" start-server >/dev/null 2>&1
if ! "$ADB" devices -l | grep -q "spotify-car-thing"; then echo "Car Thing not found. Plug it in (no buttons held), wait for it to boot, and try again."; exit 1; fi
dev() { "$ADB" shell "$@"; }

echo "1/5 Making the system drive writable..."
dev 'mount -o remount,rw /'

echo "2/5 Backing up the original startup config (first run only)..."
dev '[ -f /etc/supervisord.conf.orig ] || cp /etc/supervisord.conf /etc/supervisord.conf.orig'
if [ ! -d "$DIR/backup" ]; then
  mkdir -p "$DIR/backup"
  "$ADB" pull /etc/supervisord.conf.orig "$DIR/backup/supervisord.conf" >/dev/null
  "$ADB" pull /usr/share/qt-superbird-app/webapp "$DIR/backup/" >/dev/null 2>&1 || true
fi

echo "3/5 Copying the home screen and apps onto the Car Thing..."
dev "rm -rf $TARGET"
"$ADB" push "$DIR/home" "$TARGET" >/dev/null
dev "ls $TARGET $TARGET/apps"

echo "4/5 Setting the home screen as the start page..."
dev "sed -i 's#--app=file:///[^ ]*#--app=file://$TARGET/index.html#' /etc/supervisord.conf"
dev 'grep -o "\-\-app=[^ ]*" /etc/supervisord.conf'
dev 'sync; mount -o remount,ro / 2>/dev/null || true'

echo "5/5 Restarting the Car Thing..."
dev 'reboot' || true
echo
echo "Done! The Car Thing will restart into the home screen in about 30 seconds."
echo "To undo: bash $DIR/restore.sh"
