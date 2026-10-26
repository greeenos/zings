import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CalendarClock, Plus, Sparkles, Timer } from "@/lib/icons";
import { motion, AnimatePresence } from "@/lib/motion";
import { Project, RepeatRule, TodoList } from "@/types/todo";
import { parseScheduleTokens, formatEstimate, formatTimeRange } from "@/lib/schedule";
import { describeRepeat } from "@/lib/repeat";
import { fmt, keyToDate, localDateKey } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePicker } from "@/components/todo/DatePicker";
import { MentionPopover } from "@/components/todo/MentionPopover";
import { parseTypedTokens, useMentionInput } from "./mention";
import type { MentionTag } from "./mention";

export interface AddTodoInput {
  title: string;
  list?: TodoList;
  projectId?: string;
  dueDate?: string;
  dueTime?: string;
  estimateMin?: number;
  priority?: number;
  deadline?: string;
  evening?: boolean;
  repeatRule?: RepeatRule;
  /** Set by the Magic Plus so the to-do lands exactly where it was dropped. */
  sortOrder?: number;
}

interface Props {
  onAdd: (input: AddTodoInput) => void;
  projects: Project[];
  onCreateProject: (name: string) => Promise<Project | null>;
  /** Increment to programmatically open the input (used by the "N" shortcut). */
  openSignal?: number;
  /** Prefill the input when openSignal fires (e.g. from Share Target). */
  initialTitle?: string;
  /** Called once `initialTitle` has been applied, so the caller can clear it. */
  onInitialTitleConsumed?: () => void;
  /** Where the task should land if user does not @-tag anything. */
  defaultTarget?: Target;
  /** Position handed over by a Magic Plus drop. */
  sortOrder?: number;
  /** Fired when the + is dragged onto a row: insert above that to-do. */
  onMagicDrop?: (beforeTodoId: string) => void;
  /** Hand the draft to the AI capture dialog (only when AI is set up). */
  onCapture?: (text: string) => void;
}

const PRIORITY_LABELS = ["", "Low priority", "Medium priority", "High priority"];

function applyTag(acc: AddTodoInput, tag: MentionTag): AddTodoInput {
  if (tag.kind === "list") {
    const next: AddTodoInput = { ...acc, list: tag.id };
    if (tag.id === "today") next.dueDate = next.dueDate ?? localDateKey();
    return next;
  }
  return { ...acc, projectId: tag.id };
}

type Target = { kind: "list"; id: TodoList } | { kind: "project"; id: string };

/** A typed title → the to-do it describes: @list/@project, #date, times, !priority and plain phrases. */
export function inputFromText(
  text: string,
  projects: Project[],
  defaultTarget?: Target,
  /** Picked from the @-popover rather than typed; a typed @tag still wins. */
  pickedTags: MentionTag[] = [],
): AddTodoInput | null {
  const { cleaned, tags: typedTags } = parseTypedTokens(text, projects);
  const sched = parseScheduleTokens(cleaned);
  const t = sched.cleaned.trim();
  if (!t) return null;
  let acc: AddTodoInput = { title: t };
  if (defaultTarget) {
    if (defaultTarget.kind === "list") acc.list = defaultTarget.id;
    else acc.projectId = defaultTarget.id;
  }
  for (const tag of [...pickedTags, ...typedTags]) acc = applyTag(acc, tag);
  // Explicit schedule tokens win over any list-implied due date.
  if (sched.dueDate) acc.dueDate = sched.dueDate;
  if (sched.dueTime) acc.dueTime = sched.dueTime;
  if (sched.estimateMin != null) acc.estimateMin = sched.estimateMin;
  if (sched.priority) acc.priority = sched.priority;
  if (sched.deadline) acc.deadline = sched.deadline;
  if (sched.evening) acc.evening = true;
  if (sched.repeatRule) acc.repeatRule = sched.repeatRule;
  return acc;
}

export function AddTodo({
  onAdd,
  projects,
  onCreateProject,
  openSignal,
  initialTitle,
  onInitialTitleConsumed,
  defaultTarget,
  sortOrder,
  onMagicDrop,
  onCapture,
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  /** Tags chosen via the @-popover, not present in the title text. */
  const [appliedTags, setAppliedTags] = useState<MentionTag[]>([]);
  /** Date chosen from the picker rather than typed as a #token. */
  const [picked, setPicked] = useState<{ date: string | null; time: string | null } | null>(null);
  /** While a popover is up, blurring the input must not submit the draft. */
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (openSignal === undefined) return;
    // Only seed the title when the form was closed — re-triggering an
    // already-open form (e.g. clicking "Add" for a different calendar day
    // while mid-draft) must never clobber text the user is typing.
    if (!open && initialTitle) {
      setTitle(initialTitle);
      onInitialTitleConsumed?.();
      const len = initialTitle.length;
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(len, len));
    }
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  const reset = () => {
    setTitle("");
    setAppliedTags([]);
    setPicked(null);
    mention.close();
  };

  const close = () => {
    reset();
    setOpen(false);
  };

  const mention = useMentionInput(inputRef, title, setTitle, projects, async (s) => {
    let tag: MentionTag | null = null;
    if (s.kind === "list") {
      tag = { kind: "list", id: s.id, label: s.label };
    } else if (s.kind === "project") {
      tag = { kind: "project", id: s.id, label: s.label };
    } else {
      const created = await onCreateProject(s.query);
      if (created) tag = { kind: "project", id: created.id, label: created.name };
    }
    if (!tag) return;
    const picked = tag;
    // At most one list and one project: a new pick replaces the old one of its kind.
    setAppliedTags((prev) => [...prev.filter((t) => t.kind !== picked.kind), picked]);
  });

  const submit = () => {
    const acc = inputFromText(title, projects, defaultTarget, appliedTags);
    if (!acc) {
      close();
      return;
    }
    // …and an explicit pick from the calendar wins over both.
    if (picked) {
      acc.dueDate = picked.date ?? undefined;
      acc.dueTime = picked.time ?? undefined;
    }
    if (sortOrder !== undefined) acc.sortOrder = sortOrder;
    onAdd(acc);
    close();
  };

  // Live feedback of the schedule the current text will produce.
  const schedulePreview = useMemo(() => {
    const { cleaned } = parseTypedTokens(title, projects);
    const s = parseScheduleTokens(cleaned);
    const dueDate = picked ? picked.date ?? undefined : s.dueDate;
    const dueTime = picked ? picked.time ?? undefined : s.dueTime;
    if (!dueDate && s.estimateMin == null && !s.priority && !s.deadline) return null;
    const dateLabel = dueDate ? fmt(keyToDate(dueDate), { weekday: "short", month: "short", day: "numeric" }) : null;
    const timeLabel = formatTimeRange(dueTime, s.estimateMin);
    const estLabel = !dueTime && s.estimateMin != null ? formatEstimate(s.estimateMin) : null;
    const extras = [
      s.evening && "Evening",
      s.repeatRule && describeRepeat(s.repeatRule),
      s.deadline && `Deadline ${fmt(keyToDate(s.deadline), { month: "short", day: "numeric" })}`,
      s.priority && PRIORITY_LABELS[s.priority],
    ].filter(Boolean).join(" · ") || null;
    return { dateLabel, timeLabel, estLabel, extras };
  }, [title, projects, picked]);


  // --- Magic Plus ----------------------------------------------------------
  // Drag the + onto a row and the new to-do is inserted right above it, rather
  // than appearing at the top of the list and needing a second drag.
  const [magic, setMagic] = useState<{ x: number; y: number; target: string | null } | null>(null);
  const magicRef = useRef<{ startX: number; startY: number; active: boolean } | null>(null);
  const justDragged = useRef(false);

  const highlightRow = (id: string | null) => {
    document
      .querySelectorAll("[data-magic-target]")
      .forEach((el) => el.removeAttribute("data-magic-target"));
    if (id) document.querySelector(`[data-todo-id="${id}"]`)?.setAttribute("data-magic-target", "");
  };

  const onMagicPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!onMagicDrop) return;
    magicRef.current = { startX: e.clientX, startY: e.clientY, active: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onMagicPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const m = magicRef.current;
    if (!m) return;
    const dx = e.clientX - m.startX;
    const dy = e.clientY - m.startY;
    if (!m.active && Math.hypot(dx, dy) < 10) return;
    m.active = true;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const row = under?.closest("[data-todo-id]") ?? null;
    const target = row?.getAttribute("data-todo-id") ?? null;
    highlightRow(target);
    setMagic({ x: e.clientX, y: e.clientY, target });
  };

  const endMagic = (e: React.PointerEvent<HTMLButtonElement>) => {
    const m = magicRef.current;
    magicRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    highlightRow(null);
    const dropped = magic;
    setMagic(null);
    if (!m?.active) return;
    justDragged.current = true;
    // Swallow the click that follows this pointerup.
    window.setTimeout(() => {
      justDragged.current = false;
    }, 0);
    if (dropped?.target) onMagicDrop?.(dropped.target);
  };

  return (
    <>
      {/* Ghost that follows the pointer during a Magic Plus drag. */}
      {magic && (
        <div
          className="pointer-events-none fixed z-[60] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevated"
          style={{ left: magic.x, top: magic.y }}
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </div>
      )}

      <div className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-30 flex justify-end sm:inset-x-auto sm:bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:right-6 lg:bottom-[calc(2rem+env(safe-area-inset-bottom,0px))] lg:right-8">
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className="max-h-[calc(100dvh_-_2rem_-_env(safe-area-inset-bottom,0px))] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-border/80 bg-card p-3 shadow-elevated sm:w-[min(82vw,520px)]"
            >
              {appliedTags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1 px-1">
                  {appliedTags.map((t, i) => (
                    <span
                      key={`${t.kind}:${t.id}:${i}`}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-foreground"
                    >
                      {t.kind === "list" ? "•" : "#"} {t.label}
                      <button
                        type="button"
                        onClick={() => setAppliedTags((prev) => prev.filter((_, j) => j !== i))}
                        className="ml-0.5 text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${t.label}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                ref={inputRef}
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
                    submit();
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    close();
                    return;
                  }
                  if (e.key === "Backspace" && title === "" && appliedTags.length > 0) {
                    e.preventDefault();
                    setAppliedTags((prev) => prev.slice(0, -1));
                  }
                }}
                onBlur={() => {
                  // Submit on blur, but give popover clicks a tick to register.
                  setTimeout(() => {
                    // Enter or Capture already closed the form (it may still be animating out).
                    if (openRef.current && !mention.open && !pickerOpen) submit();
                  }, 120);
                }}
                placeholder="What do you want to do?"
                className="w-full bg-transparent px-2 py-1.5 text-base font-medium outline-none placeholder:text-muted-foreground/75 md:text-[15px]"
              />

              {!schedulePreview && title.length === 0 && appliedTags.length === 0 && (
                <p className="px-2 pt-1 text-[11px] text-muted-foreground/70">
                  Type <strong>@</strong> for a list, <strong>#</strong> for a date, <strong>!!</strong> for priority, or just write “tomorrow at 5pm”.
                </p>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-2">
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors",
                        picked?.date
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      <CalendarDays className="h-3 w-3" />
                      When
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <DatePicker
                      mode="when"
                      value={picked?.date ?? null}
                      time={picked?.time ?? null}
                      onSelect={(sel) => setPicked({ date: sel.date, time: sel.time ?? null })}
                      onDone={() => {
                        setPickerOpen(false);
                        requestAnimationFrame(() => inputRef.current?.focus());
                      }}
                    />
                  </PopoverContent>
                </Popover>

                {onCapture && (
                  <button
                    type="button"
                    // Keep the draft: blur would submit it before the dialog opens.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const draft = title;
                      reset();
                      setOpen(false);
                      onCapture(draft);
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Sparkles className="h-3 w-3" />
                    Capture
                  </button>
                )}

                {schedulePreview?.dateLabel && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    <CalendarClock className="h-3 w-3" />
                    {schedulePreview.dateLabel}
                    {schedulePreview.timeLabel && (
                      <span className="tabular-nums">{schedulePreview.timeLabel}</span>
                    )}
                  </span>
                )}
                {schedulePreview?.estLabel && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    <Timer className="h-3 w-3" />
                    {schedulePreview.estLabel}
                  </span>
                )}
                {schedulePreview?.extras && (
                  <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {schedulePreview.extras}
                  </span>
                )}
              </div>

              {mention.open && (
                <MentionPopover
                  suggestions={mention.suggestions}
                  active={mention.active}
                  onHover={mention.setActive}
                  onPick={(s) => void mention.pick(s)}
                  variant="below"
                />
              )}
            </motion.div>
          ) : (
            <motion.button
              key="btn"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: magic ? 0.35 : 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onPointerDown={onMagicPointerDown}
              onPointerMove={onMagicPointerMove}
              onPointerUp={endMagic}
              onPointerCancel={endMagic}
              onClick={() => {
                if (justDragged.current) return;
                setOpen(true);
              }}
              className="btn-3d btn-primary h-14 w-14 touch-none !rounded-full !p-0"
              aria-label="New To-Do"
              title="New To-Do — drag onto a row to insert there"
            >
              <Plus className="h-6 w-6" strokeWidth={2.5} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
