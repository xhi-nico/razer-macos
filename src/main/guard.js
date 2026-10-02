/**
 * Runs `action`, logging a failure instead of throwing it. A device that stops
 * answering (unplugged, asleep, stalled) throws from every call, and that must
 * not take the menu, the settings window or the app down with it.
 */
export function guard(what, action) {
  try {
    return action();
  } catch (error) {
    console.warn(`${what} failed:`, error?.message ?? error);
    return undefined;
  }
}
