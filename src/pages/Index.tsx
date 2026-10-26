import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  CalendarClock,
  CalendarDays,
  Hourglass,
  Inbox,
  Layers,
  Menu,
  MoreHorizontal,
  Moon,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  UserRound,
  X,
} from "@/lib/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "@/lib/motion";
import { useTodos } from "@/hooks/useTodos";
import { useProjects } from "@/hooks/useProjects";
import { useAreas } from "@/hooks/useAreas";
import { useHeadings } from "@/hooks/useHeadings";
import { useReminders } from "@/hooks/useReminders";
import { useSelection } from "@/hooks/useSelection";
import { useAppBadge } from "@/hooks/useAppBadge";
import { Sidebar, ProjectProgress } from "@/components/todo/Sidebar";
import { TodoList } from "@/components/todo/TodoList";
import { AddTodo, AddTodoInput, inputFromText } from "@/components/todo/AddTodo";
import { FocusBar } from "@/components/todo/FocusBar";
import { EmptyArt } from "@/components/todo/EmptyState";
import { useNoteCipher } from "@/hooks/useNoteCipher";
import { Project, Todo, TodoList as TodoListType, View } from "@/types/todo";
import { ShareDialog } from "@/components/todo/ShareDialog";
import { EventList } from "@/components/todo/EventList";
import { CaptureDialog } from "@/components/todo/CaptureDialog";
import { aiAvailable } from "@/lib/ai";
import { loadBilling } from "@/lib/billing";
import { toast } from "@/lib/toast";
import { eventsOn, useCalendarEvents } from "@/hooks/useCalendarEvents";
import { fmt, localDateKey } from "@/lib/date";
import { groupTodos } from "@/lib/grouping";
import { orderForInsertAt } from "@/lib/order";

const CalendarBoard = lazy(() => import("@/components/todo/CalendarBoard"));

// Overlays: none of them are on screen at first paint, so they stay out of the
// task-list bundle and are fetched on demand (warmed up once the app goes idle).
const KeyboardShortcuts = lazy(() => import("@/components/todo/KeyboardShortcuts"));
const Onboarding = lazy(() => import("@/components/todo/Onboarding"));
const EncryptionDialog = lazy(() => import("@/components/todo/EncryptionDialog"));
const SettingsDialog = lazy(() => import("@/components/todo/SettingsDialog"));
const AccountDialog = lazy(() => import("@/components/todo/AccountDialog"));
const QuickFind = lazy(() => import("@/components/todo/QuickFind"));

const prefetchOverlays = () => {
  void import("@/components/todo/QuickFind");
  void import("@/components/todo/SettingsDialog");
  void import("@/components/todo/AccountDialog");
  void import("@/components/todo/KeyboardShortcuts");
  void import("@/components/todo/EncryptionDialog");
};

/**
 * Latches to `true` the first time an overlay opens. Keeping it mounted after
 * that costs nothing and lets the close animation play out — unmounting on
 * `open === false` would cut every exit transition short.
 */
function useMountedOnce(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  return mounted;
}

const listTitles: Record<
  TodoListType,
  { title: string; empty: string; hint?: string; art: EmptyArt }
> = {
  inbox: { title: "Inbox", empty: "Your inbox is empty", hint: "Capture every thought here.", art: "inbox" },
  today: { title: "Today", empty: "Enjoy your day", hint: "Nothing scheduled.", art: "today" },
  upcoming: { title: "Upcoming", empty: "Nothing planned", hint: "Schedule a to-do and it shows up here.", art: "upcoming" },
  anytime: { title: "Anytime", empty: "All caught up", art: "anytime" },
  someday: { title: "Someday", empty: "No ideas for later", hint: "Park the maybes here.", art: "someday" },
  logbook: { title: "Logbook", empty: "Nothing completed yet", art: "logbook" },
};

/** Lists read best at Things' width; the calendar keeps the whole window. */
const READING_COLUMN = "mx-auto lg:max-w-[52rem]";

/** Which open to-dos each built-in list shows on `today`. The Logbook is simply the completed ones. */
const LIST_MATCH: Record<Exclude<TodoListType, "logbook">, (t: Todo, today: string) => boolean> = {
  inbox: (t) => t.list === "inbox" && !t.dueDate,
  // A looming deadline surfaces in Today even when the task is scheduled for
  // another day — that is the whole point of having deadlines.
  today: (t, today) =>
    t.list === "today" || (!!t.dueDate && t.dueDate <= today) || (!!t.deadline && t.deadline <= today),
  upcoming: (t, today) => !!t.dueDate && t.dueDate > today,
  anytime: (t, today) => t.list === "anytime" && (!t.dueDate || t.dueDate <= today),
  someday: (t) => t.list === "someday",
};

const ONBOARDING_KEY = "zings-onboarding-v1";

const TaskListSkeleton = () => (
  <div className="animate-pulse" aria-label="Loading tasks">
    {[0, 1, 2, 3].map((item) => (
      <div key={item} className="flex items-center gap-3 px-2 py-3">
        <span className="h-[19px] w-[19px] rounded-[5px] bg-muted" />
        <span className="h-4 rounded bg-muted" style={{ width: `${58 + item * 7}%` }} />
      </div>
    ))}
  </div>
);

const Index = () => {
  const {
    todos,
    loading,
    addTodo,
    updateTodo,
    bulkUpdate,
    toggleTodo,
    setChecklist,
    startTimer,
    stopTimer,
    deleteTodo,
    deleteTodos,
    restoreTodo,
    purgeTodo,
    emptyTrash,
    reorderTodos,
    detachProject,
    attachProject,
  } = useTodos();
  const {
    projects,
    addProject,
    deleteProject,
    recolorProject,
    renameProject,
    setProjectArea,
    setProjectSequential,
  } = useProjects();
  const { areas, addArea, renameArea, deleteArea } = useAreas();
  const { headings, addHeading, deleteHeading } = useHeadings();

  const [view, setView] = useState<View>({ kind: "list", id: "today" });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sortDir, setSortDir] = useState<"manual" | "newest" | "oldest">("manual");
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [encryptionOpen, setEncryptionOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const [sharing, setSharing] = useState<Project | null>(null);
  const [captureText, setCaptureText] = useState<string | null>(null);
  // The plan decides whether AI works without an own key; re-render once it's known.
  const [, setBillingLoaded] = useState(false);
  useEffect(() => {
    void loadBilling().then(() => setBillingLoaded(true));
    const result = new URLSearchParams(window.location.search).get("billing");
    if (result) {
      if (result === "success") toast.success("Payment received — thank you! Pro is on.");
      else toast.message("Payment cancelled");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  const [accountOpen, setAccountOpen] = useState(false);
  const [quickFindOpen, setQuickFindOpen] = useState(false);
  const [addOpenSignal, setAddOpenSignal] = useState(0);
  const [addInitialTitle, setAddInitialTitle] = useState<string | undefined>(undefined);
  const [addSortOrder, setAddSortOrder] = useState<number | undefined>(undefined);
  const cipher = useNoteCipher();
  const reminders = useReminders(todos);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const list = params.get("list");
    const isList = (v: string | null): v is TodoListType =>
      v === "inbox" || v === "today" || v === "upcoming" || v === "anytime" || v === "someday" || v === "logbook";
    if (isList(list)) setView({ kind: "list", id: list });
    else if (list === "calendar") setView({ kind: "calendar", tab: "schedule" });
    const share = params.get("share");
    // Quick-add deep link: /?add=<text>. Also the target of the web+zings://
    // protocol handler, which arrives as add="web+zings://<text>" — strip that prefix.
    let add = params.get("add");
    if (add) add = add.replace(/^web\+zings:\/\//i, "").trim();
    const wantsNew = params.get("new") === "1";
    if (share || add || wantsNew) {
      const prefill = share || add || "";
      if (prefill) setAddInitialTitle(prefill);
      setAddOpenSignal((v) => v + 1);
    }
    if (list || share || add || wantsNew) {
      const url = new URL(window.location.href);
      ["list", "share", "add", "new"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams}` : "") + url.hash);
    }
  }, []);

  // Warm the overlay chunks once the app has settled, so ⌘K / Settings open
  // instantly even though they aren't part of the initial bundle.
  useEffect(() => {
    const idle = window.requestIdleCallback;
    if (idle) {
      const handle = idle(prefetchOverlays, { timeout: 4000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(prefetchOverlays, 2000);
    return () => window.clearTimeout(timer);
  }, []);

  // The drawer is only used below the desktop breakpoint. Close it when the
  // viewport grows so a later resize back to mobile never restores a stale
  // overlay.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const handleBreakpoint = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) setMobileOpen(false);
    };
    handleBreakpoint(desktop);
    desktop.addEventListener("change", handleBreakpoint);
    return () => desktop.removeEventListener("change", handleBreakpoint);
  }, []);

  // Safari can restore a hidden horizontal page offset when a PWA window is
  // resized or reopened. The app scrolls only inside its content panels, so
  // the document itself must always stay anchored at the top-left corner.
  useEffect(() => {
    const resetDocumentOffset = () => {
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
    };

    resetDocumentOffset();
    window.addEventListener("resize", resetDocumentOffset);
    window.addEventListener("orientationchange", resetDocumentOffset);
    window.visualViewport?.addEventListener("resize", resetDocumentOffset);

    return () => {
      window.removeEventListener("resize", resetDocumentOffset);
      window.removeEventListener("orientationchange", resetDocumentOffset);
      window.visualViewport?.removeEventListener("resize", resetDocumentOffset);
    };
  }, []);

  // Auto-prompt for unlock once when the user has encryption enabled but the session is locked.
  useEffect(() => {
    if (cipher.enabled && !cipher.unlocked) setEncryptionOpen(true);
  }, [cipher.enabled, cipher.unlocked]);

  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === "1";
    } catch {
      return false;
    }
  });

  const live = useMemo(() => todos.filter((t) => !t.deletedAt), [todos]);
  const todayKey = localDateKey();
  const calendarEvents = useCalendarEvents(todayKey, todayKey);
  const trashed = useMemo(() => todos.filter((t) => !!t.deletedAt), [todos]);

  // Sequential projects: every open to-do after the first waits its turn and
  // stays out of Today, Anytime, tags and counts (it still shows in its project).
  const waiting = useMemo(() => {
    const sequential = new Set(projects.filter((p) => p.sequential).map((p) => p.id));
    const out = new Set<string>();
    if (!sequential.size) return out;
    const pos = (t: Todo) => t.sortOrder ?? -new Date(t.createdAt).getTime();
    const firstOf = new Map<string, Todo>();
    for (const t of live) {
      if (t.completed || !t.projectId || !sequential.has(t.projectId)) continue;
      const first = firstOf.get(t.projectId);
      if (!first || pos(t) < pos(first)) {
        if (first) out.add(first.id);
        firstOf.set(t.projectId, t);
      } else {
        out.add(t.id);
      }
    }
    return out;
  }, [live, projects]);

  const filtered = useMemo(() => {
    if (view.kind === "calendar") return [];
    const today = localDateKey();

    if (view.kind === "trash") {
      return [...trashed].sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
    }

    let result: Todo[];
    if (view.kind === "project") {
      result = live.filter((t) => t.projectId === view.id && !t.completed);
    } else if (view.kind === "area") {
      const inArea = new Set(projects.filter((p) => p.areaId === view.id).map((p) => p.id));
      result = live.filter((t) => t.projectId && inArea.has(t.projectId) && !t.completed && !waiting.has(t.id));
    } else if (view.kind === "tag") {
      result = live.filter((t) => !t.completed && (t.tags ?? []).includes(view.id) && !waiting.has(t.id));
    } else if (view.id === "logbook") {
      result = live.filter((t) => t.completed);
    } else {
      const match = LIST_MATCH[view.id];
      result = live.filter((t) => !t.completed && match(t, today) && !waiting.has(t.id));
    }

    // Upcoming reads best in chronological order (date, then time of day).
    if (view.kind === "list" && view.id === "upcoming") {
      return [...result].sort((a, b) => {
        const ak = `${a.dueDate ?? ""} ${a.dueTime ?? ""}`;
        const bk = `${b.dueDate ?? ""} ${b.dueTime ?? ""}`;
        return ak < bk ? -1 : ak > bk ? 1 : 0;
      });
    }

    // The Logbook is a diary: most recent first.
    if (view.kind === "list" && view.id === "logbook") {
      return [...result].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    }

    const posOf = (t: Todo) => t.sortOrder ?? -new Date(t.createdAt).getTime();

    // Group order: inbox (null) at the top, then projects in their array order.
    const projectOrder = new Map<string | null, number>([[null, 0]]);
    projects.forEach((p, i) => projectOrder.set(p.id, i + 1));

    // Inside a project, unsectioned to-dos come first, then each heading.
    const headingOrder = new Map<string | null, number>([[null, 0]]);
    if (view.kind === "project") {
      headings
        .filter((h) => h.projectId === view.id)
        .forEach((h, i) => headingOrder.set(h.id, i + 1));
    }

    const groupByProject = view.kind === "list" || view.kind === "area";

    return [...result].sort((a, b) => {
      if (groupByProject) {
        const ag = projectOrder.get(a.projectId ?? null) ?? Number.MAX_SAFE_INTEGER;
        const bg = projectOrder.get(b.projectId ?? null) ?? Number.MAX_SAFE_INTEGER;
        if (ag !== bg) return ag - bg;
      }
      if (view.kind === "project") {
        const ah = headingOrder.get(a.headingId ?? null) ?? Number.MAX_SAFE_INTEGER;
        const bh = headingOrder.get(b.headingId ?? null) ?? Number.MAX_SAFE_INTEGER;
        if (ah !== bh) return ah - bh;
      }
      const aRunning = !!a.startedAt && !a.completed ? 1 : 0;
      const bRunning = !!b.startedAt && !b.completed ? 1 : 0;
      if (aRunning !== bRunning) return bRunning - aRunning;
      if (sortDir === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortDir === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return posOf(a) - posOf(b);
    });
  }, [live, trashed, view, sortDir, projects, headings, waiting]);

  const sections = useMemo(
    () => groupTodos({ view, todos: filtered, projects, headings }),
    [view, filtered, projects, headings],
  );

  const visibleIds = useMemo(() => filtered.map((t) => t.id), [filtered]);
  const selection = useSelection(visibleIds);

  // Sidebar badges: one pass over the list rather than a filter per counter.
  const { counts, projectCounts, projectProgress, tags } = useMemo(() => {
    const today = localDateKey();
    const counts: Record<TodoListType, number> = {
      inbox: 0, today: 0, upcoming: 0, anytime: 0, someday: 0, logbook: 0,
    };
    const projectCounts: Record<string, number> = {};
    const projectProgress: Record<string, ProjectProgress> = {};
    const tagCounts = new Map<string, number>();

    for (const t of live) {
      if (t.projectId) {
        const p = projectProgress[t.projectId] ?? { done: 0, total: 0 };
        p.total += 1;
        if (t.completed) p.done += 1;
        projectProgress[t.projectId] = p;
      }

      if (t.completed) {
        counts.logbook += 1;
        continue;
      }

      for (const tag of t.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      if (t.projectId) projectCounts[t.projectId] = (projectCounts[t.projectId] ?? 0) + 1;

      if (waiting.has(t.id)) continue;
      for (const list of Object.keys(LIST_MATCH) as Array<keyof typeof LIST_MATCH>) {
        if (LIST_MATCH[list](t, today)) counts[list] += 1;
      }
    }

    const tags = [...tagCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return { counts, projectCounts, projectProgress, tags };
  }, [live, waiting]);

  const knownTags = useMemo(() => tags.map((t) => t.name), [tags]);

  useAppBadge(counts.today);

  const activeProject = view.kind === "project" ? projects.find((p) => p.id === view.id) : undefined;
  const activeArea = view.kind === "area" ? areas.find((a) => a.id === view.id) : undefined;

  let headerTitle = "Calendar";
  let headerEmpty = "";
  let headerHint: string | undefined;
  let headerColor: string | undefined;
  let headerArt: EmptyArt = "anytime";
  if (view.kind === "list") {
    const meta = listTitles[view.id];
    headerTitle = meta.title;
    headerEmpty = meta.empty;
    headerHint = meta.hint;
    headerArt = meta.art;
  } else if (view.kind === "project") {
    headerTitle = activeProject?.name ?? "Project";
    headerEmpty = "No tasks in this project yet";
    headerHint = "Add one with the + button.";
    headerColor = activeProject?.color;
    headerArt = "project";
  } else if (view.kind === "area") {
    headerTitle = activeArea?.name ?? "Area";
    headerEmpty = "Nothing in this area";
    headerHint = "Its projects' to-dos gather here.";
    headerArt = "project";
  } else if (view.kind === "tag") {
    headerTitle = `#${view.id}`;
    headerEmpty = "No to-dos with this tag";
    headerArt = "tag";
  } else if (view.kind === "trash") {
    headerTitle = "Trash";
    headerEmpty = "Trash is empty";
    headerHint = "Deleted to-dos wait here until you clear them.";
    headerArt = "trash";
  }

  const today = fmt(new Date(), { weekday: "long", month: "long", day: "numeric" });

  const handleDeleteProject = async (id: string) => {
    // Snapshot which todos belong to this project before we unassign them, so
    // Undo can re-attach them. (The FK is ON DELETE SET NULL, so the delete
    // itself never fails — detaching just gives immediate local UI feedback.)
    const affectedTodoIds = live.filter((t) => t.projectId === id).map((t) => t.id);
    await detachProject(id);
    await deleteProject(id, affectedTodoIds, attachProject);
    if (view.kind === "project" && view.id === id) {
      setView({ kind: "list", id: "today" });
    }
  };

  const handleDeleteArea = async (id: string) => {
    await deleteArea(id);
    if (view.kind === "area" && view.id === id) setView({ kind: "list", id: "today" });
  };

  const handleAddTodo = (input: AddTodoInput) => {
    const todayStr = localDateKey();

    // Where the task lands: an explicit @-tag wins, then a project (tag or view),
    // then the current list view, else the inbox.
    let list: TodoListType =
      input.list ??
      (input.projectId
        ? "anytime"
        : view.kind === "project" || view.kind === "area"
          ? "anytime"
          : view.kind === "list"
            ? view.id === "logbook" || view.id === "upcoming"
              ? "inbox"
              : view.id
            : "inbox");

    const projectId =
      input.projectId ?? (view.kind === "project" ? view.id : undefined);

    // Due date: an explicitly-parsed #date wins; otherwise the Today list implies today.
    let dueDate = input.dueDate;
    if (!dueDate && list === "today") dueDate = todayStr;

    // A scheduled task leaves Inbox/Someday. Future work hibernates in
    // Upcoming; today's and overdue work belongs in Today.
    if (dueDate) {
      list = dueDate > todayStr ? "anytime" : "today";
    }

    void addTodo({
      title: input.title,
      list,
      projectId,
      dueDate,
      dueTime: input.dueTime,
      estimateMin: input.estimateMin,
      priority: input.priority,
      deadline: input.deadline,
      evening: input.evening,
      repeatRule: input.repeatRule,
      tags: view.kind === "tag" ? [view.id] : undefined,
      sortOrder: input.sortOrder,
    });
    setAddSortOrder(undefined);
  };

  /**
   * Magic Plus: the + button was dropped onto a row, so the new to-do takes a
   * position immediately above it instead of landing at the top of the list.
   */
  const handleMagicDrop = useCallback(
    (beforeTodoId: string) => {
      const index = filtered.findIndex((t) => t.id === beforeTodoId);
      if (index < 0) return;
      const posOf = (t: Todo) => t.sortOrder ?? -new Date(t.createdAt).getTime();
      setAddSortOrder(orderForInsertAt(filtered.map(posOf), index));
      setAddOpenSignal((v) => v + 1);
    },
    [filtered],
  );

  type DefaultTarget =
    | { kind: "list"; id: TodoListType }
    | { kind: "project"; id: string }
    | undefined;
  const defaultTarget: DefaultTarget =
    view.kind === "project"
      ? { kind: "project", id: view.id }
      : view.kind === "list"
        ? { kind: "list", id: view.id === "logbook" || view.id === "upcoming" ? "inbox" : view.id }
        : undefined;

  const selectedIds = selection.selectedIds;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const applyToSelection = useCallback(
    (patch: Partial<Todo>) => {
      const ids = selectionRef.current.selectedIds;
      if (ids.length === 0) return;
      void bulkUpdate(ids, patch);
    },
    [bulkUpdate],
  );

  // Global keyboard shortcuts.
  useEffect(() => {
    const isTyping = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const onKey = (e: KeyboardEvent) => {
      const sel = selectionRef.current;

      // Esc closes overlays even when focus is elsewhere.
      if (e.key === "Escape") {
        if (cheatsheetOpen) setCheatsheetOpen(false);
        else if (mobileOpen) setMobileOpen(false);
        else if (sel.selectedIds.length > 0) sel.clear();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "k" || e.key.toLowerCase() === "f")) {
        e.preventDefault();
        setQuickFindOpen(true);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !isTyping(e.target)) {
        e.preventDefault();
        sel.selectAll();
        return;
      }

      // ⌘⌫ deletes the selection even while a field has focus elsewhere.
      if ((e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
        if (sel.selectedIds.length === 0) return;
        e.preventDefault();
        void deleteTodos(sel.selectedIds);
        return;
      }

      // Single-key shortcuts only fire when the user isn't typing into a field.
      if (isTyping(e.target)) return;

      // Arrows move the cursor; Shift+arrow grows the selection from the anchor.
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        if (e.shiftKey) sel.extend(delta);
        else sel.move(delta);
        return;
      }

      // Never hijack any other combo that carries a modifier.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const hasSelection = sel.selectedIds.length > 0;

      switch (e.key) {
        case "?": e.preventDefault(); setCheatsheetOpen(true); return;
        case "n":
        case "N": e.preventDefault(); setAddOpenSignal((v) => v + 1); return;
        case " ":
        case "x":
        case "X":
          if (!hasSelection) return;
          e.preventDefault();
          sel.selectedIds.forEach((id) => toggleTodo(id));
          return;
        case "Backspace":
        case "Delete":
          if (!hasSelection) return;
          e.preventDefault();
          void deleteTodos(sel.selectedIds);
          return;
        case "t":
        case "T":
          if (!hasSelection) return;
          e.preventDefault();
          applyToSelection({ list: "today", dueDate: localDateKey(), evening: false });
          return;
        case "e":
        case "E":
          if (!hasSelection) return;
          e.preventDefault();
          applyToSelection({ list: "today", dueDate: localDateKey(), evening: true });
          return;
        case "a":
        case "A":
          if (!hasSelection) return;
          e.preventDefault();
          applyToSelection({ list: "anytime", dueDate: null, dueTime: null, evening: false });
          return;
        case "s":
        case "S":
          if (!hasSelection) return;
          e.preventDefault();
          applyToSelection({ list: "someday", dueDate: null, dueTime: null, evening: false });
          return;
        // 1–6 — switch views
        case "1": e.preventDefault(); setView({ kind: "list", id: "inbox" }); return;
        case "2": e.preventDefault(); setView({ kind: "list", id: "today" }); return;
        case "3": e.preventDefault(); setView({ kind: "list", id: "anytime" }); return;
        case "4": e.preventDefault(); setView({ kind: "list", id: "logbook" }); return;
        case "5": e.preventDefault(); setView({ kind: "calendar", tab: "activity" }); return;
        case "6": e.preventDefault(); setView({ kind: "calendar", tab: "schedule" }); return;
        default:
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cheatsheetOpen, mobileOpen, applyToSelection, deleteTodos, toggleTodo]);

  const sidebarProps = {
    view,
    onChange: setView,
    counts,
    projects,
    projectCounts,
    projectProgress,
    areas,
    tags,
    trashCount: trashed.length,
    onAddProject: addProject,
    onDeleteProject: handleDeleteProject,
    onRecolorProject: recolorProject,
    onRenameProject: renameProject,
    onSetProjectArea: setProjectArea,
    onSetProjectSequential: setProjectSequential,
    onShareProject: setSharing,
    onAddArea: addArea,
    onDeleteArea: handleDeleteArea,
    onRenameArea: renameArea,
  };

  const showOnboarding =
    !loading && !onboardingDismissed && todos.length === 0 && projects.length === 0;
  const runningTodo = live.find((todo) => !!todo.startedAt && !todo.completed);

  const cheatsheetMounted = useMountedOnce(cheatsheetOpen);
  const quickFindMounted = useMountedOnce(quickFindOpen);
  const encryptionMounted = useMountedOnce(encryptionOpen);
  const settingsMounted = useMountedOnce(settingsOpen);
  const accountMounted = useMountedOnce(accountOpen);
  const onboardingMounted = useMountedOnce(showOnboarding);

  const handleOnboardingAccept = async () => {
    const samples: Array<{ name: string; color: string; sampleTitle: string }> = [
      { name: "Work", color: "#3b82f6", sampleTitle: "Finish weekly review" },
      { name: "Personal", color: "#10b981", sampleTitle: "Plan weekend run" },
      { name: "Errands", color: "#f59e0b", sampleTitle: "Buy coffee beans" },
    ];
    for (const s of samples) {
      const created = await addProject(s.name);
      if (created) {
        await addTodo({ title: s.sampleTitle, list: "anytime", projectId: created.id });
      }
    }
    await addTodo({ title: "Press ? to see all keyboard shortcuts", list: "inbox" });
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch { /* ignore */ }
    setOnboardingDismissed(true);
  };

  const handleOnboardingSkip = () => {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch { /* ignore */ }
    setOnboardingDismissed(true);
  };

  const isBoardView = view.kind === "calendar";
  const calendarTab = view.kind === "calendar" ? view.tab ?? "schedule" : "schedule";

  return (
    <div className="app-shell flex h-full min-h-0 w-full max-w-full overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden h-full w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block xl:w-64">
        <Sidebar {...sidebarProps} />
      </aside>

      {/* Phone and tablet sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />
            <motion.aside
              id="mobile-navigation"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed inset-y-0 left-0 z-50 w-[min(86vw,18rem)] border-r border-sidebar-border bg-sidebar shadow-elevated lg:hidden"
            >
              <Sidebar
                {...sidebarProps}
                onChange={(v) => {
                  setView(v);
                  setMobileOpen(false);
                }}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div
            className={cn(
              "w-full max-w-full px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-6 sm:pb-4 sm:pt-[calc(1rem+env(safe-area-inset-top,0px))] lg:px-8 lg:pb-5 lg:pt-[calc(1.25rem+env(safe-area-inset-top,0px))]",
              !isBoardView && READING_COLUMN,
            )}
          >
            <header className="flex min-w-0 items-center gap-1.5 sm:gap-3">
              {/* Title */}
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <AnimatePresence mode="wait">
                  {headerColor && (
                    <motion.span
                      key={`dot-${headerColor}`}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ duration: 0.18 }}
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: headerColor }}
                    />
                  )}
                </AnimatePresence>
                <div className="min-w-0 overflow-hidden">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.h1
                      key={headerTitle}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      className="truncate pb-0.5 font-display text-[28px] font-bold leading-[1.2]"
                    >
                      {headerTitle}
                    </motion.h1>
                  </AnimatePresence>
                  {view.kind === "list" && view.id === "today" && (
                    <motion.p
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05, duration: 0.2 }}
                      className="mt-1 text-xs font-medium text-muted-foreground"
                    >
                      {today}
                      {counts.today > 0 && ` · ${counts.today} to do`}
                    </motion.p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                {view.kind === "project" && (
                  <button
                    onClick={() => {
                      const name = window.prompt("Section name");
                      if (name?.trim()) void addHeading(view.id, name);
                    }}
                    className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:flex"
                    title="Add a section to this project"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Section
                  </button>
                )}

                {view.kind === "trash" && trashed.length > 0 && (
                  <button
                    onClick={() => void emptyTrash()}
                    className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Empty
                  </button>
                )}

                <motion.button
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setQuickFindOpen(true)}
                  className="flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:h-9 sm:px-3"
                  aria-label="Quick Find"
                  title="Quick Find (⌘K)"
                >
                  <Search className="h-[18px] w-[18px]" />
                  <span className="hidden text-xs font-medium xl:inline">Find</span>
                  <kbd className="hidden rounded border border-border bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground xl:inline">
                    ⌘K
                  </kbd>
                </motion.button>

                <Popover open={viewOptionsOpen} onOpenChange={setViewOptionsOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:h-9 sm:w-9"
                      aria-label="View options"
                      title="View options"
                    >
                      <MoreHorizontal className="h-[18px] w-[18px]" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-48 p-1">
                    {!isBoardView && (
                      <div role="group" aria-label="Sort tasks" className="mb-1 border-b border-border pb-1">
                        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"><ArrowUpDown className="h-3.5 w-3.5" />Sort tasks</div>
                        {([
                          { key: "manual", label: "Manual order" },
                          { key: "newest", label: "Newest first" },
                          { key: "oldest", label: "Oldest first" },
                        ] as const).map((opt) => (
                          <button key={opt.key} aria-pressed={sortDir === opt.key}
                            onClick={() => { setSortDir(opt.key); setViewOptionsOpen(false); }}
                            className={cn("flex min-h-11 w-full items-center rounded-md px-2 text-sm hover:bg-secondary sm:min-h-9", sortDir === opt.key && "bg-secondary text-foreground")}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <button onClick={() => { setViewOptionsOpen(false); setSettingsOpen(true); }}
                      className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm hover:bg-secondary sm:min-h-9">
                      <Settings className="h-4 w-4" />Settings
                    </button>
                  </PopoverContent>
                </Popover>

                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setAccountOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border transition-colors hover:bg-secondary hover:text-foreground sm:h-9 sm:w-9"
                  aria-label="Account"
                  title="Account"
                >
                  <UserRound className="h-[18px] w-[18px]" />
                </motion.button>
              </div>
            </header>
          </div>
        </div>

        {/* Content area */}
        <div
          className={cn(
            "min-h-0 flex-1 overscroll-contain",
            isBoardView ? "overflow-x-hidden overflow-y-auto lg:overflow-hidden" : "overflow-x-hidden overflow-y-auto",
          )}
        >
          <div
            key={
              view.kind === "list"
                ? `list:${view.id}`
                : view.kind === "project"
                  ? `project:${view.id}`
                  : view.kind === "area"
                    ? `area:${view.id}`
                    : view.kind === "tag"
                      ? `tag:${view.id}`
                      : view.kind === "trash"
                        ? "trash"
                        : // Both calendar tabs share one key: switching them
                          // swaps a panel, it doesn't re-enter the section.
                          "calendar"
            }
            className={cn(
              "w-full max-w-full animate-view-in px-3 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-5 sm:px-6 sm:pt-6 lg:px-8",
              isBoardView ? "lg:h-full" : READING_COLUMN,
            )}
          >
            {view.kind === "calendar" ? (
              <Suspense fallback={<div className="h-16" />}>
                <CalendarBoard
                  todos={live}
                  projects={projects}
                  tab={calendarTab}
                  onTabChange={(tab) => setView({ kind: "calendar", tab })}
                  onToggle={toggleTodo}
                  onUpdate={updateTodo}
                  onDelete={deleteTodo}
                  onStart={startTimer}
                  onStop={stopTimer}
                  onCreateProject={addProject}
                  onQuickAdd={(iso) => {
                    setAddInitialTitle(`#${iso} `);
                    setAddOpenSignal((v) => v + 1);
                  }}
                />
              </Suspense>
            ) : loading ? (
              <TaskListSkeleton />
            ) : (
              <>
                {runningTodo && (
                  <FocusBar todo={runningTodo} onStop={stopTimer} onComplete={toggleTodo} />
                )}
                {view.kind === "list" && view.id === "today" && (
                  <EventList events={eventsOn(calendarEvents, todayKey)} day={todayKey} />
                )}
                <TodoList
                  sections={sections}
                  onToggle={toggleTodo}
                  onUpdate={updateTodo}
                  onDelete={deleteTodo}
                  onStart={startTimer}
                  onStop={stopTimer}
                  onSetChecklist={setChecklist}
                  onReorder={(activeId, overId, ids) => {
                    setSortDir("manual");
                    const activeTodo = live.find((t) => t.id === activeId);
                    const overTodo = live.find((t) => t.id === overId);
                    if (activeTodo && overTodo) {
                      const patch: Partial<Todo> = {};
                      // Dropping across a group boundary re-files the task —
                      // that is the whole point of dragging onto a heading.
                      if ((activeTodo.projectId ?? null) !== (overTodo.projectId ?? null)) {
                        patch.projectId = overTodo.projectId ?? null;
                        patch.headingId = null;
                      }
                      if (
                        view.kind === "project" &&
                        (activeTodo.headingId ?? null) !== (overTodo.headingId ?? null)
                      ) {
                        patch.headingId = overTodo.headingId ?? null;
                      }
                      if (
                        view.kind === "list" &&
                        view.id === "today" &&
                        !!activeTodo.evening !== !!overTodo.evening
                      ) {
                        patch.evening = !!overTodo.evening;
                      }
                      if (Object.keys(patch).length > 0) void updateTodo(activeId, patch);
                    }
                    void reorderTodos(activeId, overId, ids);
                  }}
                  emptyArt={headerArt}
                  emptyTitle={headerEmpty}
                  emptyHint={headerHint}
                  activeList={view.kind === "list" ? view.id : ""}
                  anyRunning={!!runningTodo}
                  projects={projects}
                  headings={view.kind === "project" ? headings.filter((h) => h.projectId === view.id) : headings}
                  knownTags={knownTags}
                  isProjectView={view.kind === "project"}
                  onCreateProject={addProject}
                  selectedIds={selection.selected}
                  cursorId={selection.cursor}
                  onSelect={selection.handleClick}
                  onBackgroundClick={selection.clear}
                  inTrash={view.kind === "trash"}
                  onRestore={restoreTodo}
                  onPurge={purgeTodo}
                  onDeleteHeading={deleteHeading}
                />
              </>
            )}
          </div>
        </div>
      </main>

      {/* Phone and tablet tab bar — the sidebar's main lists, the rest behind More. */}
      <nav
        aria-label="Lists"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
      >
        {([
          { label: "Inbox", icon: Inbox, to: { kind: "list", id: "inbox" } },
          { label: "Today", icon: Star, to: { kind: "list", id: "today" } },
          { label: "Upcoming", icon: CalendarClock, to: { kind: "list", id: "upcoming" } },
          { label: "Calendar", icon: CalendarDays, to: { kind: "calendar", tab: "schedule" } },
        ] as const).map((tab) => {
          const active = tab.to.kind === "list"
            ? view.kind === "list" && view.id === tab.to.id
            : view.kind === "calendar";
          return (
            <button
              key={tab.label}
              onClick={() => setView(tab.to)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <tab.icon className={cn("h-5 w-5", active && "text-primary")} />
              {tab.label}
            </button>
          );
        })}
        <button
          onClick={() => setMobileOpen(true)}
          aria-controls="mobile-navigation"
          aria-expanded={mobileOpen}
          className="flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>

      {/* Bulk-action bar — only worth the screen space once more than one row is picked. */}
      <AnimatePresence>
        {selectedIds.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="fixed inset-x-0 bottom-[calc(9rem+env(safe-area-inset-bottom,0px))] z-40 flex justify-center px-4 lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
          >
            <div className="flex items-center gap-1 rounded-full border border-border bg-card/95 px-2 py-1.5 shadow-elevated backdrop-blur">
              <span className="px-2 text-xs font-semibold tabular-nums text-muted-foreground">
                {selectedIds.length}
              </span>
              {[
                { id: "today", icon: Star, cls: "text-star", label: "Today", patch: { list: "today" as const, dueDate: localDateKey(), evening: false } },
                { id: "evening", icon: Moon, cls: "text-indigo-400", label: "Evening", patch: { list: "today" as const, dueDate: localDateKey(), evening: true } },
                { id: "anytime", icon: Layers, cls: "text-primary", label: "Anytime", patch: { list: "anytime" as const, dueDate: null, dueTime: null, evening: false } },
                { id: "someday", icon: Hourglass, cls: "text-muted-foreground", label: "Someday", patch: { list: "someday" as const, dueDate: null, dueTime: null, evening: false } },
              ].map((action) => (
                <button
                  key={action.id}
                  onClick={() => applyToSelection(action.patch)}
                  title={action.label}
                  className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <action.icon className={cn("h-4 w-4", action.cls)} />
                  <span className="hidden sm:inline">{action.label}</span>
                </button>
              ))}
              <button
                onClick={() => void deleteTodos(selectedIds)}
                title="Delete"
                className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
              <button
                onClick={selection.clear}
                title="Clear selection"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nothing to capture into the Activity read-out or the Trash. */}
      {calendarTab !== "activity" && view.kind !== "trash" && (
        <AddTodo
          onAdd={handleAddTodo}
          projects={projects}
          onCreateProject={addProject}
          openSignal={addOpenSignal || undefined}
          initialTitle={addInitialTitle}
          onInitialTitleConsumed={() => setAddInitialTitle(undefined)}
          defaultTarget={defaultTarget}
          sortOrder={addSortOrder}
          onMagicDrop={handleMagicDrop}
          onCapture={aiAvailable() ? setCaptureText : undefined}
        />
      )}
      {captureText !== null && (
        <CaptureDialog
          open
          initialText={captureText}
          onClose={() => setCaptureText(null)}
          onAdd={(titles) => {
            for (const title of titles) {
              const input = inputFromText(title, projects, defaultTarget);
              if (input) handleAddTodo(input);
            }
          }}
        />
      )}

      <Suspense fallback={null}>
        {cheatsheetMounted && (
          <KeyboardShortcuts open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
        )}
        {quickFindMounted && (
          <QuickFind
            open={quickFindOpen}
            onOpenChange={setQuickFindOpen}
            todos={live}
            projects={projects}
            areas={areas}
            tags={knownTags}
            onNavigate={setView}
            onNewTodo={() => setAddOpenSignal((value) => value + 1)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenAccount={() => setAccountOpen(true)}
            onOpenShortcuts={() => setCheatsheetOpen(true)}
          />
        )}
        {encryptionMounted && (
          <EncryptionDialog open={encryptionOpen} onClose={() => setEncryptionOpen(false)} />
        )}
        {sharing && <ShareDialog project={sharing} onClose={() => setSharing(null)} />}
        {settingsMounted && (
          <SettingsDialog
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            onOpenShortcuts={() => {
              setSettingsOpen(false);
              setCheatsheetOpen(true);
            }}
            onOpenAccount={() => {
              setSettingsOpen(false);
              setAccountOpen(true);
            }}
            reminders={reminders}
          />
        )}
        {accountMounted && (
          <AccountDialog
            open={accountOpen}
            onClose={() => setAccountOpen(false)}
            encryptionEnabled={cipher.enabled}
            encryptionUnlocked={cipher.unlocked}
            onOpenEncryption={() => {
              setAccountOpen(false);
              setEncryptionOpen(true);
            }}
            todos={todos}
            projects={projects}
            areas={areas}
            headings={headings}
          />
        )}
        {onboardingMounted && (
          <Onboarding open={showOnboarding} onAccept={handleOnboardingAccept} onSkip={handleOnboardingSkip} />
        )}
      </Suspense>
    </div>
  );
};

export default Index;
