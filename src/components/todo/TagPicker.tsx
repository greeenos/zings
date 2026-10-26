import { useMemo, useRef, useState } from "react";
import { Tag as TagIcon, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  /** Every tag used anywhere, for suggestions. */
  known: string[];
  onChange: (tags: string[]) => void;
}

/** Tags are lowercase and space-free so "Work" and "work" never split in two. */
function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/^#+/, "");
}

export function TagPicker({ value, known, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = normalizeTag(draft);
    return known
      .filter((t) => !value.includes(t))
      .filter((t) => !q || t.includes(q))
      .slice(0, 6);
  }, [draft, known, value]);

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/25 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <TagIcon className="h-3 w-3" /> Tags
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="text-accent-foreground/60 transition-colors hover:text-accent-foreground"
              aria-label={`Remove tag ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
              if (!draft.trim()) return;
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              e.preventDefault();
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? "Add tag" : "Add a tag…"}
          className="min-w-[6rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>

      {draft.trim() !== "" && suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(tag)}
              className={cn(
                "rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground",
                "transition-colors hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
