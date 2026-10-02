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
  const layer = id => layers().find(shown => shown.id === `claude:${id}`);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const devices = fakeDesk();
    lights = new DeskLights(fakeSettings(), fakeAddon(), () => devices, noDaylight);
    lights.update(macState());
    sessions = new ClaudeCodeSessions(lights);
  });

  afterEach(() => {
    lights.setAuto(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('follows a session from working to waiting to gone', () => {
    hook('a', 'UserPromptSubmit');
    expect(layer('a')).toMatchObject({ region: 'toprow', effect: 'wave', group: 'claude-code' });
    hook('a', 'Stop');
    expect(layer('a')).toMatchObject({ effect: 'solid', color: '#00c83c' });
    hook('a', 'SessionEnd');
    vi.advanceTimersByTime(1000);
    expect(layer('a')).toBeUndefined();
  });

  it('rolls the attention wave once when a session starts waiting', () => {
    hook('a', 'UserPromptSubmit');
    hook('a', 'Stop');
    expect(layers().map(shown => shown.id)).toContain('attention');
    vi.advanceTimersByTime(10 * 1000);
    hook('a', 'Notification', { notification_type: 'idle_prompt' });
    expect(layers().map(shown => shown.id)).not.toContain('attention');
  });

  it('goes back to working after a permission prompt is answered', () => {
    hook('a', 'UserPromptSubmit');
    hook('a', 'Notification', { notification_type: 'permission_prompt' });
    expect(layer('a').effect).toBe('solid');
    hook('a', 'PostToolUse');
    expect(layer('a').effect).toBe('wave');
  });

  it('shows an error until the next prompt', () => {
    hook('a', 'UserPromptSubmit');
    hook('a', 'StopFailure', { error_type: 'rate_limit' });
    expect(layer('a')).toMatchObject({ effect: 'pulse', color: '#ff0000' });
    hook('a', 'UserPromptSubmit');
    expect(layer('a').effect).toBe('wave');
  });

  it('gives each session its own segment, and ignores what is not about you', () => {
    hook('a', 'UserPromptSubmit');
    hook('b', 'UserPromptSubmit');
    hook('c', 'Notification', { notification_type: 'auth_success' });
    hook(undefined, 'Stop');
    sessions.handle(null);
    expect(layers().map(shown => shown.id)).toEqual(['claude:b', 'claude:a']);
  });
});
