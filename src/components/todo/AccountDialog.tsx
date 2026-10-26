import { isDemo, resetDemo } from '@/lib/demo';
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronRight,
  Copy,
  Database,
  Download,
  Loader2,
  LockKeyhole,
  LockOpen,
  LogOut,
  TriangleAlert,
  Upload,
  UserRound,
} from "@/lib/icons";
import { toast } from "@/lib/toast";
import { pb } from "@/lib/db";
import { buildFeedUrl } from "@/lib/calendarFeed";
import { Area, Heading, Project, Todo } from "@/types/todo";
import { BackupError, buildBackup, downloadBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { readThingsFile } from "@/lib/thingsImport";
import { localDateKey } from "@/lib/date";
import { DialogSection, DialogShell } from "@/components/todo/DialogShell";
import { IntegrationsSection } from "@/components/todo/IntegrationsSection";
import { PlanSection } from "@/components/todo/PlanSection";

interface Props {
  open: boolean;
  onClose: () => void;
  encryptionEnabled: boolean;
  encryptionUnlocked: boolean;
  onOpenEncryption: () => void;
  todos: Todo[];
  projects: Project[];
  areas: Area[];
  headings: Heading[];
}

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; events: number }
  | { kind: "error"; detail: string };

/**
 * Everything tied to *your* account rather than to how Zings looks or behaves:
 * who you're signed in as, the keys that unlock your notes, your data going in
 * and out, and the private feed other calendars read.
 */
export default function AccountDialog({
  open,
  onClose,
  encryptionEnabled,
  encryptionUnlocked,
  onOpenEncryption,
  todos,
  projects,
  areas,
  headings,
}: Props) {
  const [section, setSection] = useState("overview");
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState("");
  const [check, setCheck] = useState<CheckState>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  const thingsRef = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    const backup = buildBackup({
      areas,
      projects,
      headings,
      todos,
      exportedAt: new Date().toISOString(),
    });
    downloadBackup(backup, `zings-${localDateKey()}.json`);
    toast.success(`Exported ${backup.todos.length} to-dos`);
  };

  const importFile = async (file: File, from: "zings" | "things" = "zings") => {
    setImporting(true);
    try {
      const parsed = from === "things" ? await readThingsFile(file) : parseBackup(await file.text());
      const result = await restoreBackup(parsed);
      toast.success(
        `Imported ${result.todos} to-dos, ${result.projects} projects and ${result.areas} areas`,
      );
    } catch (err) {
      toast.error(
        err instanceof BackupError || err instanceof Error ? err.message : "Import failed",
      );
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
      if (thingsRef.current) thingsRef.current.value = "";
    }
  };

  const accountEmail: string = pb.authStore.record?.email ?? "";
  const httpUrl = buildFeedUrl();
  const webcalUrl = buildFeedUrl({ scheme: "webcal" });
  const downloadUrl = buildFeedUrl({ download: true });

  const runCheck = useCallback(async () => {
    setCheck({ kind: "checking" });
    try {
      const res = await fetch(buildFeedUrl(), { method: "GET" });
      if (!res.ok) {
        const detail = res.status === 401
          ? "Calendar feed authorization failed."
          : `Calendar feed is unavailable (HTTP ${res.status}).`;
        setCheck({ kind: "error", detail });
        return;
      }
      const text = await res.text();
      const events = (text.match(/BEGIN:VEVENT/g) || []).length;
      setCheck({ kind: "ok", events });
    } catch {
      setCheck({ kind: "error", detail: "Couldn't reach the calendar feed." });
    }
  }, []);

  // Auto-check whenever the panel opens.
  useEffect(() => {
    if (open && section === "connections" && !isDemo) void runCheck();
    if (!open) setCheck({ kind: "idle" });
  }, [open, section, runCheck]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  };

  const navigation = <nav className="account-navigation" aria-label="Account sections">
    {([{id: 'overview', label: 'Overview', Icon: UserRound}, {id: 'privacy', label: 'Privacy', Icon: LockKeyhole}, {id: 'data', label: 'Your data', Icon: Database}, {id: 'connections', label: 'Connections', Icon: CalendarClock}]).map(({id, label, Icon}) =>
      <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}><Icon className="h-4 w-4 shrink-0" />{label}</button>
    )}
  </nav>;

  if (isDemo) return <DialogShell open={open} onClose={onClose} title="Your workspace" icon={<UserRound className="h-5 w-5" />} subtitle="A space to try Zings, no account needed." navigation={navigation}>
    {section === 'overview' && <DialogSection icon={<UserRound className="h-4 w-4 text-primary" />} title="Make yourself at home" description="These are fictional tasks. Add your own and explore; changes stay in this browser.">
      <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-background p-4"><strong className="block text-2xl">{todos.length}</strong><span className="text-xs text-muted-foreground">To-dos</span></div><div className="rounded-xl bg-background p-4"><strong className="block text-2xl">{projects.length}</strong><span className="text-xs text-muted-foreground">Projects</span></div></div>
      <a className="btn-3d btn-primary mt-4 min-h-11 w-full" href="https://github.com/greeenos/zings#install" target="_blank" rel="noreferrer">Create your own workspace</a>
    </DialogSection>}
    {section === 'privacy' && <DialogSection icon={<LockKeyhole className="h-4 w-4 text-primary" />} title="Only in this browser" description="The demo stores tasks on this device. Clearing your browser data removes them. Your own Zings workspace also supports passphrase-protected notes." />}
    {section === 'data' && <><DialogSection icon={<Download className="h-4 w-4 text-primary" />} title="Keep a copy" description="Download the tasks and projects you created here as a JSON backup."><button className="btn-3d btn-primary mt-4 min-h-11 w-full" onClick={exportAll}><Download className="h-4 w-4" />Export workspace</button></DialogSection>
    <DialogSection icon={<Database className="h-4 w-4 text-muted-foreground" />} title="Start fresh" description="Reset removes your demo changes and brings back the example workspace."><button className="btn-3d btn-secondary mt-4 min-h-11 w-full" onClick={resetDemo}>Reset demo</button></DialogSection></>}
    {section === 'connections' && <DialogSection icon={<CalendarClock className="h-4 w-4 text-primary" />} title="Connect your workspace" description="Calendar subscriptions, sharing and integrations are available when you run your own Zings workspace. The public demo stays local to your browser."><a className="btn-3d btn-secondary mt-4 min-h-11 w-full" href="https://github.com/greeenos/zings#install" target="_blank" rel="noreferrer">Set up Zings</a></DialogSection>}
  </DialogShell>;

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Account"
      navigation={navigation}
      subtitle="You, your data and where it syncs."
      icon={<UserRound className="h-[18px] w-[18px]" />}
    >
      {section === "overview" && <>
      {/* --- Signed in as --- */}
      <DialogSection icon={<UserRound className="h-4 w-4 text-primary" />} title="Signed in">
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-background/70 p-3 ring-1 ring-border">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {(accountEmail[0] ?? "Z").toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{accountEmail || "Signed in"}</span>
            <span className="block text-xs text-muted-foreground">Your Zings workspace</span>
          </span>
          <button
            // App's authStore listener swaps in the sign-in screen.
            onClick={() => pb.authStore.clear()}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </DialogSection>
      <PlanSection />
      </>}

      {section === "privacy" && <>
      {/* --- Privacy --- */}
      <DialogSection
        icon={<LockKeyhole className="h-4 w-4 text-primary-strong" />}
        title="Privacy"
        description="Encrypted notes unlock on any of your devices with your passphrase."
      >
        <button
          type="button"
          onClick={onOpenEncryption}
          className="mt-3 flex w-full items-center gap-3 rounded-xl bg-background/70 px-3 py-3 text-left ring-1 ring-border transition-colors hover:bg-background"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/10">
            {encryptionEnabled && encryptionUnlocked ? (
              <LockOpen className="h-4 w-4 text-primary-strong" />
            ) : (
              <LockKeyhole className="h-4 w-4 text-muted-foreground" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Note encryption</span>
            <span className="block text-xs text-muted-foreground">
              {encryptionEnabled ? (encryptionUnlocked ? "Unlocked on this device" : "Locked") : "Not enabled"}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogSection>

      </>}
      {section === "data" && <>
      {/* --- Data --- */}
      <DialogSection
        icon={<Database className="h-4 w-4 text-indigo-500" />}
        title="Data"
        description="One JSON file with every area, project, section and to-do. Importing merges by id, so re-importing the same file changes nothing."
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={exportAll}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-background/70 px-3 py-2 text-xs font-medium ring-1 ring-border transition-colors hover:bg-background"
          >
            <Download className="h-3.5 w-3.5" />
            Export everything
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-background/70 px-3 py-2 text-xs font-medium ring-1 ring-border transition-colors hover:bg-background disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Import a backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
        </div>

        <div className="mt-3 rounded-xl bg-background/70 p-3 ring-1 ring-border">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium">Moving from Things 3?</p>
              <p className="text-xs text-muted-foreground">
                Quit Things, then pick its <code>main.sqlite</code>. Importing again only updates.
              </p>
            </div>
            <button
              onClick={() => thingsRef.current?.click()}
              disabled={importing}
              className="btn-3d btn-primary min-h-11 shrink-0"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import from Things
            </button>
          </div>
          <details className="mt-2 text-[11px] leading-snug text-muted-foreground">
            <summary className="cursor-pointer">Where is that file?</summary>
            In Finder press ⌘⇧G and go to{" "}
            <code className="break-all">~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/</code>,
            open <code>ThingsData-…</code>, right-click <code>Things Database.thingsdatabase</code> → Show Package
            Contents, and pick <code>main.sqlite</code>. Repeating templates and finished projects aren't carried over.
          </details>
          <input
            ref={thingsRef}
            type="file"
            accept=".sqlite,.db,application/vnd.sqlite3,application/x-sqlite3"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file, "things");
            }}
          />
        </div>

        {encryptionEnabled && (
          <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">
            Encrypted notes are exported as ciphertext — the export is useless without your
            passphrase, and importing it back keeps them readable.
          </p>
        )}
      </DialogSection>

      </>}
      {section === "connections" && <>
      {/* --- Calendar feed --- */}
      <DialogSection
        icon={<CalendarClock className="h-4 w-4 text-blue-500" />}
        title="Calendar feed"
        description="Your private link to your plan (scheduled to-dos) and completed timed tasks. Subscribe to it from Google, Apple or Outlook. Anyone with the URL can read it."
      >
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-background/70 px-3 py-2.5 ring-1 ring-border">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            {check.kind === "checking" && (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                <span className="truncate text-muted-foreground">Checking connection…</span>
              </>
            )}
            {check.kind === "ok" && (
              <>
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success">
                  <Check className="h-3 w-3 text-white" />
                </span>
                <span className="truncate font-medium text-emerald-600 dark:text-emerald-400">
                  Connected · {check.events} {check.events === 1 ? "event" : "events"}
                </span>
              </>
            )}
            {check.kind === "error" && (
              <>
                <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />
                <span className="truncate text-destructive">{check.detail}</span>
              </>
            )}
            {check.kind === "idle" && <span className="text-muted-foreground">Not checked yet</span>}
          </div>
          <button
            onClick={() => void runCheck()}
            disabled={check.kind === "checking"}
            className="min-h-11 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            Re-check
          </button>
        </div>

        <label className="mt-4 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Feed URL
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            readOnly
            aria-label="Calendar feed URL"
            value={httpUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-background/70 px-3 py-2 font-mono text-xs outline-none ring-1 ring-border focus:ring-primary"
          />
          <button
            onClick={() => void copy(httpUrl, "Feed URL")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground ring-1 ring-border transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Copy feed URL"
          >
            {copied === "Feed URL" ? <Check className="h-4 w-4 text-primary-strong" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={webcalUrl}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-primary ring-1 ring-primary/25 hover:bg-primary/10"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Open subscription
          </a>
          <a
            href={downloadUrl}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border hover:bg-secondary hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Download .ics
          </a>
        </div>
      </DialogSection>

      <IntegrationsSection />
      </>}
    </DialogShell>
  );
}
