import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Browsers where the app is installable but no `beforeinstallprompt` fires, so
 * we must coach the user through the manual step instead of a one-tap button.
 * "ios" → Share → Add to Home Screen; "macos-safari" → File → Add to Dock.
 */
type InstallHint = "ios" | "macos-safari" | null;

function detectInstallHint(): InstallHint {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  const touch = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
  // iPadOS 13+ reports as "MacIntel" but exposes touch points.
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && touch > 1);
  if (isIOS) return "ios";
  const isSafari = /safari/i.test(ua) && !/chrome|crios|chromium|android|edg|fxios|firefox/i.test(ua);
  const isMac = /macintosh|mac os x/i.test(ua) && touch <= 1;
  if (isMac && isSafari) return "macos-safari";
  return null;
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true;
  });

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const [hint] = useState<InstallHint>(detectInstallHint);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice.outcome === "accepted";
  }, [deferred]);

  return {
    canInstall: !installed && deferred !== null,
    installed,
    promptInstall,
    // Only surface a manual hint when there's no native prompt to offer instead.
    installHint: installed || deferred !== null ? null : hint,
  };
}
