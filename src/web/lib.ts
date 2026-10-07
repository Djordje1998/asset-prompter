import type { Status } from "../shared/types";
import { chime } from "./chime";
import { serverText } from "./serverText";
import { LOCALE, lang, t } from "./i18n";

/** Fired after every request that changed something, so an older undo can no longer apply. */
export const CHANGED_EVENT = "app-changed";
/** Requests that change nothing in the slots: opening a folder, waking the agent, and an undo itself. */
const NOT_A_CHANGE = /^\/api\/open$|\/notify$|\/undo\//;
/** Requests that are the person's own and change no slot: an undo does, so it counts as theirs. */
const NOT_OWN = /^\/api\/open$|\/notify$/;

/** A failed request: `message` in the page's language, `serverMessage` as the server wrote it. */
export class ServerError extends Error {
  serverMessage: string | null = null;
}

export async function call<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  // The person's own change: what it causes must not chime as the agent's work.
  const done = method !== "GET" && !NOT_OWN.test(url) ? chime.mine(url, body) : null;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } finally {
    done?.();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Shown in the page's language; the server's own words stay on the error for code that tells them apart.
    const error = new ServerError(data.error ? serverText(data.error) : t("Request failed ({status})", { status: res.status }));
    error.serverMessage = data.error ?? null;
    throw error;
  }
  if (method !== "GET" && !NOT_A_CHANGE.test(url)) window.dispatchEvent(new Event(CHANGED_EVENT));
  return data as T;
}

/**
 * `next`, with every part that equals the same part of `prev` replaced by that part, and `prev` itself when
 * nothing differs. A reload that changed one slot then leaves every other slot the same object, so the cards
 * that show them can skip rendering, and a reload that changed nothing renders nothing.
 */
export function keepSame<T>(prev: T | null | undefined, next: T): T {
  if (Object.is(prev, next)) return prev as T;
  if (typeof prev !== "object" || typeof next !== "object" || prev === null || next === null || Array.isArray(prev) !== Array.isArray(next)) return next;
  if (Array.isArray(next)) {
    const old = prev as unknown[];
    const kept = next.map((item, i) => keepSame(old[i], item));
    return (kept.length === old.length && kept.every((item, i) => item === old[i]) ? prev : kept) as T;
  }
  const old = prev as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  let same = Object.keys(old).length === Object.keys(next).length;
  for (const [key, value] of Object.entries(next)) {
    kept[key] = keepSame(old[key], value);
    if (kept[key] !== old[key] || !(key in old)) same = false;
  }
  return (same ? prev : kept) as T;
}

export const enc = encodeURIComponent;

/**
 * A slot name as it is typed: lowercase letters, digits and single hyphens, the rule the server holds it to;
 * a space or any other character becomes a hyphen at once, rather than an error after Create.
 */
export const typedSlotName = (value: string) =>
  value
    .toLowerCase()
    // Letters with marks keep their letter (č → c, š → s); đ has none to drop, so it is written out.
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "");
/** The typed name as it is sent: a hyphen left at the end, while the next word was still to come, goes. */
export const slotNameOf = (value: string) => value.replace(/-+$/, "");

/**
 * The small copy of an image in a project, for a tile or a strip; the server sends the original when it has
 * none (a video, a small picture, no ffmpeg). Files outside a project have none.
 */
export const thumbUrl = (url: string) => (url.startsWith("/files/") ? `${url}${url.includes("?") ? "&" : "?"}thumb` : url);
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

/**
 * A write to the clipboard the browser turned down, said so a person can act on it: the browser's own message
 * ("Failed to execute 'writeText' on 'Clipboard'...") is meant for developers and is always in English.
 */
function clipboardRefused(e: unknown): Error {
  const name = (e as DOMException)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new Error(t("Copying did not work: the browser did not allow the page to use the clipboard. Click the page and try again."));
  }
  return new Error(t("Copying did not work. Try again."));
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error(t("This browser cannot copy from the page."));
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    throw clipboardRefused(e);
  }
}

/** The file a URL of the app names, for saying what was copied: "/files/p/hero/v1/2.png?t=1" → "2.png". */
export function fileNameOf(url: string): string {
  const last = url.split(/[?#]/)[0]!.split("/").pop() ?? url;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** Images (or videos) on the clipboard, e.g. from a generator's "Copy image". */
export async function clipboardFiles(): Promise<File[]> {
  if (!navigator.clipboard?.read) throw new Error(t("This browser cannot read images from the clipboard. Point at the card and press Ctrl+V instead."));
  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch (e) {
    if ((e as DOMException).name === "NotAllowedError") {
      throw new Error(t("The browser blocked clipboard access. Allow it for this page, or point at the card and press Ctrl+V."));
    }
    throw e;
  }
  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/") || t.startsWith("video/"));
    if (!type) continue;
    const blob = await item.getType(type);
    // "image/svg+xml" names a .svg file, not a .svg+xml one.
    files.push(new File([blob], `pasted.${type.split("/")[1]!.replace("jpeg", "jpg").replace(/\+.*$/, "")}`, { type }));
  }
  if (files.length === 0) throw new Error(t("There is no image on the clipboard. Copy the image in the generator first."));
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
  if (!blob) throw new Error(t("This image could not be copied."));
  if (!navigator.clipboard?.write) throw new Error(t("This browser cannot copy from the page."));
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch (e) {
    throw clipboardRefused(e);
  }
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
  keyframe: "Keyframe",
  video: "Video",
  audio: "Audio",
  source: "Source",
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

const WHEN = new Intl.DateTimeFormat(LOCALE[lang], { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** "just now", "5 minutes ago", "3 days ago". */
export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, (now - ms) / 1000);
  // Each unit's label is a whole sentence, singular and plural, so a language can word it as it likes.
  const steps: [number, (n: number) => string][] = [
    [60, (n) => (n === 1 ? t("{n} second ago", { n }) : t("{n} seconds ago", { n }))],
    [60, (n) => (n === 1 ? t("{n} minute ago", { n }) : t("{n} minutes ago", { n }))],
    [24, (n) => (n === 1 ? t("{n} hour ago", { n }) : t("{n} hours ago", { n }))],
    [30, (n) => (n === 1 ? t("{n} day ago", { n }) : t("{n} days ago", { n }))],
    [12, (n) => (n === 1 ? t("{n} month ago", { n }) : t("{n} months ago", { n }))],
    [Infinity, (n) => (n === 1 ? t("{n} year ago", { n }) : t("{n} years ago", { n }))],
  ];
  if (s < 45) return t("just now");
  let n = s;
  for (const [size, label] of steps) {
    if (n < size) return label(Math.max(1, Math.round(n)));
    n /= size;
  }
  return "";
}

/** Hover text for a slot's number: when it was made, as a date and as time ago. */
export const createdLabel = (number: number, ms: number) => t("Slot #{number}, created {when} ({ago})", { number, when: WHEN.format(ms), ago: timeAgo(ms) });

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
