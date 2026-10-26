import { Todo } from "@/types/todo";
import { fmt } from "@/lib/date";

/**
 * Sum of work time per project (incl. null for inbox) across all todos whose
 * timer overlaps the half-open window `[startMs, endMs)`. Spanning todos are
 * clipped to the window so totals never double-count outside time.
 */
export function projectTotalsMs(
  todos: Todo[],
  startMs: number,
  endMs: number,
  nowMs = Date.now(),
): Map<string | null, number> {
  const map = new Map<string | null, number>();
  for (const t of todos) {
    if (!t.startedAt) continue;
    const ts = new Date(t.startedAt).getTime();
    const te = t.completedAt ? new Date(t.completedAt).getTime() : nowMs;
    const a = Math.max(ts, startMs);
    const b = Math.min(te, endMs);
    if (b <= a) continue;
    const pid = t.projectId ?? null;
    map.set(pid, (map.get(pid) ?? 0) + (b - a));
  }
  return map;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ""}`;
  if (m > 0) return `${m}m${s > 0 && m < 5 ? ` ${s}s` : ""}`;
  return `${s}s`;
}

export function formatTagTime(iso: string): string {
  const d = new Date(iso);
  return `${fmt(d, { hour: "numeric", minute: "2-digit" })} · ${fmt(d, { month: "short", day: "numeric" })}`;
}
