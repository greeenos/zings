/**
 * Manual ordering.
 *
 * Every row carries a `sortOrder` double. Dropping an item between two
 * neighbours normally only writes ONE row — the new value is the midpoint of
 * the gap. Doubles run out of room after ~50 consecutive halvings of the same
 * gap, so when a midpoint would collide with an endpoint we fall back to
 * rewriting the whole visible list with clean, evenly-spaced values.
 *
 * Ordering lives in the database (not localStorage) so a drag on the laptop
 * shows up on the phone.
 */

export const ORDER_STEP = 1000;

interface OrderUpdate {
  id: string;
  sortOrder: number;
}

/** A value strictly between `prev` and `next`, or `null` if the gap is exhausted. */
export function orderBetween(prev: number | null, next: number | null): number | null {
  if (prev === null && next === null) return 0;
  if (prev === null) return next! - ORDER_STEP;
  if (next === null) return prev + ORDER_STEP;
  const mid = prev + (next - prev) / 2;
  if (!Number.isFinite(mid) || mid <= prev || mid >= next) return null;
  return mid;
}

/** Evenly-spaced positions for a whole list, used when a gap collapses. */
export function resequence(ids: string[], step: number = ORDER_STEP): OrderUpdate[] {
  return ids.map((id, i) => ({ id, sortOrder: i * step }));
}

/**
 * Move `activeId` to the slot `overId` currently occupies.
 *
 * `ids` is the list exactly as the user sees it. Returns the rows that need
 * writing — one on the happy path, all of them after a resequence.
 */
export function moveWithin(
  ids: string[],
  orderOf: (id: string) => number,
  activeId: string,
  overId: string,
): OrderUpdate[] {
  if (activeId === overId) return [];
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0) return [];

  const reordered = [...ids];
  reordered.splice(from, 1);
  reordered.splice(to, 0, activeId);

  const at = reordered.indexOf(activeId);
  const prevId = at > 0 ? reordered[at - 1] : null;
  const nextId = at < reordered.length - 1 ? reordered[at + 1] : null;

  const value = orderBetween(
    prevId === null ? null : orderOf(prevId),
    nextId === null ? null : orderOf(nextId),
  );

  if (value === null) return resequence(reordered);
  return [{ id: activeId, sortOrder: value }];
}

/** Position for a brand-new item that should land at the top of `existing`. */
export function orderForNewTop(existing: number[]): number {
  if (existing.length === 0) return 0;
  return Math.min(...existing) - ORDER_STEP;
}

/** Position for a brand-new item appended to the end of `existing`. */
export function orderForNewBottom(existing: number[]): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing) + ORDER_STEP;
}

/**
 * Position for an item inserted at a specific index of `orders` (already
 * sorted ascending) — the Magic Plus drop target.
 */
export function orderForInsertAt(orders: number[], index: number): number {
  const prev = index > 0 ? orders[index - 1] : null;
  const next = index < orders.length ? orders[index] : null;
  const value = orderBetween(prev ?? null, next ?? null);
  // A collapsed gap here is vanishingly rare and only costs precision on one
  // row, so nudge rather than resequencing the whole list mid-drag.
  return value ?? (prev ?? 0) + 1;
}
