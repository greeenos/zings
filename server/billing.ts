// Pure helpers for the billing hooks: webhook signatures and paid periods.

/**
 * Stripe's `Stripe-Signature: t=…,v1=…` header: HMAC-SHA256 of `${t}.${body}`.
 * `hmac` is injected ($security.hs256 in the hook, node:crypto in tests).
 */
export function stripeSignatureValid(
  header: string,
  body: string,
  secret: string,
  nowSec: number,
  hmac: (data: string, key: string) => string,
  toleranceSec = 300,
): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!secret || !t || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = hmac(`${t}.${body}`, secret);
  // Several v1 entries appear while a secret is being rolled.
  return header.split(",").some((p) => p.startsWith("v1=") && p.slice(3) === expected);
}

/** NOWPayments signs the IPN body re-serialised with keys sorted at every level. */
export function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${sortedJson(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Pro runs from whichever is later, now or the current end, for `months`. */
export function extendPaidUntil(current: string, now: Date, months: number): string {
  const from = current && new Date(current) > now ? new Date(current) : now;
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + months);
  return end.toISOString();
}

export const isPro = (paidUntil: string, now: Date) => !!paidUntil && new Date(paidUntil) > now;
