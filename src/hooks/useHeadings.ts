import { useCallback } from 'react';
import { Heading } from '@/types/todo';
import * as db from '@/lib/db';
import { uuid } from '@/lib/uuid';
import { orderForNewBottom } from '@/lib/order';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';

/**
 * Headings are named sections inside a project ("Research", "Write", "Ship").
 * Deleting one keeps its to-dos — they fall back to the project's unsectioned
 * area, which is what you want when you're just reorganising.
 */
export function useHeadings() {
  const { rows: headings, rowsRef, insert, patch, remove } = useRealtimeTable<Heading>('headings');

  const addHeading = useCallback(
    async (projectId: string, rawName: string): Promise<Heading | null> => {
      const name = rawName.trim();
      if (!name) return null;
      const siblings = rowsRef.current
        .filter((h) => h.projectId === projectId)
        .map((h) => h.sortOrder ?? 0);
      return insert(
        {
          id: uuid(),
          projectId,
          name,
          sortOrder: orderForNewBottom(siblings),
          createdAt: new Date().toISOString(),
        },
        'Failed to create heading',
      );
    },
    [insert, rowsRef],
  );

  const renameHeading = useCallback(async (id: string, rawName: string) => {
    const name = rawName.trim();
    if (name) await patch(id, { name }, 'Rename failed');
  }, [patch]);

  const deleteHeading = useCallback(async (id: string) => {
    // Detach the to-dos first so they fall back to the unsectioned list.
    const affectedIds = await db.idsWhere('todos', 'headingId', id);
    await db.update('todos', affectedIds, { headingId: null });
    await remove(id, (h) => `Deleted heading "${h.name}"`, async (h) => {
      if (affectedIds.length > 0) {
        await db.update('todos', affectedIds, { headingId: h.id });
      }
    });
  }, [remove]);

  return { headings, addHeading, renameHeading, deleteHeading };
}
