import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSlot } from "../src/server/actions";
import { MAX_AGE_MS, createScanCache, selfContained } from "../src/server/scans";
import { scanProject } from "../src/server/store";
import { image, presets, tempProject, writeVersion } from "./helpers";

// The kept project scans: when /api/state may reuse one, and every way one is dropped.

const projectsDir = join("C:", "work", "projects");
const a = { id: "a", path: join(projectsDir, "a") };
const b = { id: "b", path: join(projectsDir, "b") };
const outside = { id: "ext", path: join("D:", "elsewhere", "ext") };

/** A cache with a hand-moved clock and scans that count themselves. */
function setup() {
  let clock = 1_000;
  const cache = createScanCache<number>(() => clock);
  const scans = new Map<string, number>();
  const get = (p: { id: string; path: string }, keep?: (v: number) => boolean) =>
    cache.get(p.id, p.path, () => {
      const n = (scans.get(p.path) ?? 0) + 1;
      scans.set(p.path, n);
      return n;
    }, keep);
  const count = (p: { path: string }) => scans.get(p.path) ?? 0;
  cache.watching(projectsDir, true);
  return { cache, get, count, tick: (ms: number) => (clock += ms) };
}

test("a watched project is scanned once until something changes", () => {
  const { get, count } = setup();
  expect(get(a)).toBe(1);
  expect(get(a)).toBe(1);
  expect(count(a)).toBe(1);
});

test("a change inside a project drops only that project", () => {
  const { cache, get, count } = setup();
  get(a);
  get(b);
  cache.changed(projectsDir, join("a", "hero", "v1", "1.png"));
  expect(get(a)).toBe(2);
  expect(get(b)).toBe(1);
  expect(count(b)).toBe(1);
});

test("one write comes as several events; the later ones still map to its project", () => {
  const { cache, get, count } = setup();
  get(a);
  get(b);
  // What Windows reports for one result dropped into a/hero/v1.
  for (const f of [join("a", "hero", "v1", "1.png"), join("a", "hero", "v1", "1.png"), "a", join("a", "hero"), join("a", "hero", "v1")]) cache.changed(projectsDir, f);
  expect(get(a)).toBe(2);
  expect(get(b)).toBe(1);
  expect(count(b)).toBe(1);
});

test("the project folder itself changing, or a folder above it, drops it", () => {
  const { cache, get } = setup();
  get(a);
  cache.changed(projectsDir, "a");
  expect(get(a)).toBe(2);
  cache.changed(projectsDir, "");
  expect(get(a)).toBe(3);
});

test("a change the watcher cannot name, or that is in no known project, drops everything", () => {
  const { cache, get } = setup();
  get(a);
  get(b);
  cache.changed(projectsDir, null);
  expect([get(a), get(b)]).toEqual([2, 2]);
  // A stray file next to the projects, a short 8.3 name, a folder made since: none is a project the cache knows.
  cache.changed(projectsDir, "notes.txt");
  expect([get(a), get(b)]).toEqual([3, 3]);
  cache.changed(projectsDir, join("NEWPRO~1", "hero", "v1.md"));
  expect([get(a), get(b)]).toEqual([4, 4]);
  cache.changed(projectsDir, join("..", "other", "file.md"));
  expect([get(a), get(b)]).toEqual([5, 5]);
});

test("an added folder's own watcher reports paths relative to that folder", () => {
  const { cache, get } = setup();
  cache.watching(outside.path, true);
  get(outside);
  get(a);
  cache.changed(outside.path, join("hero", "v2.md"));
  expect(get(outside)).toBe(2);
  expect(get(a)).toBe(1);
});

test("an added folder inside another added folder is dropped by either watcher", () => {
  const { cache, get } = setup();
  const parent = { id: "parent", path: join("D:", "work") };
  const child = { id: "child", path: join("D:", "work", "child") };
  cache.watching(parent.path, true);
  cache.watching(child.path, true);
  get(parent);
  get(child);
  cache.changed(parent.path, join("child", "hero", "v1.md"));
  expect([get(parent), get(child)]).toEqual([2, 2]);
});

test("an API call drops the project it changed", () => {
  const { cache, get } = setup();
  get(a);
  get(b);
  cache.invalidate(a.path);
  expect([get(a), get(b)]).toEqual([2, 1]);
  cache.invalidateAll();
  expect([get(a), get(b)]).toEqual([3, 2]);
});

test("a project no watcher covers is never kept", () => {
  const { get, count } = setup();
  get(outside);
  get(outside);
  expect(count(outside)).toBe(2);
});

test("a watcher that stops drops what it covered and keeps nothing more", () => {
  const { cache, get, count } = setup();
  get(a);
  cache.watching(projectsDir, false);
  expect(get(a)).toBe(2);
  expect(get(a)).toBe(3);
  cache.watching(projectsDir, true);
  get(a);
  get(a);
  expect(count(a)).toBe(4);
});

test("a scan is not reused past its maximum age, in case a watcher event was missed", () => {
  const { get, tick } = setup();
  get(a);
  tick(MAX_AGE_MS - 1);
  expect(get(a)).toBe(1);
  tick(1);
  expect(get(a)).toBe(2);
});

test("a scan the caller says not to keep is scanned afresh each time", () => {
  const { cache, get } = setup();
  expect(get(a, () => false)).toBe(1);
  expect(get(a, () => false)).toBe(2);
  expect(cache.size).toBe(0);
});

test("the same folder under a new id is its own entry", () => {
  const { get } = setup();
  get(a);
  expect(get({ id: "a-x1y2z", path: a.path })).toBe(2);
});

test("retain forgets projects that are gone", () => {
  const { cache, get } = setup();
  get(a);
  get(b);
  cache.retain([a]);
  expect(cache.size).toBe(1);
  expect(get(b)).toBe(2);
});

test("whenNew checks a project once, again after it changed, and retries after a failure", () => {
  const { cache } = setup();
  let checks = 0;
  const check = () => checks++;
  cache.whenNew(a.id, a.path, check);
  cache.whenNew(a.id, a.path, check);
  expect(checks).toBe(1);
  // Someone deleted HOW-TO-USE.md: the watcher reports it and the next look writes it again.
  cache.changed(projectsDir, join("a", "HOW-TO-USE.md"));
  cache.whenNew(a.id, a.path, check);
  expect(checks).toBe(2);
  // A project only checked, never scanned, still counts as known to the watcher mapping.
  cache.changed(projectsDir, join("a", "hero"));
  cache.whenNew(a.id, a.path, check);
  expect(checks).toBe(3);
  expect(() =>
    cache.whenNew(b.id, b.path, () => {
      throw new Error("read-only");
    }),
  ).toThrow("read-only");
  cache.whenNew(b.id, b.path, check);
  expect(checks).toBe(4);
});

const root = tempProject();

test("a project is self-contained unless an input points outside it", () => {
  const dir = root();
  mkdirSync(join(dir, "refs"));
  writeFileSync(join(dir, "refs", "face.png"), "x");
  const slot = (name: string, inputs: string) => {
    mkdirSync(join(dir, name));
    writeVersion(dir, name, 1, `type: image\nmodel: Nano Banana Pro\ninputs:\n${inputs}`);
  };
  createSlot(dir, "plain", "", image);
  slot("hero", "  - path: refs/face.png");
  slot("banner", "  - slot: hero");
  const scan = () => scanProject("p", dir, presets);
  expect(scan().find((s) => s.name === "hero")!.versions[0]!.inputs[0]!.missing).toBeNull();
  expect(selfContained(dir, scan())).toBe(true);
  slot("logo", `  - path: ${JSON.stringify(join(dir, "..", "shared", "logo.png"))}`);
  expect(selfContained(dir, scan())).toBe(false);
});
