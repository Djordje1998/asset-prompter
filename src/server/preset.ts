import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Preset, PresetMode, PresetModel, PresetSection, VersionMeta } from "../shared/types";
import { parseDoc } from "./frontmatter";

// A preset is presets/<tool>.md: YAML frontmatter with the tool's models and settings, and notes for the agent
// in the body. A picture named presets/<tool>.<ext> next to it is the tool's logo. Nothing about any one tool
// is in the code: to add a tool, add a file; to change what a tool offers, edit it.

export const LOGO_EXTENSIONS = ["svg", "png", "webp", "jpg", "jpeg"];

const strings = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map(String) : undefined);

function readModel(raw: unknown): PresetModel | null {
  if (!raw || typeof raw !== "object" || typeof (raw as { name?: unknown }).name !== "string") return null;
  const d = raw as Record<string, unknown>;
  const model: PresetModel = { name: d.name as string };
  if (strings(d.modes)) model.modes = strings(d.modes)!.map((m) => m.toLowerCase());
  if (strings(d.durations)) model.durations = strings(d.durations)!.map(normDuration);
  if (strings(d.resolutions)) model.resolutions = strings(d.resolutions);
  if (strings(d.aspect_ratios)) model.aspect_ratios = strings(d.aspect_ratios);
  if (typeof d.max_inputs === "number") model.max_inputs = d.max_inputs;
  if (typeof d.about === "string") model.about = d.about;
  return model;
}

function readModes(raw: unknown): Record<string, PresetMode> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const modes: Record<string, PresetMode> = {};
  for (const [name, def] of Object.entries(raw as Record<string, unknown>)) {
    const d = def && typeof def === "object" ? (def as Record<string, unknown>) : {};
    const mode: PresetMode = { roles: strings(d.roles) ?? [] };
    if (typeof d.needs === "string") mode.needs = d.needs;
    if (typeof d.about === "string") mode.about = d.about;
    modes[name.toLowerCase()] = mode;
  }
  return modes;
}

function readSection(raw: unknown): PresetSection | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  const models = Array.isArray(d.models) ? d.models.map(readModel).filter((m): m is PresetModel => m !== null) : [];
  const section: PresetSection = { models };
  if (strings(d.aspect_ratios)) section.aspect_ratios = strings(d.aspect_ratios);
  const modes = readModes(d.modes);
  if (modes) section.modes = modes;
  return section;
}

/** "8" -> "8s", "4-30" -> "4-30s", as the version files are read. */
function normDuration(value: string): string {
  const v = value.trim().toLowerCase().replace(/\s+/g, "");
  return /^\d+(-\d+)?$/.test(v) ? `${v}s` : v;
}

export function loadPresets(dir: string): Preset[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir);
  const presets: Preset[] = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".md")) continue;
    const doc = parseDoc(readFileSync(join(dir, file), "utf8"));
    if (doc.error || typeof doc.data.tool !== "string") {
      console.warn(`Skipping preset ${file}: ${doc.error ?? "missing tool"}`);
      continue;
    }
    const d = doc.data as Record<string, unknown>;
    const tool = d.tool as string;
    const logoFile = LOGO_EXTENSIONS.map((ext) => `${tool}.${ext}`).find((name) => files.includes(name));
    const checked = d.checked instanceof Date ? d.checked.toISOString().slice(0, 10) : typeof d.checked === "string" ? d.checked : null;
    presets.push({
      tool,
      name: typeof d.name === "string" ? d.name : tool,
      short: typeof d.short === "string" ? d.short : typeof d.name === "string" ? d.name : tool,
      prompt_limit: typeof d.prompt_limit === "number" ? d.prompt_limit : null,
      checked,
      logo: logoFile ? `/api/presets/${encodeURIComponent(tool)}/logo` : null,
      image: readSection(d.image),
      video: readSection(d.video),
      notes: doc.body,
    });
  }
  return presets;
}

/** The file that holds a preset's logo, or null. */
export function logoPath(dir: string, tool: string): string | null {
  for (const ext of LOGO_EXTENSIONS) {
    const path = join(dir, `${tool}.${ext}`);
    if (existsSync(path)) return path;
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A duration entry is a value like "8s" or a range like "4-30s" of whole seconds. */
export function durationAllowed(offered: string[], value: string): boolean {
  const seconds = /^(\d+)s$/.exec(value);
  for (const entry of offered) {
    if (entry === value) return true;
    const range = /^(\d+)-(\d+)s$/.exec(entry);
    if (range && seconds && Number(seconds[1]) >= Number(range[1]) && Number(seconds[1]) <= Number(range[2])) return true;
  }
  return false;
}

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
  const list = (items: string[]) => items.join(", ");

  const model = meta.model ? section.models.find((m) => norm(m.name) === norm(meta.model!)) : undefined;
  if (meta.model && !model) {
    warnings.push(`Model "${meta.model}" is not in the ${where} preset (${list(section.models.map((m) => m.name))}).`);
  }
  const ratios = model?.aspect_ratios ?? section.aspect_ratios;
  if (meta.aspect_ratio && ratios && !ratios.includes(meta.aspect_ratio)) {
    warnings.push(`Aspect ratio ${meta.aspect_ratio} is not offered for ${model?.aspect_ratios ? model.name : where} (${list(ratios)}).`);
  }
  if (model) {
    if (meta.mode && model.modes && !model.modes.includes(meta.mode)) {
      warnings.push(`${model.name} does not support mode "${meta.mode}" (${list(model.modes)}).`);
    }
    if (meta.duration && model.durations && !durationAllowed(model.durations, meta.duration)) {
      warnings.push(`${model.name} does not offer duration ${meta.duration} (${list(model.durations)}).`);
    }
    if (meta.resolution && !(model.resolutions ?? []).includes(meta.resolution)) {
      warnings.push(
        model.resolutions
          ? `${model.name} does not offer resolution ${meta.resolution} (${list(model.resolutions)}).`
          : `${model.name} has no resolution setting.`,
      );
    }
    if (model.max_inputs !== undefined && inputRoles.length > model.max_inputs) {
      warnings.push(`${model.name} takes at most ${model.max_inputs} input files; this version lists ${inputRoles.length}.`);
    }
  }
  if (section.modes) {
    const mode = meta.mode ? section.modes[meta.mode] : undefined;
    if (meta.mode && !mode) {
      warnings.push(`${preset.name} has no "${meta.mode}" mode for ${meta.type} (${list(Object.keys(section.modes))}).`);
    } else if (mode) {
      const has = (role: string) => inputRoles.includes(role);
      const strange = [...new Set(inputRoles.filter((r): r is string => r !== null && !mode.roles.includes(r)))];
      if (strange.length) {
        warnings.push(
          mode.roles.length
            ? `Mode "${meta.mode}" takes only ${list(mode.roles)}; this version has an input with role ${list(strange)}.`
            : `Mode "${meta.mode}" takes no inputs; this version has an input with role ${list(strange)}.`,
        );
      }
      if (mode.needs && !has(mode.needs)) warnings.push(`Mode "${meta.mode}" needs at least one input with role ${mode.needs}.`);
      if (mode.roles.includes("start_frame") && mode.roles.includes("end_frame") && has("end_frame") && !has("start_frame")) {
        warnings.push(`Mode "${meta.mode}" needs a start_frame when it has an end_frame.`);
      }
    } else if (meta.type === "video" && inputRoles.length > 0 && Object.keys(section.modes).length > 1) {
      warnings.push(`\`mode\` is not set; ${preset.name} video has modes ${list(Object.keys(section.modes))}.`);
    }
  }
  if (preset.prompt_limit !== null && promptLength > preset.prompt_limit) {
    warnings.push(`Prompt is ${promptLength} characters; ${preset.name} limit is ${preset.prompt_limit}.`);
  }
  return warnings;
}
