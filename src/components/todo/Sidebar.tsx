import { useState } from "react";
import {
  Inbox,
  Star,
  CalendarClock,
  CalendarDays,
  Layers,
  Hourglass,
  CheckCircle2,
  Plus,
  Folder,
  FolderOpen,
  X,
  Download,
  Trash2,
  Tag as TagIcon,
  Check,
  Group,
} from "@/lib/icons";
import { motion, AnimatePresence, LayoutGroup } from "@/lib/motion";
import { Area, Project, TodoList, View } from "@/types/todo";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PROJECT_PALETTE } from "@/hooks/useProjects";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { ProgressRing } from "@/components/todo/ProgressRing";
import { BrandMark } from "@/components/BrandMark";

interface BuiltInItem {
  id: TodoList;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const builtIns: BuiltInItem[] = [
  { id: "inbox", label: "Inbox", icon: Inbox, color: "text-icon" },
  { id: "today", label: "Today", icon: Star, color: "text-star" },
  { id: "upcoming", label: "Upcoming", icon: CalendarClock, color: "text-upcoming" },
  { id: "anytime", label: "Anytime", icon: Layers, color: "text-icon" },
  { id: "someday", label: "Someday", icon: Hourglass, color: "text-icon" },
  { id: "logbook", label: "Logbook", icon: CheckCircle2, color: "text-primary-strong" },
];

export interface ProjectProgress {
  done: number;
  total: number;
}

interface Props {
  view: View;
  onChange: (view: View) => void;
  counts: Record<TodoList, number>;
  projects: Project[];
  projectCounts: Record<string, number>;
  projectProgress: Record<string, ProjectProgress>;
  areas: Area[];
  tags: Array<{ name: string; count: number }>;
  trashCount: number;
  onAddProject: (name: string, areaId?: string | null) => Promise<Project | null>;
  onDeleteProject: (id: string) => void;
  onRecolorProject: (id: string, color: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onSetProjectSequential: (id: string, sequential: boolean) => void;
  onShareProject: (project: Project) => void;
  onSetProjectArea: (id: string, areaId: string | null) => void;
  onAddArea: (name: string) => Promise<Area | null>;
  onDeleteArea: (id: string) => void;
  onRenameArea: (id: string, name: string) => void;
}

/** One row of the nav, with the shared sliding active pill. */
function NavRow({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200",
        active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/60",
        className,
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-lg bg-sidebar-accent"
          transition={{ type: "spring", damping: 30, stiffness: 350 }}
        />
      )}
      {children}
    </button>
  );
}

export function Sidebar({
  view,
  onChange,
  counts,
  projects,
  projectCounts,
  projectProgress,
  areas,
  tags,
  trashCount,
  onAddProject,
  onDeleteProject,
  onRecolorProject,
  onRenameProject,
  onSetProjectSequential,
  onShareProject,
  onSetProjectArea,
  onAddArea,
  onDeleteArea,
  onRenameArea,
}: Props) {
  const [adding, setAdding] = useState<null | { kind: "project" | "area"; areaId?: string | null }>(null);
  const [draftName, setDraftName] = useState("");
  const [renaming, setRenaming] = useState<null | { kind: "project" | "area"; id: string }>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [showTags, setShowTags] = useState(false);
  const { canInstall, promptInstall, installHint } = usePwaInstall();
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return localStorage.getItem("zings-install-hint-dismissed") === "1";
    } catch {
      return false;
    }
  });
  const dismissHint = () => {
    setHintDismissed(true);
    try {
      localStorage.setItem("zings-install-hint-dismissed", "1");
    } catch {
      /* ignore */
    }
  };

  const submitNew = async () => {
    const name = draftName.trim();
    const target = adding;
    setDraftName("");
    setAdding(null);
    if (!name || !target) return;
    if (target.kind === "area") {
      const created = await onAddArea(name);
      if (created) onChange({ kind: "area", id: created.id });
    } else {
      const created = await onAddProject(name, target.areaId ?? null);
      if (created) onChange({ kind: "project", id: created.id });
    }
  };

  const submitRename = () => {
    const name = renameDraft.trim();
    const target = renaming;
    setRenameDraft("");
    setRenaming(null);
    if (!name || !target) return;
    if (target.kind === "area") onRenameArea(target.id, name);
    else onRenameProject(target.id, name);
  };

  // A shared project's area belongs to its owner; members see it ungrouped.
  const areaIds = new Set(areas.map((a) => a.id));
  const ungrouped = projects.filter((p) => !p.areaId || !areaIds.has(p.areaId));

  const renderProject = (p: Project) => {
    const isActive = view.kind === "project" && view.id === p.id;
    const count = projectCounts[p.id] || 0;
    const progress = projectProgress[p.id];
    const ratio = progress && progress.total > 0 ? progress.done / progress.total : 0;

    if (renaming?.kind === "project" && renaming.id === p.id) {
      return (
        <div key={p.id} className="px-3 py-1">
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") {
                setRenameDraft("");
                setRenaming(null);
              }
            }}
            onBlur={submitRename}
            className="w-full rounded-md bg-sidebar-accent/40 px-2 py-1.5 text-sm outline-none ring-1 ring-border focus:ring-primary"
          />
        </div>
      );
    }

    return (
      <motion.div
        key={p.id}
        layout
        initial={{ opacity: 0, height: 0, y: -4 }}
        animate={{ opacity: 1, height: "auto", y: 0 }}
        exit={{ opacity: 0, height: 0, y: -4 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "group relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200",
          isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/60",
        )}
      >
        {isActive && (
          <motion.span
            layoutId="sidebar-active-pill"
            className="absolute inset-0 rounded-lg bg-sidebar-accent"
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
          />
        )}
        <Popover>
          <PopoverTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-transform duration-150 hover:scale-125 hover:bg-foreground/10"
              aria-label={`Change color for ${p.name}`}
              title={
                progress && progress.total > 0
                  ? `${progress.done} of ${progress.total} done`
                  : "No to-dos yet"
              }
            >
              {p.color ? (
                <ProgressRing value={ratio} size={14} color={p.color} />
              ) : (
                <Folder className="h-[18px] w-[18px] text-muted-foreground" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <div className="grid grid-cols-4 gap-1.5">
              {PROJECT_PALETTE.map((swatch) => {
                const selected = p.color === swatch;
                return (
                  <button
                    key={swatch}
                    onClick={() => onRecolorProject(p.id, swatch)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md transition-transform hover:scale-110 active:scale-95",
                      selected && "ring-2 ring-foreground/40 ring-offset-2 ring-offset-popover",
                    )}
                    aria-label={`Set color ${swatch}`}
                  >
                    <span className="h-4 w-4 rounded-full" style={{ backgroundColor: swatch }} />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <button
                onClick={() => {
                  setRenameDraft(p.name);
                  setRenaming({ kind: "project", id: p.id });
                }}
                className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary"
              >
                Rename…
              </button>
              <button
                onClick={() => onSetProjectSequential(p.id, !p.sequential)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary"
                title="Only the next open to-do shows in Today and Anytime"
              >
                One at a time
                {p.sequential && <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => onShareProject(p)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary"
              >
                Share…
                {!!p.members?.length && <span className="tabular-nums text-muted-foreground">{p.members.length + 1}</span>}
              </button>

              {areas.length > 0 && (
                <>
                  <div className="mt-1 px-2 pb-1 pt-1.5 text-[13px] font-semibold text-muted-foreground">
                    Area
                  </div>
                  <button
                    onClick={() => onSetProjectArea(p.id, null)}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary",
                      !p.areaId && "bg-secondary font-medium",
                    )}
                  >
                    None
                  </button>
                  {areas.map((area) => (
                    <button
                      key={area.id}
                      onClick={() => onSetProjectArea(p.id, area.id)}
                      className={cn(
                        "w-full truncate rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary",
                        p.areaId === area.id && "bg-secondary font-medium",
                      )}
                    >
                      {area.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <button
          onClick={() => onChange({ kind: "project", id: p.id })}
          onDoubleClick={() => {
            setRenameDraft(p.name);
            setRenaming({ kind: "project", id: p.id });
          }}
          className="relative z-10 flex min-w-0 flex-1 items-center text-left"
        >
          <span className="flex-1 truncate">{p.name}</span>
          {!!p.members?.length && (
            <Group className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Shared" />
          )}
        </button>

        <span className="relative z-10 flex h-5 w-7 shrink-0 items-center justify-end">
          {count > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground transition-opacity group-hover:opacity-0 max-md:opacity-0">
              {count}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteProject(p.id);
            }}
            className="absolute inset-y-0 right-0 flex w-7 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
            aria-label={`Delete ${p.name}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </motion.div>
    );
  };

  return (
    <nav className="flex h-full min-h-0 flex-col gap-0.5 overflow-x-hidden overflow-y-auto overscroll-contain p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
      <div className="px-3 pb-4 pt-3 sm:pb-5 sm:pt-4">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-8 w-8" />
          <h1 className="brand-wordmark font-display text-[22px] font-semibold">Zings</h1>
        </div>
      </div>

      <LayoutGroup id="sidebar-nav">
        {builtIns.map((item, i) => {
          const Icon = item.icon;
          const isActive = view.kind === "list" && view.id === item.id;
          const count = counts[item.id] || 0;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * i, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col"
            >
              <NavRow active={isActive} onClick={() => onChange({ kind: "list", id: item.id })}>
                <Icon
                  className={cn(
                    "relative z-10 h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110",
                    item.color,
                  )}
                />
                <span className="relative z-10 flex-1 text-left">{item.label}</span>
                {count > 0 && (
                  <span className="relative z-10 text-xs tabular-nums text-muted-foreground">{count}</span>
                )}
              </NavRow>
            </motion.div>
          );
        })}

        {/* Schedule and Activity are two readings of the same month, so they
            share one row — the section itself switches between them. */}
        <NavRow
          active={view.kind === "calendar"}
          onClick={() =>
            onChange({ kind: "calendar", tab: view.kind === "calendar" ? view.tab : undefined })
          }
        >
          <CalendarDays className="relative z-10 h-[18px] w-[18px] shrink-0 text-primary transition-transform duration-200 group-hover:scale-110" />
          <span className="relative z-10 flex-1 text-left">Calendar</span>

        </NavRow>

        {/* Areas & projects */}
        <div className="mt-6 flex items-center justify-between px-3 pb-1">
          <span className="text-[13px] font-semibold text-muted-foreground">
            Projects
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                aria-label="New project or area"
              >
                <Plus className="h-3.5 w-3.5" />
              </motion.button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              <button
                onClick={() => setAdding({ kind: "project", areaId: null })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
              >
                <Folder className="h-4 w-4 text-muted-foreground" /> New Project
              </button>
              <button
                onClick={() => setAdding({ kind: "area" })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
              >
                <FolderOpen className="h-4 w-4 text-muted-foreground" /> New Area
              </button>
            </PopoverContent>
          </Popover>
        </div>

        <AnimatePresence initial={false}>{ungrouped.map(renderProject)}</AnimatePresence>

        {/* Each area, with its own projects nested under it */}
        {areas.map((area) => {
          const areaProjects = projects.filter((p) => p.areaId === area.id);
          const isActive = view.kind === "area" && view.id === area.id;
          return (
            <div key={area.id} className="mt-3 flex flex-col">
              {renaming?.kind === "area" && renaming.id === area.id ? (
                <div className="px-3 py-1">
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename();
                      if (e.key === "Escape") {
                        setRenameDraft("");
                        setRenaming(null);
                      }
                    }}
                    onBlur={submitRename}
                    className="w-full rounded-md bg-sidebar-accent/40 px-2 py-1.5 text-sm outline-none ring-1 ring-border focus:ring-primary"
                  />
                </div>
              ) : (
                <div className="group relative flex items-center gap-3 rounded-lg px-3 py-1.5">
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      className="absolute inset-0 rounded-lg bg-sidebar-accent"
                      transition={{ type: "spring", damping: 30, stiffness: 350 }}
                    />
                  )}
                  <button
                    onClick={() => onChange({ kind: "area", id: area.id })}
                    onDoubleClick={() => {
                      setRenameDraft(area.name);
                      setRenaming({ kind: "area", id: area.id });
                    }}
                    className="relative z-10 flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <FolderOpen className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
                    <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {area.name}
                    </span>
                  </button>
                  <div className="relative z-10 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                    <button
                      onClick={() => setAdding({ kind: "project", areaId: area.id })}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                      aria-label={`New project in ${area.name}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onDeleteArea(area.id)}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                      aria-label={`Delete ${area.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
              <AnimatePresence initial={false}>{areaProjects.map(renderProject)}</AnimatePresence>
            </div>
          );
        })}
      </LayoutGroup>

      {adding && (
        <div className="px-3 py-1">
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNew();
              if (e.key === "Escape") {
                setDraftName("");
                setAdding(null);
              }
            }}
            onBlur={submitNew}
            placeholder={adding.kind === "area" ? "Area name…" : "Project name…"}
            className="w-full rounded-md bg-sidebar-accent/40 px-2 py-1.5 text-sm outline-none ring-1 ring-border placeholder:text-muted-foreground focus:ring-primary"
          />
        </div>
      )}

      {!adding && projects.length === 0 && areas.length === 0 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.25 }}
          onClick={() => setAdding({ kind: "project", areaId: null })}
          className="mt-0.5 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="block font-medium">+ Your first project</span>
          <span className="mt-1 block leading-relaxed">A place for a trip, a renovation, or your next idea.</span>
        </motion.button>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-6 flex flex-col">
          <button
            onClick={() => setShowTags((v) => !v)}
            className="flex items-center justify-between px-3 pb-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>Tags</span>
            <span className="text-xs">{showTags ? "−" : "+"}</span>
          </button>
          {showTags && (
            <LayoutGroup id="sidebar-tags">
              {tags.map((tag) => (
                <NavRow
                  key={tag.name}
                  active={view.kind === "tag" && view.id === tag.name}
                  onClick={() => onChange({ kind: "tag", id: tag.name })}
                  className="py-1.5"
                >
                  <TagIcon className="relative z-10 h-[15px] w-[15px] shrink-0 text-muted-foreground" />
                  <span className="relative z-10 flex-1 truncate text-left">{tag.name}</span>
                  <span className="relative z-10 text-xs tabular-nums text-muted-foreground">
                    {tag.count}
                  </span>
                </NavRow>
              ))}
            </LayoutGroup>
          )}
        </div>
      )}

      {/* Trash sits at the very bottom, out of the daily path — but always
          there, so a deleted to-do is never somewhere you have to guess at. */}
      <div className="mt-auto flex flex-col gap-0.5 pt-4">
        <LayoutGroup id="sidebar-trash">
          <NavRow active={view.kind === "trash"} onClick={() => onChange({ kind: "trash" })}>
            <Trash2 className="relative z-10 h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform duration-200 group-hover:scale-110" />
            <span className="relative z-10 flex-1 text-left">Trash</span>
            {trashCount > 0 && (
              <span className="relative z-10 text-xs tabular-nums text-muted-foreground">
                {trashCount}
              </span>
            )}
          </NavRow>
        </LayoutGroup>

        {canInstall && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void promptInstall()}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Install Zings
          </motion.button>
        )}

        {installHint && !hintDismissed && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="flex items-start gap-2 rounded-lg bg-sidebar-accent/50 px-3 py-2.5 text-xs text-muted-foreground"
          >
            <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">Install Zings</p>
              <p className="mt-0.5 leading-snug">
                {installHint === "ios"
                  ? "Tap Share, then “Add to Home Screen”."
                  : "In Safari: File → Add to Dock."}
              </p>
            </div>
            <button
              type="button"
              onClick={dismissHint}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </div>
    </nav>
  );
}
