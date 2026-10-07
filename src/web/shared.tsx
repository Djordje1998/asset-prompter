import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Result, Slot } from "../shared/types";
import { useApp } from "./context";
import { t } from "./i18n";
import { Icon, type IconName } from "./icons";
import { copyImage, copyText, createdLabel, fileNameOf, formatBytes, thumbUrl } from "./lib";

/** An image or video that shows a shimmering placeholder until its first frame is in. */
export function Media({
  item,
  className,
  controls,
  thumb,
  onDragStart,
}: {
  item: { url: string; kind: "image" | "video" };
  className?: string;
  controls?: boolean;
  /** Shown small (a tile, a strip): an image comes as its small copy. */
  thumb?: boolean;
  /** Images only: makes the image draggable out of the page. */
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const done = () => setLoaded(item.url);
  // A cached image can finish before React attaches onLoad.
  useLayoutEffect(() => {
    if (img.current?.complete) done();
  }, [item.url]);
  const cls = [className, loaded === item.url ? null : "is-loading"].filter(Boolean).join(" ") || undefined;
  return item.kind === "video" ? (
    <video
      className={cls}
      src={`${item.url}#t=0.1`}
      controls={controls}
      muted={!controls}
      preload="metadata"
      playsInline
      onLoadedData={done}
      onError={done}
    />
  ) : (
    <img
      ref={img}
      className={cls}
      src={thumb ? thumbUrl(item.url) : item.url}
      alt=""
      loading="lazy"
      draggable={onDragStart ? true : undefined}
      onDragStart={onDragStart}
      onLoad={done}
      onError={done}
    />
  );
}

/** A small copy button over an image; it shows when the pointer is over the image. */
export function CopyImageButton({ url }: { url: string }) {
  const ctx = useApp();
  return (
    <button className="tile-copy" onClick={() => ctx.act(() => copyImage(url), { message: t("Image copied"), detail: fileNameOf(url) })} title={t("Copy image")} aria-label={t("Copy image")}>
      <Icon name="copyimage" size={15} />
    </button>
  );
}

/** The slot's number by age; hover shows when it was created. */
export function SlotNumber({ slot }: { slot: Slot }) {
  return (
    <span className="slot-number" title={createdLabel(slot.number, slot.createdAt)}>
      #{slot.number}
    </span>
  );
}

export function CopyName({ name }: { name: string }) {
  const ctx = useApp();
  return (
    <button className="card-copy" onClick={() => ctx.act(() => copyText(name), t('Slot name "{name}" copied to the clipboard', { name }))} title={t("Copy slot name")} aria-label={t("Copy slot name")}>
      <Icon name="copy" size={14} />
    </button>
  );
}

/** "1376×768 · PNG · 1.8 MB", the same everywhere a result or variant is shown. */
export function describe(c: Result, withName = false): string {
  const parts: string[] = withName ? [c.file] : [];
  if (c.info?.width && c.info?.height) parts.push(`${c.info.width}×${c.info.height}`);
  if (c.kind === "video" && c.info?.duration) parts.push(`${c.info.duration.toFixed(1)}s`);
  // A file name already says its type.
  if (!withName) parts.push(c.file.split(".").pop()!.toUpperCase());
  if (c.bytes) parts.push(formatBytes(c.bytes));
  return parts.join(" · ");
}

export function KindIcon({ kind, size = 14 }: { kind: "image" | "video"; size?: number }) {
  return <Icon name={kind} size={size} className="kind-icon" />;
}

/** One pixel glyph per status, used on cards and filters. */
export const STATUS_ICON: Record<Slot["status"], IconName> = {
  waiting_input: "lock",
  waiting_generation: "spark",
  waiting_agent: "robot",
  waiting_review: "eye",
  approved: "check",
  empty: "x",
};

/** How long a fold takes to open or close; matches the transition in styles.css. */
export const FOLD_MS = 350;

/**
 * Content that opens and closes with its height animated, like a drawer. The children are mounted while it is
 * open and for the closing transition, and unmounted after, so a closed version or card costs nothing. While it
 * moves, the content is clipped; once open and settled, it is not, so popovers inside it can reach out.
 */
export function Fold({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  const [settled, setSettled] = useState(open);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setShown(false);
    setSettled(false);
    const timer = setTimeout(() => setMounted(false), FOLD_MS);
    return () => clearTimeout(timer);
  }, [open]);
  // Before the first paint of a newly mounted fold: read its closed layout, so the open state has something
  // to transition from; then open it. Reading a layout value does this without waiting for a frame.
  useLayoutEffect(() => {
    if (!open || !mounted || !ref.current) return;
    void ref.current.offsetHeight;
    setShown(true);
    const timer = setTimeout(() => setSettled(true), FOLD_MS + 40);
    return () => clearTimeout(timer);
  }, [open, mounted]);
  if (!mounted) return null;
  return (
    <div ref={ref} className={`fold${shown ? " is-open" : ""}${settled ? " is-settled" : ""}${className ? ` ${className}` : ""}`} aria-hidden={!open || undefined}>
      <div className="fold-inner">{children}</div>
    </div>
  );
}

/** A rectangle in the given proportions, like the aspect ratio buttons in the generator. */
export function RatioIcon({ ratio }: { ratio: string }) {
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(ratio.trim());
  if (!m) return null;
  const r = Number(m[1]) / Number(m[2]);
  const w = r >= 1 ? 13 : Math.max(5, 13 * r);
  const h = r >= 1 ? Math.max(5, 13 / r) : 13;
  return (
    <svg className="ratio-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x={(16 - w) / 2} y={(16 - h) / 2} width={w} height={h} rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
