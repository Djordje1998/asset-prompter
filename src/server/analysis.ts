import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import type { Preset, Version } from "../shared/types";
import { describeInfo, findTool, probeMedia } from "./media";
import type { Project } from "./projects";
import { projectScans } from "./scans";
import { framesDirOf, scanProject } from "./store";

export const INFO_FILE = "info.md";
export const INPUTS_FILE = "inputs.txt";
const STATS_FILE = "stats.json";
/** Frames per second sampled for the motion numbers and the motion map. */
const RATE = 8;

interface VideoStats {
  /** Per second: how different each frame is from the first one, in % of full brightness range. */
  fromFirst: number[];
  /** Per second: how much consecutive frames differ. */
  frameToFrame: number[];
  /** How different the last frame is from the first. */
  loopDiff: number | null;
}

async function run(args: string[]): Promise<{ ok: boolean; log: string }> {
  const proc = Bun.spawn(args, { stdout: "ignore", stderr: "pipe" });
  const log = await new Response(proc.stderr).text();
  return { ok: (await proc.exited) === 0, log };
}

/** YAVG values printed by signalstats, one per frame. */
async function frameAverages(ffmpeg: string, video: string, graph: string): Promise<number[] | null> {
  const { ok, log } = await run([ffmpeg, "-hide_banner", "-nostats", "-i", video, "-filter_complex", `${graph},signalstats,metadata=print:key=lavfi.signalstats.YAVG`, "-f", "null", "-"]);
  if (!ok) return null;
  return [...log.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
}

const perSecond = (values: number[]) => {
  const out: number[] = [];
  for (let i = 0; i < values.length; i += RATE) {
    const chunk = values.slice(i, i + RATE);
    out.push(Math.round((chunk.reduce((a, b) => a + b, 0) / chunk.length / 255) * 1000) / 10);
  }
  return out;
};

/**
 * Everything an agent needs to judge a video from stills: one 2x2 frame sheet per second, the first and last
 * frame side by side, a motion map, and per-second motion numbers.
 */
export async function analyzeVideo(video: string): Promise<void> {
  const ffmpeg = findTool("ffmpeg");
  if (!ffmpeg) return;
  const dir = framesDirOf(video);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const sheets = await run([
    ffmpeg, "-y", "-loglevel", "error", "-i", video,
    "-vf", "fps=4,scale='if(gt(iw,ih),640,-2)':'if(gt(iw,ih),-2,640)',tile=2x2", "-q:v", "4", join(dir, "%03d.jpg"),
  ]);
  if (!sheets.ok) {
    console.warn(`ffmpeg could not extract frames from ${video}: ${sheets.log}`);
    rmSync(dir, { recursive: true, force: true });
    return;
  }

  const small = `fps=${RATE},scale=320:-2,format=gray`;
  const fromFirstGraph = `[0]${small},split[a][b];[b]trim=end_frame=1,loop=-1:1,setpts=N/${RATE}/TB[f];[a][f]blend=all_mode=difference:shortest=1`;
  const fromFirst = await frameAverages(ffmpeg, video, fromFirstGraph);
  const frameToFrame = await frameAverages(ffmpeg, video, `[0]${small},tblend=all_mode=difference`);
  if (fromFirst && frameToFrame) {
    const stats: VideoStats = {
      fromFirst: perSecond(fromFirst),
      frameToFrame: perSecond(frameToFrame),
      loopDiff: fromFirst.length ? Math.round((fromFirst.at(-1)! / 255) * 1000) / 10 : null,
    };
    writeFileSync(join(dir, STATS_FILE), JSON.stringify(stats));

    // Average difference from the first frame, painted red over a dimmed copy of that frame.
    const deviation = join(dir, "_deviation.png");
    const first = join(dir, "_first.png");
    const frames = Math.max(1, fromFirst.length);
    await run([
      ffmpeg, "-y", "-loglevel", "error", "-i", video, "-filter_complex",
      `[0]fps=${RATE},scale=640:-2,format=gray,split[a][b];[b]trim=end_frame=1,loop=-1:1,setpts=N/${RATE}/TB[f];[a][f]blend=all_mode=difference:shortest=1,tmix=frames=${frames},lutyuv=y='min(255,255*sqrt(max(val-2,0)/96))'`,
      "-update", "1", deviation,
    ]);
    await run([ffmpeg, "-y", "-loglevel", "error", "-i", video, "-vf", "scale=640:-2,format=gray", "-frames:v", "1", first]);
    if (existsSync(deviation) && existsSync(first)) {
      await run([
        ffmpeg, "-y", "-loglevel", "error", "-i", first, "-i", deviation, "-filter_complex",
        "[0]lutyuv=y='val*0.4'[bg];[bg]split=3[g][b][r0];[r0][1]blend=all_mode=addition[r];[g][b][r]mergeplanes=0x001020:gbrp,format=yuvj444p",
        "-q:v", "3", join(dir, "motion.jpg"),
      ]);
    }
    rmSync(deviation, { force: true });
    rmSync(first, { force: true });
  }

  await run([
    ffmpeg, "-y", "-loglevel", "error", "-i", video, "-sseof", "-0.5", "-i", video, "-filter_complex",
    "[0]scale=640:-2,trim=end_frame=1,setpts=PTS-STARTPTS[f];[1]scale=640:-2,reverse,trim=end_frame=1,setpts=PTS-STARTPTS[l];[f][l]hstack",
    "-frames:v", "1", "-q:v", "3", join(dir, "first-last.jpg"),
  ]);
}

export const hasAnalysis = (video: string) => existsSync(join(framesDirOf(video), STATS_FILE));

const relPath = (root: string, path: string) => relative(root, path).split(sep).join("/");

/**
 * Records which files were attached when the results were generated. Written once: later changes to the
 * source slots must not rewrite what this version was actually made from.
 */
export function recordInputs(root: string, version: Version, afterTheFact = false): void {
  const path = join(version.dir, INPUTS_FILE);
  if (version.inputs.length === 0 || existsSync(path) || !existsSync(version.dir)) return;
  const lines = version.inputs.map((input) => {
    const role = input.role ?? "input";
    if (!input.path || input.missing) return `${role}: missing (${input.source}: ${input.missing ?? "no file"})`;
    const origin = input.fromSlot
      ? ` (slot ${input.source} v${input.sourceVersion}, ${input.sourceApproved ? "approved" : "NOT approved yet: its newest pick"})`
      : "";
    return `${role}: ${relPath(root, input.path)}${origin}`;
  });
  if (afterTheFact) lines.unshift("# Recorded after the results were added; the inputs may have changed since.");
  writeFileSync(path, lines.join("\n") + "\n");
}

function readStats(video: string): VideoStats | null {
  try {
    return JSON.parse(readFileSync(join(framesDirOf(video), STATS_FILE), "utf8"));
  } catch {
    return null;
  }
}

/** The inputs recorded in vN/inputs.txt, one line each, without the header. */
export function recordedInputs(dir: string): string[] {
  const path = join(dir, INPUTS_FILE);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

/** A plain summary of the results in vN/ for the agent: sizes, lengths, motion numbers, mismatches. */
export function writeInfo(root: string, version: Version): void {
  if (!existsSync(version.dir)) return;
  if (version.results.length === 0) return rmSync(join(version.dir, INFO_FILE), { force: true });
  const name = `v${version.n}`;
  const lines = [
    `# ${name} results`,
    "",
    "<!-- Written by Asset Prompter. Edits are overwritten. -->",
    "",
  ];
  // The change request lives next to vN/, where an agent looking only inside vN/ misses it.
  if (version.changeRequest) {
    lines.push(
      "## CHANGE REQUEST: the human did not accept this result",
      "",
      ...version.changeRequest.split("\n").map((l) => `> ${l}`),
      "",
      `Write v${version.n + 1}.md: look at this result and ${name}.md, then write a new complete prompt that does what the human asked, plus your own fixes. In ${name}.review.md use \`verdict: revise\`. Do not approve ${name}.`,
      "",
    );
  }

  const inputsPath = join(version.dir, INPUTS_FILE);
  if (existsSync(inputsPath)) {
    lines.push("## Inputs attached when generating", "", ...readFileSync(inputsPath, "utf8").trim().split("\n").map((l) => (l.startsWith("#") ? l.slice(1).trim() : `- ${l}`)), "");
  }

  for (const c of version.results) {
    const info = c.info ?? probeMedia(c.path);
    lines.push(`## ${c.file}`, "", describeInfo(c.kind, info));
    if (c.kind === "video") {
      const frames = framesDirOf(c.path);
      const stem = basename(frames);
      if (c.frames.length) {
        lines.push(
          "",
          `- Frame sheets: ${stem}/001.jpg to ${String(c.frames.length).padStart(3, "0")}.jpg, one per second, four frames 250 ms apart, left to right, top to bottom.`,
        );
        if (existsSync(join(frames, "first-last.jpg"))) lines.push(`- First and last frame side by side: ${stem}/first-last.jpg`);
        if (existsSync(join(frames, "motion.jpg"))) lines.push(`- Motion map: ${stem}/motion.jpg. Red marks what changed during the clip, over a dimmed first frame.`);
      } else {
        lines.push("", "- No frame sheets: ffmpeg is not installed. Ask the human to describe the video.");
      }
      const stats = readStats(c.path);
      if (stats) {
        lines.push(
          `- Change from the first frame, per second, in % (0 = identical): ${stats.fromFirst.join(" ")}`,
          `- Movement between consecutive frames, per second, in %: ${stats.frameToFrame.join(" ")}`,
        );
        if (stats.loopDiff !== null) lines.push(`- Last frame differs from the first by ${stats.loopDiff} % (below about 2 % it loops without a visible jump; only matters if \`slot.md\` asks for a loop).`);
      }
      if (info?.audio) lines.push("- It has sound, which you cannot hear. If the sound matters, ask the human in your review.");
    }
    lines.push("");
  }

  if (version.resultWarnings.length) lines.push(`## Does not match ${name}.md`, "", ...version.resultWarnings.map((w) => `- ${w}`), "");
  const content = lines.join("\n");
  const path = join(version.dir, INFO_FILE);
  if (existsSync(path) && readFileSync(path, "utf8") === content) return;
  writeFileSync(path, content);
}

// ---- background queue ---------------------------------------------------

const findVersion = (project: Project, presets: Preset[], slot: string, n: number) =>
  scanProject(project.id, project.path, presets)
    .find((s) => s.name === slot)
    ?.versions.find((v) => v.n === n);

/** Rewrites vN/info.md from what is on disk now, e.g. after a result was removed or a change request written. */
export function refreshInfo(project: Project, presets: Preset[], slot: string, n: number): void {
  const version = findVersion(project, presets, slot, n);
  if (version) writeInfo(project.path, version);
  // Also the end of every background job: frame sheets and info.md are on disk now, whenever the watcher says so.
  projectScans.invalidate(project.path);
}

/** Runs one job at a time, so a batch of dropped videos does not start a dozen ffmpeg processes at once. */
let queue: Promise<void> = Promise.resolve();
const enqueue = (job: () => Promise<void>) => {
  queue = queue.then(job).catch((e) => console.warn(`Analysing results failed: ${e}`));
};

/** After results land: analyse new videos, record the inputs they were made from, and write vN/info.md. */
export function afterResults(project: Project, presets: Preset[], slot: string, n: number, videos: string[]): void {
  // Inputs are recorded right away, before anything else can change the slots they come from.
  const version = findVersion(project, presets, slot, n);
  if (version) recordInputs(project.path, version);
  enqueue(async () => {
    for (const video of videos) await analyzeVideo(video);
    refreshInfo(project, presets, slot, n);
  });
}

/** Results added while ffmpeg was missing, or before this version of the app, get their analysis on start. */
export function backfill(projects: () => Project[], presets: Preset[]): void {
  enqueue(async () => {
    for (const project of projects()) {
      // One scan serves every version, until a video is analysed: the folder may change while ffmpeg runs,
      // so from then on each version is read afresh. A scan per version made a start take seconds per project.
      let fresh = true;
      for (const slot of scanProject(project.id, project.path, presets)) {
        for (const version of slot.versions) {
          if (version.results.length === 0) continue;
          const videos = version.results.filter((c) => c.kind === "video" && !hasAnalysis(c.path));
          if (videos.length && findTool("ffmpeg")) {
            for (const c of videos) await analyzeVideo(c.path);
            fresh = false;
          }
          recordInputs(project.path, version, true);
          if (fresh) writeInfo(project.path, version);
          else refreshInfo(project, presets, slot.name, version.n);
        }
      }
      projectScans.invalidate(project.path);
    }
  });
}
