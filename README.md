<p align="center">
  <img src="resources/hero.png" alt="keyboard demo pic" />
  <p align="center">Open source color effects manager for Razer devices on macOS</p>
</p>

<p align="center">
  <img src="screenshots/dark.png">
</p>

- **Auto lights** Every device follows your Mac, with nothing to set up (see below)
- **Supporting Razer devices** Keyboards, mice, mouse mats, eGPUs and blade laptops
- **Custom color picking** Choose your own colors for static, reactive and starlight effects
- **Persistent color settings** Color effects are saved to onboard memory
- **Battery indicator** The Mouse Dock is lit red to green by the attached mouse's charge, and
  the mouse's menu entry shows its charge, with a lightning bolt while charging
- **Works on the latest macOS** Including Intel and Apple Silicon. There are no current plans from Razer to support macOS ([source](https://mysupport.razer.com/app/answers/detail/a_id/1381/kw/macOS))

## Auto lights

On by default; untick **Auto lights** in the menu to drive the lights by hand. Every attached
device shows the same look, and effects travel across the desk the way it is laid out:
keyboard on the left, mat underneath, mouse on the right.

| Your Mac | Look |
|---|---|
| Locked, another user switched in, asleep, logged out, app quit | Red |
| No keyboard or mouse input for 5 minutes | A slow, dim white breath |
| Working | White by day, warm white by night |

Red is the only colour stored in the devices' own memory, so whenever they power up before the
app can reach them (docking a locked or sleeping Mac, the login screen, the app not running)
they show red. After devices connect, the app paints them again at 2 and 6 seconds, in case one
was still starting up.

When more than one applies, the higher row wins. Day turns to night over the half hour after
sunset, and back over the half hour after sunrise. Sunset is worked out from the Mac's time
zone (its city in the system's `zone.tab`), so it needs no location permission.

**On a call.** The keyboard's top row and the mouse pulse slowly in deep purple while any
camera is on or any microphone is recording, dictation included. The rest of the desk keeps its
look, and locking clears it. Whenever the top row changes what it shows, it crossfades over half
a second. Unlocking sweeps white in from the left; touching anything after idling wakes the desk
in a quarter second. Plugging in a device gives it the current look within a second or two.

**Who is talking.** While another app records, a magenta meter fills the top row from the left
with the loudness of whoever is talking, you or them, live. The loudest moment holds its key for
a beat before falling. The meter is on the keyboard only; the mouse keeps the call pulse. You is
the mic the call app records from, so the meter moves even while you are muted in the call. Them
is whatever the call app plays (macOS 14.2 or later). Only loudness is measured; nothing is
recorded. macOS asks once for the microphone and once for system audio recording; without
either, that side stays dark.

**Meeting countdown.** A minute before a meeting, the keyboard's top row fills amber from left
to right, and the mouse warms amber with it. Once the meeting has started both pulse, faster and faster, until a camera or
microphone turns on (you joined) or three minutes pass. A meeting is a timed event in the Mac's Calendar app
with other attendees that you have not declined. macOS asks once for Calendar access; the
development build (`yarn dev`) cannot ask, so the countdown only runs in the packaged app.

Picking a colour or effect from the menu switches Auto lights off; brightness leaves it on.

**Attention wave.** `POST http://127.0.0.1:47820/attention` with the header `X-Desk-Lights: 1`
rolls an orange band across the desk and back three times, then hands back. To have Claude Code use it when it is
waiting on you (every finished reply, plus permission prompts and the 60-second idle
reminder), add to `~/.claude/settings.json`, then restart Claude Code:

```json
"hooks": {
  "Stop": [{
    "hooks": [{
      "type": "command",
      "command": "curl -s -m 1 -X POST -H 'X-Desk-Lights: 1' http://127.0.0.1:47820/attention >/dev/null 2>&1 || true",
      "timeout": 5
    }]
  }],
  "Notification": [{
    "matcher": "permission_prompt|idle_prompt|elicitation_dialog|agent_needs_input",
    "hooks": [{
      "type": "command",
      "command": "curl -s -m 1 -X POST -H 'X-Desk-Lights: 1' http://127.0.0.1:47820/attention >/dev/null 2>&1 || true",
      "timeout": 5
    }]
  }]
}
```

## About this fork

This is a maintained fork of [1kc/razer-macos](https://github.com/1kc/razer-macos), which has had
no commits since September 2022. It adds a Mouse Dock battery indicator, Auto lights, and a build that works on current Node and Electron. See [CHANGELOG.md](CHANGELOG.md)
for the full list, including why version `0.5.0` is skipped.

## Download

This copy ([xhi-nico/razer-macos](https://github.com/xhi-nico/razer-macos)) tracks
[slicke/razer-macos](https://github.com/slicke/razer-macos) and adds the Pro Click V2 Vertical
Edition. It has no published release; build it from source as below.

## Installation instructions

Install by drag and drop to Applications.
If you get a security warning when opening the app, you need to go to your Mac's "System Preferences", "Security and Privacy", "General" and click "Open" at the bottom to allow Razer macOS to run.

Please see FAQ section below if color changes are not working, otherwise open a new issue.

## Device support

- ⌨️ Keyboard
- 🖱️ Mouse
- 📜 Mouse mat
- 🌈 e-GPU
- 🎧 Headphones and stand
- 💻 Blade laptop
- 🔊 Speakers
- 🍺 Mug
- ⭐️ And More

For a complete list of supported devices, please see [openrazer](https://openrazer.github.io).

Confirmed working for:

Keyboards:

- Razer Anansi
- Razer BlackWidow 2019
- Razer BlackWidow Chroma
- Razer BlackWidow Chroma Tournament Edition
- Razer BlackWidow Chroma V2
- Razer BlackWidow Elite
- Razer BlackWidow Essential
- Razer BlackWidow Lite
- Razer BlackWidow Overwatch
- Razer BlackWidow Stealth
- Razer BlackWidow Stealth Edition
- Razer BlackWidow Ultimate 2012
- Razer BlackWidow Ultimate 2013
- Razer BlackWidow Ultimate 2016
- Razer BlackWidow V3
- Razer BlackWidow V3 Mini Hyperspeed
- Razer BlackWidow V3 Pro (wired)
- Razer BlackWidow V3 TK
- Razer BlackWidow X Chroma
- Razer BlackWidow X Chroma Tournament Edition
- Razer BlackWidow X Chroma Ultimate
- Razer Cynosa Chroma
- Razer Cynosa Lite
- Razer Cynosa V2
- Razer Deathstalker Chroma
- Razer Deathstalker Expert
- Razer Huntsman
- Razer Huntsman Elite
- Razer Huntsman Mini
- Razer Huntsman Mini (JP)
- Razer Huntsman Tournament Edition
- Razer Huntsman V2
- Razer Huntsman V2 TKL
- Razer Huntsman V2 Analog
- Razer Nostromo
- Razer Orbweaver
- Razer Orbweaver Chroma
- Razer Ornata
- Razer Ornata Chroma
- Razer Ornata Chroma V2
- Razer Tartarus
- Razer Tartarus Chroma
- Razer Tartarus V2

Mice:

- Razer Abyssus 
- Razer Abyssus 1800
- Razer Abyssus 2000
- Razer Abyssus Elite DVA Edition
- Razer Abyssus Essential
- Razer Abyssus V2 (under older mouse effects)
- Razer Basilisk
- Razer Basilisk Essential
- Razer Basilisk Ultimate
- Razer Basilisk V2
- Razer Basilisk V3
- Razer Basilisk V3 Pro (wired and wireless)
- Razer DeathAdder 3 5G
- Razer DeathAdder 1800
- Razer DeathAdder 2013 (under older mouse effects)
- Razer DeathAdder 3500
- Razer DeathAdder Chroma
- Razer DeathAdder Elite
- Razer DeathAdder Essential
- Razer DeathAdder Essential White Edition
- Razer DeathAdder Essential (2021)
- Razer DeathAdder V2
- Razer DeathAdder V2 Mini
- Razer DeathAdder V2 Pro (wired and wireless)
- Razer Diamondback Chroma
- Razer Imperator
- Razer Lancehead Tournament Edition
- Razer Lancehead Wired
- Razer Lancehead Wireless (and wired)
- Razer Mamba 2012 (wired and wireless)
- Razer Mamba Elite
- Razer Mamba Tournament Edition
- Razer Mamba Wired
- Razer Mamba Wireless (and wired)
- Razer Naga 2012
- Razer Naga 2014
- Razer Naga Chroma
- Razer Naga Hex
- Razer Naga Hex Red
- Razer Naga Hex V2
- Razer Naga Left Handed 2020
- Razer Naga Pro (wired and wireless)
- Razer Naga Trinity
- Razer Orochi 2011
- Razer Orochi 2013
- Razer Orochi Chroma
- Razer Ouroboros
- Razer Pro Click V2 Vertical Edition (wired and wireless)
- Razer Taipan
- Razer Viper
- Razer Viper 8KHz
- Razer Viper Mini
- Razer Viper Ultimate (wired and wireless)

Mouse mats:

- Razer Firefly
- Razer Firefly Hyperflux
- Razer Firefly V2
- Razer Goliathus Chroma
- Razer Goliathus Chroma Extended

e-GPUs:

- Razer Core X Chroma

Headphones and stand:

- Razer Base Station V2 Chroma
- Razer Kraken
- Razer Kraken 7.1
- Razer Kraken 7.1 (Alternate)
- Razer Kraken Kitty Edition
- Razer Kraken Ultimate
- Razer Kraken V2

Laptops:

- Razer Blade 2018
- Razer Blade 2019 Advanced
- Razer Blade 2018 Base
- Razer Blade 2019 Base
- Razer Blade 2018 Mercury
- Razer Blade Late-2016
- Razer Blade Mid-2019 Mercury
- Razer Blade Pro 2017
- Razer Blade Pro 2017 Full HD
- Razer Blade Pro Late-2016
- Razer Blade Stealth
- Razer Blade Stealth 2019
- Razer Blade Stealth Late-2016
- Razer Blade Stealth Mid-2017
- Razer Blade Stealth Late-2017
- Razer Blade Stealth Late-2019
- Razer Blade Studio Edition 2019
- Razer Blade QHD

Speakers:

- Razer Nommo Chroma
- Razer Nommo Pro

Mugs: 

- Razer Chroma Mug
- Razer Chroma Base
- Razer Chroma HDK

Accessories:

- Razer Mouse Bungee V3 Chroma
- Razer Mouse Charging Dock
- Razer Thunderbolt 4 Dock Chroma

Please feel free to open pull requests for new devices you have tested.

## FAQ

Q: Selecting a colour setting has no effect on my keyboard.

A: It is possible that a wrong on-board keyboard profile has been selected. Change to a different profile and try again. See your device manual for specific instructions on how to switch profiles.

Q: Menu says "No device found".

A: Use the "Refresh Device List" option, which can be found when pressing the Razer OS icon on the top menu bar.

Q: How do I customize and rebind keys?

You might find the [Karabiner-elements](https://karabiner-elements.pqrs.org/) tool helpful.

## Device Support Policy

Ongoing new device support will be provided on a volunteer contribution basis, as it is difficult for someone who does not own the physical devices to be adding support and conducting tests.

## Developer usage

    git clone --recursive https://github.com/uefigs139/razer-macos.git

Ensure xcode command line tools are installed.

Node 20.19 or newer is required (Vite 8). The build uses electron-vite, not the archived
electron-webpack that upstream still uses.

For a clean build from scratch, run `./release.sh`.

 Or build manually:

Install node package dependencies:

    yarn

Run development server:

    yarn dev

During development, every time the driver code has been updated, a rebuild is required:

    yarn rebuild

For building a distribution ready app and dmg:

    yarn dist

The app is ad-hoc signed during the build (there is no Developer ID, so it is not notarized).
The installer is `dist/Razer macOS-<version>-universal.dmg`.

## Implementation

Project includes both hardware drivers and user interface.

Drivers are ported from the [openrazer](https://github.com/openrazer/openrazer) project for Linux.
The goal is to support all devices from openrazer on macOS.

An Electron macOS menu bar app is used for the user interface.
The C driver is exposed as a native Node.js addon using node-addon-api, which gets invoked by Electron at runtime to send packets to devices.

Adding support for new peripherals types requires porting from the openrazer project. See [wiki](https://github.com/1kc/razer-macos/wiki).

## Credits

Builds on work done by these amazing projects:

- [openrazer](https://github.com/openrazer/openrazer)
- [osx-razer-blade](https://github.com/kprinssu/osx-razer-blade)
- [osx-razer-led](https://github.com/dylanparker/osx-razer-led)
