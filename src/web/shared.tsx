import { useLayoutEffect, useRef, useState } from "react";
import type { Result, Slot } from "../shared/types";
import { useApp } from "./context";
import { Icon, type IconName } from "./icons";
import { copyImage, copyText, createdLabel, formatBytes } from "./lib";

/** An image or video that shows a shimmering placeholder until its first frame is in. */
export function Media({
  item,
  className,
  controls,
  onDragStart,
}: {
  item: { url: string; kind: "image" | "video" };
  className?: string;
  controls?: boolean;
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
      src={item.url}
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
    <button className="tile-copy" onClick={() => ctx.act(() => copyImage(url), "Image copied")} title="Copy image" aria-label="Copy image">
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
    <button className="card-copy" onClick={() => ctx.act(() => copyText(name), `Slot name "${name}" copied to the clipboard`)} title="Copy slot name" aria-label="Copy slot name">
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
