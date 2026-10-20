# ⚠️ Experimental: do not use as-is

This was an attempt to give the Music app Spotify cover art and real scrubbing by running a small
service on the Mac (Spotify Web API) that the Car Thing reaches over the USB cable.

**On the Thing Labs firmware, the `adb reverse` tunnel this relies on knocks the Car Thing off USB
entirely until it reboots.** `adb forward` (Mac → Car Thing) is stable, so a working version would
need to flip the direction: the Mac pushes now-playing data to the Car Thing's helper instead of the
Car Thing calling the Mac.

Kept here for reference. If you've installed it, remove it with `bash uninstall-link.sh`.
