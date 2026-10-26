import { useState } from "react";
import { Repeat, X } from "@/lib/icons";
import { RepeatFreq, RepeatRule } from "@/types/todo";
import { cn } from "@/lib/utils";
import { WEEKDAY_LABELS, buildPresets, describeRepeat, normalizeRepeat } from "@/lib/repeat";
import { localDateKey } from "@/lib/date";

interface Props {
  value?: RepeatRule | null;
  /** The to-do's scheduled day — seeds "every <weekday>". */
  anchorDate?: string | null;
  onChange: (rule: RepeatRule | null) => void;
  onDone?: () => void;
}

const FREQ_LABELS: Record<RepeatFreq, string> = {
  day: "days",
  week: "weeks",
  month: "months",
  year: "years",
};

export function RepeatPicker({ value, anchorDate, onChange, onDone }: Props) {
  const anchor = anchorDate ?? localDateKey();
  const presets = buildPresets(anchor);
  const [custom, setCustom] = useState<RepeatRule>(
    () => value ?? { freq: "week", interval: 1, weekdays: [], from: "schedule" },
  );
  const [showCustom, setShowCustom] = useState(false);

  const commitCustom = (next: RepeatRule) => {
    setCustom(next);
    onChange(normalizeRepeat(next));
  };

  const toggleWeekday = (day: number) => {
    const current = custom.weekdays ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day];
    commitCustom({ ...custom, weekdays: next });
  };

  return (
    <div className="w-[16.5rem] select-none">
      <div className="flex flex-col gap-0.5 p-1">
        <button
          type="button"
          onClick={() => {
            onChange(null);
            onDone?.();
          }}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary",
            !value && "bg-secondary font-medium",
          )}
        >
          <X className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1">Never</span>
        </button>

        {presets.map((preset) => {
          const active = !!value && describeRepeat(value) === describeRepeat(preset.rule);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onChange(preset.rule);
                onDone?.();
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary",
                active && "bg-secondary font-medium",
              )}
            >
              <Repeat className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1">{preset.label}</span>
            </button>
          );
        })}
      </div>

      <div className="my-1 h-px bg-border" />

      <button
        type="button"
        onClick={() => setShowCustom((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <span className="flex-1">Custom…</span>
        <span className="text-xs">{showCustom ? "−" : "+"}</span>
      </button>

      {showCustom && (
        <div className="space-y-2.5 p-2.5 pt-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Every</span>
            <input
              type="number"
              min={1}
              max={365}
              value={custom.interval}
              onChange={(e) => commitCustom({ ...custom, interval: Math.max(1, +e.target.value || 1) })}
              className="w-14 rounded-md border border-border bg-background px-2 py-1 text-xs tabular-nums outline-none focus:ring-1 focus:ring-primary"
            />
            <select
              value={custom.freq}
              onChange={(e) => commitCustom({ ...custom, freq: e.target.value as RepeatFreq })}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
            >
              {(Object.keys(FREQ_LABELS) as RepeatFreq[]).map((f) => (
                <option key={f} value={f}>
                  {FREQ_LABELS[f]}
                </option>
              ))}
            </select>
          </div>

          {custom.freq === "week" && (
            <div className="flex flex-wrap gap-1">
              {WEEKDAY_LABELS.map((label, day) => {
                const on = (custom.weekdays ?? []).includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    className={cn(
                      "h-7 w-8 rounded-md text-[11px] font-medium transition-colors",
                      on
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label.slice(0, 2)}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-1">
            {(
              [
                { id: "schedule", label: "Repeat on schedule", hint: "Keeps its planned day even if you tick it late." },
                { id: "completion", label: "Repeat after completion", hint: "Counts from the day you actually finish." },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => commitCustom({ ...custom, from: opt.id })}
                className={cn(
                  "rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary",
                  custom.from === opt.id && "bg-secondary",
                )}
              >
                <div className="text-xs font-medium">{opt.label}</div>
                <div className="text-[10px] leading-snug text-muted-foreground">{opt.hint}</div>
              </button>
            ))}
          </div>

          <div className="rounded-md bg-primary-soft/60 px-2 py-1.5 text-[11px] font-medium text-accent-foreground">
            {describeRepeat(custom)}
          </div>
        </div>
      )}
    </div>
  );
}
