import { useCallback } from 'react';
import { Area } from '@/types/todo';
import * as db from '@/lib/db';
import { uuid } from '@/lib/uuid';
import { orderForNewBottom } from '@/lib/order';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';

/**
 * Areas are the top level of the sidebar — ongoing spheres of life ("Work",
 * "Home") that hold projects. Deleting one never deletes its projects; they
 * simply fall back to the ungrouped list.
 */
export function useAreas() {
  const { rows: areas, rowsRef, insert, patch, remove } = useRealtimeTable<Area>('areas');

  const addArea = useCallback(async (rawName: string): Promise<Area | null> => {
    const name = rawName.trim();
    if (!name) return null;
    return insert(
      {
        id: uuid(),
        name,
        color: null,
        sortOrder: orderForNewBottom(rowsRef.current.map((a) => a.sortOrder ?? 0)),
        createdAt: new Date().toISOString(),
      },
      'Failed to create area',
    );
  }, [insert, rowsRef]);

  const renameArea = useCallback(async (id: string, rawName: string) => {
    const name = rawName.trim();
    if (name) await patch(id, { name }, 'Rename failed');
  }, [patch]);

  const deleteArea = useCallback(async (id: string) => {
    // Projects survive and reappear under "Projects" — but capture them so
    // Undo can put them back.
    const orphanIds = await db.idsWhere('projects', 'areaId', id);
    await db.update('projects', orphanIds, { areaId: null });
    await remove(id, (a) => `Deleted "${a.name}"`, async (a) => {
      if (orphanIds.length > 0) {
        await db.update('projects', orphanIds, { areaId: a.id });
      }
    });
  }, [remove]);

  return { areas, addArea, renameArea, deleteArea };
}
