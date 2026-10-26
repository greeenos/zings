import { useState } from "react";
import { Lock, LockOpen, ShieldAlert } from "@/lib/icons";
import { useNoteCipher } from "@/hooks/useNoteCipher";
import { toast } from "@/lib/toast";
import * as db from "@/lib/db";
import { decryptNote, encryptNote, isEncrypted } from "@/lib/noteCipher";
import { DialogShell } from "@/components/todo/DialogShell";

interface Props {
  open: boolean;
  onClose: () => void;
}

const inputClass =
  "w-full rounded-md bg-secondary/40 px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-primary";
const primaryClass = "btn-3d btn-primary btn-sm";

export default function EncryptionDialog({ open, onClose }: Props) {
  const { enabled, unlocked, setup, unlock, lock, disable } = useNoteCipher();
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [migrate, setMigrate] = useState(true);
  // SubtleCrypto (and thus all note encryption) only works in a secure context:
  // HTTPS, or http://localhost / 127.0.0.1. Plain-HTTP LAN/Tailscale IPs can't use it.
  const secureContext = typeof window !== "undefined" && window.isSecureContext;

  const reset = () => {
    setPass("");
    setConfirm("");
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSetup = async () => {
    if (busy) return;
    if (pass.length < 4) {
      toast.error("Passphrase must be at least 4 characters");
      return;
    }
    if (pass !== confirm) {
      toast.error("Passphrases don't match");
      return;
    }
    setBusy(true);
    try {
      await setup(pass);
      if (migrate) {
        await migrateExistingNotes();
      }
      toast.success("Notes encryption enabled");
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to enable encryption");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await unlock(pass);
      if (!ok) {
        toast.error("Wrong passphrase");
        return;
      }
      toast.success("Notes unlocked");
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleLock = () => {
    lock();
    toast.message("Notes locked");
    onClose();
  };

  const handleDisable = async () => {
    if (busy || !window.confirm("Turn off encryption? Your notes are decrypted and stored as plain text again.")) return;
    setBusy(true);
    try {
      await decryptExistingNotes();
      await disable();
      toast.message("Encryption turned off");
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't turn encryption off");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={close}
      title="Note encryption"
      subtitle="A passphrase only you know."
      icon={
        enabled && unlocked ? (
          <LockOpen className="h-[18px] w-[18px] text-primary-strong" />
        ) : (
          <Lock className="h-[18px] w-[18px]" />
        )
      }
    >
      {!enabled && (
        <>
          <p className="text-sm text-muted-foreground">
            Encrypt your task notes with a passphrase. The key is derived in your browser and
            never sent to the server. Titles, dates, and projects are <strong>not</strong> encrypted.
          </p>
          <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Forget the passphrase and the notes are gone forever. There's no recovery.
            </span>
          </div>
          {!secureContext && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Your browser only allows encryption over a secure connection. Open Zings via
                HTTPS or <strong>http://localhost</strong> — it won't work over a plain-HTTP
                LAN or Tailscale IP address.
              </span>
            </div>
          )}
          <div className="space-y-2">
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Passphrase"
              className={inputClass}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm passphrase"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSetup();
              }}
              className={inputClass}
            />
            <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={migrate}
                onChange={(e) => setMigrate(e.target.checked)}
              />
              Encrypt notes I've already written
            </label>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSetup}
              disabled={busy || !pass || !confirm || !secureContext}
              className={primaryClass}
            >
              {busy ? "Encrypting…" : "Enable encryption"}
            </button>
          </div>
        </>
      )}

      {enabled && !unlocked && (
        <>
          <p className="text-sm text-muted-foreground">
            Notes are encrypted. Enter your passphrase to unlock them on this device.
          </p>
          <input
            type="password"
            autoFocus
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleUnlock();
            }}
            placeholder="Passphrase"
            className={inputClass}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Unlock to turn encryption off.</span>
            <button
              onClick={handleUnlock}
              disabled={busy || !pass}
              className={primaryClass}
            >
              {busy ? "Unlocking…" : "Unlock"}
            </button>
          </div>
        </>
      )}

      {enabled && unlocked && (
        <>
          <p className="text-sm text-muted-foreground">
            Notes are unlocked for this session. Locking will hide them until you enter the passphrase again.
          </p>
          <div className="flex items-center justify-between">
            <button
              onClick={() => void handleDisable()}
              disabled={busy}
              className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              {busy ? "Decrypting notes…" : "Turn off encryption…"}
            </button>
            <button
              onClick={handleLock}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-secondary"
            >
              Lock now
            </button>
          </div>
        </>
      )}
    </DialogShell>
  );
}

/** Writes every encrypted note back as plain text; stops at the first failure. */
async function decryptExistingNotes(): Promise<void> {
  const { data, error } = await db.listAll<{ id: string; notes: string | null }>("todos");
  if (!data) throw error ?? new Error("Couldn't read your notes");
  for (const row of data) {
    if (!isEncrypted(row.notes)) continue;
    const plain = await decryptNote(row.notes);
    if (plain == null) throw new Error("A note couldn't be decrypted, so encryption stays on");
    const failed = await db.update("todos", [row.id], { notes: plain });
    if (failed) throw failed;
  }
}

async function migrateExistingNotes(): Promise<void> {
  // One-shot pass: read every todo that still has a plaintext notes field and rewrite it
  // through the now-active cipher.
  const { data } = await db.listAll<{ id: string; notes: string | null }>("todos");
  if (!data) return;
  for (const row of data) {
    if (!row.notes || isEncrypted(row.notes)) continue;
    const enc = await encryptNote(row.notes);
    if (enc && enc !== row.notes) {
      await db.update("todos", [row.id], { notes: enc });
    }
  }
}
