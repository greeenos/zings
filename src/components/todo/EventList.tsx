import type { CalendarEvent } from "@/hooks/useCalendarEvents";

/** Calendar events above a day's to-dos, quiet like Things shows them. */
export function EventList({ events, day }: { events: CalendarEvent[]; day: string }) {
  if (!events.length) return null;
  return (
    <ul className="mb-4 space-y-1 border-b border-border pb-3" aria-label="Calendar events">
      {events.map((e, i) => (
        <li key={`${e.start}-${i}`} className="flex items-baseline gap-3 px-2 text-sm">
          <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
            {e.allDay || e.start.slice(0, 10) !== day ? "All day" : `${e.start.slice(11)}–${e.end.slice(11)}`}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground/80">{e.title}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{e.calendar}</span>
        </li>
      ))}
    </ul>
  );
}
