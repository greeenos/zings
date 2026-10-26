import { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "@/lib/motion";
import { useSortable } from "@dnd-kit/sortable";
import {
  CalendarClock,
  CalendarDays,
  ChevronsUp,
  Paperclip,
  Sparkles,
  Check,
  Flag,
  Flame,
  GripVertical,
  Hourglass,
  Layers,
  ListChecks,
  Lock,
  Moon,
  MoreHorizontal,
  Play,
  Repeat,
  RotateCcw,
  Square,
  Star,
  Tag as TagIcon,
  Timer,
  Trash2,
} from "@/lib/icons";
import { toast } from "@/lib/toast";
import { ChecklistItem, Heading, Project, Todo } from "@/types/todo";
import { cn } from "@/lib/utils";
import { formatDuration, formatTagTime } from "@/lib/time";
import {
  describeDeadline,
  formatEstimate,
  formatTimeRange,
  parseScheduleTokens,
} from "@/lib/schedule";
import { describeRepeat } from "@/lib/repeat";

const PRIORITY_LABELS = ["", "Low priority", "Medium priority", "High priority"];
const PRIORITY_COLORS = ["", "text-muted-foreground", "text-due-soon", "text-today"];
import { NoteEditor } from "@/components/todo/NoteEditor";
import { Checklist } from "@/components/todo/Checklist";
import { DatePicker, DateSelection } from "@/components/todo/DatePicker";
import { RepeatPicker } from "@/components/todo/RepeatPicker";
import { Attachments } from "@/components/todo/Attachments";
import { attach } from "@/lib/attachments";
import { aiAvailable, breakDown } from "@/lib/ai";
import { uuid } from "@/lib/uuid";
import { TagPicker } from "@/components/todo/TagPicker";
import { useDecryptedNote, useNoteCipher } from "@/hooks/useNoteCipher";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addLocalDaysKey, fmt, keyToDate, localDateKey } from "@/lib/date";
import { MentionPopover } from "@/components/todo/MentionPopover";
import { parseTypedTokens, useMentionInput } from "@/components/todo/mention";

/** How long a ticked row lingers before the list filters it away. */
const COMPLETE_LINGER_MS = 700;
/** Horizontal travel before a touch swipe commits its action. */
const SWIPE_COMMIT_PX = 88;

interface Props {
  todo: Todo;
  onToggle: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Todo>) => void;
  onDelete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  activeList: string;
  anyRunning: boolean;
  isProjectView?: boolean;
  projects?: Project[];
  headings?: Heading[];
  knownTags?: string[];
  onCreateProject?: (name: string) => Promise<Project | null>;
  onSetChecklist?: (id: string, items: ChecklistItem[]) => void;
  /** Multi-select state, owned by the list. */
  selected?: boolean;
  isCursor?: boolean;
  onSelect?: (id: string, mods: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  /** Trash renders restore / delete-forever instead of the normal actions. */
  inTrash?: boolean;
  onRestore?: (id: string) => void;
  onPurge?: (id: string) => void;
}

function formatDue(iso?: string | null) {
  if (!iso) return null;
  const now = new Date();
  if (iso === localDateKey(now)) return "Today";
  if (iso === addLocalDaysKey(now, 1)) return "Tomorrow";
  return fmt(keyToDate(iso), { month: "short", day: "numeric" });
}

/** dnd-kit's sortable offset as a CSS transform (a vertical list never scales). */
const translate = (t: { x: number; y: number } | null) =>
  t ? `translate3d(${Math.round(t.x)}px, ${Math.round(t.y)}px, 0)` : undefined;

/** ISO instant → value for <input type="datetime-local"> (local wall-clock, minute precision). */
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local wall-clock value from a datetime-local input → ISO instant (null if empty / invalid). */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value); // "YYYY-MM-DDTHH:mm" (no offset) parses as local time
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** True when the click landed inside a Radix portal (popover / dropdown). */
function isInsidePortal(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest("[data-radix-popper-content-wrapper]");
}

function TodoItemImpl({
  todo,
  onToggle,
  onUpdate,
  onDelete,
  onStart,
  onStop,
  anyRunning,
  isProjectView = false,
  projects = [],
  headings = [],
  knownTags = [],
  onCreateProject,
  onSetChecklist,
  selected = false,
  isCursor = false,
  onSelect,
  inTrash = false,
  onRestore,
  onPurge,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const decrypted = useDecryptedNote(todo.notes);
  const decryptedText = decrypted?.state === "plain" ? decrypted.text : "";
  const cipher = useNoteCipher();
  // Also locked when encryption is on but not unlocked here, so a new note can't go out as plain text.
  const notesLocked = decrypted?.state === "locked" || (cipher.enabled && !cipher.unlocked);
  const [notes, setNotes] = useState(decryptedText);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [swipeX, setSwipeX] = useState(0);

  // While the card is not being edited, mirror the (decrypted) server-side note into local state.
  useEffect(() => {
    if (!expanded) setNotes(decryptedText);
  }, [decryptedText, expanded]);

  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [breaking, setBreaking] = useState(false);
  const attachments = todo.attachments ?? [];
  const titleInputRef = useRef<HTMLInputElement>(null);
  const running = !!todo.startedAt && !todo.completed;
  const now = useNow(running);
  const todayKey = localDateKey();

  const checklist = todo.checklist ?? [];
  const tags = todo.tags ?? [];
  const streak = todo.streak ?? 0;

  /**
   * Ticking a to-do keeps it on screen for a beat before the list drops it.
   * Instant disappearance makes a mis-click feel unrecoverable even though it
   * isn't; the pause also lets a second click cancel outright.
   */
  const [pendingComplete, setPendingComplete] = useState(false);
  const completeTimer = useRef<number | null>(null);
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;

  useEffect(
    () => () => {
      // Unmounted mid-linger (view switch): honour the click rather than losing it.
      if (completeTimer.current !== null) {
        window.clearTimeout(completeTimer.current);
        completeTimer.current = null;
        toggleRef.current(todo.id);
      }
    },
    [todo.id],
  );

  const handleToggle = useCallback(() => {
    // Re-opening a logged to-do, or cancelling a pending tick, is immediate.
    if (todo.completed) {
      onToggle(todo.id);
      return;
    }
    if (completeTimer.current !== null) {
      window.clearTimeout(completeTimer.current);
      completeTimer.current = null;
      setPendingComplete(false);
      return;
    }
    setPendingComplete(true);
    navigator.vibrate?.(12); // a light tick on phones that support it
    completeTimer.current = window.setTimeout(() => {
      completeTimer.current = null;
      toggleRef.current(todo.id);
    }, COMPLETE_LINGER_MS);
  }, [onToggle, todo.completed, todo.id]);

  const showAsDone = todo.completed || pendingComplete;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
    disabled: expanded || inTrash,
  });

  /** Apply a list/project change to this todo immediately (the @token is already stripped). */
  const mention = useMentionInput(titleInputRef, title, setTitle, projects, async (s, stripped) => {
    const patch: Partial<Todo> = { title: stripped.replace(/\s+/g, " ").trim() || todo.title };
    if (s.kind === "list") {
      patch.list = s.id;
      if (s.id === "today") {
        patch.dueDate = localDateKey();
      } else {
        patch.dueDate = null;
        patch.dueTime = null;
      }
    } else if (s.kind === "project") {
      patch.projectId = s.id;
      patch.headingId = null;
    } else {
      const created = onCreateProject ? await onCreateProject(s.query) : null;
      if (!created) return;
      patch.projectId = created.id;
      patch.headingId = null;
    }
    onUpdate(todo.id, patch);
  });

  const commitEdits = () => {
    const { cleaned, tags: typedTags } = parseTypedTokens(title, projects);
    const sched = parseScheduleTokens(cleaned);
    const finalTitle = sched.cleaned.trim() || todo.title;
    const patch: Partial<Todo> = {};
    if (finalTitle !== todo.title) patch.title = finalTitle;
    if (!notesLocked && notes !== decryptedText) patch.notes = notes || null;
    for (const tag of typedTags) {
      if (tag.kind === "list") {
        patch.list = tag.id;
        if (tag.id === "today") {
          patch.dueDate = localDateKey();
        } else {
          patch.dueDate = null;
          patch.dueTime = null;
        }
      } else {
        patch.projectId = tag.id;
      }
    }
    // Inline #date / HH:MM / !duration tokens update the schedule.
    if (sched.dueDate) {
      patch.dueDate = sched.dueDate;
      patch.list = sched.dueDate > localDateKey() ? "anytime" : "today";
    }
    if (sched.dueTime) patch.dueTime = sched.dueTime;
    if (sched.estimateMin != null) patch.estimateMin = sched.estimateMin;
    if (sched.priority) patch.priority = sched.priority;
    if (sched.deadline) patch.deadline = sched.deadline;
    if (sched.evening) patch.evening = true;
    if (sched.repeatRule) patch.repeatRule = sched.repeatRule;
    if (Object.keys(patch).length > 0) onUpdate(todo.id, patch);
  };

  /** Edit a completed log entry's start/finish instant; recompute duration when both ends are coherent. */
  const commitTimeEdit = (field: "startedAt" | "completedAt", value: string) => {
    const iso = localInputToIso(value);
    if (!iso) return; // ignore a cleared / half-typed input rather than wiping the timestamp
    const startedAt = field === "startedAt" ? iso : todo.startedAt ?? null;
    const completedAt = field === "completedAt" ? iso : todo.completedAt ?? null;
    const patch: Partial<Todo> = field === "startedAt" ? { startedAt: iso } : { completedAt: iso };
    if (startedAt && completedAt) {
      const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      if (ms >= 0) patch.lastedMs = ms; // keep the old duration if the edit would put finish before start
    }
    onUpdate(todo.id, patch);
  };

  useEffect(() => {
    if (!expanded) return;
    const onClick = (e: MouseEvent) => {
      // Popovers and menus live in portals, so a click on the date grid is
      // "outside" this node but must not collapse the card.
      if (isInsidePortal(e.target)) return;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        commitEdits();
        setExpanded(false);
        mention.close();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, title, notes, todo, onUpdate, decryptedText, projects]);

  /** Apply a "When" choice from the date picker. */
  const applyWhen = (sel: DateSelection) => {
    const patch: Partial<Todo> = {};
    if (sel.someday) {
      patch.list = "someday";
      patch.dueDate = null;
      patch.dueTime = null;
      patch.evening = false;
    } else if (sel.date === null) {
      patch.dueDate = null;
      patch.dueTime = null;
      patch.evening = false;
      if (todo.list === "today") patch.list = "anytime";
    } else {
      patch.dueDate = sel.date;
      patch.dueTime = sel.time ?? null;
      patch.evening = sel.evening ?? false;
      patch.list = sel.date > todayKey ? "anytime" : "today";
    }
    onUpdate(todo.id, patch);
  };

  const due = formatDue(todo.dueDate);
  const timeLabel = formatTimeRange(todo.dueTime, todo.estimateMin);
  // Show the date pill for any scheduled day, plus for Today only when it carries a time.
  const showDatePill = !!todo.dueDate && (due !== "Today" || !!timeLabel);
  // A loose duration estimate (no fixed clock time) gets its own pill.
  const showEstPill = todo.estimateMin != null && !todo.dueTime;
  const liveMs = running ? (todo.lastedMs ?? 0) + now - new Date(todo.startedAt!).getTime() : 0;
  const hasTimeMeta = !!(todo.startedAt || todo.completedAt || todo.lastedMs);
  const deadlineInfo = todo.deadline ? describeDeadline(todo.deadline, todayKey) : null;
  const projectHeadings = todo.projectId ? headings.filter((h) => h.projectId === todo.projectId) : [];
  const hasCollapsedMeta =
    showDatePill ||
    showEstPill ||
    !!deadlineInfo ||
    !!todo.repeatRule ||
    checklist.length > 0 ||
    tags.length > 0 ||
    attachments.length > 0 ||
    !!todo.evening;
  const collapsedMetaPillClass =
    "inline-flex shrink-0 items-center gap-1 py-0.5 text-xs font-medium";
  const collapsedMetaIconClass = "h-3 w-3";

  // --- touch swipe ---------------------------------------------------------
  // dnd-kit's TouchSensor waits 200ms and cancels once the finger moves past
  // its 5px tolerance, so a horizontal swipe never fights the reorder drag.
  const touchStart = useRef<{ x: number; y: number; locked: boolean } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (expanded || inTrash) return;
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, locked: false };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const start = touchStart.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (!start.locked) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      start.locked = true;
    }
    setSwipeX(Math.max(-140, Math.min(140, dx)));
  };

  const onTouchEnd = () => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start?.locked) {
      setSwipeX(0);
      return;
    }
    const dx = swipeX;
    setSwipeX(0);
    if (dx > SWIPE_COMMIT_PX && !todo.completed) handleToggle();
    else if (dx < -SWIPE_COMMIT_PX) onDelete(todo.id);
  };

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        style={{ transform: translate(transform), transition, minHeight: "48px" }}
        className="my-0.5 rounded-lg border-2 border-dashed border-primary/30 bg-primary-soft/25"
      />
    );
  }

  const actionButton = (
    key: string,
    Icon: typeof CalendarDays,
    label: string,
    activeState: boolean,
    onClick?: () => void,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
        activeState
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );

  return (
    <div ref={setNodeRef} style={{ transform: translate(transform), transition }}>
      <div className="relative overflow-hidden rounded-lg">
        {/* Swipe backdrops — revealed as the row slides. */}
        {swipeX !== 0 && (
          <>
            <div
              className="absolute inset-y-0 left-0 flex items-center bg-primary/15 pl-4 text-primary"
              style={{ width: Math.max(0, swipeX) }}
            >
              <Check className="h-4 w-4" />
            </div>
            <div
              className="absolute inset-y-0 right-0 flex items-center justify-end bg-destructive/15 pr-4 text-destructive"
              style={{ width: Math.max(0, -swipeX) }}
            >
              <Trash2 className="h-4 w-4" />
            </div>
          </>
        )}

        <motion.div
          ref={ref}
          {...attributes}
          {...listeners}
          tabIndex={-1}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          // An open card takes pasted screenshots and dropped files as attachments.
          onPaste={expanded ? (e) => {
            const files = [...e.clipboardData.files];
            if (!files.length) return;
            e.preventDefault();
            void attach(todo.id, files);
          } : undefined}
          onDragOver={expanded ? (e) => e.dataTransfer.types.includes("Files") && e.preventDefault() : undefined}
          onDrop={expanded ? (e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            void attach(todo.id, [...e.dataTransfer.files]);
          } : undefined}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0, x: swipeX }}
          exit={{ opacity: 0, x: -24, scale: 0.97 }}
          transition={
            swipeX === 0
              ? { duration: 0.18, ease: [0.4, 0, 0.2, 1] }
              : { duration: 0 }
          }
          className={cn(
            "group relative rounded-lg px-2 py-2 outline-none transition-colors duration-150",
            // Things has no rules between rows — whitespace does the separating.
            expanded && "my-1 border border-border bg-card px-3 shadow-elevated",
            !expanded && !selected && "hover:bg-card/70",
            selected && !expanded && "bg-accent/50",
            isCursor && !expanded && "ring-1 ring-inset ring-primary/40",
            running && !expanded && !selected && "bg-primary-soft/40",
            showAsDone && !todo.completed && "opacity-60",
          )}
        >
          {/* Drag handle — slides in from the left on hover */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-none absolute left-0 top-1/2 hidden -translate-x-full -translate-y-1/2 items-center justify-center text-muted-foreground/40 opacity-0 transition-all duration-200 group-hover:-translate-x-[calc(100%+2px)] group-hover:opacity-100 lg:flex"
            aria-hidden="true"
          >
            <GripVertical className="h-4 w-4" />
          </div>

          <div
            className={cn(
              expanded
                ? "flex items-start gap-3"
                : cn(
                    "grid items-center gap-x-3 gap-y-1.5 sm:flex sm:items-start sm:gap-3",
                    running
                      ? "grid-cols-[auto_minmax(0,1fr)_auto_auto]"
                      : "grid-cols-[auto_minmax(0,1fr)_auto]",
                  ),
            )}
          >
            {/* Completion and time tracking are independent actions; play leads the
                row so a task is one tap from running, and it never hides on hover. */}
            <div className={cn("flex shrink-0 items-center", !expanded && "col-start-1 row-start-1")}>
              {!inTrash && !todo.completed && (expanded || running) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (running) onStop(todo.id);
                    else if (anyRunning) toast.message("Stop the active timer before starting another.");
                    else onStart(todo.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-lg transition sm:h-8 sm:w-8",
                    !running && !expanded && "max-sm:hidden lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover:opacity-100",
                    running
                      ? "text-primary hover:bg-primary/10"
                      : "text-muted-foreground/60 hover:bg-secondary hover:text-primary",
                  )}
                  aria-label={running ? "Stop timer" : "Start timer"}
                  title={running ? "Stop timer" : "Start timer"}
                >
                  {running ? (
                    <Square className="h-3.5 w-3.5" fill="currentColor" />
                  ) : (
                    <Play className="h-3.5 w-3.5" fill="currentColor" />
                  )}
                </button>
              )}
              {/* Touch-target height (44 / 32px) sets the row's first-line band. */}
              <div className="flex h-11 w-11 items-center justify-center sm:h-8 sm:w-8">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  // A rounded square marks a to-do; the ring is reserved for projects.
                  "relative flex h-[19px] w-[19px] items-center justify-center rounded-[6px] border-2 transition-colors duration-200 ease-zings",
                  showAsDone
                    ? "border-primary-extrusion bg-primary"
                    : "border-faint bg-card hover:border-primary-strong hover:bg-primary-soft",
                )}
                aria-label={todo.completed ? "Reopen to-do" : "Complete to-do"}
              >
                {pendingComplete && (
                  // A ring that ripples out from the box as it's ticked.
                  <motion.span
                    aria-hidden
                    initial={{ scale: 1, opacity: 0.6 }}
                    animate={{ scale: 2.4, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                    className="pointer-events-none absolute inset-[-2px] rounded-[6px] border-2 border-primary"
                  />
                )}
                <AnimatePresence>
                  {showAsDone && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                    >
                      <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
              </div>
            </div>

            {/* Content */}
            <div
              className={cn(
                "min-w-0 flex-1",
                expanded && "pt-3 sm:pt-1.5",
                !expanded && "col-start-2 row-start-1 cursor-pointer",
              )}
              onClick={(e) => {
                if (expanded) return;
                if (onSelect && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onSelect(todo.id, {
                    shiftKey: e.shiftKey,
                    metaKey: e.metaKey,
                    ctrlKey: e.ctrlKey,
                  });
                  return;
                }
                onSelect?.(todo.id, { shiftKey: false, metaKey: false, ctrlKey: false });
                if (!inTrash) setExpanded(true);
              }}
            >
              {expanded ? (
                <div className="relative">
                  <input
                    ref={titleInputRef}
                    autoFocus
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      mention.onChange(e.target.value, e.target.selectionStart ?? e.target.value.length);
                    }}
                    onKeyDown={(e) => {
                      if (mention.onKeyDown(e)) return;
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitEdits();
                        setExpanded(false);
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setTitle(todo.title);
                        setNotes(decryptedText);
                        setExpanded(false);
                      }
                    }}
                    className="w-full bg-transparent text-base font-medium leading-tight outline-none md:text-[15px]"
                  />
                  {mention.open && (
                    <MentionPopover
                      suggestions={mention.suggestions}
                      active={mention.active}
                      onHover={mention.setActive}
                      onPick={(s) => void mention.pick(s)}
                      variant="inline"
                    />
                  )}
                </div>
              ) : (
                <div data-collapsed-row className="flex min-h-11 min-w-0 flex-col justify-center gap-1 py-1 sm:min-h-8 xl:flex-row xl:items-center xl:justify-start xl:gap-2 xl:py-0">
                  <div
                    data-collapsed-title
                    className={cn(
                      "min-w-0 truncate text-[15px] leading-snug",
                      todo.completed && "text-muted-foreground line-through",
                      pendingComplete && "strike-in text-muted-foreground",
                    )}
                  >
                    {!!todo.priority && !todo.completed && (
                      <span
                        aria-label={PRIORITY_LABELS[todo.priority]}
                        title={PRIORITY_LABELS[todo.priority]}
                        className={cn("mr-1.5 font-bold", PRIORITY_COLORS[todo.priority])}
                      >
                        {"!".repeat(todo.priority)}
                      </span>
                    )}
                    {todo.title}
                  </div>

                  {/* Details sit on a second line until the column is wide enough to share one. */}
                  {hasCollapsedMeta && (
                    <div
                      data-collapsed-meta
                      className="flex min-w-0 flex-wrap items-center gap-1 text-muted-foreground xl:shrink-0 xl:flex-nowrap xl:gap-1.5"
                    >
                      {todo.evening && (
                        <span
                          role="img"
                          aria-label="This evening"
                          title="This evening"
                          className={cn(
                            collapsedMetaPillClass,
                            "text-indigo-500 dark:text-indigo-300",
                          )}
                        >
                          <Moon className={collapsedMetaIconClass} aria-hidden="true" />
                          <span>Evening</span>
                        </span>
                      )}
                      {showDatePill && (
                        <span
                          role="img"
                          aria-label={`Scheduled: ${due}${timeLabel ? `, ${timeLabel}` : ""}`}
                          title={`Scheduled: ${due}${timeLabel ? `, ${timeLabel}` : ""}`}
                          className={collapsedMetaPillClass}
                        >
                          <CalendarClock className={collapsedMetaIconClass} aria-hidden="true" />
                          <span>{due}</span>
                          {timeLabel && (
                            <span className="tabular-nums">{timeLabel}</span>
                          )}
                        </span>
                      )}
                      {deadlineInfo && (
                        <span
                          role="img"
                          aria-label={`Deadline: ${deadlineInfo.label}`}
                          title={`Deadline: ${deadlineInfo.label}`}
                          className={cn(
                            collapsedMetaPillClass,
                            deadlineInfo.urgent
                              ? deadlineInfo.overdue ? "text-today" : "text-due-soon"
                              : "text-muted-foreground",
                          )}
                        >
                          <Flag className={collapsedMetaIconClass} aria-hidden="true" />
                          <span>{deadlineInfo.label}</span>
                        </span>
                      )}
                      {showEstPill && (
                        <span
                          role="img"
                          aria-label={`Estimate: ${formatEstimate(todo.estimateMin!)}`}
                          title={`Estimate: ${formatEstimate(todo.estimateMin!)}`}
                          className={collapsedMetaPillClass}
                        >
                          <Timer className={collapsedMetaIconClass} aria-hidden="true" />
                          <span>{formatEstimate(todo.estimateMin!)}</span>
                        </span>
                      )}
                      {todo.repeatRule && (
                        <span
                          role="img"
                          aria-label={`Repeats: ${describeRepeat(todo.repeatRule)}`}
                          title={`Repeats: ${describeRepeat(todo.repeatRule)}`}
                          className={collapsedMetaPillClass}
                        >
                          <Repeat className={collapsedMetaIconClass} aria-hidden="true" />
                          <span>{describeRepeat(todo.repeatRule)}</span>
                        </span>
                      )}
                      {todo.repeatRule && streak > 0 && (
                        <span
                          role="img"
                          aria-label={`${streak} in a row, on time`}
                          title={`${streak} in a row, on time`}
                          className={cn(
                            collapsedMetaPillClass,
                            "tabular-nums text-amber-600 dark:text-amber-400",
                          )}
                        >
                          <Flame className={collapsedMetaIconClass} aria-hidden="true" />
                          <span aria-hidden="true">{streak}</span>
                        </span>
                      )}
                      {checklist.length > 0 && (
                        <span
                          role="img"
                          aria-label={`Checklist: ${checklist.filter((c) => c.done).length} of ${checklist.length} complete`}
                          title={`Checklist: ${checklist.filter((c) => c.done).length}/${checklist.length}`}
                          className={cn(
                            collapsedMetaPillClass,
                            "tabular-nums",
                          )}
                        >
                          <ListChecks className={collapsedMetaIconClass} aria-hidden="true" />
                          <span aria-hidden="true">
                            {checklist.filter((c) => c.done).length}/{checklist.length}
                          </span>
                        </span>
                      )}
                      {attachments.length > 0 && (
                        <span
                          role="img"
                          aria-label={`${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`}
                          title={`${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`}
                          className={cn(collapsedMetaPillClass, "tabular-nums")}
                        >
                          <Paperclip className={collapsedMetaIconClass} aria-hidden="true" />
                          <span aria-hidden="true">{attachments.length}</span>
                        </span>
                      )}
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex shrink-0 items-center gap-1 py-0.5 text-xs font-medium text-muted-foreground"
                        >
                          <span aria-hidden="true">#</span>{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Expanded body */}
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", damping: 28, stiffness: 320 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2">
                      {notesLocked ? (
                        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-2 text-sm text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" />
                          Notes are encrypted — unlock them in Account → Note encryption to read or edit.
                        </div>
                      ) : (
                        <NoteEditor
                          value={notes}
                          onChange={setNotes}
                          placeholder="Notes — type / for formatting"
                        />
                      )}
                    </div>

                    {/* Action row — the things Things puts one tap away. */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          {actionButton(
                            "when",
                            CalendarDays,
                            todo.dueDate
                              ? `${formatDue(todo.dueDate)}${timeLabel ? ` · ${timeLabel}` : ""}${todo.evening ? " · Evening" : ""}`
                              : todo.list === "someday"
                                ? "Someday"
                                : "When",
                            !!todo.dueDate || todo.list === "someday",
                          )}
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto p-0">
                          <DatePicker
                            mode="when"
                            value={todo.dueDate}
                            time={todo.dueTime}
                            evening={todo.evening}
                            onSelect={applyWhen}
                          />
                        </PopoverContent>
                      </Popover>

                      {showEstPill && (
                        <span className="flex items-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-accent-foreground">
                          <Timer className="h-3.5 w-3.5" />
                          Estimate · {formatEstimate(todo.estimateMin!)}
                        </span>
                      )}

                      <Popover>
                        <PopoverTrigger asChild>
                          {actionButton(
                            "deadline",
                            Flag,
                            deadlineInfo ? deadlineInfo.label : "Deadline",
                            !!todo.deadline,
                          )}
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto p-0">
                          <DatePicker
                            mode="deadline"
                            value={todo.deadline}
                            onSelect={(sel) => onUpdate(todo.id, { deadline: sel.date })}
                          />
                        </PopoverContent>
                      </Popover>

                      <Popover>
                        <PopoverTrigger asChild>
                          {actionButton(
                            "repeat",
                            Repeat,
                            todo.repeatRule
                              ? describeRepeat(todo.repeatRule) + (streak > 0 ? ` · ${streak}🔥` : "")
                              : "Repeat",
                            !!todo.repeatRule,
                          )}
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto p-0">
                          <RepeatPicker
                            value={todo.repeatRule}
                            anchorDate={todo.dueDate}
                            onChange={(rule) => onUpdate(todo.id, { repeatRule: rule })}
                          />
                        </PopoverContent>
                      </Popover>

                      {actionButton(
                        "priority",
                        ChevronsUp,
                        todo.priority ? PRIORITY_LABELS[todo.priority] : "Priority",
                        !!todo.priority,
                        // Cycles none → low → medium → high → none.
                        () => onUpdate(todo.id, { priority: ((todo.priority ?? 0) + 1) % 4 || null }),
                      )}

                      {actionButton(
                        "checklist",
                        ListChecks,
                        checklist.length > 0
                          ? `${checklist.filter((c) => c.done).length}/${checklist.length}`
                          : "Checklist",
                        checklist.length > 0 || showChecklist,
                        () => setShowChecklist((v) => !v),
                      )}

                      {actionButton(
                        "tags",
                        TagIcon,
                        tags.length > 0 ? tags.join(", ") : "Tags",
                        tags.length > 0 || showTags,
                        () => setShowTags((v) => !v),
                      )}

                      {actionButton(
                        "attach",
                        Paperclip,
                        attachments.length > 0 ? String(attachments.length) : "Attach",
                        attachments.length > 0,
                        () => fileInputRef.current?.click(),
                      )}
                      {aiAvailable() && actionButton(
                        "breakdown",
                        Sparkles,
                        breaking ? "Thinking…" : "Break down",
                        false,
                        async () => {
                          if (breaking) return;
                          setBreaking(true);
                          const steps = await breakDown(todo.title, notesLocked ? null : notes);
                          setBreaking(false);
                          if (!steps?.length) return;
                          const items = [...checklist, ...steps.map((text) => ({ id: uuid(), text, done: false }))];
                          if (onSetChecklist) onSetChecklist(todo.id, items);
                          else onUpdate(todo.id, { checklist: items });
                          setShowChecklist(true);
                        },
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        hidden
                        onChange={(e) => {
                          void attach(todo.id, [...(e.target.files ?? [])]);
                          e.target.value = "";
                        }}
                      />
                    </div>

                    <Attachments todoId={todo.id} names={attachments} />

                    {(showChecklist || checklist.length > 0) && (
                      <Checklist
                        items={checklist}
                        onChange={(items) =>
                          onSetChecklist
                            ? onSetChecklist(todo.id, items)
                            : onUpdate(todo.id, { checklist: items })
                        }
                      />
                    )}

                    {(showTags || tags.length > 0) && (
                      <TagPicker
                        value={tags}
                        known={knownTags}
                        onChange={(next) => onUpdate(todo.id, { tags: next })}
                      />
                    )}

                    {/* Heading picker — only meaningful inside a project that has any. */}
                    {isProjectView && projectHeadings.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Section
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdate(todo.id, { headingId: null })}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
                            !todo.headingId
                              ? "bg-accent text-accent-foreground"
                              : "bg-secondary text-muted-foreground hover:text-foreground",
                          )}
                        >
                          None
                        </button>
                        {projectHeadings.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => onUpdate(todo.id, { headingId: h.id })}
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
                              todo.headingId === h.id
                                ? "bg-accent text-accent-foreground"
                                : "bg-secondary text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {h.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Editable time log — adjust the start / finish of a completed entry */}
                    {todo.completed && (
                      <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-2.5">
                        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <Timer className="h-3 w-3" /> Time log
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                          <label className="flex flex-1 flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Started</span>
                            <input
                              type="datetime-local"
                              value={isoToLocalInput(todo.startedAt)}
                              onChange={(e) => commitTimeEdit("startedAt", e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs tabular-nums outline-none focus:ring-1 focus:ring-primary"
                            />
                          </label>
                          <label className="flex flex-1 flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">Finished</span>
                            <input
                              type="datetime-local"
                              value={isoToLocalInput(todo.completedAt)}
                              onChange={(e) => commitTimeEdit("completedAt", e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs tabular-nums outline-none focus:ring-1 focus:ring-primary"
                            />
                          </label>
                        </div>
                        {todo.startedAt && todo.completedAt && (
                          new Date(todo.completedAt).getTime() < new Date(todo.startedAt).getTime() ? (
                            <div className="mt-2 text-[11px] font-medium text-destructive">
                              Finish is before start — duration left unchanged.
                            </div>
                          ) : (
                            todo.lastedMs != null && (
                              <div className="mt-2 text-[11px] text-muted-foreground">
                                Duration{" "}
                                <span className="font-medium text-foreground">{formatDuration(todo.lastedMs)}</span>
                              </div>
                            )
                          )
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {!expanded && todo.notes && (
                notesLocked ? (
                  <div className="mt-0.5 hidden items-center gap-1 truncate text-sm text-muted-foreground xl:flex">
                    <Lock className="h-3 w-3" /> Encrypted notes
                  </div>
                ) : (
                  <div className="mt-0.5 hidden truncate text-sm text-muted-foreground xl:block">
                    {decryptedText}
                  </div>
                )
              )}

              {!running && hasTimeMeta && !(expanded && todo.completed) && (
                <div
                  className={cn(
                    "mt-1.5 flex flex-wrap items-center gap-1.5",
                    !expanded && "hidden xl:flex",
                  )}
                >
                  {todo.startedAt && (
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      started @ {formatTagTime(todo.startedAt)}
                    </span>
                  )}
                  {todo.completed && todo.completedAt && (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      finished @ {formatTagTime(todo.completedAt)}
                    </span>
                  )}
                  {todo.lastedMs != null && (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                      {todo.completed ? "lasted" : "tracked"} {formatDuration(todo.lastedMs)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Timer — slides in from the left when running */}
            <AnimatePresence initial={false}>
              {running && (
                <motion.div
                  key="timer"
                  initial={{ opacity: 0, x: -32, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, scale: 0.9, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } }}
                  transition={{ type: "spring", damping: 22, stiffness: 280, delay: 0.08 }}
                  className="col-start-3 row-start-1 mr-0 flex min-h-11 shrink-0 flex-col items-end justify-center sm:mr-1 sm:min-h-8"
                >
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-primary-strong">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                    {formatDuration(liveMs)}
                  </span>
                  {todo.startedAt && (
                    <span
                      className={cn(
                        "text-[11px] text-muted-foreground",
                        !expanded && "hidden xl:inline",
                      )}
                    >
                      {formatTagTime(todo.startedAt)}
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Timer is optional; secondary task actions stay out of the way. */}
            <div
              className={cn(
                "flex shrink-0 items-center gap-0.5",
                !expanded && (running ? "col-start-4 row-start-1" : "col-start-3 row-start-1"),
              )}
            >
              {inTrash ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore?.(todo.id);
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:h-8 sm:w-8"
                    aria-label="Restore to-do"
                    title="Restore"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPurge?.(todo.id);
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:w-8"
                    aria-label="Delete permanently"
                    title="Delete permanently"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/45 transition-all hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:opacity-100 sm:h-8 sm:w-8 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {!todo.completed && (
                        <>
                          <DropdownMenuItem
                            onSelect={() =>
                              onUpdate(todo.id, { list: "today", dueDate: localDateKey(), evening: false })
                            }
                          >
                            <Star className="mr-2 h-4 w-4 text-star" />
                            Move to Today
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              onUpdate(todo.id, { list: "today", dueDate: localDateKey(), evening: true })
                            }
                          >
                            <Moon className="mr-2 h-4 w-4 text-indigo-400" />
                            This Evening
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              onUpdate(todo.id, {
                                list: "anytime",
                                dueDate: null,
                                dueTime: null,
                                evening: false,
                              })
                            }
                          >
                            <Layers className="mr-2 h-4 w-4 text-primary" />
                            Move to Anytime
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              onUpdate(todo.id, {
                                list: "someday",
                                dueDate: null,
                                dueTime: null,
                                evening: false,
                              })
                            }
                          >
                            <Hourglass className="mr-2 h-4 w-4 text-muted-foreground" />
                            Move to Someday
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem
                        onSelect={() => onDelete(todo.id)}
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * A running timer re-renders its own row once a second; without this the whole
 * list would re-render with it. The callbacks from useTodos are referentially
 * stable, so a shallow prop compare is enough to keep the other rows still.
 */
export const TodoItem = memo(TodoItemImpl);

export function TodoDragPreview({ todo }: { todo: Todo }) {
  const running = !!todo.startedAt && !todo.completed;
  return (
    <div
      className={cn(
        "scale-[1.02] rounded-xl bg-card px-3 py-2.5 shadow-2xl ring-1 ring-primary/20",
        running && "ring-primary/40",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border-2 border-muted-foreground/40" />
        <div
          className={cn(
            "truncate text-[15px] font-medium leading-tight",
            todo.completed && "text-muted-foreground line-through",
          )}
        >
          {todo.title}
        </div>
      </div>
    </div>
  );
}
