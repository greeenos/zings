import { describe, expect, it } from "vitest";
import {
  ORDER_STEP,
  moveWithin,
  orderBetween,
  orderForInsertAt,
  orderForNewBottom,
  orderForNewTop,
  resequence,
} from "./order";

describe("orderBetween", () => {
  it("returns the midpoint of a healthy gap", () => {
    expect(orderBetween(0, 1000)).toBe(500);
  });

  it("extends past the ends of the list", () => {
    expect(orderBetween(null, 0)).toBe(-ORDER_STEP);
    expect(orderBetween(0, null)).toBe(ORDER_STEP);
    expect(orderBetween(null, null)).toBe(0);
  });

  it("reports an exhausted gap instead of returning a colliding value", () => {
    // 1 + EPSILON is the next representable double above 1, so no midpoint exists.
    expect(orderBetween(1, 1 + Number.EPSILON)).toBeNull();
    expect(orderBetween(5, 5)).toBeNull();
    expect(orderBetween(5, 4)).toBeNull();
  });

  it("survives ~50 consecutive halvings against a fixed lower bound", () => {
    const lo = 1;
    let hi = 2;
    let steps = 0;
    for (; steps < 200; steps++) {
      const mid = orderBetween(lo, hi);
      if (mid === null) break;
      hi = mid;
    }
    expect(steps).toBeGreaterThan(40);
    expect(steps).toBeLessThan(60);
    expect(orderBetween(lo, hi)).toBeNull();
  });
});

describe("moveWithin", () => {
  const orders: Record<string, number> = { a: 0, b: 1000, c: 2000, d: 3000 };
  const orderOf = (id: string) => orders[id];
  const ids = ["a", "b", "c", "d"];

  it("writes a single row when dragging downwards", () => {
    // Dropping `a` onto `c` displaces `c` upwards, so `a` lands between c and d.
    const updates = moveWithin(ids, orderOf, "a", "c");
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe("a");
    expect(updates[0].sortOrder).toBeGreaterThan(2000);
    expect(updates[0].sortOrder).toBeLessThan(3000);
  });

  it("writes a single row when dragging upwards", () => {
    // Dropping `d` onto `b` pushes `b` down, so `d` lands between a and b.
    const updates = moveWithin(ids, orderOf, "d", "b");
    expect(updates).toHaveLength(1);
    expect(updates[0].sortOrder).toBeGreaterThan(0);
    expect(updates[0].sortOrder).toBeLessThan(1000);
  });

  it("moves to the very top without needing a neighbour above", () => {
    const updates = moveWithin(ids, orderOf, "c", "a");
    expect(updates[0].sortOrder).toBeLessThan(0);
  });

  it("resequences the whole list when the gap is exhausted", () => {
    const tight: Record<string, number> = { a: 0, b: 1, c: 1 + Number.EPSILON, d: 2 };
    const updates = moveWithin(["a", "b", "c", "d"], (id) => tight[id], "d", "c");
    expect(updates).toHaveLength(4);
    const values = updates.map((u) => u.sortOrder);
    expect([...values].sort((x, y) => x - y)).toEqual(values);
  });

  it("is a no-op for unknown ids or a self-drop", () => {
    expect(moveWithin(ids, orderOf, "a", "a")).toEqual([]);
    expect(moveWithin(ids, orderOf, "zz", "a")).toEqual([]);
  });

  it("keeps the resulting visual order consistent", () => {
    const updates = moveWithin(ids, orderOf, "a", "c");
    const next = { ...orders };
    updates.forEach((u) => (next[u.id] = u.sortOrder));
    const sorted = [...ids].sort((x, y) => next[x] - next[y]);
    expect(sorted).toEqual(["b", "c", "a", "d"]);
  });
});

describe("resequence", () => {
  it("spaces ids evenly from zero", () => {
    expect(resequence(["x", "y", "z"])).toEqual([
      { id: "x", sortOrder: 0 },
      { id: "y", sortOrder: ORDER_STEP },
      { id: "z", sortOrder: 2 * ORDER_STEP },
    ]);
  });
});

describe("new-item positions", () => {
  it("puts a new item above everything", () => {
    expect(orderForNewTop([0, 1000])).toBe(-ORDER_STEP);
    expect(orderForNewTop([])).toBe(0);
  });

  it("puts a new item below everything", () => {
    expect(orderForNewBottom([0, 1000])).toBe(2000);
    expect(orderForNewBottom([])).toBe(0);
  });

  it("inserts at an arbitrary index for the Magic Plus drop", () => {
    const orders = [0, 1000, 2000];
    expect(orderForInsertAt(orders, 0)).toBeLessThan(0);
    expect(orderForInsertAt(orders, 3)).toBeGreaterThan(2000);
    const mid = orderForInsertAt(orders, 1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1000);
  });
});
