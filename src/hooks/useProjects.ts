import { useCallback } from 'react';
import { Project } from '@/types/todo';
import * as db from '@/lib/db';
import { uuid } from '@/lib/uuid';
import { orderForNewBottom } from '@/lib/order';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';

export const PROJECT_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

export function useProjects() {
  const { rows: projects, rowsRef, insert, patch, remove } = useRealtimeTable<Project>('projects');

  const addProject = useCallback(
    async (rawName: string, areaId?: string | null): Promise<Project | null> => {
      const name = rawName.trim();
      if (!name) return null;
      return insert(
        {
          id: uuid(),
          name,
          color: PROJECT_PALETTE[Math.floor(Math.random() * PROJECT_PALETTE.length)],
          areaId: areaId ?? null,
          sortOrder: orderForNewBottom(rowsRef.current.map((p) => p.sortOrder ?? 0)),
          createdAt: new Date().toISOString(),
        },
        'Failed to create project',
      );
    },
    [insert, rowsRef],
  );

  const recolorProject = useCallback(
    (id: string, color: string) => patch(id, { color }, 'Color update failed'),
    [patch],
  );

  const renameProject = useCallback(async (id: string, rawName: string) => {
    const name = rawName.trim();
    if (name) await patch(id, { name }, 'Rename failed');
  }, [patch]);

  const setProjectArea = useCallback(
    (id: string, areaId: string | null) => patch(id, { areaId }, 'Could not move project'),
    [patch],
  );

  const setProjectSequential = useCallback(
    (id: string, sequential: boolean) => patch(id, { sequential }, 'Could not update project'),
    [patch],
  );

  const deleteProject = useCallback(async (
    id: string,
    // Todos that belonged to this project (captured by the caller before they
    // were detached), plus a reattach fn — so Undo can restore the task
    // associations, not just the empty project row.
    affectedTodoIds: string[] = [],
    reattach?: (ids: string[], pid: string) => Promise<void>,
  ) => {
    // Sections go with their project, as before.
    await db.remove('headings', await db.idsWhere('headings', 'projectId', id));
    await remove(id, (p) => `Deleted "${p.name}"`, async (p) => {
      await reattach?.(affectedTodoIds, p.id);
    });
  }, [remove]);

  return {
    projects,
    addProject,
    recolorProject,
    renameProject,
    setProjectArea,
    setProjectSequential,
    deleteProject,
  };
}
