/**
 * The slice of framer-motion's API that Zings uses — `motion.*` elements with
 * initial / animate / exit / whileHover / whileTap / layoutId / layout,
 * `AnimatePresence` and `LayoutGroup` — on top of the browser's own Web
 * Animations API. Springs become CSS `linear()` easing curves, so the whole
 * thing costs a few KB instead of ~130 KB.
 *
 * Without element.animate (old browsers, jsdom) or with prefers-reduced-motion
 * every element simply jumps to its final state.
 */
import {
  Children,
  createContext,
  createElement,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type Key,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

type Ease = number[] | "linear" | "easeIn" | "easeOut" | "easeInOut";
interface Transition {
  duration?: number;
  delay?: number;
  ease?: Ease;
  type?: "spring" | "tween";
  damping?: number;
  stiffness?: number;
  mass?: number;
}
type Value = number | string;
type Target = { [key: string]: Value | Transition | undefined; transition?: Transition };

interface MotionProps {
  initial?: Target | false;
  animate?: Target;
  exit?: Target;
  transition?: Transition;
  whileHover?: Target;
  whileTap?: Target;
  layout?: boolean | "position";
  layoutId?: string;
}

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- easing -----------------------------------------------------------------

const NAMED_EASE: Record<string, string> = {
  linear: "linear",
  easeIn: "cubic-bezier(0.42, 0, 1, 1)",
  easeOut: "cubic-bezier(0, 0, 0.58, 1)",
  easeInOut: "cubic-bezier(0.42, 0, 0.58, 1)",
};
const DEFAULT_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const springCache = new Map<string, { easing: string; duration: number }>();

/** Simulates a unit spring and samples it into a CSS linear() curve. */
function spring({ stiffness = 100, damping = 10, mass = 1 }: Transition) {
  const key = `${stiffness}/${damping}/${mass}`;
  const cached = springCache.get(key);
  if (cached) return cached;
  const dt = 1 / 120;
  const points: number[] = [];
  let x = 0;
  let v = 0;
  let t = 0;
  while (t < 2) {
    v += ((-stiffness * (x - 1) - damping * v) / mass) * dt;
    x += v * dt;
    t += dt;
    points.push(x);
    if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) break;
  }
  const step = Math.max(1, Math.ceil(points.length / 48));
  const samples = points.filter((_, i) => i % step === 0).map((p) => +p.toFixed(3));
  const linear = `linear(0, ${samples.join(", ")}, 1)`;
  const supported = typeof CSS !== "undefined" && CSS.supports?.("animation-timing-function", linear);
  const result = { easing: supported ? linear : "cubic-bezier(0.22, 1, 0.36, 1)", duration: t * 1000 };
  springCache.set(key, result);
  return result;
}

function timing(tr: Transition = {}): KeyframeAnimationOptions {
  const delay = (tr.delay ?? 0) * 1000;
  if (tr.type === "spring") return { ...spring(tr), delay };
  const ease = Array.isArray(tr.ease) ? `cubic-bezier(${tr.ease.join(", ")})` : NAMED_EASE[tr.ease ?? ""] ?? DEFAULT_EASE;
  return { duration: (tr.duration ?? 0.25) * 1000, easing: ease, delay };
}

// --- keyframes --------------------------------------------------------------

const IDENTITY: Record<string, Value> = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 };
const px = (v: Value) => (typeof v === "number" ? `${v}px` : v);

/** Turns a framer-style target into a CSS keyframe for `el`. */
function frame(target: Record<string, Value>, el: HTMLElement): Keyframe {
  const out: Keyframe = {};
  const transform: string[] = [];
  for (const [key, value] of Object.entries(target)) {
    if (key === "x" || key === "y") transform.push(`translate${key.toUpperCase()}(${px(value)})`);
    else if (key === "scale") transform.push(`scale(${value})`);
    else if (key === "rotate") transform.push(`rotate(${typeof value === "number" ? `${value}deg` : value})`);
    else if (value === "auto") out[key] = `${key === "height" ? el.scrollHeight : el.scrollWidth}px`;
    else out[key] = key === "opacity" ? String(value) : px(value);
  }
  if (transform.length) out.transform = transform.join(" ");
  return out;
}

function values(target?: Target | false): Record<string, Value> {
  const out: Record<string, Value> = {};
  if (target) for (const [k, v] of Object.entries(target)) if (k !== "transition" && v !== undefined) out[k] = v as Value;
  return out;
}

/** `from` and `to` over the same keys, so transform lists interpolate cleanly. */
function pair(from: Record<string, Value>, to: Record<string, Value>) {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  const a: Record<string, Value> = {};
  const b: Record<string, Value> = {};
  for (const k of keys) {
    a[k] = from[k] ?? to[k] ?? IDENTITY[k] ?? "auto";
    b[k] = to[k] ?? IDENTITY[k] ?? "auto";
  }
  return [a, b] as const;
}

/** Leaves the element styled as `to` once nothing is animating. */
const TRANSFORM_KEYS = ["x", "y", "scale", "rotate"];

function settle(el: HTMLElement, to: Record<string, Value>) {
  const static_ = frame(to, el);
  const keys = Object.keys(to).filter((k) => TRANSFORM_KEYS.includes(k));
  if (keys.length) el.style.transform = keys.some((k) => to[k] !== IDENTITY[k]) ? String(static_.transform) : "";
  for (const [k, v] of Object.entries(to)) {
    if (TRANSFORM_KEYS.includes(k)) continue;
    const css = k === "opacity" && v === 1 ? "" : v === "auto" ? "" : String(static_[k]);
    el.style.setProperty(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), css);
  }
}

function run(el: HTMLElement, from: Record<string, Value>, to: Record<string, Value>, tr?: Transition, leaving = false) {
  const [a, b] = pair(from, to);
  const options = timing(tr);
  const changes = Object.keys(b).some((k) => a[k] !== b[k]);
  const canAnimate = typeof el.animate === "function" && !reducedMotion() && (options.duration as number) > 0 && changes;
  // A height can only grow or shrink smoothly while its content is clipped.
  const clip = canAnimate && "height" in b;
  if (leaving) {
    if (!canAnimate) return Promise.resolve();
    if (clip) el.style.overflow = "hidden";
    return el.animate([frame(a, el), frame(b, el)], { ...options, fill: "forwards" }).finished.then(
      () => undefined,
      () => undefined,
    );
  }
  // Only our own animations: CSS ones (animate-spin, transition-colors) keep running.
  running.get(el)?.cancel();
  if (clipped.delete(el)) el.style.overflow = "";
  settle(el, b);
  if (canAnimate) {
    const animation = el.animate([frame(a, el), frame(b, el)], { ...options, fill: "backwards" });
    running.set(el, animation);
    if (clip) {
      el.style.overflow = "hidden";
      clipped.add(el);
      const unclip = () => {
        if (running.get(el) === animation && clipped.delete(el)) el.style.overflow = "";
      };
      animation.finished.then(unclip, unclip);
    }
  }
  return Promise.resolve();
}

const running = new WeakMap<HTMLElement, Animation>();
const clipped = new WeakSet<HTMLElement>();

// --- presence & layout ------------------------------------------------------

interface PresenceState {
  present: boolean;
  initial: boolean;
  register: () => () => void;
  complete: () => void;
}
const Presence = createContext<PresenceState | null>(null);
const LayoutScope = createContext("");
const sharedRects = new Map<string, DOMRect>();

export function LayoutGroup({ id = "", children }: { id?: string; children: ReactNode }) {
  return <LayoutScope.Provider value={id}>{children}</LayoutScope.Provider>;
}

/** Plays a FLIP transition from `prev` to wherever the element is now. */
function flip(el: HTMLElement, prev: DOMRect | undefined, now: DOMRect, tr: Transition | undefined, positionOnly: boolean) {
  if (!prev || typeof el.animate !== "function" || reducedMotion()) return;
  const dx = prev.left - now.left;
  const dy = prev.top - now.top;
  const sx = positionOnly || !now.width ? 1 : prev.width / now.width;
  const sy = positionOnly || !now.height ? 1 : prev.height / now.height;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
  el.animate(
    [
      { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transformOrigin: "0 0", transform: "none" },
    ],
    timing(tr ?? { type: "spring", stiffness: 350, damping: 30 }),
  );
}

const MOTION_PROPS = ["initial", "animate", "exit", "transition", "whileHover", "whileTap", "layout", "layoutId"];

function createMotion(tag: string) {
  const Component = forwardRef<HTMLElement, MotionProps & Record<string, unknown>>((props, forwarded) => {
    const { initial, animate, exit, transition, whileHover, whileTap, layout, layoutId } = props as MotionProps;
    const ref = useRef<HTMLElement | null>(null);
    const presence = useContext(Presence);
    const scope = useContext(LayoutScope);
    const current = useRef<Record<string, Value>>({});
    const hovering = useRef(false);
    const lastRect = useRef<DOMRect>();
    const animateKey = JSON.stringify(animate ?? null);

    // Mount, and every change of `animate`.
    const mounted = useRef(false);
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      const to = values(animate);
      if (!mounted.current) {
        mounted.current = true;
        const skip = initial === false || presence?.initial === false;
        run(el, skip ? to : { ...to, ...values(initial) }, to, transition);
      } else {
        run(el, current.current, to, transition);
      }
      current.current = to;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [animateKey]);

    // Exit: play `exit`, then tell the presence it may unmount us.
    const presenceRef = useRef(presence);
    presenceRef.current = presence;
    const hasExit = !!exit && !!presence;
    useEffect(() => (hasExit ? presenceRef.current!.register() : undefined), [hasExit]);
    useEffect(() => {
      const el = ref.current;
      if (!exit || !presence || presence.present || !el) return;
      void run(el, current.current, values(exit), exit.transition ?? transition, true).then(presence.complete);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [presence?.present]);

    // Shared-element (layoutId) and in-place (layout) transitions.
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el || (!layoutId && !layout)) return;
      const rect = el.getBoundingClientRect();
      if (layoutId) {
        const key = `${scope}:${layoutId}`;
        flip(el, sharedRects.get(key), rect, transition, false);
        sharedRects.set(key, rect);
        return () => {
          if (el.isConnected) sharedRects.set(key, el.getBoundingClientRect());
        };
      }
      flip(el, lastRect.current, rect, transition, layout === "position");
      lastRect.current = rect;
    });

    const gesture = (target: Target | undefined) => {
      const el = ref.current;
      if (!el) return;
      const to = { ...values(animate), ...values(target) };
      run(el, current.current, to, { type: "spring", stiffness: 500, damping: 30 });
      current.current = to;
    };
    const chain = (name: string, fn: () => void) => (event: unknown) => {
      (props[name] as ((e: unknown) => void) | undefined)?.(event);
      fn();
    };

    const domProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) if (!MOTION_PROPS.includes(k)) domProps[k] = v;
    if (whileHover || whileTap) {
      Object.assign(domProps, {
        onPointerEnter: chain("onPointerEnter", () => {
          hovering.current = true;
          if (whileHover) gesture(whileHover);
        }),
        onPointerLeave: chain("onPointerLeave", () => {
          hovering.current = false;
          gesture(undefined);
        }),
        onPointerDown: chain("onPointerDown", () => whileTap && gesture({ ...values(whileHover), ...values(whileTap) })),
        onPointerUp: chain("onPointerUp", () => gesture(hovering.current ? whileHover : undefined)),
        onPointerCancel: chain("onPointerCancel", () => gesture(undefined)),
      });
    }
    domProps.ref = (node: HTMLElement | null) => {
      ref.current = node;
      if (typeof forwarded === "function") forwarded(node);
      else if (forwarded) forwarded.current = node;
    };
    return createElement(tag, domProps);
  });
  Component.displayName = `motion.${tag}`;
  return Component;
}

type MotionComponent<T extends keyof JSX.IntrinsicElements> = (
  props: Omit<JSX.IntrinsicElements[T], "ref"> & MotionProps & { ref?: Ref<HTMLElement> },
) => ReactElement | null;

const cache = new Map<string, unknown>();
export const motion = new Proxy({} as { [T in keyof JSX.IntrinsicElements]: MotionComponent<T> }, {
  get(_, tag: string) {
    if (!cache.has(tag)) cache.set(tag, createMotion(tag));
    return cache.get(tag);
  },
});

function PresenceChild({ present, initial, onExit, children }: {
  present: boolean;
  initial: boolean;
  onExit: () => void;
  children: ReactNode;
}) {
  const registered = useRef(0);
  const done = useRef(0);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const state = useMemo<PresenceState>(() => {
    done.current = 0;
    return {
      present,
      initial,
      register: () => {
        registered.current += 1;
        return () => {
          registered.current -= 1;
        };
      },
      complete: () => {
        done.current += 1;
        if (done.current >= registered.current) exitRef.current();
      },
    };
  }, [present, initial]);
  useEffect(() => {
    if (!present && registered.current === 0) exitRef.current();
  }, [present]);
  return <Presence.Provider value={state}>{children}</Presence.Provider>;
}

/** Keeps removed children mounted until their `exit` animation has played. */
export function AnimatePresence({ children, initial = true, mode = "sync" }: {
  children?: ReactNode;
  initial?: boolean;
  mode?: "sync" | "wait";
}) {
  const [, rerender] = useState(0);
  const firstRender = useRef(true);
  const elements = useRef(new Map<Key, ReactElement>());
  const leaving = useRef(new Set<Key>());
  const order = useRef<Key[]>([]);
  useEffect(() => {
    firstRender.current = false;
  }, []);

  const current = Children.toArray(children).filter(isValidElement) as ReactElement[];
  // Preact's toArray keeps unkeyed children unkeyed; React's prefixes them.
  const keys: Key[] = current.map((child, index) => child.key ?? `.${index}`);
  for (const key of elements.current.keys()) if (!keys.includes(key)) leaving.current.add(key);
  current.forEach((child, index) => {
    elements.current.set(keys[index], child);
    leaving.current.delete(keys[index]);
  });
  const merged: Key[] = [...keys];
  order.current.forEach((key, index) => {
    if (leaving.current.has(key) && !merged.includes(key)) merged.splice(Math.min(index, merged.length), 0, key);
  });
  order.current = merged;

  const waiting = mode === "wait" && leaving.current.size > 0;
  const shown = waiting ? merged.filter((key) => leaving.current.has(key)) : merged;

  return (
    <>
      {shown.map((key) => (
        <PresenceChild
          key={key}
          present={!leaving.current.has(key)}
          initial={initial || !firstRender.current}
          onExit={() => {
            if (!leaving.current.has(key)) return;
            leaving.current.delete(key);
            elements.current.delete(key);
            rerender((n) => n + 1);
          }}
        >
          {elements.current.get(key)}
        </PresenceChild>
      ))}
    </>
  );
}
