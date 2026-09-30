import { useEffect, useRef, useState } from "react";
import type { Candidate, ProjectSummary, ResolvedInput, Slot, Version } from "../shared/types";
import { ROLE_LABEL, STATUS_LABEL, agentMessage, call, copyImage, copyText, dragOut, enc, slotUrl, versionUrl } from "./lib";

export interface LightboxItem {
  url: string;
  kind: "image" | "video";
  caption: string;
}

export interface Ctx {
  project: ProjectSummary;
  /** Runs a change, reports the outcome in the toast and reloads the feed. */
  act: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
  toast: (message: string, isError?: boolean) => void;
  openLightbox: (items: LightboxItem[], index: number) => void;
  openPrompt: (slot: Slot, version: Version) => void;
  openNewVersion: (slot: Slot) => void;
  /** The version a paste lands in: the one under the pointer. */
  setPasteTarget: (target: { slot: string; n: number } | null) => void;
  upload: (slot: string, n: number, files: File[]) => void;
}

const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

export function slotLightboxItems(slot: Slot): LightboxItem[] {
  return slot.versions.flatMap((v) =>
    v.candidates.map((c) => ({
      url: c.url,
      kind: c.kind,
      caption: `${slot.name} v${v.n}, ${c.file}${v.selected === c.file && v.candidates.length > 1 ? " (selected)" : ""}`,
    })),
  );
}

function Media({ candidate, className, controls }: { candidate: { url: string; kind: "image" | "video" }; className?: string; controls?: boolean }) {
  return candidate.kind === "video" ? (
    <video className={className} src={`${candidate.url}#t=0.1`} controls={controls} muted={!controls} preload="metadata" playsInline />
  ) : (
    <img className={className} src={candidate.url} alt="" loading="lazy" />
  );
}

function MediaBox({ slot, version, ctx }: { slot: Slot; version: Version; ctx: Ctx }) {
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const { candidates } = version;
  const shown = candidates.find((c) => c.file === version.selected) ?? candidates[0];
  const base = versionUrl(ctx.project.id, slot.name, version.n);
  const needsPick = candidates.length > 1 && !version.selected;

  const open = (c: Candidate) => {
    const items = slotLightboxItems(slot);
    ctx.openLightbox(items, Math.max(0, items.findIndex((i) => i.url === c.url)));
  };

  return (
    <div
      className={`mediabox${over ? " is-over" : ""}${shown ? "" : " is-empty"}`}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(false);
        ctx.upload(slot.name, version.n, [...e.dataTransfer.files]);
      }}
    >
      <input
        ref={picker}
        type="file"
        hidden
        multiple
        accept="image/*,video/*"
        onChange={(e) => {
          ctx.upload(slot.name, version.n, [...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {shown ? (
        <>
          <div className="mediabox-main">
            {shown.kind === "video" ? (
              <Media candidate={shown} controls />
            ) : (
              <button className="mediabox-open" onClick={() => open(shown)} aria-label="View full size">
                <img src={shown.url} alt="" draggable onDragStart={(e) => dragOut(e, shown.url, `${slot.name}-v${version.n}-${shown.file}`)} />
              </button>
            )}
            {needsPick && <div className="mediabox-pick">Pick the one to keep</div>}
          </div>
          <div className="mediabox-bar">
            <div className="thumbs">
              {candidates.length > 1 &&
                candidates.map((c) => (
                  <div key={c.file} className={`thumb${c.file === version.selected ? " is-selected" : ""}`}>
                    <button
                      title={c.file === version.selected ? `${c.file} is selected` : `Select ${c.file}`}
                      onClick={() => ctx.act(() => call("PUT", `${base}/selected`, { file: c.file }))}
                    >
                      <Media candidate={c} />
                    </button>
                  </div>
                ))}
            </div>
            <div className="mediabox-tools">
              <button className="link" onClick={() => open(shown)}>
                Enlarge
              </button>
              {shown.kind === "video" && (
                <span
                  className="link drag-handle"
                  draggable
                  title="Drag this into the generator or a folder"
                  onDragStart={(e) => dragOut(e, shown.url, `${slot.name}-v${version.n}-${shown.file}`)}
                >
                  Drag out
                </span>
              )}
              <button className="link" onClick={() => ctx.act(() => copyText(shown.path), "Path copied")}>
                Copy path
              </button>
              <button className="link" onClick={() => picker.current?.click()}>
                Add
              </button>
              <button
                className="link danger"
                onClick={() => ctx.act(() => call("DELETE", `${base}/candidates/${enc(shown.file)}`), `${shown.file} moved to _trash`)}
              >
                Remove
              </button>
            </div>
          </div>
        </>
      ) : (
        <button className="mediabox-empty" onClick={() => picker.current?.click()}>
          <strong>Drop the result here</strong>
          <span>or paste it while pointing at this card, or click to choose a file</span>
        </button>
      )}
      {over && <div className="mediabox-drop">Drop into v{version.n}</div>}
    </div>
  );
}

function Settings({ version }: { version: Version }) {
  const m = version.meta;
  const chips: [string, string][] = [];
  if (m.type) chips.push(["Type", m.type === "video" ? "Video" : m.type === "image" ? "Image" : m.type]);
  if (m.model) chips.push(["Model", m.model]);
  if (m.mode) chips.push(["Mode", m.mode[0]!.toUpperCase() + m.mode.slice(1)]);
  if (m.aspect_ratio) chips.push(["Aspect ratio", m.aspect_ratio]);
  if (m.outputs) chips.push(["Number of outputs", `${m.outputs} ${m.outputs === "1" ? "output" : "outputs"}`]);
  if (m.duration) chips.push(["Length", m.duration]);
  if (m.resolution) chips.push(["Resolution", m.resolution]);
  for (const [k, v] of Object.entries(m.params)) chips.push([k, `${k}: ${v}`]);
  if (chips.length === 0) return null;
  return (
    <ul className="chips" aria-label="Settings to choose in the generator">
      {chips.map(([label, value], i) => (
        <li key={i} className={`chip${i < 2 ? " chip-strong" : ""}`} title={label}>
          {value}
        </li>
      ))}
    </ul>
  );
}

function InputTile({ input, ctx }: { input: ResolvedInput; ctx: Ctx }) {
  const label = input.role ? (ROLE_LABEL[input.role] ?? input.role) : "Input";
  const name = input.source.split(/[\\/]/).pop() ?? input.source;
  return (
    <li className="input">
      {input.url && input.kind ? (
        <button
          className="input-thumb"
          onClick={() => ctx.openLightbox([{ url: input.url!, kind: input.kind!, caption: `${label}: ${input.source}` }], 0)}
          draggable
          onDragStart={(e) => dragOut(e, input.url!, name)}
        >
          <Media candidate={{ url: input.url, kind: input.kind }} />
        </button>
      ) : (
        <div className="input-thumb is-missing">?</div>
      )}
      <div className="input-body">
        <div className="input-role">{label}</div>
        <div className="input-source" title={input.path ?? input.source}>
          {input.fromSlot ? `from slot ${input.source}` : input.source}
        </div>
        {input.missing ? (
          <div className="input-missing">{input.missing}</div>
        ) : (
          <div className="input-actions">
            {input.kind === "image" && (
              <button className="link" onClick={() => ctx.act(() => copyImage(input.url!), "Image copied")}>
                Copy image
              </button>
            )}
            <button className="link" onClick={() => ctx.act(() => copyText(input.path!), "Path copied")}>
              Copy path
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function Feedback({ slot, version, ctx }: { slot: Slot; version: Version; ctx: Ctx }) {
  const saved = version.feedback ?? "";
  const [text, setText] = useState(saved);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setText(saved);
  }, [saved]);
  const save = () => {
    if (!dirty.current || text.trim() === saved) return;
    dirty.current = false;
    ctx.act(() => call("PUT", `${versionUrl(ctx.project.id, slot.name, version.n)}/feedback`, { text }), text.trim() ? "Comment saved" : "Comment removed");
  };
  return (
    <textarea
      className="feedback"
      placeholder="Your comment for the agent: what works, what to change"
      value={text}
      rows={2}
      onChange={(e) => {
        dirty.current = true;
        setText(e.target.value);
      }}
      onBlur={save}
    />
  );
}

function VersionBody({ slot, version, ctx }: { slot: Slot; version: Version; ctx: Ctx }) {
  const isApproved = slot.approved === version.n;
  const approval = `${slotUrl(ctx.project.id, slot.name)}/approval`;
  const hasMedia = version.candidates.length > 0;
  return (
    <div
      className="version-body"
      onMouseEnter={() => ctx.setPasteTarget({ slot: slot.name, n: version.n })}
      onMouseLeave={() => ctx.setPasteTarget(null)}
    >
      <MediaBox slot={slot} version={version} ctx={ctx} />
      <div className="version-info">
        {version.errors.length > 0 && (
          <div className="notice notice-error">
            <strong>This version file has problems</strong>
            {version.errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        {version.warnings.length > 0 && (
          <div className="notice notice-warn">
            {version.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}
        <Settings version={version} />
        {version.meta.changes && (
          <p className="changes">
            <span>Changed in v{version.n}</span> {version.meta.changes}
          </p>
        )}
        <div className="prompt">
          <p className="prompt-text">{version.prompt || version.raw}</p>
          <div className="prompt-bar">
            <button className="btn btn-primary" onClick={() => ctx.act(() => copyText(version.prompt), "Prompt copied")} disabled={!version.prompt}>
              Copy prompt
            </button>
            <button className="link" onClick={() => ctx.openPrompt(slot, version)}>
              Show all
            </button>
            <span className="prompt-count">{version.prompt.length.toLocaleString()} characters</span>
          </div>
        </div>
        {version.inputs.length > 0 && (
          <ul className="inputs">
            {version.inputs.map((input, i) => (
              <InputTile key={i} input={input} ctx={ctx} />
            ))}
          </ul>
        )}
        {hasMedia && <Feedback slot={slot} version={version} ctx={ctx} />}
        {hasMedia && (
          <div className="version-actions">
            {isApproved ? (
              <button className="btn" onClick={() => ctx.act(() => call("PUT", approval, { version: null }), "Approval removed")}>
                Remove approval
              </button>
            ) : (
              <button className="btn btn-approve" onClick={() => ctx.act(() => call("PUT", approval, { version: version.n }), `v${version.n} approved`)}>
                Approve v{version.n}
              </button>
            )}
            <button
              className="btn"
              onClick={() => ctx.act(() => copyText(agentMessage(ctx.project.path, slot, version)), "Message for the agent copied")}
            >
              Copy message for agent
            </button>
            <button className="link" onClick={() => ctx.act(() => call("POST", "/api/open", { path: version.dir }))}>
              Open folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SlotCard({ slot, ctx }: { slot: Slot; ctx: Ctx }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const latest = slot.versions.at(-1);
  const older = slot.versions.slice(0, -1).reverse();
  const toggle = (n: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });

  return (
    <article className={`card status-${slot.status}`}>
      <header className="card-head">
        <span className="status-tag">{STATUS_LABEL[slot.status]}</span>
        <h2>{slot.name}</h2>
        {latest && <span className="card-version">v{latest.n}</span>}
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
      {slot.description && <p className="card-description">{slot.description}</p>}
      {latest ? (
        <VersionBody slot={slot} version={latest} ctx={ctx} />
      ) : (
        <p className="card-empty">This slot has no version file yet. The agent writes v1.md here, or add one with "New version".</p>
      )}
      {older.map((v) => {
        const thumb = v.candidates.find((c) => c.file === v.selected) ?? v.candidates[0];
        return (
          <section key={v.n} className="older">
            <button className="older-row" onClick={() => toggle(v.n)} aria-expanded={open.has(v.n)}>
              <span className="older-caret">{open.has(v.n) ? "−" : "+"}</span>
              <span className="older-n">v{v.n}</span>
              {thumb && <Media candidate={thumb} className="older-thumb" />}
              <span className="older-summary">
                {slot.approved === v.n ? "Approved. " : ""}
                {v.feedback ? `You said: ${v.feedback}` : v.candidates.length ? "No comment" : "Never generated"}
              </span>
            </button>
            {open.has(v.n) && <VersionBody slot={slot} version={v} ctx={ctx} />}
          </section>
        );
      })}
    </article>
  );
}
