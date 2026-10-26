import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarX2, ChevronLeft, ChevronRight, Hourglass, Moon, Star, Sun } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { fmt, keyToDate, localDateKey } from "@/lib/date";

export interface DateSelection {
  /** The chosen calendar day, or null to clear. */
  date: string | null;
  /** "HH:MM" — only offered in "when" mode. */
  time?: string | null;
  /** Today's second half. */
  evening?: boolean;
  /** The user picked "Someday" rather than a date. */
  someday?: boolean;
}

interface Props {
  /**
   * "when"     — the day you plan to work on it (offers a time and This Evening)
   * "deadline" — the day it must be finished by (a date and nothing else)
   */
  mode: "when" | "deadline";
  value?: string | null;
  time?: string | null;
  evening?: boolean;
  onSelect: (selection: DateSelection) => void;
  /** Called after a pick so the caller can close its popover. */
  onDone?: () => void;
}

const WEEKDAY_HEADS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const sameDay = (a: Date, b: Date) => localDateKey(a) === localDateKey(b);
/** The first of the month `delta` months away from `d`. */
const shiftMonth = (d: Date, delta: number) => new Date(d.getFullYear(), d.getMonth() + delta, 1, 12);

/** Next Saturday (or today if it already is one). */
function comingWeekend(from: Date): Date {
  const out = new Date(from);
  const delta = (6 - out.getDay() + 7) % 7;
  out.setDate(out.getDate() + (delta === 0 ? 0 : delta));
  return out;
}

/** Next Monday, always in the future. */
function nextWeek(from: Date): Date {
  const out = new Date(from);
  const delta = ((1 - out.getDay() + 7) % 7) || 7;
  out.setDate(out.getDate() + delta);
  return out;
}

export function DatePicker({ mode, value, time, evening, onSelect, onDone }: Props) {
  const today = useMemo(() => new Date(), []);
  const selected = value ? keyToDate(value) : null;
  const [cursorMonth, setCursorMonth] = useState<Date>(selected ?? today);
  const [focusDay, setFocusDay] = useState<Date>(selected ?? today);
  const [timeDraft, setTimeDraft] = useState(time ?? "");
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => setTimeDraft(time ?? ""), [time]);

  // Monday-first grid: from the Monday on or before the 1st to the Sunday on or after the last day.
  const days = useMemo(() => {
    const first = shiftMonth(cursorMonth, 0);
    first.setDate(1 - ((first.getDay() + 6) % 7));
    const last = new Date(cursorMonth.getFullYear(), cursorMonth.getMonth() + 1, 0, 12);
    last.setDate(last.getDate() + ((7 - last.getDay()) % 7));
    const out: Date[] = [];
    for (const d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  }, [cursorMonth]);

  const commit = (date: Date | null, extra: Partial<DateSelection> = {}) => {
    onSelect({
      date: date ? localDateKey(date) : null,
      ...(mode === "when" ? { time: timeDraft || null, evening: false } : {}),
      ...extra,
    });
    onDone?.();
  };

  const quick =
    mode === "when"
      ? [
          { id: "today", label: "Today", icon: Star, cls: "text-star", run: () => commit(today) },
          {
            id: "evening",
            label: "This Evening",
            icon: Moon,
            cls: "text-indigo-400",
            run: () => commit(today, { evening: true }),
          },
          {
            id: "tomorrow",
            label: "Tomorrow",
            icon: Sun,
            cls: "text-amber-500",
            run: () => {
              const d = new Date(today);
              d.setDate(d.getDate() + 1);
              commit(d);
            },
          },
          {
            id: "weekend",
            label: "This Weekend",
            icon: Sun,
            cls: "text-teal-500",
            run: () => commit(comingWeekend(today)),
          },
          {
            id: "next-week",
            label: "Next Week",
            icon: ChevronRight,
            cls: "text-primary",
            run: () => commit(nextWeek(today)),
          },
          {
            id: "someday",
            label: "Someday",
            icon: Hourglass,
            cls: "text-muted-foreground",
            run: () => {
              onSelect({ date: null, time: null, evening: false, someday: true });
              onDone?.();
            },
          },
        ]
      : [
          { id: "today", label: "Today", icon: Star, cls: "text-today", run: () => commit(today) },
          {
            id: "tomorrow",
            label: "Tomorrow",
            icon: Sun,
            cls: "text-amber-500",
            run: () => {
              const d = new Date(today);
              d.setDate(d.getDate() + 1);
              commit(d);
            },
          },
          {
            id: "next-week",
            label: "Next Week",
            icon: ChevronRight,
            cls: "text-primary",
            run: () => commit(nextWeek(today)),
          },
        ];

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const step = (n: number) => {
      e.preventDefault();
      const next = new Date(focusDay);
      next.setDate(next.getDate() + n);
      setFocusDay(next);
      if (!sameMonth(next, cursorMonth)) setCursorMonth(next);
    };
    switch (e.key) {
      case "ArrowLeft": return step(-1);
      case "ArrowRight": return step(1);
      case "ArrowUp": return step(-7);
      case "ArrowDown": return step(7);
      case "Enter":
      case " ":
        e.preventDefault();
        commit(focusDay);
        return;
      default:
    }
  };

  return (
    <div className="w-[17.5rem] select-none">
      {/* Quick choices — the ones people actually use most of the time. */}
      <div className="flex flex-col gap-0.5 p-1">
        {quick.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={q.run}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
          >
            <q.icon className={cn("h-4 w-4 shrink-0", q.cls)} />
            <span className="flex-1">{q.label}</span>
          </button>
        ))}
      </div>

      <div className="my-1 h-px bg-border" />

      {/* Month grid */}
      <div className="px-1 pb-1">
        <div className="mb-1 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setCursorMonth((m) => shiftMonth(m, -1))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">{fmt(cursorMonth, { month: "long", year: "numeric" })}</span>
          <button
            type="button"
            onClick={() => setCursorMonth((m) => shiftMonth(m, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 px-1 pb-1">
          {WEEKDAY_HEADS.map((d) => (
            <div
              key={d}
              className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        <div
          ref={gridRef}
          role="grid"
          tabIndex={0}
          onKeyDown={onGridKeyDown}
          className="grid grid-cols-7 gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {days.map((day) => {
            const outside = !sameMonth(day, cursorMonth);
            const isSelected = !!selected && sameDay(day, selected);
            const isFocus = sameDay(day, focusDay);
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => commit(day)}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md text-[13px] tabular-nums transition-colors",
                  outside && "text-muted-foreground/40",
                  !outside && "text-foreground",
                  sameDay(day, today) && !isSelected && "font-bold text-today",
                  isSelected && "bg-primary font-semibold text-primary-foreground",
                  !isSelected && "hover:bg-secondary",
                  isFocus && !isSelected && "ring-1 ring-inset ring-border",
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {mode === "when" && (
        <>
          <div className="my-1 h-px bg-border" />
          <div className="flex items-center gap-2 p-2">
            <label className="flex-1 text-xs font-medium text-muted-foreground" htmlFor="when-time">
              At
            </label>
            <input
              id="when-time"
              type="time"
              value={timeDraft}
              onChange={(e) => setTimeDraft(e.target.value)}
              onBlur={() => {
                // A time only means something with a day attached; default to
                // today so typing 14:00 alone still does the obvious thing.
                if (timeDraft && !value) commit(today);
                else if (value) onSelect({ date: value, time: timeDraft || null, evening });
              }}
              className="w-28 rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </>
      )}

      <div className="my-1 h-px bg-border" />
      <div className="p-1">
        <button
          type="button"
          onClick={() => {
            onSelect({ date: null, time: null, evening: false });
            onDone?.();
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <CalendarX2 className="h-4 w-4 shrink-0" />
          {mode === "when" ? "No date" : "No deadline"}
        </button>
      </div>
    </div>
  );
}
