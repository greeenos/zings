import { useEffect } from "react";

interface BadgingNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export function useAppBadge(count: number) {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & BadgingNavigator;
    if (!nav.setAppBadge) return;
    if (count > 0) {
      nav.setAppBadge(count).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [count]);
}
