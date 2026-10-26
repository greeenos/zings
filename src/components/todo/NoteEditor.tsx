import { useRef, useState } from "react";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  Minus,
  Quote,
  Type,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

const TEXT_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6"];
const BG_COLORS = ["#fee2e2", "#fef3c7", "#d1fae5", "#dbeafe", "#ede9fe"];

type Cmd = {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  prefix?: string;
  wrap?: [string, string];
  block?: string;
  keywords: string[];
};

const COMMANDS: Cmd[] = [
  { id: "text", label: "Text", description: "Plain paragraph.", icon: Type, prefix: "", keywords: ["text", "plain", "paragraph"] },
  { id: "h1", label: "Heading 1", description: "Largest heading.", icon: Heading1, prefix: "# ", keywords: ["heading", "h1", "title"] },
  { id: "h2", label: "Heading 2", description: "Medium heading.", icon: Heading2, prefix: "## ", keywords: ["heading", "h2"] },
  { id: "h3", label: "Heading 3", description: "Small heading.", icon: Heading3, prefix: "### ", keywords: ["heading", "h3"] },
  { id: "quote", label: "Quote", description: "Blockquote for emphasis.", icon: Quote, prefix: "> ", keywords: ["quote", "blockquote"] },
  { id: "divider", label: "Divider", description: "Visually separate content.", icon: Minus, block: "---", keywords: ["divider", "line", "hr", "separator"] },
  { id: "list", label: "List", description: "Bulleted list.", icon: List, prefix: "- ", keywords: ["list", "bullet", "ul"] },
  { id: "bold", label: "Bold", description: "Bold text.", icon: Bold, wrap: ["**", "**"], keywords: ["bold", "strong"] },
  { id: "italic", label: "Italic", description: "Italic text.", icon: Italic, wrap: ["*", "*"], keywords: ["italic", "em"] },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}

export function NoteEditor({ value, onChange, placeholder, rows = 2 }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [menuStart, setMenuStart] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState(0);

  const close = () => {
    setMenuStart(null);
    setFilter("");
    setActive(0);
  };

  const open = menuStart !== null;
  const filtered = open
    ? COMMANDS.filter((c) => {
        const q = filter.toLowerCase();
        if (!q) return true;
        return c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q));
      })
    : [];

  const setCaret = (pos: number, selEnd?: number) => {
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(pos, selEnd ?? pos);
    });
  };

  const applyCommand = (cmd: Cmd) => {
    if (menuStart === null) return;
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = value.slice(0, menuStart);
    const after = value.slice(cursor);

    if (cmd.prefix !== undefined) {
      const lineStart = before.lastIndexOf("\n") + 1;
      const head = before.slice(0, lineStart);
      const lineRest = before.slice(lineStart);
      const next = head + cmd.prefix + lineRest + after;
      onChange(next);
      setCaret(head.length + cmd.prefix.length + lineRest.length);
    } else if (cmd.wrap) {
      const [openTag, closeTag] = cmd.wrap;
      const placeholder = cmd.label.toLowerCase();
      const insertion = `${openTag}${placeholder}${closeTag}`;
      onChange(before + insertion + after);
      const selStart = before.length + openTag.length;
      setCaret(selStart, selStart + placeholder.length);
    } else if (cmd.block) {
      const needsPrefix = before.length > 0 && !before.endsWith("\n");
      const needsSuffix = after.length > 0 && !after.startsWith("\n");
      const insertion = `${needsPrefix ? "\n" : ""}${cmd.block}${needsSuffix ? "\n" : ""}`;
      onChange(before + insertion + after);
      setCaret(before.length + insertion.length);
    }
    close();
  };

  const applySwatch = (kind: "color" | "bg", color: string) => {
    if (menuStart === null) return;
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = value.slice(0, menuStart);
    const after = value.slice(cursor);
    const placeholder = "text";
    const tag =
      kind === "color"
        ? `<span style="color:${color}">${placeholder}</span>`
        : `<span style="background-color:${color}">${placeholder}</span>`;
    onChange(before + tag + after);
    const offset = tag.indexOf(`>${placeholder}<`) + 1;
    setCaret(before.length + offset, before.length + offset + placeholder.length);
    close();
  };

  return (
    <div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          if (open) {
            const caret = e.target.selectionStart;
            if (menuStart !== null && (caret <= menuStart || v[menuStart] !== "/")) {
              close();
              return;
            }
            const f = v.slice(menuStart + 1, caret);
            if (/\s/.test(f)) {
              close();
              return;
            }
            setFilter(f);
            setActive(0);
          }
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter") {
              if (filtered[active]) {
                e.preventDefault();
                e.stopPropagation();
                applyCommand(filtered[active]);
              }
              return;
            }
            if (e.key === "Backspace") {
              const pos = e.currentTarget.selectionStart;
              if (menuStart !== null && pos <= menuStart + 1) {
                close();
              }
            }
          } else if (e.key === "/") {
            const pos = e.currentTarget.selectionStart;
            requestAnimationFrame(() => {
              setMenuStart(pos);
              setFilter("");
              setActive(0);
            });
          }
        }}
        onBlur={() => {
          setTimeout(close, 100);
        }}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none bg-transparent text-base md:text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
      />

      {open && (filtered.length > 0 || !filter) && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="mt-2 w-full max-w-sm overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {filtered.length > 0 && (
            <div className="max-h-72 overflow-y-auto p-1">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Basic
              </div>
              {filtered.map((c, idx) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => applyCommand(c)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors",
                      active === idx ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-tight">{c.label}</div>
                      <div className="truncate text-xs text-muted-foreground">{c.description}</div>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {!filter && (
            <div className="border-t border-border p-1">
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Text color
              </div>
              <div className="flex flex-wrap gap-1 px-2 pb-1.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => applySwatch("color", c)}
                    className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
                    aria-label={`Text color ${c}`}
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
                      style={{ color: c }}
                    >
                      A
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-0.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Background
              </div>
              <div className="flex flex-wrap gap-1 px-2 pb-2">
                {BG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => applySwatch("bg", c)}
                    className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
                    aria-label={`Background ${c}`}
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-md text-xs font-bold text-foreground"
                      style={{ backgroundColor: c }}
                    >
                      A
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
