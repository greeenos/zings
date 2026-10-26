/**
 * Export / import of the whole workspace as one JSON file.
 *
 * "Your data stays where you put it" only means something if you can actually
 * take it away, so this is a plain, readable document rather than a database
 * dump — and importing it anywhere else reproduces the workspace exactly.
 *
 * Encrypted notes are exported as the ciphertext that is stored: without the
 * passphrase the export cannot reveal them, and with it the import still works.
 */

import { Area, Heading, Project, Todo } from "@/types/todo";
import * as db from "@/lib/db";

export const BACKUP_VERSION = 2;

export interface ZingsBackup {
  app: "zings";
  version: number;
  exportedAt: string;
  areas: Area[];
  projects: Project[];
  headings: Heading[];
  todos: Todo[];
}

/**
 * Only these columns cross the boundary. Selecting explicitly means a stray
 * column on the source database (v1's unused `starred`, say) can never break
 * the import on a clean schema.
 */
const AREA_FIELDS = ["id", "name", "color", "sortOrder", "createdAt"] as const;
const PROJECT_FIELDS = ["id", "name", "color", "areaId", "sequential", "sortOrder", "createdAt"] as const;
const HEADING_FIELDS = ["id", "projectId", "name", "sortOrder", "createdAt"] as const;
const TODO_FIELDS = [
  "id", "title", "notes", "completed", "completedAt", "startedAt", "lastedMs",
  "list", "projectId", "headingId", "dueDate", "dueTime", "evening", "deadline",
  "estimateMin", "priority", "checklist", "tags", "repeatRule", "streak", "sortOrder", "deletedAt", "createdAt",
] as const;

function pick<T extends object>(row: T, fields: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const key of fields) {
    if (key in row) out[key] = (row as Record<string, unknown>)[key];
  }
  return out as T;
}

interface BackupInput {
  areas: Area[];
  projects: Project[];
  headings: Heading[];
  todos: Todo[];
  exportedAt: string;
}

export function buildBackup({ areas, projects, headings, todos, exportedAt }: BackupInput): ZingsBackup {
  return {
    app: "zings",
    version: BACKUP_VERSION,
    exportedAt,
    areas: areas.map((a) => pick(a, AREA_FIELDS)),
    projects: projects.map((p) => pick(p, PROJECT_FIELDS)),
    headings: headings.map((h) => pick(h, HEADING_FIELDS)),
    todos: todos.map((t) => pick(t, TODO_FIELDS)),
  };
}

export class BackupError extends Error {}

/** Parse and sanity-check a file the user picked. Throws BackupError on junk. */
export function parseBackup(text: string): ZingsBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't valid JSON.");
  }
  if (!raw || typeof raw !== "object") throw new BackupError("That file isn't a Zings backup.");

  const doc = raw as Partial<ZingsBackup>;
  if (doc.app !== "zings") throw new BackupError("That file isn't a Zings backup.");
  if (!Array.isArray(doc.todos)) throw new BackupError("The backup has no to-dos in it.");
  if (typeof doc.version !== "number" || doc.version > BACKUP_VERSION) {
    throw new BackupError("This backup was made by a newer version of Zings.");
  }

  const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

  return {
    app: "zings",
    version: doc.version,
    exportedAt: typeof doc.exportedAt === "string" ? doc.exportedAt : "",
    areas: list<Area>(doc.areas).map((a) => pick(a, AREA_FIELDS)),
    projects: list<Project>(doc.projects).map((p) => pick(p, PROJECT_FIELDS)),
    headings: list<Heading>(doc.headings).map((h) => pick(h, HEADING_FIELDS)),
    todos: list<Todo>(doc.todos)
      .filter((t) => !!t && typeof t.id === "string" && typeof t.title === "string")
      .map((t) => pick(t, TODO_FIELDS)),
  };
}

interface RestoreResult {
  areas: number;
  projects: number;
  headings: number;
  todos: number;
}

/**
 * Write a parsed backup back to the server.
 *
 * Rows are upserted by id, so re-importing the same file is a no-op rather
 * than a duplicate, and importing into a workspace that already has data
 * merges instead of replacing. This is also the way over from the old
 * Supabase-backed Zings: export there, import here.
 */
export async function restoreBackup(backup: ZingsBackup): Promise<RestoreResult> {
  const steps: Array<[keyof RestoreResult, db.Table, Array<{ id: string }>]> = [
    ["areas", "areas", backup.areas],
    ["projects", "projects", backup.projects],
    ["headings", "headings", backup.headings],
    ["todos", "todos", backup.todos],
  ];

  const result: RestoreResult = { areas: 0, projects: 0, headings: 0, todos: 0 };

  for (const [key, table, rows] of steps) {
    const error = await db.upsert(table, rows);
    if (error) throw new BackupError(`Couldn't import ${table}: ${error.message}`);
    result[key] = rows.length;
  }

  return result;
}

/** Trigger a download of `backup` as a .json file. */
export function downloadBackup(backup: ZingsBackup, filename: string) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
