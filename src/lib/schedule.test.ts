import { describe, expect, it } from "vitest";
import {
  addToClock,
  formatEstimate,
  formatTimeRange,
  parseDuration,
  parseScheduleTokens,
} from "./schedule";

// Wednesday, 2026-07-08 — fixed reference so relative dates are deterministic.
const NOW = new Date("2026-07-08T10:00:00Z");

describe("parseScheduleTokens — dates", () => {
  it("keeps a plain title untouched", () => {
    const r = parseScheduleTokens("Buy milk", NOW);
    expect(r).toEqual({ cleaned: "Buy milk", dueDate: undefined, dueTime: undefined, estimateMin: undefined });
  });

  it("parses Czech and English keywords, ignoring diacritics", () => {
    expect(parseScheduleTokens("Call Petr #dnes", NOW).dueDate).toBe("2026-07-08");
    expect(parseScheduleTokens("Call Petr #zítra", NOW).dueDate).toBe("2026-07-09");
    expect(parseScheduleTokens("Call Petr #zitra", NOW).dueDate).toBe("2026-07-09");
    expect(parseScheduleTokens("Call Petr #tomorrow", NOW).dueDate).toBe("2026-07-09");
    expect(parseScheduleTokens("Call Petr #pozítří", NOW).dueDate).toBe("2026-07-10");
  });

  it("resolves weekdays to the next strictly-future occurrence", () => {
    expect(parseScheduleTokens("x #po", NOW).dueDate).toBe("2026-07-13"); // Mon
    expect(parseScheduleTokens("x #pátek", NOW).dueDate).toBe("2026-07-10"); // Fri
    expect(parseScheduleTokens("x #st", NOW).dueDate).toBe("2026-07-15"); // today is Wed → +7
    expect(parseScheduleTokens("x #monday", NOW).dueDate).toBe("2026-07-13");
  });

  it("parses ISO and Czech numeric dates, rolling past dates to next year", () => {
    expect(parseScheduleTokens("x #2026-08-01", NOW).dueDate).toBe("2026-08-01");
    expect(parseScheduleTokens("x #15.7.", NOW).dueDate).toBe("2026-07-15");
    expect(parseScheduleTokens("x #15.6.", NOW).dueDate).toBe("2027-06-15"); // already passed this year
    expect(parseScheduleTokens("x #24.12.2026", NOW).dueDate).toBe("2026-12-24");
  });

  it("parses relative offsets", () => {
    expect(parseScheduleTokens("x #3d", NOW).dueDate).toBe("2026-07-11");
    expect(parseScheduleTokens("x #2t", NOW).dueDate).toBe("2026-07-22");
    expect(parseScheduleTokens("x #2w", NOW).dueDate).toBe("2026-07-22");
  });

  it("leaves unrecognised # tokens in place", () => {
    const r = parseScheduleTokens("Read #project docs", NOW);
    expect(r.cleaned).toBe("Read #project docs");
    expect(r.dueDate).toBeUndefined();
  });

  it("rejects impossible dates", () => {
    expect(parseScheduleTokens("x #32.1.", NOW).dueDate).toBeUndefined();
    expect(parseScheduleTokens("x #2026-13-01", NOW).dueDate).toBeUndefined();
  });

  it("uses the local calendar day rather than UTC around midnight", () => {
    const lateLocalEvening = new Date(2026, 6, 8, 23, 45);
    expect(parseScheduleTokens("x #today", lateLocalEvening).dueDate).toBe("2026-07-08");
    expect(parseScheduleTokens("x #tomorrow", lateLocalEvening).dueDate).toBe("2026-07-09");
  });
});

describe("parseScheduleTokens — times", () => {
  it("parses an exact time and defaults the date to today", () => {
    const r = parseScheduleTokens("Standup 09:30", NOW);
    expect(r.dueTime).toBe("09:30");
    expect(r.dueDate).toBe("2026-07-08");
    expect(r.estimateMin).toBeUndefined();
    expect(r.cleaned).toBe("Standup");
  });

  it("parses a time range into dueTime + derived estimate", () => {
    const r = parseScheduleTokens("Call #zítra 14:00-15:30", NOW);
    expect(r.dueDate).toBe("2026-07-09");
    expect(r.dueTime).toBe("14:00");
    expect(r.estimateMin).toBe(90);
    expect(r.cleaned).toBe("Call");
  });

  it("normalises single-digit hours", () => {
    expect(parseScheduleTokens("x 9:05", NOW).dueTime).toBe("09:05");
  });

  it("ignores invalid clock values", () => {
    const r = parseScheduleTokens("Score was 25:99", NOW);
    expect(r.dueTime).toBeUndefined();
    expect(r.cleaned).toBe("Score was 25:99");
  });
});

describe("parseScheduleTokens — durations", () => {
  it("parses minutes, hours and combinations", () => {
    expect(parseScheduleTokens("x !30m", NOW).estimateMin).toBe(30);
    expect(parseScheduleTokens("x !1h", NOW).estimateMin).toBe(60);
    expect(parseScheduleTokens("x !1h30m", NOW).estimateMin).toBe(90);
    expect(parseScheduleTokens("x !90", NOW).estimateMin).toBe(90);
    expect(parseScheduleTokens("x !45min", NOW).estimateMin).toBe(45);
  });

  it("reads bare exclamations as priority, not a duration", () => {
    const r = parseScheduleTokens("Ship it !!!", NOW);
    expect(r.estimateMin).toBeUndefined();
    expect(r).toMatchObject({ cleaned: "Ship it", priority: 3 });
  });
});

describe("parseScheduleTokens — !-prefixed clock times", () => {
  it("treats !HH:MM-HH:MM as an exact from-to range on the day", () => {
    const r = parseScheduleTokens("Meeting !20:00-20:30", NOW);
    expect(r.dueTime).toBe("20:00");
    expect(r.estimateMin).toBe(30);
    expect(r.dueDate).toBe("2026-07-08"); // no #date → today
    expect(r.cleaned).toBe("Meeting");
  });

  it("treats !HH:MM as an exact start time", () => {
    const r = parseScheduleTokens("Call !20:00", NOW);
    expect(r.dueTime).toBe("20:00");
    expect(r.estimateMin).toBeUndefined();
    expect(r.cleaned).toBe("Call");
  });

  it("combines #date with a !time range", () => {
    const r = parseScheduleTokens("Zavolat #zítra !20:00-20:30", NOW);
    expect(r.dueDate).toBe("2026-07-09");
    expect(r.dueTime).toBe("20:00");
    expect(r.estimateMin).toBe(30);
    expect(r.cleaned).toBe("Zavolat");
  });

  it("still reads !<duration> as a loose estimate (no time)", () => {
    const r = parseScheduleTokens("Task !30m", NOW);
    expect(r.estimateMin).toBe(30);
    expect(r.dueTime).toBeUndefined();
  });
});

describe("parseScheduleTokens — combined", () => {
  it("handles date + duration together, tokens in any order", () => {
    const r = parseScheduleTokens("Zavolat Petrovi #zítra !30m", NOW);
    expect(r).toEqual({
      cleaned: "Zavolat Petrovi",
      dueDate: "2026-07-09",
      dueTime: undefined,
      estimateMin: 30,
    });
    const r2 = parseScheduleTokens("!30m Zavolat #zítra Petrovi", NOW);
    expect(r2.cleaned).toBe("Zavolat Petrovi");
    expect(r2.dueDate).toBe("2026-07-09");
    expect(r2.estimateMin).toBe(30);
  });
});

describe("formatting helpers", () => {
  it("formatEstimate", () => {
    expect(formatEstimate(30)).toBe("30m");
    expect(formatEstimate(60)).toBe("1h");
    expect(formatEstimate(90)).toBe("1h30m");
  });

  it("addToClock wraps within a day", () => {
    expect(addToClock("14:00", 90)).toBe("15:30");
    expect(addToClock("23:30", 60)).toBe("00:30");
  });

  it("formatTimeRange", () => {
    expect(formatTimeRange("14:00", 30)).toBe("14:00–14:30");
    expect(formatTimeRange("14:00")).toBe("14:00");
    expect(formatTimeRange(undefined, 30)).toBeNull();
  });

  it("parseDuration edge cases", () => {
    expect(parseDuration("0m")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
  });
});
