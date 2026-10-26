import { isDemo } from '@/lib/demo';
import { motion } from "@/lib/motion";
import { Bell, Check, ChevronRight, Keyboard, Moon, Settings as SettingsIcon, Sun, UserRound } from "@/lib/icons";
import { toast } from "@/lib/toast";
import { useTheme, ThemeMode } from "@/hooks/useTheme";
import { SunHorizon } from "@/components/todo/icons/SunHorizon";
import { cn } from "@/lib/utils";
import { DialogSection, DialogShell } from "@/components/todo/DialogShell";
import type { ReminderPermission } from "@/hooks/useReminders";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenShortcuts: () => void;
  onOpenAccount: () => void;
  reminders: {
    enabled: boolean;
    permission: ReminderPermission;
    setEnabled: (next: boolean) => Promise<boolean>;
  };
}

const THEME_MODES: { id: ThemeMode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "auto", label: "System", Icon: SunHorizon },
];

/**
 * How Zings looks and behaves. Anything about *you* — the session, your keys,
 * your data, your feed — lives one button over, in the Account panel.
 */
export default function SettingsDialog({
  open,
  onClose,
  onOpenShortcuts,
  onOpenAccount,
  reminders,
}: Props) {
  const { mode, setMode } = useTheme();

  const toggleReminders = async () => {
    const next = !reminders.enabled;
    const ok = await reminders.setEnabled(next);
    if (next && !ok) {
      toast.error(
        reminders.permission === "denied"
          ? "Notifications are blocked for this site — allow them in your browser settings."
          : "This browser can't show notifications.",
      );
    }
  };


  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Settings"
      subtitle="Make Zings work the way you do."
      icon={<SettingsIcon className="h-[18px] w-[18px]" />}
    >
      {/* --- Appearance section --- */}
      <DialogSection
        icon={<SunHorizon className="h-4 w-4 text-amber-500" />}
        title="Appearance"
        description="Light, dark, or follow your system."
      >
        <div className="mt-3 grid grid-cols-3 gap-2 pb-0.5" role="group" aria-label="Theme">
          {THEME_MODES.map(({ id, label, Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                onClick={(e) => setMode(id, { x: e.clientX, y: e.clientY })}
                aria-pressed={active}
                className={cn("theme-choice min-w-0 rounded-xl border-2 p-2 text-sm transition-colors", active ? "border-primary bg-primary/5" : "border-transparent bg-background/70 hover:border-border")}
              >
                <span aria-hidden className={`theme-preview theme-preview-${id}`}><span className="theme-preview-sidebar" /><span className="theme-preview-content"><i /><i /><i /></span></span>
                <span className="mt-2 flex min-h-9 items-center justify-center gap-1.5"><Icon className="h-4 w-4" /><span>{label}</span><Check className={cn("h-3.5 w-3.5 shrink-0", !active && "invisible")} aria-hidden /></span>
              </button>
            );
          })}
        </div>
      </DialogSection>

      {/* --- Reminders section --- */}
      <DialogSection
        icon={<Bell className="h-4 w-4 text-rose-500" />}
        title="Reminders"
        description={isDemo ? "Explore reminders in your own workspace. Notifications are off in the public demo." : "Get notified when a timed task is due. Enable reminders on each device you use."}
      >
        <button
          type="button"
          onClick={() => void toggleReminders()}
          role="switch"
          aria-checked={reminders.enabled}
          aria-label="Time reminders"
          disabled={isDemo || reminders.permission === "unsupported"}
          className="mt-3 flex w-full items-center gap-3 rounded-xl bg-background/70 px-3 py-3 text-left ring-1 ring-border transition-colors hover:bg-background disabled:opacity-60"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10">
            <Bell
              className={cn(
                "h-4 w-4",
                reminders.enabled ? "text-rose-500" : "text-muted-foreground",
              )}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Time reminders</span>
            <span className="block text-xs text-muted-foreground">
              {isDemo ? "Available in your own workspace" : reminders.permission === "unsupported"
                ? "Not supported by this browser"
                : reminders.permission === "denied"
                  ? "Blocked in browser settings"
                  : reminders.enabled
                    ? "On"
                    : "Off"}
            </span>
          </span>
          <span
            className={cn(
              "relative h-6 w-10 shrink-0 rounded-full transition-colors",
              reminders.enabled ? "bg-primary" : "bg-muted-foreground/25",
            )}
          >
            <motion.span
              layout
              transition={{ type: "spring", damping: 26, stiffness: 400 }}
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-card",
                reminders.enabled ? "left-[1.125rem]" : "left-0.5",
              )}
            />
          </span>
        </button>
        {!window.isSecureContext && (
          <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">
            Open Zings over HTTPS to use reminders, app installation and note encryption.
          </p>
        )}
      </DialogSection>

      {/* --- Other section --- */}
      <DialogSection
        icon={<SettingsIcon className="h-4 w-4 text-muted-foreground" />}
        title="Your workspace"
        description="Quick access to your account and keyboard controls."
      >
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="mt-3 flex w-full items-center gap-3 rounded-xl bg-background/70 px-3 py-3 text-left ring-1 ring-border transition-colors hover:bg-background"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Keyboard className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Keyboard shortcuts</span>
            <span className="block text-xs text-muted-foreground">Move faster around Zings</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        <button
          type="button"
          onClick={onOpenAccount}
          className="mt-2 flex w-full items-center gap-3 rounded-xl bg-background/70 px-3 py-3 text-left ring-1 ring-border transition-colors hover:bg-background"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Account</span>
            <span className="block text-xs text-muted-foreground">
              Sign-in, encryption, backups and the calendar feed
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogSection>
    </DialogShell>
  );
}
