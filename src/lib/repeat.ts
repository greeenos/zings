/**
 * Repeating to-dos.
 *
 * A rule says how far to jump, not when the next instance exists — the next
 * occurrence is materialised only when you tick the current one off, so the
 * lists never fill up with phantom future rows.
 *
 * Two anchoring modes, both of which people expect from different tasks:
 *   • "schedule"   — advance from the planned date. "Team sync every Monday"
 *                    stays on Monday even if you tick it on Wednesday.
 *   • "completion" — advance from the day you actually finished. "Water the
 *                    plants every 3 days" restarts when you water them.
 */

import { ChecklistItem, RepeatRule, Todo } from "@/types/todo";
import { keyToDate, localDateKey } from "@/lib/date";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDINALS = ["1st", "2nd", "3rd", "4th"];

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Add months keeping the day-of-month, clamped to the target month's length (Jan 31 → Feb 28). */
function addMonthsClamped(d: Date, months: number): Date {
  const day = d.getDate();
  const anchor = new Date(d.getFullYear(), d.getMonth() + months, 1, 12, 0, 0, 0);
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  anchor.setDate(Math.min(day, lastDay));
  return anchor;
}

/** Monday-anchored start of the week containing `d`. */
function weekStart(d: Date): Date {
  const out = new Date(d);
  const shift = (out.getDay() + 6) % 7; // Mon → 0 … Sun → 6
  out.setDate(out.getDate() - shift);
  out.setHours(12, 0, 0, 0);
  return out;
}

function wholeWeeksBetween(a: Date, b: Date): number {
  const ms = weekStart(b).getTime() - weekStart(a).getTime();
  return Math.round(ms / (7 * 24 * 60 * 60 * 1000));
}

export function normalizeRepeat(rule: RepeatRule): RepeatRule {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  if (rule.freq === "week") {
    const weekdays = (rule.weekdays ?? [])
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    return { ...rule, interval, weekdays: weekdays.length ? weekdays : undefined };
  }
  const { weekdays, monthWeek, ...rest } = rule;
  const day = weekdays?.[0];
  if (rule.freq === "month" && monthWeek && Number.isInteger(day) && day! >= 0 && day! <= 6) {
    return { ...rest, interval, weekdays: [day!], monthWeek: monthWeek < 0 ? -1 : Math.min(4, Math.max(1, monthWeek)) };
  }
  return { ...rest, interval };
}

/** The `nth` (1–4, -1 = last) `dow` of the month containing `d`. */
function nthWeekdayOfMonth(year: number, month: number, dow: number, nth: number): Date {
  if (nth < 0) {
    const last = new Date(year, month + 1, 0, 12);
    last.setDate(last.getDate() - ((last.getDay() - dow + 7) % 7));
    return last;
  }
  const first = new Date(year, month, 1, 12);
  first.setDate(1 + ((dow - first.getDay() + 7) % 7) + 7 * (nth - 1));
  return first;
}

/**
 * The first date strictly after `fromKey` that satisfies `rule`.
 * Both input and output are local calendar keys ("YYYY-MM-DD").
 */
export function nextOccurrence(ruleRaw: RepeatRule, fromKey: string): string {
  const rule = normalizeRepeat(ruleRaw);
  const from = keyToDate(fromKey);

  switch (rule.freq) {
    case "day":
      return localDateKey(addDays(from, rule.interval));

    case "week": {
      if (!rule.weekdays || rule.weekdays.length === 0) {
        return localDateKey(addDays(from, 7 * rule.interval));
      }
      const allowed = new Set(rule.weekdays);
      // Walk forward day by day. With interval > 1 only every Nth week counts,
      // measured from the week the current instance sits in.
      const horizon = 7 * rule.interval + 7;
      for (let i = 1; i <= horizon; i++) {
        const candidate = addDays(from, i);
        if (!allowed.has(candidate.getDay())) continue;
        if (rule.interval > 1 && wholeWeeksBetween(from, candidate) % rule.interval !== 0) continue;
        return localDateKey(candidate);
      }
      // Unreachable for valid rules; keep the task moving rather than stalling.
      return localDateKey(addDays(from, 7 * rule.interval));
    }

    case "month": {
      if (rule.monthWeek && rule.weekdays) {
        // This month's 3rd Tuesday may still be ahead; otherwise jump N months.
        const [dow, nth] = [rule.weekdays[0], rule.monthWeek];
        const same = nthWeekdayOfMonth(from.getFullYear(), from.getMonth(), dow, nth);
        if (same > from) return localDateKey(same);
        return localDateKey(nthWeekdayOfMonth(from.getFullYear(), from.getMonth() + rule.interval, dow, nth));
      }
      return localDateKey(addMonthsClamped(from, rule.interval));
    }

    case "year":
      return localDateKey(addMonthsClamped(from, 12 * rule.interval));
  }
}

/**
 * Where the next instance of a repeating to-do lands when it is ticked off.
 *
 * `scheduledKey` is the instance's own dueDate (may be absent for a task that
 * was only ever repeating "after completion"); `completedKey` is today.
 */
export function nextDueAfterCompletion(
  rule: RepeatRule,
  scheduledKey: string | null | undefined,
  completedKey: string,
): string {
  if (rule.from === "completion" || !scheduledKey) {
    return nextOccurrence(rule, completedKey);
  }
  // Ticked late? Keep advancing until the next instance is in the future, so a
  // daily task doesn't reappear five times after a week away.
  let next = nextOccurrence(rule, scheduledKey);
  let guard = 0;
  while (next <= completedKey && guard < 400) {
    next = nextOccurrence(rule, next);
    guard += 1;
  }
  return next;
}

/** Shift a calendar key by whole days. */
export function addDaysKey(key: string, days: number): string {
  return localDateKey(addDays(keyToDate(key), days));
}

/** Whole days from `a` to `b` (negative if `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  const ms = keyToDate(b).getTime() - keyToDate(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

interface NextInstance {
  dueDate: string;
  deadline: string | null;
  list: "today" | "anytime";
  checklist: ChecklistItem[];
}

/**
 * The fields a fresh copy of a repeating to-do should carry once the current
 * one is ticked off. Returns null when the to-do doesn't repeat.
 *
 * A deadline travels with the task: it keeps the same lead time relative to
 * the scheduled day, so "do it Monday, due Friday" stays a four-day cushion.
 */
export function nextInstanceFields(
  todo: Pick<Todo, "repeatRule" | "dueDate" | "deadline" | "checklist">,
  todayKey: string,
): NextInstance | null {
  if (!todo.repeatRule) return null;
  const rule = normalizeRepeat(todo.repeatRule);
  const dueDate = nextDueAfterCompletion(rule, todo.dueDate, todayKey);

  let deadline: string | null = null;
  if (todo.deadline) {
    deadline = todo.dueDate
      ? addDaysKey(todo.deadline, daysBetween(todo.dueDate, dueDate))
      : nextDueAfterCompletion(rule, todo.deadline, todayKey);
  }

  return {
    dueDate,
    deadline,
    list: dueDate > todayKey ? "anytime" : "today",
    checklist: (todo.checklist ?? []).map((item) => ({ ...item, done: false })),
  };
}

/**
 * The run length carried into the next instance once this one is ticked off.
 *
 * On time (on or before the planned day, or no planned day at all) extends the
 * run; a late tick means the streak was broken, and today's completion is the
 * first of the new one.
 */
export function nextStreak(
  previous: number | null | undefined,
  scheduledKey: string | null | undefined,
  completedKey: string,
): number {
  const onTime = !scheduledKey || completedKey <= scheduledKey;
  return onTime ? (previous ?? 0) + 1 : 1;
}

export function describeRepeat(ruleRaw: RepeatRule): string {
  const rule = normalizeRepeat(ruleRaw);
  const n = rule.interval;
  let base: string;

  switch (rule.freq) {
    case "day":
      base = n === 1 ? "Every day" : `Every ${n} days`;
      break;
    case "week":
      if (rule.weekdays?.length) {
        const days = rule.weekdays.map((d) => DAY_LABELS[d]).join(", ");
        base = n === 1 ? `Every ${days}` : `Every ${n} weeks on ${days}`;
      } else {
        base = n === 1 ? "Every week" : `Every ${n} weeks`;
      }
      break;
    case "month":
      if (rule.monthWeek && rule.weekdays) {
        const nth = rule.monthWeek < 0 ? "last" : ORDINALS[rule.monthWeek - 1];
        base = `Every ${n === 1 ? "" : `${n} months on the `}${nth} ${DAY_LABELS[rule.weekdays[0]]}`;
      } else {
        base = n === 1 ? "Every month" : `Every ${n} months`;
      }
      break;
    case "year":
      base = n === 1 ? "Every year" : `Every ${n} years`;
      break;
  }

  return rule.from === "completion" ? `${base}, after completion` : base;
}

interface RepeatPreset {
  id: string;
  label: string;
  rule: RepeatRule;
}

/** Weekday set matching the weekday of `key` — used to seed "every week". */
function weekdayOf(key: string): number {
  return keyToDate(key).getDay();
}

export function buildPresets(anchorKey: string): RepeatPreset[] {
  const dow = weekdayOf(anchorKey);
  // "Every 3rd Tue" for the anchor's place in its month; the last one counts as "last".
  const day = keyToDate(anchorKey).getDate();
  const monthWeekRule: RepeatRule = {
    freq: "month", interval: 1, weekdays: [dow], monthWeek: day > 28 ? -1 : Math.ceil(day / 7), from: "schedule",
  };
  return [
    { id: "daily", label: "Every day", rule: { freq: "day", interval: 1, from: "schedule" } },
    {
      id: "weekly",
      label: `Every ${DAY_LABELS[dow]}`,
      rule: { freq: "week", interval: 1, weekdays: [dow], from: "schedule" },
    },
    {
      id: "weekdays",
      label: "Every weekday",
      rule: { freq: "week", interval: 1, weekdays: [1, 2, 3, 4, 5], from: "schedule" },
    },
    {
      id: "fortnightly",
      label: "Every 2 weeks",
      rule: { freq: "week", interval: 2, weekdays: [dow], from: "schedule" },
    },
    { id: "monthly", label: "Every month", rule: { freq: "month", interval: 1, from: "schedule" } },
    {
      id: "monthly-weekday",
      label: describeRepeat(monthWeekRule),
      rule: monthWeekRule,
    },
    { id: "yearly", label: "Every year", rule: { freq: "year", interval: 1, from: "schedule" } },
  ];
}

export const WEEKDAY_LABELS = DAY_LABELS;
