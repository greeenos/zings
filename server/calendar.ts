// Reading subscribed calendars (.ics) for display next to the to-dos.
//
// Handles what Google, Apple and Outlook actually publish: all-day and timed
// events, UTC ("Z") and zoned times, DURATION, and the common RRULEs
// (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, BYDAY, COUNT, UNTIL) plus EXDATE.
// ponytail: TZID times are read as local wall-clock time, which is right when
// the calendar and the user share a time zone; add a tz database if they don't.

export interface CalendarEvent {
  title: string;
  /** "YYYY-MM-DD" for all-day events, else "YYYY-MM-DDTHH:MM" local time. */
  start: string;
  end: string;
  allDay: boolean;
  calendar: string;
}

interface Raw {
  summary: string;
  start: Date;
  end: Date;
  allDay: boolean;
  rrule: Record<string, string> | null;
  exdates: Set<string>;
  recurrenceId: string | null;
  uid: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d: Date) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function unfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** "20261025", "20261025T090000", "20261025T090000Z" → local Date. */
function parseIcsDate(value: string): { date: Date; allDay: boolean } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
  if (!m[4]) return { date: new Date(y, mo, d, 0, 0, 0), allDay: true };
  const date = m[7]
    ? new Date(Date.UTC(y, mo, d, +m[4], +m[5], +m[6]))
    : new Date(y, mo, d, +m[4], +m[5], +m[6]);
  return { date, allDay: false };
}

function parseDuration(value: string): number {
  const m = value.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [w, d, h, min, s] = m.slice(1).map((x) => +(x ?? 0));
  return ((((w * 7 + d) * 24 + h) * 60 + min) * 60 + s) * 1000;
}

function parseEvents(text: string): Raw[] {
  const events: Raw[] = [];
  let cur: Partial<Raw> & { duration?: number } | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = { exdates: new Set(), rrule: null, recurrenceId: null, uid: "", summary: "" };
      continue;
    }
    if (!cur) continue;
    if (line === "END:VEVENT") {
      if (cur.start) {
        const end = cur.end ?? new Date(cur.start.getTime() + (cur.duration ?? (cur.allDay ? 86_400_000 : 0)));
        events.push({ ...(cur as Raw), end });
      }
      cur = null;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(";");
    const value = line.slice(colon + 1);
    if (name === "SUMMARY") cur.summary = unescape(value);
    else if (name === "UID") cur.uid = value;
    else if (name === "DTSTART") {
      const parsed = parseIcsDate(value);
      if (parsed) [cur.start, cur.allDay] = [parsed.date, parsed.allDay || params.includes("VALUE=DATE")];
    } else if (name === "DTEND") cur.end = parseIcsDate(value)?.date;
    else if (name === "DURATION") cur.duration = parseDuration(value);
    else if (name === "RRULE") cur.rrule = Object.fromEntries(value.split(";").map((p) => p.split("=") as [string, string]));
    else if (name === "EXDATE") {
      for (const v of value.split(",")) {
        const d = parseIcsDate(v);
        if (d) cur.exdates!.add(stamp(d.date));
      }
    } else if (name === "RECURRENCE-ID") {
      const d = parseIcsDate(value);
      if (d) cur.recurrenceId = stamp(d.date);
    }
  }
  return events;
}

/** Every start of a recurring event that falls before `until`. */
function* occurrences(ev: Raw, until: Date): Generator<Date> {
  const rule = ev.rrule;
  if (!rule) {
    yield ev.start;
    return;
  }
  const interval = Math.max(1, +(rule.INTERVAL ?? 1));
  const count = rule.COUNT ? +rule.COUNT : Infinity;
  const last = rule.UNTIL ? parseIcsDate(rule.UNTIL)?.date ?? until : until;
  const byDay = rule.BYDAY?.split(",").map((d) => d.slice(-2)) ?? null;
  let emitted = 0;
  const step = (d: Date, n: number) => {
    const next = new Date(d);
    if (rule.FREQ === "DAILY") next.setDate(next.getDate() + n);
    else if (rule.FREQ === "WEEKLY") next.setDate(next.getDate() + 7 * n);
    else if (rule.FREQ === "MONTHLY") next.setMonth(next.getMonth() + n);
    else if (rule.FREQ === "YEARLY") next.setFullYear(next.getFullYear() + n);
    else next.setFullYear(9999);
    return next;
  };
  for (let base = new Date(ev.start), guard = 0; base <= last && base <= until && emitted < count && guard < 5000; base = step(base, interval), guard++) {
    if (rule.FREQ === "WEEKLY" && byDay) {
      // Every listed weekday of the (Monday-started) week `base` falls in.
      const monday = new Date(base);
      monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
      for (let i = 0; i < 7 && emitted < count; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        if (!byDay.includes(DAY_CODES[d.getDay()]) || d < ev.start || d > last) continue;
        emitted++;
        yield d;
      }
    } else {
      emitted++;
      yield base;
    }
  }
}

/** Events touching [from, to] (inclusive "YYYY-MM-DD" keys), sorted by start. */
export function eventsBetween(ics: string, calendar: string, from: string, to: string): CalendarEvent[] {
  const raw = parseEvents(ics);
  // Moved / edited single instances replace their slot in the series.
  const overrides = new Set(raw.filter((e) => e.recurrenceId).map((e) => `${e.uid}|${e.recurrenceId}`));
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const rangeStart = new Date(fy, fm - 1, fd);
  const rangeEnd = new Date(ty, tm - 1, td, 23, 59, 59);
  const out: CalendarEvent[] = [];
  for (const ev of raw) {
    const length = ev.end.getTime() - ev.start.getTime();
    for (const start of occurrences(ev, rangeEnd)) {
      const key = stamp(start);
      if (ev.exdates.has(key) || (!ev.recurrenceId && overrides.has(`${ev.uid}|${key}`))) continue;
      const end = new Date(start.getTime() + length);
      if (end < rangeStart || start > rangeEnd || (ev.allDay && end.getTime() === rangeStart.getTime())) continue;
      out.push({
        title: ev.summary || "(busy)",
        start: ev.allDay ? dayKey(start) : stamp(start),
        // All-day DTEND is exclusive; show the last day it covers.
        end: ev.allDay ? dayKey(new Date(end.getTime() - 1)) : stamp(end),
        allDay: ev.allDay,
        calendar,
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
