// ── livingSim.ts ─────────────────────────────────────────────────────────────
// Idle life in the van. Every agent has a staggered timer (30-50s). When it fires
// it re-reads the world (time-of-day segment, who is where) and picks a weighted
// activity; the activity then plays out with props, bubbles and a place to sit.
// It never runs an agent that taskStaging owns (occupancy.isStaged).

import {
  ACTIVITIES,
  ADJACENT,
  CHAT_PAIRS,
  ROSTER,
  TIME_BIAS,
  type ActivityDef,
} from './vanLayout';
import { occupancy } from './occupancy';
import { segmentOf, world } from './timeOfDay';
import { bubbleSnippet, clearBubble, later, say, writeAgent } from './writer';
import type { ActivityId, Pose, ZoneId } from './types';

// The plan's "staggered 30-50s timer" is the *decision* cadence. Straight after an
// activity ends most agents roll into the next one (the van should feel inhabited);
// the rest take a proper break and just sit there for a while.
const ROLL_ON_CHANCE = 0.74;
const BREAK_MIN = 18_000;
const BREAK_MAX = 42_000;
const MIN_HOLD = 20_000;

type Plan = {
  activity: ActivityId | null;
  zone: ZoneId;
  slot: number;
  /** ms timestamp: activity ends */
  until: number;
  /** ms timestamp: next decision */
  nextAt: number;
  nextBubbleAt: number;
  /** remembered activity so a resume after a task feels continuous */
  remembered: ActivityId | null;
};

type ChatTurn = { agentId: string; text: string; at: number };

type ChatPair = {
  a: string;
  b: string;
  turns: ChatTurn[];
  i: number;
  /** true while the pair dialogue owns both agents */
  active: boolean;
};

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const pickWeighted = <T extends string>(entries: Array<[T, number]>): T | null => {
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [id, w] of entries) {
    r -= Math.max(0, w);
    if (r <= 0) return id;
  }
  return entries[entries.length - 1][0];
};

class LivingSim {
  private plans = new Map<string, Plan>();
  private chat: ChatPair | null = null;
  private lastCodingAt = 0;
  private nextPairCheck = 0;
  private started = false;

  /** Seat everybody in their default zone and start the staggered timers. */
  init(now: number) {
    if (this.started) return;
    this.started = true;
    this.lastCodingAt = now;
    ROSTER.forEach((entry, index) => {
      const slotIndex = occupancy.takeSeat(entry.id, entry.defaultZone) ?? 0;
      const slot = occupancy.slotOf(entry.defaultZone, slotIndex);
      const plan: Plan = {
        activity: null,
        zone: entry.defaultZone,
        slot: slotIndex,
        until: now + MIN_HOLD,
        nextAt: now + 3500 + index * 5200, // staggered so they never all move at once
        nextBubbleAt: now + rnd(6000, 20000),
        remembered: null,
      };
      this.plans.set(entry.id, plan);
      writeAgent(entry.id, {
        zone: plan.zone,
        slot: plan.slot,
        pose: slot.pose,
        activity: null,
        propId: null,
        lookAt: null,
        speaking: false,
        zzz: false,
        bubble: null,
      });
    });
  }

  planOf(id: string) {
    return this.plans.get(id);
  }

  /** Remember what everyone was doing so the van resumes after a task. */
  rememberAll() {
    for (const [, plan] of this.plans) {
      if (plan.activity) plan.remembered = plan.activity;
    }
  }

  /** Agents leave the huddle and go back to what they were doing. */
  resumeAll(now: number, delay = 900) {
    let i = 0;
    for (const [id, plan] of this.plans) {
      const remembered = plan.remembered ?? this.rememberedDefault(id);
      const at = delay + i * 420;
      i++;
      later(() => {
        occupancy.unstage(id);
        plan.activity = null;
        plan.until = Date.now() + 800;
        clearBubble(id);
        writeAgent(id, {
          activity: null,
          propId: null,
          speaking: false,
          lookAt: null,
          facingCamera: false,
          zzz: false,
        });
        // resume the remembered activity: Dana goes back to her laptop, Quinn to
        // the bunk. If nothing was remembered, pick fresh a little later.
        if (remembered) {
          this.startActivity(id, remembered, Date.now());
        } else {
          plan.nextAt = Date.now() + rnd(3000, 11_000);
        }
      }, at);
    }
    void now;
  }

  private rememberedDefault(id: string): ActivityId | null {
    const entry = ROSTER.find((r) => r.id === id);
    if (!entry) return null;
    return (entry.bias[0] as ActivityId) ?? null;
  }

  private weightsFor(id: string): Array<[ActivityId, number]> {
    const entry = ROSTER.find((r) => r.id === id);
    const segment = segmentOf(world.t);
    const bias = entry?.bias ?? [];
    const out: Array<[ActivityId, number]> = [];
    for (const def of Object.values(ACTIVITIES)) {
      if (def.id === 'chat') continue; // chat-pairs are scheduled, not chosen
      if (def.id === 'sleeping' && segment === 'day' && Math.random() < 0.75) continue;
      const timeBias = TIME_BIAS[segment][def.id] ?? 1;
      const agentBias = bias.includes(def.id) ? 1.85 : 1;
      const weight = def.weight * timeBias * agentBias;
      if (weight > 0) out.push([def.id, weight]);
    }
    return out;
  }

  /** Find a zone + seat for an activity, falling back through the van. */
  private place(id: string, def: ActivityDef): { zone: ZoneId; slot: number; pose: Pose } | null {
    for (const zone of def.zones) {
      const slot = occupancy.takeSeat(id, zone);
      if (slot != null) {
        return { zone, slot, pose: def.poses[zone] ?? 'sit-upright' };
      }
    }
    return null;
  }

  private startActivity(id: string, activityId: ActivityId, now: number, forcePose?: Pose) {
    const def = ACTIVITIES[activityId];
    const target = this.place(id, def);
    const plan = this.plans.get(id)!;
    if (!target) {
      // every seat for that activity is taken: stay put, try again shortly
      plan.activity = null;
      plan.nextAt = now + rnd(2500, 7000);
      writeAgent(id, { activity: null, propId: null });
      return;
    }
    plan.activity = activityId;
    plan.zone = target.zone;
    plan.slot = target.slot;
    plan.until = now + rnd(def.duration[0], def.duration[1]) * 1000;
    plan.nextAt = plan.until + 400;
    plan.nextBubbleAt = now + rnd(4000, 16000);
    plan.remembered = activityId;

    writeAgent(id, {
      zone: target.zone,
      slot: target.slot,
      pose: forcePose ?? target.pose,
      activity: activityId,
      propId: def.prop,
      lookAt: null,
      speaking: false,
      zzz: Boolean(def.zzz),
      bubble: null,
    });
    if (activityId === 'coding') this.lastCodingAt = now;

    // arrival beat: a bubble once they settle in
    if (def.bubbles.length) {
      later(() => {
        if (occupancy.isStaged(id)) return;
        const p = this.plans.get(id);
        if (p?.activity === activityId) say(id, def.bubbles[Math.floor(Math.random() * def.bubbles.length)]);
      }, 2600 + Math.random() * 2400);
    }
  }

  private endActivity(id: string, now: number, rollOn = false) {
    const plan = this.plans.get(id);
    if (!plan) return;
    plan.activity = null;
    plan.nextAt = rollOn ? now + rnd(400, 2600) : now + rnd(BREAK_MIN, BREAK_MAX);
    writeAgent(id, { activity: null, propId: null, zzz: false, lookAt: null });
    clearBubble(id);
  }

  /** Two neighbours strike up a 2-3 turn chat. */
  private maybeStartPair(now: number) {
    if (this.chat) return;
    if (now < this.nextPairCheck) return;
    this.nextPairCheck = now + 14_000;
    if (Math.random() > 0.3) return;

    const idle = [...this.plans.entries()].filter(
      ([id, plan]) => !occupancy.isStaged(id) && plan.activity === null,
    );
    for (let i = 0; i < idle.length; i++) {
      for (let j = i + 1; j < idle.length; j++) {
        const [idA, planA] = idle[i];
        const [idB, planB] = idle[j];
        const adjacent = ADJACENT.some(
          ([x, y]) => (x === planA.zone && y === planB.zone) || (y === planA.zone && x === planB.zone),
        );
        if (!adjacent) continue;
        const script = CHAT_PAIRS[Math.floor(Math.random() * CHAT_PAIRS.length)];
        const turns: ChatTurn[] = script.slice(0, Math.min(3, script.length)).map((text, k) => ({
          agentId: k % 2 === 0 ? idA : idB,
          text,
          at: now + 900 + k * 4200,
        }));
        this.chat = { a: idA, b: idB, turns, i: 0, active: true };
        writeAgent(idA, { lookAt: idB, speaking: false, activity: null, propId: null });
        writeAgent(idB, { lookAt: idA, speaking: false, activity: null, propId: null });
        return;
      }
    }
  }

  /** Called by task staging: a huddle interrupts any chat the pair was having. */
  cancelChatPair() {
    const pair = this.chat;
    if (!pair) return;
    this.chat = null;
    for (const id of [pair.a, pair.b]) {
      if (!occupancy.isStaged(id)) writeAgent(id, { lookAt: null, speaking: false });
    }
  }

  private tickPair(now: number) {
    const pair = this.chat;
    if (!pair) return;
    if (occupancy.isStaged(pair.a) || occupancy.isStaged(pair.b)) {
      this.cancelChatPair();
      return;
    }
    while (pair.i < pair.turns.length && now >= pair.turns[pair.i].at) {
      const turn = pair.turns[pair.i];
      const listener = turn.agentId === pair.a ? pair.b : pair.a;
      writeAgent(turn.agentId, { speaking: true, lookAt: listener });
      writeAgent(listener, { speaking: false });
      say(turn.agentId, turn.text, 4200);
      pair.i++;
    }
    if (pair.i >= pair.turns.length) {
      const doneAt = pair.turns[pair.turns.length - 1].at + 4400;
      if (now >= doneAt) {
        for (const id of [pair.a, pair.b]) {
          writeAgent(id, { lookAt: null, speaking: false });
          const plan = this.plans.get(id);
          if (plan) plan.nextAt = now + rnd(12_000, 30_000);
        }
        this.chat = null;
      }
    }
  }

  update(now: number) {
    if (!this.started) {
      this.init(now);
      return;
    }
    const segment = segmentOf(world.t);

    // ── keep at least one agent visibly coding during the day ──
    if (segment === 'day' && now - this.lastCodingAt > 32_000) {
      const candidates = [...this.plans.entries()].filter(
        ([id]) => !occupancy.isStaged(id) && !this.chat,
      );
      const coders = candidates.filter(([, p]) => p.activity === 'coding');
      if (coders.length === 0 && candidates.length) {
        const [id] = candidates[Math.floor(Math.random() * candidates.length)];
        this.startActivity(id, 'coding', now);
      }
    }

    for (const [id, plan] of this.plans) {
      if (occupancy.isStaged(id)) continue;
      if (this.chat && (this.chat.a === id || this.chat.b === id)) continue;

      if (plan.activity && now >= plan.until) {
        this.endActivity(id, now, Math.random() < ROLL_ON_CHANCE);
      }
      if (now >= plan.nextAt) {
        const entry = ROSTER.find((r) => r.id === id);
        const bias = entry?.bias ?? [];
        const weights = this.weightsFor(id);
        // gentle pull back toward this agent's own habits
        const weighted: Array<[ActivityId, number]> = weights.map(([act, w]) => [
          act,
          w * (bias.includes(act) ? 1.25 : 1),
        ]);
        const chosen = pickWeighted(weighted) ?? 'reading';
        if (chosen === plan.activity) {
          // same thing again: just extend, no pointless shuffle
          plan.until = now + rnd(ACTIVITIES[chosen].duration[0], ACTIVITIES[chosen].duration[1]) * 1000;
          plan.nextAt = plan.until + 400;
        } else {
          this.startActivity(id, chosen, now);
        }
      }

      // occasional idle chatter inside the current activity
      const activity = plan.activity;
      if (activity && now >= plan.nextBubbleAt) {
        const def = ACTIVITIES[activity];
        plan.nextBubbleAt = now + rnd(18_000, 42_000);
        if (def.bubbles.length && Math.random() < 0.7) {
          say(id, def.bubbles[Math.floor(Math.random() * def.bubbles.length)]);
        }
      }
    }

    this.maybeStartPair(now);
    this.tickPair(now);
  }

  /** Used by task staging: put an agent somewhere specific, right now. */
  placeAgent(id: string, zone: ZoneId, slot: number, pose: Pose, lookAt: string | null = null) {
    const plan = this.plans.get(id);
    if (plan) {
      plan.zone = zone;
      plan.slot = slot;
    }
    writeAgent(id, { zone, slot, pose, activity: null, propId: null, lookAt, zzz: false, speaking: false });
  }

  /** A short line from an agent without changing where they are. */
  line(id: string, text: string, ms = 5200) {
    say(id, bubbleSnippet(text), ms);
  }

  activityOf(id: string): ActivityId | null {
    return this.plans.get(id)?.activity ?? null;
  }

  anyCoding(): boolean {
    for (const [, plan] of this.plans) if (plan.activity === 'coding') return true;
    return false;
  }

  /** Debug dump: what every agent is doing and when they next act. */
  debugPlans(): Array<{ id: string; activity: string | null; zone: string; slot: number; nextInMs: number; staged: boolean }> {
    const now = Date.now();
    return [...this.plans.entries()].map(([id, plan]) => ({
      id,
      activity: plan.activity,
      zone: plan.zone,
      slot: plan.slot,
      nextInMs: Math.round(plan.nextAt - now),
      staged: occupancy.isStaged(id),
    }));
  }

  describe(): string {
    const bits: string[] = [];
    for (const [id, plan] of this.plans) {
      const entry = ROSTER.find((r) => r.id === id);
      bits.push(`${entry?.name ?? id}: ${plan.activity ?? 'idle'} @ ${plan.zone}`);
    }
    return bits.join(' · ');
  }
}

export const livingSim = new LivingSim();
