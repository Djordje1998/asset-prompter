import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addCandidates, addVersion, createSlot, deleteCandidate, setApproval, setFeedback, setSelected, trashSlot } from "../src/server/actions";
import { loadPresets } from "../src/server/preset";
import { scanProject } from "../src/server/store";

const presets = loadPresets(join(import.meta.dir, "../presets"));
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "asset-prompter-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const image = { tool: "google-flow", type: "image", model: "Nano Banana Pro", aspect_ratio: "16:9", prompt: "A red kite over a grey sea." };
const png = (name = "result.png") => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
const slot = (name = "hero") => scanProject("p", root, presets).find((s) => s.name === name)!;

test("a slot moves through every status as files appear", async () => {
  createSlot(root, "hero", "Landing page background.", image);
  expect(slot().status).toBe("waiting_generation");
  expect(slot().description).toBe("Landing page background.");
  expect(slot().versions[0]!.errors).toEqual([]);
  expect(slot().versions[0]!.warnings).toEqual([]);

  await addCandidates(root, "hero", 1, [png()]);
  expect(slot().status).toBe("waiting_review");
  expect(slot().versions[0]!.selected).toBe("1.png");

  setFeedback(root, "hero", 1, "Sea is too dark.");
  expect(slot().status).toBe("waiting_agent");

  expect(addVersion(root, "hero", { ...image, prompt: "A red kite over a bright sea.", changes: "Brighter sea." })).toBe(2);
  expect(slot().status).toBe("waiting_generation");

  await addCandidates(root, "hero", 2, [png()]);
  setApproval(root, "hero", 2);
  expect(slot().status).toBe("approved");
  expect(slot().approved).toBe(2);
  expect(existsSync(join(root, "hero", "final.png"))).toBe(true);
});

test("a version written after approval reopens the slot and keeps the final file", async () => {
  createSlot(root, "hero", "", image);
  await addCandidates(root, "hero", 1, [png()]);
  setApproval(root, "hero", 1);
  const past = new Date(Date.now() - 60_000);
  utimesSync(join(root, "hero", "APPROVED"), past, past);

  addVersion(root, "hero", { ...image, changes: "Another try." });
  expect(slot().status).toBe("waiting_generation");
  expect(existsSync(join(root, "hero", "final.png"))).toBe(true);
});

test("an older version can be approved while a newer one exists", async () => {
  createSlot(root, "hero", "", image);
  await addCandidates(root, "hero", 1, [png()]);
  addVersion(root, "hero", image);
  await addCandidates(root, "hero", 2, [png()]);
  setApproval(root, "hero", 1);
  expect(slot().status).toBe("approved");
  expect(slot().approved).toBe(1);
});

test("several candidates need an explicit pick before approval", async () => {
  createSlot(root, "hero", "", image);
  await addCandidates(root, "hero", 1, [png("a.png"), png("b.png")]);
  expect(slot().versions[0]!.candidates.map((c) => c.file)).toEqual(["1.png", "2.png"]);
  expect(slot().versions[0]!.selected).toBeNull();
  expect(() => setApproval(root, "hero", 1)).toThrow("Select one candidate");

  setSelected(root, "hero", 1, "2.png");
  setApproval(root, "hero", 1);
  expect(readFileSync(join(root, "hero", "APPROVED"), "utf8").trim()).toBe("v1");

  deleteCandidate(root, "hero", 1, "2.png");
  expect(slot().versions[0]!.selected).toBe("1.png");
  expect(existsSync(join(root, "_trash"))).toBe(true);
});

test("a lone candidate stays selected when more are added later", async () => {
  createSlot(root, "hero", "", image);
  await addCandidates(root, "hero", 1, [png()]);
  await addCandidates(root, "hero", 1, [png()]);
  expect(slot().versions[0]!.selected).toBe("1.png");
});

test("broken and off-preset version files are shown, not hidden", () => {
  mkdirSync(join(root, "broken"));
  writeFileSync(join(root, "broken", "v1.md"), "just a prompt, no frontmatter");
  expect(slot("broken").versions[0]!.errors[0]).toContain("No frontmatter");

  mkdirSync(join(root, "clip"));
  writeFileSync(
    join(root, "clip", "v1.md"),
    "---\ntool: google-flow\ntype: video\nmodel: Veo 3.1 Quality\nmode: ingredients\naspect_ratio: 1:1\nduration: 8\ninputs:\n  - role: ingredient\n    slot: nowhere\n---\n\nA kite.\n",
  );
  const version = slot("clip").versions[0]!;
  expect(version.errors).toEqual([]);
  expect(version.meta.duration).toBe("8s");
  expect(version.warnings.some((w) => w.includes('does not support mode "ingredients"'))).toBe(true);
  expect(version.warnings.some((w) => w.includes("Aspect ratio 1:1"))).toBe(true);
  expect(version.inputs[0]!.missing).toBe("Slot does not exist");
});

test("an input pointing at another slot resolves to that slot's chosen asset", async () => {
  createSlot(root, "still", "", image);
  mkdirSync(join(root, "clip"));
  writeFileSync(
    join(root, "clip", "v1.md"),
    "---\ntool: google-flow\ntype: video\nmodel: Veo 3.1 - Fast\nmode: frames\ninputs:\n  - role: start_frame\n    slot: still\n---\n\nThe kite climbs.\n",
  );
  expect(slot("clip").versions[0]!.inputs[0]!.missing).toBe("Not generated yet");
  await addCandidates(root, "still", 1, [png()]);
  expect(slot("clip").versions[0]!.inputs[0]!.path).toBe(join(root, "still", "v1", "1.png"));
});

test("deleting a slot moves it to _trash and out of the feed", () => {
  createSlot(root, "hero", "", image);
  trashSlot(root, "hero");
  expect(scanProject("p", root, presets)).toEqual([]);
  expect(existsSync(join(root, "hero"))).toBe(false);
});

test("a slot whose first version is rejected is not left behind", () => {
  expect(() => createSlot(root, "hero", "For the hero.", { ...image, model: "" })).toThrow("Model is required");
  expect(existsSync(join(root, "hero"))).toBe(false);
});
