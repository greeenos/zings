import { Keyboard } from "@/lib/icons";
import { DialogShell } from "@/components/todo/DialogShell";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SECTIONS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: "Lists",
    rows: [
      ["1", "Inbox"],
      ["2", "Today"],
      ["3", "Anytime"],
      ["4", "Logbook"],
      ["5", "Calendar · Activity"],
      ["6", "Calendar · Schedule"],
    ],
  },
  {
    title: "Selecting",
    rows: [
      ["↑ ↓", "Move through the list"],
      ["⇧ ↑↓", "Extend the selection"],
      ["⌘ A", "Select everything in view"],
      ["Space", "Complete the selection"],
      ["⌘ ⌫", "Move the selection to Trash"],
      ["Esc", "Clear the selection"],
    ],
  },
  {
    title: "Moving the selection",
    rows: [
      ["T", "Today"],
      ["E", "This Evening"],
      ["A", "Anytime"],
      ["S", "Someday"],
    ],
  },
  {
    title: "Tasks",
    rows: [
      ["N", "New to-do"],
      ["Drag +", "Drop the + on a row to insert it there"],
      ["@", "Tag with list or project while typing"],
      ["#", "Set a due date (#tomorrow, #po, #15.7., #3d)"],
      ["!", "Exact time / range or duration (!20:00-20:30, !30m)"],
      ["HH:MM", "Also sets a time or range (9:30, 14:00-15:00)"],
      ["Enter", "Save the to-do"],
      ["Esc", "Cancel"],
    ],
  },
  {
    title: "App",
    rows: [
      ["⌘ K", "Quick Find"],
      ["⌘ F", "Search"],
      ["?", "Show this cheatsheet"],
      ["Esc", "Close any open panel"],
    ],
  },
];

export default function KeyboardShortcuts({ open, onClose }: Props) {
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      subtitle="Move faster around Zings."
      icon={<Keyboard className="h-[18px] w-[18px]" />}
    >
      {SECTIONS.map((sec) => (
        <div key={sec.title}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {sec.title}
          </div>
          <dl className="space-y-1">
            {sec.rows.map(([keys, label]) => (
              <div key={keys + label} className="flex items-center justify-between gap-3 py-0.5">
                <dt className="text-sm text-foreground">{label}</dt>
                <dd className="flex shrink-0 items-center gap-1">
                  {keys.split(" ").map((k, i) => (
                    <kbd
                      key={i}
                      className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-secondary px-1.5 text-[11px] font-mono font-medium text-foreground"
                    >
                      {k}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Tip: press <kbd className="rounded bg-secondary px-1 font-mono">?</kbd> from anywhere to open this list.
      </p>
    </DialogShell>
  );
}
