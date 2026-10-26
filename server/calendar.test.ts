import { describe, expect, it } from "vitest";
import { eventsBetween } from "./calendar";

const ics = (...events: string[]) =>
  ["BEGIN:VCALENDAR", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e.trim().split("\n").map((l) => l.trim()), "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");

describe("eventsBetween", () => {
  it("reads timed and all-day events in the range", () => {
    const text = ics(
      "UID:a\nSUMMARY:Dentist\nDTSTART:20261026T090000\nDTEND:20261026T093000",
      "UID:b\nSUMMARY:Holiday\nDTSTART;VALUE=DATE:20261028\nDTEND;VALUE=DATE:20261030",
      "UID:c\nSUMMARY:Elsewhere\nDTSTART:20261201T090000\nDURATION:PT1H",
    );
    expect(eventsBetween(text, "Home", "2026-10-25", "2026-10-31")).toEqual([
      { title: "Dentist", start: "2026-10-26T09:00", end: "2026-10-26T09:30", allDay: false, calendar: "Home" },
      { title: "Holiday", start: "2026-10-28", end: "2026-10-29", allDay: true, calendar: "Home" },
    ]);
  });

  it("expands weekly BYDAY rules with COUNT and EXDATE", () => {
    const text = ics(
      "UID:r\nSUMMARY:Gym\nDTSTART:20261026T180000\nDURATION:PT1H\nRRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=4\nEXDATE:20261029T180000",
    );
    expect(eventsBetween(text, "x", "2026-10-25", "2026-11-30").map((e) => e.start)).toEqual([
      "2026-10-26T18:00", "2026-11-02T18:00", "2026-11-05T18:00",
    ]);
  });

  it("lets a moved instance replace its slot", () => {
    const text = ics(
      "UID:s\nSUMMARY:Standup\nDTSTART:20261026T090000\nDURATION:PT15M\nRRULE:FREQ=DAILY;COUNT=3",
      "UID:s\nSUMMARY:Standup (moved)\nRECURRENCE-ID:20261027T090000\nDTSTART:20261027T110000\nDURATION:PT15M",
    );
    expect(eventsBetween(text, "x", "2026-10-26", "2026-10-28").map((e) => `${e.start} ${e.title}`)).toEqual([
      "2026-10-26T09:00 Standup", "2026-10-27T11:00 Standup (moved)", "2026-10-28T09:00 Standup",
    ]);
  });

  it("converts UTC times to local time", () => {
    const text = ics("UID:u\nSUMMARY:Call\nDTSTART:20261026T080000Z\nDTEND:20261026T083000Z");
    const local = new Date(Date.UTC(2026, 9, 26, 8));
    expect(eventsBetween(text, "x", "2026-10-26", "2026-10-26")[0].start).toBe(
      `2026-10-26T${String(local.getHours()).padStart(2, "0")}:00`,
    );
  });
});
