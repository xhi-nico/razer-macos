<p align="center">
  <img src="resources/hero.png" alt="keyboard demo pic" />
  <p align="center">Open source color effects manager for Razer devices on macOS</p>
</p>

- **Auto lights** Every device follows your Mac, with nothing to set up (see below)
- **Supporting Razer devices** Keyboards, mice, mouse mats, eGPUs and blade laptops
- **Everything in the menu** There is no window: custom colours open the macOS colour panel,
  and DPI, polling rate and brightness are presets in each device's entry
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

**Music.** While the Mac plays sound and no camera or microphone is on, the keyboard's top row
dims and becomes a spectrum: each key is one band, bass on the left, lit from violet through
blue to cyan by how loud it is. It hands back after three seconds of silence, and a call
takes over the row at once. It listens to everything the Mac plays, so macOS
shows its system audio recording indicator while it runs (the same permission as the call
meter, macOS 14.2 or later). Only the spectrum is measured; nothing is recorded.

**Low battery.** A wireless mouse under 15% that is not charging pulses amber, until it is
plugged in or charged. The charge is read every two minutes. On its cable the Pro Click V2
Vertical reports itself as charging, so it never pulses there.

**Panic button.** Tap Control five times within two seconds (either Control key, nothing else
pressed in between) and every animation stops: the desk holds plain white, warm white at
night, red when away, with no call lights, meter, visualiser or layers. Five more taps let
go, and it lets go by itself after an hour. **Plain lights** in the menu does the same and
shows when the hour is up. It holds even with Auto lights off.

The taps need **Input Monitoring** (System Settings > Privacy & Security). macOS asks once; if
it is refused, the menu offers **Allow Input Monitoring for the panic button…**, and the taps
start working within half a minute of allowing it, no restart needed. The app only ever learns
that Control went down or up, or that some other key was pressed, never which one.

Picking a colour or effect from the menu switches Auto lights off; brightness leaves it on.

## Local lights API

Other programs on this Mac can show a colour on the desk for a while. Every request needs the
header `X-Desk-Lights: 1`, which keeps web pages out; the server only listens on `127.0.0.1`.

```sh
curl -s -X POST -H 'X-Desk-Lights: 1' http://127.0.0.1:47820/show \
  -d '{"id": "build", "region": "toprow", "color": "#00ff00", "effect": "pulse", "duration": 30}'
```

| Field | Values | Default |
|---|---|---|
| `color` | `"#rrggbb"` or `[r, g, b]`, or a list of up to 8, spread across the region as a gradient | required |
| `region` | `desk`, `keyboard`, `toprow`, `mouse`, `mat` | `desk` |
| `effect` | `solid`; `pulse` (breathes once per `period`); `wave` (a band rolls across the region and back once per `period`); `flash` (the next stop past a `wave` of the same period: lights as the band rolls off the far end, brightest as it turns); `bars` (each spot lit by its bar in `levels`) | `solid` |
| `levels` | for `bars`: 1 to 64 numbers from 0 to 1, spread across the region; post again with the same `id` to move them | none |
| `dim` | how much to darken what is under the layer, 0 to 1 | `0` |
| `duration` | seconds, up to 12 hours | `10` |
| `period` | seconds per pulse, wave or flash | `2`, wave and flash `2.6` |
| `priority` | higher paints over lower; the call lights and meeting countdown sit at `50` | `10` |
| `id` | posting the same id again updates that layer: it keeps its place, crossfades to a new colour or effect, and runs for its new duration | made up |
| `group` | layers sharing a group split their region between them, oldest on the left | none |

It answers `{"id": ..., "shown": ...}`; `shown` is false while Auto lights is off or the Mac is
away, when layers wait hidden (they never reach the stored red). A bad request gets a 400 with
the reason. Layers ease in and out.

- `DELETE /show/<id>` fades that layer out now.
- `GET /status` shows the current look, every layer with its seconds left, which devices answer,
  and each mouse's charge.
- `POST /attention` rolls an orange band across the keyboard and back three times, over the
  call lights, flowing on into the mouse each time it rolls off the keyboard's right end; a
  second one while it rolls is ignored.
- `POST /claude-code` takes Claude Code's hook JSON (below).

## Claude Code on the keyboard

The desk stays out of Claude Code's way until a session is blocked on you: a permission
prompt, a question, a plan to approve, or an MCP server asking for input. Then the attention
wave rolls (orange across the keyboard and on into the mouse), and again every minute
until you answer. Working, thinking and finished replies show nothing. Claude Code raises a
permission prompt to its hooks only after about 6 seconds unanswered, so a prompt you answer
straight away never lights up; a question does at once.

Answering (a prompt, a question, or a new message), the session moving on, or the session
ending stops the wave. A session killed while waiting stops reminding after an hour.

Every hook pipes its JSON to the app; add to `~/.claude/settings.json`, then restart Claude Code.
`PostToolUse` is how the app hears that you approved a permission prompt.

```json
"hooks": {
  "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST -H 'X-Desk-Lights: 1' --data-binary @- http://127.0.0.1:47820/claude-code >/dev/null 2>&1 || true", "timeout": 5 }] }],
  "PreToolUse": [{
    "matcher": "AskUserQuestion|ExitPlanMode",
    "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST -H 'X-Desk-Lights: 1' --data-binary @- http://127.0.0.1:47820/claude-code >/dev/null 2>&1 || true", "timeout": 5 }]
  }],
  "PostToolUse": [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST -H 'X-Desk-Lights: 1' --data-binary @- http://127.0.0.1:47820/claude-code >/dev/null 2>&1 || true", "timeout": 5 }] }],
  "Stop": [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST -H 'X-Desk-Lights: 1' --data-binary @- http://127.0.0.1:47820/claude-code >/dev/null 2>&1 || true", "timeout": 5 }] }],
  "StopFailure": [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST -H 'X-Desk-Lights: 1' --data-binary @- http://127.0.0.1:47820/claude-code >/dev/null 2>&1 || true", "timeout": 5 }] }],
  "Notification": [{
    "matcher": "permission_prompt|elicitation_dialog|elicitation_url_dialog|agent_needs_input",
    "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST -H 'X-Desk-Lights: 1' --data-binary @- http://127.0.0.1:47820/claude-code >/dev/null 2>&1 || true", "timeout": 5 }]
  }],
  "SessionEnd": [{ "hooks": [{ "type": "command", "command": "curl -s -m 1 -X POST -H 'X-Desk-Lights: 1' --data-binary @- http://127.0.0.1:47820/claude-code >/dev/null 2>&1 || true", "timeout": 5 }] }]
}
```

When the app is not running, the hooks do nothing.

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

Q: Something went wrong. Where do I look?

A: **About > Open Log** in the menu opens `~/Library/Logs/razer-macos/main.log`. A device that
stops answering while Auto lights is on shows "⚠️ not answering" next to its name in the menu;
it is logged, retried on its own, and the mark clears when it recovers. If the
app itself crashed, macOS keeps a report in `~/Library/Application Support/razer-macos/Crashpad`;
nothing is uploaded.

Q: How do I start it when I log in?

A: Tick **Open at Login** in the menu. Only one copy runs at a time; opening it again shows its menu.

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

Run the tests (fake devices, no hardware needed):

    yarn test

Run development server:

    yarn dev

During development, every time the driver code has been updated, a rebuild is required:

    yarn rebuild

For building a distribution ready app and dmg:

    yarn dist

There is no Developer ID, so the app is not notarized. By default each build is ad-hoc signed,
which macOS treats as a new app: it asks again for Calendar, microphone and system audio. Run
this once per Mac and builds are signed with a local identity instead, keeping those permissions:

    scripts/make-signing-identity.sh

The first build after it asks once to let `codesign` use the key; choose Always Allow.
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
