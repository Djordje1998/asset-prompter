import { statSync } from "node:fs";
import type { MediaInfo, MediaKind, VersionMeta } from "../shared/types";

const cache = new Map<string, MediaInfo | null>();

/** Size and length of a result, via ffprobe. Null when ffprobe is missing or cannot read the file. */
export function probeMedia(path: string): MediaInfo | null {
  const ffprobe = Bun.which("ffprobe");
  if (!ffprobe) return null;
  let key: string;
  try {
    const st = statSync(path);
    key = `${path}|${st.mtimeMs}|${st.size}`;
  } catch {
    return null;
  }
  if (cache.has(key)) return cache.get(key)!;
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
  cache.set(key, info);
  return info;
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

/** Plain-language differences between what the version file asked for and what was dropped in. */
export function resultChecks(versionName: string, meta: VersionMeta, results: CheckedResult[]): string[] {
  const warnings: string[] = [];
  if (results.length === 0) return warnings;
  const seconds = parseSeconds(meta.duration);
  const ratio = parseRatio(meta.aspect_ratio);
  for (const r of results) {
    if (meta.type === "image" || meta.type === "video") {
      if (r.kind !== meta.type) warnings.push(`${r.file} is ${r.kind === "image" ? "an image" : "a video"}; ${versionName} asks for ${meta.type === "image" ? "an image" : "a video"}.`);
    }
    if (!r.info) continue;
    if (r.kind === "video" && seconds !== null && r.info.duration !== null && Math.abs(r.info.duration - seconds) > 0.6) {
      warnings.push(`${r.file} is ${r.info.duration.toFixed(1)}s; ${versionName} asks for ${meta.duration}. Check the model and length chosen in the generator.`);
    }
    const { width, height } = r.info;
    if (ratio !== null && width && height && Math.abs(width / height / ratio - 1) > 0.03) {
      warnings.push(`${r.file} is ${width}x${height} (${describeRatio(width, height)}); ${versionName} asks for ${meta.aspect_ratio}.`);
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
