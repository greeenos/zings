import { useRef } from "react";
import { AnimatePresence, motion } from "@/lib/motion";
import { Check, Plus, X } from "@/lib/icons";
import { ChecklistItem } from "@/types/todo";
import { cn } from "@/lib/utils";
import { uuid } from "@/lib/uuid";

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

/**
 * The steps inside a to-do. Deliberately not to-dos themselves: they have no
 * date, no project and never show up in a list — they exist only to break one
 * task into the handful of moves it actually takes.
 */
export function Checklist({ items, onChange }: Props) {
  const inputs = useRef(new Map<string, HTMLInputElement | null>());

  const focusItem = (id: string, caret: "start" | "end" = "end") => {
    requestAnimationFrame(() => {
      const el = inputs.current.get(id);
      if (!el) return;
      el.focus();
      const pos = caret === "end" ? el.value.length : 0;
      el.setSelectionRange(pos, pos);
    });
  };

  const patch = (id: string, next: Partial<ChecklistItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...next } : item)));

  const insertAfter = (index: number) => {
    const item: ChecklistItem = { id: uuid(), text: "", done: false };
    const next = [...items];
    next.splice(index + 1, 0, item);
    onChange(next);
    focusItem(item.id);
  };

  const remove = (id: string, focusPrevious = false) => {
    const index = items.findIndex((item) => item.id === id);
    onChange(items.filter((item) => item.id !== id));
    if (focusPrevious && index > 0) focusItem(items[index - 1].id);
  };

  const doneCount = items.filter((item) => item.done).length;

  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/25 p-2.5">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Checklist
        </span>
        {items.length > 0 && (
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="group/ci flex items-center gap-2 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => patch(item.id, { done: !item.done })}
              className={cn(
                "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border-2 transition-colors",
                item.done
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/35 hover:border-primary",
              )}
              aria-label={item.done ? "Mark step as not done" : "Mark step as done"}
            >
              {item.done && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3.5} />}
            </button>

            <input
              ref={(el) => {
                if (el) inputs.current.set(item.id, el);
                else inputs.current.delete(item.id);
              }}
              value={item.text}
              onChange={(e) => patch(item.id, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  insertAfter(index);
                } else if (e.key === "Backspace" && item.text === "") {
                  e.preventDefault();
                  remove(item.id, true);
                } else if (e.key === "ArrowUp" && index > 0) {
                  e.preventDefault();
                  focusItem(items[index - 1].id);
                } else if (e.key === "ArrowDown" && index < items.length - 1) {
                  e.preventDefault();
                  focusItem(items[index + 1].id);
                }
              }}
              placeholder="Step"
              className={cn(
                "min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/60",
                item.done && "text-muted-foreground line-through",
              )}
            />

            <button
              type="button"
              onClick={() => remove(item.id)}
              className="shrink-0 rounded p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/ci:opacity-100 max-md:opacity-100"
              aria-label="Remove step"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => insertAfter(items.length - 1)}
        className="mt-1 flex items-center gap-1.5 rounded px-0.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
        Add step
      </button>
    </div>
  );
}
