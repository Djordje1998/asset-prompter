import { useEffect, useState } from "react";
import { readStored, writeStored } from "./hooks";

/**
 * Remembers, in this browser, which prompt text was already copied, so a second trip to the generator
 * does not paste the same prompt twice by mistake. Keyed by the text, so a changed prompt counts as new.
 */
const COPIED_EVENT = "prompt-copied";
export const copiedKey = (project: string, slot: string, n: number) => `copied:${project}:${slot}:v${n}`;
const copiedStamp = (text: string) => `${text.length}:${hashText(text)}`;

/** Marks a prompt as copied; any Copy prompt button showing it updates. */
export function markPromptCopied(key: string, text: string): void {
  writeStored(key, copiedStamp(text));
  window.dispatchEvent(new CustomEvent(COPIED_EVENT, { detail: key }));
}

export function useCopied(key: string, text: string): boolean {
  const stamp = copiedStamp(text);
  const read = () => readStored(key) === stamp;
  const [copied, setCopied] = useState(read);
  useEffect(() => {
    setCopied(read());
    const onCopied = (e: Event) => (e as CustomEvent).detail === key && setCopied(true);
    window.addEventListener(COPIED_EVENT, onCopied);
    return () => window.removeEventListener(COPIED_EVENT, onCopied);
  }, [key, stamp]);
  return copied;
}

/** A small, stable string hash (FNV-1a); only used to tell prompt texts apart. */
function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
