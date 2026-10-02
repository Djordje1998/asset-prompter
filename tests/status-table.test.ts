import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Status } from "../src/shared/types";
import { addResults, addVersion, createSlot, setApproval, setChangeRequest } from "../src/server/actions";
import { howToUse } from "../src/server/howto";
import { age, findSlot, image, png, presets, tempProject, writeReview, writeVersion } from "./helpers";

// The "Where things stand" table in HOW-TO-USE.md is what agents go by; slotStatus must say the same.

const root = tempProject();

/** The rows of the table, in order, as [in the slot, whose turn]. */
function tableRows(): [string, string][] {
  const lines = howToUse(presets).split("\n");
  const start = lines.indexOf("| In the slot | Whose turn |");
  expect(start).toBeGreaterThan(-1);
  const rows: [string, string][] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    const [cell, turn] = line.slice(1, -1).split(" | ").map((c) => c.trim());
    rows.push([cell!, turn!]);
  }
  return rows;
}

/** What the app shows for each answer in the "Whose turn" column. */
function expectedStatus(turn: string): Status {
  if (turn.startsWith("Done.")) return "approved";
  if (turn.startsWith("Human: waiting for that slot")) return "waiting_input";
  if (turn.startsWith("Human: generating")) return "waiting_generation";
  if (turn.startsWith("Human: final approval")) return "waiting_review";
  if (turn.startsWith("You:")) return "waiting_agent";
  throw new Error(`No status for "${turn}"; add it to this test.`);
}

const results = async (secondsAgo = 120) => {
  createSlot(root(), "hero", "", image);
  await addResults(root(), "hero", 1, [png()]);
  age(join(root(), "hero", "v1", "1.png"), secondsAgo);
};

/** Builds a slot named "hero" in the state one row describes, and nothing earlier in the table. */
const fixtures: Record<string, () => Promise<void> | void> = {
  "`APPROVED` exists": async () => {
    await results();
    setApproval(root(), "hero", 1);
  },
  "current `vN/` has no results and a `slot:` input is not approved yet": async () => {
    createSlot(root(), "still", "", image);
    await addResults(root(), "still", 1, [png()]);
    mkdirSync(join(root(), "hero"));
    writeVersion(root(), "hero", 1, "tool: google-flow\ntype: video\nmodel: Veo 3.1 - Fast\nmode: frames\ninputs:\n  - role: start_frame\n    slot: still");
  },
  "current `vN/` has no results": () => createSlot(root(), "hero", "", image),
  "`vN.feedback.md` exists": async () => {
    await results();
    writeReview(root(), "hero", 1, "approve", "", 60);
    setChangeRequest(root(), "hero", 1, "The kite is too small.");
  },
  "results, and no `vN.review.md`": () => results(),
  "a result in `vN/` was modified after `vN.review.md`": async () => {
    await results(10);
    writeReview(root(), "hero", 1, "approve", "", 60);
  },
  "`vN.review.md` says `verdict: revise`": async () => {
    await results();
    writeReview(root(), "hero", 1, "revise", "", 60);
  },
  "`vN.review.md` says `verdict: approve`": async () => {
    await results();
    writeReview(root(), "hero", 1, "approve", "", 60);
  },
};

test("every row of the table has a fixture here", () => {
  expect(tableRows().map(([cell]) => cell)).toEqual(Object.keys(fixtures));
});

for (const [cell, turn] of tableRows()) {
  test(`${cell} -> ${expectedStatus(turn)}`, async () => {
    const build = fixtures[cell];
    expect(build).toBeDefined();
    await build!();
    expect(findSlot(root()).status).toBe(expectedStatus(turn));
  });
}

test("the first matching row decides: an approval outranks a later change request", async () => {
  await results();
  setApproval(root(), "hero", 1);
  setChangeRequest(root(), "hero", 1, "Actually, a bigger kite.");
  expect(findSlot(root()).status).toBe("approved");
});

test("a version written into a Done slot is ignored and flagged; removing the approval reopens it", async () => {
  await results();
  setApproval(root(), "hero", 1);
  age(join(root(), "hero", "APPROVED"), 60);
  addVersion(root(), "hero", { ...image, changes: "Another try." });
  expect(findSlot(root()).status).toBe("approved");
  expect(findSlot(root()).warnings).toEqual(["v2.md was written after v1 was approved, so it is ignored. Remove the approval to work on it."]);

  setApproval(root(), "hero", null);
  expect(findSlot(root()).status).toBe("waiting_generation");
  expect(findSlot(root()).warnings).toEqual([]);
});

test("an approved slot: input unblocks the slot that uses it", async () => {
  await fixtures["current `vN/` has no results and a `slot:` input is not approved yet"]!();
  expect(findSlot(root()).waitingFor).toEqual(["still"]);
  setApproval(root(), "still", 1);
  expect(findSlot(root()).status).toBe("waiting_generation");
});

test("a change request outranks a review written after it", async () => {
  await results();
  setChangeRequest(root(), "hero", 1, "The kite is too small.");
  age(join(root(), "hero", "v1.feedback.md"), 60);
  writeReview(root(), "hero", 1, "approve");
  expect(findSlot(root()).status).toBe("waiting_agent");
});
