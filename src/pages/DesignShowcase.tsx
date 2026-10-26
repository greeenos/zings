import { useEffect, useState } from "react";
import {
  CalendarClock, Check, CheckCircle2, Flag, Inbox, Layers, Loader2, MoreHorizontal, Plus, Search, Star, TriangleAlert,
} from "@/lib/icons";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/utils";

/**
 * /#design — every component state of the design system, light and dark side
 * by side. Static on purpose: it shows the real classes the app uses.
 */

const SWATCHES = [
  ["Mint 300", "#46E8B2"], ["Mint 400", "#2BDD9F"], ["Green 500", "#19D391"], ["Green 600", "#12BE7F"],
  ["Green 700", "#0E9D68"], ["Green 800", "#0A7A52"], ["Deep 900", "#07543A"],
];
const TOKENS = ["background", "card", "secondary", "primary", "primary-soft", "border", "star", "upcoming", "due-soon", "today"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[17px] font-semibold leading-[1.35]">{title}</h3>
      {children}
    </section>
  );
}

function Box({ checked, hover }: { checked?: boolean; hover?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-[19px] w-[19px] items-center justify-center rounded-[6px] border-2",
        checked ? "border-primary-extrusion bg-primary" : hover ? "border-primary-strong bg-primary-soft" : "border-faint bg-card",
      )}
    >
      {checked && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
    </span>
  );
}

function Column({ dark }: { dark?: boolean }) {
  const [picked, setPicked] = useState(1);
  return (
    <div className={cn(dark && "dark", "min-w-0 flex-1")}>
      <div className="space-y-8 rounded-2xl bg-background p-6 text-foreground ring-1 ring-border">
        <div className="flex items-center gap-3">
          <BrandMark className="h-10 w-10" />
          <div>
            <div className="text-[20px] font-semibold leading-[1.3]">{dark ? "Dark" : "Light"}</div>
            <div className="text-xs text-muted-foreground">Rubik Variable · emerald on neutral</div>
          </div>
        </div>

        <Section title="Typography">
          <div className="space-y-1.5">
            <div className="text-[28px] font-bold leading-[1.2]">Main heading 28/700</div>
            <div className="text-[20px] font-semibold leading-[1.3]">Secondary heading 20/600</div>
            <div className="text-[17px] font-semibold leading-[1.35]">Section heading 17/600</div>
            <div className="text-[15px] font-medium leading-[1.45]">Task title 15/500 — Příliš žluťoučký kůň úpěl ďábelské ódy</div>
            <div className="text-sm leading-[1.5]">Body 14/400 — notes and descriptions read comfortably.</div>
            <div className="text-xs font-medium text-muted-foreground">Label 12/500 · <span className="tabular-nums">12:30 · 3/8</span></div>
          </div>
        </Section>

        <Section title="Colour">
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map(([name, hex]) => (
              <div key={name} className="w-[4.5rem] text-[10px] leading-tight">
                <div className="h-8 rounded-md ring-1 ring-border" style={{ background: hex }} />
                <div className="mt-1 font-medium">{name}</div>
                <div className="text-muted-foreground">{hex}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TOKENS.map((t) => (
              <div key={t} className="w-[4.5rem] text-[10px] leading-tight">
                <div className="h-8 rounded-md ring-1 ring-border" style={{ background: `hsl(var(--${t}))` }} />
                <div className="mt-1 text-muted-foreground">{t}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3 pb-1">
            <button className="btn-3d btn-primary">Add task</button>
            <button className="btn-3d btn-primary is-pressed">Pressed</button>
            <button className="btn-3d btn-primary" disabled>Disabled</button>
            <button className="btn-3d btn-primary" aria-busy="true"><Loader2 className="h-4 w-4 animate-spin" /> Saving</button>
          </div>
          <div className="flex flex-wrap items-center gap-3 pb-1">
            <button className="btn-3d btn-secondary">Cancel</button>
            <button className="btn-3d btn-secondary is-pressed">Pressed</button>
            <button className="btn-3d btn-secondary" disabled>Disabled</button>
            <button className="btn-3d btn-primary btn-sm">Invite</button>
            <button className="btn-3d btn-secondary btn-sm">Save</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">Tertiary</button>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <button className="btn-3d btn-primary h-14 w-14 !rounded-full !p-0" aria-label="Add task"><Plus className="h-6 w-6" /></button>
          </div>
        </Section>

        <Section title="Selectable options">
          <div className="grid grid-cols-3 gap-2 pb-0.5">
            {["Light", "Dark", "System"].map((label, i) => (
              <button key={label} className="option-3d justify-center text-sm" aria-pressed={picked === i} onClick={() => setPicked(i)}>
                {label}
                {picked === i && <Check className="h-3.5 w-3.5" aria-hidden />}
              </button>
            ))}
          </div>
          <button className="option-3d is-pressed w-full text-sm">Pressed option</button>
        </Section>

        <Section title="Task rows">
          <div className="rounded-lg bg-card p-1 ring-1 ring-divider">
            {[
              { title: "Review homepage hero", box: <Box />, meta: <span className="text-xs text-star">Today</span> },
              { title: "Hover", box: <Box hover />, meta: <span className="text-xs text-upcoming">Thu</span> },
              { title: "Pay invoice", box: <Box />, meta: <span className="inline-flex items-center gap-1 text-xs text-due-soon"><Flag className="h-3 w-3" />Due tomorrow</span> },
              { title: "Renew passport", box: <Box />, meta: <span className="inline-flex items-center gap-1 rounded-md bg-today-soft px-1.5 py-0.5 text-xs text-today"><Flag className="h-3 w-3" />2 days overdue</span> },
              { title: "Book flights", box: <Box checked />, meta: null, done: true },
            ].map((row) => (
              <div key={row.title} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary">
                {row.box}
                <span className={cn("min-w-0 flex-1 truncate text-[15px] font-medium", row.done && "text-muted-foreground line-through")}>{row.title}</span>
                {row.meta}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Status">
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-1 text-primary-strong"><CheckCircle2 className="h-3.5 w-3.5" />Completed</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-star-soft px-2 py-1 text-star"><Star className="h-3.5 w-3.5" />Today</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-upcoming"><CalendarClock className="h-3.5 w-3.5" />Upcoming</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-due-soon"><Flag className="h-3.5 w-3.5" />Due soon</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-today-soft px-2 py-1 text-today"><TriangleAlert className="h-3.5 w-3.5" />Overdue</span>
          </div>
        </Section>

        <Section title="Navigation">
          <div className="w-56 space-y-0.5 rounded-xl bg-sidebar p-2">
            <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"><Inbox className="h-[18px] w-[18px] text-icon" />Inbox<span className="ml-auto text-xs tabular-nums text-muted-foreground">3</span></div>
            <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-medium text-sidebar-accent-foreground"><Star className="h-[18px] w-[18px] text-star" />Today<span className="ml-auto text-xs tabular-nums">6</span></div>
            <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"><Layers className="h-[18px] w-[18px] text-icon" />Anytime</div>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted-foreground" htmlFor={`in-${dark}`}>Task name</label>
            <input id={`in-${dark}`} placeholder="What do you want to do?" className="w-full rounded-md bg-card px-3 py-2 text-sm outline-none ring-1 ring-input focus:ring-2 focus:ring-ring" />
            <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm ring-1 ring-input">
              <Search className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground">Find</span>
              <kbd className="ml-auto rounded bg-secondary px-1.5 text-[10px] text-muted-foreground">⌘K</kbd>
            </div>
            <input disabled value="Disabled" readOnly className="w-full rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground ring-1 ring-input" />
            <p className="text-xs text-today" role="alert">Error text explains what to fix.</p>
          </div>
        </Section>
      </div>
    </div>
  );
}

export default function DesignShowcase() {
  // The columns set their own theme; the page itself stays light underneath.
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);
  return (
    <div className="h-full overflow-y-auto bg-secondary p-4 sm:p-8">
      <h1 className="mb-6 text-[28px] font-bold leading-[1.2] text-foreground">Zings design system</h1>
      <div className="flex flex-col gap-6 lg:flex-row">
        <Column />
        <Column dark />
      </div>
    </div>
  );
}
