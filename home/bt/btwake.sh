#!/bin/sh
# Wake the Car Thing's Bluetooth chip (Broadcom BCM20703A2 on /dev/ttyS1) and keep it attached.
# Run by supervisord as [program:btwake]. At boot the stock attach talks to the chip before
# it has been reset, so it never answers. Power-cycling gpio493 first fixes that.
G=/sys/class/gpio/gpio493

killall btattach 2>/dev/null
sleep 1
if [ -w "$G/value" ]; then
  echo 0 > "$G/value"; sleep 1
  echo 1 > "$G/value"; sleep 1
else
  echo "btwake: $G not available, attaching without a power-cycle"
fi
exec btattach -B /dev/ttyS1 -P bcm
