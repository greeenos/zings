import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  setupEncryption,
  unlockEncryption,
  lockEncryption,
  disableEncryption,
  encryptNote,
  decryptNote,
  isEncrypted,
  getStatus,
} from "./noteCipher";

// The signed-in user's record, standing in for PocketBase: settings saved by
// one "device" are what the next one reads.
const account = vi.hoisted(() => ({ record: { id: "u1" } as Record<string, string> }));
vi.mock("@/lib/db", () => ({
  pb: {
    authStore: { get record() { return account.record; }, onChange: () => () => {} },
    collection: () => ({
      update: async (_id: string, data: Record<string, string>) => Object.assign(account.record, data),
    }),
  },
}));

// The module holds an in-memory key + caches the account's settings. Each test
// starts from a clean, disabled state.
beforeEach(async () => {
  await disableEncryption();
  localStorage.clear();
});

describe("noteCipher — end-to-end encryption lifecycle", () => {
  it("starts disabled and locked", () => {
    expect(getStatus()).toEqual({ enabled: false, unlocked: false });
  });

  it("passes plaintext through unchanged when encryption is off", async () => {
    expect(await encryptNote("hello")).toBe("hello");
    expect(await decryptNote("hello")).toBe("hello");
  });

  it("setup enables + unlocks and produces ciphertext the server never sees as plaintext", async () => {
    await setupEncryption("correct horse");
    expect(getStatus()).toEqual({ enabled: true, unlocked: true });

    const ct = await encryptNote("my secret note");
    expect(ct).toBeDefined();
    expect(ct!.startsWith("enc:v1:")).toBe(true);
    expect(ct).not.toContain("my secret note");
    expect(isEncrypted(ct)).toBe(true);
    expect(isEncrypted("plain")).toBe(false);
  });

  it("round-trips: decrypt(encrypt(x)) === x", async () => {
    await setupEncryption("correct horse");
    for (const plain of ["hello", "čeština 🔒", "line1\nline2", "a".repeat(5000)]) {
      const ct = await encryptNote(plain);
      expect(await decryptNote(ct)).toBe(plain);
    }
  });

  it("produces a unique IV per encryption (same input → different ciphertext)", async () => {
    await setupEncryption("correct horse");
    const a = await encryptNote("same");
    const b = await encryptNote("same");
    expect(a).not.toBe(b);
    expect(await decryptNote(a)).toBe("same");
    expect(await decryptNote(b)).toBe("same");
  });

  it("locking hides notes; unlocking with the right passphrase restores them", async () => {
    await setupEncryption("correct horse");
    const ct = await encryptNote("secret");

    lockEncryption();
    expect(getStatus().unlocked).toBe(false);
    expect(await decryptNote(ct)).toBeNull(); // locked → caller shows placeholder

    expect(await unlockEncryption("wrong pass")).toBe(false);
    expect(await decryptNote(ct)).toBeNull();

    expect(await unlockEncryption("correct horse")).toBe(true);
    expect(await decryptNote(ct)).toBe("secret");
  });

  it("survives a fresh 'session' — settings persist on the account, key re-derives on unlock", async () => {
    await setupEncryption("correct horse");
    const ct = await encryptNote("persisted");

    // Simulate reload: drop the in-memory key (the account's settings remain).
    lockEncryption();
    expect(getStatus()).toEqual({ enabled: true, unlocked: false });
    expect(await unlockEncryption("correct horse")).toBe(true);
    expect(await decryptNote(ct)).toBe("persisted");
  });

  it("empty/undefined notes are left untouched", async () => {
    await setupEncryption("correct horse");
    expect(await encryptNote("")).toBe("");
    expect(await encryptNote(undefined)).toBeUndefined();
    expect(await decryptNote("")).toBe("");
    expect(await decryptNote(undefined)).toBeUndefined();
  });

  it("does not double-encrypt already-encrypted values", async () => {
    await setupEncryption("correct horse");
    const ct = await encryptNote("once");
    expect(await encryptNote(ct)).toBe(ct);
  });

  it("disable turns encryption off", async () => {
    await setupEncryption("correct horse");
    await disableEncryption();
    expect(getStatus()).toEqual({ enabled: false, unlocked: false });
    expect(account.record.cipherSalt).toBe("");
  });

  it("derives new keys with 600k PBKDF2 iterations, recorded next to the salt", async () => {
    await setupEncryption("correct horse");
    expect(account.record.cipherSalt).toMatch(/^600000\$/);
  });

  it("still unlocks a setup made with the older 250k iterations", async () => {
    // Build the verifier exactly as the previous version did: bare salt, 250k rounds.
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode("old pass"), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt"],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("zings-ok")));
    const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    Object.assign(account.record, { cipherSalt: b64(salt), cipherVerifier: "enc:v1:" + b64(new Uint8Array([...iv, ...ct])) });

    vi.resetModules();
    const old = await import("./noteCipher");
    expect(await old.unlockEncryption("old pass")).toBe(true);
  });

  it("refuses to store a plain-text note while encryption is on but locked", async () => {
    await setupEncryption("correct horse");
    lockEncryption();
    await expect(encryptNote("would leak")).rejects.toThrow(/Unlock note encryption/);
  });

  it("another device unlocks with the same passphrase", async () => {
    await setupEncryption("correct horse");
    const ct = await encryptNote("on my phone too");

    // A second device: fresh module state, same account record.
    vi.resetModules();
    const phone = await import("./noteCipher");
    expect(phone.getStatus()).toEqual({ enabled: true, unlocked: false });
    expect(await phone.unlockEncryption("correct horse")).toBe(true);
    expect(await phone.decryptNote(ct)).toBe("on my phone too");
  });

  it("moves a setup from an older, browser-only Zings onto the account", async () => {
    localStorage.setItem("zings-note-cipher-v1", JSON.stringify({ enabled: true, saltB64: "c2FsdA==", verifierB64: "enc:v1:x" }));
    vi.resetModules();
    const upgraded = await import("./noteCipher");
    await vi.waitFor(() => expect(account.record.cipherSalt).toBe("c2FsdA=="));
    expect(upgraded.getStatus().enabled).toBe(true);
    expect(localStorage.getItem("zings-note-cipher-v1")).toBeNull();
  });
});
