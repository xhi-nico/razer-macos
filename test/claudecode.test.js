import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true },
}));

import { DeskLights } from '../src/main/desklights';
import { ClaudeCodeSessions } from '../src/main/claudecode';
import { fakeDesk, fakeSettings, fakeAddon, noDaylight, macState } from './fakes';

describe('ClaudeCodeSessions', () => {
  let lights, sessions;
  const hook = (session_id, hook_event_name, extra = {}) => sessions.handle({ session_id, hook_event_name, ...extra });
  const layers = () => lights.layers.status(Date.now());

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const devices = fakeDesk();
    lights = new DeskLights(fakeSettings(), fakeAddon(), () => devices, noDaylight);
    lights.update(macState());
    sessions = new ClaudeCodeSessions(lights);
  });

  afterEach(() => {
    sessions.stop();
    lights.setAuto(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const rolling = () => lights.has('attention');

  it('shows nothing while Claude works or finishes a reply', () => {
    hook('a', 'UserPromptSubmit');
    hook('a', 'PostToolUse', { tool_name: 'Bash' });
    hook('a', 'Stop');
    hook('a', 'Notification', { notification_type: 'idle_prompt' });
    expect(layers()).toEqual([]);
  });

  it('rolls the wave when Claude needs you, and stops it once you answer', () => {
    hook('a', 'UserPromptSubmit');
    hook('a', 'Notification', { notification_type: 'permission_prompt' });
    expect(rolling()).toBe(true);
    vi.advanceTimersByTime(2000);
    hook('a', 'PostToolUse', { tool_name: 'Bash' });
    vi.advanceTimersByTime(1000);
    expect(rolling()).toBe(false);
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(rolling()).toBe(false);
  });

  it('counts a question or a plan to approve as needing you', () => {
    hook('a', 'PreToolUse', { tool_name: 'Bash' });
    expect(rolling()).toBe(false);
    hook('a', 'PreToolUse', { tool_name: 'AskUserQuestion' });
    expect(rolling()).toBe(true);
    hook('a', 'PostToolUse', { tool_name: 'AskUserQuestion' });
    hook('b', 'PreToolUse', { tool_name: 'ExitPlanMode' });
    expect(rolling()).toBe(true);
  });

  it('reminds every minute until you answer, and gives up after an hour', () => {
    hook('a', 'Notification', { notification_type: 'permission_prompt' });
    vi.advanceTimersByTime(30 * 1000);
    expect(rolling()).toBe(false);
    vi.advanceTimersByTime(31 * 1000);
    expect(rolling()).toBe(true);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(rolling()).toBe(false);
    expect(sessions.timer).toBeNull();
  });

  it('keeps waving while any session still needs you', () => {
    hook('a', 'Notification', { notification_type: 'permission_prompt' });
    hook('b', 'Notification', { notification_type: 'elicitation_dialog' });
    hook('a', 'Stop');
    expect(rolling()).toBe(true);
    hook('b', 'SessionEnd');
    vi.advanceTimersByTime(1000);
    expect(rolling()).toBe(false);
  });

  it('ignores what is not about you', () => {
    hook('c', 'Notification', { notification_type: 'auth_success' });
    hook(undefined, 'Notification', { notification_type: 'permission_prompt' });
    sessions.handle(null);
    expect(layers()).toEqual([]);
  });
});
