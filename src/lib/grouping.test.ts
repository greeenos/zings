import { describe, expect, it } from "vitest";
import { groupTodos } from "./grouping";
import { Heading, Project, Todo } from "@/types/todo";

const todo = (over: Partial<Todo> & { id: string }): Todo => ({
  title: over.id,
  completed: false,
  list: "anytime",
  createdAt: "2026-07-01T10:00:00.000Z",
  ...over,
});

const projects: Project[] = [
  { id: "p1", name: "Work", color: "#3b82f6", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "p2", name: "Home", color: "#10b981", createdAt: "2026-01-02T00:00:00.000Z" },
];

const headings: Heading[] = [
  { id: "h1", projectId: "p1", name: "Research", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "h2", projectId: "p1", name: "Ship", createdAt: "2026-01-02T00:00:00.000Z" },
];

describe("groupTodos — project grouping", () => {
  it("labels the unfiled run only when there is a project to contrast with", () => {
    const solo = groupTodos({
      view: { kind: "list", id: "anytime" },
      todos: [todo({ id: "a" }), todo({ id: "b" })],
      projects,
      headings,
    });
    expect(solo).toHaveLength(1);
    expect(solo[0].label).toBeUndefined();

    const mixed = groupTodos({
      view: { kind: "list", id: "anytime" },
      todos: [todo({ id: "a" }), todo({ id: "b", projectId: "p1" })],
      projects,
      headings,
    });
    expect(mixed.map((s) => s.label)).toEqual(["Inbox tasks", "Work"]);
  });

  it("carries the project colour onto the header", () => {
    const sections = groupTodos({
      view: { kind: "list", id: "anytime" },
      todos: [todo({ id: "a", projectId: "p2" })],
      projects,
      headings,
    });
    expect(sections[0].color).toBe("#10b981");
  });

  it("never reorders — it only breaks where the input already changes group", () => {
    const sections = groupTodos({
      view: { kind: "list", id: "anytime" },
      todos: [
        todo({ id: "a", projectId: "p1" }),
        todo({ id: "b", projectId: "p2" }),
        todo({ id: "c", projectId: "p1" }),
      ],
      projects,
      headings,
    });
    // Three runs, because p1 appears twice in the input order.
    expect(sections.map((s) => s.todos.map((t) => t.id))).toEqual([["a"], ["b"], ["c"]]);
  });
});

describe("groupTodos — Today", () => {
  it("splits This Evening out below the daytime work", () => {
    const sections = groupTodos({
      view: { kind: "list", id: "today" },
      todos: [
        todo({ id: "morning" }),
        todo({ id: "dinner", evening: true }),
        todo({ id: "noon" }),
      ],
      projects,
      headings,
    });
    expect(sections.map((s) => s.kind)).toEqual(["inbox", "evening"]);
    expect(sections[0].todos.map((t) => t.id)).toEqual(["morning", "noon"]);
    expect(sections[1].label).toBe("This Evening");
    expect(sections[1].todos.map((t) => t.id)).toEqual(["dinner"]);
  });

  it("omits the evening section when nothing is deferred", () => {
    const sections = groupTodos({
      view: { kind: "list", id: "today" },
      todos: [todo({ id: "a" })],
      projects,
      headings,
    });
    expect(sections.some((s) => s.kind === "evening")).toBe(false);
  });
});

describe("groupTodos — Upcoming and Logbook", () => {
  it("groups Upcoming by scheduled day", () => {
    const sections = groupTodos({
      view: { kind: "list", id: "upcoming" },
      todos: [
        todo({ id: "a", dueDate: "2026-08-03" }),
        todo({ id: "b", dueDate: "2026-08-03" }),
        todo({ id: "c", dueDate: "2026-08-04" }),
      ],
      projects,
      headings,
    });
    expect(sections.map((s) => s.key)).toEqual(["day:2026-08-03", "day:2026-08-04"]);
    expect(sections[0].todos).toHaveLength(2);
    expect(sections.every((s) => s.kind === "day")).toBe(true);
  });

  it("groups the Logbook by the local day a task was completed", () => {
    const sections = groupTodos({
      view: { kind: "list", id: "logbook" },
      todos: [
        todo({ id: "a", completed: true, completedAt: new Date(2026, 6, 20, 9, 0).toISOString() }),
        todo({ id: "b", completed: true, completedAt: new Date(2026, 6, 20, 22, 30).toISOString() }),
        todo({ id: "c", completed: true, completedAt: new Date(2026, 6, 19, 8, 0).toISOString() }),
      ],
      projects,
      headings,
    });
    expect(sections).toHaveLength(2);
    expect(sections[0].todos.map((t) => t.id)).toEqual(["a", "b"]);
    expect(sections[1].todos.map((t) => t.id)).toEqual(["c"]);
  });

  it("files never-timestamped completions under Earlier", () => {
    const sections = groupTodos({
      view: { kind: "list", id: "logbook" },
      todos: [todo({ id: "a", completed: true })],
      projects,
      headings,
    });
    expect(sections[0].label).toBe("Earlier");
  });
});

describe("groupTodos — projects and headings", () => {
  it("puts unsectioned to-dos above the first heading", () => {
    const sections = groupTodos({
      view: { kind: "project", id: "p1" },
      todos: [
        todo({ id: "loose", projectId: "p1" }),
        todo({ id: "r1", projectId: "p1", headingId: "h1" }),
        todo({ id: "s1", projectId: "p1", headingId: "h2" }),
      ],
      projects,
      headings,
    });
    expect(sections.map((s) => s.label)).toEqual([undefined, "Research", "Ship"]);
    expect(sections[0].kind).toBe("plain");
  });

  it("falls back gracefully when a heading row is missing", () => {
    const sections = groupTodos({
      view: { kind: "project", id: "p1" },
      todos: [todo({ id: "x", projectId: "p1", headingId: "gone" })],
      projects,
      headings,
    });
    expect(sections[0].label).toBe("Section");
  });
});

describe("groupTodos — flat views", () => {
  it("does not group Trash or a tag view", () => {
    for (const view of [{ kind: "trash" } as const, { kind: "tag", id: "urgent" } as const]) {
      const sections = groupTodos({
        view,
        todos: [todo({ id: "a", projectId: "p1" }), todo({ id: "b" })],
        projects,
        headings,
      });
      expect(sections).toHaveLength(1);
      expect(sections[0].kind).toBe("plain");
    }
  });

  it("returns nothing for an empty list", () => {
    expect(
      groupTodos({ view: { kind: "list", id: "inbox" }, todos: [], projects, headings }),
    ).toEqual([]);
  });
});
