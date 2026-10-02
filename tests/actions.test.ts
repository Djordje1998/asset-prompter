import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cloneName } from "../src/shared/names";
import { listProjects } from "../src/server/projects";
import { scanProject } from "../src/server/store";
import { addResults, addVersion, cloneSlot, createSlot, deleteResult, listTrash, restoreProject, restoreResult, restoreSlot, restoreTrashed, setApproval, setChangeRequest, setSelected, slotName, slugName, trashProject, trashSlot } from "../src/server/actions";
import { findSlot, image, png, presets, tempProject, writeReview } from "./helpers";

const root = tempProject();
const hero = (...parts: string[]) => join(root(), "hero", ...parts);
const finals = () => readdirSync(hero()).filter((f) => f.startsWith("final."));

// ---- approval and final.<ext> ------------------------------------------

test("approving copies the chosen result to final.<ext>, and unapproving keeps it as the last approved", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png("a.png", [7, 7, 7])]);
  setApproval(root(), "hero", 1);
  expect(readFileSync(hero("APPROVED"), "utf8")).toBe("v1\n");
  expect(finals()).toEqual(["final.png"]);
  expect([...readFileSync(hero("final.png"))]).toEqual([7, 7, 7]);

  setApproval(root(), "hero", null);
  expect(existsSync(hero("APPROVED"))).toBe(false);
  // Whatever uses final.png keeps working while the slot is reworked.
  expect(finals()).toEqual(["final.png"]);
  expect([...readFileSync(hero("final.png"))]).toEqual([7, 7, 7]);
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
  expect(finals()).toEqual(["final.png"]);
  expect(findSlot(root()).approved).toBeNull();
});

test("removing the only result of the approved version drops the approval", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png()]);
  setApproval(root(), "hero", 1);
  deleteResult(root(), "hero", 1, "1.png");
  expect(existsSync(hero("APPROVED"))).toBe(false);
  expect(finals()).toEqual(["final.png"]);
});

test("the next approval replaces the final file kept from the last one", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png("a.png", [1])]);
  setApproval(root(), "hero", 1);
  setApproval(root(), "hero", null);
  addVersion(root(), "hero", { ...image, changes: "Brighter." });
  await addResults(root(), "hero", 2, [new File([new Uint8Array([2])], "b.jpg", { type: "image/jpeg" })]);
  setApproval(root(), "hero", 2);
  expect(finals()).toEqual(["final.jpg"]);
  expect([...readFileSync(hero("final.jpg"))]).toEqual([2]);
});

// ---- cloning -------------------------------------------------------------

test("cloning copies the whole slot, timestamps included, and leaves the original alone", async () => {
  createSlot(root(), "hero", "Banner.", image);
  await addResults(root(), "hero", 1, [png()]);
  writeReview(root(), "hero", 1, "approve", "", 60);
  setApproval(root(), "hero", 1);
  cloneSlot(root(), "hero", "hero-v2");
  const copy = scanProject("p", root(), presets).find((s) => s.name === "hero-v2")!;
  expect(copy.status).toBe("approved");
  expect(copy.description).toBe("Banner.");
  expect(existsSync(join(root(), "hero-v2", "final.png"))).toBe(true);
  expect(statSync(join(root(), "hero-v2", "v1.review.md")).mtimeMs).toBe(statSync(hero("v1.review.md")).mtimeMs);
  expect(() => cloneSlot(root(), "hero", "hero-v2")).toThrow('A slot named "hero-v2" already exists.');
  expect(() => cloneSlot(root(), "nope", "nope-v2")).toThrow('Slot "nope" does not exist.');
});

test("a cloned slot is offered a name that counts up -vN and skips taken names", () => {
  expect(cloneName("hero", [])).toBe("hero-v2");
  expect(cloneName("hero-v2", [])).toBe("hero-v3");
  expect(cloneName("hero", ["hero-v2", "hero-v3"])).toBe("hero-v4");
  expect(cloneName("hero-v9", ["hero-v10"])).toBe("hero-v11");
  expect(cloneName("v2", [])).toBe("v2-v2");
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

// ---- undo ----------------------------------------------------------------

test("undoing a removed result brings back the file, the human's pick and the approval", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png("a.png", [1]), png("b.png", [2])]);
  setSelected(root(), "hero", 1, "2.png");
  setApproval(root(), "hero", 1);

  const removed = deleteResult(root(), "hero", 1, "2.png");
  expect(findSlot(root()).approved).toBeNull();
  restoreResult(root(), "hero", 1, "2.png", removed);
  expect([...readFileSync(hero("v1", "2.png"))]).toEqual([2]);
  expect(readFileSync(hero("v1", "selected.txt"), "utf8")).toBe("2.png\n");
  expect(findSlot(root()).status).toBe("approved");
  expect([...readFileSync(hero("final.png"))]).toEqual([2]);
  expect(() => restoreResult(root(), "hero", 1, "2.png", removed)).toThrow("2.png is no longer in _trash.");
});

test("undo refuses to overwrite a result added in the meantime", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png()]);
  const removed = deleteResult(root(), "hero", 1, "1.png");
  await addResults(root(), "hero", 1, [png()]);
  expect(() => restoreResult(root(), "hero", 1, "1.png", removed)).toThrow("A new 1.png was added to hero v1 since; remove it first.");
});

test("undoing a trashed slot puts the folder back", async () => {
  createSlot(root(), "hero", "Banner.", image);
  const trashed = trashSlot(root(), "hero");
  expect(existsSync(hero())).toBe(false);
  restoreSlot(root(), "hero", trashed);
  expect(readFileSync(hero("slot.md"), "utf8")).toBe("Banner.\n");
  createSlot(root(), "other", "", image);
  const again = trashSlot(root(), "other");
  createSlot(root(), "other", "", image);
  expect(() => restoreSlot(root(), "other", again)).toThrow('A new slot named "other" was made since.');
});

test("the human's pick can be taken back, except on the approved version", async () => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png(), png()]);
  setSelected(root(), "hero", 1, "2.png");
  setSelected(root(), "hero", 1, null);
  expect(existsSync(hero("v1", "selected.txt"))).toBe(false);
  expect(findSlot(root()).versions[0]!.selected).toBeNull();

  setSelected(root(), "hero", 1, "1.png");
  setApproval(root(), "hero", 1);
  expect(() => setSelected(root(), "hero", 1, null)).toThrow("v1 is approved with this pick. Remove the approval first.");
  expect(readFileSync(hero("v1", "selected.txt"), "utf8")).toBe("1.png\n");
});

test("a deleted project goes to _trash, leaves the list, and comes back on undo", () => {
  const projects = root();
  const dir = join(projects, "shop");
  createSlot(dir, "hero", "", image);
  expect(listProjects(projects, []).map((p) => p.name)).toContain("shop");

  const trashed = trashProject(projects, dir);
  expect(existsSync(dir)).toBe(false);
  expect(existsSync(join(trashed, "hero", "v1.md"))).toBe(true);
  expect(listProjects(projects, []).map((p) => p.name)).not.toContain("shop");

  restoreProject(dir, trashed);
  expect(existsSync(join(dir, "hero", "v1.md"))).toBe(true);
  expect(listProjects(projects, []).map((p) => p.name)).toContain("shop");
});

test("the trash lists removed slots and results, and puts each back where it came from", async () => {
  createSlot(root(), "hero", "", image);
  createSlot(root(), "logo", "", image);
  await addResults(root(), "hero", 1, [png("a.png"), png("b.png")]);
  deleteResult(root(), "hero", 1, "2.png");
  trashSlot(root(), "logo");

  const items = listTrash(join(root(), "_trash"), false);
  expect(items.map((i) => [i.kind, i.name, i.slot ?? null, i.version ?? null]).sort()).toEqual([
    ["result", "2.png", "hero", 1],
    ["slot", "logo", null, null],
  ]);
  expect(items.every((i) => typeof i.trashedAt === "number")).toBe(true);

  for (const item of items) restoreTrashed(root(), item.entry);
  expect(existsSync(join(root(), "logo", "v1.md"))).toBe(true);
  expect(existsSync(hero("v1", "2.png"))).toBe(true);
  expect(listTrash(join(root(), "_trash"), false)).toEqual([]);
});
