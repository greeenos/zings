import { useCallback, useEffect, useRef, useState } from 'react';
import { Todo } from '@/types/todo';
import { formatTimeRange } from '@/lib/schedule';
import { disablePush, enablePush } from '@/lib/push';

/**
 * Reminders for to-dos that carry an exact time.
 *
 * Two paths, same notification (tag = to-do id, so a device shows it once):
 * the server pushes it to every subscribed device, Zings closed or not, and
 * the open app fires it locally — which covers browsers without Web Push.
 */

const ENABLED_KEY = 'zings-reminders-enabled';
const FIRED_KEY = 'zings-reminders-fired';
/** Don't ambush someone opening the app at 6pm with this morning's 9am task. */
const GRACE_MS = 10 * 60 * 1000;
const TICK_MS = 30_000;

type FiredMap = Record<string, number>;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

function readFired(): FiredMap {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as FiredMap) : {};
  } catch {
    return {};
  }
}

function writeFired(map: FiredMap) {
  try {
    // Keep the ledger from growing forever — a week is plenty to stop repeats.
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const pruned = Object.fromEntries(Object.entries(map).filter(([, at]) => at > cutoff));
    localStorage.setItem(FIRED_KEY, JSON.stringify(pruned));
  } catch {
    // ignore quota / unavailable storage
  }
}

/** Identity of one scheduled moment — changes when the task is rescheduled. */
function fireKey(todo: Todo): string {
  return `${todo.id}@${todo.dueDate}T${todo.dueTime}`;
}

/** Local wall-clock instant for a to-do's dueDate + dueTime. */
function scheduledAt(todo: Todo): number | null {
  if (!todo.dueDate || !todo.dueTime) return null;
  const [y, m, d] = todo.dueDate.split('-').map(Number);
  const [hh, mm] = todo.dueTime.split(':').map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

export type ReminderPermission = 'unsupported' | 'default' | 'granted' | 'denied';

export function useReminders(todos: Todo[]) {
  const [enabled, setEnabledState] = useState(readEnabled);
  const [permission, setPermission] = useState<ReminderPermission>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as ReminderPermission),
  );

  const todosRef = useRef(todos);
  todosRef.current = todos;

  const setEnabled = useCallback(async (next: boolean): Promise<boolean> => {
    if (!next) {
      setEnabledState(false);
      try { localStorage.setItem(ENABLED_KEY, '0'); } catch { /* ignore */ }
      void disablePush();
      return false;
    }
    if (typeof Notification === 'undefined') {
      setPermission('unsupported');
      return false;
    }
    let granted = Notification.permission;
    if (granted === 'default') granted = await Notification.requestPermission();
    setPermission(granted as ReminderPermission);
    const ok = granted === 'granted';
    setEnabledState(ok);
    try { localStorage.setItem(ENABLED_KEY, ok ? '1' : '0'); } catch { /* ignore */ }
    return ok;
  }, []);

  // Subscribe (or re-confirm) this device for server push whenever reminders are on.
  useEffect(() => {
    if (enabled && permission === 'granted') void enablePush();
  }, [enabled, permission]);

  useEffect(() => {
    if (!enabled || permission !== 'granted') return;

    const tick = () => {
      const now = Date.now();
      const fired = readFired();
      let changed = false;

      for (const todo of todosRef.current) {
        if (todo.completed || todo.deletedAt) continue;
        const at = scheduledAt(todo);
        if (at === null || at > now) continue;

        const key = fireKey(todo);
        if (fired[key]) continue;

        fired[key] = now;
        changed = true;
        // Past the grace window we only record it, so re-opening the app after
        // a long gap stays silent.
        if (now - at > GRACE_MS) continue;

        try {
          const when = formatTimeRange(todo.dueTime, todo.estimateMin);
          new Notification(todo.title, {
            body: when ? `Scheduled for ${when}` : 'Scheduled now',
            tag: todo.id,
            icon: '/icon-192.png',
          });
        } catch {
          // Some browsers throw when constructing a Notification outside a
          // service worker; nothing to do but skip it.
        }
      }

      if (changed) writeFired(fired);
    };

    tick();
    const timer = window.setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, permission]);

  return { enabled, permission, setEnabled };
}
