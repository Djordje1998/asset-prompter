import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Result, MediaKind, Preset, ResolvedInput, Review, Slot, Status, Version, VersionMeta } from "../shared/types";
import { parseDoc } from "./frontmatter";
import { probeMedia, resultChecks } from "./media";
import { checkAgainstPreset } from "./preset";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg", ".ico"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);

export const VERSION_FILE = /^v(\d+)\.md$/;
export const APPROVED_FILE = "APPROVED";
export const SELECTED_FILE = "selected.txt";
export const TRASH_DIR = "_trash";
export const EXPORTS_DIR = "exports";
/** `changes` is a one-line summary of about 20 words shown above the prompt; only a clearly long one is flagged. */
const MAX_CHANGE_WORDS = 30;

/** The rule HOW-TO-USE.md gives agents: lowercase letters, digits and single hyphens between them. */
export const SLOT_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** `ext` includes the dot, as extname returns it; case does not matter. */
export function mediaKindOfExt(ext: string): MediaKind | null {
  const e = ext.toLowerCase();
  if (IMAGE_EXT.has(e)) return "image";
  if (VIDEO_EXT.has(e)) return "video";
  return null;
}

export const mediaKind = (file: string) => mediaKindOfExt(extname(file));

export const framesDirOf = (mediaPath: string) => mediaPath.replace(/\.[^.\\/]+$/, "") + ".frames";
/** Frame sheets are numbered; other files in a .frames folder are extras such as the motion map. */
export const SHEET_FILE = /^\d+\.(jpg|png)$/;
/** vN/ -> vN.review.md, written by the agent next to the version file. */
export const reviewPathOf = (versionDir: string) => `${versionDir}.review.md`;
export const changeRequestPathOf = (versionDir: string) => `${versionDir}.feedback.md`;

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
const fileSize = (p: string) => {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
};
const readText = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : null);
const str = (v: unknown): string | null => {
  if (v === undefined || v === null || typeof v === "object") return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
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

export function listResultFiles(versionDir: string): string[] {
  if (!existsSync(versionDir)) return [];
  return readdirSync(versionDir)
    .filter((f) => mediaKind(f) !== null && !isDir(join(versionDir, f)))
    .sort(byNumber);
}

export function readReview(versionDir: string): Review | null {
  const path = reviewPathOf(versionDir);
  const raw = readText(path);
  if (raw === null) return null;
  const doc = parseDoc(raw);
  const errors: string[] = [];
  if (doc.error) errors.push(doc.error);
  const verdict = str(doc.data.verdict)?.toLowerCase() ?? null;
  if (!doc.error && verdict !== "approve" && verdict !== "revise") errors.push("`verdict` must be approve or revise.");
  return {
    verdict: verdict === "approve" || verdict === "revise" ? verdict : null,
    pick: str(doc.data.pick),
    text: doc.body,
    errors,
    at: mtime(path),
  };
}

/** The human's pick wins; without one, the agent's pick from its review; a lone result is always chosen. */
export function selection(versionDir: string, files = listResultFiles(versionDir)): { file: string | null; by: "human" | "agent" | null } {
  if (files.length === 1) return { file: files[0]!, by: null };
  const chosen = readText(join(versionDir, SELECTED_FILE))?.trim();
  if (chosen && files.includes(chosen)) return { file: chosen, by: "human" };
  const pick = readReview(versionDir)?.pick;
  if (pick && files.includes(pick)) return { file: pick, by: "agent" };
  return { file: null, by: null };
}

export function readApproved(slotDir: string): number | null {
  const m = /^v?(\d+)$/.exec(readText(join(slotDir, APPROVED_FILE))?.trim() ?? "");
  return m ? Number(m[1]) : null;
}

export function readMeta(data: Record<string, unknown>): VersionMeta {
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
  const changeWords = meta.changes?.split(/\s+/).length ?? 0;
  if (changeWords > MAX_CHANGE_WORDS) warnings.push(`\`changes\` has ${changeWords} words; keep it to one short sentence of about 20.`);

  const files = listResultFiles(dir);
  const results: Result[] = files.map((file) => {
    const abs = join(dir, file);
    const kind = mediaKind(file)!;
    const framesDir = framesDirOf(abs);
    const frames =
      kind === "video" && existsSync(framesDir)
        ? readdirSync(framesDir)
            .filter((f) => SHEET_FILE.test(f))
            .sort(byNumber)
            .map((f) => fileUrl(projectId, root, join(framesDir, f)))
        : [];
    return { file, kind, url: fileUrl(projectId, root, abs), path: abs, frames, info: probeMedia(abs), bytes: fileSize(abs) };
  });
  const picked = selection(dir, files);
  const changeRequestPath = changeRequestPathOf(dir);

  return {
    n,
    raw,
    prompt: doc.body,
    meta,
    inputs: [],
    rawInputs,
    results,
    selected: picked.file,
    selectedBy: picked.by,
    changeRequest: readText(changeRequestPath)?.trim() || null,
    changeRequestAt: mtime(changeRequestPath),
    review: readReview(dir),
    errors,
    warnings,
    resultWarnings: resultChecks(`v${n}.md asks for`, meta, results),
    resultNotes: resultChecks("the settings ask for", meta, results),
    path,
    dir,
  };
}

/** Versions written into a Done slot; agents must not, and the app ignores them until the approval is removed. */
function lateVersions(versions: Version[], approved: number | null): number[] {
  if (approved === null || !versions.some((v) => v.n === approved)) return [];
  return versions.filter((v) => v.n > approved).map((v) => v.n);
}

function slotStatus(versions: Version[], approved: number | null): Status {
  const latest = versions.at(-1);
  if (!latest) return "empty";
  // The human's approval is final: only the human reopens a slot, by removing it.
  if (approved !== null && versions.some((v) => v.n === approved)) return "approved";
  if (latest.results.length === 0) return "waiting_generation";
  // Every result goes to the agent first; the human confirms what the agent approves.
  const review = latest.review;
  // A change request means the human did not accept the result: the agent owes the next version.
  if (latest.changeRequest) return "waiting_agent";
  if (!review || review.verdict === null) return "waiting_agent";

  if (latest.results.some((c) => mtime(c.path) > review.at)) return "waiting_agent";
  if (review.verdict === "revise") return "waiting_agent";
  return "waiting_review";
}

/** The asset another slot gets when it references this one: the approved pick, else the newest pick. */
function slotAsset(slot: Slot): { result: Result | null; version: number | null; approved: boolean; missing: string | null } {
  const pick = (v: Version) => v.results.find((c) => c.file === v.selected) ?? null;
  const approved = slot.versions.find((v) => v.n === slot.approved);
  if (approved && pick(approved)) return { result: pick(approved), version: approved.n, approved: true, missing: null };
  const withMedia = [...slot.versions].reverse().find((v) => v.results.length > 0);
  if (!withMedia) return { result: null, version: null, approved: false, missing: "Not generated yet" };
  const chosen = pick(withMedia);
  return chosen
    ? { result: chosen, version: withMedia.n, approved: false, missing: null }
    : { result: null, version: withMedia.n, approved: false, missing: `No candidate selected in v${withMedia.n}` };
}

function resolveInput(projectId: string, root: string, input: RawInput, slots: Map<string, Slot>): ResolvedInput {
  const base = { role: input.role, source: input.slot ?? input.path ?? "", fromSlot: input.slot !== null, sourceVersion: null, sourceApproved: false };
  if (input.slot) {
    const slot = slots.get(input.slot);
    if (!slot) return { ...base, kind: null, url: null, path: null, missing: "Slot does not exist" };
    const { result, version, approved, missing } = slotAsset(slot);
    return {
      ...base,
      kind: result?.kind ?? null,
      url: result?.url ?? null,
      path: result?.path ?? null,
      missing,
      sourceVersion: version,
      sourceApproved: approved,
    };
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
      status: slotStatus(versions, approved),
      versions,
      approved: approved !== null && versions.some((v) => v.n === approved) ? approved : null,
      waitingFor: [],
      finalPath: finalFile ? join(slotDir, finalFile) : null,
      variants: listResultFiles(join(slotDir, EXPORTS_DIR)).map((file) => {
        const abs = join(slotDir, EXPORTS_DIR, file);
        return { file, kind: mediaKind(file)!, url: fileUrl(projectId, root, abs), path: abs, frames: [], info: probeMedia(abs), bytes: fileSize(abs) };
      }),
      // Only flagged, never renamed: other files and agents may already refer to the folder by this name.
      warnings: [
        ...(SLOT_NAME.test(name) ? [] : [`"${name}" is not a valid slot name: use lowercase letters, digits and hyphens, like hero-banner.`]),
        ...lateVersions(versions, approved).map((n) => `v${n}.md was written after v${approved} was approved, so it is ignored. Remove the approval to work on it.`),
      ],
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

  // A slot built from another slot's result waits until that result is approved, so it is never
  // generated from a draft that may still change.
  for (const slot of slots.values()) {
    if (slot.status !== "waiting_generation") continue;
    const latest = slot.versions.at(-1)!;
    slot.waitingFor = [...new Set(latest.inputs.filter((i) => i.fromSlot && !i.sourceApproved).map((i) => i.source))];
    if (slot.waitingFor.length) slot.status = "waiting_input";
  }

  return [...slots.values()].sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name));
}

export function countStatuses(slots: Slot[]): Record<Status, number> {
  const counts: Record<Status, number> = { waiting_input: 0, waiting_generation: 0, waiting_review: 0, waiting_agent: 0, approved: 0, empty: 0 };
  for (const slot of slots) counts[slot.status]++;
  return counts;
}
