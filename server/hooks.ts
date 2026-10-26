/**
 * PocketBase hooks: the calendar feed, push reminders, shared projects and the
 * account limit. Bundled to pb_hooks/zings.js (CommonJS) and required from
 * pb_hooks/main.pb.js. Logic lives in ics.ts / push.ts; this file is
 * only I/O.
 */
import { localDateKey } from "@/lib/date";
import { fromRecord } from "@/lib/record";
import { formatTimeRange } from "@/lib/schedule";
import { parseScheduleTokens } from "@/lib/schedule";
import { eventsBetween, type CalendarEvent } from "./calendar";
import { extendPaidUntil, isPro, sortedJson, stripeSignatureValid } from "./billing";
import { buildCalendar, toIcsUtc, type ProjectRow as FeedProject, type TodoRow as FeedTodo } from "./ics";
import { makeVapidKeys, vapidAuthorization, type VapidKeys } from "./push";

// PocketBase JSVM globals (see pb_data/types.d.ts for the full surface).
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const $app: any;
declare const $security: any;
declare const $http: any;
declare const $os: any;
declare const Record: any;
declare const BadRequestError: any;
declare const $dbx: any;
declare function toString(value: unknown): string;
type Event = any;
type App = any;

const plain = <T>(record: unknown): T => fromRecord<T>(JSON.parse(JSON.stringify(record)));

/** The owner of a per-user token (feed and API: 32 chars, mail: 24), or null. */
function userByToken(field: "feedToken" | "apiToken" | "mailToken", token: string): App | null {
  if (!new RegExp(`^[a-z0-9]{${field === "mailToken" ? 24 : 32}}$`).test(token)) return null;
  try {
    return $app.findFirstRecordByFilter("users", `${field} = {:token}`, { token });
  } catch {
    return null;
  }
}

export function feed(e: Event) {
  const query = e.request.url.query();
  const user = userByToken("feedToken", query.get("token"));
  if (!user) return e.string(401, "Unauthorized");

  // Only timed tasks (with a real work window) by default; ?all=1 lists every completed one.
  const timedOnly = query.get("all") !== "1" ? " && lastedMs > 0" : "";
  const todos = $app
    .findRecordsByFilter("todos", `owner = {:owner} && completed = true${timedOnly}`, "-completedAt", 0, 0, {
      owner: user.id,
    })
    .map((r: unknown) => plain<FeedTodo>(r));
  // The plan: open, scheduled to-dos (leave them out with ?planned=0).
  if (query.get("planned") !== "0") {
    todos.push(...$app
      .findRecordsByFilter("todos", "owner = {:owner} && completed = false && deletedAt = '' && dueDate != ''", "dueDate", 0, 0, {
        owner: user.id,
      })
      .map((r: unknown) => plain<FeedTodo>(r)));
  }
  const projects = new Map<string, FeedProject>(
    $app.findRecordsByFilter("projects", "owner = {:owner}", "", 0, 0, { owner: user.id })
      .map((r: unknown) => plain<FeedProject>(r))
      .map((p: FeedProject) => [p.id, p]),
  );

  e.response.header().set("Cache-Control", "public, max-age=60");
  if (query.get("download") === "1") {
    e.response.header().set("Content-Disposition", 'attachment; filename="zings-logbook.ics"');
  }
  return e.blob(200, "text/calendar; charset=utf-8", buildCalendar(todos, projects, toIcsUtc(new Date())));
}

// --- Accounts ----------------------------------------------------------------

/** A family-sized instance: sign-up closes at ZINGS_MAX_USERS (default 5). */
export function limitUsers(e: Event) {
  const configured = Number($os.getenv("ZINGS_MAX_USERS"));
  // A hosted instance takes ZINGS_MAX_USERS as-is (unset = no cap); a home one stays family-sized.
  if ($os.getenv("ZINGS_HOSTED") === "1" && !(configured > 0)) return e.next();
  const max = Number.isInteger(configured) && configured > 0
    ? ($os.getenv("ZINGS_HOSTED") === "1" ? configured : Math.min(5, configured))
    : 5;
  e.app.runInTransaction((tx: App) => {
    if (tx.countRecords("users") >= max) {
      throw new BadRequestError(`This Zings already has ${max} accounts. Ask whoever runs it to make room.`);
    }
    const previous = e.app;
    e.app = tx;
    try { e.next(); } finally { e.app = previous; }
  });
}

// --- Push reminders ----------------------------------------------------------

function vapidKeys(): VapidKeys {
  const rows = $app.findRecordsByFilter("push_keys", "", "", 1, 0);
  if (rows.length) return { publicKey: rows[0].getString("publicKey"), privateKey: rows[0].getString("privateKey") };
  const keys = makeVapidKeys(() => $security.randomStringWithAlphabet(64, "0123456789abcdef"));
  const record = new Record($app.findCollectionByNameOrId("push_keys"));
  record.load(keys);
  $app.save(record);
  return keys;
}

export function pushKey(e: Event) {
  return e.json(200, { publicKey: vapidKeys().publicKey });
}

/** One browser re-subscribing (another account on a shared device) replaces its old row. */
export function replaceSubscription(e: Event) {
  const endpoint = e.record.getString("endpoint");
  if (!/^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com)\//i.test(endpoint)) {
    throw new BadRequestError("This browser's push service is not supported.");
  }
  e.app.runInTransaction((tx: App) => {
    for (const old of tx.findRecordsByFilter("push_subscriptions", "endpoint = {:endpoint}", "", 0, 0, { endpoint })) {
      if (old.getString("owner") !== e.record.getString("owner")) {
        throw new BadRequestError("Unsubscribe this browser before using reminders with another account.");
      }
      tx.delete(old);
    }
    const previous = e.app;
    e.app = tx;
    try { e.next(); } finally { e.app = previous; }
  });
}

/**
 * The service worker's half of a push: it knows only its own endpoint (an
 * unguessable capability URL) and collects the reminders queued for it.
 */
export function pushInbox(e: Event) {
  const endpoint = String(e.requestInfo().body?.endpoint ?? "");
  if (!endpoint) return e.json(200, { items: [] });
  const items = [];
  for (const row of $app.findRecordsByFilter("push_outbox", "endpoint = {:endpoint}", "created", 20, 0, { endpoint })) {
    items.push({ title: row.getString("title"), body: row.getString("body"), tag: row.getString("tag") });
    $app.delete(row);
  }
  return e.json(200, { items });
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Queue a message for every device of `userId` and wake each one up. */
function notify(userId: string, title: string, body: string, tag: string) {
  const subs = $app.findRecordsByFilter("push_subscriptions", "owner = {:owner}", "", 0, 0, { owner: userId });
  if (!subs.length) return;
  const keys = vapidKeys();
  const contact = $os.getenv("ZINGS_PUSH_CONTACT") || "https://github.com/greeenos/zings";
  const outbox = $app.findCollectionByNameOrId("push_outbox");
  for (const sub of subs) {
    const endpoint = sub.getString("endpoint");
    const message = new Record(outbox);
    message.load({ endpoint, title, body, tag });
    $app.save(message);
    try {
      const res = $http.send({
        url: endpoint,
        method: "POST",
        body: "",
        timeout: 10,
        maxRedirects: 0,
        headers: {
          Authorization: vapidAuthorization(endpoint, keys, contact, Math.floor(Date.now() / 1000)),
          TTL: "600",
          Urgency: "high",
        },
      });
      // Gone: the browser unsubscribed or the app was uninstalled.
      if (res.statusCode === 404 || res.statusCode === 410) $app.delete(sub);
    } catch (error) {
      console.log("zings push failed", String(error));
    }
  }
}

/** Runs every minute: remind the owner of every to-do due right now. */
export function sendReminders() {
  const now = new Date();
  const due = $app.findRecordsByFilter(
    "todos",
    "dueDate = {:day} && dueTime = {:time} && completed = false && deletedAt = ''",
    "", 0, 0,
    { day: localDateKey(now), time: `${pad(now.getHours())}:${pad(now.getMinutes())}` },
  );
  for (const todo of due) {
    const when = formatTimeRange(todo.getString("dueTime"), todo.getInt("estimateMin") || null);
    notify(todo.getString("owner"), todo.getString("title"), when ? `Scheduled for ${when}` : "Scheduled now", todo.id);
  }
}

// --- Shared projects ---------------------------------------------------------

/** Everyone on a project: its owner first, then the members. */
function participants(project: any): string[] {
  return [project.getString("owner"), ...(project.getStringSlice("members") as string[])];
}

function projectFor(e: Event, id: string) {
  try {
    const project = $app.findRecordById("projects", id);
    return participants(project).includes(e.auth?.id) ? project : null;
  } catch {
    return null;
  }
}

const label = (user: any) => user.getString("name") || user.getString("email").split("@")[0];

/** GET /api/share/members?projectId= — who is on a project (owner or members only). */
export function shareMembers(e: Event) {
  const project = projectFor(e, e.request.url.query().get("projectId"));
  if (!project) return e.json(404, { message: "Project not found." });
  const people = participants(project).map((id, i) => {
    const user = $app.findRecordById("users", id);
    return { id, email: user.getString("email"), name: label(user), owner: i === 0 };
  });
  return e.json(200, { items: people });
}

/** POST /api/share/invite {projectId, email} — the owner adds someone with a Zings account. */
export function shareInvite(e: Event) {
  const body = e.requestInfo().body ?? {};
  const project = projectFor(e, String(body.projectId ?? ""));
  if (!project || project.getString("owner") !== e.auth.id) return e.json(404, { message: "Only the project's owner can share it." });
  if (!proUser(e.auth)) return e.json(402, { message: "Sharing is part of Pro. Upgrade in Account → Plan." });
  const email = String(body.email ?? "").trim().toLowerCase();
  let user: any;
  try {
    user = $app.findAuthRecordByEmail("users", email);
  } catch {
    return e.json(404, { message: "Nobody with that email uses this Zings yet." });
  }
  if (participants(project).includes(user.id)) return e.json(200, { ok: true });
  project.set("members", [...(project.getStringSlice("members") as string[]), user.id]);
  $app.save(project);
  notify(user.id, `${label(e.auth)} shared “${project.getString("name")}”`, "It's in your sidebar now.", `share-${project.id}`);
  return e.json(200, { ok: true });
}

/** POST /api/share/remove {projectId, userId} — the owner removes a member, or a member leaves. */
export function shareRemove(e: Event) {
  const body = e.requestInfo().body ?? {};
  const project = projectFor(e, String(body.projectId ?? ""));
  const userId = String(body.userId ?? "");
  if (!project) return e.json(404, { message: "Project not found." });
  if (e.auth.id !== project.getString("owner") && e.auth.id !== userId) {
    return e.json(403, { message: "Only the owner can remove other people." });
  }
  project.set("members", (project.getStringSlice("members") as string[]).filter((id) => id !== userId));
  $app.save(project);
  return e.json(200, { ok: true });
}

/** A to-do added to a shared project pings everyone else on it. */
export function announceSharedTodo(e: Event) {
  e.next();
  const projectId = e.record.getString("projectId");
  if (!projectId) return;
  let project: any;
  try {
    project = $app.findRecordById("projects", projectId);
  } catch {
    return;
  }
  const author = e.record.getString("owner");
  const people = participants(project).filter((id) => id !== author);
  if (!people.length) return;
  const who = label($app.findRecordById("users", author));
  for (const id of people) {
    notify(id, `${who} added to ${project.getString("name")}`, e.record.getString("title"), e.record.id);
  }
}

/** Reminders nobody picked up within a day are stale. */
export function pruneOutbox() {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace("T", " ");
  for (const row of $app.findRecordsByFilter("push_outbox", "created < {:cutoff}", "", 0, 0, { cutoff })) {
    $app.delete(row);
  }
}

// --- Integrations -------------------------------------------------------------

/** A to-do from plain text, scheduled the way the quick-add box would. */
function createTodo(owner: string, text: string, notes = "") {
  const parsed = parseScheduleTokens(text.replace(/\s+/g, " ").trim().slice(0, 500));
  const today = localDateKey(new Date());
  const record = new Record($app.findCollectionByNameOrId("todos"));
  record.load({
    owner,
    title: parsed.cleaned || "Untitled",
    notes: notes.slice(0, 20000),
    list: parsed.dueDate ? (parsed.dueDate > today ? "anytime" : "today") : "inbox",
    dueDate: parsed.dueDate ?? "",
    dueTime: parsed.dueTime ?? "",
    estimateMin: parsed.estimateMin ?? 0,
    priority: parsed.priority ?? 0,
    deadline: parsed.deadline ?? "",
    evening: !!parsed.evening,
    repeatRule: parsed.repeatRule ?? null,
    checklist: [],
    tags: [],
    // Newest on top, like the app's own quick add.
    sortOrder: -Date.now(),
    createdAt: new Date().toISOString(),
  });
  $app.save(record);
  return record;
}

const publicTodo = (r: unknown) => {
  const t = plain<Record<string, unknown>>(r);
  return {
    id: t.id, title: t.title, notes: t.notes, list: t.list, completed: t.completed, projectId: t.projectId,
    dueDate: t.dueDate, dueTime: t.dueTime, deadline: t.deadline, priority: t.priority, tags: t.tags,
  };
};

/** Bearer <apiToken> → user, for the REST API. */
const apiUser = (e: Event) =>
  userByToken("apiToken", String(e.request.header.get("Authorization") || "").replace(/^Bearer\s+/i, ""));

/** GET /api/v1/todos?list=today — open to-dos, optionally one list. */
export function apiList(e: Event) {
  const user = apiUser(e);
  if (!user) return e.json(401, { message: "Invalid API token." });
  const list = e.request.url.query().get("list");
  const rows = $app.findRecordsByFilter(
    "todos",
    `owner = {:owner} && completed = false && deletedAt = ''${list ? " && list = {:list}" : ""}`,
    "sortOrder", 500, 0, { owner: user.id, list },
  );
  return e.json(200, { items: rows.map(publicTodo) });
}

/** POST /api/v1/todos {title, notes?} — the title understands "tomorrow at 9 !!" like the app. */
export function apiCreate(e: Event) {
  const user = apiUser(e);
  if (!user) return e.json(401, { message: "Invalid API token." });
  const body = e.requestInfo().body ?? {};
  const title = String(body.title ?? body.text ?? "").trim();
  if (!title) return e.json(400, { message: "title is required." });
  return e.json(201, publicTodo(createTodo(user.id, title, String(body.notes ?? ""))));
}

/** POST /api/v1/todos/{id}/complete */
export function apiComplete(e: Event) {
  const user = apiUser(e);
  if (!user) return e.json(401, { message: "Invalid API token." });
  let todo: App;
  try {
    todo = $app.findRecordById("todos", e.request.pathValue("id"));
  } catch {
    return e.json(404, { message: "Not found." });
  }
  if (todo.getString("owner") !== user.id) return e.json(404, { message: "Not found." });
  todo.set("completed", true);
  todo.set("completedAt", new Date().toISOString());
  $app.save(todo);
  return e.json(200, publicTodo(todo));
}

/** Tell the owner's webhook about a created or completed to-do. Never blocks the write for long. */
function webhook(event: string, todo: App) {
  let url = "";
  try {
    url = $app.findRecordById("users", todo.getString("owner")).getString("webhookUrl");
  } catch {
    return;
  }
  if (!url) return;
  try {
    $http.send({
      url,
      method: "POST",
      timeout: 5,
      headers: { "content-type": "application/json", "user-agent": "Zings-Webhook" },
      body: JSON.stringify({ event, todo: publicTodo(todo), at: new Date().toISOString() }),
    });
  } catch (error) {
    console.log("zings webhook failed", url, String(error));
  }
}

export function webhookCreated(e: Event) {
  e.next();
  webhook("todo.created", e.record);
}

export function webhookUpdated(e: Event) {
  e.next();
  if (e.record.getBool("completed") && !e.record.original().getBool("completed")) webhook("todo.completed", e.record);
}

/**
 * POST /api/inbound/email/{mailToken} — one email becomes one inbox to-do.
 * Takes JSON {subject, text, from} (the Cloudflare Email Worker in the README)
 * or Mailgun-style form fields (subject, body-plain, sender).
 */
export function inboundEmail(e: Event) {
  const user = userByToken("mailToken", e.request.pathValue("token"));
  if (!user) return e.json(404, { message: "Unknown address." });
  const body = e.requestInfo().body ?? {};
  const subject = String(body.subject ?? "").trim();
  const text = String(body.text ?? body["body-plain"] ?? body["stripped-text"] ?? "").trim();
  if (!subject && !text) return e.json(400, { message: "Empty email." });
  const from = String(body.from ?? body.sender ?? "");
  const notes = [from && `From: ${from}`, text].filter(Boolean).join("\n\n");
  const todo = createTodo(user.id, subject || text.split("\n")[0], subject ? notes : "");
  return e.json(201, { id: todo.id });
}

// --- Subscribed calendars ------------------------------------------------------

const CALENDAR_TTL_MS = 15 * 60 * 1000;

/** The .ics body for `url`, from cache while it's fresh. */
function calendarBody(url: string): string {
  let row: App;
  try {
    row = $app.findFirstRecordByFilter("calendar_cache", "url = {:url}", { url });
  } catch {
    row = new Record($app.findCollectionByNameOrId("calendar_cache"));
    row.set("url", url);
  }
  if (row.getInt("fetched") > Date.now() - CALENDAR_TTL_MS) return row.getString("body");
  try {
    const res = $http.send({ url: url.replace(/^webcal:/i, "https:"), method: "GET", timeout: 15 });
    if (res.statusCode === 200) {
      row.set("body", toString(res.body));
      row.set("fetched", Date.now());
      $app.save(row);
    }
  } catch (error) {
    console.log("zings calendar fetch failed", url, String(error));
  }
  return row.getString("body");
}

/** GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD — the signed-in user's subscribed events. */
export function calendarEvents(e: Event) {
  const query = e.request.url.query();
  const [from, to] = [query.get("from"), query.get("to")];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return e.json(400, { message: "from and to must be YYYY-MM-DD." });
  }
  const user = $app.findRecordById("users", e.auth.id);
  let calendars: Array<{ url: string; name?: string }> = [];
  try {
    calendars = JSON.parse(user.getString("calendars") || "[]");
  } catch {
    calendars = [];
  }
  const items: CalendarEvent[] = [];
  for (const cal of calendars.slice(0, 10)) {
    if (!/^(https?|webcal):\/\//i.test(cal.url ?? "")) continue;
    items.push(...eventsBetween(calendarBody(cal.url), cal.name || "Calendar", from, to));
  }
  items.sort((a, b) => a.start.localeCompare(b.start));
  return e.json(200, { items });
}

// --- AI key -------------------------------------------------------------------

/**
 * POST /api/ai/key {key, provider?, model?} — store the user's own Anthropic or
 * OpenRouter key. The key is hidden from the API (only hooks read it); the
 * client sees aiKeyHint "…a1b2".
 */
export function saveAiKey(e: Event) {
  const body = e.requestInfo().body ?? {};
  const key = String(body.key ?? "").trim();
  const provider = String(body.provider ?? "anthropic");
  if (!["anthropic", "openrouter"].includes(provider)) return e.json(400, { message: "Unknown provider." });
  const user = $app.findRecordById("users", e.auth.id);
  user.set("aiKey", key);
  user.set("aiKeyHint", key ? `…${key.slice(-4)}` : "");
  user.set("aiProvider", key ? provider : "");
  user.set("aiModel", key && provider === "openrouter" ? String(body.model ?? "").trim().slice(0, 100) : "");
  $app.save(user);
  return e.json(200, {
    aiKeyHint: user.getString("aiKeyHint"),
    aiProvider: user.getString("aiProvider"),
    aiModel: user.getString("aiModel"),
  });
}

// --- AI -----------------------------------------------------------------------
// Raw HTTP: hooks run in PocketBase's JS VM, where the Node SDK can't load.

const AI_MODEL = "claude-opus-5-5";
const OPENROUTER_DEFAULT_MODEL = "openrouter/auto";

interface AiSetup {
  provider: "anthropic" | "openrouter";
  key: string;
  model: string;
}
type AiResult = { data?: any; error?: string };

/** The caller's own key, else the instance's Anthropic key (ZINGS_AI_KEY, for hosted plans). */
function aiSetup(e: Event): AiSetup | null {
  const user = $app.findRecordById("users", e.auth.id);
  const key = user.getString("aiKey");
  if (key && user.getString("aiProvider") === "openrouter") {
    return { provider: "openrouter", key, model: user.getString("aiModel") || OPENROUTER_DEFAULT_MODEL };
  }
  if (key) return { provider: "anthropic", key, model: AI_MODEL };
  const shared = $os.getenv("ZINGS_AI_KEY");
  // The instance's own key serves everyone self-hosted, and Pro on a hosted instance.
  return shared && proUser(user) ? { provider: "anthropic", key: shared, model: AI_MODEL } : null;
}

function askAi(ai: AiSetup, system: string, user: string, schema: object): AiResult {
  return ai.provider === "openrouter" ? askOpenRouter(ai, system, user, schema) : askClaude(ai.key, system, user, schema);
}

/** Models behind OpenRouter may wrap JSON in prose or a code fence; take the outermost object. */
function parseLooseJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
}

/** OpenRouter's OpenAI-compatible chat API, for whichever model the user picked. */
function askOpenRouter(ai: AiSetup, system: string, user: string, schema: object): AiResult {
  let res: any;
  try {
    res = $http.send({
      url: "https://openrouter.ai/api/v1/chat/completions",
      method: "POST",
      timeout: 90,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${ai.key}`,
        "X-Title": "Zings",
      },
      body: JSON.stringify({
        model: ai.model,
        max_tokens: 4000,
        messages: [
          { role: "system", content: `${system}\nAnswer with JSON only, matching this schema: ${JSON.stringify(schema)}` },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema } },
      }),
    });
  } catch (error) {
    return { error: `Couldn't reach OpenRouter: ${String(error)}` };
  }
  const body = res.json ?? {};
  if (res.statusCode === 401) return { error: "Your OpenRouter API key was rejected. Check it in Account → AI." };
  if (res.statusCode === 402) return { error: "Your OpenRouter account is out of credits." };
  if (res.statusCode === 429) return { error: "OpenRouter is rate-limiting this key. Try again in a minute." };
  if (res.statusCode !== 200) return { error: body.error?.message || `OpenRouter returned HTTP ${res.statusCode}.` };
  try {
    return { data: parseLooseJson(String(body.choices?.[0]?.message?.content ?? "")) };
  } catch {
    return { error: "The model didn't return a usable answer. Try another model." };
  }
}

/** One structured-output call to Anthropic; returns the parsed JSON or an error for the client. */
function askClaude(key: string, system: string, user: string, schema: object): AiResult {
  let res: any;
  try {
    res = $http.send({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      timeout: 90,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2026-10-21",
        // A declined request re-runs on Anthropic's recommended fallback model.
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 4000,
        fallbacks: "default",
        system,
        // Low effort: these are small, quick jobs inside a to-do app.
        output_config: { effort: "low", format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (error) {
    return { error: `Couldn't reach Anthropic: ${String(error)}` };
  }
  const body = res.json ?? {};
  if (res.statusCode === 401) return { error: "Your Anthropic API key was rejected. Check it in Account → AI." };
  if (res.statusCode === 429) return { error: "Anthropic is rate-limiting this key. Try again in a minute." };
  if (res.statusCode !== 200) return { error: body.error?.message || `Anthropic returned HTTP ${res.statusCode}.` };
  if (body.stop_reason === "refusal") return { error: "The model declined this request." };
  const text = (body.content ?? []).find((b: any) => b.type === "text")?.text;
  try {
    return { data: JSON.parse(text) };
  } catch {
    return { error: "The model's answer was cut off. Try a shorter request." };
  }
}

const NO_KEY = "Add your Anthropic or OpenRouter API key in Account → AI to use this.";

/** POST /api/ai/breakdown {title, notes?} → {steps: string[]} for the checklist. */
export function aiBreakdown(e: Event) {
  const ai = aiSetup(e);
  if (!ai) return e.json(400, { message: NO_KEY });
  const body = e.requestInfo().body ?? {};
  const title = String(body.title ?? "").slice(0, 500);
  if (!title.trim()) return e.json(400, { message: "Nothing to break down." });
  const result = askAi(
    ai,
    "You break a to-do into the concrete physical next actions it takes, for a checklist. " +
      "Return 3 to 8 short steps, each starting with a verb, in the same language as the to-do. " +
      "No numbering, no commentary.",
    `To-do: ${title}\n${String(body.notes ?? "").slice(0, 4000)}`,
    {
      type: "object",
      properties: { steps: { type: "array", items: { type: "string" } } },
      required: ["steps"],
      additionalProperties: false,
    },
  );
  if (result.error) return e.json(502, { message: result.error });
  return e.json(200, { steps: (result.data.steps as string[]).map((s) => s.trim()).filter(Boolean).slice(0, 12) });
}

/**
 * POST /api/ai/capture {text} → {todos: string[]}: a ramble or a pasted email
 * becomes separate to-do titles. Scheduling phrases stay at the end of each
 * title ("Call the dentist tomorrow at 9") so the app's own parser reads them.
 */
export function aiCapture(e: Event) {
  const ai = aiSetup(e);
  if (!ai) return e.json(400, { message: NO_KEY });
  const text = String(e.requestInfo().body?.text ?? "").slice(0, 8000);
  if (!text.trim()) return e.json(400, { message: "Nothing to capture." });
  const today = new Date();
  const result = askAi(
    ai,
    "You turn dictated or pasted text into a to-do list. Return one short, actionable title per task, " +
      "in the language it was spoken in. When a task has a day, time, repeat or deadline, put it in plain " +
      "words at the end of its title, e.g. \"Call the dentist tomorrow at 9am\", \"Pay rent every month\", " +
      "\"Send the report by friday\", \"Zavolat mámě zítra v 17:00\". Skip anything that isn't a task. " +
      `Today is ${localDateKey(today)}.`,
    text,
    {
      type: "object",
      properties: { todos: { type: "array", items: { type: "string" } } },
      required: ["todos"],
      additionalProperties: false,
    },
  );
  if (result.error) return e.json(502, { message: result.error });
  return e.json(200, { todos: (result.data.todos as string[]).map((s) => s.trim()).filter(Boolean).slice(0, 30) });
}

// --- Hosted plans and billing -------------------------------------------------
// Only when ZINGS_HOSTED=1. A self-hosted instance has no limits and no billing.

const env = (name: string) => String($os.getenv(name) || "");
const hosted = () => env("ZINGS_HOSTED") === "1";
const appUrl = () => env("ZINGS_APP_URL").replace(/\/$/, "");
const FREE_TODO_LIMIT = () => Number(env("ZINGS_FREE_TODO_LIMIT")) || 100;
const PRICE_MONTH_EUR = () => Number(env("ZINGS_PRICE_MONTH_EUR")) || 2;
const PRICE_YEAR_EUR = () => Number(env("ZINGS_PRICE_YEAR_EUR")) || 20;

const proUser = (user: App) => !hosted() || isPro(user.getString("paidUntil"), new Date());

/** Free accounts on a hosted instance: up to N open to-dos. */
export function guardTodoCreate(e: Event) {
  if (hosted() && e.auth && !proUser(e.auth)) {
    const open = e.app.countRecords("todos", $dbx.hashExp({ owner: e.auth.id, completed: false, deletedAt: "" }));
    if (open >= FREE_TODO_LIMIT()) {
      throw new BadRequestError(`The free plan holds ${FREE_TODO_LIMIT()} open to-dos. Upgrade to Pro in Account → Plan.`);
    }
  }
  e.next();
}

/** Attachments take disk space: Pro only on a hosted instance. */
export function guardAttachments(e: Event) {
  if (hosted() && e.auth && !proUser(e.auth)) {
    const before = e.record.original().getStringSlice("attachments").length;
    if (e.record.getStringSlice("attachments").length > before) {
      throw new BadRequestError("Attachments are part of Pro. Upgrade in Account → Plan.");
    }
  }
  e.next();
}

/** Clients never set their own plan. */
export function protectBilling(e: Event) {
  const body = e.requestInfo().body ?? {};
  for (const field of ["paidUntil", "stripeCustomer", "renewalNotice"]) {
    if (field in body) throw new BadRequestError(`${field} can't be changed.`);
  }
  e.next();
}

/** GET /api/billing/status — what the Plan section shows. */
export function billingStatus(e: Event) {
  const user = $app.findRecordById("users", e.auth.id);
  const open = $app.countRecords("todos", $dbx.hashExp({ owner: user.id, completed: false, deletedAt: "" }));
  return e.json(200, {
    hosted: hosted(),
    pro: proUser(user),
    paidUntil: user.getString("paidUntil"),
    autoRenews: !!user.getString("stripeCustomer"),
    openTodos: open,
    freeTodoLimit: FREE_TODO_LIMIT(),
    priceMonthEur: PRICE_MONTH_EUR(),
    priceYearEur: PRICE_YEAR_EUR(),
    stripe: !!(env("STRIPE_SECRET_KEY") && env("STRIPE_PRICE_MONTH") && env("STRIPE_PRICE_YEAR")),
    crypto: !!env("NOWPAYMENTS_API_KEY"),
    aiIncluded: !!env("ZINGS_AI_KEY") && proUser(user),
    // Whether Pro comes with AI on this instance's key.
    aiOffered: !!env("ZINGS_AI_KEY"),
  });
}

/** Stripe's API takes form encoding with bracketed keys: line_items[0][price]=…. */
function stripeForm(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === "") continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === "object") out.push(...stripeForm(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

function stripe(path: string, params: Record<string, unknown>) {
  const res = $http.send({
    url: `https://api.stripe.com/v1/${path}`,
    method: "POST",
    timeout: 20,
    headers: {
      Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: stripeForm(params).join("&"),
  });
  if (res.statusCode !== 200) throw new BadRequestError(res.json?.error?.message || `Stripe returned HTTP ${res.statusCode}.`);
  return res.json;
}

/** POST /api/billing/stripe/checkout {interval: "month" | "year"} → {url} of a Stripe Checkout page. */
export function stripeCheckout(e: Event) {
  if (!hosted() || !env("STRIPE_SECRET_KEY")) return e.json(404, { message: "Card payments aren't set up here." });
  const interval = e.requestInfo().body?.interval === "month" ? "month" : "year";
  const user = $app.findRecordById("users", e.auth.id);
  const session = stripe("checkout/sessions", {
    mode: "subscription",
    line_items: { 0: { price: env(interval === "month" ? "STRIPE_PRICE_MONTH" : "STRIPE_PRICE_YEAR"), quantity: 1 } },
    client_reference_id: user.id,
    customer: user.getString("stripeCustomer"),
    customer_email: user.getString("stripeCustomer") ? "" : user.getString("email"),
    allow_promotion_codes: "true",
    success_url: `${appUrl()}/?billing=success`,
    cancel_url: `${appUrl()}/?billing=cancelled`,
  });
  return e.json(200, { url: session.url });
}

/** POST /api/billing/stripe/portal → {url}: change card, switch plan, cancel. */
export function stripePortal(e: Event) {
  const customer = $app.findRecordById("users", e.auth.id).getString("stripeCustomer");
  if (!customer) return e.json(404, { message: "No card subscription on this account." });
  return e.json(200, { url: stripe("billing_portal/sessions", { customer, return_url: appUrl() }).url });
}

/** Store a settled payment once; false if this provider id was already counted. */
function recordPayment(user: App, provider: string, externalId: string, amount: number, currency: string, paidUntil: string) {
  try {
    $app.findFirstRecordByFilter("payments", "provider = {:provider} && externalId = {:id}", { provider, id: externalId });
    return false;
  } catch {
    const row = new Record($app.findCollectionByNameOrId("payments"));
    row.load({ user: user.id, provider, externalId, amount, currency, paidUntil });
    $app.save(row);
    return true;
  }
}

function findUser(filter: string, params: Record<string, string>): App | null {
  try {
    return $app.findFirstRecordByFilter("users", filter, params);
  } catch {
    return null;
  }
}

/**
 * POST /api/billing/stripe/webhook — checkout.session.completed links the
 * customer, invoice.paid extends Pro to the invoice's period end (+3 days grace,
 * so a slow renewal never locks anyone out).
 */
export function stripeWebhook(e: Event) {
  const raw = toString(e.request.body);
  const ok = stripeSignatureValid(
    String(e.request.header.get("Stripe-Signature") || ""), raw, env("STRIPE_WEBHOOK_SECRET"),
    Math.floor(Date.now() / 1000), (data, key) => $security.hs256(data, key),
  );
  if (!ok) return e.json(400, { message: "Bad signature." });
  const event = JSON.parse(raw);
  const obj = event.data?.object ?? {};

  if (event.type === "checkout.session.completed" && obj.client_reference_id && obj.customer) {
    const user = findUser("id = {:id}", { id: obj.client_reference_id });
    if (user) {
      user.set("stripeCustomer", obj.customer);
      $app.save(user);
    }
  }

  if (event.type === "invoice.paid") {
    // invoice.paid can beat checkout.session.completed; fall back to the email.
    const user = findUser("stripeCustomer = {:c}", { c: obj.customer ?? "" })
      ?? findUser("email = {:email}", { email: obj.customer_email ?? "" });
    const end = Number(obj.lines?.data?.[0]?.period?.end);
    if (user && end) {
      const until = new Date((end + 3 * 86400) * 1000).toISOString();
      if (recordPayment(user, "stripe", obj.id, (obj.amount_paid ?? 0) / 100, obj.currency ?? "", until)) {
        if (!user.getString("stripeCustomer")) user.set("stripeCustomer", obj.customer);
        if (until > user.getString("paidUntil")) user.set("paidUntil", until);
        $app.save(user);
      }
    }
  }
  return e.json(200, { received: true });
}

/** POST /api/billing/crypto/invoice → {url}: one year of Pro, paid in any coin NOWPayments takes. */
export function cryptoInvoice(e: Event) {
  if (!hosted() || !env("NOWPAYMENTS_API_KEY")) return e.json(404, { message: "Crypto payments aren't set up here." });
  const res = $http.send({
    url: "https://api.nowpayments.io/v1/invoice",
    method: "POST",
    timeout: 20,
    headers: { "x-api-key": env("NOWPAYMENTS_API_KEY"), "content-type": "application/json" },
    body: JSON.stringify({
      price_amount: PRICE_YEAR_EUR(),
      price_currency: "eur",
      order_id: `${e.auth.id}:${Date.now()}`,
      order_description: "Zings Pro, 1 year",
      ipn_callback_url: `${appUrl()}/api/billing/crypto/ipn`,
      success_url: `${appUrl()}/?billing=success`,
      cancel_url: `${appUrl()}/?billing=cancelled`,
    }),
  });
  if (res.statusCode !== 200 || !res.json?.invoice_url) {
    return e.json(502, { message: res.json?.message || `NOWPayments returned HTTP ${res.statusCode}.` });
  }
  return e.json(200, { url: res.json.invoice_url });
}

/** POST /api/billing/crypto/ipn — NOWPayments' callback; a finished payment adds a year. */
export function cryptoIpn(e: Event) {
  const raw = toString(e.request.body);
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return e.json(400, { message: "Bad body." });
  }
  const secret = env("NOWPAYMENTS_IPN_SECRET");
  const sig = String(e.request.header.get("x-nowpayments-sig") || "");
  if (!secret || !$security.equal(sig, $security.hs512(sortedJson(body), secret))) {
    return e.json(400, { message: "Bad signature." });
  }
  if (body.payment_status !== "finished") return e.json(200, { ignored: body.payment_status });
  const user = findUser("id = {:id}", { id: String(body.order_id ?? "").split(":")[0] });
  if (!user) return e.json(200, { ignored: "unknown user" });
  const until = extendPaidUntil(user.getString("paidUntil"), new Date(), 12);
  if (recordPayment(user, "nowpayments", String(body.payment_id), Number(body.price_amount) || 0, String(body.price_currency ?? ""), until)) {
    user.set("paidUntil", until);
    $app.save(user);
    notify(user.id, "Zings Pro is active", `Thank you! Paid until ${until.slice(0, 10)}.`, "billing");
  }
  return e.json(200, { ok: true });
}

/** Daily: crypto payments don't renew themselves, so warn a week before Pro ends. */
export function renewalReminders() {
  if (!hosted()) return;
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 86400 * 1000).toISOString();
  const users = $app.findRecordsByFilter(
    "users",
    "paidUntil != '' && paidUntil > {:now} && paidUntil < {:soon} && stripeCustomer = '' && renewalNotice != paidUntil",
    "", 0, 0, { now: now.toISOString(), soon },
  );
  for (const user of users) {
    notify(user.id, "Zings Pro ends soon", `Your Pro year runs out on ${user.getString("paidUntil").slice(0, 10)}. Renew in Account → Plan.`, "billing");
    user.set("renewalNotice", user.getString("paidUntil"));
    $app.save(user);
  }
}
