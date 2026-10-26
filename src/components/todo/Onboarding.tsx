import { useState } from "react";
import { Sparkles } from "@/lib/icons";
import { DialogShell } from "@/components/todo/DialogShell";

interface Props {
  open: boolean;
  onAccept: () => Promise<void>;
  onSkip: () => void;
}

const SAMPLES = [
  { name: "Work", color: "#3b82f6" },
  { name: "Personal", color: "#10b981" },
  { name: "Errands", color: "#f59e0b" },
];

export default function Onboarding({ open, onAccept, onSkip }: Props) {
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onAccept();
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={onSkip}
      title="Welcome to Zings"
      subtitle="Start with a clean slate, or add a few examples."
      icon={<Sparkles className="h-[18px] w-[18px]" />}
      doneLabel="Start empty"
    >
      <p className="text-sm text-muted-foreground">
        A few example projects show how lists, projects, and the focus timer work:
      </p>
      <ul className="space-y-1.5 text-sm">
        {SAMPLES.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} /> {s.name}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Tip: press <kbd className="rounded bg-secondary px-1 font-mono">?</kbd> any time for keyboard shortcuts.
      </p>
      <button
        onClick={accept}
        disabled={busy}
        className="btn-3d btn-secondary w-full"
      >
        {busy ? "Setting up…" : "Add examples"}
      </button>
    </DialogShell>
  );
}
