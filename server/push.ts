/**
 * Web Push without a payload: the server only signs a VAPID "wake up" request,
 * and the service worker then fetches the actual reminder text from
 * /api/push/inbox. That avoids payload encryption entirely, which the
 * PocketBase JS runtime (no WebCrypto, string-only HTTP bodies) can't do.
 */
import { p256 } from "@noble/curves/nist.js";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

export function fromBase64url(text: string): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    buffer = (buffer << 6) | B64.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 255);
    }
  }
  return new Uint8Array(out);
}

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

export interface VapidKeys {
  /** Uncompressed P-256 point, base64url — what browsers take as applicationServerKey. */
  publicKey: string;
  privateKey: string;
}

/** A new key pair from 32 bytes of server-side randomness. */
export function makeVapidKeys(randomHex: () => string): VapidKeys {
  let secret: Uint8Array;
  do {
    secret = Uint8Array.from(randomHex().match(/../g)!, (h) => parseInt(h, 16));
  } while (!p256.utils.isValidSecretKey(secret));
  return { publicKey: base64url(p256.getPublicKey(secret, false)), privateKey: base64url(secret) };
}

/** The Authorization header for one push to `endpoint`, valid for 12 hours. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, contact: string, nowSec: number): string {
  const audience = endpoint.match(/^https?:\/\/[^/]+/)?.[0];
  if (!audience) throw new Error("push endpoint is not a URL");
  const header = base64url(ascii(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64url(ascii(JSON.stringify({ aud: audience, exp: nowSec + 12 * 3600, sub: contact })));
  const signature = p256.sign(ascii(`${header}.${claims}`), fromBase64url(keys.privateKey), { prehash: true, format: "compact" });
  return `vapid t=${header}.${claims}.${base64url(signature)}, k=${keys.publicKey}`;
}
