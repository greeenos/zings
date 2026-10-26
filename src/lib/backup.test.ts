import { describe, expect, it } from "vitest";
import { BACKUP_VERSION, BackupError, buildBackup, parseBackup } from "./backup";
import { Area, Heading, Project, Todo } from "@/types/todo";

const areas: Area[] = [
  { id: "a1", name: "Work", color: null, sortOrder: 0, createdAt: "2026-01-01T00:00:00.000Z" },
];
const projects: Project[] = [
  { id: "p1", name: "Launch", color: "#3b82f6", areaId: "a1", sortOrder: 0, createdAt: "2026-01-02T00:00:00.000Z" },
];
const headings: Heading[] = [
  { id: "h1", projectId: "p1", name: "Ship", sortOrder: 0, createdAt: "2026-01-03T00:00:00.000Z" },
];
const todos: Todo[] = [
  {
    id: "t1",
    title: "Write the post",
    completed: false,
    list: "anytime",
    projectId: "p1",
    headingId: "h1",
    tags: ["writing"],
    checklist: [{ id: "c1", text: "Draft", done: true }],
    sortOrder: 1000,
    createdAt: "2026-01-04T00:00:00.000Z",
  },
];

const input = { areas, projects, headings, todos, exportedAt: "2026-07-28T12:00:00.000Z" };

describe("buildBackup", () => {
  it("stamps the document so it can be recognised later", () => {
    const backup = buildBackup(input);
    expect(backup.app).toBe("zings");
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.exportedAt).toBe("2026-07-28T12:00:00.000Z");
  });

  it("keeps every field the app actually uses", () => {
    const backup = buildBackup(input);
    expect(backup.todos[0]).toMatchObject({
      id: "t1",
      title: "Write the post",
      projectId: "p1",
      headingId: "h1",
      tags: ["writing"],
      checklist: [{ id: "c1", text: "Draft", done: true }],
      sortOrder: 1000,
    });
  });

  it("drops columns that aren't part of the contract", () => {
    // v1 databases still carry an unused `starred` column; exporting it would
    // break an import into a clean v2 schema.
    const polluted = [{ ...todos[0], starred: true, someFutureColumn: 1 } as unknown as Todo];
    const backup = buildBackup({ ...input, todos: polluted });
    expect(backup.todos[0]).not.toHaveProperty("starred");
    expect(backup.todos[0]).not.toHaveProperty("someFutureColumn");
  });

  it("round-trips through JSON unchanged", () => {
    const backup = buildBackup(input);
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
  });
});

describe("parseBackup", () => {
  it("rejects junk", () => {
    expect(() => parseBackup("not json")).toThrow(BackupError);
    expect(() => parseBackup("[]")).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ app: "other", todos: [] }))).toThrow(BackupError);
  });

  it("rejects a backup from a newer Zings", () => {
    const doc = JSON.stringify({ app: "zings", version: BACKUP_VERSION + 1, todos: [] });
    expect(() => parseBackup(doc)).toThrow(/newer version/i);
  });

  it("accepts an older backup and defaults the missing collections", () => {
    const doc = JSON.stringify({ app: "zings", version: 1, todos: [{ id: "t", title: "Old" }] });
    const parsed = parseBackup(doc);
    expect(parsed.areas).toEqual([]);
    expect(parsed.headings).toEqual([]);
    expect(parsed.todos).toHaveLength(1);
  });

  it("skips malformed to-do rows rather than importing them", () => {
    const doc = JSON.stringify({
      app: "zings",
      version: BACKUP_VERSION,
      todos: [{ id: "ok", title: "Fine" }, { id: 42 }, null, { title: "No id" }],
    });
    expect(parseBackup(doc).todos.map((t) => t.id)).toEqual(["ok"]);
  });

  it("complains when the file has no to-dos array at all", () => {
    expect(() => parseBackup(JSON.stringify({ app: "zings", version: 2 }))).toThrow(/no to-dos/i);
  });
});
