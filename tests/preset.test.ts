import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Preset } from "../src/shared/types";
import { checkAgainstPreset, durationAllowed, loadPresets, logoPath } from "../src/server/preset";
import { meta, presets } from "./helpers";

const flow = presets.find((p) => p.tool === "google-flow")!;
const video = (fields: Parameters<typeof meta>[0]) => meta({ tool: "google-flow", type: "video", model: "Veo 3.1 - Fast", mode: "frames", aspect_ratio: "16:9", duration: "8s", ...fields });
const check = (m: ReturnType<typeof meta>, roles: (string | null)[] = [], length = 100, preset: Preset = flow) => checkAgainstPreset(preset, m, roles, length);

test("every shipped preset loads with a name, a checked date, a logo and at least one section", () => {
  const dir = join(import.meta.dir, "../presets");
  expect(presets.map((p) => p.tool)).toEqual(["chatgpt", "dreamina", "google-flow", "grok-imagine", "leonardo", "luma", "midjourney"]);
  for (const preset of presets) {
    expect(preset.name).not.toBe(preset.tool);
    expect(preset.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(preset.logo).toBe(`/api/presets/${preset.tool}/logo`);
    expect(existsSync(logoPath(dir, preset.tool)!)).toBe(true);
    expect(preset.image || preset.video).toBeTruthy();
    for (const section of [preset.image, preset.video]) {
      if (!section) continue;
      expect(section.models.length).toBeGreaterThan(0);
      // Every mode a model names is defined for the section, so the agent can look it up.
      for (const model of section.models) for (const mode of model.modes ?? []) expect(Object.keys(section.modes ?? {})).toContain(mode);
    }
  }
  expect(loadPresets(join(dir, "missing"))).toEqual([]);
});

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

test("an aspect ratio the section does not offer is flagged, and a model's own list wins over the section's", () => {
  expect(check(video({ aspect_ratio: "1:1" }))).toEqual(["Aspect ratio 1:1 is not offered for Google Flow video (16:9, 9:16)."]);
  const leonardo = presets.find((p) => p.tool === "leonardo")!;
  const kling = meta({ tool: "leonardo", type: "video", model: "Kling 3.0", mode: "text", aspect_ratio: "1:1", duration: "5s", resolution: "1080p" });
  expect(check(kling, [], 100, leonardo)).toEqual([]);
  expect(check({ ...kling, aspect_ratio: "4:3" }, [], 100, leonardo)).toEqual(["Aspect ratio 4:3 is not offered for Kling 3.0 (16:9, 1:1, 9:16)."]);
});

test("a mode, duration or resolution the model does not support is flagged", () => {
  expect(check(video({ model: "Veo 3.1 - Quality", mode: "ingredients" }), ["ingredient"])).toEqual([
    'Veo 3.1 - Quality does not support mode "ingredients" (frames).',
  ]);
  expect(check(video({ duration: "5s" }))).toEqual(["Veo 3.1 - Fast does not offer duration 5s (4s, 6s, 8s)."]);
  expect(check(video({ resolution: "720p" }))).toEqual(["Veo 3.1 - Fast has no resolution setting."]);
  expect(check(video({ model: "Omni 1.1 Flash", duration: "6s", resolution: "1080p" }))).toEqual([
    "Omni 1.1 Flash does not offer resolution 1080p (720p, 360p).",
  ]);
});

test("a duration range such as 4-30s allows any whole second in it", () => {
  expect(durationAllowed(["4-30s"], "4s")).toBe(true);
  expect(durationAllowed(["4-30s"], "17s")).toBe(true);
  expect(durationAllowed(["4-30s"], "31s")).toBe(false);
  expect(durationAllowed(["5s", "10s"], "10s")).toBe(true);
  expect(durationAllowed(["5s", "10s"], "7s")).toBe(false);
  const dreamina = presets.find((p) => p.tool === "dreamina")!;
  const clip = meta({ tool: "dreamina", type: "video", model: "Seedance 2.5", mode: "frames", duration: "12s" });
  expect(check(clip, ["start_frame"], 100, dreamina)).toEqual([]);
  expect(check({ ...clip, duration: "3s" }, ["start_frame"], 100, dreamina)).toEqual(["Seedance 2.5 does not offer duration 3s (4-180s)."]);
});

test("more inputs than the model takes are flagged", () => {
  const roles = ["ingredient", "ingredient", "ingredient", "ingredient"];
  expect(check(video({ mode: "ingredients" }), roles)).toEqual(["Veo 3.1 - Fast takes at most 3 input files; this version lists 4."]);
  expect(check(video({ mode: "ingredients" }), roles.slice(1))).toEqual([]);
});

test("the mode decides which input roles a version can attach", () => {
  expect(check(video({ mode: "ingredients" }), ["start_frame"])).toEqual([
    'Mode "ingredients" takes only ingredient; this version has an input with role start_frame.',
    'Mode "ingredients" needs at least one input with role ingredient.',
  ]);
  expect(check(video({ mode: "ingredients" }), [])).toEqual(['Mode "ingredients" needs at least one input with role ingredient.']);
  expect(check(video({}), ["end_frame"])).toEqual(['Mode "frames" needs a start_frame when it has an end_frame.']);
  expect(check(video({}), ["start_frame", "ingredient"])).toEqual(['Mode "frames" takes only start_frame, end_frame; this version has an input with role ingredient.']);
  // A mode the tool does not have at all, and no mode where the tool has several.
  expect(check(video({ mode: "text" }))).toEqual([
    'Veo 3.1 - Fast does not support mode "text" (frames, ingredients).',
    'Google Flow has no "text" mode for video (frames, ingredients, extend, edit).',
  ]);
  expect(check(video({ mode: null }), ["start_frame"])).toEqual(["`mode` is not set; Google Flow video has modes frames, ingredients, extend, edit."]);
  expect(check(video({ mode: null }), [])).toEqual([]);
  // A mode that takes no inputs.
  const grok = presets.find((p) => p.tool === "grok-imagine")!;
  const text = meta({ tool: "grok-imagine", type: "video", model: "Imagine 1.5", mode: "text", duration: "6s" });
  expect(check(text, ["reference"], 100, grok)).toEqual(['Mode "text" takes no inputs; this version has an input with role reference.']);
  // Images without modes: roles are not checked.
  expect(check(meta({ type: "image", model: "Nano Banana 2" }), ["reference", "whatever"])).toEqual([]);
});

test("a prompt over the preset's limit is flagged", () => {
  const limited: Preset = { ...flow, prompt_limit: 50 };
  expect(check(video({}), [], 50, limited)).toEqual([]);
  expect(check(video({}), [], 51, limited)).toEqual(["Prompt is 51 characters; Google Flow limit is 50."]);
});
