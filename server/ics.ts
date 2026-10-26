// Zings — read-only iCalendar (.ics) feed of the logbook and the plan.
//
// Serves completed, timed todos as VEVENTs so any calendar app (Google, Apple,
// Outlook) can subscribe to a live view of your activity — no OAuth, no Google
// API. Scheduled open to-dos come along too: timed ones as events (their
// estimate, else 30 minutes), dated ones as all-day entries. Because it's a subscribed feed, the calendar app re-fetches on its own
// schedule (Apple is quick; Google can lag several hours).

export interface TodoRow {
  id: string;
  title: string;
  completedAt: string | null;
  lastedMs: number | null;
  projectId: string | null;
  completed?: boolean;
  dueDate?: string | null;
  dueTime?: string | null;
  estimateMin?: number | null;
}

/** "2026-10-26" + "09:30" → floating local "20261026T093000" (shown in the viewer's zone). */
function floating(day: string, time: string, plusMin = 0): string {
  const [y, m, d] = day.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const t = new Date(y, m - 1, d, h, min + plusMin);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}T${p(t.getHours())}${p(t.getMinutes())}00`;
}

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d + 1, 12);
  return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`;
}

export interface ProjectRow {
  id: string;
  name: string;
}

// Fold lines to 75 octets per RFC 5545 (continuation lines start with a space).
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(' ' + rest);
  return chunks.join('\r\n');
}

// Escape TEXT values per RFC 5545 (backslash, semicolon, comma, newline).
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Format an instant as a UTC iCalendar timestamp: 20240131T091500Z.
export function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildCalendar(
  rows: TodoRow[],
  projects: Map<string, ProjectRow>,
  stamp: string,
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zings//Logbook//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'NAME:Zings',
    'X-WR-CALNAME:Zings',
  ];

  for (const row of rows) {
    if (!row.completed && row.dueDate) {
      const project = row.projectId ? projects.get(row.projectId) : undefined;
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:plan-${row.id}@zings`);
      lines.push(`DTSTAMP:${stamp}`);
      if (row.dueTime) {
        lines.push(`DTSTART:${floating(row.dueDate, row.dueTime)}`);
        lines.push(`DTEND:${floating(row.dueDate, row.dueTime, row.estimateMin || 30)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${row.dueDate.replace(/-/g, '')}`);
        lines.push(`DTEND;VALUE=DATE:${nextDay(row.dueDate)}`);
      }
      lines.push(foldLine(`SUMMARY:${escapeText(row.title)}`));
      if (project) lines.push(foldLine(`CATEGORIES:${escapeText(project.name)}`));
      lines.push('TRANSP:TRANSPARENT');
      lines.push('END:VEVENT');
      continue;
    }
    if (!row.completedAt || !row.lastedMs || row.lastedMs <= 0) continue;
    const end = new Date(row.completedAt);
    const start = new Date(end.getTime() - row.lastedMs);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    const project = row.projectId ? projects.get(row.projectId) : undefined;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${row.id}@zings`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${toIcsUtc(start)}`);
    lines.push(`DTEND:${toIcsUtc(end)}`);
    lines.push(foldLine(`SUMMARY:${escapeText(row.title)}`));
    if (project) {
      // Project name → grouped/labelled; visible in the event's details.
      lines.push(foldLine(`CATEGORIES:${escapeText(project.name)}`));
      lines.push(foldLine(`DESCRIPTION:Project: ${escapeText(project.name)}`));
    }
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
