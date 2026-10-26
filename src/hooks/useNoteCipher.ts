import { useEffect, useState, useSyncExternalStore } from "react";
import * as cipher from "@/lib/noteCipher";

export function useNoteCipher() {
  const status = useSyncExternalStore(
    cipher.subscribe,
    () => cipher.getStatus(),
    () => ({ enabled: false, unlocked: false }),
  );
  return {
    ...status,
    setup: cipher.setupEncryption,
    unlock: cipher.unlockEncryption,
    lock: cipher.lockEncryption,
    disable: cipher.disableEncryption,
  };
}

/**
 * Decrypts a single notes value reactively — re-runs when the cipher state changes
 * so newly unlocked sessions immediately show plaintext.
 *
 * Returns:
 *  - undefined → no notes
 *  - { state: "plain", text }  → plaintext available
 *  - { state: "locked" }       → ciphertext present but we don't have the key
 */
export function useDecryptedNote(notes: string | undefined): { state: "plain"; text: string } | { state: "locked" } | undefined {
  const status = useSyncExternalStore(
    cipher.subscribe,
    () => cipher.getStatus(),
    () => ({ enabled: false, unlocked: false }),
  );
  const [resolved, setResolved] = useState<{ state: "plain"; text: string } | { state: "locked" } | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!notes) {
      setResolved(undefined);
      return;
    }
    if (!cipher.isEncrypted(notes)) {
      setResolved({ state: "plain", text: notes });
      return;
    }
    cipher.decryptNote(notes).then((out) => {
      if (cancelled) return;
      if (out === null) setResolved({ state: "locked" });
      else if (typeof out === "string") setResolved({ state: "plain", text: out });
      else setResolved(undefined);
    });
    return () => {
      cancelled = true;
    };
    // Re-run when the underlying notes change OR when the cipher unlocks/locks.
  }, [notes, status.unlocked]);

  return resolved;
}
