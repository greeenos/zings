// @vitest-environment node
import { describe, expect, it } from "vitest";
import { p256 } from "@noble/curves/nist.js";
import { base64url, fromBase64url, makeVapidKeys, vapidAuthorization } from "./push";

const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

describe("web push", () => {
  it("round-trips base64url at every padding length", () => {
    for (const n of [0, 1, 2, 3, 32, 65]) {
      const bytes = crypto.getRandomValues(new Uint8Array(n));
      expect(fromBase64url(base64url(bytes))).toEqual(bytes);
      expect(base64url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
    }
  });

  it("signs a VAPID JWT that verifies against the public key", () => {
    const keys = makeVapidKeys(randomHex);
    expect(fromBase64url(keys.publicKey)).toHaveLength(65);

    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, "mailto:me@example.com", 1_000_000);
    const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(keys.publicKey);

    const [h, c, s] = jwt.split(".");
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_000_000 + 43_200, sub: "mailto:me@example.com" });
    expect(p256.verify(fromBase64url(s), new TextEncoder().encode(`${h}.${c}`), fromBase64url(keys.publicKey))).toBe(true);
  });
});
