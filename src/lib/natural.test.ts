import { describe, expect, it } from "vitest";
import { parseNatural } from "./natural";
import { parseScheduleTokens } from "./schedule";

// Wednesday, 2026-07-08.
const NOW = new Date(2026, 6, 8, 10);
const p = (s: string) => parseNatural(s, NOW);

describe("parseNatural", () => {
  it("reads trailing dates and times in English and Czech", () => {
    expect(p("Call mom tomorrow at 5pm")).toMatchObject({ cleaned: "Call mom", dueDate: "2026-07-09", dueTime: "17:00" });
    expect(p("Zavolat mámě zítra v 17:30")).toMatchObject({ cleaned: "Zavolat mámě", dueDate: "2026-07-09", dueTime: "17:30" });
    expect(p("Dentist next friday")).toMatchObject({ cleaned: "Dentist", dueDate: "2026-07-10" });
    expect(p("Zubař v pátek")).toMatchObject({ cleaned: "Zubař", dueDate: "2026-07-10" });
    expect(p("Taxes in 3 days").dueDate).toBe("2026-07-11");
    expect(p("Daně za týden").dueDate).toBe("2026-07-15");
    expect(p("Garden this weekend").dueDate).toBe("2026-07-11");
  });

  it("reads deadlines and the evening", () => {
    expect(p("Report by friday")).toMatchObject({ cleaned: "Report", deadline: "2026-07-10" });
    expect(p("Zpráva do pátku")).toMatchObject({ cleaned: "Zpráva", deadline: "2026-07-10" });
    expect(p("Call Petr tonight")).toMatchObject({ cleaned: "Call Petr", evening: true, dueDate: "2026-07-08" });
  });

  it("reads repeats", () => {
    expect(p("Water plants every 3 days").repeatRule).toMatchObject({ freq: "day", interval: 3 });
    expect(p("Nájem každý měsíc").repeatRule).toMatchObject({ freq: "month", interval: 1 });
    expect(p("Gym every mon and thu").repeatRule).toMatchObject({ freq: "week", weekdays: [1, 4] });
    expect(p("Úklid každé pondělí").repeatRule).toMatchObject({ freq: "week", weekdays: [1] });
    expect(p("Sync every 3rd tuesday").repeatRule).toMatchObject({ freq: "month", weekdays: [2], monthWeek: 3 });
    expect(p("Review every other week").repeatRule).toMatchObject({ freq: "week", interval: 2 });
    expect(p("Standup every weekday").repeatRule).toMatchObject({ weekdays: [1, 2, 3, 4, 5] });
    expect(p("Gym every monday").dueDate).toBe("2026-07-13");
    expect(p("Vitamins daily").dueDate).toBe("2026-07-08");
  });

  it("leaves ordinary titles alone", () => {
    expect(p("Plan every day of the trip").cleaned).toBe("Plan every day of the trip");
    expect(p("Jít do kina").cleaned).toBe("Jít do kina");
    expect(p("Buy 2").cleaned).toBe("Buy 2");
    expect(p("Tomorrow").cleaned).toBe("Tomorrow");
    expect(p("Udělat to po").cleaned).toBe("Udělat to po");
  });
});

describe("priority tokens", () => {
  it("maps ! / !! / !!! to 1–3", () => {
    expect(parseScheduleTokens("Pay rent !!!", NOW)).toMatchObject({ cleaned: "Pay rent", priority: 3 });
    expect(parseScheduleTokens("Pay rent !", NOW).priority).toBe(1);
    expect(parseScheduleTokens("Wow!", NOW).priority).toBeUndefined();
  });
});
