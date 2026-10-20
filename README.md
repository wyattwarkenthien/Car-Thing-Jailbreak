# Westward 1848: Turning a Dead Spotify Car Thing Into a Trail Game

Spotify discontinued the Car Thing at the end of 2024 and shut off its servers, which left a lot of nice little gadgets sitting in drawers: an 800×480 touchscreen, a big clicky dial, four preset buttons, and a back button, all running embedded Linux. Mine was plugged into my Mac mini doing nothing. So I jailbroke it and built an Oregon Trail–style game for it, with Claude as my pair programmer the whole way through.


## Quick start

The Car Thing boots into a **home screen** with an app grid (Westward, Music, Radio, Phone, Settings). Turn the dial to move between apps, press it to open one, and press Back to return. Presets 1–4 along the top open Westward, Music, Radio and Phone directly. Inside Westward, hold Back for about a second, or pick "Home screen" on the title menu, to go home. Phone (and Settings › Bluetooth) scans for and pairs with phones, showing the pairing code on screen to confirm. Music and Radio are placeholders for now.

**Try it on your computer:** open [`device/home/index.html`](device/home/index.html) in Chrome. Arrow keys = dial, Enter = press dial, Esc = back, 1–4 = preset buttons.

**Install it on a jailbroken Car Thing** (Thing Labs firmware, Mac with `adb`, or the DeskThing app, which bundles one):

```bash
cd device
bash install.sh   # backs up the original start page (first run only), installs, reboots
bash update.sh    # push a new build of home/
bash restore.sh   # put the original start page back
bash sync-time.sh # set the Car Thing's clock and time zone from the Mac
bash install-bluetooth.sh  # wake the Bluetooth chip at boot + start the pairing helper
```

Plug the Car Thing in normally (no buttons held) and let it boot first. If DeskThing is running, quit it and kill any leftover `adb` process, or the USB connection will be busy. `install.sh` saves a backup in `device/backup/`, which is git-ignored.

**Build from source:**

```bash
bash build.sh     # builds Westward and the home screen into device/home/
```

## Repo layout

| Path | What it is |
|---|---|
| `device/home/` | What goes on the Car Thing: the home screen (`index.html`) and apps (`apps/westward/index.html`) |
| `device/*.sh` | install / update / restore scripts |
| `home/` | Home screen source. Add or change apps in `home/src/apps.ts` |
| `home/bt/` | Runs on the Car Thing: `btwake.sh` (wakes the Bluetooth chip at boot) and `bthelper.py` (local API on 127.0.0.1:8737 for pairing) |
| `source/` | Westward 1848 TypeScript source. `src/game/` holds the screens, simulation, data, hunting and rafting minigames |
| `build.sh` | Builds both into single, offline HTML files for the device's old Chromium |

## Part 1: The jailbreak

The community has done most of the hard work here. The current recommended route is the **Thing Labs firmware (8.9.2)**, flashed with the **Terbium** web flasher, which runs right in Chrome over WebUSB. No drivers or command-line tools needed.

1. Download the Thing Labs firmware package (about 300 MB).
2. Put the Car Thing into **burn mode**: unplug it, hold **buttons 1 and 4**, plug it back into the Mac (straight into the machine, not a hub), and let go after a few seconds. A black screen means it worked.
3. Open Terbium in Chrome, approve the USB device prompts, point it at the firmware, and flash.

Flashing wipes the Spotify software, but the device is hard to brick since stock firmware can be reflashed.

## Part 2: Ditching DeskThing

The usual next step is **DeskThing**, a Mac/PC companion app that turns the Car Thing into a widget dashboard. I started building the game as a DeskThing app, but partway through I decided DeskThing wasn't for me. I wanted the Car Thing to just *be* the game, no app running on my Mac.

My first thought was "let's write our own firmware." It turns out you don't need to. After the jailbreak, the device boots a small Linux system that uses `supervisord` to launch a **full-screen Chromium browser** pointed at a single local file:

```
--app=file:///usr/share/qt-superbird-app/webapp/index.html
```

That page *is* the interface. So "custom firmware" really means: put your own web page on the device and change that one line.

A couple of snags along the way:

- **DeskThing leaves a background `adb` process running** even after you quit it, which holds the USB connection and blocks other tools. Killing it in Activity Monitor (or `pkill -f adb`) fixed it.
- Browser-based ADB tools built for Android phones could see the device but couldn't connect, since the Car Thing is plain Linux. Running `adb` from Terminal (DeskThing ships its own copy) worked fine.

## Part 3: Building Westward 1848

The game is called **Westward 1848**. It's inspired by the classic, but every bit of art, writing, and design is original. It's written in **TypeScript** and draws everything to an HTML canvas, then gets bundled with **esbuild** into one self-contained HTML file that runs offline on the device.

**Controls are built around the hardware:**

- **Dial:** move the highlight, change amounts, aim, steer
- **Press the dial:** select, confirm, fire
- **Back:** go back, or stop the wagon
- **Buttons 1–4:** context shortcuts shown at the top of the screen (on the trail: Supplies, Map, Hunt, Camp)

**What's in it:**

- Choose an occupation (it affects your starting money and your score multiplier), name a party of five, and pick a departure month
- Outfit your wagon: oxen by the yoke, food in sacks, ammunition by the box, clothing, and spare wheels, axles, and tongues
- The full ~2,000-mile route from Independence, Missouri, to Oregon's Willamette Valley, with real landmarks, forts whose prices climb as you go west, river crossings, and route forks
- The final choice at The Dalles: raft the Columbia or pay the toll for the Barlow Road over Mount Hood
- A hunting minigame and a rafting minigame, both played on the dial
- Weather, illness, injuries, broken wagon parts, and pace/ration/rest decisions that all affect your party's health
- Autosave on the device, a high-score board ("The Westward Ten"), options for dial direction and travel speed, and a tombstone with an epitaph if things go badly

**Testing:** Before it ever touched the device, the game went through about a dozen automated full playthroughs (with Playwright) plus screenshot reviews. That caught real balance problems, like oxen wearing out too fast, food running out too quickly, and travel speed being off, which got tuned until a sensible run could actually make it to Oregon.

## Part 4: Putting it on the device

Three small shell scripts handle installing over USB with `adb`:

- **install.sh** backs up the original startup config and web app (on the device and on the Mac), copies the home screen and its apps to `/usr/share/carthing-home/`, swaps the browser's `--app=` line to point at it, and reboots. The Car Thing comes up straight into the home screen.
- **update.sh** pushes a new build and restarts the browser.
- **restore.sh** puts the original startup config back.

Everything is reversible, and the game runs entirely on the Car Thing. It only needs USB power, so a phone charger works.

## Bluetooth

After the jailbreak the Car Thing's Broadcom BCM20703A2 never answers at boot: the system attaches to it over `/dev/ttyS1` without resetting it first, so every command times out. Power-cycling `gpio493` before attaching brings it up. `install-bluetooth.sh` adds that as a startup service, plus a small Python helper that drives `bluetoothctl` as the pairing agent for the Settings › Bluetooth page.

## What's next

The same trick (replace the boot page) made room for a home screen, so the Car Thing now boots to an app grid with Westward as one app. Next up: filling in the Music (now-playing for the Mac), Radio (a companion screen for my Baofeng UV-5R) and Phone (Bluetooth pairing) apps.

## Credits

- Jailbreak tooling: [Thing Labs](https://github.com/thinglabsoss) firmware and the Terbium web flasher. See the [Car Thing wiki](https://carthing.wiki/).
- Font: VT323 by Peter Hull, under the SIL Open Font License.
- Westward 1848 is an original game inspired by the classic Oregon Trail. It is not affiliated with or endorsed by the owners of that game.
- Built by Wyatt Warkenthien with Claude as pair programmer.
