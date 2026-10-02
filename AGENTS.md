# razer-macos

Menu bar app that controls Razer keyboards, mice and mouse mats on macOS. Electron front end over
`librazermacos`, a C port of the Linux openrazer driver, built as a native addon.
Fork of [slicke/razer-macos](https://github.com/slicke/razer-macos) (remote `upstream`).

## Run and verify

- Verify: `scripts/verify.sh` (device files, tests, native addon, app bundle). CI runs it on macOS.
  Tests alone: `yarn test`, against fake devices, so they need no hardware.
- Dev: `yarn dev`. The app has no Dock icon or window; look for the menu bar icon (named
  "Electron" in dev). After changing `librazermacos`, run `yarn rebuild`.
- Package: `yarn dist`, output `dist/*.dmg`. There is no Developer ID, so it is not notarized.
  `scripts/sign.js` signs with the self-signed "Razer macOS Local Signing" identity when the Mac
  has it (`scripts/make-signing-identity.sh`, once per Mac), so macOS permissions survive
  rebuilds; otherwise ad-hoc. Hardened runtime stays off, since it blocks ad-hoc signed libraries.
- Logs: `~/Library/Logs/<app name>/main.log` (`razer-macos` in dev, `Razer macOS` packaged).

## Adding a device

A device needs two things, or it silently never appears:

1. `librazermacos`: the product ID in the device-type list (`razerdevice.c`, e.g. `is_mouse`) and
   in every driver function it should answer to. Copy the settings from openrazer's driver.
2. `src/devices/<name>.json`, matched on `productId`.

`librazermacos` is a submodule on [xhi-nico/librazermacos](https://github.com/xhi-nico/librazermacos)
(upstream `1kc/librazermacos`). Commit and push there first, then commit the new submodule pointer here.

## Facts that bite

- Only one process can hold a Razer device. While the app (or Razer Synapse) runs, anything else
  gets `Unable to open USB device: e00002c5`; quit the app before testing the library directly.
- Every scan (`getAllDevices`) closes the open devices and numbers the new ones afresh, so a
  device object from before a rescan throws `not open`. Look devices up again with
  `deviceManager.resolve`, and write through `guard` or `forEachDevice`, never a bare loop.
- A USB failure (gone, stalled, 500 ms timeout) throws `USB request failed: <code>` from the
  addon. A device that replies "not supported" does not throw; the C driver only prints.
- Brightness from the app is 0-100. The `razer_chroma_*` report builders scale it to 0-255
  themselves; callers must not scale it again.
- The Pro Click V2 Vertical Edition rejects brightness on `ZERO_LED`; it answers on the underglow
  zone (`0x0A`), while lighting effects work on `ZERO_LED`.
- Auto lights (`desklights.js` decides, `macsignals.js` watches the Mac) owns the lighting while
  on. Anything shown on top of it for a while is a layer (`lightlayers.js`), created through the
  local lights API (`lightsapi.js`, port `47820`, which belongs to whichever copy started first).
  New light features should be layers, not new branches in `paint`.
- Animation frames are sent with `setSkipResponses(true)` and the no-store writes; a settled
  frame waits for replies, and only the settled red is stored in the devices, so they power up
  red. Anything that reads from a device while skipping is on gets garbage, so keep it scoped
  to a frame.
- The voice bar records from the call's mic and taps the call app's audio, and the music
  visualiser taps all system audio while any other app plays, so this app shows up as recording. The mic-in-use check leaves this app out; anything new that asks "is a mic on?"
  must too, or the call never ends.
- `package.json` pins `vite` in `resolutions`: without it yarn 1 nests a second copy under
  vitest and the install fails. Vitest stays on 4, since 5 refuses odd Node versions (25).
- Calendar access needs `NSCalendarsFullAccessUsageDescription`, which only the packaged app's
  Info.plist has (`build.mac.extendInfo`); `yarn dev` reports calendar `unavailable`. The build
  is ad-hoc signed, so each new build may ask for Calendar access again.
