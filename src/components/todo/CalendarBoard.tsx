import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "@/lib/icons";
import { motion, AnimatePresence, LayoutGroup } from "@/lib/motion";
import { CalendarTab, Project, Todo } from "@/types/todo";
import { TodoList } from "@/components/todo/TodoList";
import { EventList } from "@/components/todo/EventList";
import { eventsOn, useCalendarEvents } from "@/hooks/useCalendarEvents";
import { buildProjectLookup } from "@/lib/projects";
import { fmt, keyToDate, localDateKey, localMonthKey } from "@/lib/date";
import { projectTotalsMs } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Which slice of tracked time the breakdown under the grid adds up. */
type Scope = "day" | "month" | "lifetime";

interface Props {
  todos: Todo[];
  projects: Project[];
  tab: CalendarTab;
  onTabChange: (tab: CalendarTab) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Todo>) => void;
  onDelete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onCreateProject: (name: string) => Promise<Project | null>;
  onQuickAdd: (dateIso: string) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Days of month `ym` ("YYYY-MM") as stable "YYYY-MM-DD" calendar keys. The
 * values contain no time zone, matching `dueDate` throughout the app.
 */
function daysInMonth(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${ym}-${pad(i + 1)}`);
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Keep the same day-of-month (clamped) when the visible month changes, so the
 * panel below the grid never silently shows a day outside it. */
function remapDayToMonth(iso: string, ym: string): string {
  const day = Number(iso.slice(8, 10));
  const count = daysInMonth(ym).length;
  return `${ym}-${pad(Math.min(day, count))}`;
}

// Monday-first column for a "YYYY-MM-DD" string's weekday.
function colIndex(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

// A day cell's item lines: 18px rows (16px text, 1px padding each side) with a
// 2px gap, under a 24px date badge and the cell's 4px gap. Up to three items
// and a "+N more" line.
const LINE_PX = 18;
const LINE_GAP_PX = 2;
const CELL_HEAD_PX = 24 + 4;
const MAX_CELL_LINES = 4;

/**
 * How many item lines fit in a day cell. From `lg` up the month grid shares the
 * panel's height, so a short window gives short rows; a fixed three items
 * would then be cut off mid-line. Narrower layouts size cells to their content.
 */
function useCellLines(weeks: number) {
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const [lines, setLines] = useState(MAX_CELL_LINES);
  useEffect(() => {
    if (!grid || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const cell = grid.firstElementChild as HTMLElement | null;
      if (!cell || !matchMedia("(min-width: 1024px)").matches) return setLines(MAX_CELL_LINES);
      const style = getComputedStyle(cell);
      const room = cell.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - CELL_HEAD_PX;
      setLines(Math.max(1, Math.min(MAX_CELL_LINES, Math.floor((room + LINE_GAP_PX) / (LINE_PX + LINE_GAP_PX)))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [grid, weeks]);
  return [setGrid, lines] as const;
}

/** Local midnight opening a calendar day. */
function startOfDayMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Local midnight closing it — day + 1 rather than +24h, so the hour a clock
 * change adds or removes still lands inside the right day. */
function endOfDayMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d + 1).getTime();
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Calendar: one month grid, two readings of it. "Schedule" plots what is
 * planned and opens the day's agenda; "Activity" shades the same cells by
 * tracked time and breaks it down per project. Month, selected day and grid
 * are shared, so switching tabs keeps your place.
 */
export default function CalendarBoard({
  todos,
  projects,
  tab,
  onTabChange,
  onToggle,
  onUpdate,
  onDelete,
  onStart,
  onStop,
  onCreateProject,
  onQuickAdd,
}: Props) {
  const [cursorMonth, setCursorMonth] = useState(localMonthKey);
  const [selectedDay, setSelectedDay] = useState(localDateKey);
  const [scope, setScope] = useState<Scope>("month");

  const isActivity = tab === "activity";
  const monthDays = daysInMonth(cursorMonth);
  const events = useCalendarEvents(monthDays[0], monthDays[monthDays.length - 1]);
  const projectMeta = useMemo(() => buildProjectLookup(projects), [projects]);
  const projectColor = (id: string | null) => projectMeta(id).color;

  // Bucket every dued todo by day; incomplete-first, then by time of day.
  const byDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const t of todos) {
      if (!t.dueDate) continue;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const at = a.dueTime ?? "24:00";
        const bt = b.dueTime ?? "24:00";
        return at < bt ? -1 : at > bt ? 1 : 0;
      });
    }
    return map;
  }, [todos]);

  // Tracked time per day of the visible month. Walking every to-do once per day
  // is the costly part of this view, so the Schedule tab never pays for it.
  const { timeByDate, activeDays, topDayMs } = useMemo(() => {
    const map = new Map<string, { ms: number; totals: Map<string | null, number> }>();
    if (!isActivity) return { timeByDate: map, activeDays: 0, topDayMs: 0 };

    const nowMs = Date.now();
    let active = 0;
    let top = 0;
    for (const iso of daysInMonth(cursorMonth)) {
      const totals = projectTotalsMs(todos, startOfDayMs(iso), endOfDayMs(iso), nowMs);
      let ms = 0;
      for (const v of totals.values()) ms += v;
      if (ms > 0) active += 1;
      if (ms > top) top = ms;
      map.set(iso, { ms, totals });
    }
    return { timeByDate: map, activeDays: active, topDayMs: top };
  }, [todos, cursorMonth, isActivity]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (scope === "day") {
      return { rangeStart: startOfDayMs(selectedDay), rangeEnd: endOfDayMs(selectedDay) };
    }
    if (scope === "month") {
      const days = daysInMonth(cursorMonth);
      return { rangeStart: startOfDayMs(days[0]), rangeEnd: endOfDayMs(days[days.length - 1]) };
    }
    return { rangeStart: 0, rangeEnd: Number.MAX_SAFE_INTEGER };
  }, [scope, selectedDay, cursorMonth]);

  const breakdown = useMemo(() => {
    if (!isActivity) return { list: [], total: 0 };
    const totals = projectTotalsMs(todos, rangeStart, rangeEnd);
    const list = Array.from(totals.entries())
      .map(([projectId, ms]) => {
        const meta = projectMeta(projectId);
        return { projectId, ms, name: meta.name, color: meta.color };
      })
      .sort((a, b) => b.ms - a.ms);
    return { list, total: list.reduce((s, x) => s + x.ms, 0) };
  }, [isActivity, todos, rangeStart, rangeEnd, projectMeta]);

  // Whole weeks, padded with the neighbouring months' days.
  const weeks = useMemo(() => {
    const days = daysInMonth(cursorMonth);
    const prev = daysInMonth(shiftMonth(cursorMonth, -1));
    const next = daysInMonth(shiftMonth(cursorMonth, 1));
    const cells = [...prev.slice(prev.length - colIndex(days[0])), ...days];
    for (let i = 0; cells.length % 7 !== 0; i++) cells.push(next[i]);
    const out: string[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cursorMonth]);
  const [gridRef, cellLines] = useCellLines(weeks.length);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = localDateKey();
  const dayTodos = byDate.get(selectedDay) ?? [];
  const anyRunning = useMemo(() => todos.some((t) => !!t.startedAt && !t.completed), [todos]);
  const [cy, cm] = cursorMonth.split("-").map(Number);
  const monthLabel = fmt(new Date(cy, cm - 1, 1), { month: "long", year: "numeric" });

  const scopeLabel =
    scope === "day"
      ? fmt(keyToDate(selectedDay), { weekday: "long", month: "short", day: "numeric" })
      : scope === "month"
        ? monthLabel
        : "All time";

  const maxMs = Math.max(topDayMs, 1);
  const intensity = (ms: number) => {
    if (ms <= 0) return "bg-muted/20";
    const r = ms / maxMs;
    if (r < 0.25) return "bg-primary/[0.08]";
    if (r < 0.5) return "bg-primary/[0.14]";
    if (r < 0.75) return "bg-primary/[0.20]";
    return "bg-primary/[0.26]";
  };

  const goToMonth = (delta: number) =>
    setCursorMonth((m) => {
      const next = shiftMonth(m, delta);
      setSelectedDay((d) => remapDayToMonth(d, next));
      return next;
    });

  const handleDayClick = (iso: string) => {
    if (!iso.startsWith(cursorMonth)) setCursorMonth(iso.slice(0, 7));
    setSelectedDay(iso);
    // Picking a day out of the heat map is a request to see that day's numbers.
    if (isActivity) setScope("day");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="flex min-h-0 flex-col gap-5 lg:h-full lg:flex-row lg:gap-0"
    >
      {/* Month */}
      <section className="flex min-h-0 flex-col lg:flex-1">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <h2 className="mr-auto font-display text-xl font-semibold tracking-tight">{monthLabel}</h2>
          <Segmented
            id="calendar-tab"
            value={tab}
            onChange={onTabChange}
            options={[
              { id: "schedule", label: "Schedule" },
              { id: "activity", label: "Activity" },
            ]}
          />
          <div className="flex items-center rounded-lg border border-border">
            <button
              onClick={() => goToMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setCursorMonth(localMonthKey());
                setSelectedDay(localDateKey());
              }}
              className="h-8 border-x border-border px-3 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Today
            </button>
            <button
              onClick={() => goToMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Month grid — shared by both tabs, filled differently by each */}
        <div className="mt-4 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border lg:flex-1">
          <div className="grid shrink-0 grid-cols-7 border-b border-border bg-secondary/40">
            {dayLabels.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div
            ref={gridRef}
            className="grid grid-cols-7 bg-background lg:min-h-0 lg:flex-1 [&>*:nth-child(7n)]:border-r-0 [&>*:nth-last-child(-n+7)]:border-b-0"
            style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
          >
            {weeks.flatMap((week) =>
              week.map((iso, ci) => {
                const outside = !iso.startsWith(cursorMonth);
                const items = byDate.get(iso) ?? [];
                const dayEvents = outside ? [] : eventsOn(events, iso);
                const time = timeByDate.get(iso);
                const ms = time?.ms ?? 0;
                const isCurrent = iso === today;
                const isSelected = iso === selectedDay;
                const label = fmt(keyToDate(iso), { weekday: "short", month: "short", day: "numeric" });
                const entries = [
                  ...dayEvents.map((e, i) => ({
                    key: `e${i}`,
                    title: e.title,
                    time: e.allDay || e.start.slice(0, 10) !== iso ? null : e.start.slice(11, 16),
                    color: null as string | null,
                    done: false,
                  })),
                  ...items.map((t) => ({
                    key: t.id,
                    title: t.title,
                    time: t.dueTime ?? null,
                    color: projectColor(t.projectId ?? null),
                    done: t.completed,
                  })),
                ];
                const total = entries.length;
                // Every item when they all fit, otherwise one line fewer and a "+N more".
                const shown = total > cellLines ? cellLines - 1 : total;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => handleDayClick(iso)}
                    title={
                      isActivity
                        ? `${label} · ${fmtDuration(ms)}`
                        : `${label} · ${total ? `${total} item${total === 1 ? "" : "s"}` : "nothing scheduled"}`
                    }
                    aria-pressed={isSelected}
                    className={cn(
                      "relative flex h-14 min-h-0 flex-col gap-1 overflow-hidden border-b border-r border-border p-1.5 text-left outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:h-auto md:min-h-[6rem] md:p-2 lg:min-h-0",
                      isActivity && !outside && intensity(ms),
                      ci >= 5 && !isActivity && "bg-foreground/[0.025]",
                      isSelected ? !isActivity && "bg-primary/[0.07]" : "hover:bg-secondary/60",
                      outside && "text-muted-foreground/50",
                    )}
                  >
                    {isSelected && <span aria-hidden className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary/70" />}
                    <div className="flex shrink-0 items-center justify-between gap-1">
                      <span
                        className={cn(
                          "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums",
                          isCurrent && "bg-primary text-primary-foreground",
                        )}
                      >
                        {Number(iso.slice(8, 10))}
                      </span>
                      {isActivity && ms > 0 && (
                        <span className="hidden text-[10px] font-medium tabular-nums text-muted-foreground sm:block">
                          {fmtDuration(ms)}
                        </span>
                      )}
                    </div>

                    {isActivity ? (
                      !outside && <div className="mt-auto"><DayCompositionBar totals={time?.totals} projectColor={projectColor} /></div>
                    ) : (
                      total > 0 && (
                        <>
                          {/* Phones: a dot per item. */}
                          <div className="mt-auto flex flex-wrap gap-0.5 px-0.5 md:hidden">
                            {entries.slice(0, 4).map((e) => (
                              <span
                                key={e.key}
                                className={cn("h-1.5 w-1.5 rounded-full", !e.color && "bg-muted-foreground")}
                                style={{ backgroundColor: e.color ?? undefined, opacity: e.done || outside ? 0.35 : 1 }}
                              />
                            ))}
                          </div>
                          {/* Wider screens: the items themselves. */}
                          <ul className={cn("hidden min-h-0 flex-col gap-0.5 md:flex", outside && "opacity-50")}>
                            {entries.slice(0, shown).map((e) => (
                              <li
                                key={e.key}
                                className={cn(
                                  "flex min-w-0 items-center gap-1.5 rounded px-1 py-px text-[11px] leading-4",
                                  e.color ? "text-foreground/85" : "bg-secondary text-muted-foreground",
                                  e.done && "text-muted-foreground line-through",
                                )}
                              >
                                {e.color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />}
                                {e.time && <span className="hidden shrink-0 tabular-nums text-muted-foreground xl:inline">{e.time}</span>}
                                <span className="truncate">{e.title}</span>
                              </li>
                            ))}
                            {total > shown && (
                              <li className="px-1 text-[11px] leading-4 text-muted-foreground">
                                {shown ? `+${total - shown} more` : `${total} items`}
                              </li>
                            )}
                          </ul>
                        </>
                      )
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </section>

      {/* Side panel: the selected day's agenda, or where the time went */}
      <section aria-label="Selected day" className="flex min-h-0 flex-col lg:w-72 xl:w-[22rem] lg:flex-none lg:border-l lg:border-border lg:pl-6 lg:ml-6">
        {isActivity ? (
          <Breakdown
            scope={scope}
            setScope={setScope}
            scopeLabel={scopeLabel}
            total={breakdown.total}
            items={breakdown.list}
            monthActiveDays={activeDays}
          />
        ) : (
          <>
            <div className="flex shrink-0 items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-semibold">
                  {selectedDay === today ? "Today" : fmt(keyToDate(selectedDay), { weekday: "long" })}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fmt(keyToDate(selectedDay), { month: "long", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onQuickAdd(selectedDay)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
            <div data-stack-meta className="mt-3 min-h-0 lg:flex-1 lg:overflow-y-auto">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selectedDay}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                >
                  <EventList events={eventsOn(events, selectedDay)} day={selectedDay} />
                  <TodoList
                    // The agenda is one flat, chronological run — the day is
                    // already the grouping, so no headers belong inside it.
                    sections={
                      dayTodos.length > 0 ? [{ key: selectedDay, kind: "plain", todos: dayTodos }] : []
                    }
                    onToggle={onToggle}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onStart={onStart}
                    onStop={onStop}
                    // Sorted by time of day (see `byDate` above) and not part of
                    // the app's global manual ordering — dragging here must not
                    // write into that shared order.
                    onReorder={() => {}}
                    emptyArt="upcoming"
                    emptyTitle="Nothing scheduled"
                    emptyHint="Tap Add to plan something for this day."
                    activeList="calendar"
                    anyRunning={anyRunning}
                    projects={projects}
                    onCreateProject={onCreateProject}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </section>
    </motion.div>
  );
}

/** Pill switch with the active segment sliding between options. */
function Segmented<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T;
  onChange: (next: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <LayoutGroup id={id}>
      <div className="flex items-center gap-0.5 rounded-lg bg-background p-0.5 shadow-sm">
        {options.map((option) => {
          const isActive = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={isActive}
              className="relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            >
              {isActive && (
                <motion.span
                  layoutId={`${id}-active`}
                  className="absolute inset-0 rounded-md bg-primary shadow-sm"
                  transition={{ type: "spring", damping: 30, stiffness: 350 }}
                />
              )}
              <span
                className={cn(
                  "relative z-10",
                  isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function Breakdown({
  scope,
  setScope,
  scopeLabel,
  total,
  items,
  monthActiveDays,
}: {
  scope: Scope;
  setScope: (s: Scope) => void;
  scopeLabel: string;
  total: number;
  items: { projectId: string | null; ms: number; name: string; color: string }[];
  monthActiveDays: number;
}) {
  return (
    <div className="shrink-0 rounded-xl border border-border bg-secondary/30 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {scope === "day" ? "Selected day" : scope === "month" ? "This month" : "Lifetime"}
            </span>
            <span className="truncate text-xs text-muted-foreground">{scopeLabel}</span>
          </div>
          <div className="mt-1 font-display text-2xl font-semibold tabular-nums">
            {fmtDuration(total)}
          </div>
          {scope === "month" && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {monthActiveDays} active day{monthActiveDays === 1 ? "" : "s"}
              {monthActiveDays > 0 && ` · avg ${fmtDuration(total / monthActiveDays)}/day`}
            </div>
          )}
        </div>
        <Segmented
          id="calendar-scope"
          value={scope}
          onChange={setScope}
          options={[
            { id: "day", label: "Day" },
            { id: "month", label: "Month" },
            { id: "lifetime", label: "Lifetime" },
          ]}
        />
      </div>

      {total > 0 ? (
        <>
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted/40">
            {items.map((it) => (
              <div
                key={it.projectId ?? "inbox"}
                style={{ width: `${(it.ms / total) * 100}%`, backgroundColor: it.color }}
                title={`${it.name} · ${fmtDuration(it.ms)}`}
              />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {items.map((it) => {
              const pct = total > 0 ? (it.ms / total) * 100 : 0;
              return (
                <li key={it.projectId ?? "inbox"} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: it.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground/80">{it.name}</span>
                  <span className="tabular-nums text-muted-foreground">{fmtDuration(it.ms)}</span>
                  <span className="w-10 text-right tabular-nums text-muted-foreground/70">
                    {pct < 1 ? "<1%" : `${Math.round(pct)}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">
          {scope === "day" ? "No work tracked on this day." : "No work tracked yet."}
        </div>
      )}
    </div>
  );
}

/**
 * Single stacked bar showing how a day's tracked time breaks down by project.
 */
function DayCompositionBar({
  totals,
  projectColor,
}: {
  totals?: Map<string | null, number>;
  projectColor: (id: string | null) => string;
}) {
  let total = 0;
  for (const ms of totals?.values() ?? []) total += ms;
  if (total === 0) return <div className="h-1.5 w-full rounded-full bg-foreground/[0.06]" />;
  const entries = Array.from(totals!.entries()).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
      {entries.map(([pid, ms]) => (
        <div
          key={pid ?? "inbox"}
          style={{ width: `${(ms / total) * 100}%`, backgroundColor: projectColor(pid) }}
        />
      ))}
    </div>
  );
}
