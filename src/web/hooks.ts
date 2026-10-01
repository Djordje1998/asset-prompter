import { type RefObject, useEffect, useRef } from "react";

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
