import { EventEmitter } from 'events';
import http from 'http';

const POLL_MS = 1000;
const IDLE_AFTER_SECONDS = 300;
// Meetings that started up to 3 minutes ago or start in the next 2, re-read
// every 15 seconds; the countdown needs one at least a minute ahead.
const CALENDAR_POLL_MS = 15 * 1000;
const MEETINGS_BEHIND_MS = 3 * 60 * 1000;
const MEETINGS_AHEAD_MS = 2 * 60 * 1000;
// Claude Code's Stop and Notification hooks post here; see README.
export const ATTENTION_PORT = 47820;

/**
 * Watches the Mac and reports what it is doing. Every second it reads the
 * whole state (lock, user switch, idle, camera, mic, nearby meetings) from the
 * system, so the result never depends on which event arrived first; events
 * only make it read sooner.
 *
 * Events:
 *   change    { away, camera, idle, mic, meetings }, whenever any of them changes;
 *             mic is only read while a meeting is near, since reading it is slow
 *   devices   a Razer device was plugged, unplugged or re-enumerated
 *   sleep     the Mac is about to sleep, log out or shut down; act now
 *   attention something (Claude Code) wants the user
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

    this.startAttentionServer();
  }

  stop() {
    clearInterval(this.pollInterval);
    if (this.server) {
      this.server.close();
    }
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

    const session = this.addon.getSessionState();
    const state = {
      away: session.locked || !session.onConsole,
      camera: this.addon.isCameraInUse(),
      idle: this.powerMonitor.getSystemIdleTime() >= IDLE_AFTER_SECONDS,
      mic: this.meetings.length > 0 && this.addon.isMicInUse(),
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

  startAttentionServer() {
    this.server = http.createServer((request, response) => {
      // Requiring a custom header keeps web pages out: a browser will not send
      // one cross-origin without a preflight, which this server never answers.
      if (request.method === 'POST' && request.url === '/attention' && request.headers['x-desk-lights']) {
        this.emit('attention');
        response.writeHead(204);
      } else {
        response.writeHead(404);
      }
      response.end();
    });
    this.server.on('error', error => console.warn('Attention listener unavailable:', error.message));
    this.server.listen(ATTENTION_PORT, '127.0.0.1');
  }
}
