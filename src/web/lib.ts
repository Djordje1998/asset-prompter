import type { Status } from "../shared/types";

/** Fired after every request that changed something, so an older undo can no longer apply. */
export const CHANGED_EVENT = "app-changed";
/** Requests that change nothing in the slots: opening a folder, waking the agent, and an undo itself. */
const NOT_A_CHANGE = /^\/api\/open$|\/notify$|\/undo\//;

export async function call<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  if (method !== "GET" && !NOT_A_CHANGE.test(url)) window.dispatchEvent(new Event(CHANGED_EVENT));
  return data as T;
}

export const enc = encodeURIComponent;
export const slotUrl = (project: string, slot: string) => `/api/projects/${enc(project)}/slots/${enc(slot)}`;
export const versionUrl = (project: string, slot: string, n: number) => `${slotUrl(project, slot)}/versions/${n}`;

export const STATUS_LABEL: Record<Status, string> = {
  waiting_input: "Waiting for input",
  waiting_generation: "Needs generating",
  waiting_agent: "Agent's turn",
  waiting_review: "Needs your approval",
  approved: "Approved",
  empty: "No prompt yet",
};

/** Slots where the human has something to do: generate, or confirm what the agent approved. */
export const humanTurn = (counts: Record<Status, number>) => counts.waiting_generation + counts.waiting_review;

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** Images (or videos) on the clipboard, e.g. from a generator's "Copy image". */
export async function clipboardFiles(): Promise<File[]> {
  if (!navigator.clipboard?.read) throw new Error("This browser cannot read images from the clipboard. Point at the card and press Ctrl+V instead.");
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch (e) {
    if ((e as DOMException).name === "NotAllowedError") {
      throw new Error("The browser blocked clipboard access. Allow it for this page, or point at the card and press Ctrl+V.");
    }
    throw e;
  }
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/") || t.startsWith("video/"));
    if (!type) continue;
    const blob = await item.getType(type);
    files.push(new File([blob], `pasted.${type.split("/")[1]!.replace("jpeg", "jpg")}`, { type }));
  }
  if (files.length === 0) throw new Error("There is no image on the clipboard. Copy the image in the generator first.");
  return files;
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

export function onboardingMessage(projectPath: string): string {
  // The path comes from the server's OS, so its own separator is the right one to append with.
  const sep = projectPath.includes("\\") ? "\\" : "/";
  return [
    "When you need an image or a video, you request it through a folder of prompt files and I generate it by hand.",
    `Project folder: ${projectPath}`,
    `Read ${projectPath}${sep}HOW-TO-USE.md before you write anything there, and follow it exactly.`,
  ].join("\n");
}

export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

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
