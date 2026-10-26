/**
 * Natural-language scheduling at the end of a task title, in English and Czech:
 *
 *   "Call mom tomorrow at 5pm"        → dueDate + dueTime
 *   "Zaplatit nájem každý měsíc"      → repeatRule
 *   "Team sync every 3rd tuesday"     → repeatRule (monthly, nth weekday)
 *   "Report by friday" / "do pátku"   → deadline
 *   "Call Petr tonight" / "dnes večer" → today + This Evening
 *
 * Only trailing phrases are read, word by word from the end, so a title like
 * "Read Tomorrow and Tomorrow" loses at most its last word and "Plan every
 * day of the trip" is left alone. A phrase that would empty the title is kept.
 */

import { addLocalDaysKey, localDateKey } from "@/lib/date";
import { nextOccurrence } from "@/lib/repeat";
import type { RepeatRule } from "@/types/todo";

interface NaturalResult {
  cleaned: string;
  dueDate?: string;
  dueTime?: string;
  deadline?: string;
  evening?: boolean;
  repeatRule?: RepeatRule;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pad = (n: number) => String(n).padStart(2, "0");

// Every inflection a weekday takes after "on / v / do / každý" (0 = Sunday).
const WEEKDAY_WORDS: Array<[number, string[]]> = [
  [0, ["sun", "sunday", "sundays", "ne", "nedele", "nedeli"]],
  [1, ["mon", "monday", "mondays", "po", "pondeli", "pondelky"]],
  [2, ["tue", "tues", "tuesday", "tuesdays", "ut", "utery", "uterky"]],
  [3, ["wed", "wednesday", "wednesdays", "st", "streda", "stredu", "stredy"]],
  [4, ["thu", "thur", "thurs", "thursday", "thursdays", "ct", "ctvrtek", "ctvrtka", "ctvrtky"]],
  [5, ["fri", "friday", "fridays", "pa", "patek", "patku", "patky"]],
  [6, ["sat", "saturday", "saturdays", "so", "sobota", "sobotu", "soboty"]],
];
const WEEKDAY = new Map(WEEKDAY_WORDS.flatMap(([d, words]) => words.map((w) => [w, d] as const)));

const ORDINAL: Record<string, number> = {
  "1st": 1, first: 1, "1.": 1, prvni: 1,
  "2nd": 2, second: 2, "2.": 2, druhy: 2, druhe: 2, druhou: 2,
  "3rd": 3, third: 3, "3.": 3, treti: 3,
  "4th": 4, fourth: 4, "4.": 4, ctvrty: 4, ctvrte: 4, ctvrtou: 4,
  last: -1, posledni: -1,
};

const EVERY = /^(every|each|kazdy|kazde|kazdou|kazdych|kazdej)$/;
const UNIT: Array<[RegExp, RepeatRule["freq"]]> = [
  [/^(day|days|den|dny|dni|dnu)$/, "day"],
  [/^(week|weeks|tyden|tydny|tydnu|tydne)$/, "week"],
  [/^(month|months|mesic|mesice|mesicu)$/, "month"],
  [/^(year|years|rok|roky|let|roku)$/, "year"],
];
const unitOf = (w: string) => UNIT.find(([re]) => re.test(w))?.[1];

/** The next `dow` strictly after today (today's own weekday → a week out). */
function nextWeekday(now: Date, dow: number): string {
  return addLocalDaysKey(now, ((dow - now.getDay() + 7) % 7) || 7);
}

function addMonthsKey(now: Date, months: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() + months, 1, 12);
  d.setDate(Math.min(now.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return localDateKey(d);
}

/** A date phrase ("tomorrow", "next friday", "za 3 dny", "15.7."), or null. */
function parseDate(words: string[], now: Date): string | null {
  const prefixed = /^(on|v|ve|next|pristi|this|tento|tuto|dne)$/.test(words[0] ?? "");
  const s = words.filter((x) => !/^(on|v|ve|this|tento|tuto|toto|dne)$/.test(x)).join(" ");
  if (/^(today|dnes|dneska)$/.test(s)) return localDateKey(now);
  if (/^(tomorrow|tmr|zitra|zejtra)$/.test(s)) return addLocalDaysKey(now, 1);
  if (/^(pozitri|pozejtri|day after tomorrow)$/.test(s)) return addLocalDaysKey(now, 2);
  if (/^(weekend|vikend|o vikendu)$/.test(s)) return addLocalDaysKey(now, (6 - now.getDay() + 7) % 7);
  if (/^(next week|pristi tyden)$/.test(s)) return nextWeekday(now, 1);
  if (/^(next month|pristi mesic)$/.test(s)) return addMonthsKey(now, 1);

  // "friday", "next friday", "v pátek"; two-letter forms ("po", "ne") are
  // ordinary Czech words, so they only count after "on / v / next".
  const day = s.match(/^(?:next |pristi )?(\S+)$/)?.[1];
  if (day && WEEKDAY.has(day) && (day.length > 2 || prefixed)) return nextWeekday(now, WEEKDAY.get(day)!);

  const rel = s.match(/^(?:in|za) (?:(a|an|\d+) )?(\S+)$/);
  if (rel) {
    const n = rel[1] && /^\d+$/.test(rel[1]) ? +rel[1] : 1;
    const unit = unitOf(rel[2]);
    if (unit === "day") return addLocalDaysKey(now, n);
    if (unit === "week") return addLocalDaysKey(now, 7 * n);
    if (unit === "month") return addMonthsKey(now, n);
  }

  const dm = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/);
  if (dm) {
    const year = dm[3] ? +dm[3] : now.getFullYear();
    const d = new Date(year, +dm[2] - 1, +dm[1], 12);
    if (d.getMonth() !== +dm[2] - 1) return null;
    if (!dm[3] && localDateKey(d) < localDateKey(now)) d.setFullYear(year + 1);
    return localDateKey(d);
  }
  return null;
}

/** "at 5pm", "at 17:30", "v 9", "ve 14:15", "5pm" → "HH:MM". */
function parseTime(words: string[]): string | null {
  const s = words.join(" ");
  const m = s.match(/^(?:(?:at|@|v|ve|kolem|around) )?(\d{1,2})(?::(\d{2}))?\s?(am|pm)?$/);
  if (!m) return null;
  // A bare number with no "at" or am/pm is just a number in the title.
  if (words.length === 1 && !m[3]) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}

/** "every day", "každé 2 týdny", "every mon and thu", "every 3rd tue", "monthly". */
function parseRepeat(words: string[]): RepeatRule | null {
  const s = words.join(" ");
  const base = { interval: 1, from: "schedule" as const };
  if (/^(daily|denne)$/.test(s)) return { ...base, freq: "day" };
  if (/^(weekly|tydne)$/.test(s)) return { ...base, freq: "week" };
  if (/^(monthly|mesicne)$/.test(s)) return { ...base, freq: "month" };
  if (/^(yearly|annually|rocne)$/.test(s)) return { ...base, freq: "year" };
  if (!EVERY.test(words[0] ?? "")) return null;
  const rest = words.slice(1);
  if (rest.length === 0) return null;

  if (/^(weekday|weekdays|workday|pracovni den)$/.test(rest.join(" "))) {
    return { ...base, freq: "week", weekdays: [1, 2, 3, 4, 5] };
  }

  // every [N | other] <unit>
  let interval = 1;
  let i = 0;
  if (/^\d+$/.test(rest[0]) && rest.length === 2) [interval, i] = [+rest[0], 1];
  else if (/^(other|druhy|druhe|druhou)$/.test(rest[0]) && rest.length === 2 && unitOf(rest[1])) [interval, i] = [2, 1];
  const unit = rest.length === i + 1 ? unitOf(rest[i]) : undefined;
  if (unit) return { ...base, interval: Math.max(1, interval), freq: unit };

  // every 3rd tuesday / každé poslední pondělí
  if (rest.length === 2 && rest[0] in ORDINAL && WEEKDAY.has(rest[1])) {
    return { ...base, freq: "month", weekdays: [WEEKDAY.get(rest[1])!], monthWeek: ORDINAL[rest[0]] };
  }

  // every mon and thu / každé pondělí, středu a pátek
  const days = rest.filter((x) => !/^(and|a|,|&)$/.test(x)).map((x) => WEEKDAY.get(x.replace(/,$/, "")));
  if (days.length && days.every((d) => d !== undefined)) {
    return { ...base, freq: "week", weekdays: [...new Set(days as number[])].sort((a, b) => a - b) };
  }
  return null;
}

/** First instance of a repeat that starts now: today when the rule allows it. */
function firstDue(rule: RepeatRule, now: Date): string {
  const today = localDateKey(now);
  if (!rule.weekdays?.length) return today;
  return nextOccurrence(rule, addLocalDaysKey(now, -1));
}

const DEADLINE = /^(by|due|deadline|do|termin|until)$/;
const EVENING = /^(tonight|this evening|dnes vecer|vecer|evening)$/;
const MAX_PHRASE = 6;

export function parseNatural(title: string, now: Date = new Date()): NaturalResult {
  const words = title.split(/\s+/).filter(Boolean);
  const out: NaturalResult = { cleaned: title };
  let progress = true;

  while (progress) {
    progress = false;
    // Longest phrase first, and never consume the whole title.
    for (let k = Math.min(MAX_PHRASE, words.length - 1); k >= 1; k--) {
      const tail = words.slice(-k).map(norm);
      const s = tail.join(" ");

      if (!out.repeatRule) {
        const rule = parseRepeat(tail);
        if (rule) {
          out.repeatRule = rule;
          words.splice(-k);
          progress = true;
          break;
        }
      }
      if (!out.evening && EVENING.test(s)) {
        out.evening = true;
        out.dueDate ??= localDateKey(now);
        words.splice(-k);
        progress = true;
        break;
      }
      if (!out.dueTime) {
        const time = parseTime(tail);
        if (time) {
          out.dueTime = time;
          words.splice(-k);
          progress = true;
          break;
        }
      }
      if (DEADLINE.test(tail[0]) && tail.length > 1 && !out.deadline) {
        const date = parseDate(tail.slice(1), now);
        if (date) {
          out.deadline = date;
          words.splice(-k);
          progress = true;
          break;
        }
      }
      if (!out.dueDate && !DEADLINE.test(tail[0])) {
        const date = parseDate(tail, now);
        if (date) {
          out.dueDate = date;
          words.splice(-k);
          progress = true;
          break;
        }
      }
    }
  }

  if (out.repeatRule && !out.dueDate) out.dueDate = firstDue(out.repeatRule, now);
  // A time with no day means today, like the "HH:MM" token.
  if (out.dueTime && !out.dueDate) out.dueDate = localDateKey(now);
  // "Friday at 9" scheduled past its own deadline makes no sense; keep both as typed otherwise.
  if (out.deadline && out.dueDate && out.dueDate > out.deadline) out.dueDate = out.deadline;
  out.cleaned = words.join(" ");
  return out;
}
