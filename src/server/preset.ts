import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Preset, PresetSection, VersionMeta } from "../shared/types";
import { parseDoc } from "./frontmatter";

export function loadPresets(dir: string): Preset[] {
  if (!existsSync(dir)) return [];
  const presets: Preset[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".md")) continue;
    const doc = parseDoc(readFileSync(join(dir, file), "utf8"));
    if (doc.error || typeof doc.data.tool !== "string") {
      console.warn(`Skipping preset ${file}: ${doc.error ?? "missing tool"}`);
      continue;
    }
    const d = doc.data as Record<string, any>;
    presets.push({
      tool: d.tool,
      name: typeof d.name === "string" ? d.name : d.tool,
      prompt_limit: typeof d.prompt_limit === "number" ? d.prompt_limit : null,
      image: d.image,
      video: d.video,
      notes: doc.body,
    });
  }
  return presets;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Preset mismatches are warnings, never errors: the preset may be older than the tool. */
export function checkAgainstPreset(
  preset: Preset,
  meta: VersionMeta,
  inputRoles: (string | null)[],
  promptLength: number,
): string[] {
  const warnings: string[] = [];
  const section: PresetSection | undefined = meta.type === "image" ? preset.image : meta.type === "video" ? preset.video : undefined;
  if (!section) return warnings;
  const where = `${preset.name} ${meta.type}`;

  const model = meta.model ? section.models.find((m) => norm(m.name) === norm(meta.model!)) : undefined;
  if (meta.model && !model) {
    warnings.push(`Model "${meta.model}" is not in the ${where} preset (${section.models.map((m) => m.name).join(", ")}).`);
  }
  if (meta.aspect_ratio && section.aspect_ratios && !section.aspect_ratios.includes(meta.aspect_ratio)) {
    warnings.push(`Aspect ratio ${meta.aspect_ratio} is not offered for ${where} (${section.aspect_ratios.join(", ")}).`);
  }
  if (meta.outputs && section.outputs && !section.outputs.map(String).includes(meta.outputs)) {
    warnings.push(`Outputs ${meta.outputs} is outside the ${where} range (${section.outputs.join(", ")}).`);
  }
  if (model) {
    if (meta.mode && model.modes && !model.modes.includes(meta.mode)) {
      warnings.push(`${model.name} does not support mode "${meta.mode}" (${model.modes.join(", ")}).`);
    }
    if (meta.duration && model.durations && !model.durations.includes(meta.duration)) {
      warnings.push(`${model.name} does not offer duration ${meta.duration} (${model.durations.join(", ")}).`);
    }
    if (meta.resolution && !(model.resolutions ?? []).includes(meta.resolution)) {
      warnings.push(
        model.resolutions
          ? `${model.name} does not offer resolution ${meta.resolution} (${model.resolutions.join(", ")}).`
          : `${model.name} has no resolution setting.`,
      );
    }
    if (model.max_inputs !== undefined && inputRoles.length > model.max_inputs) {
      warnings.push(`${model.name} takes at most ${model.max_inputs} input images; this version lists ${inputRoles.length}.`);
    }
  }
  if (meta.type === "video") {
    const has = (role: string) => inputRoles.includes(role);
    if (meta.mode === "frames" && !has("start_frame")) warnings.push(`Mode "frames" needs an input with role start_frame.`);
    if (meta.mode === "ingredients" && !has("ingredient")) warnings.push(`Mode "ingredients" needs at least one input with role ingredient.`);
    if (meta.mode === "text" && inputRoles.length > 0) warnings.push(`Mode "text" takes no inputs, but this version lists ${inputRoles.length}.`);
    if ((has("start_frame") || has("end_frame")) && has("ingredient")) warnings.push("Frames and ingredients cannot be combined in one generation.");
  }
  if (preset.prompt_limit !== null && promptLength > preset.prompt_limit) {
    warnings.push(`Prompt is ${promptLength} characters; ${preset.name} limit is ${preset.prompt_limit}.`);
  }
  return warnings;
}
