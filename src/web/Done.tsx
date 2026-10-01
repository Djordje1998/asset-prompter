import type { Result, Slot } from "../shared/types";
import { type LightboxItem, useApp } from "./context";
import { Icon } from "./icons";
import { copyImage, copyText } from "./lib";
import { CopyImageButton, CopyName, Media, describe } from "./shared";

/** The approved result of a slot, as shown in the Done grid. */
export function finalResult(slot: Slot): Result | null {
  const v = slot.versions.find((x) => x.n === slot.approved);
  return v ? (v.results.find((c) => c.file === v.selected) ?? null) : null;
}

function VariantsBadge({ slot }: { slot: Slot }) {
  const ctx = useApp();
  const n = slot.variants.length;
  return (
    <button className="tile-exports" onClick={() => ctx.openVariants(slot)} title={`${n} ${n === 1 ? "variant" : "variants"} of the final asset`}>
      <Icon name="layers" size={12} />
      {n}
    </button>
  );
}

/** Every variant the agent made from the final asset, ready to copy. */
export function VariantsList({ slot }: { slot: Slot }) {
  const ctx = useApp();
  const items: LightboxItem[] = slot.variants.map((c) => ({ url: c.url, kind: c.kind, caption: `${slot.name} / ${c.file}` }));
  return (
    <ul className="exports">
      {slot.variants.map((c, i) => (
        <li key={c.file} className="export">
          <button
            className={`export-media${c.info?.width && c.info.width < 256 ? " is-small" : ""}`}
            onClick={() => ctx.openLightbox(items, i)}
            aria-label={`View ${c.file}`}
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
              <button className="btn" onClick={() => ctx.act(() => copyImage(c.url), "Image copied")}>
                <Icon name="copyimage" />
                Copy image
              </button>
            )}
            <button className="link" onClick={() => ctx.act(() => copyText(c.path), "Path copied")}>
              Copy path
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DoneTile({ slot, onOpen, onDetails }: { slot: Slot; onOpen: () => void; onDetails: () => void }) {
  const final = finalResult(slot);
  return (
    <article className="tile">
      <button className="tile-media" onClick={onOpen} aria-label={`View ${slot.name}`}>
        {final ? <Media item={final} /> : <span className="tile-missing">No file</span>}
        {final?.kind === "video" && <span className="tile-play" aria-hidden="true">▶</span>}
      </button>
      {final?.kind === "image" && <CopyImageButton url={final.url} />}
      {slot.variants.length > 0 && <VariantsBadge slot={slot} />}
      <div className="tile-bar">
        <span className="tile-name" title={slot.name}>
          {slot.name}
        </span>
        <CopyName name={slot.name} />
        <span className="card-version">v{slot.approved}</span>
        <button className="btn btn-small tile-details" onClick={onDetails}>
          <Icon name="info" size={12} />
          Details
        </button>
      </div>
    </article>
  );
}
