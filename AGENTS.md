# razer-macos

Menu bar app that controls Razer keyboards, mice and mouse mats on macOS. Electron front end over
`librazermacos`, a C port of the Linux openrazer driver, built as a native addon.
Fork of [slicke/razer-macos](https://github.com/slicke/razer-macos) (remote `upstream`).

## Run and verify

- Verify: `scripts/verify.sh` (device files, native addon, app bundle). CI runs it on macOS.
- Dev: `yarn dev`. The app has no Dock icon or window; look for the menu bar icon (named
  "Electron" in dev). After changing `librazermacos`, run `yarn rebuild`.
- Package: `yarn dist`, then `codesign -s - --deep --force "dist/mac-universal/Razer macOS.app"`.
  Output is `dist/*.dmg`. There is no Developer ID, so builds are ad-hoc signed and not notarized.

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
- Brightness from the app is 0-100. The `razer_chroma_*` report builders scale it to 0-255
  themselves; callers must not scale it again.
- The Pro Click V2 Vertical Edition rejects brightness on `ZERO_LED`; it answers on the underglow
  zone (`0x0A`), while lighting effects work on `ZERO_LED`.
