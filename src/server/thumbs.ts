import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_PATH } from "./config";
import { findTool, imageSize } from "./media";

/**
 * Small copies of result images for the tiles and strips of the page, which show a picture a few hundred pixels
 * wide: a generator's 4 MB original decoded a hundred times over makes the Done tab heavy. Made by ffmpeg on the
 * first request and kept next to config.json, never in a project, where an agent would see them. Without ffmpeg,
 * or for a picture already small, the original is served as before.
 */

/** Wide enough for the widest tile on a high-density screen. */
export const THUMB_WIDTH = 640;
const DIR = join(dirname(CONFIG_PATH), "thumbs");
/** Still pictures ffmpeg reads; a GIF may move, and a thumbnail would stop it. */
const THUMBABLE = /\.(png|jpe?g|webp|avif)$/i;
/** Thumbnails kept at most; past it the ones least recently shown go. */
const KEEP = 5000;
/** At most this many ffmpeg processes at once, however many tiles a page asks for together. */
const AT_ONCE = 3;

const making = new Map<string, Promise<string | null>>();
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= AT_ONCE) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** The thumbnail of an image, made if needed; null to serve the original instead. */
export async function thumbnail(path: string): Promise<string | null> {
  if (!THUMBABLE.test(path)) return null;
  let stamp: string;
  try {
    const st = statSync(path);
    stamp = `${path}|${st.mtimeMs}|${st.size}`;
  } catch {
    return null;
  }
  // AVIF is not always measured from its header; ffmpeg still reads it, and scaling up is avoided below.
  const size = imageSize(path);
  if (size && size.width <= THUMB_WIDTH * 1.25) return null;
  const out = join(DIR, `${createHash("sha1").update(stamp).digest("hex")}.webp`);
  if (existsSync(out)) {
    // Marks it as recently shown, for prune().
    const now = new Date();
    try {
      utimesSync(out, now, now);
    } catch {}
    return out;
  }
  const ffmpeg = findTool("ffmpeg");
  if (!ffmpeg) return null;
  let job = making.get(out);
  if (!job) {
    job = slot(async () => {
      mkdirSync(DIR, { recursive: true });
      // Written under another name and renamed, so a half-written thumbnail is never served.
      const tmp = `${out}.${process.pid}.tmp.webp`;
      const proc = Bun.spawn([ffmpeg, "-y", "-loglevel", "error", "-i", path, "-vf", `scale='min(${THUMB_WIDTH},iw)':-1`, "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", tmp], {
        stdout: "ignore",
        stderr: "pipe",
      });
      if ((await proc.exited) !== 0) {
        rmSync(tmp, { force: true });
        console.warn(`ffmpeg could not make a thumbnail of ${path}: ${(await new Response(proc.stderr).text()).trim()}`);
        return null;
      }
      renameSync(tmp, out);
      return out;
    }).finally(() => making.delete(out));
    making.set(out, job);
  }
  return job;
}

/** Trims the kept thumbnails to the most recently shown; run on start. */
export function pruneThumbnails(): void {
  let files: { path: string; at: number }[];
  try {
    files = readdirSync(DIR).map((f) => {
      const path = join(DIR, f);
      return { path, at: statSync(path).mtimeMs };
    });
  } catch {
    return;
  }
  // Leftovers of a run stopped mid-write, and the oldest past the limit.
  for (const f of files) if (f.path.endsWith(".tmp.webp")) rmSync(f.path, { force: true });
  const kept = files.filter((f) => !f.path.endsWith(".tmp.webp")).sort((a, b) => b.at - a.at);
  for (const f of kept.slice(KEEP)) rmSync(f.path, { force: true });
}
