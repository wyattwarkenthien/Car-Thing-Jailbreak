#!/bin/sh
# Start the Bluetooth service with music remote control (AVRCP) turned on.
# Replaces the stock /etc/start_bluetoothd.sh (which only loads gap,deviceinfo) via supervisord.conf;
# restore.sh puts the original back. No A2DP, so the phone keeps playing audio itself.
exec /usr/libexec/bluetooth/bluetoothd -n --plugin=gap,deviceinfo,avrcp
