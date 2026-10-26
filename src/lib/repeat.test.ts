import { describe, expect, it } from "vitest";
import {
  addDaysKey,
  daysBetween,
  describeRepeat,
  nextDueAfterCompletion,
  nextInstanceFields,
  nextOccurrence,
  nextStreak,
  normalizeRepeat,
} from "./repeat";
import { RepeatRule } from "@/types/todo";

const rule = (r: Partial<RepeatRule> & Pick<RepeatRule, "freq">): RepeatRule => ({
  interval: 1,
  from: "schedule",
  ...r,
});

describe("nextOccurrence — daily", () => {
  it("advances by the interval", () => {
    expect(nextOccurrence(rule({ freq: "day" }), "2026-07-28")).toBe("2026-07-29");
    expect(nextOccurrence(rule({ freq: "day", interval: 3 }), "2026-07-28")).toBe("2026-07-31");
  });

  it("rolls over a month boundary", () => {
    expect(nextOccurrence(rule({ freq: "day" }), "2026-07-31")).toBe("2026-08-01");
  });

  it("rolls over a leap day", () => {
    expect(nextOccurrence(rule({ freq: "day" }), "2028-02-28")).toBe("2028-02-29");
  });
});

describe("nextOccurrence — weekly", () => {
  it("adds whole weeks when no weekdays are named", () => {
    expect(nextOccurrence(rule({ freq: "week" }), "2026-07-28")).toBe("2026-08-04");
    expect(nextOccurrence(rule({ freq: "week", interval: 2 }), "2026-07-28")).toBe("2026-08-11");
  });

  it("finds the next named weekday", () => {
    // 2026-07-28 is a Tuesday; next Thursday is the 30th.
    expect(nextOccurrence(rule({ freq: "week", weekdays: [4] }), "2026-07-28")).toBe("2026-07-30");
  });

  it("wraps to next week when the named day already passed", () => {
    // Tuesday → next Monday is 2026-08-03.
    expect(nextOccurrence(rule({ freq: "week", weekdays: [1] }), "2026-07-28")).toBe("2026-08-03");
  });

  it("walks a multi-day weekday set in order", () => {
    const r = rule({ freq: "week", weekdays: [1, 3, 5] }); // Mon, Wed, Fri
    expect(nextOccurrence(r, "2026-07-27")).toBe("2026-07-29"); // Mon → Wed
    expect(nextOccurrence(r, "2026-07-29")).toBe("2026-07-31"); // Wed → Fri
    expect(nextOccurrence(r, "2026-07-31")).toBe("2026-08-03"); // Fri → Mon
  });

  it("skips intervening weeks when interval > 1", () => {
    // Every 2 weeks on Monday, from Monday 2026-07-27 → 2026-08-10.
    const r = rule({ freq: "week", interval: 2, weekdays: [1] });
    expect(nextOccurrence(r, "2026-07-27")).toBe("2026-08-10");
  });

  it("never returns the day it started on", () => {
    const r = rule({ freq: "week", weekdays: [2] }); // Tuesday
    expect(nextOccurrence(r, "2026-07-28")).toBe("2026-08-04");
  });
});

describe("nextOccurrence — monthly and yearly", () => {
  it("keeps the day of month", () => {
    expect(nextOccurrence(rule({ freq: "month" }), "2026-07-15")).toBe("2026-08-15");
    expect(nextOccurrence(rule({ freq: "month", interval: 3 }), "2026-07-15")).toBe("2026-10-15");
  });

  it("clamps to the end of a shorter month", () => {
    expect(nextOccurrence(rule({ freq: "month" }), "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence(rule({ freq: "month" }), "2026-03-31")).toBe("2026-04-30");
  });

  it("crosses the year boundary", () => {
    expect(nextOccurrence(rule({ freq: "month" }), "2026-12-10")).toBe("2027-01-10");
  });

  it("advances years and clamps Feb 29", () => {
    expect(nextOccurrence(rule({ freq: "year" }), "2026-07-28")).toBe("2027-07-28");
    expect(nextOccurrence(rule({ freq: "year" }), "2028-02-29")).toBe("2029-02-28");
  });
});

describe("nextDueAfterCompletion", () => {
  it("anchors to the schedule so a weekly task keeps its weekday", () => {
    // Planned Monday 2026-07-27, ticked off Wednesday 2026-07-29.
    const r = rule({ freq: "week", weekdays: [1] });
    expect(nextDueAfterCompletion(r, "2026-07-27", "2026-07-29")).toBe("2026-08-03");
  });

  it("anchors to completion when the rule says so", () => {
    const r = rule({ freq: "day", interval: 3, from: "completion" });
    expect(nextDueAfterCompletion(r, "2026-07-20", "2026-07-28")).toBe("2026-07-31");
  });

  it("does not resurrect a backlog of missed daily instances", () => {
    // Daily task planned a week ago, ticked today → next is tomorrow, not
    // seven overdue copies.
    const r = rule({ freq: "day" });
    expect(nextDueAfterCompletion(r, "2026-07-21", "2026-07-28")).toBe("2026-07-29");
  });

  it("falls back to completion when the instance had no planned date", () => {
    const r = rule({ freq: "week" });
    expect(nextDueAfterCompletion(r, null, "2026-07-28")).toBe("2026-08-04");
  });
});

describe("date key helpers", () => {
  it("shifts by whole days across month and year ends", () => {
    expect(addDaysKey("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-07-27", "2026-08-03")).toBe(7);
    expect(daysBetween("2026-08-03", "2026-07-27")).toBe(-7);
    expect(daysBetween("2026-07-27", "2026-07-27")).toBe(0);
  });
});

describe("nextInstanceFields", () => {
  it("returns null for a non-repeating to-do", () => {
    expect(nextInstanceFields({ repeatRule: null, dueDate: "2026-07-28" }, "2026-07-28")).toBeNull();
  });

  it("schedules the next instance and files it correctly", () => {
    const next = nextInstanceFields(
      { repeatRule: rule({ freq: "week", weekdays: [1] }), dueDate: "2026-07-27" },
      "2026-07-27",
    );
    expect(next?.dueDate).toBe("2026-08-03");
    expect(next?.list).toBe("anytime"); // future → hibernates until Upcoming
  });

  it("files an instance due today into Today", () => {
    const next = nextInstanceFields(
      { repeatRule: rule({ freq: "day", from: "completion" }), dueDate: null },
      "2026-07-27",
    );
    expect(next?.dueDate).toBe("2026-07-28");
    expect(next?.list).toBe("anytime");
  });

  it("carries the deadline forward keeping its lead time", () => {
    const next = nextInstanceFields(
      {
        repeatRule: rule({ freq: "week", weekdays: [1] }),
        dueDate: "2026-07-27",
        deadline: "2026-07-31", // 4 days after the scheduled day
      },
      "2026-07-27",
    );
    expect(next?.dueDate).toBe("2026-08-03");
    expect(next?.deadline).toBe("2026-08-07");
  });

  it("resets checklist items", () => {
    const next = nextInstanceFields(
      {
        repeatRule: rule({ freq: "day" }),
        dueDate: "2026-07-27",
        checklist: [
          { id: "1", text: "Soap", done: true },
          { id: "2", text: "Rinse", done: true },
        ],
      },
      "2026-07-27",
    );
    expect(next?.checklist).toEqual([
      { id: "1", text: "Soap", done: false },
      { id: "2", text: "Rinse", done: false },
    ]);
  });
});

describe("normalizeRepeat", () => {
  it("clamps a nonsense interval to at least 1", () => {
    expect(normalizeRepeat(rule({ freq: "day", interval: 0 })).interval).toBe(1);
    expect(normalizeRepeat(rule({ freq: "day", interval: -5 })).interval).toBe(1);
  });

  it("sorts and filters weekdays", () => {
    const r = normalizeRepeat(rule({ freq: "week", weekdays: [5, 1, 9, -2, 3] }));
    expect(r.weekdays).toEqual([1, 3, 5]);
  });

  it("drops weekdays for non-weekly rules", () => {
    expect(normalizeRepeat(rule({ freq: "month", weekdays: [1] })).weekdays).toBeUndefined();
  });
});

describe("describeRepeat", () => {
  it("reads naturally", () => {
    expect(describeRepeat(rule({ freq: "day" }))).toBe("Every day");
    expect(describeRepeat(rule({ freq: "day", interval: 2 }))).toBe("Every 2 days");
    expect(describeRepeat(rule({ freq: "week", weekdays: [1, 3] }))).toBe("Every Mon, Wed");
    expect(describeRepeat(rule({ freq: "week", interval: 2, weekdays: [5] }))).toBe(
      "Every 2 weeks on Fri",
    );
    expect(describeRepeat(rule({ freq: "month" }))).toBe("Every month");
    expect(describeRepeat(rule({ freq: "year", interval: 2 }))).toBe("Every 2 years");
  });

  it("mentions completion anchoring", () => {
    expect(describeRepeat(rule({ freq: "day", interval: 3, from: "completion" }))).toBe(
      "Every 3 days, after completion",
    );
  });
});

describe("nextStreak", () => {
  it("extends the run when ticked on or before the planned day", () => {
    expect(nextStreak(3, "2026-08-07", "2026-08-07")).toBe(4);
    expect(nextStreak(3, "2026-08-08", "2026-08-07")).toBe(4);
  });

  it("starts over after a late tick", () => {
    expect(nextStreak(9, "2026-08-05", "2026-08-07")).toBe(1);
  });

  it("counts an unplanned instance as on time and treats a missing run as zero", () => {
    expect(nextStreak(null, null, "2026-08-07")).toBe(1);
  });
});

describe("monthly nth weekday", () => {
  const rule: RepeatRule = { freq: "month", interval: 1, weekdays: [2], monthWeek: 3, from: "schedule" };
  it("finds this month's 3rd Tuesday when it is still ahead", () => {
    expect(nextOccurrence(rule, "2026-10-01")).toBe("2026-10-20");
  });
  it("jumps to next month once it has passed", () => {
    expect(nextOccurrence(rule, "2026-10-20")).toBe("2026-11-17");
  });
  it("handles the last weekday of the month", () => {
    expect(nextOccurrence({ ...rule, weekdays: [5], monthWeek: -1 }, "2026-10-30")).toBe("2026-11-27");
  });
  it("describes itself", () => {
    expect(describeRepeat(rule)).toBe("Every 3rd Tue");
  });
});
