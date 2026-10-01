import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addResults, addVersion, createSlot, deleteResult, setApproval, setChangeRequest, setSelected, slotName, slugName, trashSlot } from "../src/server/actions";
import { findSlot, image, png, tempProject, writeReview } from "./helpers";

const root = tempProject();
const hero = (...parts: string[]) => join(root(), "hero", ...parts);
const finals = () => readdirSync(hero()).filter((f) => f.startsWith("final."));

// ---- approval and final.<ext> ------------------------------------------

test("approving copies the chosen result to final.<ext>, and unapproving removes it", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png("a.png", [7, 7, 7])]);
  setApproval(root(), "hero", 1);
  expect(readFileSync(hero("APPROVED"), "utf8")).toBe("v1\n");
  expect(finals()).toEqual(["final.png"]);
  expect([...readFileSync(hero("final.png"))]).toEqual([7, 7, 7]);

  setApproval(root(), "hero", null);
  expect(existsSync(hero("APPROVED"))).toBe(false);
  expect(finals()).toEqual([]);
});

test("changing the pick of the approved version replaces final.<ext>, extension included", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png("a.png", [1]), new File([new Uint8Array([2])], "b.JPG", { type: "image/jpeg" })]);
  setSelected(root(), "hero", 1, "1.png");
  setApproval(root(), "hero", 1);
  expect(finals()).toEqual(["final.png"]);

  setSelected(root(), "hero", 1, "2.jpg");
  expect(finals()).toEqual(["final.jpg"]);
  expect([...readFileSync(hero("final.jpg"))]).toEqual([2]);
});

test("approving the agent's pick writes it to selected.txt", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png(), png()]);
  writeReview(root(), "hero", 1, "approve", "pick: 2.png\n");
  expect(existsSync(hero("v1", "selected.txt"))).toBe(false);
  setApproval(root(), "hero", 1);
  expect(readFileSync(hero("v1", "selected.txt"), "utf8")).toBe("2.png\n");

  // A later review cannot move the final file.
  writeReview(root(), "hero", 1, "approve", "pick: 1.png\n");
  expect(findSlot(root()).versions[0]!.selected).toBe("2.png");
});

test("approving with nothing to approve, or no pick among several, is refused", async () => {
  createSlot(root(), "hero", "", image);
  expect(() => setApproval(root(), "hero", 1)).toThrow("There is nothing to approve yet.");
  await addResults(root(), "hero", 1, [png(), png()]);
  expect(() => setApproval(root(), "hero", 1)).toThrow("Select one candidate before approving.");
  expect(() => setApproval(root(), "hero", 2)).toThrow("hero has no v2.");
  expect(existsSync(hero("APPROVED"))).toBe(false);
});

test("removing the result that was final drops the approval", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png(), png(), png()]);
  setSelected(root(), "hero", 1, "2.png");
  setApproval(root(), "hero", 1);
  expect(finals()).toEqual(["final.png"]);

  deleteResult(root(), "hero", 1, "2.png");
  expect(existsSync(hero("v1", "selected.txt"))).toBe(false);
  expect(existsSync(hero("APPROVED"))).toBe(false);
  expect(finals()).toEqual([]);
  expect(findSlot(root()).approved).toBeNull();
});

test("removing the only result of the approved version drops the approval", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png()]);
  setApproval(root(), "hero", 1);
  deleteResult(root(), "hero", 1, "1.png");
  expect(existsSync(hero("APPROVED"))).toBe(false);
  expect(finals()).toEqual([]);
});

// ---- adding results ----------------------------------------------------

test("results are numbered after the highest number already there", async () => {
  createSlot(root(), "hero", "", image);
  const written = await addResults(root(), "hero", 1, [png("x.PNG"), png("y.png")]);
  expect(written).toEqual([hero("v1", "1.png"), hero("v1", "2.png")]);

  await addResults(root(), "hero", 1, [png()]);
  deleteResult(root(), "hero", 1, "2.png");
  await addResults(root(), "hero", 1, [png()]);
  // A file dropped in by hand with a name that is not a number does not count.
  writeFileSync(hero("v1", "render.png"), new Uint8Array([1]));
  await addResults(root(), "hero", 1, [png()]);
  expect(findSlot(root()).versions[0]!.results.map((c) => c.file)).toEqual(["1.png", "3.png", "4.png", "5.png", "render.png"]);
});

test("a result without an extension is named from its type, and a non-media file is refused before anything is written", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [new File([new Uint8Array([1])], "blob", { type: "video/mp4" })]);
  expect(readdirSync(hero("v1"))).toEqual(["1.mp4"]);

  await expect(addResults(root(), "hero", 1, [png(), new File(["x"], "notes.txt", { type: "text/plain" })])).rejects.toThrow("notes.txt");
  expect(readdirSync(hero("v1"))).toEqual(["1.mp4"]);
  await expect(addResults(root(), "hero", 2, [png()])).rejects.toThrow("hero has no v2.");
});

test("adding a version continues the numbering and can carry inputs and params over", () => {
  createSlot(root(), "hero", "", image);
  writeFileSync(
    hero("v2.md"),
    "---\ntool: google-flow\ntype: image\nmodel: Nano Banana Pro\ninputs:\n  - role: reference\n    path: ref.png\nparams:\n  seed: 4\n---\n\nA kite.\n",
  );
  expect(addVersion(root(), "hero", { ...image, carryFrom: 2 })).toBe(3);
  const v3 = findSlot(root()).versions[2]!;
  expect(v3.inputs.map((i) => i.source)).toEqual(["ref.png"]);
  expect(v3.meta.params).toEqual({ seed: "4" });
  expect(() => addVersion(root(), "hero", { ...image, prompt: "  " })).toThrow("The prompt is empty.");
  expect(() => addVersion(root(), "nowhere", image)).toThrow('Slot "nowhere" does not exist.');
});

// ---- change requests ---------------------------------------------------

test("a change request is written trimmed, and an empty one removes the file", () => {
  createSlot(root(), "hero", "", image);
  setChangeRequest(root(), "hero", 1, "  The kite is too small.\n\n");
  expect(readFileSync(hero("v1.feedback.md"), "utf8")).toBe("The kite is too small.\n");
  expect(findSlot(root()).versions[0]!.changeRequest).toBe("The kite is too small.");

  setChangeRequest(root(), "hero", 1, "   ");
  expect(existsSync(hero("v1.feedback.md"))).toBe(false);
  setChangeRequest(root(), "hero", 1, "");
  expect(findSlot(root()).versions[0]!.changeRequest).toBeNull();
  expect(() => setChangeRequest(root(), "hero", 2, "x")).toThrow("hero has no v2.");
});

// ---- creating and deleting slots ---------------------------------------

test("a slot whose first version is rejected is removed again", () => {
  expect(() => createSlot(root(), "hero", "For the hero.", { ...image, prompt: "" })).toThrow("The prompt is empty.");
  expect(() => createSlot(root(), "hero", "For the hero.", { ...image, type: "audio" })).toThrow("Type must be image or video.");
  expect(() => createSlot(root(), "hero", "For the hero.", { ...image, model: " " })).toThrow("Model is required.");
  expect(existsSync(hero())).toBe(false);
});

test("slot names made in the app follow the HOW-TO rule, while project names keep their looser one", () => {
  expect(slotName(" hero-banner-2 ")).toBe("hero-banner-2");
  for (const bad of ["Hero", "hero banner", "hero_banner", "hero--banner", "-hero", "hero-", "héro"]) {
    expect(() => slotName(bad)).toThrow("can only use lowercase letters, digits and single hyphens");
  }
  expect(() => slotName("_hero")).toThrow('Slot name cannot start with "_" or ".".');
  expect(() => slotName("a/b")).toThrow("not allowed in a folder name");
  expect(() => slotName("")).toThrow("Slot name is required.");
  expect(slugName("My Project_1", "Project name")).toBe("My Project_1");
});

test("creating a slot that exists is refused and leaves the existing one alone", () => {
  createSlot(root(), "hero", "First.", image);
  expect(() => createSlot(root(), "hero", "Second.", { ...image, model: "" })).toThrow('A slot named "hero" already exists.');
  expect(readFileSync(hero("slot.md"), "utf8")).toBe("First.\n");
  expect(existsSync(hero("v1.md"))).toBe(true);
});

test("deleting a slot moves the whole folder into _trash", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png()]);
  trashSlot(root(), "hero");
  expect(existsSync(hero())).toBe(false);
  const trashed = readdirSync(join(root(), "_trash"));
  expect(trashed).toHaveLength(1);
  expect(trashed[0]).toEndWith("_hero");
  expect(existsSync(join(root(), "_trash", trashed[0]!, "v1", "1.png"))).toBe(true);
  expect(() => trashSlot(root(), "hero")).toThrow('Slot "hero" does not exist.');
});

test("a removed result goes to _trash with its frame sheets deleted", async () => {
  createSlot(root(), "hero", "", { ...image, type: "video", model: "Veo 3.1 - Fast" });
  await addResults(root(), "hero", 1, [new File([new Uint8Array([1])], "clip.mp4", { type: "video/mp4" })]);
  const frames = hero("v1", "1.frames");
  mkdirSync(frames);
  writeFileSync(join(frames, "1.jpg"), new Uint8Array([1]));
  deleteResult(root(), "hero", 1, "1.mp4");
  expect(existsSync(frames)).toBe(false);
  expect(readdirSync(join(root(), "_trash"))[0]).toEndWith("_hero_v1_1.mp4");
  expect(() => deleteResult(root(), "hero", 1, "1.mp4")).toThrow("1.mp4 does not exist in hero v1.");
});
