import { expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Preset } from "../src/shared/types";
import { HOWTO_FILE, howToUse, writeHowTo } from "../src/server/howto";
import { age, presets, tempProject } from "./helpers";

const root = tempProject();
const waitUrl = "http://localhost:4777/api/projects/demo/wait";
const other: Preset = {
  tool: "other-tool",
  name: "Other Tool",
  prompt_limit: 500,
  image: { models: [{ name: "Painter 1", max_inputs: 2 }], aspect_ratios: ["1:1"] },
  notes: "Other Tool has no video.",
};

test("the Waiting section and the Notify hint appear only with a wait URL", () => {
  const withWait = howToUse(presets, waitUrl);
  expect(withWait).toContain("## Waiting for the human");
  expect(withWait).toContain(`curl -s ${waitUrl}`);
  expect(withWait).toContain("by pressing Notify agent");

  const without = howToUse(presets);
  expect(without).not.toContain("## Waiting for the human");
  expect(without).not.toContain("curl");
  expect(without).not.toContain("Notify agent");
});

test("every preset tool is listed with its models and limits", () => {
  const text = howToUse([...presets, other]);
  expect(presets.length).toBeGreaterThan(0);
  for (const preset of [...presets, other]) {
    expect(text).toContain(`### \`tool: ${preset.tool}\` (${preset.name})`);
    for (const section of [preset.image, preset.video]) for (const model of section?.models ?? []) expect(text).toContain(`\`${model.name}\``);
  }
  expect(text).toContain("| model | max references |");
  expect(text).toContain('- aspect_ratio: "1:1"');
  expect(text).toContain("Prompts are limited to 500 characters.");
  expect(text).toContain("Other Tool has no video.");
});

test("without presets the human is asked which tool to use", () => {
  expect(howToUse([])).toContain("No tool presets are installed. Ask the human which tool and settings to use.");
});

test("HOW-TO-USE.md is rewritten only when its text changes", () => {
  const path = join(root(), HOWTO_FILE);
  writeHowTo(root(), presets);
  expect(readFileSync(path, "utf8")).toBe(howToUse(presets));
  age(path, 60);
  const before = statSync(path).mtimeMs;
  writeHowTo(root(), presets);
  expect(statSync(path).mtimeMs).toBe(before);
  writeHowTo(root(), presets, waitUrl);
  expect(readFileSync(path, "utf8")).toBe(howToUse(presets, waitUrl));
  expect(existsSync(path)).toBe(true);
});
