import { useCallback, useEffect, useRef, useState } from 'react';
import { ChecklistItem, Todo } from '@/types/todo';
import * as db from '@/lib/db';
import { toast } from "@/lib/toast";
import { encryptNote } from '@/lib/noteCipher';
import { uuid } from '@/lib/uuid';
import { localDateKey } from '@/lib/date';
import { nextInstanceFields, nextStreak } from '@/lib/repeat';
import { moveWithin, orderForNewTop } from '@/lib/order';

const orderOf = (t: Todo) => t.sortOrder ?? -new Date(t.createdAt).getTime();

/** Encrypts notes when encryption is on. Locked on this device: toast, and `ok` is false. */
async function sealNotes(value: string | null | undefined): Promise<{ ok: boolean; value?: string | null }> {
  try {
    return { ok: true, value: await encryptNote(value) };
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not encrypt the note');
    return { ok: false };
  }
}

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  // Mirror of `todos` for the mutation callbacks: reading the list through a ref
  // keeps every callback identity stable, so the list and its rows don't
  // re-render on each keystroke or timer tick.
  const todosRef = useRef(todos);
  todosRef.current = todos;

  const fetchTodos = useCallback(async () => {
    const { data, error } = await db.listAll<Todo>('todos');
    if (error) {
      console.error('Fetch Error:', error);
      toast.error('Storage read failure');
    } else if (data) {
      setTodos(data);
    }
    setLoading(false);
    return data ?? [];
  }, []);

  // Offline writes just reached the server: take its view.
  useEffect(() => {
    const resync = () => void fetchTodos();
    window.addEventListener('zings:resync', resync);
    return () => window.removeEventListener('zings:resync', resync);
  }, [fetchTodos]);

  useEffect(() => {
    void fetchTodos();

    return db.subscribe<Todo>('todos', (action, row) => {
      setTodos((current) => {
        if (action === 'create') {
          return current.some((x) => x.id === row.id) ? current : [row, ...current];
        }
        if (action === 'update') return current.map((x) => (x.id === row.id ? row : x));
        if (action === 'delete') return current.filter((x) => x.id !== row.id);
        return current;
      });
    });
  }, [fetchTodos]);

  const addTodo = useCallback(async (partial: Partial<Todo> & { title: string }) => {
    // Client-mint the id and show the task instantly — don't wait for the realtime
    // echo. The subscription dedupes by id, so the later echo is a no-op.
    const siblings = todosRef.current.filter((t) => !t.deletedAt).map(orderOf);
    const row: Todo = {
      id: uuid(),
      title: partial.title,
      notes: (await sealNotes(partial.notes)).value ?? null,
      completed: false,
      list: partial.list ?? 'inbox',
      projectId: partial.projectId ?? null,
      headingId: partial.headingId ?? null,
      dueDate: partial.dueDate ?? null,
      dueTime: partial.dueTime ?? null,
      evening: partial.evening ?? false,
      deadline: partial.deadline ?? null,
      estimateMin: partial.estimateMin ?? null,
      priority: partial.priority ?? null,
      checklist: partial.checklist ?? [],
      tags: partial.tags ?? [],
      repeatRule: partial.repeatRule ?? null,
      streak: 0,
      sortOrder: partial.sortOrder ?? orderForNewTop(siblings),
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };
    setTodos((current) => (current.some((t) => t.id === row.id) ? current : [row, ...current]));
    const error = await db.insert('todos', [row]);
    if (error) {
      toast.error(db.errorMessage(error, 'Cloud write failed'));
      setTodos((current) => current.filter((t) => t.id !== row.id)); // rollback
    }
    return row;
  }, []);

  const updateTodo = useCallback(async (id: string, patch: Partial<Todo>) => {
    const next: Partial<Todo> = { ...patch };
    if ('notes' in next) {
      const sealed = await sealNotes(next.notes);
      if (!sealed.ok) return;
      next.notes = sealed.value;
    }
    setTodos((current) => current.map((t) => (t.id === id ? { ...t, ...next } : t)));
    const error = await db.update('todos', [id], next);
    if (error) {
      toast.error('Failed to sync update');
      fetchTodos(); // re-sync from the server to undo the optimistic patch
    }
  }, [fetchTodos]);

  /** Apply the same patch to many to-dos — the multi-select actions. */
  const bulkUpdate = useCallback(async (ids: string[], patch: Partial<Todo>) => {
    if (ids.length === 0) return;
    const next: Partial<Todo> = { ...patch };
    if ('notes' in next) {
      const sealed = await sealNotes(next.notes);
      if (!sealed.ok) return;
      next.notes = sealed.value;
    }
    setTodos((current) => current.map((t) => (ids.includes(t.id) ? { ...t, ...next } : t)));
    const error = await db.update('todos', ids, next);
    if (error) {
      toast.error('Failed to sync update');
      fetchTodos();
    }
  }, [fetchTodos]);

  const toggleTodo = useCallback(async (id: string) => {
    const match = todosRef.current.find((x) => x.id === id);
    if (!match) return;

    const setCompleted = !match.completed;
    // A repeat's run length rides along on the row: ticking on time extends it,
    // a late tick starts over, and un-ticking hands back what the tick added.
    const streak = match.repeatRule
      ? setCompleted
        ? nextStreak(match.streak, match.dueDate, localDateKey())
        : Math.max(0, (match.streak ?? 0) - 1)
      : match.streak ?? 0;
    const changes = setCompleted
      ? {
          completed: true,
          completedAt: new Date().toISOString(),
          lastedMs: match.startedAt
            ? (match.lastedMs ?? 0) + Date.now() - new Date(match.startedAt).getTime()
            : match.lastedMs,
          streak,
        }
      : { completed: false, completedAt: null, startedAt: null, streak };

    setTodos((current) => current.map((t) => (t.id === id ? ({ ...t, ...changes } as Todo) : t)));
    const error = await db.update('todos', [id], changes);
    if (error) {
      toast.error('Failed to toggle status');
      fetchTodos();
      return;
    }

    // A repeating to-do spawns its successor only once the current instance is
    // actually logged, so the lists never hold phantom future copies.
    if (setCompleted && match.repeatRule) {
      const next = nextInstanceFields(match, localDateKey());
      if (next) {
        const spawn: Todo = {
          ...match,
          id: uuid(),
          completed: false,
          completedAt: null,
          startedAt: null,
          lastedMs: null,
          dueDate: next.dueDate,
          deadline: next.deadline,
          list: next.list,
          checklist: next.checklist,
          streak,
          deletedAt: null,
          createdAt: new Date().toISOString(),
        };
        setTodos((current) => (current.some((t) => t.id === spawn.id) ? current : [spawn, ...current]));
        const spawnError = await db.insert('todos', [spawn]);
        if (spawnError) {
          toast.error('Could not schedule the next repeat');
          setTodos((current) => current.filter((t) => t.id !== spawn.id));
        }
      }
    }
  }, [fetchTodos]);

  const setChecklist = useCallback(async (id: string, checklist: ChecklistItem[]) => {
    setTodos((current) => current.map((t) => (t.id === id ? { ...t, checklist } : t)));
    const error = await db.update('todos', [id], { checklist });
    if (error) {
      toast.error('Failed to sync checklist');
      fetchTodos();
    }
  }, [fetchTodos]);

  const startTimer = useCallback(async (id: string) => {
    const conflict = todosRef.current.some((x) => x.id !== id && !!x.startedAt && !x.completed);
    if (conflict) {
      toast.error('Please finalize other running timer first.');
      return;
    }
    const startedAt = new Date().toISOString();
    setTodos((current) =>
      current.map((x) => (x.id === id ? { ...x, startedAt } : x)),
    );
    const error = await db.update('todos', [id], { startedAt });
    if (error) {
      toast.error('Failed to start timer');
      fetchTodos();
    }
  }, [fetchTodos]);

  const stopTimer = useCallback(async (id: string) => {
    const match = todosRef.current.find((x) => x.id === id);
    if (!match || !match.startedAt) return;
    const elapsed = (match.lastedMs ?? 0) + Date.now() - new Date(match.startedAt).getTime();
    setTodos((current) =>
      current.map((x) => (x.id === id ? { ...x, startedAt: null, lastedMs: elapsed } : x)),
    );
    const error = await db.update('todos', [id], { startedAt: null, lastedMs: elapsed });
    if (error) {
      toast.error('Failed to stop timer');
      fetchTodos();
    }
  }, [fetchTodos]);

  /**
   * Soft delete: the row moves to Trash rather than vanishing, so a mis-click
   * is recoverable long after the undo toast is gone.
   */
  const deleteTodo = useCallback(async (id: string) => {
    const deletedAt = new Date().toISOString();
    setTodos((current) => current.map((t) => (t.id === id ? { ...t, deletedAt } : t)));
    const error = await db.update('todos', [id], { deletedAt });
    if (error) {
      toast.error('Failed to delete');
      fetchTodos();
      return;
    }
    toast('Moved to Trash', {
      action: {
        label: 'Undo',
        onClick: async () => {
          setTodos((current) => current.map((t) => (t.id === id ? { ...t, deletedAt: null } : t)));
          const restoreError = await db.update('todos', [id], { deletedAt: null });
          if (restoreError) {
            toast.error('Undo failed');
            fetchTodos();
          }
        },
      },
    });
  }, [fetchTodos]);

  const deleteTodos = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const deletedAt = new Date().toISOString();
    setTodos((current) => current.map((t) => (ids.includes(t.id) ? { ...t, deletedAt } : t)));
    const error = await db.update('todos', ids, { deletedAt });
    if (error) {
      toast.error('Failed to delete');
      fetchTodos();
      return;
    }
    toast(`${ids.length} to-do${ids.length === 1 ? '' : 's'} moved to Trash`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          setTodos((current) => current.map((t) => (ids.includes(t.id) ? { ...t, deletedAt: null } : t)));
          const restoreError = await db.update('todos', ids, { deletedAt: null });
          if (restoreError) {
            toast.error('Undo failed');
            fetchTodos();
          }
        },
      },
    });
  }, [fetchTodos]);

  const restoreTodo = useCallback(async (id: string) => {
    setTodos((current) => current.map((t) => (t.id === id ? { ...t, deletedAt: null } : t)));
    const error = await db.update('todos', [id], { deletedAt: null });
    if (error) {
      toast.error('Restore failed');
      fetchTodos();
    }
  }, [fetchTodos]);

  /** Permanent removal — only ever reached from Trash. */
  const purgeTodo = useCallback(async (id: string) => {
    setTodos((current) => current.filter((t) => t.id !== id));
    const error = await db.remove('todos', [id]);
    if (error) {
      toast.error('Failed to delete permanently');
      fetchTodos();
    }
  }, [fetchTodos]);

  const emptyTrash = useCallback(async () => {
    const ids = todosRef.current.filter((t) => t.deletedAt).map((t) => t.id);
    if (ids.length === 0) return;
    setTodos((current) => current.filter((t) => !t.deletedAt));
    const error = await db.remove('todos', ids);
    if (error) {
      toast.error('Failed to empty Trash');
      fetchTodos();
      return;
    }
    toast(`Deleted ${ids.length} to-do${ids.length === 1 ? '' : 's'} permanently`);
  }, [fetchTodos]);

  /**
   * Persist a drag. `visibleIds` is the list exactly as rendered, so the new
   * position is computed against what the user actually sees.
   */
  const reorderTodos = useCallback(
    async (activeId: string, overId: string, visibleIds: string[]) => {
      const byId = new Map(todosRef.current.map((t) => [t.id, t]));
      const lookup = (id: string) => {
        const t = byId.get(id);
        return t ? orderOf(t) : 0;
      };
      const updates = moveWithin(visibleIds, lookup, activeId, overId);
      if (updates.length === 0) return;

      const patch = new Map(updates.map((u) => [u.id, u.sortOrder]));
      setTodos((current) =>
        current.map((t) => (patch.has(t.id) ? { ...t, sortOrder: patch.get(t.id)! } : t)),
      );

      const errors = await Promise.all(
        updates.map((u) => db.update('todos', [u.id], { sortOrder: u.sortOrder })),
      );
      if (errors.some(Boolean)) {
        toast.error('Failed to save the new order');
        fetchTodos();
      }
    },
    [fetchTodos],
  );

  const detachProject = useCallback(async (pid: string) => {
    const ids = todosRef.current.filter((t) => t.projectId === pid).map((t) => t.id);
    await db.update('todos', ids, { projectId: null, headingId: null });
  }, []);

  // Re-attach a specific set of todos to a project — used to make "Undo" after a
  // project delete restore the task associations, not just the empty project row.
  const attachProject = useCallback(async (ids: string[], pid: string) => {
    if (ids.length === 0) return;
    await db.update('todos', ids, { projectId: pid });
  }, []);

  return {
    todos,
    loading,
    addTodo,
    updateTodo,
    bulkUpdate,
    toggleTodo,
    setChecklist,
    startTimer,
    stopTimer,
    deleteTodo,
    deleteTodos,
    restoreTodo,
    purgeTodo,
    emptyTrash,
    reorderTodos,
    detachProject,
    attachProject,
    refetch: fetchTodos,
  };
}
