import type { Slot, Status, Version } from "../shared/types";

export async function call<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const enc = encodeURIComponent;
export const slotUrl = (project: string, slot: string) => `/api/projects/${enc(project)}/slots/${enc(slot)}`;
export const versionUrl = (project: string, slot: string, n: number) => `${slotUrl(project, slot)}/versions/${n}`;

export const STATUS_LABEL: Record<Status, string> = {
  waiting_generation: "Needs generating",
  waiting_review: "Needs your review",
  waiting_agent: "Waiting for agent",
  approved: "Approved",
  empty: "No prompt yet",
};

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** Clipboards only take PNG reliably, so every image is redrawn as one. */
export async function copyImage(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (!blob) throw new Error("This image could not be copied.");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** Lets a result be dragged out of the page straight into a generator or a folder (Chromium browsers). */
export function dragOut(e: React.DragEvent, url: string, fileName: string): void {
  const absolute = new URL(url, location.href).href;
  e.dataTransfer.setData("DownloadURL", `application/octet-stream:${fileName}:${absolute}`);
  e.dataTransfer.setData("text/uri-list", absolute);
}

export const ROLE_LABEL: Record<string, string> = {
  start_frame: "Start frame",
  end_frame: "End frame",
  ingredient: "Ingredient",
  reference: "Reference",
};

const rel = (projectPath: string, path: string) =>
  path.startsWith(projectPath) ? path.slice(projectPath.length + 1).replaceAll("\\", "/") : path;

export function agentMessage(projectPath: string, slot: Slot, version: Version): string {
  const chosen = version.candidates.find((c) => c.file === version.selected) ?? version.candidates[0];
  const lines = [`Slot "${slot.name}" v${version.n} is generated. Project folder: ${projectPath}`];
  if (chosen) {
    lines.push(`Result: ${rel(projectPath, chosen.path)}`);
    if (chosen.kind === "video") lines.push(`It is a video. Review the frame sheets in ${rel(projectPath, chosen.path).replace(/\.[^.]+$/, "")}.frames/ in order.`);
  }
  if (version.feedback) lines.push(`My comment is in ${slot.name}/v${version.n}.feedback.md. Read it first.`);
  lines.push(
    `Review it as described in HOW-TO-USE.md. If it needs another attempt, write ${slot.name}/v${slot.versions.at(-1)!.n + 1}.md. If it is good, tell me and I will approve it.`,
  );
  return lines.join("\n");
}

export function onboardingMessage(projectPath: string): string {
  return [
    "When you need an image or a video, you request it through a folder of prompt files and I generate it by hand.",
    `Project folder: ${projectPath}`,
    `Read ${projectPath}/HOW-TO-USE.md before you write anything there, and follow it exactly.`,
  ].join("\n");
}

export function beep(): void {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "triangle";
      const at = ctx.currentTime + i * 0.14;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.25);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    // Browsers block audio until the page has been clicked once.
  }
}
