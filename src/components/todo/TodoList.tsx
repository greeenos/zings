import { useState } from "react";
import { AnimatePresence, motion } from "@/lib/motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  type Modifier,
} from "@dnd-kit/core";
import { Moon, X } from "@/lib/icons";

function isInteractiveElement(el: Element | null): boolean {
  const tags = ["button", "input", "textarea", "select", "a"];
  while (el) {
    if (tags.includes(el.tagName.toLowerCase())) return true;
    el = el.parentElement;
  }
  return false;
}

class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: React.PointerEvent) => {
        if (!nativeEvent.isPrimary || nativeEvent.button !== 0) return false;
        if (isInteractiveElement(nativeEvent.target as Element)) return false;
        return true;
      },
    },
  ];
}
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChecklistItem, Heading, Project, Todo } from "@/types/todo";
import { TodoSection } from "@/lib/grouping";
import { cn } from "@/lib/utils";
import { TodoItem, TodoDragPreview } from "./TodoItem";
import { EmptyArt, EmptyState } from "./EmptyState";

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

// Rows and sections fold away when they leave (a completed to-do once its tick
// has shown, a section that empties) so everything below glides up instead of
// jumping, and unfold the same way when they arrive.
const FOLDED = { opacity: 0, height: 0 };
const OPEN = { opacity: 1, height: "auto" };
const FOLD = { ...FOLDED, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } };
const UNFOLD = { duration: 0.32, ease: [0.22, 1, 0.36, 1] };

interface Props {
  sections: TodoSection[];
  onToggle: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Todo>) => void;
  onDelete: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onReorder: (activeId: string, overId: string, visibleIds: string[]) => void;
  onSetChecklist?: (id: string, items: ChecklistItem[]) => void;
  emptyArt: EmptyArt;
  emptyTitle: string;
  emptyHint?: string;
  activeList: string;
  anyRunning: boolean;
  projects?: Project[];
  headings?: Heading[];
  knownTags?: string[];
  isProjectView?: boolean;
  onCreateProject?: (name: string) => Promise<Project | null>;
  /** Multi-select, owned by the page so keyboard shortcuts can reach it. */
  selectedIds?: Set<string>;
  cursorId?: string | null;
  onSelect?: (id: string, mods: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onBackgroundClick?: () => void;
  inTrash?: boolean;
  onRestore?: (id: string) => void;
  onPurge?: (id: string) => void;
  onDeleteHeading?: (id: string) => void;
}

function SectionHeader({
  section,
  onDeleteHeading,
}: {
  section: TodoSection;
  onDeleteHeading?: (id: string) => void;
}) {
  if (!section.label) return null;

  if (section.kind === "day") {
    return (
      <div className="mb-2 mt-7 flex items-baseline gap-3 px-2 first:mt-0">
        <span className="font-display text-[13px] font-semibold tracking-tight text-foreground">
          {section.label}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  if (section.kind === "heading") {
    return (
      <div className="group/sec mb-1.5 mt-7 px-2 first:mt-0">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate font-display text-[13px] font-semibold tracking-tight text-foreground">
            {section.label}
          </div>
          {section.refId && onDeleteHeading && (
            <button
              type="button"
              onClick={() => onDeleteHeading(section.refId!)}
              className="shrink-0 rounded p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/sec:opacity-100 max-md:opacity-100"
              aria-label={`Delete section ${section.label}`}
              title="Delete section — its to-dos stay in the project"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-1 h-px bg-border" />
      </div>
    );
  }

  if (section.kind === "evening") {
    return (
      <div className="mb-2 mt-7 flex items-center gap-2 px-2 text-indigo-500 first:mt-0 dark:text-indigo-300">
        <Moon className="h-3.5 w-3.5" />
        <span className="font-display text-[13px] font-semibold">{section.label}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  // Project / Inbox runs inside a list view.
  return (
    <div
      className={cn(
        "mb-2 mt-7 flex items-center gap-2 px-2 first:mt-0",
        section.kind === "inbox" && "text-muted-foreground",
      )}
      style={section.kind === "project" ? { color: section.color } : undefined}
    >
      <span
        className={cn("h-2 w-2 rounded-full", section.kind === "inbox" && "bg-muted-foreground/60")}
        style={section.kind === "project" ? { backgroundColor: section.color } : undefined}
      />
      <span className="font-display text-[13px] font-semibold">{section.label}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{section.todos.length}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function TodoList({
  sections,
  onToggle,
  onUpdate,
  onDelete,
  onStart,
  onStop,
  onReorder,
  onSetChecklist,
  emptyArt,
  emptyTitle,
  emptyHint,
  activeList,
  anyRunning,
  projects = [],
  headings = [],
  knownTags = [],
  isProjectView = false,
  onCreateProject,
  selectedIds,
  cursorId,
  onSelect,
  onBackgroundClick,
  inTrash = false,
  onRestore,
  onPurge,
  onDeleteHeading,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 5 } }),
    // A 200ms hold starts a reorder on touch; moving sooner than that cancels
    // it, which is exactly what a horizontal swipe does.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const flat = sections.flatMap((s) => s.todos);
  const visibleIds = flat.map((t) => t.id);

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingId(null);
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id), visibleIds);
    }
  }

  const draggingTodo = draggingId ? flat.find((t) => t.id === draggingId) : null;

  if (flat.length === 0) {
    return <EmptyState art={emptyArt} title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
        <div
          className="flex flex-col"
          onClick={(e) => {
            // A click on the empty space below the rows clears the selection.
            if (e.target === e.currentTarget) onBackgroundClick?.();
          }}
        >
          <AnimatePresence initial={false}>
            {sections.map((section) => (
              <motion.div
                key={section.key}
                initial={FOLDED}
                animate={OPEN}
                exit={FOLD}
                transition={UNFOLD}
                className="flex flex-col"
              >
                <SectionHeader section={section} onDeleteHeading={onDeleteHeading} />
                <AnimatePresence initial={false}>
                  {section.todos.map((t) => (
                    <motion.div key={t.id} data-todo-id={t.id} initial={FOLDED} animate={OPEN} exit={FOLD} transition={UNFOLD}>
                      <TodoItem
                        todo={t}
                        onToggle={onToggle}
                        onUpdate={onUpdate}
                        onDelete={onDelete}
                        onStart={onStart}
                        onStop={onStop}
                        onSetChecklist={onSetChecklist}
                        activeList={activeList}
                        anyRunning={anyRunning}
                        isProjectView={isProjectView}
                        projects={projects}
                        headings={headings}
                        knownTags={knownTags}
                        onCreateProject={onCreateProject}
                        selected={selectedIds?.has(t.id)}
                        isCursor={cursorId === t.id}
                        onSelect={onSelect}
                        inTrash={inTrash}
                        onRestore={onRestore}
                        onPurge={onPurge}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
        {draggingTodo && <TodoDragPreview todo={draggingTodo} />}
      </DragOverlay>
    </DndContext>
  );
}
