const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Calendar keys in Zings represent the user's local day, not a UTC instant.
 * Keeping this in one helper prevents "Today" from becoming yesterday around
 * midnight in time zones east or west of UTC.
 */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localMonthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function addLocalDaysKey(date: Date, days: number): string {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return localDateKey(next);
}

/** "YYYY-MM-DD" → a local Date pinned to noon, so DST shifts never move the day. */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** English calendar label; `opts` goes straight to Intl.DateTimeFormat. */
export function fmt(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", opts).format(date);
}
