/**
 * Inline scheduling tokens for the quick-add / edit inputs.
 *
 * Three sigils, all optional and combinable in any order inside a task title:
 *   #<date>      → dueDate  (e.g. #zítra, #po, #15.7., #2026-08-01, #3d, #2t)
 *   HH:MM[-HH:MM]→ dueTime  (exact start, optional end → derives estimateMin)
 *   !<time|dur>  → a clock time / range (!20:00, !20:00-20:30) sets dueTime
 *                  (a range also derives estimateMin); otherwise a loose
 *                  duration (!30m, !1h, !1h30m, !90) sets estimateMin
 *   ! / !! / !!! → priority low / medium / high
 *
 * After the sigils, plain phrases at the end of the title are read too
 * ("tomorrow at 5pm", "každý pátek", "by friday") — see natural.ts.
 *
 * Keywords are accepted in Czech and English; diacritics are ignored so
 * "zítra" and "zitra" both work. Only tokens we recognise are stripped from
 * the title — an unrecognised "#tag" or a stray "!" is left untouched.
 */

import { addLocalDaysKey, fmt, keyToDate, localDateKey } from "@/lib/date";
import { daysBetween } from "@/lib/repeat";
import { parseNatural } from "@/lib/natural";
import type { RepeatRule } from "@/types/todo";

interface ParsedSchedule {
  /** Title with all recognised schedule tokens removed and whitespace collapsed. */
  cleaned: string;
  dueDate?: string; // "YYYY-MM-DD" in the user's local calendar
  dueTime?: string; // "HH:MM" 24h
  estimateMin?: number; // estimated duration in minutes
  priority?: number; // 1 low … 3 high
  deadline?: string;
  evening?: boolean;
  repeatRule?: RepeatRule;
}

const pad = (n: number) => String(n).padStart(2, "0");

function addDaysIso(now: Date, days: number): string {
  return addLocalDaysKey(now, days);
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// day-of-week: 0 = Sunday … 6 = Saturday
const WEEKDAYS: Record<string, number> = {
  ne: 0, nedele: 0, sun: 0, sunday: 0,
  po: 1, pondeli: 1, mon: 1, monday: 1,
  ut: 2, utery: 2, tue: 2, tuesday: 2,
  st: 3, streda: 3, wed: 3, wednesday: 3,
  ct: 4, ctvrtek: 4, thu: 4, thursday: 4,
  pa: 5, patek: 5, fri: 5, friday: 5,
  so: 6, sobota: 6, sat: 6, saturday: 6,
};

/** Next occurrence of `dow` strictly after today (today's weekday → +7). */
function nextWeekdayIso(now: Date, dow: number): string {
  const cur = now.getDay();
  const delta = ((dow - cur + 7) % 7) || 7;
  return addDaysIso(now, delta);
}

/** Validate y/m/d (m is 1-based) and return ISO, or null if it isn't a real date. */
function buildIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d, 12);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Parse the text after a leading `#`. Returns an ISO date or null. */
function parseDateSpec(specRaw: string, now: Date): string | null {
  const spec = specRaw.replace(/[,;]+$/, "");
  const key = stripDiacritics(spec.toLowerCase());

  if (key === "dnes" || key === "dneska" || key === "today") return localDateKey(now);
  if (key === "zitra" || key === "zejtra" || key === "tomorrow" || key === "tmr") return addDaysIso(now, 1);
  if (key === "pozitri" || key === "pozejtri") return addDaysIso(now, 2);

  if (key in WEEKDAYS) return nextWeekdayIso(now, WEEKDAYS[key]);

  // ISO yyyy-mm-dd
  const iso = spec.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return buildIso(+iso[1], +iso[2], +iso[3]);

  // Czech numeric d.m. / d.m / d.m.yyyy / d.m.yy
  const dm = spec.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/);
  if (dm) {
    const day = +dm[1];
    const month = +dm[2];
    let year: number;
    if (dm[3]) {
      year = dm[3].length <= 2 ? 2000 + +dm[3] : +dm[3];
      return buildIso(year, month, day);
    }
    // No year: assume this year, roll to next year if the date already passed.
    year = now.getFullYear();
    const candidate = buildIso(year, month, day);
    if (!candidate) return null;
    return candidate < localDateKey(now) ? buildIso(year + 1, month, day) : candidate;
  }

  // Relative: Nd (days), Nt / Nw (weeks)
  const rel = key.match(/^(\d+)(d|dny|dni|t|tyden|tydny|tydnu|w)$/);
  if (rel) {
    const n = +rel[1];
    const days = /^(t|tyden|tydny|tydnu|w)$/.test(rel[2]) ? n * 7 : n;
    return addDaysIso(now, days);
  }

  return null;
}

/** Parse the text after a leading `!` into minutes, or null. */
export function parseDuration(specRaw: string): number | null {
  const s = specRaw.toLowerCase().replace(/\s+/g, "");
  let total = 0;
  let matched = false;
  const h = s.match(/(\d+)h/);
  if (h) {
    total += +h[1] * 60;
    matched = true;
  }
  const m = s.match(/(\d+)(?:m|min|minut|minuty)\b/);
  if (m) {
    total += +m[1];
    matched = true;
  }
  if (!matched) {
    const bare = s.match(/^(\d+)$/); // bare number → minutes
    if (bare) {
      total = +bare[1];
      matched = true;
    }
  }
  return matched && total > 0 ? total : null;
}

/** Parse an "HH:MM" or "HH:MM-HH:MM" token. */
function parseTime(tok: string): { dueTime: string; estimateMin?: number } | null {
  const m = tok.match(/^(\d{1,2}):(\d{2})(?:[-–—](\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return null;
  const dueTime = `${pad(h)}:${pad(min)}`;
  if (m[3] !== undefined) {
    const eh = +m[3];
    const emin = +m[4];
    if (eh <= 23 && emin <= 59) {
      const span = eh * 60 + emin - (h * 60 + min);
      if (span > 0) return { dueTime, estimateMin: span };
    }
  }
  return { dueTime };
}

const TOKEN_RE = /(^|\s)(#\S+|!\S*|\d{1,2}:\d{2}(?:[-–—]\d{1,2}:\d{2})?)/g;

export function parseScheduleTokens(raw: string, now: Date = new Date()): ParsedSchedule {
  let dueDate: string | undefined;
  let dueTime: string | undefined;
  let estimateMin: number | undefined;
  let priority: number | undefined;
  const consumed: Array<[number, number]> = [];

  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(raw)) !== null) {
    const tok = m[2];
    const start = m.index + m[1].length;
    const end = start + tok.length;

    if (tok[0] === "#") {
      const d = parseDateSpec(tok.slice(1), now);
      if (d) {
        dueDate = d;
        consumed.push([start, end]);
      }
    } else if (/^!{1,3}$/.test(tok)) {
      priority = tok.length;
      consumed.push([start, end]);
    } else if (tok[0] === "!") {
      const rest = tok.slice(1);
      // `!` accepts either a clock time / range (!20:00, !20:00-20:30) or a
      // loose duration (!30m). A colon means it's a time.
      const t = parseTime(rest);
      if (t) {
        dueTime = t.dueTime;
        if (t.estimateMin != null) estimateMin = t.estimateMin;
        consumed.push([start, end]);
      } else {
        const mins = parseDuration(rest);
        if (mins != null) {
          estimateMin = mins;
          consumed.push([start, end]);
        }
      }
    } else {
      const t = parseTime(tok);
      if (t) {
        dueTime = t.dueTime;
        if (t.estimateMin != null) estimateMin = t.estimateMin;
        consumed.push([start, end]);
      }
    }
  }

  let cleaned = raw;
  for (let i = consumed.length - 1; i >= 0; i--) {
    const [s, e] = consumed[i];
    cleaned = cleaned.slice(0, s).replace(/\s+$/, " ") + cleaned.slice(e);
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  const natural = parseNatural(cleaned, now);
  cleaned = natural.cleaned;
  dueTime ??= natural.dueTime;
  // A bare clock time with no explicit date means "today at HH:MM".
  dueDate ??= natural.dueDate ?? (dueTime ? localDateKey(now) : undefined);

  return {
    cleaned, dueDate, dueTime, estimateMin, priority,
    deadline: natural.deadline, evening: natural.evening, repeatRule: natural.repeatRule,
  };
}

interface DeadlineLabel {
  label: string;
  /** Due today or already past — render in the Today red.  */
  urgent: boolean;
  overdue: boolean;
}

/**
 * How a deadline reads on a task row. Deadlines are about pressure, not
 * scheduling, so near ones are phrased as a countdown ("3 days left") and only
 * distant ones fall back to a calendar date.
 */
export function describeDeadline(deadline: string, todayKey: string): DeadlineLabel {
  const days = daysBetween(todayKey, deadline);
  if (days < 0) {
    const n = Math.abs(days);
    return {
      label: n === 1 ? "1 day overdue" : `${n} days overdue`,
      urgent: true,
      overdue: true,
    };
  }
  if (days === 0) return { label: "Due today", urgent: true, overdue: false };
  if (days === 1) return { label: "Due tomorrow", urgent: true, overdue: false };
  if (days <= 7) return { label: `${days} days left`, urgent: false, overdue: false };
  return { label: `Due ${fmt(keyToDate(deadline), { month: "short", day: "numeric" })}`, urgent: false, overdue: false };
}

/** "30m", "1h", "1h30m" — compact human duration for display. */
export function formatEstimate(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
  return `${m}m`;
}

/** Add minutes to an "HH:MM" clock string, wrapping within a day. */
export function addToClock(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const tot = (((h * 60 + m + min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(tot / 60))}:${pad(tot % 60)}`;
}

/**
 * Human-readable clock part for a todo: "14:00", "14:00–14:30", or null.
 * The end is derived from `estimateMin` when both are present.
 */
export function formatTimeRange(dueTime?: string, estimateMin?: number | null): string | null {
  if (!dueTime) return null;
  if (estimateMin != null) return `${dueTime}–${addToClock(dueTime, estimateMin)}`;
  return dueTime;
}
