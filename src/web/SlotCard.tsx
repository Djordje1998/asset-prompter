import { useState } from "react";
import type { Slot, Version } from "../shared/types";
import { useApp } from "./context";
import { readStored, writeStored } from "./hooks";
import { t } from "./i18n";
import { Icon } from "./icons";
import { STATUS_LABEL, call, copyText, slotUrl } from "./lib";
import { CopyName, Fold, Media, STATUS_ICON, SlotNumber } from "./shared";
import { VersionBody, WarningChip } from "./Version";

function Chevron({ open }: { open: boolean }) {
  return <Icon name="chevron" size={14} className={`chevron${open ? " is-open" : ""}`} />;
}

/** Collapsed cards are remembered per project in this browser. */
const collapseKey = (project: string, slot: string) => `collapsed:${project}:${slot}`;

/**
 * `onClose` puts a close button at the end of the head, for when the card is a dialog of its own.
 * `single` shows one version at a time: opening an older one folds the current one away.
 */
export function SlotCard({ slot, collapsible = true, onClose, single = false }: { slot: Slot; collapsible?: boolean; onClose?: () => void; single?: boolean }) {
  const ctx = useApp();
  const [open, setOpen] = useState<Set<number>>(new Set());
  /** In `single` mode, the one open version; null means the current one. */
  const [only, setOnly] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const key = collapseKey(ctx.project.id, slot.name);
  const [collapsedState, setCollapsed] = useState(() => readStored(key) === "1");
  const collapsed = collapsible && collapsedState;
  const toggleCollapsed = () => {
    writeStored(key, collapsed ? null : "1");
    setCollapsed(!collapsed);
  };
  // A Done slot shows its approved version first: anything written after it is ignored until it is reopened.
  const latest = slot.versions.find((v) => v.n === slot.approved) ?? slot.versions.at(-1);
  const older = slot.versions.filter((v) => v !== latest).reverse();
  // The newest result there is, from whichever version has one: a slot reworked after a result still shows it.
  const thumbVersion = [...slot.versions].reverse().find((v) => v.results.length > 0);
  const collapsedThumb = thumbVersion ? (thumbVersion.results.find((c) => c.file === thumbVersion.selected) ?? thumbVersion.results[0]) : undefined;
  // The current version is always open, except in `single` mode while an older one is shown instead.
  const isOpen = (n: number) => (single ? (only ?? latest?.n) === n : n === latest?.n || open.has(n));
  const toggle = (n: number) =>
    single
      ? setOnly(isOpen(n) && n !== latest?.n ? null : n)
      : setOpen((prev) => {
          const next = new Set(prev);
          next.has(n) ? next.delete(n) : next.add(n);
          return next;
        });
  const row = (v: Version) => {
    const thumb = v.results.find((c) => c.file === v.selected) ?? v.results[0];
    return (
      <button className="older-row" onClick={() => toggle(v.n)} aria-expanded={isOpen(v.n)}>
        <span className="older-caret" aria-hidden="true">
          <Chevron open={isOpen(v.n)} />
        </span>
        <span className="card-version">v{v.n}</span>
        {thumb && <Media item={thumb} className="older-thumb" />}
        <span className="older-summary">
          {slot.approved === v.n ? `${t("Approved.")} ` : ""}
          {v.changeRequest
            ? t("You asked: {text}", { text: v.changeRequest })
            : v.review?.text
              ? t("Agent: {text}", { text: v.review.text })
              : v.results.length
                ? t("No change request")
                : t("Never generated")}
        </span>
      </button>
    );
  };

  return (
    <article className={`card status-${slot.status}${collapsed ? " is-collapsed" : ""}${collapsed && (slot.description || collapsedThumb) ? " has-summary" : ""}`}>
      <header className="card-head">
        {collapsible && (
          <button className="card-toggle" onClick={toggleCollapsed} aria-expanded={!collapsed} title={collapsed ? t("Expand") : t("Collapse")}>
            <Chevron open={!collapsed} />
          </button>
        )}
        <SlotNumber slot={slot} />
        <h2>{slot.name}</h2>
        <CopyName name={slot.name} />
        {latest && (
          <span className="card-version" title={slot.versions.length === 1 ? t("{n} version in this slot", { n: slot.versions.length }) : t("{n} versions in this slot", { n: slot.versions.length })}>
            v{latest.n}
          </span>
        )}
        {/* After the name and version: whose turn it is now. */}
        <span className="status-tag" title={slot.waitingFor.length ? t("Generate it after {names} is approved", { names: slot.waitingFor.join(", ") }) : undefined}>
          <Icon name={STATUS_ICON[slot.status]} size={12} />
          {slot.status === "waiting_input" ? t("Waiting for {names}", { names: slot.waitingFor.join(", ") }) : t(STATUS_LABEL[slot.status])}
        </span>
        <WarningChip label={t("Name to check")} items={slot.warnings} />
        <div className="card-tools">
          <button className="link" onClick={() => ctx.openNewVersion(slot)}>
            {t("New version")}
          </button>
          <button className="link" onClick={() => ctx.openClone(slot)}>
            {t("Clone")}
          </button>
          <button className="link" onClick={() => ctx.act(() => copyText(slot.path), t("Slot path copied"))}>
            {t("Copy path")}
          </button>
          {confirming ? (
            <>
              <button
                className="link danger"
                onClick={() =>
                  ctx.undoable(() => call("DELETE", slotUrl(ctx.project.id, slot.name)), t('Slot "{name}" moved to _trash', { name: slot.name }), t('Slot "{name}" is back', { name: slot.name }))
                }
              >
                {t("Move to _trash")}
              </button>
              <button className="link" onClick={() => setConfirming(false)}>
                {t("Keep")}
              </button>
            </>
          ) : (
            <button className="link danger" onClick={() => setConfirming(true)}>
              {t("Delete")}
            </button>
          )}
        </div>
        {onClose && (
          <button className="modal-close" onClick={onClose} aria-label={t("Close")} title={t("Close (Esc)")}>
            <Icon name="x" size={12} />
          </button>
        )}
      </header>
      {collapsed && (slot.description || collapsedThumb) && (
        <button className="card-summary" onClick={toggleCollapsed} title={t("Expand")}>
          {collapsedThumb && <Media item={collapsedThumb} className="card-summary-thumb" />}
          {slot.description && <p>{slot.description}</p>}
        </button>
      )}
      <Fold open={!collapsed}>
        {slot.description && <p className="card-description">{slot.description}</p>}
        {latest ? (
          isOpen(latest.n) ? (
            <VersionBody slot={slot} version={latest} />
          ) : (
            <section className="older">{row(latest)}</section>
          )
        ) : (
          <p className="card-empty">{t('This slot has no version file yet. The agent writes v1.md here, or add one with "New version".')}</p>
        )}
        {older.map((v) => (
          <section key={v.n} className="older">
            {row(v)}
            <Fold open={isOpen(v.n)}>
              <VersionBody slot={slot} version={v} />
            </Fold>
          </section>
        ))}
      </Fold>
    </article>
  );
}
