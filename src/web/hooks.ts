import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

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

/**
 * Takes the keyboard into a dialog as it opens, unless something in it already has it (a field with autoFocus),
 * and gives it back to what had it before once the dialog closes, so a keyboard user goes on from the button
 * that opened the dialog instead of from the top of the page. `ref` is the dialog, focusable with tabIndex -1.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>): void {
  // Read in the first render: by the time effects run, a field with autoFocus has already taken the focus.
  const [before] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    return () => {
      // Not when the focus has moved on by itself, such as to a dialog that took this one's place.
      const now = document.activeElement;
      if (before?.isConnected && (!now || now === document.body || dialog?.contains(now))) before.focus({ preventScroll: true });
    };
  }, [ref, before]);
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
/** How long a card that joined the list is marked as arriving; covers the entry animation in styles.css. */
export const ENTER_MS = 600;

export interface Shown<T> {
  key: string;
  item: T;
  /** The item is no longer in the list: shown once more, with its last data, while it animates out. */
  leaving: boolean;
  /** The item joined a list that was already on screen: it grows into place instead of appearing at once. */
  entering: boolean;
  /**
   * The item came in that way and its element is still the same one. Unlike `entering` it stays set, so the
   * styles that chose its entry keep choosing it: swapping one animation for another would play the new one.
   */
  arrived: boolean;
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
 * element gets the leaving class and its transition plays. One that joins a list already on screen is marked
 * `entering` for its entry. A change of `scope` (another project, tab or filter) drops both at once: the new
 * view comes in as a whole, nothing from the old one animates over it. So does a list filling from empty.
 */
export function useLeaving<T>(items: T[], keyOf: (item: T) => string, scope: string): Shown<T>[] {
  const previous = useRef<{ scope: string; keys: string[]; items: Map<string, T> }>({ scope, keys: [], items: new Map() });
  const leavers = useRef<Leaver<T>[]>([]);
  const enterers = useRef(new Map<string, number>());
  const arrived = useRef(new Set<string>());
  const [, tick] = useState(0);
  const keys = items.map(keyOf);
  const now = new Set(keys);
  const at = Date.now();

  const prev = previous.current;
  if (prev.scope !== scope) {
    leavers.current = [];
    enterers.current = new Map();
    arrived.current = new Set();
  } else {
    leavers.current = leavers.current.filter((x) => !now.has(x.key) && at - x.at < LEAVE_MS);
    for (const key of prev.keys) {
      if (!now.has(key) && !leavers.current.some((x) => x.key === key)) {
        leavers.current.push({ key, item: prev.items.get(key)!, index: prev.keys.indexOf(key), at });
      }
    }
    for (const [key, since] of enterers.current) if (!now.has(key) || at - since >= ENTER_MS) enterers.current.delete(key);
    if (prev.keys.length > 0) {
      const before = new Set(prev.keys);
      for (const key of keys) if (!before.has(key) && !enterers.current.has(key)) enterers.current.set(key, at);
    }
    for (const key of enterers.current.keys()) arrived.current.add(key);
    // Gone for good, exit played: its element is unmounted, and a later return is a new arrival.
    for (const key of arrived.current) if (!now.has(key) && !leavers.current.some((x) => x.key === key)) arrived.current.delete(key);
  }

  useEffect(() => {
    previous.current = { scope, keys, items: new Map(items.map((item) => [keyOf(item), item])) };
  });

  // Render once more when the first leaver has had its time, so it is dropped, or an arrival has settled.
  const due = Math.min(...leavers.current.map((x) => x.at + LEAVE_MS), ...[...enterers.current.values()].map((since) => since + ENTER_MS));
  useEffect(() => {
    if (due === Infinity) return;
    const timer = setTimeout(() => tick((n) => n + 1), Math.max(0, due - Date.now()) + 16);
    return () => clearTimeout(timer);
  }, [due]);

  const shown: Shown<T>[] = items.map((item, i) => ({ key: keys[i]!, item, leaving: false, entering: enterers.current.has(keys[i]!), arrived: arrived.current.has(keys[i]!) }));
  for (const leaver of leavers.current) {
    shown.splice(Math.min(leaver.index, shown.length), 0, { key: leaver.key, item: leaver.item, leaving: true, entering: false, arrived: arrived.current.has(leaver.key) });
  }
  return shown;
}

/** How long the others take to slide into their new places; matches the leave and entry timings in styles.css. */
const FLIP_MS = 420;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * When the order of a list changes (one joins, one is dropped after its exit, one moves), the others slide from
 * where they were to where they are now instead of jumping. The children to move carry `data-flip` with their
 * key. Where they were is read during the render, while the page still shows the last commit, and only when the
 * order changed, so a fold or an image changing a card's height between renders is never mistaken for a move.
 */
export function useFlip(container: RefObject<HTMLElement | null>, keys: string[], scope: string): void {
  const last = useRef({ scope, order: keys.join("|") });
  const before = useRef<Map<string, DOMRect> | null>(null);
  const order = keys.join("|");
  before.current = null;
  if (last.current.scope === scope && last.current.order !== order && container.current && !reducedMotion()) {
    before.current = new Map();
    for (const el of container.current.querySelectorAll<HTMLElement>(":scope > [data-flip]")) {
      before.current.set(el.dataset.flip!, el.getBoundingClientRect());
    }
  }
  useLayoutEffect(() => {
    last.current = { scope, order };
    const was = before.current;
    before.current = null;
    if (!was || !container.current) return;
    for (const el of container.current.querySelectorAll<HTMLElement>(":scope > [data-flip]")) {
      const from = was.get(el.dataset.flip!);
      if (!from) continue;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      // Added on top of whatever the element is doing, such as its own exit, rather than replacing it.
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
        duration: FLIP_MS,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        composite: "add",
      });
    }
  });
}
