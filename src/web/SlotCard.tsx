import { useState } from "react";
import type { Slot } from "../shared/types";
import { useApp } from "./context";
import { readStored, writeStored } from "./hooks";
import { Icon } from "./icons";
import { STATUS_LABEL, call, copyText, slotUrl } from "./lib";
import { CopyName, Media, STATUS_ICON } from "./shared";
import { VersionBody, WarningChip } from "./Version";

function Chevron({ open }: { open: boolean }) {
  return <Icon name="chevron" size={14} className={`chevron${open ? " is-open" : ""}`} />;
}

/** Collapsed cards are remembered per project in this browser. */
const collapseKey = (project: string, slot: string) => `collapsed:${project}:${slot}`;

export function SlotCard({ slot, collapsible = true }: { slot: Slot; collapsible?: boolean }) {
  const ctx = useApp();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const key = collapseKey(ctx.project.id, slot.name);
  const [collapsedState, setCollapsed] = useState(() => readStored(key) === "1");
  const collapsed = collapsible && collapsedState;
  const toggleCollapsed = () => {
    writeStored(key, collapsed ? null : "1");
    setCollapsed(!collapsed);
  };
  const latest = slot.versions.at(-1);
  const older = slot.versions.slice(0, -1).reverse();
  const collapsedThumb = latest ? (latest.results.find((c) => c.file === latest.selected) ?? latest.results[0]) : undefined;
  const toggle = (n: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });

  return (
    <article className={`card status-${slot.status}${collapsed ? " is-collapsed" : ""}`}>
      <header className="card-head">
        {collapsible && (
          <button className="card-toggle" onClick={toggleCollapsed} aria-expanded={!collapsed} title={collapsed ? "Expand" : "Collapse"}>
            <Chevron open={!collapsed} />
          </button>
        )}
        <span className="status-tag" title={slot.waitingFor.length ? `Generate it after ${slot.waitingFor.join(", ")} is approved` : undefined}>
          <Icon name={STATUS_ICON[slot.status]} size={12} />
          {slot.status === "waiting_input" ? `Waiting for ${slot.waitingFor.join(", ")}` : STATUS_LABEL[slot.status]}
        </span>
        <h2>{slot.name}</h2>
        <CopyName name={slot.name} />
        {latest && <span className="card-version">v{latest.n}</span>}
        <WarningChip label="Name to check" items={slot.warnings} />
        {collapsed && collapsedThumb && <Media item={collapsedThumb} className="card-thumb" />}
        <div className="card-tools">
          <button className="link" onClick={() => ctx.openNewVersion(slot)}>
            New version
          </button>
          <button className="link" onClick={() => ctx.act(() => copyText(slot.path), "Slot path copied")}>
            Copy path
          </button>
          {confirming ? (
            <>
              <button
                className="link danger"
                onClick={() => ctx.act(() => call("DELETE", slotUrl(ctx.project.id, slot.name)), `${slot.name} moved to _trash`)}
              >
                Move to _trash
              </button>
              <button className="link" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="link danger" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </div>
      </header>
      {!collapsed && slot.description && <p className="card-description">{slot.description}</p>}
      {collapsed ? null : latest ? (
        <VersionBody slot={slot} version={latest} />
      ) : (
        <p className="card-empty">This slot has no version file yet. The agent writes v1.md here, or add one with "New version".</p>
      )}
      {!collapsed &&
        older.map((v) => {
          const thumb = v.results.find((c) => c.file === v.selected) ?? v.results[0];
          return (
            <section key={v.n} className="older">
              <button className="older-row" onClick={() => toggle(v.n)} aria-expanded={open.has(v.n)}>
                <span className="older-caret" aria-hidden="true">
                  <Chevron open={open.has(v.n)} />
                </span>
                <span className="older-n">v{v.n}</span>
                {thumb && <Media item={thumb} className="older-thumb" />}
                <span className="older-summary">
                  {slot.approved === v.n ? "Approved. " : ""}
                  {v.changeRequest
                    ? `You asked: ${v.changeRequest}`
                    : v.review?.text
                      ? `Agent: ${v.review.text}`
                      : v.results.length
                        ? "No change request"
                        : "Never generated"}
                </span>
              </button>
              {open.has(v.n) && <VersionBody slot={slot} version={v} />}
            </section>
          );
        })}
    </article>
  );
}
