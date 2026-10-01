import { isAbsolute, join, relative } from "node:path";
import type { Slot } from "../shared/types";

// Scanning a project reads every file in it, and every change makes each open page ask for all projects.
// So a scan is kept until something under that project changes: the watcher reports a path in it, an API
// call changed it, or the scan is old enough that a missed watcher event cannot keep it stale for long.
// When in doubt an entry is dropped: a needless rescan is slow, a stale one is wrong.

/** A backstop for watcher events that never arrive; it bounds how long a missed one can matter. */
export const MAX_AGE_MS = 30_000;

/** `path` is `root` or anywhere below it. */
const within = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/**
 * A scan reads only files in its project, except inputs that point elsewhere. Nothing watches those,
 * so a project that uses one is scanned afresh every time.
 */
export const selfContained = (root: string, slots: Slot[]) =>
  slots.every((s) => s.versions.every((v) => v.inputs.every((i) => i.fromSlot || i.path === null || within(root, i.path))));

interface Entry<T> {
  path: string;
  value: T;
  at: number;
}

export function createScanCache<T>(now: () => number = Date.now) {
  const entries = new Map<string, Entry<T>>();
  /** Projects whose HOW-TO-USE.md was checked since they last changed, by the same key as entries. */
  const seen = new Map<string, string>();
  /** Every project asked about, kept or not: one change comes as several events, and the later ones must still map. */
  const known = new Map<string, string>();
  /** Folders a live watcher covers; only projects inside one are kept, since nothing else would drop them. */
  const watched = new Set<string>();
  // The id is part of the key: the scan's file URLs carry it, and an added folder's id can change.
  const keyOf = (id: string, path: string) => `${id}\n${path}`;

  const drop = (matches: (path: string) => boolean) => {
    for (const [key, e] of entries) if (matches(e.path)) entries.delete(key);
    for (const [key, path] of seen) if (matches(path)) seen.delete(key);
  };
  const invalidate = (path: string) => drop((p) => within(p, path) || within(path, p));
  const invalidateAll = () => drop(() => true);

  return {
    get(id: string, path: string, scan: () => T, keep: (value: T) => boolean = () => true): T {
      const key = keyOf(id, path);
      known.set(key, path);
      const hit = entries.get(key);
      if (hit && now() - hit.at < MAX_AGE_MS) return hit.value;
      // Taken before scanning, so the age errs on the old side. The scan is synchronous: a watcher
      // event for a write made while it ran is handled after it and drops what it stored.
      const at = now();
      const value = scan();
      if ([...watched].some((root) => within(root, path)) && keep(value)) entries.set(key, { path, value, at });
      else entries.delete(key);
      return value;
    },

    /** Runs `check` the first time a project is looked at, and again after it changed. A throw retries next time. */
    whenNew(id: string, path: string, check: () => void): void {
      const key = keyOf(id, path);
      known.set(key, path);
      if (seen.has(key)) return;
      check();
      seen.set(key, path);
    },

    /**
     * The watcher on `root` reported `filename` (relative to it; null when the system could not say,
     * e.g. after its buffer overflowed). A path that is in no known project drops everything.
     */
    changed(root: string, filename: string | null): void {
      if (filename === null) return invalidateAll();
      const path = join(root, String(filename));
      const mapped = [...known.values()].some((p) => within(p, path) || within(path, p));
      if (!within(root, path) || !mapped) return invalidateAll();
      invalidate(path);
    },

    invalidate,
    invalidateAll,

    /** A watcher on `root` started, or stopped (closed or failed); what it covered is no longer kept. */
    watching(root: string, on: boolean): void {
      if (on) watched.add(root);
      else {
        watched.delete(root);
        invalidate(root);
      }
    },

    /** Forgets projects that are gone, so removed and renamed folders do not pile up. */
    retain(projects: { id: string; path: string }[]): void {
      const keys = new Set(projects.map((p) => keyOf(p.id, p.path)));
      for (const key of entries.keys()) if (!keys.has(key)) entries.delete(key);
      for (const key of seen.keys()) if (!keys.has(key)) seen.delete(key);
      for (const key of known.keys()) if (!keys.has(key)) known.delete(key);
    },

    /** For tests: how many scans are kept. */
    get size() {
      return entries.size;
    },
  };
}

/** The server's one cache of project scans, fed by the watchers in live.ts and the API in routes.ts. */
export const projectScans = createScanCache<Slot[]>();
