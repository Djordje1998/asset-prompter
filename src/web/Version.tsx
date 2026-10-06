import { Fragment, useEffect, useRef, useState } from "react";
import type { Preset, ResolvedInput, Result, Slot, Version } from "../shared/types";
import { copiedKey, markPromptCopied, useCopied } from "./copied";
import { type LightboxItem, useApp } from "./context";
import { useDismiss } from "./hooks";
import { LOCALE, lang, t } from "./i18n";
import { Icon } from "./icons";
import { ROLE_LABEL, call, clipboardFiles, copyImage, copyText, dragOut, enc, slotUrl, versionUrl } from "./lib";
import { CopyImageButton, KindIcon, Media, RatioIcon, describe } from "./shared";

const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

function slotLightboxItems(slot: Slot): LightboxItem[] {
  return slot.versions.flatMap((v) =>
    v.results.map((c) => ({
      url: c.url,
      kind: c.kind,
      title: slot.name,
      version: v.n,
      file: c.file,
      tags: slot.approved === v.n && v.selected === c.file ? [t("Approved")] : [],
      pickable: v.results.length > 1,
    })),
  );
}

function MediaBox({ slot, version }: { slot: Slot; version: Version }) {
  const ctx = useApp();
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const { results } = version;
  const shown = results.find((c) => c.file === version.selected) ?? results[0];
  const base = versionUrl(ctx.project.id, slot.name, version.n);
  const needsPick = results.length > 1 && !version.selected;
  const wanted: "image" | "video" = version.meta.type === "video" ? "video" : "image";
  // Its inputs are not approved yet, so generating now would build on a draft.
  const blocked = slot.status === "waiting_input" && version === slot.versions.at(-1);

  const paste = async () => {
    try {
      ctx.upload(slot.name, version.n, await clipboardFiles());
    } catch (e) {
      ctx.toast((e as Error).message, true);
    }
  };

  const open = (c: Result) => {
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
              <Media item={shown} controls />
            ) : (
              <button className="mediabox-open" onClick={() => open(shown)} aria-label={t("View full size")}>
                <Media item={shown} onDragStart={(e) => dragOut(e, shown.url, `${slot.name}-v${version.n}-${shown.file}`)} />
              </button>
            )}
            {shown.kind === "image" && <CopyImageButton url={shown.url} />}
            {needsPick && <div className="mediabox-pick">{t("The agent will pick one, or choose it yourself")}</div>}
          </div>
          {results.length > 1 && (
            // Several results get a row of their own to choose from, apart from the file details and tools.
            <div className="results-strip">
              <span className="results-strip-label">
                {version.selected ? t("{n} results", { n: results.length }) : t("{n} results: pick one", { n: results.length })}
              </span>
              <div className="thumbs">
                {results.map((c) => (
                  <div key={c.file} className={`thumb${c.file === version.selected ? " is-selected" : ""}${c.file === version.selected && version.selectedBy === "agent" ? " is-agent" : ""}`}>
                    <button
                      title={
                        c.file === version.selected
                          ? version.selectedBy === "agent"
                            ? t("{file} is the agent's pick; click to make it yours", { file: c.file })
                            : t("{file} is your pick; click again to take it back", { file: c.file })
                          : t("Select {file}", { file: c.file })
                      }
                      onClick={() => {
                        // A second click on the human's own pick takes it back; the agent's pick becomes theirs.
                        const unpick = c.file === version.selected && version.selectedBy === "human";
                        ctx.act(() => call("PUT", `${base}/selected`, { file: unpick ? null : c.file }));
                      }}
                    >
                      <Media item={c} />
                    </button>
                    <span className="thumb-name">{c.file}</span>
                    {c.file === version.selected && (
                      <span className="thumb-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mediabox-bar">
            <span className="mediabox-info" title={shown.file}>
              {describe(shown, true)}
            </span>
            <div className="mediabox-tools">
              {shown.kind === "video" && (
                <span
                  className="link drag-handle"
                  draggable
                  title={t("Drag this into the generator or a folder")}
                  onDragStart={(e) => dragOut(e, shown.url, `${slot.name}-v${version.n}-${shown.file}`)}
                >
                  {t("Drag out")}
                </span>
              )}
              <button className="link" onClick={() => ctx.act(() => copyText(shown.path), t("Path copied"))}>
                {t("Copy path")}
              </button>
              <button className="link" onClick={() => picker.current?.click()}>
                {t("Add")}
              </button>
              <button className="link" onClick={paste} title={t("Add the image you copied in the generator")}>
                {t("Paste")}
              </button>
              <button
                className="link danger"
                onClick={() =>
                  ctx.undoable(
                    () => call("DELETE", `${base}/results/${enc(shown.file)}`),
                    t('Removed {file} from "{slot}" v{n}', { file: shown.file, slot: slot.name, n: version.n }),
                    t('{file} is back in "{slot}" v{n}', { file: shown.file, slot: slot.name, n: version.n }),
                  )
                }
              >
                {t("Remove")}
              </button>
            </div>
          </div>
        </>
      ) : blocked ? (
        <div className="mediabox-empty-area is-blocked">
          <div className="mediabox-empty">
            <span className="mediabox-icon">
              <Icon name="lock" size={20} />
            </span>
            <strong>{t("Waiting for {slots}", { slots: slot.waitingFor.join(", ") })}</strong>
            <span>
              {slot.waitingFor.length === 1
                ? t("Generate this after that slot is approved: its result goes in as an input here.")
                : t("Generate this after those slots are approved: its result goes in as inputs here.")}
            </span>
          </div>
          <button className="link" onClick={() => picker.current?.click()}>
            {wanted === "video" ? t("Add a video anyway") : t("Add an image anyway")}
          </button>
        </div>
      ) : (
        <div className="mediabox-empty-area">
          <button className="mediabox-empty" onClick={() => picker.current?.click()}>
            <span className={`mediabox-icon is-${wanted}`}>
              <KindIcon kind={wanted} size={22} />
            </span>
            <strong>{wanted === "video" ? t("Drop the video here") : t("Drop the image here")}</strong>
            <span>
              {wanted === "video"
                ? t("or click to choose the downloaded file")
                : t("or click to choose a file, or press Ctrl+V while pointing at this card")}
            </span>
          </button>
          {wanted === "video" ? (
            // Browsers cannot put videos on the clipboard, so a video always comes in as a file.
            <button className="btn btn-primary mediabox-paste" onClick={() => picker.current?.click()}>
              <Icon name="upload" />
              {t("Choose video")}
            </button>
          ) : (
            <button className="btn btn-primary mediabox-paste" onClick={paste} title={t("Add the image you copied in the generator")}>
              <Icon name="clipboard" />
              {t("Paste image")}
            </button>
          )}
        </div>
      )}
      {over && <div className="mediabox-drop">{t("Drop into v{n}", { n: version.n })}</div>}
    </div>
  );
}

/** The settings that are easiest to miss in the generator, and change the result the most. */
const STRONG_CHIPS = new Set(["Length"]);

/** The generator a version is made in: its logo on a white plate, so the mark reads on every ground, and its name. */
export function ToolMark({ tool, presets }: { tool: string; presets: Preset[] }) {
  const preset = presets.find((p) => p.tool === tool);
  const name = preset?.short ?? tool;
  return (
    <span className={`tool-mark${preset?.logo ? "" : " is-plain"}`} title={preset ? t("Generate this in {name}", { name: preset.name }) : t('Tool "{tool}" has no preset', { tool })}>
      {preset?.logo && (
        <span className="tool-logo">
          <img src={preset.logo} alt="" width={16} height={16} />
        </span>
      )}
      {name}
    </span>
  );
}

function Settings({ version }: { version: Version }) {
  const { presets } = useApp();
  const m = version.meta;
  const kind = m.type === "image" || m.type === "video" ? m.type : null;
  const rest: [string, string][] = [];
  if (m.mode) rest.push(["Mode", m.mode[0]!.toUpperCase() + m.mode.slice(1)]);
  if (m.duration) rest.push(["Length", m.duration]);
  if (m.resolution) rest.push(["Resolution", m.resolution]);
  for (const [k, v] of Object.entries(m.params)) rest.push([k, `${k}: ${v}`]);
  if (!m.tool && !m.type && !m.aspect_ratio && !m.model && rest.length === 0) return null;
  // Information, not controls: a quiet row of facts with no boxes, so it never reads as buttons.
  // In the order they are set in the generator: image or video, aspect ratio, model, then the rest.
  return (
    <div className="specs">
      <ul className="spec-list">
        {m.tool && (
          <li className="spec spec-tool">
            <ToolMark tool={m.tool} presets={presets} />
          </li>
        )}
        {m.type && (
          <li className={`spec spec-kind${kind ? ` is-${kind}` : ""}`} title={t("Image or video")}>
            {kind && <KindIcon kind={kind} />}
            {kind === "video" ? t("Video") : kind === "image" ? t("Image") : m.type}
          </li>
        )}
        {m.aspect_ratio && (
          <li className="spec" title={t("Aspect ratio")}>
            <RatioIcon ratio={m.aspect_ratio} />
            {m.aspect_ratio}
          </li>
        )}
        {m.model && (
          <li className="spec" title={t("Model")}>
            {m.model}
          </li>
        )}
        {rest.map(([label, value], i) => (
          <li key={i} className={`spec${STRONG_CHIPS.has(label) ? " spec-strong" : ""}`} title={t(label)}>
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A small status chip that opens its details in a panel below it. */
function ChipPop({ label, tone, badge, children }: { label: string; tone: string; badge?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(wrap, open, () => setOpen(false));
  return (
    <div className="pop" ref={wrap}>
      <button className={`pop-chip ${tone}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        {label}
        {badge}
        <Icon name="caret" size={10} className={`pop-caret${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <div className={`pop-panel ${tone}`} role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

function AgentReview({ slot, version }: { slot: Slot; version: Version }) {
  const review = version.review;
  if (!review) return null;
  const next = slot.versions.find((v) => v.n === version.n + 1);
  const stale = version.changeRequest !== null && version.changeRequestAt > review.at;
  const title =
    review.verdict === "approve"
      ? t("Agent approves")
      : review.verdict === "revise"
        ? next
          ? t("Agent asked for another try: v{n}", { n: next.n })
          : t("Agent wants another try")
        : t("Agent review");
  const label = review.pick && version.results.length > 1 ? t("{title}, picks {file}", { title, file: review.pick }) : title;
  const tone = review.errors.length ? "is-error" : review.verdict === "approve" ? "is-approve" : "is-agent";
  return (
    <ChipPop label={label} tone={tone} badge={stale && <span className="pop-dot" title={t("Your change request is waiting for the agent")} />}>
      <p className="pop-text">{review.text || t("The agent left no note.")}</p>
      {review.errors.map((e, i) => (
        <div key={i} className="pop-note">
          v{version.n}.review.md: {e}
        </div>
      ))}
      {stale && <div className="pop-note">{t("Your change request is waiting for the agent.")}</div>}
    </ChipPop>
  );
}

export function WarningChip({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ChipPop label={items.length > 1 ? t("{label} ({n})", { label, n: items.length }) : label} tone="is-warn">
      {items.map((w, i) => (
        <p key={i} className="pop-text">
          {w}
        </p>
      ))}
    </ChipPop>
  );
}

/** The frame roles sit on a rail in clip order; every other input is a reference. */
const FRAME_ORDER = ["start_frame", "keyframe", "end_frame"];

/** The viewer's item for an input, or null when there is nothing to show yet. */
function inputItem(input: ResolvedInput): LightboxItem | null {
  if (!input.url || !input.kind) return null;
  const name = input.source.split(/[\/]/).pop() ?? input.source;
  const label = input.role ? t(ROLE_LABEL[input.role] ?? input.role) : t("Input");
  return { url: input.url, kind: input.kind, title: input.fromSlot ? input.source : name, version: input.sourceVersion ?? undefined, tags: [label], file: input.fromSlot ? undefined : input.source };
}

function Inputs({ inputs }: { inputs: ResolvedInput[] }) {
  const frames = inputs.filter((i) => FRAME_ORDER.includes(i.role ?? "")).sort((a, b) => FRAME_ORDER.indexOf(a.role!) - FRAME_ORDER.indexOf(b.role!));
  const references = inputs.filter((i) => !FRAME_ORDER.includes(i.role ?? ""));
  const hasEnd = frames.some((f) => f.role === "end_frame");
  // One list for the viewer, frames first, so the strip at its bottom walks through every input of the version.
  const ordered = [...frames, ...references];
  const items = ordered.map(inputItem).filter((i): i is LightboxItem => i !== null);
  const open = (input: ResolvedInput) => {
    const item = inputItem(input);
    return item ? { items, index: items.findIndex((i) => i.url === item.url) } : null;
  };
  return (
    <div className="input-groups">
      {frames.length > 0 && (
        <div className="frames">
          <span className="input-group-label">{t("Frames")}</span>
          <div className="clip">
            {frames.map((input, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="clip-track" aria-hidden="true" />}
                <InputTile input={input} open={open} />
              </Fragment>
            ))}
            {/* The clip runs on from the last frame when no end frame is set. */}
            {!hasEnd && <span className="clip-track is-open" aria-hidden="true" />}
          </div>
        </div>
      )}
      {references.length > 0 && (
        <div className="references">
          <span className="input-group-label">{references.length === 1 ? t("Reference") : t("References ({n})", { n: references.length })}</span>
          <ul className="inputs is-compact">
            {references.map((input, i) => (
              <InputTile key={i} input={input} open={open} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InputTile({ input, open }: { input: ResolvedInput; open: (input: ResolvedInput) => { items: LightboxItem[]; index: number } | null }) {
  const ctx = useApp();
  const label = input.role ? t(ROLE_LABEL[input.role] ?? input.role) : t("Input");
  const name = input.source.split(/[\\/]/).pop() ?? input.source;
  return (
    <li className={`input${input.role ? ` is-${input.role}` : ""}`}>
      {input.url && input.kind ? (
        <button
          className="input-thumb"
          aria-label={t("View the {label}", { label: label.toLowerCase() })}
          onClick={() => {
            const target = open(input);
            if (target) ctx.openLightbox(target.items, target.index);
          }}
          draggable
          onDragStart={(e) => dragOut(e, input.url!, name)}
        >
          <Media item={{ url: input.url, kind: input.kind }} />
        </button>
      ) : (
        <div className="input-thumb is-missing">?</div>
      )}
      <div className="input-body">
        <div className="input-role">{label}</div>
        <div className="input-source" title={input.path ?? input.source}>
          {input.fromSlot
            ? input.sourceVersion
              ? t("from {source} v{n}", { source: input.source, n: input.sourceVersion })
              : t("from {source}", { source: input.source })
            : name}
        </div>
        {input.fromSlot && !input.missing && !input.sourceApproved && <div className="input-unapproved">{t("Not approved yet")}</div>}
        {input.missing ? (
          <div className="input-missing">{input.missing}</div>
        ) : (
          <div className="input-actions">
            {input.kind === "image" && (
              <button className="link" onClick={() => ctx.act(() => copyImage(input.url!), t("Image copied"))}>
                {t("Copy image")}
              </button>
            )}
            <button className="link" onClick={() => ctx.act(() => copyText(input.path!), t("Path copied"))}>
              {t("Copy path")}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function ChangeRequest({ slot, version, autoFocus, onClose }: { slot: Slot; version: Version; autoFocus?: boolean; onClose: () => void }) {
  const ctx = useApp();
  const saved = version.changeRequest ?? "";
  const [text, setText] = useState(saved);
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setText(saved);
  }, [saved]);
  useEffect(() => {
    if (state !== "saved") return;
    const timer = setTimeout(() => setState("idle"), 3000);
    return () => clearTimeout(timer);
  }, [state]);
  const save = async () => {
    if (!dirty.current) return;
    if (text.trim() === saved) {
      dirty.current = false;
      setState("idle");
      return;
    }
    dirty.current = false;
    setState("saving");
    let ok = false;
    await ctx.act(async () => {
      await call("PUT", `${versionUrl(ctx.project.id, slot.name, version.n)}/change-request`, { text });
      ok = true;
    }, text.trim() ? t("Change request sent to the agent") : t("Change request removed"));
    if (ok) setState("saved");
    else {
      dirty.current = true;
      setState("dirty");
    }
  };
  const saveKey = /Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd+Enter" : "Ctrl+Enter";
  const hint =
    state === "dirty"
      ? t("Not saved yet. Saves when you click away, or press {key}.", { key: saveKey })
      : state === "saving"
        ? t("Saving")
        : state === "saved"
          ? t("Saved")
          : "";
  return (
    <div className="feedback-wrap">
      {/* Clicking it blurs the field first, which saves any unsaved text. */}
      <button className="feedback-close" onClick={onClose} title={t("Hide")} aria-label={t("Hide the change request")}>
        <Icon name="x" size={10} />
      </button>
      <textarea
        className="feedback"
        placeholder={t("What should change? The agent writes the next version from this result, its prompt and your request.")}
        value={text}
        rows={2}
        autoFocus={autoFocus}
        onChange={(e) => {
          dirty.current = true;
          setState("dirty");
          setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          }
        }}
        onBlur={save}
      />
      {hint && (
        <div className={`feedback-state is-${state}`} aria-live="polite">
          {hint}
        </div>
      )}
    </div>
  );
}

function CopyPrompt({ slot, version }: { slot: Slot; version: Version }) {
  const ctx = useApp();
  const key = copiedKey(ctx.project.id, slot.name, version.n);
  const copied = useCopied(key, version.prompt);
  return (
    <button
      className={`btn ${copied ? "btn-copied" : "btn-primary"}`}
      onClick={() =>
        ctx.act(async () => {
          await copyText(version.prompt);
          markPromptCopied(key, version.prompt);
        }, t("Prompt copied"))
      }
      disabled={!version.prompt}
      title={copied ? t("Already copied once; click to copy again") : t("Copy the prompt for the generator")}
    >
      <Icon name={copied ? "check" : "clipboard"} />
      {copied ? t("Copied") : t("Copy prompt")}
    </button>
  );
}

export function VersionBody({ slot, version }: { slot: Slot; version: Version }) {
  const ctx = useApp();
  const isApproved = slot.approved === version.n;
  const approval = `${slotUrl(ctx.project.id, slot.name)}/approval`;
  const hasMedia = version.results.length > 0;
  // Comments are rare: the field stays hidden until asked for, unless one is already written.
  const [commenting, setCommenting] = useState(false);
  const [showComment, setShowComment] = useState(version.changeRequest !== null);
  return (
    <div
      className="version-body"
      onMouseEnter={() => ctx.setPasteTarget({ slot: slot.name, n: version.n })}
      onMouseLeave={() => ctx.setPasteTarget(null)}
    >
      <MediaBox slot={slot} version={version} />
      <div className="version-info">
        {version.errors.length > 0 && (
          <div className="notice notice-error">
            <strong>{t("This version file has problems")}</strong>
            {version.errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        {(version.warnings.length > 0 || version.resultNotes.length > 0 || (hasMedia && version.review)) && (
          <div className="pop-row">
            {hasMedia && <AgentReview slot={slot} version={version} />}
            <WarningChip label={t("Doesn't match the settings")} items={version.resultNotes} />
            <WarningChip label={t("Settings to check")} items={version.warnings} />
          </div>
        )}
        {version.meta.changes && (
          <p className="changes">
            <span>{t("Changed in v{n}", { n: version.n })}</span> {version.meta.changes}
          </p>
        )}
        <div className="prompt">
          <Settings version={version} />
          <p className="prompt-text">{version.prompt || version.raw}</p>
          <div className="prompt-bar">
            <CopyPrompt slot={slot} version={version} />
            <span className="prompt-count">{t("{n} characters", { n: version.prompt.length.toLocaleString(LOCALE[lang]) })}</span>
            <button className="link prompt-more" onClick={() => ctx.openPrompt(slot, version)}>
              {t("Show all")}
            </button>
          </div>
        </div>
        {version.inputs.length > 0 && <Inputs inputs={version.inputs} />}
        {hasMedia && showComment && (
          <ChangeRequest slot={slot} version={version} autoFocus={commenting} onClose={() => setShowComment(false)} />
        )}
        {hasMedia && (
          <div className="version-actions">
            {isApproved ? (
              <button className="btn btn-unapprove" onClick={() => ctx.act(() => call("PUT", approval, { version: null }), t("Approval removed"))}>
                <Icon name="undo" />
                {t("Remove approval")}
              </button>
            ) : (
              <button className="btn btn-approve" onClick={() => ctx.act(() => call("PUT", approval, { version: version.n }), t("v{n} approved", { n: version.n }))}>
                <Icon name="check" />
                {t("Approve v{n}", { n: version.n })}
              </button>
            )}
            {/* An approved version is finished: to change it, remove the approval first. */}
            {!showComment && !isApproved && (
              <button
                className="btn"
                onClick={() => {
                  setCommenting(true);
                  setShowComment(true);
                }}
              >
                <Icon name="pencil" />
                {version.changeRequest ? t("Edit change request") : t("Request changes")}
              </button>
            )}
            {isApproved && slot.variants.length > 0 && (
              <button className="btn" onClick={() => ctx.openVariants(slot)}>
                <Icon name="layers" />
                {slot.variants.length === 1 ? t("{n} variant", { n: slot.variants.length }) : t("{n} variants", { n: slot.variants.length })}
              </button>
            )}
            <button className="link link-icon" onClick={() => ctx.act(() => call("POST", "/api/open", { path: version.dir }))}>
              <Icon name="folder" />
              {t("Open folder")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
