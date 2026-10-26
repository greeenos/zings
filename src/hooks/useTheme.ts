import { useSyncExternalStore } from "react";

const KEY = "things-theme";

export type ThemeMode = "light" | "dark" | "auto";
type ResolvedTheme = "light" | "dark";

/** Origin point (viewport coords) for the circular theme-reveal animation. */
interface RevealOrigin {
  x: number;
  y: number;
}

const THEME_ORDER: ThemeMode[] = ["light", "dark", "auto"];

const isMode = (v: unknown): v is ThemeMode => v === "light" || v === "dark" || v === "auto";

function readMode(): ThemeMode {
  if (typeof localStorage === "undefined") return "auto";
  const stored = localStorage.getItem(KEY);
  return isMode(stored) ? stored : "auto";
}

// ---------------------------------------------------------------------------
// Module-level store so every consumer (header toggle, settings) stays in sync
// and the OS listener is registered exactly once.
// ---------------------------------------------------------------------------

const systemDark =
  typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let mode: ThemeMode = readMode();

/** "auto" follows the OS, which already schedules dark mode by sunset on every platform. */
function computeResolved(m: ThemeMode): ResolvedTheme {
  if (m !== "auto") return m;
  return systemDark?.matches ? "dark" : "light";
}

let resolved: ResolvedTheme = computeResolved(mode);

// Snapshot is a stable object so useSyncExternalStore only re-renders on change.
let snapshot: { mode: ThemeMode; resolved: ResolvedTheme } = { mode, resolved };
const listeners = new Set<() => void>();

function emit() {
  snapshot = { mode, resolved };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function applyResolved(next: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", next === "dark");
  const color = next === "dark" ? "#0C1110" : "#F7FAF8";
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((el) => el.setAttribute("content", color));
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
}
type StartViewTransition = (cb: () => void) => ViewTransition;

// Distinguishes concurrent circular reveals so an interrupted (skipped) one
// can't strip the reveal class out from under a newer one.
let revealSeq = 0;

/**
 * Commit `mutate` (which flips the DOM + store to the new theme) inside a View
 * Transition when supported: a circular reveal from `origin`, or a soft
 * cross-fade for OS-driven auto flips. Falls back to an instant commit when the
 * API is missing or the user prefers reduced motion.
 */
function withViewTransition(mutate: () => void, origin?: RevealOrigin) {
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  if (typeof start !== "function" || prefersReducedMotion()) {
    mutate();
    return;
  }
  const root = document.documentElement;
  if (origin) {
    const radius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    );
    root.style.setProperty("--theme-x", `${origin.x}px`);
    root.style.setProperty("--theme-y", `${origin.y}px`);
    root.style.setProperty("--theme-r", `${radius}px`);
    root.classList.add("theme-reveal");
    const seq = ++revealSeq;
    const cleanup = () => {
      if (seq === revealSeq) root.classList.remove("theme-reveal");
    };
    // then(cleanup, cleanup) also swallows the rejection of an interrupted transition.
    start.call(document, mutate).finished.then(cleanup, cleanup);
    return;
  }
  start.call(document, mutate);
}

/** Update the applied light/dark theme, animating only when it actually changes. */
function setResolved(next: ResolvedTheme, origin?: RevealOrigin) {
  if (next === resolved) return;
  withViewTransition(() => {
    resolved = next;
    applyResolved(resolved);
    emit();
  }, origin);
}

function setMode(next: ThemeMode, origin?: RevealOrigin) {
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  const nextResolved = computeResolved(next);
  if (nextResolved !== resolved) {
    setResolved(nextResolved, origin);
  } else {
    emit(); // resolved unchanged (e.g. dark → auto at night); still refresh the picker UI
  }
}

function cycleMode(origin?: RevealOrigin) {
  setMode(THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length], origin);
}

/** Re-evaluate "auto"; cross-fades if the OS flipped light/dark. */
function reevaluateAuto() {
  if (mode !== "auto") return;
  setResolved(computeResolved("auto"));
}

// One-time client bootstrap: apply the theme before React paints and follow
// the OS while the tab is open.
if (typeof window !== "undefined") {
  applyResolved(resolved);
  systemDark?.addEventListener("change", reevaluateAuto);
}

const SERVER_SNAPSHOT = { mode: "auto" as ThemeMode, resolved: "light" as ResolvedTheme };

export function useTheme() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
  return {
    mode: state.mode,
    resolvedTheme: state.resolved,
    setMode,
    cycle: cycleMode,
  };
}
