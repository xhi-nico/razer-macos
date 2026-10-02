import { EventEmitter } from 'events';

const POLL_MS = 1000;
const IDLE_AFTER_SECONDS = 300;
// Meetings that started up to 3 minutes ago or start in the next 2, re-read
// every 15 seconds; the countdown needs one at least a minute ahead.
const CALENDAR_POLL_MS = 15 * 1000;
const MEETINGS_BEHIND_MS = 3 * 60 * 1000;
const MEETINGS_AHEAD_MS = 2 * 60 * 1000;
// Reading the mic takes ~17ms, so it is read every other poll.
const MIC_POLL_MS = 2 * 1000;

/**
 * Watches the Mac and reports what it is doing. Every second it reads the
 * whole state (lock, user switch, idle, camera, mic, nearby meetings) from the
 * system, so the result never depends on which event arrived first; events
 * only make it read sooner.
 *
 * Events:
 *   change    { away, camera, idle, mic, meetings }, whenever any of them changes
 *   devices   a Razer device was plugged, unplugged or re-enumerated
 *   sleep     the Mac is about to sleep, log out or shut down; act now
 */
export class MacSignals extends EventEmitter {
  constructor(addon, powerMonitor) {
    super();
    this.addon = addon;
    this.powerMonitor = powerMonitor;
    this.state = null;
    this.devicesFingerprint = null;
    this.meetings = [];
    this.meetingsReadAt = 0;
    this.mic = false;
    this.micReadAt = 0;
  }

  start() {
    if (this.addon.calendarAccess() === 'notDetermined') {
      this.addon.requestCalendarAccess().then(() => {
        this.meetingsReadAt = 0;
      });
    }
    this.devicesFingerprint = this.readDevicesFingerprint();
    this.sample(true);
    this.pollInterval = setInterval(() => this.sample(), POLL_MS);

    ['lock-screen', 'unlock-screen', 'user-did-become-active', 'user-did-resign-active']
      .forEach(event => this.powerMonitor.on(event, () => this.sample()));
    // After sleep the lights were forced to "away", so report the state even if
    // it reads the same as before sleeping.
    this.powerMonitor.on('resume', () => this.sample(true));
    ['suspend', 'shutdown'].forEach(event => this.powerMonitor.on(event, () => this.emit('sleep')));
  }

  stop() {
    clearInterval(this.pollInterval);
  }

  sample(force = false) {
    // Devices first, so a refresh is underway before the lights write to stale handles.
    const fingerprint = this.readDevicesFingerprint();
    if (fingerprint !== this.devicesFingerprint) {
      this.devicesFingerprint = fingerprint;
      this.emit('devices');
    }

    const now = Date.now();
    if (force || now - this.meetingsReadAt >= CALENDAR_POLL_MS) {
      this.meetings = this.addon.meetingStartsBetween(now - MEETINGS_BEHIND_MS, now + MEETINGS_AHEAD_MS).sort((a, b) => a - b);
      this.meetingsReadAt = now;
    }
    if (force || now - this.micReadAt >= MIC_POLL_MS) {
      this.mic = this.addon.isMicInUse();
      this.micReadAt = now;
    }

    const session = this.addon.getSessionState();
    const state = {
      away: session.locked || !session.onConsole,
      camera: this.addon.isCameraInUse(),
      idle: this.powerMonitor.getSystemIdleTime() >= IDLE_AFTER_SECONDS,
      mic: this.mic,
      meetings: this.meetings,
    };
    const previous = this.state;
    this.state = state;
    if (force || Object.keys(state).some(key => String(state[key]) !== String(previous[key]))) {
      this.emit('change', state);
    }
  }

  readDevicesFingerprint() {
    return this.addon.listRazerUsbEntries().sort().join(',');
  }
}
