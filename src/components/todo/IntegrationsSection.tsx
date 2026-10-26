import { useEffect, useState } from "react";
import { CalendarDays, Check, Code, Copy, Mail, Sparkles, X } from "@/lib/icons";
import { pb } from "@/lib/db";
import { toast } from "@/lib/toast";
import { DialogSection } from "@/components/todo/DialogShell";

interface Calendar {
  url: string;
  name?: string;
}

const inputClass =
  "min-h-11 min-w-0 flex-1 rounded-lg bg-background/70 px-3 py-2 text-xs outline-none ring-1 ring-border focus:ring-primary";
const buttonClass = "btn-3d btn-secondary min-h-11 shrink-0";
const labelClass = "mt-3 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <label className={labelClass}>{label}</label>
      <div className="mt-1.5 flex items-center gap-2">
        <input aria-label={label} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} font-mono`} />
        <button
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }).catch(() => toast.error("Couldn’t copy. Select and copy the text manually."));
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground ring-1 ring-border hover:bg-secondary hover:text-foreground"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-4 w-4 text-primary-strong" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </>
  );
}

/** Calendars in, AI key, REST API, webhook and email-to-task — the account's connections. */
export function IntegrationsSection() {
  const [user, setUser] = useState(pb.authStore.record);
  const [calendarUrl, setCalendarUrl] = useState("");
  const [webhook, setWebhook] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [provider, setProvider] = useState<"anthropic" | "openrouter">("anthropic");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);

  // The cached auth record can be stale (tokens added by a migration, edits on another device).
  useEffect(() => {
    void pb.collection("users").authRefresh().then((res) => {
      setUser(res.record);
      setWebhook(res.record.webhookUrl ?? "");
    }).catch(() => {});
  }, []);

  if (!user) return null;
  const origin = new URL(pb.buildURL("/"), window.location.href).origin;
  const calendars: Calendar[] = Array.isArray(user.calendars) ? user.calendars : [];

  const save = async (patch: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      setUser(await pb.collection("users").update(user.id, patch));
      toast.success(done);
      return true;
    } catch {
      toast.error("Couldn't save — check the URL");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addCalendar = async () => {
    const url = calendarUrl.trim();
    if (!/^(https?|webcal):\/\//i.test(url)) {
      toast.error("Paste the calendar's .ics link (https:// or webcal://)");
      return;
    }
    const name = url.includes("google.com") ? "Google" : url.includes("icloud.com") ? "iCloud" : "Calendar";
    if (await save({ calendars: [...calendars, { url, name }] }, "Calendar added")) setCalendarUrl("");
    window.dispatchEvent(new Event("zings:calendars"));
  };

  const saveKey = async (key: string) => {
    setBusy(true);
    try {
      const res = await pb.send<{ aiKeyHint: string; aiProvider: string; aiModel: string }>("/api/ai/key", {
        method: "POST",
        body: { key, provider, model },
      });
      setUser({ ...user, ...res });
      pb.authStore.save(pb.authStore.token, { ...pb.authStore.record!, ...res });
      setAiKey("");
      toast.success(key ? "AI key saved" : "AI key removed");
    } catch {
      toast.error("Couldn't save the key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogSection
        icon={<CalendarDays className="h-4 w-4 text-primary" />}
        title="Your calendars"
        description="Events from Google, iCloud or Outlook show beside your to-dos in Today and the Calendar. Paste the private .ics address from your calendar's settings."
      >
        <ul className="mt-3 space-y-1">
          {calendars.map((cal) => (
            <li key={cal.url} className="flex items-center gap-2 rounded-lg bg-background/70 px-3 py-2 text-xs ring-1 ring-border">
              <span className="font-medium">{cal.name ?? "Calendar"}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{cal.url}</span>
              <button
                onClick={() => void save({ calendars: calendars.filter((c) => c.url !== cal.url) }, "Calendar removed")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label={`Remove ${cal.name ?? "calendar"}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void addCalendar(); }}>
          <input aria-label="Calendar subscription URL" value={calendarUrl} onChange={(e) => setCalendarUrl(e.target.value)} placeholder="https://…/basic.ics" className={inputClass} />
          <button type="submit" disabled={busy || !calendarUrl.trim()} className={buttonClass}>Add</button>
        </form>
      </DialogSection>

      <DialogSection
        icon={<Sparkles className="h-4 w-4 text-primary" />}
        title="AI"
        description="Break a to-do into steps and turn a ramble or a pasted email into to-dos. Uses your own Anthropic or OpenRouter API key; it is stored on this server and never sent back to the browser."
      >
        {user.aiKeyHint ? (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="flex-1">
              {user.aiProvider === "openrouter" ? `OpenRouter · ${user.aiModel || "openrouter/auto"}` : "Anthropic"} key{" "}
              <span className="font-mono text-muted-foreground">{user.aiKeyHint}</span>
            </span>
            <button onClick={() => void saveKey("")} disabled={busy} className={buttonClass}>Remove</button>
          </div>
        ) : (
          <form className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void saveKey(aiKey.trim()); }}>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as "anthropic" | "openrouter")}
              className="min-h-11 rounded-lg bg-background/70 px-3 py-2 text-sm outline-none ring-1 ring-border"
              aria-label="AI provider"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openrouter">OpenRouter</option>
            </select>
            {provider === "openrouter" && (
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="openrouter/auto"
                aria-label="OpenRouter model"
                className={`${inputClass} font-mono`}
              />
            )}
            <input
              type="password"
              aria-label="AI API key"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              placeholder={provider === "openrouter" ? "sk-or-…" : "sk-ant-…"}
              autoComplete="off"
              className={`${inputClass} font-mono`}
            />
            <button type="submit" disabled={busy || !aiKey.trim()} className={buttonClass}>Save</button>
          </form>
        )}
      </DialogSection>

      <DialogSection
        icon={<Mail className="h-4 w-4 text-primary" />}
        title="Email to Zings"
        description="Point an email forwarder (Cloudflare Email Routing, Mailgun) at this address: each email lands in your Inbox, the subject read like a quick-add title."
      >
        <CopyField label="Inbound endpoint" value={`${origin}/api/inbound/email/${user.mailToken ?? ""}`} />
      </DialogSection>

      <DialogSection
        icon={<Code className="h-4 w-4 text-primary" />}
        title="API & webhooks"
        description="Add to-dos from Shortcuts, Zapier or a script. Titles understand the same phrases as quick add."
      >
        <CopyField label="API token" value={user.apiToken ?? ""} />
        <CopyField
          label="Example"
          value={`curl -X POST ${origin}/api/v1/todos -H "Authorization: Bearer ${user.apiToken ?? ""}" -H "content-type: application/json" -d '{"title":"Call mom tomorrow at 5pm"}'`}
        />
        <label className={labelClass}>Webhook (to-do created / completed)</label>
        <form className="mt-1.5 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void save({ webhookUrl: webhook.trim() }, webhook.trim() ? "Webhook saved" : "Webhook removed"); }}>
          <input aria-label="Webhook URL" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://hooks.zapier.com/…" className={inputClass} />
          <button type="submit" disabled={busy} className={buttonClass}>Save</button>
        </form>
      </DialogSection>
    </>
  );
}
