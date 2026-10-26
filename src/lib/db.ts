import { isDemo, demoToken, demoUser, readDemo, demoWrite } from './demo';
import PocketBase, { BaseAuthStore, type BatchService, type ClientResponseError } from 'pocketbase';
import { fromRecord } from '@/lib/record';
import { toast } from '@/lib/toast';

/**
 * The app talks to the PocketBase server it is served from. Writes return the
 * error (or null) instead of throwing, so call sites can roll back their
 * optimistic update in one `if`.
 *
 * Offline, writes go to an outbox in this browser and count as done; they are
 * sent in order once the server is reachable again. Reads fall back to the
 * last copy fetched, with the outbox applied on top.
 */
export const pb = new PocketBase(isDemo ? '/' : (import.meta.env.VITE_PB_URL || '/'), isDemo ? new BaseAuthStore() : undefined);
pb.autoCancellation(false);
if (isDemo) {
  pb.authStore.save(demoToken(), demoUser);
  // A demo never sends credentials or mutations to a live PocketBase.
  pb.beforeSend = (url, options) => ({ url, options: { ...options, fetch: async () => new Response(JSON.stringify({message:'This feature needs a connected PocketBase server. The demo saves tasks only in this browser.'}), {status:400,headers:{'content-type':'application/json'}}) } });
}

export type Table = 'todos' | 'projects' | 'areas' | 'headings';

interface Op {
  table: Table;
  kind: 'create' | 'upsert' | 'update' | 'delete';
  id: string;
  body?: Record<string, unknown>;
}

const BATCH_LIMIT = 500; // settings.batch.maxRequests in pb_migrations/1_init.js
const OUTBOX_PREFIX = 'zings-outbox-';
const outboxKey = () => `${OUTBOX_PREFIX}${pb.authStore.record?.id ?? 'anonymous'}`;
const CACHE_PREFIX = 'zings-cache-';

/** The server's own words for a failed write, dug out of a batch response if need be. */
export function errorMessage(error: unknown, fallback: string): string {
  const response = (error as ClientResponseError)?.response as Record<string, unknown> | undefined;
  const requests = (response?.data as { requests?: Record<string, { response?: { message?: string } }> })?.requests;
  const inner = requests && Object.values(requests).find((r) => r?.response?.message)?.response?.message;
  return inner || (typeof response?.message === 'string' && !/batch/i.test(response.message) ? response.message : fallback);
}

/** No answer at all — as opposed to the server saying no. */
const unreachable = (error: unknown) => (error as ClientResponseError)?.status === 0;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const readOutbox = (key = outboxKey()) => load<Op[]>(key, []);
function enqueue(ops: Op[]): Error | null {
  return save(outboxKey(), [...readOutbox(), ...ops])
    ? null
    : new Error('Could not save offline changes. Free some browser storage and try again.');
}
const cacheKey = (table: Table) => `${CACHE_PREFIX}${pb.authStore.record?.id}-${table}`;

function addToBatch(batch: BatchService, op: Op) {
  const collection = batch.collection(op.table);
  if (op.kind === 'create') collection.create(op.body!);
  else if (op.kind === 'upsert') collection.upsert(op.body!);
  else if (op.kind === 'update') collection.update(op.id, op.body!);
  else collection.delete(op.id);
}

async function send(ops: Op[]) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = pb.createBatch();
    for (const op of ops.slice(i, i + BATCH_LIMIT)) addToBatch(batch, op);
    await batch.send();
  }
}

async function run(ops: Op[]): Promise<Error | null> {
  if (isDemo) return demoWrite(ops);
  // Behind earlier offline writes, so the server sees them in order.
  if (readOutbox().length > 0) {
    const error = enqueue(ops);
    if (!error) void flush();
    return error;
  }
  try {
    await send(ops);
    return null;
  } catch (error) {
    if (!unreachable(error)) return error as Error;
    return enqueue(ops);
  }
}

let flushing = false;

/** Sends queued offline writes one by one; returns how many went out. */
export async function flush(): Promise<number> {
  if (flushing || !pb.authStore.isValid) return 0;
  flushing = true;
  let sent = 0;
  const key = outboxKey();
  try {
    while (key === outboxKey() && pb.authStore.isValid && readOutbox(key).length > 0) {
      const op = readOutbox(key)[0];
      try {
        // A lost response can leave a create committed on the server. Upsert
        // makes retrying the same stable id safe instead of blocking the queue.
        await send([op.kind === 'create' ? { ...op, kind: 'upsert' } : op]);
        sent += 1;
      } catch (error) {
        if (!unreachable(error)) toast.error('A saved change could not sync. It is still kept in this browser.');
        break;
      }
      if (key !== outboxKey() || !pb.authStore.isValid) break;
      if (!save(key, readOutbox(key).slice(1))) break;
    }
  } finally {
    flushing = false;
  }
  if (sent > 0) {
    toast.success(`Back online — synced ${sent} change${sent === 1 ? '' : 's'}`);
    window.dispatchEvent(new Event('zings:resync'));
  }
  return sent;
}

/** The cached rows with the not-yet-sent writes applied on top. */
function withOutbox<T extends { id: string }>(table: Table, rows: T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const op of readOutbox()) {
    if (op.table !== table) continue;
    if (op.kind === 'delete') byId.delete(op.id);
    else byId.set(op.id, fromRecord<T>({ ...byId.get(op.id), ...op.body }));
  }
  return [...byId.values()];
}

const owner = () => pb.authStore.record?.id ?? '';

export async function listAll<T extends { id: string }>(table: Table): Promise<{ data: T[] | null; error: Error | null }> {
  if (isDemo) return {data: readDemo()[table].map(r=>fromRecord<T>(r)), error:null};
  try {
    const rows = (await pb.collection(table).getFullList({ sort: 'sortOrder', batch: 1000 })).map((r) => fromRecord<T>(r));
    save(cacheKey(table), rows);
    return { data: withOutbox(table, rows), error: null };
  } catch (error) {
    const cached = load<T[] | null>(cacheKey(table), null);
    if (unreachable(error) && cached) return { data: withOutbox(table, cached), error: null };
    return { data: null, error: error as Error };
  }
}

export async function idsWhere(table: Table, field: string, value: string): Promise<string[]> {
  if (isDemo) return readDemo()[table].filter(r=>r[field]===value).map(r=>r.id);
  try {
    const rows = await pb.collection(table).getFullList({
      filter: pb.filter(`${field} = {:value}`, { value }),
      fields: 'id',
    });
    return rows.map((r) => r.id);
  } catch (error) {
    if (!unreachable(error)) throw error;
    const cached = withOutbox(table, load<Array<{ id: string } & Record<string, unknown>>>(cacheKey(table), []));
    return cached.filter((row) => row[field] === value).map((row) => row.id);
  }
}

export const insert = (table: Table, rows: Array<{ id: string }>) =>
  run(rows.map((row) => ({ table, kind: 'create', id: row.id, body: { ...row, owner: owner() } })));

/** Insert-or-replace by id — the backup import. */
export const upsert = (table: Table, rows: Array<{ id: string }>) =>
  run(rows.map((row) => ({ table, kind: 'upsert', id: row.id, body: { ...row, owner: owner() } })));

export const update = (table: Table, ids: string[], patch: object) =>
  run(ids.map((id) => ({ table, kind: 'update', id, body: { ...patch } })));

export const remove = (table: Table, ids: string[]) => run(ids.map((id) => ({ table, kind: 'delete', id })));

/** Live changes from other devices. Returns the unsubscribe function. */
export function subscribe<T>(table: Table, onChange: (action: string, row: T) => void): () => void {
  if (isDemo) {
    let rows = readDemo()[table];
    const refresh = () => {
      const next = readDemo()[table];
      for (const row of next) { const previous=rows.find(r=>r.id===row.id); if(JSON.stringify(previous)!==JSON.stringify(row)) onChange(previous?'update':'create',fromRecord<T>(row)); }
      for (const row of rows) if(!next.some(r=>r.id===row.id)) onChange('delete',fromRecord<T>(row));
      rows=next;
    };
    window.addEventListener('zings:demo-change',refresh);
    window.addEventListener('storage',refresh);
    return ()=>{window.removeEventListener('zings:demo-change',refresh);window.removeEventListener('storage',refresh);};
  }
  const pending = pb.collection(table).subscribe('*', (e) => onChange(e.action, fromRecord<T>(e.record)));
  return () => void pending.then((unsubscribe) => unsubscribe()).catch(() => {});
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flush());
  window.addEventListener('offline', () => toast.message("You're offline — changes are kept here and sync when you're back"));
  // Anything left from a previous session, and a slow retry while the server is away.
  void flush();
  setInterval(() => {
    if (readOutbox().length > 0) void flush();
  }, 30_000);

  // Signing out on a shared device leaves no copy of the data behind.
  pb.authStore.onChange(() => {
    if (pb.authStore.isValid) return;
    // A signed-out shared device must stop receiving this account's reminders.
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistration()
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => sub?.unsubscribe()).catch(() => {});
    }
    try {
      localStorage.removeItem('zings-reminders-enabled');
      localStorage.removeItem('zings-reminders-fired');
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(CACHE_PREFIX) || key.startsWith(OUTBOX_PREFIX) || key === 'zings-outbox') localStorage.removeItem(key);
      }
    } catch {
      /* nothing stored */
    }
  });
}
