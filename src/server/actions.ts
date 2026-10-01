import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { NewVersionInput } from "../shared/types";
import { parseDoc, writeDoc } from "./frontmatter";
import {
  APPROVED_FILE,
  SELECTED_FILE,
  TRASH_DIR,
  framesDirOf,
  listResultFiles,
  listVersionNumbers,
  mediaKind,
  mediaKindOfExt,
  readApproved,
  SLOT_NAME,
  selection,
} from "./store";

export class UserError extends Error {}

/** A single path segment coming from the client; refuses anything that could leave the folder. */
export function segment(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new UserError(`${what} is required.`);
  const s = value.trim();
  if (s === "." || s === ".." || /[\\/:*?"<>|\0]/.test(s)) throw new UserError(`${what} contains characters that are not allowed in a folder name.`);
  return s;
}

export function slugName(value: unknown, what: string): string {
  const s = segment(value, what);
  if (s.startsWith("_") || s.startsWith(".")) throw new UserError(`${what} cannot start with "_" or ".".`);
  return s;
}

/** Slots made in the app follow the same naming rule HOW-TO-USE.md gives agents; project names stay looser. */
export function slotName(value: unknown): string {
  const s = slugName(value, "Slot name");
  if (!SLOT_NAME.test(s)) throw new UserError(`Slot name "${s}" can only use lowercase letters, digits and single hyphens between them, like hero-banner.`);
  return s;
}

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

function trash(projectDir: string, source: string, label: string): void {
  const dir = join(projectDir, TRASH_DIR);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    renameSync(source, join(dir, `${stamp}_${label}`));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
      throw new UserError(
        `${basename(source)} is open in another program (a File Explorer window, a terminal, an editor or a media player). Close it there and try again.`,
      );
    }
    throw e;
  }
}

export function createSlot(projectDir: string, name: string, description: string, version: NewVersionInput): void {
  const slotDir = join(projectDir, name);
  if (existsSync(slotDir)) throw new UserError(`A slot named "${name}" already exists.`);
  mkdirSync(slotDir, { recursive: true });
  try {
    if (description.trim()) writeFileSync(join(slotDir, "slot.md"), description.trim() + "\n");
    addVersion(projectDir, name, version);
  } catch (e) {
    // A rejected first version must not leave a half-made slot behind.
    rmSync(slotDir, { recursive: true, force: true });
    throw e;
  }
}

export function addVersion(projectDir: string, slot: string, input: NewVersionInput): number {
  const slotDir = join(projectDir, slot);
  if (!existsSync(slotDir)) throw new UserError(`Slot "${slot}" does not exist.`);
  if (!input.prompt?.trim()) throw new UserError("The prompt is empty.");
  if (!input.model?.trim()) throw new UserError("Model is required.");
  if (input.type !== "image" && input.type !== "video") throw new UserError("Type must be image or video.");
  const n = (listVersionNumbers(slotDir).at(-1) ?? 0) + 1;
  const data: Record<string, unknown> = {};
  for (const key of ["tool", "type", "model", "mode", "aspect_ratio", "duration", "resolution", "changes"] as const) {
    const value = input[key]?.toString().trim();
    if (value) data[key] = value;
  }
  if (input.carryFrom && existsSync(join(slotDir, `v${input.carryFrom}.md`))) {
    const previous = parseDoc(readFileSync(join(slotDir, `v${input.carryFrom}.md`), "utf8")).data;
    if (previous.inputs) data.inputs = previous.inputs;
    if (previous.params) data.params = previous.params;
  }
  // "wx" so a version file written by an agent in the same instant is never overwritten.
  writeFileSync(join(slotDir, `v${n}.md`), writeDoc(data, input.prompt), { flag: "wx" });
  return n;
}

function versionDir(projectDir: string, slot: string, n: number): string {
  const slotDir = join(projectDir, slot);
  if (!existsSync(join(slotDir, `v${n}.md`))) throw new UserError(`${slot} has no v${n}.`);
  return join(slotDir, `v${n}`);
}

export async function addResults(projectDir: string, slot: string, n: number, files: File[]): Promise<string[]> {
  const dir = versionDir(projectDir, slot, n);
  const named = files.map((file) => {
    const ext = (extname(file.name) || MIME_EXT[file.type] || "").toLowerCase();
    if (!mediaKindOfExt(ext)) throw new UserError(`"${file.name}" is not an image or video this app can show.`);
    return { file, ext };
  });
  mkdirSync(dir, { recursive: true });
  // No pick is written here: with several results the agent picks, unless the human does.
  let next = Math.max(0, ...listResultFiles(dir).map((f) => parseInt(f, 10) || 0)) + 1;
  const written: string[] = [];
  for (const { file, ext } of named) {
    const name = `${next++}${ext}`;
    await Bun.write(join(dir, name), file);
    written.push(join(dir, name));
  }
  syncFinal(projectDir, slot);
  return written;
}

export function deleteResult(projectDir: string, slot: string, n: number, file: string): void {
  const dir = versionDir(projectDir, slot, n);
  const path = join(dir, file);
  if (!existsSync(path) || !mediaKind(file)) throw new UserError(`${file} does not exist in ${slot} v${n}.`);
  trash(projectDir, path, `${slot}_v${n}_${file}`);
  rmSync(framesDirOf(path), { recursive: true, force: true });
  // A pick of a removed file would only mislead the agent.
  const picked = join(dir, SELECTED_FILE);
  if (existsSync(picked) && readFileSync(picked, "utf8").trim() === file) unlinkSync(picked);
  syncFinal(projectDir, slot);
}

export function setSelected(projectDir: string, slot: string, n: number, file: string): void {
  const dir = versionDir(projectDir, slot, n);
  if (!listResultFiles(dir).includes(file)) throw new UserError(`${file} does not exist in ${slot} v${n}.`);
  writeFileSync(join(dir, SELECTED_FILE), file + "\n");
  syncFinal(projectDir, slot);
}

export function setChangeRequest(projectDir: string, slot: string, n: number, text: string): void {
  versionDir(projectDir, slot, n);
  const path = join(projectDir, slot, `v${n}.feedback.md`);
  if (text.trim()) writeFileSync(path, text.trim() + "\n");
  else if (existsSync(path)) unlinkSync(path);
}

export function setApproval(projectDir: string, slot: string, n: number | null): void {
  const slotDir = join(projectDir, slot);
  const marker = join(slotDir, APPROVED_FILE);
  if (n === null) {
    if (existsSync(marker)) unlinkSync(marker);
  } else {
    const dir = versionDir(projectDir, slot, n);
    const chosen = selection(dir);
    if (!chosen.file) {
      throw new UserError(listResultFiles(dir).length ? "Select one candidate before approving." : "There is nothing to approve yet.");
    }
    // Approving the agent's pick makes it the human's pick, so a later review cannot change the final file.
    if (chosen.by === "agent") writeFileSync(join(dir, SELECTED_FILE), chosen.file + "\n");
    writeFileSync(marker, `v${n}\n`);
  }
  syncFinal(projectDir, slot);
}

/** Keeps final.<ext> equal to the approved version's selected result, and drops the approval if that is gone. */
export function syncFinal(projectDir: string, slot: string): void {
  const slotDir = join(projectDir, slot);
  const approved = readApproved(slotDir);
  const dir = approved === null ? null : join(slotDir, `v${approved}`);
  const chosen = dir ? selection(dir).file : null;
  const target = chosen ? `final${extname(chosen).toLowerCase()}` : null;
  for (const f of readdirSync(slotDir)) {
    if (/^final\.[^.]+$/.test(f) && f !== target) unlinkSync(join(slotDir, f));
  }
  if (chosen && target) copyFileSync(join(dir!, chosen), join(slotDir, target));
  else if (approved !== null) unlinkSync(join(slotDir, APPROVED_FILE));
}

export function trashSlot(projectDir: string, slot: string): void {
  const slotDir = join(projectDir, slot);
  if (!existsSync(slotDir)) throw new UserError(`Slot "${slot}" does not exist.`);
  trash(projectDir, slotDir, basename(slotDir));
}
