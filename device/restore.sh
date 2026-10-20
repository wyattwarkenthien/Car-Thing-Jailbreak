#!/bin/bash
# Undo the install: put the Car Thing's original start page back.
ADB=/Applications/DeskThing.app/Contents/Resources/mac/adb
[ -x "$ADB" ] || ADB="$(command -v adb)"
"$ADB" start-server >/dev/null 2>&1
"$ADB" shell 'mount -o remount,rw / && cp /etc/supervisord.conf.orig /etc/supervisord.conf && sync && reboot'
echo "Restored. The Car Thing is restarting with its previous start page."
