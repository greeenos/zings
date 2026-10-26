import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extendPaidUntil, isPro, sortedJson, stripeSignatureValid } from "./billing";

const hs256 = (data: string, key: string) => createHmac("sha256", key).update(data).digest("hex");

describe("stripeSignatureValid", () => {
  const body = '{"id":"evt_1"}';
  const header = (t: number, secret = "whsec_x") => `t=${t},v1=${hs256(`${t}.${body}`, secret)}`;

  it("accepts a fresh, correctly signed body", () => {
    expect(stripeSignatureValid(header(1000), body, "whsec_x", 1010, hs256)).toBe(true);
  });
  it("rejects a wrong secret, a tampered body and an old timestamp", () => {
    expect(stripeSignatureValid(header(1000, "other"), body, "whsec_x", 1010, hs256)).toBe(false);
    expect(stripeSignatureValid(header(1000), '{"id":"evt_2"}', "whsec_x", 1010, hs256)).toBe(false);
    expect(stripeSignatureValid(header(1000), body, "whsec_x", 2000, hs256)).toBe(false);
  });
});

describe("sortedJson", () => {
  it("sorts keys at every level", () => {
    expect(sortedJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: "x" } })).toBe('{"a":{"c":"x","d":[{"y":2,"z":1}]},"b":1}');
  });
});

describe("paid periods", () => {
  const now = new Date("2026-10-25T10:00:00Z");
  it("starts from now when free or expired", () => {
    expect(extendPaidUntil("", now, 12)).toBe("2027-10-25T10:00:00.000Z");
    expect(extendPaidUntil("2026-01-01T00:00:00.000Z", now, 1)).toBe("2026-11-25T10:00:00.000Z");
  });
  it("stacks on top of time already paid", () => {
    expect(extendPaidUntil("2026-12-01T00:00:00.000Z", now, 12)).toBe("2027-12-01T00:00:00.000Z");
  });
  it("knows who is Pro", () => {
    expect(isPro("2026-12-01T00:00:00.000Z", now)).toBe(true);
    expect(isPro("", now)).toBe(false);
  });
});
