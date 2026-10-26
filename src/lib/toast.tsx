/**
 * Toasts: the four calls Zings makes (`toast`, `.success`, `.error`,
 * `.message`) plus an optional action button such as Undo.
 */
import { useEffect, useState } from "react";
import { CircleCheck, CircleX } from "@/lib/icons";
import { AnimatePresence, motion } from "@/lib/motion";

interface Options {
  action?: { label: string; onClick: () => void };
}
interface Item extends Options {
  id: number;
  message: string;
  kind: "default" | "success" | "error";
}

const VISIBLE = 3;
let items: Item[] = [];
let nextId = 1;
const listeners = new Set<(items: Item[]) => void>();

function publish(next: Item[]) {
  items = next;
  for (const listener of listeners) listener(items);
}

function dismiss(id: number) {
  publish(items.filter((item) => item.id !== id));
}

function show(kind: Item["kind"], message: string, options: Options = {}) {
  const id = nextId++;
  publish([...items, { ...options, id, kind, message }].slice(-VISIBLE));
  // An Undo needs a moment longer to reach.
  setTimeout(() => dismiss(id), options.action ? 6000 : 4000);
  return id;
}

export const toast = Object.assign((message: string, options?: Options) => show("default", message, options), {
  message: (message: string, options?: Options) => show("default", message, options),
  success: (message: string, options?: Options) => show("success", message, options),
  error: (message: string, options?: Options) => show("error", message, options),
});

export function Toaster() {
  const [list, setList] = useState(items);
  useEffect(() => {
    listeners.add(setList);
    return () => void listeners.delete(setList);
  }, []);

  // Centred, and on phones lifted above the floating + button.
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6"
    >
      <AnimatePresence>
        {list.map((item) => (
          <motion.div
            key={item.id}
            role={item.kind === "error" ? "alert" : "status"}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground shadow-elevated"
          >
            {item.kind === "success" && <CircleCheck className="h-4 w-4 shrink-0 text-primary-strong" />}
            {item.kind === "error" && <CircleX className="h-4 w-4 shrink-0 text-destructive" />}
            <p className="min-w-0 flex-1 font-medium">{item.message}</p>
            {item.action && (
              <button
                onClick={() => {
                  item.action!.onClick();
                  dismiss(item.id);
                }}
                className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                {item.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
