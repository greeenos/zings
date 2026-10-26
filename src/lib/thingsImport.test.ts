// @vitest-environment node
import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { stableId, thingsDate, thingsTime, thingsToBackup } from "./thingsImport";

const packDate = (y: number, m: number, d: number) => (y << 16) | (m << 12) | (d << 7);

// The parts of Things 3's schema the import reads (see things.py).
async function thingsFixture() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE TMArea (uuid TEXT, title TEXT, "index" INTEGER);
    CREATE TABLE TMTask (uuid TEXT, type INTEGER, status INTEGER, trashed INTEGER, title TEXT, notes TEXT,
      start INTEGER, startDate INTEGER, startBucket INTEGER, deadline INTEGER, reminderTime INTEGER,
      stopDate REAL, creationDate REAL, project TEXT, area TEXT, heading TEXT, "index" INTEGER,
      rt1_recurrenceRule BLOB);
    CREATE TABLE TMTag (uuid TEXT, title TEXT);
    CREATE TABLE TMTaskTag (tasks TEXT, tags TEXT);
    CREATE TABLE TMChecklistItem (uuid TEXT, task TEXT, title TEXT, status INTEGER, "index" INTEGER);

    INSERT INTO TMArea VALUES ('A1', 'Work', 0);
    INSERT INTO TMTask (uuid, type, status, trashed, title, area, "index", creationDate) VALUES
      ('P1', 1, 0, 0, 'Launch', 'A1', 1, 1760000000),
      ('P2', 1, 3, 0, 'Old project', NULL, 2, 1760000000),
      ('H1', 2, 0, 0, 'Prep', NULL, 0, 1760000000);
    UPDATE TMTask SET project = 'P1' WHERE uuid = 'H1';
    INSERT INTO TMTask (uuid, type, status, trashed, title, notes, start, startDate, startBucket, reminderTime, heading, "index", creationDate) VALUES
      ('T1', 0, 0, 0, 'Write script', '<note xml:space="preserve">Hook &amp; outro</note>', 1, ${packDate(2026, 10, 24)}, 1, ${(9 << 26) | (30 << 20)}, 'H1', 3, 1760000000);
    INSERT INTO TMTask (uuid, type, status, trashed, title, start, startDate, deadline, area, "index", creationDate) VALUES
      ('T2', 0, 0, 0, 'Renew passport', 2, ${packDate(2026, 11, 3)}, ${packDate(2026, 11, 10)}, 'A1', 4, 1760000000);
    INSERT INTO TMTask (uuid, type, status, trashed, title, start, project, stopDate, "index", creationDate) VALUES
      ('T3', 0, 3, 0, 'Shipped thing', 1, 'P2', 1761000000, 5, 1760000000),
      ('T4', 0, 0, 1, 'Binned', 0, NULL, NULL, 6, 1760000000),
      ('T5', 0, 0, 0, 'Inbox idea', 0, NULL, NULL, 7, 1760000000);
    INSERT INTO TMTask (uuid, type, status, trashed, title, start, rt1_recurrenceRule) VALUES
      ('R1', 0, 0, 0, 'Weekly review template', 1, x'00');
    INSERT INTO TMTag VALUES ('G1', 'video');
    INSERT INTO TMTaskTag VALUES ('T1', 'G1');
    INSERT INTO TMChecklistItem VALUES ('C1', 'T1', 'Intro', 3, 0), ('C2', 'T1', 'Demo', 0, 1);
  `);
  return {
    all(sql: string) {
      const [result] = db.exec(sql);
      return result ? result.values.map((v) => Object.fromEntries(result.columns.map((c, i) => [c, v[i]]))) : [];
    },
  };
}

describe("Things 3 import", () => {
  it("decodes Things' packed dates and times", () => {
    expect(thingsDate(packDate(2026, 2, 9))).toBe("2026-02-09");
    expect(thingsTime((14 << 26) | (5 << 20))).toBe("14:05");
    expect(thingsDate(null)).toBeNull();
  });

  it("gives every Things id one stable UUID-shaped id", () => {
    expect(stableId("T1")).toBe(stableId("T1"));
    expect(stableId("T1")).not.toBe(stableId("T2"));
    expect(stableId("8dHt1Kq3oXwYp7LmZ")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("maps areas, open projects, headings and to-dos onto Zings", async () => {
    const backup = thingsToBackup(await thingsFixture(), "2026-10-24", "2026-10-24T12:00:00.000Z");
    const byTitle = Object.fromEntries(backup.todos.map((t) => [t.title, t]));

    expect(backup.areas.map((a) => a.name)).toEqual(["Work"]);
    expect(backup.projects.map((p) => p.name)).toEqual(["Launch"]);
    expect(backup.projects[0].areaId).toBe(backup.areas[0].id);
    expect(backup.headings).toMatchObject([{ name: "Prep", projectId: backup.projects[0].id }]);

    expect(byTitle["Write script"]).toMatchObject({
      list: "today",
      dueDate: "2026-10-24",
      dueTime: "09:30",
      evening: true,
      notes: "Hook & outro",
      tags: ["video"],
      projectId: backup.projects[0].id,
      headingId: backup.headings[0].id,
      checklist: [
        { text: "Intro", done: true },
        { text: "Demo", done: false },
      ],
    });
    // Scheduled for later → Upcoming; an area-only to-do keeps its area as a tag.
    expect(byTitle["Renew passport"]).toMatchObject({ list: "anytime", dueDate: "2026-11-03", deadline: "2026-11-10", tags: ["Work"] });
    // Its project was completed, so it lands unfiled in the Logbook.
    expect(byTitle["Shipped thing"]).toMatchObject({ completed: true, projectId: null, completedAt: new Date(1761000000 * 1000).toISOString() });
    expect(byTitle["Binned"].deletedAt).toBe("2026-10-24T12:00:00.000Z");
    expect(byTitle["Inbox idea"].list).toBe("inbox");
    expect(byTitle["Weekly review template"]).toBeUndefined();
  });
});
