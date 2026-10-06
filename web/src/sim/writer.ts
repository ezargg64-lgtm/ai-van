// ── writer.ts ────────────────────────────────────────────────────────────────
// The one and only door into the visual state. Every sim module calls these;
// nothing else may write agent state directly. Bubbles carry an `until` stamp and
// auto-clear through a timer so the renderer never has to poll a clock.

import { useVan } from './vanStore';
import type { VanAgentState } from './types';

let seq = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function writeAgent(id: string, patch: Partial<VanAgentState>) {
  useVan.getState().setAgent(id, patch);
}

export function writeAll(patch: Partial<VanAgentState>) {
  for (const id of useVan.getState().order) writeAgent(id, patch);
}

/** Show a short floating bubble for `ms`, then clear it. */
export function say(id: string, text: string, ms = 5200) {
  const key = `bubble:${id}:${seq++}`;
  const until = Date.now() + ms;
  writeAgent(id, { bubble: { text, until } });
  const prev = timers.get(id);
  if (prev) clearTimeout(prev);
  timers.set(
    id,
    setTimeout(() => {
      const current = useVan.getState().agents[id];
      if (current?.bubble?.until === until) writeAgent(id, { bubble: null });
      timers.delete(id);
    }, ms + 30),
  );
  void key;
}

export function clearBubble(id: string) {
  const prev = timers.get(id);
  if (prev) clearTimeout(prev);
  timers.delete(id);
  writeAgent(id, { bubble: null });
}

const pending = new Set<ReturnType<typeof setTimeout>>();

/** setTimeout that is tracked so a new task can cancel an older staging. */
export function later(fn: () => void, ms: number) {
  const handle = setTimeout(() => {
    pending.delete(handle);
    fn();
  }, ms);
  pending.add(handle);
  return handle;
}

export function cancelAllPending() {
  for (const handle of pending) clearTimeout(handle);
  pending.clear();
}

/** Trim long text down to something that fits in a speech bubble. */
export function bubbleSnippet(text: string, max = 108): string {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf(', '));
  return `${cut.slice(0, stop > max * 0.45 ? stop + 1 : max).trim()}…`;
}
