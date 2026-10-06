import { useEffect, useRef } from "react";
import type { Result, Slot } from "../shared/types";
import { type LightboxItem, useApp } from "./context";
import { useEscape } from "./hooks";
import { t } from "./i18n";
import { Icon } from "./icons";
import { copyImage, copyText } from "./lib";
import { CopyImageButton, Media, SlotNumber, describe } from "./shared";
import { SlotCard } from "./SlotCard";

/** The approved result of a slot, as shown in the Done grid. */
export function finalResult(slot: Slot): Result | null {
  const v = slot.versions.find((x) => x.n === slot.approved);
  return v ? (v.results.find((c) => c.file === v.selected) ?? null) : null;
}

function VariantsBadge({ slot }: { slot: Slot }) {
  const ctx = useApp();
  const n = slot.variants.length;
  return (
    <button className="tile-exports" onClick={() => ctx.openVariants(slot)} title={n === 1 ? t("{n} variant of the final asset", { n }) : t("{n} variants of the final asset", { n })}>
      <Icon name="layers" size={12} />
      {n}
    </button>
  );
}

/** Every variant the agent made from the final asset, ready to copy. */
export function VariantsList({ slot }: { slot: Slot }) {
  const ctx = useApp();
  const items: LightboxItem[] = slot.variants.map((c) => ({ url: c.url, kind: c.kind, title: slot.name, tags: [t("Variant")], file: c.file }));
  return (
    <ul className="exports">
      {slot.variants.map((c, i) => (
        <li key={c.file} className="export">
          <button
            className={`export-media${c.info?.width && c.info.width < 256 ? " is-small" : ""}`}
            onClick={() => ctx.openLightbox(items, i)}
            aria-label={t("View {file}", { file: c.file })}
          >
            <Media item={c} />
          </button>
          <div className="export-info">
            <span className="export-name" title={c.file}>
              {c.file}
            </span>
            <span className="export-meta">{describe(c)}</span>
          </div>
          <div className="export-actions">
            {c.kind === "image" && (
              <button className="btn" onClick={() => ctx.act(() => copyImage(c.url), t("Image copied"))}>
                <Icon name="copyimage" />
                {t("Copy image")}
              </button>
            )}
            <button className="link" onClick={() => ctx.act(() => copyText(c.path), t("Path copied"))}>
              {t("Copy path")}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DoneTile({ slot, onOpen, onDetails }: { slot: Slot; onOpen: () => void; onDetails: () => void }) {
  const ctx = useApp();
  const final = finalResult(slot);
  return (
    <article className="tile">
      <button className="tile-media" onClick={onOpen} aria-label={t("View {name}, approved version {n}", { name: slot.name, n: String(slot.approved) })}>
        {final ? <Media item={final} /> : <span className="tile-missing">{t("No file")}</span>}
        {final?.kind === "video" && <span className="tile-play" aria-hidden="true">▶</span>}
        <span className="tile-version" title={t("Approved version {n}", { n: String(slot.approved) })}>
          v{slot.approved}
        </span>
      </button>
      {final?.kind === "image" && <CopyImageButton url={final.url} />}
      {slot.variants.length > 0 && <VariantsBadge slot={slot} />}
      <div className="tile-bar">
        <SlotNumber slot={slot} />
        {/* The name is what people copy most, so clicking it copies it. */}
        <button className="tile-name" title={t("{name}: click to copy", { name: slot.name })} onClick={() => ctx.act(() => copyText(slot.name), t('Slot name "{name}" copied to the clipboard', { name: slot.name }))}>
          {slot.name}
        </button>
        <button className="btn btn-small tile-details" onClick={onDetails}>
          <Icon name="info" size={12} />
          {t("Details")}
        </button>
      </div>
    </article>
  );
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * Details of a Done slot: the slot card is the dialog itself, and below it a panel pages through every
 * Done slot, with arrows above a strip of all of them, the current one marked.
 */
export function DetailDialog({ slots, slot, onShow, onClose, paused }: { slots: Slot[]; slot: Slot; onShow: (name: string) => void; onClose: () => void; paused: boolean }) {
  const index = slots.findIndex((s) => s.name === slot.name);
  const many = index >= 0 && slots.length > 1;
  const step = (d: number) => many && onShow(slots[(index + d + slots.length) % slots.length]!.name);
  const strip = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => {
    if (!many || paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    // Scrolled by hand: scrollIntoView would also move the page, and overshoots at the ends of the strip.
    const bar = strip.current;
    const item = bar?.querySelector<HTMLElement>(".is-current");
    if (bar && item) bar.scrollTo({ left: item.offsetLeft + item.offsetWidth / 2 - bar.clientWidth / 2, behavior: "smooth" });
  }, [slot.name]);
  const outside = (e: React.MouseEvent) => e.target === e.currentTarget && onClose();
  return (
    <div className="overlay detail-overlay" onMouseDown={outside}>
      <div className="detail-view" role="dialog" aria-label={t("Details {name}", { name: slot.name })} onMouseDown={outside}>
        <SlotCard key={slot.name} slot={slot} collapsible={false} onClose={onClose} single />
        {many && (
          <nav className="detail-dock" aria-label={t("All done slots")}>
            <div className="detail-nav">
              <button className="btn btn-small lightbox-step" onClick={() => step(-1)} aria-label={t("Previous")} title={t("Previous (Left arrow)")}>
                <Icon name="chevron" className="flip" />
              </button>
              <span className="lightbox-count">
                {index + 1} / {slots.length}
              </span>
              <button className="btn btn-small lightbox-step" onClick={() => step(1)} aria-label={t("Next")} title={t("Next (Right arrow)")}>
                <Icon name="chevron" />
              </button>
            </div>
            <div className="detail-strip" ref={strip} role="tablist">
              {slots.map((s) => {
                const final = finalResult(s);
                const current = s.name === slot.name;
                return (
                  <button
                    key={s.name}
                    role="tab"
                    aria-selected={current}
                    className={`lightbox-thumb${current ? " is-current" : ""}`}
                    onClick={() => onShow(s.name)}
                    title={current ? t("#{number} {name}, showing now", { number: s.number, name: s.name }) : t("#{number} {name}", { number: s.number, name: s.name })}
                  >
                    <span className="lightbox-thumb-media">
                      {final && (final.kind === "video" ? <video src={`${final.url}#t=0.1`} muted preload="metadata" /> : <img src={final.url} alt="" loading="lazy" />)}
                    </span>
                    <span className="lightbox-thumb-name">{s.name}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
