/**
 * Optional, client-side AES-GCM encryption for the `notes` field of todos.
 *
 * Design goals:
 *  - Off by default; user must opt in from Settings and pick a passphrase.
 *  - The server only ever sees ciphertext; key never leaves the browser.
 *  - Plaintext notes from before encryption was enabled keep working; they just
 *    aren't encrypted retroactively unless the user runs the migration.
 *  - Lost passphrase = lost notes. We surface this clearly in the UI.
 *  - The salt and verifier live on the user record, so any signed-in device can
 *    unlock with the same passphrase. Neither reveals the key.
 */

import { pb } from "@/lib/db";

const ENC_PREFIX = "enc:v1:";
// OWASP's 2023 figure for PBKDF2-HMAC-SHA256. Setups made before it used 250k;
// the count travels with the salt ("600000$<salt>"), so those still unlock.
const PBKDF2_ITERATIONS = 600_000;
const LEGACY_ITERATIONS = 250_000;
/** Where older versions kept the settings, in one browser only. */
const LEGACY_KEY = "zings-note-cipher-v1";

interface CipherSettings {
  enabled: boolean;
  saltB64: string;
  /** A short known plaintext, encrypted with the derived key, used to verify passphrases. */
  verifierB64: string;
}

let activeKey: CryptoKey | null = null;
let cachedSettings: CipherSettings | null = readSettings();
let cachedStatus: CipherStatus = { enabled: !!cachedSettings?.enabled, unlocked: false };
const listeners = new Set<() => void>();

function refreshStatus() {
  const next: CipherStatus = { enabled: !!cachedSettings?.enabled, unlocked: !!activeKey };
  if (next.enabled !== cachedStatus.enabled || next.unlocked !== cachedStatus.unlocked) {
    cachedStatus = next;
  }
}

function notify() {
  refreshStatus();
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readSettings(): CipherSettings | null {
  const record = pb.authStore.record;
  if (!record?.cipherSalt || !record?.cipherVerifier) return null;
  return { enabled: true, saltB64: record.cipherSalt, verifierB64: record.cipherVerifier };
}

async function writeSettings(s: CipherSettings | null) {
  const id = pb.authStore.record?.id;
  if (!id) throw new Error("Sign in to change note encryption");
  // Updating your own record also refreshes authStore, which re-reads settings below.
  await pb.collection("users").update(id, { cipherSalt: s?.saltB64 ?? "", cipherVerifier: s?.verifierB64 ?? "" });
  cachedSettings = s;
  notify();
}

/** Moves a setup made by an older Zings (this browser only) onto the account. */
function adoptLegacySettings() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw || cachedSettings || !pb.authStore.record) return;
    const legacy = JSON.parse(raw);
    if (typeof legacy?.saltB64 !== "string" || typeof legacy?.verifierB64 !== "string") return;
    void writeSettings({ enabled: true, saltB64: legacy.saltB64, verifierB64: legacy.verifierB64 }).then(() =>
      localStorage.removeItem(LEGACY_KEY),
    );
  } catch {
    /* unreadable leftovers are simply ignored */
  }
}

// Sign-in, sign-out and authRefresh (another device turned encryption on/off).
pb.authStore.onChange(() => {
  cachedSettings = readSettings();
  if (!cachedSettings) activeKey = null;
  notify();
  adoptLegacySettings();
});
adoptLegacySettings();

/**
 * Web Crypto's SubtleCrypto is only exposed in a secure context (HTTPS, or
 * http://localhost / 127.0.0.1). Zings is often opened over plain HTTP on a LAN
 * or Tailscale IP, where `crypto.subtle` is `undefined` — surface that clearly
 * instead of letting `Cannot read properties of undefined` bubble up.
 */
function requireSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "Encryption needs a secure context. Open Zings over HTTPS or via http://localhost — " +
        "the browser disables encryption on plain-HTTP LAN/Tailscale IP addresses.",
    );
  }
  return subtle;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, saltField: string): Promise<CryptoKey> {
  const [iterations, saltB64] = saltField.includes("$")
    ? [Number(saltField.split("$")[0]), saltField.split("$")[1]]
    : [LEGACY_ITERATIONS, saltField];
  const salt = b64ToBytes(saltB64);
  const subtle = requireSubtle();
  const baseKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptWith(key: CryptoKey, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await requireSubtle().encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.length);
  return ENC_PREFIX + bytesToB64(combined);
}

async function decryptWith(key: CryptoKey, text: string): Promise<string> {
  const combined = b64ToBytes(text.slice(ENC_PREFIX.length));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const plain = await requireSubtle().decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}

export function isEncrypted(value: string | undefined | null): boolean {
  return !!value && value.startsWith(ENC_PREFIX);
}

interface CipherStatus {
  enabled: boolean; // user has set encryption up at least once
  unlocked: boolean; // we currently hold the key in memory
}

export function getStatus(): CipherStatus {
  return cachedStatus;
}

/** First-time setup. Generates a salt, derives the key, persists the verifier. */
export async function setupEncryption(passphrase: string): Promise<void> {
  if (passphrase.length < 4) throw new Error("Passphrase too short");
  const saltB64 = `${PBKDF2_ITERATIONS}$${bytesToB64(crypto.getRandomValues(new Uint8Array(16)))}`;
  const key = await deriveKey(passphrase, saltB64);
  const verifier = await encryptWith(key, "zings-ok");
  await writeSettings({
    enabled: true,
    saltB64,
    verifierB64: verifier,
  });
  activeKey = key;
  notify();
}

/** Existing user, new session — verify the passphrase and load the key. */
export async function unlockEncryption(passphrase: string): Promise<boolean> {
  if (!cachedSettings) return false;
  const key = await deriveKey(passphrase, cachedSettings.saltB64);
  try {
    const probe = await decryptWith(key, cachedSettings.verifierB64);
    if (probe !== "zings-ok") return false;
  } catch {
    return false;
  }
  activeKey = key;
  notify();
  return true;
}

export function lockEncryption(): void {
  activeKey = null;
  notify();
}

/** Turn encryption off entirely. Caller is responsible for migrating notes back to plaintext first. */
export async function disableEncryption(): Promise<void> {
  await writeSettings(null);
  activeKey = null;
  notify();
}

/** Encrypt a notes value if encryption is enabled & unlocked; otherwise pass through unchanged. */
export async function encryptNote(value: string | undefined): Promise<string | undefined> {
  if (value === undefined || value === null || value === "") return value;
  if (isEncrypted(value)) return value;
  if (!activeKey) {
    // Encryption is on for this account but locked here: never fall back to plain text.
    if (cachedSettings) throw new Error("Unlock note encryption first (Account → Note encryption)");
    return value;
  }
  return encryptWith(activeKey, value);
}

/**
 * Try to decrypt a notes value. Returns:
 *  - the plaintext if value was encrypted and we have the key
 *  - the original value if it was already plaintext
 *  - null if it's encrypted but we don't have the key (caller renders a locked placeholder)
 */
export async function decryptNote(value: string | undefined | null): Promise<string | null | undefined> {
  if (value === undefined || value === null || value === "") return value;
  if (!isEncrypted(value)) return value;
  if (!activeKey) return null;
  try {
    return await decryptWith(activeKey, value);
  } catch {
    return null;
  }
}
