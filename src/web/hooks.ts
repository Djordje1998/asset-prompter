import { type RefObject, useEffect, useRef, useState } from "react";

/**
 * Escape closes only the layer on top: a popover before the dialog it sits in, a lightbox before the
 * dialog that opened it. Layers register in the order they open, and one key listener serves them all.
 */
const layers: { current: () => void }[] = [];

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || layers.length === 0) return;
  e.preventDefault();
  layers.at(-1)!.current();
});

export function useEscape(onEscape: () => void, active = true): void {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const layer = { current: () => handler.current() };
    layers.push(layer);
    return () => {
      layers.splice(layers.indexOf(layer), 1);
    };
  }, [active]);
}

/** Closes a menu or popover on Escape and on a click outside `ref`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEscape(close, open);
  const handler = useRef(close);
  handler.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) handler.current();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, ref]);
}

/** localStorage that fails quietly: private windows may refuse it, and then a choice lasts for this visit only. */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // See readStored.
  }
}

/** How long a card that left the list stays on screen for its exit; matches the transition in styles.css. */
export const LEAVE_MS = 480;

export interface Shown<T> {
  key: string;
  item: T;
  /** The item is no longer in the list: shown once more, with its last data, while it animates out. */
  leaving: boolean;
}

interface Leaver<T> {
  key: string;
  item: T;
  index: number;
  at: number;
}

/**
 * The items to render so that one which left the list (filtered out, moved to Done, deleted) is still drawn
 * for a moment with `leaving` set, where it was, and goes only after its exit has played. The leavers are
 * worked out during the render itself, so their elements are never unmounted and mounted again: the same
 * element gets the leaving class and its transition plays. A change of `scope` (another project or tab)
 * drops the leavers at once: nothing from the old list should animate over the new one.
 */
export function useLeaving<T>(items: T[], keyOf: (item: T) => string, scope: string): Shown<T>[] {
  const previous = useRef<{ scope: string; keys: string[]; items: Map<string, T> }>({ scope, keys: [], items: new Map() });
  const leavers = useRef<Leaver<T>[]>([]);
  const [, tick] = useState(0);
  const keys = items.map(keyOf);
  const now = new Set(keys);
  const at = Date.now();

  const prev = previous.current;
  if (prev.scope !== scope) leavers.current = [];
  else {
    leavers.current = leavers.current.filter((x) => !now.has(x.key) && at - x.at < LEAVE_MS);
    for (const key of prev.keys) {
      if (!now.has(key) && !leavers.current.some((x) => x.key === key)) {
        leavers.current.push({ key, item: prev.items.get(key)!, index: prev.keys.indexOf(key), at });
      }
    }
  }

  useEffect(() => {
    previous.current = { scope, keys, items: new Map(items.map((item) => [keyOf(item), item])) };
  });

  // Render once more when the oldest leaver has had its time, so it is dropped.
  const oldest = leavers.current.reduce((m, x) => Math.min(m, x.at), Infinity);
  useEffect(() => {
    if (oldest === Infinity) return;
    const timer = setTimeout(() => tick((n) => n + 1), Math.max(0, LEAVE_MS - (Date.now() - oldest)) + 16);
    return () => clearTimeout(timer);
  }, [oldest]);

  const shown: Shown<T>[] = items.map((item, i) => ({ key: keys[i]!, item, leaving: false }));
  for (const leaver of leavers.current) {
    shown.splice(Math.min(leaver.index, shown.length), 0, { key: leaver.key, item: leaver.item, leaving: true });
  }
  return shown;
}
