// ── Gemini client (plain REST, global fetch, zero SDK deps) ──────────────────
// Every call goes through callGemini(): it resolves the key, tries the configured
// model, transparently falls back to known-good model ids, and returns text.
// When there is no key at all it throws NO_KEY and callers switch to demo mode.

import { activeKey, modelFor } from './store.js';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Fallback chain used only when the configured model 404s (retired id, typo, or
// an account without access to that exact model).
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

export class NoKeyError extends Error {
  constructor() {
    super('NO_KEY');
    this.code = 'NO_KEY';
  }
}

export function hasKey() {
  return Boolean(activeKey());
}

export function modelName() {
  return modelFor();
}

/**
 * One Gemini turn.
 * @param {object} opts
 * @param {string} opts.system   system instruction (the agent's persona / role rules)
 * @param {string} opts.user     user content
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {boolean} [opts.json]  ask the model for strict JSON output
 * @returns {Promise<{text: string, model: string}>}
 */
export async function callGemini({
  system,
  user,
  temperature = 0.85,
  maxTokens = 900,
  json = false,
}) {
  const key = activeKey();
  if (!key) throw new NoKeyError();

  const configured = modelName();
  const models = [configured, ...FALLBACK_MODELS.filter((m) => m !== configured)];
  let lastErr = null;

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const res = await fetch(`${API_ROOT}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            ...(json ? { responseMimeType: 'application/json' } : {}),
          },
          safetySettings: [],
        }),
      });
      clearTimeout(timer);

      if (res.status === 404) {
        lastErr = new Error(`model ${model} not found`);
        continue; // try the next model id
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Gemini ${res.status}: ${body.slice(0, 240)}`);
      }
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p?.text || '').join('').trim();
      if (!text) {
        const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
        throw new Error(`Gemini returned no text${reason ? ` (${reason})` : ''}`);
      }
      return { text, model };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err?.name === 'AbortError') lastErr = new Error('Gemini request timed out');
      if (String(err.message).includes('model') && String(err.message).includes('not found')) continue;
      break; // network / auth / quota errors: don't burn the remaining models
    }
  }
  throw lastErr || new Error('Gemini call failed');
}

/** Tolerant JSON extraction: handles ```json fences and leading prose. */
export function parseJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
  try {
    return JSON.parse(s);
  } catch {
    /* keep digging */
  }
  const start = s.search(/[[{]/);
  if (start === -1) return null;
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const slice = s.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
