import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { addResults, createSlot, setChangeRequest, setSelected } from "../src/server/actions";
import { scanProject } from "../src/server/store";
import { agentTurn, wakeMessage } from "../src/server/wake";
import { age, image, png, presets, tempProject, writeReview } from "./helpers";

// The briefing the agent gets from /wait when the human presses Notify agent.

const root = tempProject();
const slots = () => scanProject("p", root(), presets);

const withResults = async (name = "hero", count = 1) => {
  createSlot(root(), name, "", image);
  await addResults(root(), name, 1, Array.from({ length: count }, () => png()));
  for (let i = 1; i <= count; i++) age(join(root(), name, "v1", `${i}.png`), 120);
};

test("new results ask for a review and list each result", async () => {
  await withResults("hero", 2);
  setSelected(root(), "hero", 1, "2.png");
  expect(agentTurn(slots())).toEqual([
    [
      "hero v1: new results. Review them.",
      "  Result: hero/v1/1.png (image)",
      "  Result: hero/v1/2.png (image, chosen by the human)",
      "  Your request: hero/slot.md, hero/v1.md",
    ].join("\n"),
  ]);
});

test("a change request quotes the human on one line and asks for the next version", async () => {
  await withResults();
  writeReview(root(), "hero", 1, "approve", "", 60);
  setChangeRequest(root(), "hero", 1, "The kite is too small.\n\nMake it   fill the frame.");
  const [block] = agentTurn(slots());
  expect(block!.split("\n").slice(0, 2)).toEqual([
    "hero v1: change request. Write v2.md and v1.review.md with verdict: revise.",
    "  The human wrote: The kite is too small. Make it fill the frame.",
  ]);
});

test("a revise review without the next version asks for it", async () => {
  await withResults();
  writeReview(root(), "hero", 1, "revise", "", 60);
  expect(agentTurn(slots())[0]!.split("\n")[0]).toBe("hero v1: your review says revise but v2.md is missing. Write it.");
});

test("results changed after the review ask for another review", async () => {
  await withResults();
  writeReview(root(), "hero", 1, "approve", "", 60);
  age(join(root(), "hero", "v1", "1.png"), 10);
  expect(agentTurn(slots())[0]!.split("\n")[0]).toBe("hero v1: results changed after your review. Review again.");
});

test("videos point at info.md, and recorded inputs and mismatches are listed", async () => {
  createSlot(root(), "clip", "", { ...image, type: "video", model: "Veo 3.1 - Fast", aspect_ratio: "16:9", duration: "8s" });
  // A result the human dropped in as an image although the version asks for a video.
  await addResults(root(), "clip", 1, [new File([new Uint8Array([1])], "clip.mp4", { type: "video/mp4" }), png()]);
  writeFileSync(join(root(), "clip", "v1", "inputs.txt"), "# attached\nstart_frame: still/v1/1.png (slot still v1, approved)\n");
  const block = agentTurn(slots())[0]!;
  expect(block).toContain("  Result: clip/v1/1.mp4 (video)");
  expect(block).toContain("  Frame sheets and motion numbers: clip/v1/info.md");
  expect(block).toContain("  Input used: start_frame: still/v1/1.png (slot still v1, approved)");
  expect(block).toMatch(/\n {2}Mismatch: .*2\.png/);
  expect(block).not.toContain("# attached");
});

test("slots that are not the agent's turn are left out of the briefing", async () => {
  createSlot(root(), "waiting", "", image);
  await withResults("done");
  writeReview(root(), "done", 1, "approve", "", 60);
  expect(agentTurn(slots())).toEqual([]);
});

test("the wake message names the project and ends with what to do next", async () => {
  await withResults();
  const message = wakeMessage({ name: "demo", path: "C:\\work\\demo" }, slots());
  const lines = message.split("\n");
  expect(lines[0]).toBe("Notify agent in project demo (C:\\work\\demo). Paths below are relative to it.");
  expect(lines[2]).toBe("hero v1: new results. Review them.");
  expect(lines.at(-2)).toBe("Act on these slots only. Report one short line per slot in the chat, then start waiting again with the same command.");
  expect(message.endsWith("\n")).toBe(true);
});
