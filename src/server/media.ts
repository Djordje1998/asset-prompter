import { closeSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MediaInfo, MediaKind, VersionMeta } from "../shared/types";
import { CONFIG_PATH } from "./config";

/** How long a lookup of ffmpeg or ffprobe on the PATH is trusted; installing one while the app runs shows up after it. */
const TOOL_TTL_MS = 10_000;
const tools = new Map<string, { path: string | null; at: number }>();

/**
 * Bun.which, remembered for a few seconds. A lookup tries every PATH folder with every PATHEXT ending, a few
 * milliseconds on Windows, and a scan asks once per result.
 */
export function findTool(name: string): string | null {
  const hit = tools.get(name);
  if (hit && Date.now() - hit.at < TOOL_TTL_MS) return hit.path;
  const path = Bun.which(name);
  tools.set(name, { path, at: Date.now() });
  return path;
}

/** Per file, the last probe and the size and time it was made for; a changed file is probed again. */
let cache: Map<string, { stamp: string; info: MediaInfo | null }> | null = null;

/**
 * Video probes outlive the server in a file next to config.json: ffprobe takes tens of milliseconds a file, and
 * without this every start would probe every video of every project again before the page could load.
 */
const CACHE_PATH = join(dirname(CONFIG_PATH), "media-cache.json");
/** Enough for every result anyone keeps; past it the oldest entries go. */
const CACHE_MAX = 20_000;
let saving: Timer | null = null;

function loadCache(): Map<string, { stamp: string; info: MediaInfo | null }> {
  if (cache) return cache;
  cache = new Map();
  try {
    const saved = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Record<string, { stamp: string; info: MediaInfo | null }>;
    for (const [path, entry] of Object.entries(saved)) if (typeof entry?.stamp === "string") cache.set(path, entry);
  } catch {
    // None yet, or unreadable: it is only a cache, probing fills it again.
  }
  return cache;
}

/** Writes the cache a moment after the last new probe, so a scan of many videos writes it once. */
function saveCacheSoon(): void {
  if (saving) clearTimeout(saving);
  saving = setTimeout(() => {
    saving = null;
    const entries = [...loadCache()].slice(-CACHE_MAX);
    try {
      writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(entries)));
    } catch (e) {
      console.warn(`Cannot save ${CACHE_PATH}: ${(e as Error).message}`);
    }
  }, 2000);
}

/**
 * Size and length of a result. Images are measured from their first bytes, which is instant and needs no
 * ffprobe; videos (and images in a format not read here) go to ffprobe. Null when nothing can read the file.
 */
export function probeMedia(path: string): MediaInfo | null {
  let stamp: string;
  try {
    const st = statSync(path);
    stamp = `${st.mtimeMs}|${st.size}`;
  } catch {
    return null;
  }
  const known = loadCache();
  const hit = known.get(path);
  if (hit?.stamp === stamp) return hit.info;
  const size = HEADER_IMAGE.test(path) ? imageSize(path) : null;
  if (size) {
    // Not kept on disk: reading the header again costs less than the cache would.
    const info = { ...size, duration: null, audio: false };
    known.set(path, { stamp, info });
    return info;
  }
  const ffprobe = findTool("ffprobe");
  if (!ffprobe) return null;
  const proc = Bun.spawnSync([ffprobe, "-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", path]);
  let info: MediaInfo | null = null;
  if (proc.exitCode === 0) {
    try {
      const data = JSON.parse(proc.stdout.toString()) as { streams?: Record<string, any>[]; format?: { duration?: string } };
      const video = data.streams?.find((s) => s.codec_type === "video");
      const duration = Number(data.format?.duration);
      info = {
        width: video?.width ?? null,
        height: video?.height ?? null,
        duration: Number.isFinite(duration) && duration > 0.1 ? duration : null,
        audio: data.streams?.some((s) => s.codec_type === "audio") ?? false,
      };
    } catch {
      info = null;
    }
  }
  // Moved to the end, so the newest stay when the file is trimmed to CACHE_MAX.
  known.delete(path);
  known.set(path, { stamp, info });
  saveCacheSoon();
  return info;
}

/** The image formats whose size imageSize reads. */
const HEADER_IMAGE = /\.(png|jpe?g|gif|webp|avif)$/i;

/** Reads `length` bytes at `position`; fewer at the end of the file. */
function readAt(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  return buf.subarray(0, readSync(fd, buf, 0, length, position));
}

/**
 * Width and height from an image file's header: PNG, GIF, WebP and AVIF keep them in the first bytes, JPEG in
 * its frame header after the metadata segments, which are skipped by their lengths. Null for anything else
 * (SVG, ICO, a damaged file), which then goes to ffprobe.
 */
export function imageSize(path: string): { width: number; height: number } | null {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return null;
  }
  try {
    const head = readAt(fd, 0, 4096);
    const ok = (w: number, h: number) => (w > 0 && h > 0 ? { width: w, height: h } : null);
    // PNG: the IHDR chunk comes first.
    if (head.length >= 24 && head.readUInt32BE(0) === 0x89504e47 && head.toString("latin1", 12, 16) === "IHDR") {
      return ok(head.readUInt32BE(16), head.readUInt32BE(20));
    }
    // GIF: the logical screen size.
    if (head.length >= 10 && head.toString("latin1", 0, 4) === "GIF8") return ok(head.readUInt16LE(6), head.readUInt16LE(8));
    // WebP: lossy (VP8), lossless (VP8L) or extended (VP8X).
    if (head.length >= 30 && head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP") {
      const chunk = head.toString("latin1", 12, 16);
      if (chunk === "VP8 ") return ok(head.readUInt16LE(26) & 0x3fff, head.readUInt16LE(28) & 0x3fff);
      if (chunk === "VP8L") {
        const bits = head.readUInt32LE(21);
        return ok((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
      }
      if (chunk === "VP8X") return ok(head.readUIntLE(24, 3) + 1, head.readUIntLE(27, 3) + 1);
      return null;
    }
    // AVIF: the image's "ispe" box; with several (a thumbnail, an alpha plane) the largest is the picture.
    if (head.length >= 12 && head.toString("latin1", 4, 8) === "ftyp" && /avi[fs]/.test(head.toString("latin1", 8, 32))) {
      let best: { width: number; height: number } | null = null;
      for (let i = head.indexOf("ispe", 0, "latin1"); i >= 0 && i + 16 <= head.length; i = head.indexOf("ispe", i + 4, "latin1")) {
        const w = head.readUInt32BE(i + 8);
        const h = head.readUInt32BE(i + 12);
        if (w * h > (best ? best.width * best.height : 0)) best = { width: w, height: h };
      }
      return best && ok(best.width, best.height);
    }
    // JPEG: walk the segments to the first start-of-frame marker.
    if (head.length >= 4 && head[0] === 0xff && head[1] === 0xd8) {
      let pos = 2;
      for (let steps = 0; steps < 1000; steps++) {
        const seg = readAt(fd, pos, 9);
        if (seg.length < 4 || seg[0] !== 0xff) return null;
        const marker = seg[1]!;
        // Fill bytes before a marker.
        if (marker === 0xff) {
          pos += 1;
          continue;
        }
        // Start of frame: every SOFn but DHT (C4), JPG (C8) and DAC (CC).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return seg.length >= 9 ? ok(seg.readUInt16BE(7), seg.readUInt16BE(5)) : null;
        }
        pos += 2 + seg.readUInt16BE(2);
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

/** "8s", "8", "8 s" → 8. */
export function parseSeconds(value: string | null): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*s?$/i.exec(value?.trim() ?? "");
  return m ? Number(m[1]) : null;
}

function parseRatio(value: string | null): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(value?.trim() ?? "");
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
}

const RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"];

function describeRatio(w: number, h: number): string {
  const near = RATIOS.find((r) => Math.abs(parseRatio(r)! / (w / h) - 1) < 0.02);
  return near ?? (w / h).toFixed(2);
}

export interface CheckedResult {
  file: string;
  kind: MediaKind;
  info: MediaInfo | null;
}

/**
 * Plain-language differences between what the version file asked for and what was dropped in.
 * `asksFor` names who asked, for the reader: "v1.md asks for" for an agent, "the settings ask for" in the app.
 */
export function resultChecks(asksFor: string, meta: VersionMeta, results: CheckedResult[]): string[] {
  const warnings: string[] = [];
  if (results.length === 0) return warnings;
  const seconds = parseSeconds(meta.duration);
  const ratio = parseRatio(meta.aspect_ratio);
  for (const r of results) {
    if (meta.type === "image" || meta.type === "video") {
      if (r.kind !== meta.type) warnings.push(`${r.file} is ${r.kind === "image" ? "an image" : "a video"}; ${asksFor} ${meta.type === "image" ? "an image" : "a video"}.`);
    }
    if (!r.info) continue;
    if (r.kind === "video" && seconds !== null && r.info.duration !== null && Math.abs(r.info.duration - seconds) > 0.6) {
      warnings.push(`${r.file} is ${r.info.duration.toFixed(1)}s; ${asksFor} ${meta.duration}. Check the model and length chosen in the generator.`);
    }
    const { width, height } = r.info;
    if (ratio !== null && width && height && Math.abs(width / height / ratio - 1) > 0.03) {
      warnings.push(`${r.file} is ${width}x${height} (${describeRatio(width, height)}); ${asksFor} ${meta.aspect_ratio}.`);
    }
  }
  return warnings;
}

export function describeInfo(kind: MediaKind, info: MediaInfo | null): string {
  if (!info) return kind;
  const parts: string[] = [kind];
  if (info.width && info.height) parts.push(`${info.width}x${info.height} (${describeRatio(info.width, info.height)})`);
  if (kind === "video") {
    if (info.duration !== null) parts.push(`${info.duration.toFixed(1)}s`);
    parts.push(info.audio ? "has sound" : "no sound");
  }
  return parts.join(", ");
}
