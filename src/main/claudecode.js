// Claude Code sessions on the keyboard's top row, one segment each (oldest on
// the left), under the call lights. Motion means busy, steady means your turn.
const STATES = {
  working: { color: [217, 119, 87], effect: 'wave', period: 3, duration: 60 * 60 },
  waiting: { color: [0, 200, 60], effect: 'solid', duration: 4 * 60 * 60 },
  errored: { color: [255, 0, 0], effect: 'pulse', period: 1.2, duration: 4 * 60 * 60 },
};
const PRIORITY = 20;
const GROUP = 'claude-code';

// Hook event -> state. Notifications only count when Claude needs you.
const NEEDS_YOU = ['permission_prompt', 'idle_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input'];
function stateFor(event) {
  switch (event.hook_event_name) {
    case 'UserPromptSubmit':
    case 'PostToolUse': // also the first sign of work after you approve a permission prompt
      return 'working';
    case 'Stop':
      return 'waiting';
    case 'Notification':
      return NEEDS_YOU.includes(event.notification_type) ? 'waiting' : null;
    case 'StopFailure':
      return 'errored';
    case 'SessionEnd':
      return 'ended';
    default:
      return null;
  }
}

/**
 * Turns Claude Code's hook events (their JSON, posted to /claude-code) into
 * top-row layers. Starting to wait also rolls the attention wave once.
 */
export class ClaudeCodeSessions {
  constructor(lights) {
    this.lights = lights;
    this.states = new Map(); // session id -> last state shown
  }

  handle(event) {
    const session = typeof event?.session_id === 'string' ? event.session_id.slice(0, 48) : null;
    const state = session && stateFor(event);
    if (!state) {
      return;
    }
    const id = `claude:${session}`;
    if (state === 'ended') {
      this.states.delete(session);
      this.lights.cancel(id);
      return;
    }
    // A session that was killed never ends; its layer runs out, and its entry here is a few bytes.
    const previous = this.lights.has(id) ? this.states.get(session) : null;
    this.states.set(session, state);
    this.lights.show({ id, region: 'toprow', group: GROUP, priority: PRIORITY, ...STATES[state] });
    if (state === 'waiting' && previous !== 'waiting') {
      this.lights.attention();
    }
  }
}
