export type TodoList = "inbox" | "today" | "upcoming" | "anytime" | "someday" | "logbook";

/** One step inside a to-do. Stored as a jsonb array on the row. */
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type RepeatFreq = "day" | "week" | "month" | "year";

export interface RepeatRule {
  freq: RepeatFreq;
  /** Every N days / weeks / months / years. */
  interval: number;
  /**
   * freq === "week": which days (0 = Sunday … 6 = Saturday).
   * freq === "month" with `monthWeek`: the one weekday of that week.
   */
  weekdays?: number[];
  /** Only for freq === "month": the nth weekday of the month (1–4, -1 = last). */
  monthWeek?: number;
  /**
   * "schedule" advances from the planned date, so a weekly task stays on its
   * weekday even if you tick it late. "completion" counts from the day you
   * actually finished — right for "water the plants every 3 days".
   */
  from: "schedule" | "completion";
}

export interface Todo {
  id: string;
  title: string;
  notes?: string | null;
  completed: boolean;
  completedAt?: string | null; // ISO datetime
  startedAt?: string | null; // ISO datetime — when timer started
  lastedMs?: number | null; // duration in ms when completed or paused
  list: TodoList;
  projectId?: string | null;
  headingId?: string | null;

  /** "When" — the day you plan to work on it. */
  dueDate?: string | null; // local calendar date, YYYY-MM-DD
  dueTime?: string | null; // "HH:MM" — exact start time on dueDate
  /** Today's second half: renders under a "This Evening" divider. */
  evening?: boolean;

  /** "Deadline" — the day it must be done by. Independent of dueDate. */
  deadline?: string | null; // YYYY-MM-DD

  estimateMin?: number | null; // estimated duration in minutes
  /** 1 low, 2 medium, 3 high; null for none. */
  priority?: number | null;
  checklist?: ChecklistItem[] | null;
  tags?: string[] | null;
  repeatRule?: RepeatRule | null;
  /**
   * Repeating to-dos only: how many instances in a row have been ticked off on
   * or before their planned day. Travels to the next instance when this one is
   * completed; a late tick starts the run over at 1.
   */
  streak?: number | null;

  /** Stored file names; read them through lib/attachments. */
  attachments?: string[];

  /** Manual ordering, synced through the database (fractional index). */
  sortOrder?: number | null;
  /** Soft delete — the row moves to Trash instead of disappearing. */
  deletedAt?: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  color?: string; // hex or tailwind color token
  areaId?: string | null;
  /** Only the next open to-do shows in Today / Anytime. */
  sequential?: boolean;
  /** User ids it is shared with (see ShareDialog). */
  members?: string[];
  /** The account that created it; absent on rows made on this device. */
  ownerId?: string;
  sortOrder?: number | null;
  createdAt: string;
}

export interface Area {
  id: string;
  name: string;
  color?: string | null;
  sortOrder?: number | null;
  createdAt: string;
}

export interface Heading {
  id: string;
  projectId: string;
  name: string;
  sortOrder?: number | null;
  createdAt: string;
}

/**
 * The Calendar section shows one month grid two ways: what is planned
 * ("schedule") and what was tracked ("activity"). The tab lives in the view so
 * shortcuts and Quick Find can jump straight to either half.
 */
export type CalendarTab = "schedule" | "activity";

export type View =
  | { kind: "list"; id: TodoList }
  | { kind: "project"; id: string }
  | { kind: "area"; id: string }
  | { kind: "tag"; id: string }
  | { kind: "trash" }
  | { kind: "calendar"; tab?: CalendarTab };
