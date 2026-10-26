import { cn } from "@/lib/utils";

interface Props {
  /** 0–1. Values outside the range are clamped. */
  value: number;
  /** Outer diameter in px. */
  size?: number;
  color?: string;
  className?: string;
  /** Render a filled centre once complete — the "project done" full stop. */
  showComplete?: boolean;
}

/**
 * The project glyph in the sidebar: a ring that fills as the project's to-dos
 * get ticked off. Reads as a plain coloured dot at a glance and as progress
 * when you actually look — which is exactly how often you need it.
 */
export function ProgressRing({ value, size = 14, color, className, showComplete = true }: Props) {
  const pct = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const stroke = Math.max(1.5, size / 7);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = showComplete && pct >= 1;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0 -rotate-90", className)}
      style={{ color }}
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        opacity={0.25}
      />
      {pct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      )}
      {done && <circle cx={size / 2} cy={size / 2} r={Math.max(1.5, r / 2.2)} fill="currentColor" />}
    </svg>
  );
}
