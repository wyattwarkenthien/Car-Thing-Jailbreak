#!/bin/sh
# Keep the Car Thing's Bluetooth chip (Broadcom BCM20703A2 on /dev/ttyS1) alive.
# Run by supervisord as [program:btwake].
#
# At boot the stock system attaches to the chip. Sometimes that works, sometimes the chip never
# answers (commands time out). So: wait for the stock attach, and only if the chip still has no
# address, power-cycle it with gpio493 and attach again. Then keep watching, and repeat if it dies.
G=/sys/class/gpio/gpio493

log() { echo "$(date '+%H:%M:%S') btwake: $*"; }
alive() {
  out=$(hciconfig hci0 2>/dev/null)
  echo "$out" | grep -q "BD Address" && ! echo "$out" | grep -q "BD Address: 00:00:00:00:00:00"
}
wake() {
  log "chip not answering, power-cycling and re-attaching"
  killall btattach 2>/dev/null
  sleep 1
  if [ -w "$G/value" ]; then
    echo 0 > "$G/value"; sleep 1
    echo 1 > "$G/value"; sleep 1
  else
    log "$G not available, attaching without a power-cycle"
  fi
  btattach -B /dev/ttyS1 -P bcm >/dev/null 2>&1 &
  LAST_WAKE=$(date +%s)
}

# 1. give the stock attach up to 20 seconds
i=0
while [ $i -lt 20 ]; do
  if alive; then log "chip is up (stock attach worked), leaving it alone"; break; fi
  sleep 1; i=$((i + 1))
done
alive || wake

# 2. keep watching; re-wake only if it stays dead, and at most once a minute
LAST_WAKE=${LAST_WAKE:-0}
dead=0
while true; do
  sleep 10
  if alive; then dead=0; continue; fi
  dead=$((dead + 1))
  now=$(date +%s)
  if [ $dead -ge 2 ] && [ $((now - LAST_WAKE)) -ge 60 ]; then
    wake
    dead=0
  fi
done
