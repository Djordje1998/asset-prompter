import { useRef, useState } from "react";
import { readStored, useDismiss, writeStored } from "./hooks";
import { t } from "./i18n";
import { Icon } from "./icons";

export type Tab = "progress" | "done";
type PageWidth = "normal" | "wide" | "full";
/** A wider Done grid fits more tiles of the same size, not bigger tiles. The labels are translated where shown. */
const PAGE_WIDTHS: [PageWidth, string][] = [
  ["normal", "Normal"],
  ["wide", "Wide"],
  ["full", "Full"],
];

export interface View {
  width: PageWidth;
  perRow: number;
  compact: boolean;
  setWidth: (w: PageWidth) => void;
  setPerRow: (n: number) => void;
  setCompact: (c: boolean) => void;
}

/** The view choices of the open tab, remembered in this browser. */
export function useViewSettings(tab: Tab): View {
  // Each tab keeps its own content width; the bars above stay as they are.
  const readWidth = (t: Tab): PageWidth => {
    const w = readStored(`width:${t}`);
    return w === "wide" || w === "full" ? w : "normal";
  };
  const [widths, setWidths] = useState<Record<Tab, PageWidth>>(() => ({ progress: readWidth("progress"), done: readWidth("done") }));
  const [perRow, setPerRow] = useState(() => {
    const n = Number(readStored("done:perRow"));
    return Number.isInteger(n) && n >= 3 && n <= 9 ? n : 4;
  });
  // Like the width, each tab keeps its own density.
  const [compacts, setCompacts] = useState<Record<Tab, boolean>>(() => ({
    progress: readStored("progress:density") === "compact",
    done: readStored("done:density") === "compact",
  }));
  return {
    width: widths[tab],
    perRow,
    compact: compacts[tab],
    setWidth: (w) => {
      setWidths((prev) => ({ ...prev, [tab]: w }));
      writeStored(`width:${tab}`, w);
    },
    setPerRow: (n) => {
      setPerRow(n);
      writeStored("done:perRow", String(n));
    },
    setCompact: (c) => {
      setCompacts((prev) => ({ ...prev, [tab]: c }));
      writeStored(`${tab}:density`, c ? "compact" : "normal");
    },
  };
}

/** The View button in the tab bar and its panel. */
export function ViewSettings({ tab, view }: { tab: Tab; view: View }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const { width, perRow, compact } = view;
  return (
    <div className="view" ref={ref}>
      <button className={`view-button${open ? " is-on" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} title={t("View settings")}>
        <Icon name="sliders" />
        {t("View")}
      </button>
      {open && (
        <div className="view-panel" role="dialog" aria-label={t("View settings")}>
          <div className="view-row">
            <span className="view-label">{t("Width")}</span>
            <div className="segmented">
              {PAGE_WIDTHS.map(([w, label]) => (
                <button key={w} className={`segment${width === w ? " is-on" : ""}`} aria-pressed={width === w} onClick={() => view.setWidth(w)}>
                  {t(label)}
                </button>
              ))}
            </div>
          </div>
          {tab === "done" && (
            <label className="view-row">
              <span className="view-label">{t("Per row")}</span>
              <input type="range" min={3} max={9} step={1} value={perRow} onChange={(e) => view.setPerRow(Number(e.target.value))} />
              <span className="view-value">{perRow}</span>
            </label>
          )}
          <div className="view-row">
            <span className="view-label">{t("Density")}</span>
            <div className="segmented">
              {([false, true] as const).map((c) => (
                <button key={String(c)} className={`segment${compact === c ? " is-on" : ""}`} aria-pressed={compact === c} onClick={() => view.setCompact(c)}>
                  {c ? t("Compact") : t("Normal")}
                </button>
              ))}
            </div>
          </div>
          <p className="view-note">{tab === "done" ? t("Applies to the Done grid.") : t("Applies to the slots in progress.")}</p>
        </div>
      )}
    </div>
  );
}
