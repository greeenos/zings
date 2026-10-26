import { useEffect, useState } from "react";
import { Check, Square } from "@/lib/icons";
import { motion } from "@/lib/motion";
import { Todo } from "@/types/todo";
import { formatDuration } from "@/lib/time";

interface Props {
  todo: Todo;
  onStop: (id: string) => void;
  onComplete: (id: string) => void;
}

export function FocusBar({ todo, onStop, onComplete }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = todo.startedAt
    ? (todo.lastedMs ?? 0) + now - new Date(todo.startedAt).getTime()
    : todo.lastedMs ?? 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary-soft/70 px-3 py-2.5 sm:px-4"
      aria-label={`Focus timer for ${todo.title}`}
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-primary/30" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">In focus</div>
        <div className="truncate text-sm font-semibold">{todo.title}</div>
      </div>
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-primary">
        {formatDuration(elapsed)}
      </span>
      <button
        type="button"
        onClick={() => onStop(todo.id)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
      >
        <Square className="h-3.5 w-3.5" fill="currentColor" />
        <span className="hidden sm:inline">Stop</span>
      </button>
      <button
        type="button"
        onClick={() => onComplete(todo.id)}
        className="btn-3d btn-primary btn-sm"
      >
        <Check className="h-4 w-4" strokeWidth={3} />
        <span className="hidden sm:inline">Complete</span>
      </button>
    </motion.section>
  );
}
