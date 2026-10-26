/**
 * Turning a flat, already-sorted to-do array into the sections a view renders.
 *
 * The input order is authoritative — these functions only ever *break* the
 * list where a header belongs, never reorder it. That keeps sorting (manual
 * position, chronology, running-timer-first) in one place and grouping in
 * another.
 */

import { Heading, Project, Todo, View } from "@/types/todo";
import { addLocalDaysKey, fmt, keyToDate, localDateKey } from "@/lib/date";

type SectionKind = "plain" | "project" | "inbox" | "evening" | "day" | "heading";

export interface TodoSection {
  key: string;
  kind: SectionKind;
  label?: string;
  color?: string;
  /** Id of the project / heading this section stands for, when it has one. */
  refId?: string;
  todos: Todo[];
}

/** "Today" / "Tomorrow" / "Monday, 3 August" — how a day header reads. */
function dayLabel(key: string): string {
  const now = new Date();
  if (key === localDateKey(now)) return "Today";
  if (key === addLocalDaysKey(now, 1)) return "Tomorrow";
  if (key === addLocalDaysKey(now, -1)) return "Yesterday";
  return fmt(keyToDate(key), { weekday: "long", month: "long", day: "numeric" });
}

/** Local calendar day of an ISO instant. */
const instantDayKey = (iso: string) => localDateKey(new Date(iso));

/** Break wherever `keyOf` changes, building one section per run. */
function runs<T>(
  items: T[],
  keyOf: (item: T) => string,
  make: (key: string, group: T[]) => TodoSection,
): TodoSection[] {
  const out: TodoSection[] = [];
  let current: T[] = [];
  let currentKey: string | null = null;

  for (const item of items) {
    const k = keyOf(item);
    if (currentKey === null) {
      currentKey = k;
    } else if (k !== currentKey) {
      out.push(make(currentKey, current));
      current = [];
      currentKey = k;
    }
    current.push(item);
  }
  if (currentKey !== null) out.push(make(currentKey, current));
  return out;
}

function byProject(todos: Todo[], projects: Project[], keyPrefix: string): TodoSection[] {
  const anyProject = todos.some((t) => !!t.projectId);
  return runs(
    todos,
    (t) => t.projectId ?? "__inbox__",
    (key, group) => {
      if (key === "__inbox__") {
        return {
          key: `${keyPrefix}:inbox`,
          kind: "inbox",
          // A lone unfiled group needs no header — there is nothing to contrast with.
          label: anyProject ? "Inbox tasks" : undefined,
          todos: group,
        };
      }
      const project = projects.find((p) => p.id === key);
      return {
        key: `${keyPrefix}:project:${key}`,
        kind: "project",
        label: project?.name ?? "Project",
        color: project?.color,
        refId: key,
        todos: group,
      };
    },
  );
}

interface GroupParams {
  view: View;
  todos: Todo[];
  projects: Project[];
  headings: Heading[];
}

export function groupTodos({ view, todos, projects, headings }: GroupParams): TodoSection[] {
  if (todos.length === 0) return [];

  if (view.kind === "trash" || view.kind === "tag") {
    return [{ key: "all", kind: "plain", todos }];
  }

  if (view.kind === "project") {
    // Unsectioned to-dos sit above the first heading, exactly as they do when
    // you add a heading half-way through a project.
    const sections = runs(
      todos,
      (t) => t.headingId ?? "__none__",
      (key, group) => {
        if (key === "__none__") {
          return { key: "heading:none", kind: "plain", todos: group };
        }
        const heading = headings.find((h) => h.id === key);
        return {
          key: `heading:${key}`,
          kind: "heading",
          label: heading?.name ?? "Section",
          refId: key,
          todos: group,
        };
      },
    );
    return sections;
  }

  if (view.kind === "area") {
    return byProject(todos, projects, "area");
  }

  if (view.kind === "list") {
    if (view.id === "today") {
      // "This Evening" is a hard split: everything below it is explicitly
      // deferred to the end of the day, so it never mixes with daytime work.
      const day = todos.filter((t) => !t.evening);
      const evening = todos.filter((t) => t.evening);
      const sections = byProject(day, projects, "today");
      if (evening.length > 0) {
        sections.push({ key: "today:evening", kind: "evening", label: "This Evening", todos: evening });
      }
      return sections;
    }

    if (view.id === "upcoming") {
      return runs(
        todos,
        (t) => t.dueDate ?? "",
        (key, group) => ({
          key: `day:${key}`,
          kind: "day",
          label: key ? dayLabel(key) : "Someday",
          todos: group,
        }),
      );
    }

    if (view.id === "logbook") {
      return runs(
        todos,
        (t) => (t.completedAt ? instantDayKey(t.completedAt) : ""),
        (key, group) => ({
          key: `day:${key || "unknown"}`,
          kind: "day",
          label: key ? dayLabel(key) : "Earlier",
          todos: group,
        }),
      );
    }

    return byProject(todos, projects, view.id);
  }

  return [{ key: "all", kind: "plain", todos }];
}
