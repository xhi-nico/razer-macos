# Changelog

All notable changes to this fork are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## About this fork

This is a downstream fork of [1kc/razer-macos](https://github.com/1kc/razer-macos),
taken at `v0.4.10`. Upstream has had no commits to `master` since 2022-09-22 and is
not accepting changes, so this fork is maintained independently.

A separate, unrelated fork ([JCKodel/razer-macos](https://github.com/JCKodel/razer-macos))
published a `0.5.0` from the same `v0.4.10` base in December 2022. That release is a
sibling lineage, not an ancestor of this one, and none of its changes are included here.
**Version `0.5.0` is deliberately skipped** so that two different codebases never share a
version number.

## [Unreleased]

### Added

- Red is the only colour stored in the devices, so they power up red whenever the Mac is not
  driving them yet (docking a locked Mac, the login screen). Devices that just connected are
  painted again at 2 and 6 seconds, in case they missed the first write.
- **Auto lights**, on by default: every attached device shows one look picked from the Mac's
  state. White while working, a slow dim breath after 5 minutes without input, red when locked, switched away, asleep, logged out or quit (red is stored in
  the devices, so the login screen shows it). Unlocking sweeps white across the desk. Plugging
  a device in, or waking from sleep, picks up the current look. Picking a colour or effect by
  hand switches Auto off; brightness does not.
- Warm white after sunset (from the time zone's coordinates), shifting over half an hour.
- A local lights API on `127.0.0.1:47820`: show a colour (solid, pulse or wave) on the desk,
  keyboard, top row, mouse or mat for a while, with a priority, an id to update or cancel it,
  groups that split a region, and a status endpoint.
- An attention wave (an orange band across every device and back, three times) on `POST
  127.0.0.1:47820/attention`.
- Claude Code sessions on the keyboard's top row, one segment each: a coral wave while working,
  steady green when waiting on you (with one attention wave), a red pulse after an API error.
  Fed by Claude Code's hooks posting to `/claude-code`.
- Call lights on the keyboard's top row: a slow deep purple pulse while a camera or mic is on.
- A live magenta voice meter over the call lights: it fills the top row from the left with
  whoever is talking (your mic, or what the call app plays), with a held peak.
- The mouse mirrors the top row's call pulse and meeting countdown, and the top row
  crossfades between them. The attention wave now shows over the top row too.
- A meeting countdown on the keyboard's top row, from the Mac's Calendar: it fills over the
  last minute, then pulses faster until a camera or mic turns on, for up to 3 minutes.
- `librazermacos`: `razer_set_skip_responses`, so lighting frames are sent without waiting
  for each device's reply (55ms to 6ms per frame across a keyboard, mouse and mat).

- A panic button: tap Control five times to stop every animation and hold the plain look, until
  five more taps or an hour; also **Plain lights** in the menu. Needs Input Monitoring, and
  offers the setting when it is missing.
- A music visualiser on the keyboard's top row while the Mac plays sound and no call is on: the
  row dims and each key lights with one band of the spectrum. The lights API gains `bars`
  (levels across a region), colour gradients and `dim`.
- A wireless mouse under 15% that is not charging pulses amber.
- A device that stops answering shows "⚠️ not answering" next to its name in the menu, until
  it recovers.
- A log file, `~/Library/Logs/razer-macos/main.log`, opened from **About > Open Log**. Uncaught
  errors are logged instead of stopping at an error dialog, and native crashes leave a local
  crash report.
- **Open at Login** in the menu. Only one copy of the app runs; opening it again shows its menu.
- `scripts/make-signing-identity.sh`: a local signing identity, so rebuilt apps keep their
  Calendar, microphone and system audio permissions.
- Tests for Auto lights, daylight and the device list (`yarn test`), run by `scripts/verify.sh`.
- `librazermacos`: every USB request times out after 500 ms, and `razer_take_usb_error` reports
  a failed one.

### Fixed

- A crash after any device rescan: the native layer kept the freed device list, so the next
  menu click, settings change or tray click on an old device read freed memory. Old devices now
  throw an error that is logged, and a menu built before the rescan finds the live device.
- Two rescans at once (a replug during a refresh) left the devices open twice, so the second
  could not open them. Rescans now run one at a time and close the old devices first.
- A device that stops answering is skipped and retried on its own (1 second, doubling to 30),
  instead of failing every frame; the rest of the desk keeps going.
- Ripple and Wheel sent frames every 0.05 ms rather than every 50 ms, and Ripple added another
  key listener each time it started.
- One failing device stopped an all-devices action (Static, Spectrum, Cycle) for every device
  after it.

### Removed

- The State manager and its per-trigger saved states, replaced by Auto lights.
- The battery readout next to the menu bar icon. The mouse's menu entry still shows its charge.

### Changed

- The settings window is gone; everything is in the menu. Custom colours (and the Cycle colours)
  open the macOS colour panel and are saved when it closes; DPI, polling rate and brightness are
  presets, with the current value among them. React and its UI libraries are no longer
  dependencies, and no hidden browser window runs in the background.
- Migrated the build from `electron-webpack` to `electron-vite`. `electron-webpack` was
  archived in 2021 and deadlocks on current Node, which made the project unbuildable on this
  machine; `electron-vite` builds it in under a second. This also removes the `node-gyp`
  failure against Python 3.12+, which no longer ships `distutils`.
- Electron 11 to 44, React 16 to 18 (`ReactDOM.render` to `createRoot`), electron-builder 23
  to 26.
- The renderer no longer uses `nodeIntegration`, which electron-vite does not support. IPC now
  goes through a preload script exposing only `send`, `sendSync` and `on` over
  `contextBridge`, so `contextIsolation` is enabled for the first time. Renderer call sites are
  unchanged: the renderer build aliases `electron` to a small bridge module.
- Replaced the abandoned `iohook` (which pinned the project to Electron 85 prebuilds) with
  `uiohook-napi`, used only by the keyboard ripple effect.
- Replaced webpack-specific APIs that have no Vite equivalent: `require.context` for the 147
  device definitions is now `import.meta.glob`, the `__static` global is now an `?asset`
  import, and `ELECTRON_WEBPACK_WDS_PORT` is now `ELECTRON_RENDERER_URL`.

### Fixed

- Mouse matrix brightness was scaled from 0-100 to 0-255 twice, so settings above about 40%
  wrapped around to dim values. Fixed in librazermacos.
- The state manager went blank when a saved state included a device that is not attached.
  Those devices now show by name, marked "not connected". Any view that hits a render error
  now shows the error instead of a blank window, and recovers on the next menu click.
- Tray icon rendering solid black instead of inverting for the menu bar. macOS only infers a
  template image when the filename ends in `Template`, and the bundler content-hashes asset
  filenames, which broke that convention. The template flag is now set explicitly via
  `nativeImage.setTemplateImage`, so it no longer depends on the filename.

### Removed

- `node-forge`, `dot-prop` and `source-map-support`, none of which were referenced anywhere in
  `src/`. `node-forge` at the pinned version carried known advisories, so dropping it removes
  that surface rather than bumping it.
- `electron-builder-notarize`. There is no Developer ID certificate available, so there is
  nothing to notarize.

### Added

- Razer Pro Click V2 Vertical Edition, wired (`0x00C7`) and wireless (`0x00C8`): static,
  wave, spectrum and off lighting, brightness, DPI up to 30000, 125/250/500/1000 Hz polling,
  and battery. Device settings follow openrazer, except brightness, which this mouse only
  accepts on the underglow zone. Only the wired connection has been tested.
- Razer Basilisk V3 Pro, wired (`0x00AA`) and wireless (`0x00AB`). librazermacos already
  supported it; the app had no device file. Untested on hardware.
- Menu bar battery readout: the charge of the attached mouse is shown next to the tray icon,
  with a lightning bolt while charging. Only devices that actually report a battery are polled,
  at 30 second intervals, and the readout is also refreshed whenever devices are re-enumerated
  so it appears immediately at startup rather than on the next tick.
- electron-builder `publish` configuration pointing at this fork, so a build emits an
  `app-update.yml` that refers here. Previously `publish` was unset, and the distributed
  0.5.0 binary carried an `app-update.yml` pointing at an unrelated repository.
- macOS `zip` build target alongside `dmg`. electron-updater cannot apply an update from a
  `dmg`, so the zip is required for the publish configuration to be usable.
- Device support carried in from `librazermacos`, updated from `325c96a` to `556f186`: Razer
  Cobra, Naga X, Laptop Stand Chroma, and the Basilisk V3 X Hyperspeed, V3 35K, V3 Pro and
  V3 Pro 35K variants. Every change there adds a new `case` to an existing switch, so devices
  already supported are unaffected.

Note that automatic updates additionally require the application to be signed with a Developer
ID certificate. Until that is in place, this configuration enables publishing build artifacts
to a release, not silent self-update.

## [0.6.0] - 2026-08-25

First tagged release of this fork.

### Added

- Battery level indicator for the Razer Mouse Dock. The dock is lit as a red-to-green
  gradient reflecting the charge of the attached mouse, since the dock has no battery
  telemetry of its own. Selecting any other lighting effect turns the indicator off.
- The indicator setting persists across restarts (`batteryModeActive`) and resumes
  automatically on launch.

### Fixed

- Crash (`EXC_BAD_ACCESS` / `SIGSEGV`) when the battery indicator wrote to a Mouse Dock
  whose USB handle had already been released, for example across sleep and wake, USB
  re-enumeration, or application teardown. The faulting path was:

  ```
  IOUSBLib  IOUSBDeviceClass::deviceGetDeviceProduct + 20
  addon     razer_mouse_dock_attr_write_mode_static + 100
  addon     MouseDockSetModeStatic(Napi::CallbackInfo const&) + 264
  ```

  `getDockTargetDevice()` re-resolved the live dock on every tick but fell back to the
  captured device object when the dock was absent from `activeRazerDevices`. That is
  precisely the case in which the handle is gone, so the fallback reintroduced the stale
  reference it was meant to avoid. It now returns `null` and the tick is skipped.

  Note that the surrounding `try`/`catch` could not have caught this. A use after free
  inside the native addon is a segmentation fault, not a JavaScript exception.

### Changed

- Battery indicator poll interval reduced from 15 seconds to 120 seconds, defined once as
  `BATTERY_POLL_MS` so the two interval call sites cannot drift apart. Battery level
  changes over hours, so the indicator is unaffected, and each tick makes a synchronous
  native USB call, so this also limits exposure to a stale handle.

[0.6.0]: https://github.com/uefigs139/razer-macos/releases/tag/v0.6.0
