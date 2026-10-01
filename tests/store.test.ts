import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addResults, addVersion, createSlot, deleteResult, setApproval, setChangeRequest, setSelected, trashSlot } from "../src/server/actions";
import { recordInputs } from "../src/server/analysis";
import { resultChecks } from "../src/server/media";
import { loadPresets } from "../src/server/preset";
import { mediaKind, mediaKindOfExt, scanProject } from "../src/server/store";

const presets = loadPresets(join(import.meta.dir, "../presets"));
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "asset-prompter-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const image = { tool: "google-flow", type: "image", model: "Nano Banana Pro", aspect_ratio: "16:9", prompt: "A red kite over a grey sea." };
const png = (name = "result.png") => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
const slot = (name = "hero") => scanProject("p", root, presets).find((s) => s.name === name)!;
const review = (name: string, n: number, verdict: string, extra = "", secondsAgo = 0) => {
  const path = join(root, name, `v${n}.review.md`);
  writeFileSync(path, `---\nverdict: ${verdict}\n${extra}---\n\nLooks right.\n`);
  const at = new Date(Date.now() - secondsAgo * 1000);
  utimesSync(path, at, at);
};
/** Moves a file into the past so "modified after" comparisons do not depend on timing. */
const age = (path: string, secondsAgo: number) => {
  const at = new Date(Date.now() - secondsAgo * 1000);
  utimesSync(path, at, at);
};

test("a slot moves through every status as files appear", async () => {
  createSlot(root, "hero", "Landing page background.", image);
  expect(slot().status).toBe("waiting_generation");
  expect(slot().description).toBe("Landing page background.");
  expect(slot().versions[0]!.errors).toEqual([]);
  expect(slot().versions[0]!.warnings).toEqual([]);

  await addResults(root, "hero", 1, [png()]);
  age(join(root, "hero", "v1", "1.png"), 60);
  expect(slot().status).toBe("waiting_agent");
  expect(slot().versions[0]!.selected).toBe("1.png");

  review("hero", 1, "revise", "", 30);
  expect(slot().status).toBe("waiting_agent");

  expect(addVersion(root, "hero", { ...image, prompt: "A red kite over a bright sea.", changes: "Brighter sea." })).toBe(2);
  expect(slot().status).toBe("waiting_generation");

  await addResults(root, "hero", 2, [png()]);
  age(join(root, "hero", "v2", "1.png"), 60);
  review("hero", 2, "approve", "", 30);
  expect(slot().status).toBe("waiting_review");
  expect(slot().versions[1]!.review?.verdict).toBe("approve");

  setApproval(root, "hero", 2);
  expect(slot().status).toBe("approved");
  expect(slot().approved).toBe(2);
  expect(existsSync(join(root, "hero", "final.png"))).toBe(true);
});

test("a version written after approval reopens the slot and keeps the final file", async () => {
  createSlot(root, "hero", "", image);
  await addResults(root, "hero", 1, [png()]);
  setApproval(root, "hero", 1);
  const past = new Date(Date.now() - 60_000);
  utimesSync(join(root, "hero", "APPROVED"), past, past);

  addVersion(root, "hero", { ...image, changes: "Another try." });
  expect(slot().status).toBe("waiting_generation");
  expect(existsSync(join(root, "hero", "final.png"))).toBe(true);
});

test("an older version can be approved while a newer one exists", async () => {
  createSlot(root, "hero", "", image);
  await addResults(root, "hero", 1, [png()]);
  addVersion(root, "hero", image);
  await addResults(root, "hero", 2, [png()]);
  setApproval(root, "hero", 1);
  expect(slot().status).toBe("approved");
  expect(slot().approved).toBe(1);
});

test("several results need an explicit pick before approval", async () => {
  createSlot(root, "hero", "", image);
  await addResults(root, "hero", 1, [png("a.png"), png("b.png")]);
  expect(slot().versions[0]!.results.map((c) => c.file)).toEqual(["1.png", "2.png"]);
  expect(slot().versions[0]!.selected).toBeNull();
  expect(() => setApproval(root, "hero", 1)).toThrow("Select one candidate");

  setSelected(root, "hero", 1, "2.png");
  setApproval(root, "hero", 1);
  expect(readFileSync(join(root, "hero", "APPROVED"), "utf8").trim()).toBe("v1");

  deleteResult(root, "hero", 1, "2.png");
  expect(slot().versions[0]!.selected).toBe("1.png");
  expect(existsSync(join(root, "_trash"))).toBe(true);
});

test("adding results never picks for the human, and removing a picked file drops the pick", async () => {
  createSlot(root, "hero", "", image);
  await addResults(root, "hero", 1, [png()]);
  await addResults(root, "hero", 1, [png()]);
  expect(slot().versions[0]!.selected).toBeNull();
  expect(existsSync(join(root, "hero", "v1", "selected.txt"))).toBe(false);

  setSelected(root, "hero", 1, "1.png");
  deleteResult(root, "hero", 1, "1.png");
  expect(existsSync(join(root, "hero", "v1", "selected.txt"))).toBe(false);
  expect(slot().versions[0]!.selected).toBe("2.png");
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

  createSlot(root, "wordy", "", { ...image, changes: Array(25).fill("word").join(" ") });
  addVersion(root, "wordy", { ...image, changes: Array(35).fill("word").join(" ") });
  expect(slot("wordy").versions[0]!.warnings).toEqual([]);
  expect(slot("wordy").versions[1]!.warnings[0]).toContain("35 words");
});

test("an input pointing at another slot resolves to that slot's chosen asset", async () => {
  createSlot(root, "still", "", image);
  mkdirSync(join(root, "clip"));
  writeFileSync(
    join(root, "clip", "v1.md"),
    "---\ntool: google-flow\ntype: video\nmodel: Veo 3.1 - Fast\nmode: frames\ninputs:\n  - role: start_frame\n    slot: still\n---\n\nThe kite climbs.\n",
  );
  expect(slot("clip").versions[0]!.inputs[0]!.missing).toBe("Not generated yet");
  await addResults(root, "still", 1, [png()]);
  expect(slot("clip").versions[0]!.inputs[0]!.path).toBe(join(root, "still", "v1", "1.png"));
  expect(slot("clip").status).toBe("waiting_input");
  expect(slot("clip").waitingFor).toEqual(["still"]);
  setApproval(root, "still", 1);
  expect(slot("clip").status).toBe("waiting_generation");
  expect(slot("clip").waitingFor).toEqual([]);
});

test("files in exports/ are listed as the slot's variants, not as results", async () => {
  createSlot(root, "hero", "", image);
  await addResults(root, "hero", 1, [png()]);
  mkdirSync(join(root, "hero", "exports"));
  writeFileSync(join(root, "hero", "exports", "hero-32.png"), new Uint8Array([1]));
  writeFileSync(join(root, "hero", "exports", "hero.svg"), "<svg/>");
  writeFileSync(join(root, "hero", "exports", "notes.txt"), "not media");
  expect(slot().variants.map((e) => e.file)).toEqual(["hero-32.png", "hero.svg"]);
  expect(slot().versions).toHaveLength(1);
  expect(slot().versions[0]!.results).toHaveLength(1);
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

test("a change request or a new result after the agent's review hands the slot back to the agent", async () => {
  createSlot(root, "hero", "", image);
  await addResults(root, "hero", 1, [png()]);
  age(join(root, "hero", "v1", "1.png"), 120);
  review("hero", 1, "approve", "", 60);
  expect(slot().status).toBe("waiting_review");

  // A change request rejects the result: it stays with the agent until the next version exists.
  setChangeRequest(root, "hero", 1, "The kite is too small.");
  expect(slot().status).toBe("waiting_agent");
  review("hero", 1, "approve");
  expect(slot().status).toBe("waiting_agent");

  setChangeRequest(root, "hero", 1, "");
  expect(slot().status).toBe("waiting_review");

  age(join(root, "hero", "v1.review.md"), 10);
  await addResults(root, "hero", 1, [png()]);
  expect(slot().status).toBe("waiting_agent");
});

test("a review file with a bad verdict is shown and keeps the slot with the agent", async () => {
  createSlot(root, "hero", "", image);
  await addResults(root, "hero", 1, [png()]);
  age(join(root, "hero", "v1", "1.png"), 60);
  review("hero", 1, "maybe");
  expect(slot().versions[0]!.review?.errors[0]).toContain("verdict");
  expect(slot().status).toBe("waiting_agent");
});

test("the agent's pick stands in until the human picks, and approving it makes it the human's", async () => {
  createSlot(root, "hero", "", image);
  await addResults(root, "hero", 1, [png(), png()]);
  review("hero", 1, "approve", "pick: 2.png\n");
  expect(slot().versions[0]!.selected).toBe("2.png");
  expect(slot().versions[0]!.selectedBy).toBe("agent");

  setSelected(root, "hero", 1, "1.png");
  expect(slot().versions[0]!.selectedBy).toBe("human");
  expect(slot().versions[0]!.selected).toBe("1.png");

  rmSync(join(root, "hero", "v1", "selected.txt"));
  setApproval(root, "hero", 1);
  expect(readFileSync(join(root, "hero", "v1", "selected.txt"), "utf8").trim()).toBe("2.png");
  expect(slot().versions[0]!.selectedBy).toBe("human");
});

test("results are checked against the length, shape and type the prompt asked for", () => {
  const meta = { ...slot_meta(), type: "video", duration: "8s", aspect_ratio: "16:9" };
  const warnings = resultChecks("v1.md", meta, [{ file: "1.mp4", kind: "video", info: { width: 1080, height: 1920, duration: 10.01, audio: true } }]);
  expect(warnings).toHaveLength(2);
  expect(warnings[0]).toContain("1.mp4 is 10.0s");
  expect(warnings[1]).toContain("1080x1920 (9:16)");

  const fine = resultChecks("v1.md", meta, [{ file: "1.mp4", kind: "video", info: { width: 1280, height: 720, duration: 8.0, audio: false } }]);
  expect(fine).toEqual([]);
  expect(resultChecks("v1.md", meta, [{ file: "1.png", kind: "image", info: null }])[0]).toContain("is an image");
});

test("the inputs a result was made from are recorded once, with whether they were approved", async () => {
  createSlot(root, "still", "", image);
  await addResults(root, "still", 1, [png()]);
  mkdirSync(join(root, "clip"));
  writeFileSync(
    join(root, "clip", "v1.md"),
    "---\ntool: google-flow\ntype: video\nmodel: Veo 3.1 - Fast\nmode: frames\ninputs:\n  - role: start_frame\n    slot: still\n---\n\nThe kite climbs.\n",
  );
  mkdirSync(join(root, "clip", "v1"));
  recordInputs(root, slot("clip").versions[0]!);
  const recorded = readFileSync(join(root, "clip", "v1", "inputs.txt"), "utf8");
  expect(recorded).toBe("start_frame: still/v1/1.png (slot still v1, NOT approved yet: its newest pick)\n");
  expect(slot("clip").versions[0]!.inputs[0]!.sourceApproved).toBe(false);

  setApproval(root, "still", 1);
  expect(slot("clip").versions[0]!.inputs[0]!.sourceApproved).toBe(true);
  recordInputs(root, slot("clip").versions[0]!);
  expect(readFileSync(join(root, "clip", "v1", "inputs.txt"), "utf8")).toBe(recorded);
});

test("a slot folder an agent named against the rule is flagged, not renamed or hidden", () => {
  createSlot(root, "hero-banner-2", "", image);
  expect(slot("hero-banner-2").warnings).toEqual([]);
  for (const name of ["Hero", "hero_banner", "hero--banner", "-hero", "hero-", "héro"]) {
    mkdirSync(join(root, name));
    writeFileSync(join(root, name, "v1.md"), `---\ntype: image\nmodel: Nano Banana Pro\n---\n\nA kite.\n`);
    expect(slot(name).warnings).toHaveLength(1);
    expect(slot(name).warnings[0]).toContain(`"${name}" is not a valid slot name`);
    expect(existsSync(join(root, name, "v1.md"))).toBe(true);
    rmSync(join(root, name), { recursive: true });
  }
});

test("media kind comes from the extension alone, in any case, and needs the dot", () => {
  expect(mediaKindOfExt(".png")).toBe("image");
  expect(mediaKindOfExt(".JPEG")).toBe("image");
  expect(mediaKindOfExt(".MOV")).toBe("video");
  expect(mediaKindOfExt(".txt")).toBeNull();
  expect(mediaKindOfExt("")).toBeNull();
  expect(mediaKindOfExt("png")).toBeNull();
  expect(mediaKind("v1/1.webm")).toBe("video");
  expect(mediaKind("final")).toBeNull();
});

function slot_meta() {
  return { tool: null, type: null, model: null, mode: null, aspect_ratio: null, duration: null, resolution: null, changes: null, params: {} };
}
