import { useState, type KeyboardEvent, type RefObject } from "react";
import { Inbox as InboxIcon, Star, Layers, Hourglass } from "@/lib/icons";
import { Project, TodoList } from "@/types/todo";

export type MentionTag =
  | { kind: "list"; id: TodoList; label: string }
  | { kind: "project"; id: string; label: string };

export type Suggestion =
  | { kind: "list"; id: TodoList; label: string; icon: React.ComponentType<{ className?: string }>; color?: string }
  | { kind: "project"; id: string; label: string; color?: string }
  | { kind: "create-project"; label: string; query: string };

const LIST_SUGGESTIONS: Extract<Suggestion, { kind: "list" }>[] = [
  { kind: "list", id: "inbox", label: "Inbox", icon: InboxIcon },
  { kind: "list", id: "today", label: "Today", icon: Star, color: "text-star" },
  { kind: "list", id: "anytime", label: "Anytime", icon: Layers, color: "text-primary" },
  { kind: "list", id: "someday", label: "Someday", icon: Hourglass, color: "text-muted-foreground" },
];

function buildMentionSuggestions(filter: string, projects: Project[]): Suggestion[] {
  const q = filter.toLowerCase().trim();
  const lists = LIST_SUGGESTIONS.filter((s) => !q || s.label.toLowerCase().includes(q));
  const proj: Suggestion[] = projects
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .map((p) => ({ kind: "project" as const, id: p.id, label: p.name, color: p.color }));
  const out: Suggestion[] = [...lists, ...proj];
  const exactMatch =
    !!q &&
    (LIST_SUGGESTIONS.some((s) => s.label.toLowerCase() === q) ||
      projects.some((p) => p.name.toLowerCase() === q));
  if (q && !exactMatch) {
    out.push({ kind: "create-project", label: `Create project "${filter.trim()}"`, query: filter.trim() });
  }
  return out;
}

/**
 * Detect any inline @tokens still in the title that the user typed but didn't pick
 * via the popover (e.g. typed "@anytime" then hit Enter without selecting).
 */
export function parseTypedTokens(
  raw: string,
  projects: Project[],
): { cleaned: string; tags: MentionTag[] } {
  const tags: MentionTag[] = [];
  let cleaned = raw;
  const re = /(^|\s)@([^\s@]+)/g;
  const consumed: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const word = m[2].toLowerCase();
    const start = m.index + m[1].length;
    const end = start + 1 + m[2].length;
    const list = LIST_SUGGESTIONS.find((s) => s.id === word);
    if (list) {
      tags.push({ kind: "list", id: list.id, label: list.id });
      consumed.push([start, end]);
      continue;
    }
    const proj = projects.find((p) => p.name.toLowerCase() === word);
    if (proj) {
      tags.push({ kind: "project", id: proj.id, label: proj.name });
      consumed.push([start, end]);
    }
  }
  for (let i = consumed.length - 1; i >= 0; i--) {
    const [s, e] = consumed[i];
    cleaned = cleaned.slice(0, s).replace(/\s+$/, " ") + cleaned.slice(e);
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return { cleaned, tags };
}

/** Strip the `@filter` range from `txt`. Also consumes a single trailing space if present. */
function stripMention(txt: string, from: number, caret: number): string {
  let endStrip = caret;
  if (txt[endStrip] === " ") endStrip += 1;
  return txt.slice(0, from) + txt.slice(endStrip);
}

/**
 * The @-mention popover plumbing shared by the quick-add input and the inline
 * title editor: tracks the token being typed, drives the suggestion list from
 * the keyboard, and puts the caret back after a pick.
 *
 * `onPick` runs once the token is stripped from the title and receives the
 * stripped title; it applies the list/project however the caller stores it.
 */
export function useMentionInput(
  inputRef: RefObject<HTMLInputElement>,
  title: string,
  setTitle: (value: string) => void,
  projects: Project[],
  onPick: (suggestion: Suggestion, strippedTitle: string) => Promise<void> | void,
) {
  const [start, setStart] = useState<number | null>(null);
  const [active, setActive] = useState(0);

  const close = () => {
    setStart(null);
    setActive(0);
  };

  const filter =
    start !== null ? title.slice(start + 1, inputRef.current?.selectionStart ?? title.length) : "";
  const suggestions = start !== null ? buildMentionSuggestions(filter, projects) : [];
  const open = start !== null && suggestions.length > 0;

  const pick = async (suggestion: Suggestion) => {
    const input = inputRef.current;
    if (!input || start === null) return;
    const stripped = stripMention(title, start, input.selectionStart ?? title.length);
    setTitle(stripped);
    await onPick(suggestion, stripped);
    close();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(start, start);
    });
  };

  /** Call right after `setTitle` in the input's onChange: drops the token once it breaks. */
  const onChange = (value: string, caret: number) => {
    if (start === null) return;
    if (caret <= start || value[start] !== "@" || /\s/.test(value.slice(start + 1, caret))) close();
    else setActive(0);
  };

  /** Returns true when the popover owned the key, so the caller skips its own handling. */
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): boolean => {
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        void pick(suggestions[active]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Backspace" && (e.currentTarget.selectionStart ?? 0) <= (start ?? 0) + 1) {
        close();
      }
      return true;
    }
    if (e.key === "@") {
      const pos = e.currentTarget.selectionStart ?? title.length;
      requestAnimationFrame(() => {
        setStart(pos);
        setActive(0);
      });
    }
    return false;
  };

  return { open, suggestions, active, setActive, pick, close, onChange, onKeyDown };
}
