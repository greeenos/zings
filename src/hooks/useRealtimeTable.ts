import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from "@/lib/toast";
import * as db from '@/lib/db';

/**
 * Shared plumbing for the small sidebar collections (areas, projects,
 * headings): initial fetch, a realtime subscription that keeps the
 * local array in step with whatever another device does, and the optimistic
 * insert / patch / delete-with-Undo every one of them needs.
 *
 * `todos` deliberately does NOT use this — it needs ordering and soft-delete
 * logic that would only be obscured by a generic.
 */
export function useRealtimeTable<T extends { id: string }>(table: db.Table) {
  const [rows, setRows] = useState<T[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const refetch = useCallback(async () => {
    const { data } = await db.listAll<T>(table);
    if (data) setRows(data);
    return data ?? [];
  }, [table]);

  // Offline writes just reached the server: take its view.
  useEffect(() => {
    const resync = () => void refetch();
    window.addEventListener('zings:resync', resync);
    return () => window.removeEventListener('zings:resync', resync);
  }, [refetch]);

  useEffect(() => {
    void refetch();

    return db.subscribe<T>(table, (action, row) => {
      setRows((current) => {
        if (action === 'create') {
          return current.some((x) => x.id === row.id) ? current : [...current, row];
        }
        if (action === 'update') {
          if (current.some((x) => x.id === row.id)) return current.map((x) => (x.id === row.id ? row : x));
          // A row we never had: someone just shared it with us. Fetch everything it brings along.
          queueMicrotask(() => window.dispatchEvent(new Event('zings:resync')));
          return [...current, row];
        }
        if (action === 'delete') return current.filter((x) => x.id !== row.id);
        return current;
      });
    });
  }, [refetch, table]);

  const addRow = useCallback((row: T) => {
    setRows((current) => (current.some((x) => x.id === row.id) ? current : [...current, row]));
  }, []);

  /** Show the row at once; drop it again if the write fails. */
  const insert = useCallback(async (row: T, failure: string): Promise<T | null> => {
    addRow(row);
    const error = await db.insert(table, [row]);
    if (error) {
      toast.error(failure);
      setRows((current) => current.filter((x) => x.id !== row.id));
      return null;
    }
    return row;
  }, [addRow, table]);

  /** Apply a partial update optimistically; resync from the server if it fails. */
  const patch = useCallback(async (id: string, changes: Partial<T>, failure: string) => {
    setRows((current) => current.map((x) => (x.id === id ? { ...x, ...changes } : x)));
    const error = await db.update(table, [id], changes);
    if (error) {
      toast.error(failure);
      void refetch();
    }
  }, [refetch, table]);

  /**
   * Optimistic delete with an Undo toast. `restore` runs after Undo has put the
   * row back, for re-attaching whatever the delete detached.
   */
  const remove = useCallback(async (
    id: string,
    label: (row: T) => string,
    restore?: (row: T) => Promise<void>,
  ) => {
    const removed = rowsRef.current.find((x) => x.id === id);
    setRows((current) => current.filter((x) => x.id !== id));
    const error = await db.remove(table, [id]);
    if (error) {
      toast.error('Removal failed');
      void refetch();
      return;
    }
    if (!removed) return;
    toast(label(removed), {
      action: {
        label: 'Undo',
        onClick: async () => {
          const reErr = await db.insert(table, [removed]);
          if (reErr) {
            toast.error('Undo failed');
            return;
          }
          addRow(removed);
          await restore?.(removed);
        },
      },
    });
  }, [addRow, refetch, table]);

  return { rows, rowsRef, insert, patch, remove };
}
