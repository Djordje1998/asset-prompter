import { expect, test } from "bun:test";
import type { Preset } from "../src/shared/types";
import { checkAgainstPreset } from "../src/server/preset";
import { meta, presets } from "./helpers";

const flow = presets.find((p) => p.tool === "google-flow")!;
const video = (fields: Parameters<typeof meta>[0]) => meta({ tool: "google-flow", type: "video", model: "Veo 3.1 - Fast", mode: "frames", aspect_ratio: "16:9", duration: "8s", ...fields });
const check = (m: ReturnType<typeof meta>, roles: (string | null)[] = [], length = 100, preset: Preset = flow) => checkAgainstPreset(preset, m, roles, length);

test("a version that matches the preset has no warnings, and model names match loosely", () => {
  expect(flow).toBeDefined();
  expect(check(video({}), ["start_frame"])).toEqual([]);
  expect(check(video({ model: "veo 3.1 fast" }))).toEqual([]);
  expect(check(meta({ type: "image", model: "Nano Banana Pro", aspect_ratio: "1:1" }), ["reference"])).toEqual([]);
  // No section for the type: nothing to check against.
  expect(check(meta({ type: "audio", model: "Anything" }))).toEqual([]);
});

test("an unknown model is named along with the ones the preset offers", () => {
  const [warning, ...rest] = check(meta({ type: "image", model: "Imagen 9" }));
  expect(rest).toEqual([]);
  expect(warning).toBe('Model "Imagen 9" is not in the Google Flow image preset (Nano Banana Pro, Nano Banana 2, Nano Banana 2 Lite).');
});

test("an aspect ratio the section does not offer is flagged", () => {
  expect(check(video({ aspect_ratio: "1:1" }))).toEqual(["Aspect ratio 1:1 is not offered for Google Flow video (16:9, 9:16)."]);
});

test("a mode, duration or resolution the model does not support is flagged", () => {
  expect(check(video({ model: "Veo 3.1 - Quality", mode: "ingredients" }), ["ingredient"])).toEqual([
    'Veo 3.1 - Quality does not support mode "ingredients" (frames).',
  ]);
  expect(check(video({ duration: "6s" }))).toEqual(["Veo 3.1 - Fast does not offer duration 6s (8s)."]);
  expect(check(video({ resolution: "720p" }))).toEqual(["Veo 3.1 - Fast has no resolution setting."]);
  expect(check(video({ model: "Omni 1.1 Flash", duration: "6s", resolution: "1080p" }))).toEqual([
    "Omni 1.1 Flash does not offer resolution 1080p (720p, 360p).",
  ]);
});

test("more inputs than the model takes are flagged", () => {
  const roles = ["ingredient", "ingredient", "ingredient", "ingredient"];
  expect(check(video({ mode: "ingredients" }), roles)).toEqual(["Veo 3.1 - Fast takes at most 3 input images; this version lists 4."]);
  expect(check(video({ mode: "ingredients" }), roles.slice(1))).toEqual([]);
});

test("video modes need inputs with the matching roles", () => {
  expect(check(video({ mode: "ingredients" }), ["start_frame"])).toEqual(['Mode "ingredients" needs at least one input with role ingredient.']);
  expect(check(video({ mode: "ingredients" }), [])).toEqual(['Mode "ingredients" needs at least one input with role ingredient.']);
  expect(check(video({}), ["end_frame"])).toEqual(['Mode "frames" needs a start_frame when it has an end_frame.']);
  expect(check(video({}), ["start_frame", "ingredient"])).toEqual(["Frames and ingredients cannot be combined in one generation."]);
  expect(check(video({ mode: "text" }))).toContain('Flow has no "text" mode; use "frames" with no start_frame for a video from the prompt alone.');
});

test("a prompt over the preset's limit is flagged", () => {
  const limited: Preset = { ...flow, prompt_limit: 50 };
  expect(check(video({}), [], 50, limited)).toEqual([]);
  expect(check(video({}), [], 51, limited)).toEqual(["Prompt is 51 characters; Google Flow limit is 50."]);
});
