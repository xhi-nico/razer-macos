// Claude Code on the desk: only when a session is blocked on you (a permission
// prompt, a question, a plan to approve) does the attention wave roll, and it
// rolls again every minute until you answer. Working and finished replies show
// nothing.
const REMIND_MS = 60 * 1000;
// A session that was killed while waiting never answers; stop reminding after this long.
const GIVE_UP_MS = 60 * 60 * 1000;

// Notifications that mean Claude cannot go on without you. A permission prompt
// only notifies after about 6 s unanswered, so answering at once shows nothing.
// `idle_prompt` (a finished reply left unread) is not one of them.
const NEEDS_YOU = ['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input'];
// Tools whose whole job is asking you something.
const ASKS_YOU = ['AskUserQuestion', 'ExitPlanMode'];

// Hook event -> 'needs' (blocked on you), 'done' (you answered, or it moved on), or null.
function stateFor(event) {
  switch (event.hook_event_name) {
    case 'Notification':
      return NEEDS_YOU.includes(event.notification_type) ? 'needs' : null;
    case 'PreToolUse':
      return ASKS_YOU.includes(event.tool_name) ? 'needs' : null;
    case 'UserPromptSubmit':
    case 'PostToolUse':
    case 'Stop':
    case 'StopFailure':
    case 'SessionEnd':
      return 'done';
    default:
      return null;
  }
}

/**
 * Turns Claude Code's hook events (their JSON, posted to /claude-code) into
 * the attention wave. One wave covers every session that needs you.
 */
export class ClaudeCodeSessions {
  constructor(lights) {
    this.lights = lights;
    this.waiting = new Map(); // session id -> when it started needing you
    this.timer = null;
  }

  handle(event) {
    const session = typeof event?.session_id === 'string' ? event.session_id.slice(0, 48) : null;
    const state = session && stateFor(event);
    if (state === 'needs') {
      if (!this.waiting.has(session)) {
        this.waiting.set(session, Date.now());
        this.lights.attention();
      }
      this.timer ??= setInterval(() => this.remind(), REMIND_MS);
    } else if (state === 'done' && this.waiting.delete(session) && this.waiting.size === 0) {
      this.stop();
      this.lights.calmDown();
    }
  }

  remind() {
    const now = Date.now();
    this.waiting.forEach((since, session) => {
      if (now - since > GIVE_UP_MS) {
        this.waiting.delete(session);
      }
    });
    if (this.waiting.size === 0) {
      this.stop();
    } else {
      this.lights.attention();
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
