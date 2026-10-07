import { expect, test } from "bun:test";
import type { ProjectSummary } from "../src/shared/types";
import { Chime, OWN_MS, QUIET_MS, REPEAT_MS, writeScope } from "../src/web/chime";

const counts = { waiting_input: 0, waiting_generation: 0, waiting_review: 0, waiting_agent: 0, approved: 0, empty: 0 };
const project = (stamps: Record<string, string>, id = "p"): ProjectSummary => ({ id, name: id, path: `/x/${id}`, external: false, counts, stamps, listening: 0 });

/** A chime that has seen `stamps` as its first state, at time 0. */
function started(stamps: Record<string, string>) {
  const c = new Chime();
  expect(c.update([project(stamps)], 0)).toBe(false);
  return c;
}

test("the first state never chimes, however much waits for the person", () => {
  expect(new Chime().update([project({ a: "waiting_generation:1:0", b: "waiting_review:1:5" })], 0)).toBe(false);
});

test("a slot the agent writes, or a new version of one, chimes", () => {
  const c = started({ a: "waiting_agent:1:0" });
  expect(c.update([project({ a: "waiting_agent:1:0", b: "waiting_generation:1:0" })], 10_000)).toBe(true);
  expect(c.update([project({ a: "waiting_generation:2:0", b: "waiting_generation:1:0" })], 20_000)).toBe(true);
});

test("a review the agent approves chimes, and so does a later review of the same version", () => {
  const c = started({ a: "waiting_agent:1:0" });
  expect(c.update([project({ a: "waiting_review:1:100" })], 10_000)).toBe(true);
  expect(c.update([project({ a: "waiting_agent:1:100" })], 20_000)).toBe(false);
  expect(c.update([project({ a: "waiting_review:1:200" })], 30_000)).toBe(true);
});

test("what the agent hands over chimes even when something else leaves the person's turn at the same time", () => {
  const c = started({ a: "waiting_review:1:5", b: "waiting_agent:1:0" });
  expect(c.update([project({ a: "approved:1:5", b: "waiting_review:1:9" })], 10_000)).toBe(true);
});

test("the person's own change does not chime, during the request or just after it", () => {
  const c = started({});
  const done = c.mine("/api/projects/p/slots", { name: "hero" });
  expect(c.update([project({ hero: "waiting_generation:1:0" })], 10_000)).toBe(false);
  done(10_100);
  expect(c.update([project({ hero: "waiting_generation:2:0" })], 10_100 + OWN_MS - 1)).toBe(false);
  // Once the change is well over, the agent's next version of that slot chimes again.
  expect(c.update([project({ hero: "waiting_generation:3:0" })], 10_100 + OWN_MS + QUIET_MS)).toBe(true);
});

test("the person's change to one slot does not hide the agent's work on another", () => {
  const c = started({ a: "approved:1:5", b: "waiting_agent:1:0" });
  const done = c.mine("/api/projects/p/slots/a/approval", { version: null });
  done(9_000);
  expect(c.update([project({ a: "waiting_review:1:5", b: "waiting_generation:2:0" })], 9_500)).toBe(true);
});

test("an undo covers the whole project; a slot freed by an approval never chimes", () => {
  const c = started({ a: "waiting_input:1:0" });
  c.mine("/api/projects/p/undo/abc", undefined)(5_000);
  expect(c.update([project({ a: "waiting_input:1:0", back: "waiting_generation:1:0" })], 5_500)).toBe(false);
  expect(c.update([project({ a: "waiting_generation:1:0", back: "waiting_generation:1:0" })], 60_000)).toBe(false);
});

test("several slots close together chime once", () => {
  const c = started({});
  expect(c.update([project({ a: "waiting_generation:1:0" })], 10_000)).toBe(true);
  expect(c.update([project({ a: "waiting_generation:1:0", b: "waiting_generation:1:0" })], 10_000 + QUIET_MS - 1)).toBe(false);
});

test("a slot flickering while its files are written chimes once", () => {
  const c = started({ a: "waiting_agent:1:0" });
  expect(c.update([project({ a: "waiting_generation:2:0" })], 10_000)).toBe(true);
  expect(c.update([project({ a: "empty:0:0" })], 10_050)).toBe(false);
  expect(c.update([project({ a: "waiting_generation:2:0" })], 10_000 + QUIET_MS + 1)).toBe(false);
  // Much later the same stamp coming back is news again.
  expect(c.update([project({ a: "waiting_agent:2:0" })], 10_000 + REPEAT_MS)).toBe(false);
  expect(c.update([project({ a: "waiting_generation:2:0" })], 10_000 + REPEAT_MS + QUIET_MS)).toBe(true);
});

test("a project that just appeared is taken in without a chime", () => {
  const c = started({});
  expect(c.update([project({}), project({ a: "waiting_generation:1:0" }, "new")], 10_000)).toBe(false);
});

test("the slots a request changes are read from its URL and body", () => {
  expect(writeScope("/api/projects/p/slots/hero/versions/2/results", new FormData())).toEqual({ project: "p", slots: ["hero"] });
  expect(writeScope("/api/projects/p/slots/hero/clone", { name: "hero-v2" })).toEqual({ project: "p", slots: ["hero", "hero-v2"] });
  const form = new FormData();
  form.append("name", "logo");
  expect(writeScope("/api/projects/p/slots/final", form)).toEqual({ project: "p", slots: ["logo"] });
  expect(writeScope("/api/projects/my%20p/trash/restore", { entry: "x" })).toEqual({ project: "my p", slots: null });
  expect(writeScope("/api/undo/abc", undefined)).toEqual({ project: null, slots: null });
});
