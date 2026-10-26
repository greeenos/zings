import { Sparkles } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { Suggestion } from "./mention";

interface MentionPopoverProps {
  suggestions: Suggestion[];
  active: number;
  onHover: (idx: number) => void;
  onPick: (suggestion: Suggestion) => void;
  /** Where to anchor the popover. "below" floats under the input; "inline" sits in-flow. */
  variant?: "below" | "inline";
  className?: string;
}

export function MentionPopover({
  suggestions,
  active,
  onHover,
  onPick,
  variant = "inline",
  className,
}: MentionPopoverProps) {
  if (suggestions.length === 0) return null;

  return (
    <div
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        "max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg",
        variant === "below" ? "mt-2" : "absolute left-0 right-0 top-full z-30 mt-1",
        className,
      )}
    >
      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Tag with
      </div>
      {suggestions.map((suggestion, index) => {
        const isActive = index === active;
        return (
          <button
            key={`${suggestion.kind}-${"id" in suggestion ? suggestion.id : suggestion.query}-${index}`}
            type="button"
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(suggestion)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              isActive ? "bg-accent" : "hover:bg-accent/50",
            )}
          >
            {suggestion.kind === "list" ? (
              <suggestion.icon className={cn("h-4 w-4 shrink-0", suggestion.color ?? "text-muted-foreground")} />
            ) : suggestion.kind === "project" ? (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: suggestion.color }}
              />
            ) : (
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            )}
            <span className="flex-1 truncate">{suggestion.label}</span>
            {suggestion.kind === "list" && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">List</span>
            )}
            {suggestion.kind === "project" && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Project</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
