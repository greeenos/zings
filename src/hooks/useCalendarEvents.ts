import { useEffect, useState } from 'react';
import { pb } from '@/lib/db';

export interface CalendarEvent {
  title: string;
  /** "YYYY-MM-DD" for all-day events, else "YYYY-MM-DDTHH:MM". */
  start: string;
  end: string;
  allDay: boolean;
  calendar: string;
}

/**
 * Events from the calendars subscribed in Account → Your calendars, for the
 * inclusive day range [from, to]. The server caches each feed for 15 minutes.
 */
export function useCalendarEvents(from: string, to: string): CalendarEvent[] {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener('zings:calendars', bump);
    const timer = setInterval(bump, 15 * 60 * 1000);
    return () => {
      window.removeEventListener('zings:calendars', bump);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const calendars = pb.authStore.record?.calendars;
    if (!Array.isArray(calendars) || calendars.length === 0) {
      // The cached record may predate the first subscription; one refresh settles it.
      if (version === 0) {
        setEvents([]);
        return;
      }
    }
    let alive = true;
    pb.send<{ items: CalendarEvent[] }>(`/api/calendar/events?from=${from}&to=${to}`, {})
      .then((res) => alive && setEvents(res.items))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [from, to, version]);

  return events;
}

/** The events that touch `day`. */
export const eventsOn = (events: CalendarEvent[], day: string) =>
  events.filter((e) => e.start.slice(0, 10) <= day && e.end.slice(0, 10) >= day);
