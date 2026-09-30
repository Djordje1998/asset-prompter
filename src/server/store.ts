import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Candidate, MediaKind, Preset, ResolvedInput, Slot, Status, Version, VersionMeta } from "../shared/types";
import { parseDoc } from "./frontmatter";
import { checkAgainstPreset } from "./preset";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);

export const VERSION_FILE = /^v(\d+)\.md$/;
export const APPROVED_FILE = "APPROVED";
export const SELECTED_FILE = "selected.txt";
export const TRASH_DIR = "_trash";

export function mediaKind(file: string): MediaKind | null {
  const ext = extname(file).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
}

export const framesDirOf = (mediaPath: string) => mediaPath.replace(/\.[^.\\/]+$/, "") + ".frames";

const isDir = (p: string) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const mtime = (p: string) => {
  try {
    return Math.floor(statSync(p).mtimeMs);
  } catch {
    return 0;
  }
};
const readText = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : null);
const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function fileUrl(projectId: string, root: string, abs: string): string {
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) return `/api/ext-file?path=${encodeURIComponent(abs)}&t=${mtime(abs)}`;
  const encoded = rel.split(sep).map(encodeURIComponent).join("/");
  return `/files/${encodeURIComponent(projectId)}/${encoded}?t=${mtime(abs)}`;
}

export function listSlotNames(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => !name.startsWith("_") && !name.startsWith(".") && isDir(join(root, name)));
}

export function listVersionNumbers(slotDir: string): number[] {
  if (!existsSync(slotDir)) return [];
  return readdirSync(slotDir)
    .map((f) => VERSION_FILE.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

export function listCandidateFiles(versionDir: string): string[] {
  if (!existsSync(versionDir)) return [];
  return readdirSync(versionDir)
    .filter((f) => mediaKind(f) !== null && !isDir(join(versionDir, f)))
    .sort(byNumber);
}

/** One candidate is always the selected one; with several, the user has to pick. */
export function selectedCandidate(versionDir: string, files = listCandidateFiles(versionDir)): string | null {
  if (files.length === 1) return files[0]!;
  const chosen = readText(join(versionDir, SELECTED_FILE))?.trim();
  return chosen && files.includes(chosen) ? chosen : null;
}

export function readApproved(slotDir: string): number | null {
  const m = /^v?(\d+)$/.exec(readText(join(slotDir, APPROVED_FILE))?.trim() ?? "");
  return m ? Number(m[1]) : null;
}

const str = (v: unknown): string | null => {
  if (v === undefined || v === null || typeof v === "object") return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

function readMeta(data: Record<string, unknown>): VersionMeta {
  const params: Record<string, string> = {};
  if (data.params && typeof data.params === "object" && !Array.isArray(data.params)) {
    for (const [k, v] of Object.entries(data.params)) params[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  let duration = str(data.duration);
  if (duration && /^\d+$/.test(duration)) duration += "s";
  return {
    tool: str(data.tool),
    type: str(data.type)?.toLowerCase() ?? null,
    model: str(data.model),
    mode: str(data.mode)?.toLowerCase() ?? null,
    aspect_ratio: str(data.aspect_ratio),
    outputs: str(data.outputs),
    duration,
    resolution: str(data.resolution),
    changes: str(data.changes),
    params,
  };
}

interface RawInput {
  role: string | null;
  slot: string | null;
  path: string | null;
}

function readInputs(data: Record<string, unknown>, errors: string[]): RawInput[] {
  if (data.inputs === undefined || data.inputs === null) return [];
  if (!Array.isArray(data.inputs)) {
    errors.push("`inputs` must be a list.");
    return [];
  }
  const inputs: RawInput[] = [];
  for (const item of data.inputs) {
    if (typeof item === "string") inputs.push({ role: null, slot: null, path: item });
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const input = { role: str(o.role), slot: str(o.slot), path: str(o.path) };
      if (!input.slot && !input.path) errors.push("Every input needs either `slot` or `path`.");
      else inputs.push(input);
    }
  }
  return inputs;
}

interface ScannedVersion extends Version {
  rawInputs: RawInput[];
}

function scanVersion(projectId: string, root: string, slotDir: string, n: number, presets: Preset[]): ScannedVersion {
  const path = join(slotDir, `v${n}.md`);
  const dir = join(slotDir, `v${n}`);
  const raw = readFileSync(path, "utf8");
  const doc = parseDoc(raw);
  const errors: string[] = [];
  if (doc.error) errors.push(doc.error);
  const meta = readMeta(doc.data);
  const rawInputs = readInputs(doc.data, errors);
  if (!doc.error) {
    if (!meta.model) errors.push("`model` is missing.");
    if (!meta.type) errors.push("`type` is missing (image or video).");
    else if (meta.type !== "image" && meta.type !== "video") errors.push(`\`type\` must be image or video, not "${meta.type}".`);
  }
  if (doc.body === "") errors.push("The prompt is empty.");

  const warnings: string[] = [];
  if (!doc.error && meta.tool) {
    const preset = presets.find((p) => p.tool === meta.tool);
    if (preset) warnings.push(...checkAgainstPreset(preset, meta, rawInputs.map((i) => i.role), doc.body.length));
  }

  const files = listCandidateFiles(dir);
  const candidates: Candidate[] = files.map((file) => {
    const abs = join(dir, file);
    const kind = mediaKind(file)!;
    const framesDir = framesDirOf(abs);
    const frames =
      kind === "video" && existsSync(framesDir)
        ? readdirSync(framesDir)
            .filter((f) => mediaKind(f) === "image")
            .sort(byNumber)
            .map((f) => fileUrl(projectId, root, join(framesDir, f)))
        : [];
    return { file, kind, url: fileUrl(projectId, root, abs), path: abs, frames };
  });

  return {
    n,
    raw,
    prompt: doc.body,
    meta,
    inputs: [],
    rawInputs,
    candidates,
    selected: selectedCandidate(dir, files),
    feedback: readText(join(slotDir, `v${n}.feedback.md`))?.trim() || null,
    errors,
    warnings,
    path,
    dir,
  };
}

function slotStatus(slotDir: string, versions: Version[], approved: number | null): Status {
  const latest = versions.at(-1);
  if (!latest) return "empty";
  if (approved !== null && versions.some((v) => v.n === approved)) {
    // A version written after the approval reopens the slot.
    const approvedAt = mtime(join(slotDir, APPROVED_FILE));
    const newer = versions.some((v) => v.n > approved && mtime(v.path) > approvedAt);
    if (!newer) return "approved";
  }
  if (latest.candidates.length === 0) return "waiting_generation";
  if (latest.feedback) return "waiting_agent";
  return "waiting_review";
}

/** The asset another slot gets when it references this one: the approved pick, else the newest pick. */
function slotAsset(slot: Slot): { candidate: Candidate | null; missing: string | null } {
  const pick = (v: Version) => v.candidates.find((c) => c.file === v.selected) ?? null;
  const approved = slot.versions.find((v) => v.n === slot.approved);
  if (approved && pick(approved)) return { candidate: pick(approved), missing: null };
  const withMedia = [...slot.versions].reverse().find((v) => v.candidates.length > 0);
  if (!withMedia) return { candidate: null, missing: "Not generated yet" };
  const chosen = pick(withMedia);
  return chosen ? { candidate: chosen, missing: null } : { candidate: null, missing: `No candidate selected in v${withMedia.n}` };
}

function resolveInput(projectId: string, root: string, input: RawInput, slots: Map<string, Slot>): ResolvedInput {
  const base = { role: input.role, source: input.slot ?? input.path ?? "", fromSlot: input.slot !== null };
  if (input.slot) {
    const slot = slots.get(input.slot);
    if (!slot) return { ...base, kind: null, url: null, path: null, missing: "Slot does not exist" };
    const { candidate, missing } = slotAsset(slot);
    return { ...base, kind: candidate?.kind ?? null, url: candidate?.url ?? null, path: candidate?.path ?? null, missing };
  }
  const abs = resolve(root, input.path!);
  const kind = mediaKind(abs);
  if (!existsSync(abs)) return { ...base, kind, url: null, path: abs, missing: "File not found" };
  if (!kind) return { ...base, kind: null, url: null, path: abs, missing: "Not an image or video file" };
  return { ...base, kind, url: fileUrl(projectId, root, abs), path: abs, missing: null };
}

export function scanProject(projectId: string, root: string, presets: Preset[]): Slot[] {
  const scanned = new Map<string, ScannedVersion[]>();
  const slots = new Map<string, Slot>();

  for (const name of listSlotNames(root)) {
    const slotDir = join(root, name);
    const versions = listVersionNumbers(slotDir).map((n) => scanVersion(projectId, root, slotDir, n, presets));
    const approved = readApproved(slotDir);
    const finalFile = readdirSync(slotDir).find((f) => /^final\.[^.]+$/.test(f) && mediaKind(f) !== null);
    const description = readText(join(slotDir, "slot.md"));
    scanned.set(name, versions);
    slots.set(name, {
      name,
      description: description ? parseDoc(description).body || null : null,
      path: slotDir,
      status: slotStatus(slotDir, versions, approved),
      versions,
      approved: approved !== null && versions.some((v) => v.n === approved) ? approved : null,
      finalPath: finalFile ? join(slotDir, finalFile) : null,
      createdAt: versions[0] ? mtime(versions[0].path) : Math.floor(statSync(slotDir).birthtimeMs || statSync(slotDir).mtimeMs),
    });
  }

  for (const [name, versions] of scanned) {
    for (const version of versions) {
      version.inputs = version.rawInputs.map((input) => resolveInput(projectId, root, input, slots));
      if (version.rawInputs.some((i) => i.slot === name)) version.errors.push("A slot cannot use itself as an input.");
      delete (version as Partial<ScannedVersion>).rawInputs;
    }
  }

  return [...slots.values()].sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name));
}

export function countStatuses(slots: Slot[]): Record<Status, number> {
  const counts: Record<Status, number> = { waiting_generation: 0, waiting_review: 0, waiting_agent: 0, approved: 0, empty: 0 };
  for (const slot of slots) counts[slot.status]++;
  return counts;
}
