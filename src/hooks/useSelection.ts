import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ClickModifiers {
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

/**
 * Selection + keyboard cursor for a to-do list.
 *
 * `cursor` is the row the keyboard is on (the thing arrows move); `selected`
 * is what an action applies to. A plain click collapses the selection to one
 * row, ⌘/Ctrl-click toggles a row, and Shift-click extends from the anchor —
 * the same contract as Finder, Things and every list people already know.
 */
export function useSelection(orderedIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const anchorRef = useRef<string | null>(null);

  const idsKey = orderedIds.join("\0");
  const idsRef = useRef(orderedIds);
  idsRef.current = orderedIds;

  // Rows disappear constantly here — completed, deleted, filtered out by a view
  // switch. Drop them from the selection so a later bulk action can't reach a
  // to-do the user can no longer see.
  useEffect(() => {
    const present = new Set(idsRef.current);
    setSelected((current) => {
      if (current.size === 0) return current;
      const next = new Set([...current].filter((id) => present.has(id)));
      return next.size === current.size ? current : next;
    });
    setCursor((current) => (current && present.has(current) ? current : null));
    if (anchorRef.current && !present.has(anchorRef.current)) anchorRef.current = null;
  }, [idsKey]);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  const selectOnly = useCallback((id: string) => {
    setSelected(new Set([id]));
    setCursor(id);
    anchorRef.current = id;
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setCursor(id);
    anchorRef.current = id;
  }, []);

  const extendTo = useCallback((id: string) => {
    const ids = idsRef.current;
    const anchor = anchorRef.current ?? id;
    const from = ids.indexOf(anchor);
    const to = ids.indexOf(id);
    if (from < 0 || to < 0) {
      selectOnly(id);
      return;
    }
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    setSelected(new Set(ids.slice(lo, hi + 1)));
    setCursor(id);
  }, [selectOnly]);

  /** Route a row click through the standard modifier contract. */
  const handleClick = useCallback((id: string, mods: ClickModifiers) => {
    if (mods.shiftKey) extendTo(id);
    else if (mods.metaKey || mods.ctrlKey) toggle(id);
    else selectOnly(id);
  }, [extendTo, selectOnly, toggle]);

  /** The row `delta` steps from the cursor (or the list edge when there is none), handed to `apply`. */
  const step = useCallback((delta: number, apply: (id: string) => void) => {
    const ids = idsRef.current;
    if (ids.length === 0) return null;
    const at = cursor ? ids.indexOf(cursor) : -1;
    const id = ids[at < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, at + delta))];
    apply(id);
    return id;
  }, [cursor]);

  /** Move the cursor by `delta` rows, collapsing the selection onto it. */
  const move = useCallback((delta: number) => step(delta, selectOnly), [step, selectOnly]);

  /** Shift+arrow — grow or shrink the selection from the anchor. */
  const extend = useCallback((delta: number) => step(delta, extendTo), [step, extendTo]);

  const selectAll = useCallback(() => {
    const ids = idsRef.current;
    setSelected(new Set(ids));
    if (ids.length > 0) {
      anchorRef.current = ids[0];
      setCursor((current) => current ?? ids[0]);
    }
  }, []);

  const selectedIds = useMemo(() => orderedIds.filter((id) => selected.has(id)), [orderedIds, selected]);

  return {
    selected,
    selectedIds,
    cursor,
    setCursor,
    handleClick,
    selectOnly,
    toggle,
    extendTo,
    move,
    extend,
    selectAll,
    clear,
  };
}
