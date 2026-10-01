import { afterEach, beforeEach } from "bun:test";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VersionMeta } from "../src/shared/types";
import { loadPresets } from "../src/server/preset";
import { scanProject } from "../src/server/store";

// Shared by the test files: a fresh project folder per test, built the same way store.test.ts does.

export const presets = loadPresets(join(import.meta.dir, "../presets"));

/** Registers a temp project folder for every test in the file; call `root()` inside a test. */
export function tempProject(): () => string {
  let root = "";
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "asset-prompter-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  return () => root;
}

export const image = { tool: "google-flow", type: "image", model: "Nano Banana Pro", aspect_ratio: "16:9", prompt: "A red kite over a grey sea." };
export const png = (name = "result.png", bytes = [1, 2, 3]) => new File([new Uint8Array(bytes)], name, { type: "image/png" });
export const findSlot = (root: string, name = "hero") => scanProject("p", root, presets).find((s) => s.name === name)!;

/** Moves a file into the past so "modified after" comparisons do not depend on timing. */
export const age = (path: string, secondsAgo: number) => {
  const at = new Date(Date.now() - secondsAgo * 1000);
  utimesSync(path, at, at);
};

export const writeReview = (root: string, name: string, n: number, verdict: string, extra = "", secondsAgo = 0) => {
  const path = join(root, name, `v${n}.review.md`);
  writeFileSync(path, `---\nverdict: ${verdict}\n${extra}---\n\nLooks right.\n`);
  age(path, secondsAgo);
};

/** A version file written by hand, the way an agent writes one. */
export const writeVersion = (root: string, name: string, n: number, frontmatter: string, prompt = "The kite climbs.") =>
  writeFileSync(join(root, name, `v${n}.md`), `---\n${frontmatter.trim()}\n---\n\n${prompt}\n`);

export const meta = (fields: Partial<VersionMeta> = {}): VersionMeta => ({
  tool: null,
  type: null,
  model: null,
  mode: null,
  aspect_ratio: null,
  duration: null,
  resolution: null,
  changes: null,
  params: {},
  ...fields,
});
