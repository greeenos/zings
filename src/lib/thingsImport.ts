/**
 * Import from Things 3. Its whole library is one SQLite file (main.sqlite);
 * the browser reads it with sql.js, loaded only for this, and the result is an
 * ordinary Zings backup, so restoring it reuses the normal import.
 *
 * Ids are derived from the Things ids, so importing again updates instead of
 * duplicating. Repeating templates are skipped (their scheduled instances do
 * come over), as are completed, cancelled and trashed projects; their to-dos
 * still come over, unfiled.
 *
 * Column layout follows things.py (github.com/thingsapi/things.py).
 */
import type { Area, ChecklistItem, Heading, Project, Todo, TodoList } from "@/types/todo";
import { BACKUP_VERSION, type ZingsBackup } from "@/lib/backup";
import { localDateKey } from "@/lib/date";
import { PROJECT_PALETTE } from "@/hooks/useProjects";

type Row = Record<string, unknown>;
interface ThingsDb {
  all(sql: string): Row[];
}

/** Things packs calendar days as year << 16 | month << 12 | day << 7. */
export function thingsDate(value: unknown): string | null {
  if (typeof value !== "number" || value <= 0) return null;
  const y = (value >> 16) & 0x7ff;
  const m = (value >> 12) & 0xf;
  const d = (value >> 7) & 0x1f;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** …and reminder times as hours << 26 | minutes << 20. */
export function thingsTime(value: unknown): string | null {
  if (typeof value !== "number" || value <= 0) return null;
  return `${String((value >> 26) & 0x1f).padStart(2, "0")}:${String((value >> 20) & 0x3f).padStart(2, "0")}`;
}

const isoFromUnix = (value: unknown) =>
  typeof value === "number" && value > 0 ? new Date(value * 1000).toISOString() : null;

/** A stable UUID-shaped id per Things id (four seeded 32-bit hashes). */
export function stableId(thingsId: string): string {
  const words = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f].map((seed) => {
    let h = seed ^ thingsId.length;
    for (let i = 0; i < thingsId.length; i++) h = Math.imul(h ^ thingsId.charCodeAt(i), 0x5bd1e995) ^ (h >>> 15);
    return (Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0).toString(16).padStart(8, "0");
  });
  const hex = words.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

/** Older Things wrapped notes in <note xml:space="preserve">…</note>. */
function plainNotes(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (!value.startsWith("<note")) return value;
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim() || null;
}

const num = (value: unknown, fallback = 0) => (typeof value === "number" ? value : fallback);

export function thingsToBackup(db: ThingsDb, today = localDateKey(), now = new Date().toISOString()): ZingsBackup {
  const columns = new Set(db.all("PRAGMA table_info(TMTask)").map((c) => String(c.name)));
  const tasks = db.all("SELECT * FROM TMTask");
  const id = (thingsId: unknown) => stableId(String(thingsId));

  const areas: Area[] = db.all('SELECT uuid, title, "index" AS position FROM TMArea').map((a) => ({
    id: id(a.uuid),
    name: String(a.title || "Untitled area"),
    color: null,
    sortOrder: num(a.position),
    createdAt: now,
  }));
  const areaTitles = new Map(db.all("SELECT uuid, title FROM TMArea").map((a) => [String(a.uuid), String(a.title)]));

  const open = (t: Row) => num(t.status) === 0 && !num(t.trashed);
  const projectRows = tasks.filter((t) => num(t.type) === 1 && open(t));
  const keptProjects = new Set(projectRows.map((p) => String(p.uuid)));
  const projects: Project[] = projectRows.map((p, index) => ({
    id: id(p.uuid),
    name: String(p.title || "Untitled project"),
    color: PROJECT_PALETTE[index % PROJECT_PALETTE.length],
    areaId: p.area ? id(p.area) : null,
    sortOrder: num(p.index),
    createdAt: isoFromUnix(p.creationDate) ?? now,
  }));

  const headingProject = new Map<string, string>();
  const headings: Heading[] = [];
  for (const h of tasks) {
    if (num(h.type) !== 2 || num(h.trashed) || !keptProjects.has(String(h.project))) continue;
    headingProject.set(String(h.uuid), String(h.project));
    headings.push({
      id: id(h.uuid),
      projectId: id(h.project),
      name: String(h.title || "Untitled"),
      sortOrder: num(h.index),
      createdAt: isoFromUnix(h.creationDate) ?? now,
    });
  }

  const tagsByTask = new Map<string, string[]>();
  for (const row of db.all("SELECT tt.tasks AS task, t.title AS title FROM TMTaskTag tt JOIN TMTag t ON t.uuid = tt.tags")) {
    const list = tagsByTask.get(String(row.task)) ?? [];
    list.push(String(row.title));
    tagsByTask.set(String(row.task), list);
  }
  const checklistByTask = new Map<string, ChecklistItem[]>();
  for (const row of db.all('SELECT uuid, task, title, status FROM TMChecklistItem ORDER BY "index"')) {
    const list = checklistByTask.get(String(row.task)) ?? [];
    list.push({ id: id(row.uuid), text: String(row.title ?? ""), done: num(row.status) === 3 });
    checklistByTask.set(String(row.task), list);
  }

  const todos: Todo[] = [];
  for (const t of tasks) {
    if (num(t.type) !== 0) continue;
    if (columns.has("rt1_recurrenceRule") && t.rt1_recurrenceRule != null) continue; // a repeat template

    const thingsId = String(t.uuid);
    const headingKey = t.heading ? String(t.heading) : null;
    const projectKey = t.project && keptProjects.has(String(t.project))
      ? String(t.project)
      : headingKey ? headingProject.get(headingKey) ?? null : null;

    const startDate = thingsDate(t.startDate);
    let list: TodoList = num(t.start) === 0 ? "inbox" : num(t.start) === 2 ? "someday" : "anytime";
    if (startDate) list = startDate <= today ? "today" : "anytime"; // scheduled: Today or Upcoming

    const tags = [...(tagsByTask.get(thingsId) ?? [])];
    // Zings has no to-dos directly in an area; keep the area as a tag instead.
    const areaTitle = !projectKey && t.area ? areaTitles.get(String(t.area)) : undefined;
    if (areaTitle && !tags.includes(areaTitle)) tags.push(areaTitle);

    const done = num(t.status) === 3 || num(t.status) === 2;
    todos.push({
      id: id(thingsId),
      title: String(t.title || "Untitled"),
      notes: plainNotes(t.notes),
      completed: done,
      completedAt: done ? isoFromUnix(t.stopDate) ?? now : null,
      startedAt: null,
      lastedMs: null,
      list,
      projectId: projectKey ? id(projectKey) : null,
      headingId: headingKey && headingProject.has(headingKey) ? id(headingKey) : null,
      dueDate: startDate,
      dueTime: startDate && columns.has("reminderTime") ? thingsTime(t.reminderTime) : null,
      evening: list === "today" && num(t.startBucket) === 1,
      deadline: thingsDate(t.deadline),
      estimateMin: null,
      checklist: checklistByTask.get(thingsId) ?? [],
      tags,
      repeatRule: null,
      streak: 0,
      sortOrder: num(t.index),
      deletedAt: num(t.trashed) ? now : null,
      createdAt: isoFromUnix(t.creationDate) ?? now,
    });
  }

  return { app: "zings", version: BACKUP_VERSION, exportedAt: now, areas, projects, headings, todos };
}

/** Reads a Things main.sqlite picked by the user. */
export async function readThingsFile(file: File): Promise<ZingsBackup> {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import("sql.js"),
    import("sql.js/dist/sql-wasm.wasm?url"),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  try {
    return thingsToBackup({
      all(sql) {
        const [result] = db.exec(sql);
        if (!result) return [];
        return result.values.map((values) => Object.fromEntries(result.columns.map((c, i) => [c, values[i]])));
      },
    });
  } catch {
    throw new Error("That doesn't look like a Things 3 database (main.sqlite).");
  } finally {
    db.close();
  }
}
