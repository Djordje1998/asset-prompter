import { useEffect, useRef, useState } from "react";
import type { NewVersionInput, Preset, ProjectSummary, Slot, TrashItem, Version } from "../shared/types";
import { cloneName } from "../shared/names";
import { useDismiss, useEscape } from "./hooks";
import { LOCALE, lang, t } from "./i18n";
import { Icon } from "./icons";
import { KindIcon, RatioIcon } from "./shared";
import { call, formatBytes, timeAgo } from "./lib";
import type { LightboxItem } from "./context";

/**
 * A dialog title about one slot: what the dialog does, then the slot name, then its version as a chip,
 * so a name ending in -v2 never runs into the version.
 */
export function SlotTitle({ action, slot, version }: { action?: string; slot: string; version?: number | null }) {
  return (
    <span className="slot-title">
      {action && <span className="slot-title-action">{action}</span>}
      <span className="slot-title-name">{slot}</span>
      {version != null && <span className="card-version">v{version}</span>}
    </span>
  );
}

const titleText = (action: string | undefined, slot: string, version?: number | null) =>
  [action, slot, version != null ? `v${version}` : null].filter(Boolean).join(" ");

export function Modal({
  title,
  label,
  onClose,
  children,
  wide,
}: {
  title: React.ReactNode;
  /** The dialog's accessible name, when the title is not plain text. */
  label?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEscape(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-label={label ?? (typeof title === "string" ? title : undefined)}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label={t("Close")} title={t("Close (Esc)")}>
            <Icon name="x" size={12} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** Confirms deleting a project: its folder goes to _trash, or, when added from elsewhere, it only leaves the list. */
export function DeleteProjectDialog({ project, onDelete, onClose }: { project: ProjectSummary; onDelete: () => void; onClose: () => void }) {
  return (
    <Modal title={<SlotTitle action={project.external ? t("Remove") : t("Delete")} slot={project.name} />} label={t("Delete {name}", { name: project.name })} onClose={onClose}>
      <div className="form">
        {project.external ? (
          <p>
            {t("The project leaves this list. Its folder stays where it is, with every prompt and result:")} <code>{project.path}</code>
          </p>
        ) : (
          <p>
            {t("The project folder, with every slot, prompt and result, moves to")} <code>projects/_trash</code>. {t("Delete it there for good when you are sure.")}
          </p>
        )}
        {project.listening > 0 && <p className="field-hint">{t("The agent waiting on it is told to stop.")}</p>}
        <footer className="modal-foot">
          <button className="btn btn-unapprove" onClick={onDelete} autoFocus>
            <Icon name="trash" size={12} />
            {project.external ? t("Remove from the list") : t("Delete project")}
          </button>
          <span className="prompt-count">{t("You can undo it right after.")}</span>
        </footer>
      </div>
    </Modal>
  );
}

const TRASH_KIND: Record<TrashItem["kind"], string> = { project: "Project", slot: "Slot", result: "Result", other: "File" };

/** What is in a _trash folder, newest first, each with Restore. `url` lists it. */
export function TrashDialog({
  title,
  url,
  onRestore,
  onOpenFolder,
  onClose,
}: {
  title: string;
  url: string;
  onRestore: (item: TrashItem) => Promise<void>;
  onOpenFolder: (path: string) => void;
  onClose: () => void;
}) {
  const [data, setData] = useState<{ items: TrashItem[]; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    call<{ items: TrashItem[]; path: string }>("GET", url)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, [url]);
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="form">
        {error && <p className="field-hint">{error}</p>}
        {data && data.items.length === 0 && <p className="trash-empty">{t("Nothing in _trash.")}</p>}
        {data && data.items.length > 0 && (
          <ul className="trash-list">
            {data.items.map((item) => (
              <li key={item.entry} className="trash-item">
                <span className="trash-thumb">
                  {item.url ? (
                    /\.(mp4|webm|mov)(\?|$)/i.test(item.url) ? (
                      <video src={`${item.url}#t=0.1`} muted preload="metadata" />
                    ) : (
                      <img src={item.url} alt="" loading="lazy" />
                    )
                  ) : (
                    <Icon name={item.kind === "project" ? "folder" : item.kind === "slot" ? "layers" : "image"} size={16} />
                  )}
                </span>
                <span className="trash-text">
                  <strong title={item.entry}>{item.name}</strong>
                  <span className="trash-meta">
                    {item.kind === "result" ? t("Result of {slot} v{version}", { slot: item.slot ?? "", version: item.version ?? "" }) : t(TRASH_KIND[item.kind])}
                    {item.trashedAt !== null && ` · ${t("deleted {when}", { when: timeAgo(item.trashedAt) })}`}
                  </span>
                </span>
                {item.kind !== "other" && (
                  <button className="btn btn-small" onClick={() => onRestore(item).then(load)}>
                    <Icon name="undo" size={12} />
                    {t("Restore")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <footer className="modal-foot">
          {data && (
            <button className="link link-icon" onClick={() => onOpenFolder(data.path)}>
              <Icon name="folder" />
              {t("Open the _trash folder")}
            </button>
          )}
          <span className="prompt-count">{t("To delete for good, empty the folder by hand.")}</span>
        </footer>
      </div>
    </Modal>
  );
}

export function PromptDialog({ slot, version, onCopy, onClose }: { slot: Slot; version: Version; onCopy: () => void; onClose: () => void }) {
  return (
    <Modal title={<SlotTitle action={t("Prompt")} slot={slot.name} version={version.n} />} label={titleText(t("Prompt"), slot.name, version.n)} onClose={onClose} wide>
      <pre className="prompt-full">{version.prompt || version.raw}</pre>
      <footer className="modal-foot">
        <button className="btn btn-primary" onClick={onCopy}>
          {t("Copy prompt")}
        </button>
        <span className="prompt-count">{t("{n} characters", { n: version.prompt.length.toLocaleString(LOCALE[lang]) })}</span>
      </footer>
    </Modal>
  );
}

/** Size, type and length of what the lightbox shows, read from the file itself. */
interface MediaFacts {
  width: number | null;
  height: number | null;
  bytes: number | null;
  seconds: number | null;
}

const typeOf = (url: string) => (url.split("?")[0]!.split(".").pop() ?? "").toUpperCase();

/** Who picked a result: the human, the agent, nobody yet, or undefined when it is not one to pick from. */
export type PickState = "human" | "agent" | null | undefined;

export function Lightbox({
  items,
  start,
  onClose,
  onCopyImage,
  pick,
}: {
  items: LightboxItem[];
  start: number;
  onClose: () => void;
  onCopyImage?: (url: string) => void;
  /** Read live from the slots, so a pick made here shows at once. */
  pick?: { of: (item: LightboxItem) => PickState; toggle: (item: LightboxItem) => void };
}) {
  const [index, setIndex] = useState(start);
  const [facts, setFacts] = useState<MediaFacts>({ width: null, height: null, bytes: null, seconds: null });
  const item = items[index]!;
  const step = (d: number) => setIndex((i) => (i + d + items.length) % items.length);
  useEscape(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // File size from a one-byte range request: the server answers with the full length in Content-Range.
  useEffect(() => {
    let live = true;
    setFacts({ width: null, height: null, bytes: null, seconds: null });
    fetch(item.url, { headers: { Range: "bytes=0-0" } })
      .then((res) => {
        const total = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1] ?? res.headers.get("content-length");
        if (live && total) setFacts((f) => ({ ...f, bytes: Number(total) }));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [item.url]);
  const picked = pick?.of(item);
  const strip = items.length > 1;
  // Thumbs of one slot are named by file, with the version when there are several; of many slots, by slot.
  const oneSlot = new Set(items.map((i) => i.title)).size === 1;
  const versions = new Set(items.map((i) => i.version)).size > 1;
  const thumbName = (it: LightboxItem) =>
    !oneSlot ? it.title : `${versions && it.version !== undefined ? `v${it.version} · ` : ""}${it.file ?? it.title}`;
  const meta = [
    facts.width && facts.height ? `${facts.width}×${facts.height}` : null,
    // A file name already says its type.
    item.file ? null : typeOf(item.url) || null,
    facts.bytes !== null ? formatBytes(facts.bytes) : null,
    facts.seconds ? t("{n}s", { n: facts.seconds.toFixed(1) }) : null,
  ].filter(Boolean);
  return (
    <div className={`overlay lightbox${strip ? " has-strip" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className={`lightbox-frame${picked ? ` is-picked is-${picked}` : ""}`}>
          {picked && <span className="lightbox-picked">✓ {picked === "agent" ? t("Agent's pick") : t("Selected")}</span>}
        {item.kind === "video" ? (
          <video
            key={item.url}
            src={item.url}
            controls
            autoPlay
            loop
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setFacts((f) => ({ ...f, width: v.videoWidth, height: v.videoHeight, seconds: v.duration }));
            }}
          />
        ) : (
          <img
            key={item.url}
            src={item.url}
            alt=""
            onLoad={(e) => {
              const img = e.currentTarget;
              setFacts((f) => ({ ...f, width: img.naturalWidth, height: img.naturalHeight }));
            }}
          />
        )}
        </div>
      </div>
      {strip && (
        <div className="lightbox-strip" role="tablist" aria-label={t("All results")}>
          {items.map((it, i) => {
            const state = pick?.of(it);
            return (
              <button
                key={it.url}
                role="tab"
                aria-selected={i === index}
                className={`lightbox-thumb${i === index ? " is-current" : ""}${state ? ` is-picked is-${state}` : ""}`}
                onClick={() => setIndex(i)}
                title={`${it.file ?? it.title}${state === "human" ? `, ${t("selected")}` : state === "agent" ? `, ${t("the agent's pick")}` : ""}${i === index ? `, ${t("showing now")}` : ""}`}
              >
                <span className="lightbox-thumb-media">
                  {it.kind === "video" ? <video src={`${it.url}#t=0.1`} muted preload="metadata" /> : <img src={it.url} alt="" loading="lazy" />}
                  {state && <span className="lightbox-thumb-check">✓</span>}
                </span>
                <span className="lightbox-thumb-name">{thumbName(it)}</span>
              </button>
            );
          })}
        </div>
      )}
      <footer className="lightbox-bar">
        <div className="lightbox-info">
          <div className="lightbox-title">
            <span className="lightbox-caption" title={item.title}>
              {item.title}
            </span>
            {item.version !== undefined && <span className="card-version">v{item.version}</span>}
            {item.tags?.map((tag) => (
              <span key={tag} className={`lightbox-tag${tag === "Approved" ? " is-approved" : ""}`}>
                {t(tag)}
              </span>
            ))}
          </div>
          <span className="lightbox-meta">{[item.file, ...meta].filter(Boolean).join("  ·  ")}</span>
        </div>
        <div className="lightbox-nav">
          {items.length > 1 && (
            <>
              <button className="btn lightbox-step" onClick={() => step(-1)} aria-label={t("Previous")} title={t("Previous (Left arrow)")}>
                <Icon name="chevron" className="flip" />
              </button>
              <span className="lightbox-count">
                {index + 1} / {items.length}
              </span>
              <button className="btn lightbox-step" onClick={() => step(1)} aria-label={t("Next")} title={t("Next (Right arrow)")}>
                <Icon name="chevron" />
              </button>
            </>
          )}
        </div>
        <div className="lightbox-actions">
          {picked !== undefined && pick && (
            <button
              className={`btn ${picked === "human" ? "btn-approve" : ""}`}
              onClick={() => pick.toggle(item)}
              title={picked === "human" ? t("Your pick. Click to take it back.") : picked === "agent" ? t("The agent's pick. Click to make it yours.") : t("Select this result")}
            >
              <Icon name="check" />
              {picked === "human" ? t("Selected") : t("Select")}
            </button>
          )}
          {onCopyImage && item.kind === "image" && (
            <button className="btn btn-primary" onClick={() => onCopyImage(item.url)}>
              <Icon name="copyimage" />
              {t("Copy image")}
            </button>
          )}
          <button className="btn lightbox-close" onClick={onClose} title={t("Close (Esc)")}>
            <Icon name="x" size={12} />
            {t("Close")}
          </button>
        </div>
      </footer>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** The tool of a version: a menu of the installed presets with their logos, since a native select cannot show a picture. */
function ToolPicker({ value, presets, onChange }: { value: string; presets: Preset[]; onChange: (tool: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const current = presets.find((p) => p.tool === value);
  const choose = (tool: string) => {
    onChange(tool);
    setOpen(false);
  };
  const logo = (p: Preset) =>
    p.logo && (
      <span className="tool-logo">
        <img src={p.logo} alt="" width={16} height={16} />
      </span>
    );
  return (
    <div className="picker" ref={ref}>
      <button type="button" className="picker-button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        {current ? (
          <span className="tool-mark">
            {logo(current)}
            {current.name}
          </span>
        ) : (
          <span className="picker-empty">{value || t("Not set")}</span>
        )}
        <Icon name="caret" size={10} className={`picker-caret${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <div className="menu picker-menu" role="listbox" aria-label={t("Tool")}>
          <button type="button" role="option" aria-selected={!value} className={`menu-item${value ? "" : " is-current"}`} onClick={() => choose("")}>
            <span className="menu-mark">{!value && <Icon name="check" size={12} />}</span>
            <span className="menu-name picker-empty">{t("Not set")}</span>
          </button>
          {presets.map((p) => (
            <button key={p.tool} type="button" role="option" aria-selected={p.tool === value} className={`menu-item${p.tool === value ? " is-current" : ""}`} onClick={() => choose(p.tool)}>
              <span className="menu-mark">{p.tool === value && <Icon name="check" size={12} />}</span>
              {logo(p)}
              <span className="menu-name">{p.name}</span>
              <span className="picker-id">{p.tool}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Choice({ value, options, onChange }: { value: string; options: string[] | undefined; onChange: (v: string) => void }) {
  if (!options || options.length === 0) return <input value={value} onChange={(e) => onChange(e.target.value)} />;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("Not set")}</option>
      {!options.includes(value) && value && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** A row of pills to pick one value; clicking the chosen one again clears it. */
function Chips({ value, options, onChange, icon, titles }: { value: string; options: string[]; onChange: (v: string) => void; icon?: (option: string) => React.ReactNode; titles?: Record<string, string | undefined> }) {
  return (
    <div className="chips" role="radiogroup">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} className={`chip${o === value ? " is-on" : ""}`} title={titles?.[o]} onClick={() => onChange(o === value ? "" : o)}>
          {icon?.(o)}
          {o}
        </button>
      ))}
    </div>
  );
}

/** The seconds a list of durations spans: fixed values and ranges alike; null when it names none. */
function span(durations: string[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const d of durations) {
    const m = /^(\d+)(?:-(\d+))?s$/.exec(d);
    if (!m) continue;
    min = Math.min(min, Number(m[1]));
    max = Math.max(max, Number(m[2] ?? m[1]));
  }
  return min === Infinity ? null : [min, max];
}

/**
 * Seconds. Pills when the chosen model offers fixed lengths only; otherwise a slider: over the model's range, or,
 * with no model chosen yet, over everything the tool's models offer, or 1–30 s when the preset says nothing.
 */
function LengthField({ durations, all, value, onChange }: { durations: string[] | undefined; all: string[]; value: string; onChange: (v: string) => void }) {
  const fixed = durations?.filter((d) => /^\d+s$/.test(d)) ?? [];
  const onlyFixed = durations !== undefined && durations.length > 0 && fixed.length === durations.length;
  const seconds = /^(\d+)s?$/.exec(value)?.[1];
  if (!onlyFixed) {
    const [min, max] = (durations && span(durations)) ?? span(all) ?? [1, 30];
    // One possible length (Midjourney: 5 s) is a pill, not a slider with nowhere to go.
    if (min === max) return <Chips value={value} options={[`${min}s`]} onChange={onChange} />;
    const n = seconds ? Math.min(max, Math.max(min, Number(seconds))) : null;
    return (
      <div className="slider">
        <input type="range" min={min} max={max} step={1} value={n ?? min} onChange={(e) => onChange(`${e.target.value}s`)} aria-label={t("Length")} />
        <output className={`slider-value${n === null ? " is-empty" : ""}`}>{n === null ? t("Not set") : `${n}s`}</output>
        {n !== null && (
          <button type="button" className="link" onClick={() => onChange("")}>
            {t("Clear")}
          </button>
        )}
        <span className="field-hint">{t("Any length from {min} to {max} seconds", { min, max })}</span>
      </div>
    );
  }
  return <Chips value={value} options={fixed} onChange={onChange} />;
}

function VersionFields({ value, onChange, presets, showChanges }: { value: NewVersionInput; onChange: (v: NewVersionInput) => void; presets: Preset[]; showChanges: boolean }) {
  const set = (patch: Partial<NewVersionInput>) => onChange({ ...value, ...patch });
  const preset = presets.find((p) => p.tool === value.tool);
  const section = value.type === "video" ? preset?.video : preset?.image;
  const model = section?.models.find((m) => m.name === value.model);
  const isVideo = value.type === "video";
  // The modes the tool has for this type, narrowed to the model's own once a model is chosen.
  const modes = section?.modes ? (model?.modes ?? Object.keys(section.modes)) : isVideo && !preset ? ["frames", "references"] : undefined;
  const modeAbout = Object.fromEntries(Object.entries(section?.modes ?? {}).map(([k, m]) => [k, m.about]));
  const ratios = model?.aspect_ratios ?? section?.aspect_ratios;
  const resetSettings = { model: "", mode: "", duration: "", resolution: "", aspect_ratio: "" };
  return (
    <>
      <div className="field-row">
        <div className="field">
          <span className="field-label">{t("Tool")}</span>
          <ToolPicker value={value.tool ?? ""} presets={presets} onChange={(tool) => set({ tool, ...resetSettings })} />
        </div>
        <div className="field field-fixed">
          <span className="field-label">{t("Type")}</span>
          <div className="segmented segmented-kind" role="radiogroup">
            {(["image", "video"] as const).map((kind) => (
              <button key={kind} type="button" role="radio" aria-checked={value.type === kind} className={value.type === kind ? `is-on is-${kind}` : ""} onClick={() => value.type !== kind && set({ type: kind, ...resetSettings })}>
                <KindIcon kind={kind} />
                {kind === "image" ? t("Image") : t("Video")}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="gen-panel">
        <div className="field-row">
          <Field label={t("Model")} hint={model?.about}>
            <Choice value={value.model} options={section?.models.map((m) => m.name)} onChange={(v) => set({ model: v, mode: "", duration: "", resolution: "" })} />
          </Field>
          {model?.resolutions && (
            <div className="field">
              <span className="field-label">{t("Resolution")}</span>
              <Chips value={value.resolution ?? ""} options={model.resolutions} onChange={(resolution) => set({ resolution })} />
            </div>
          )}
        </div>
        {modes && (
          <div className="field">
            <span className="field-label">{t("Mode")}</span>
            <Chips value={value.mode ?? ""} options={modes} onChange={(mode) => set({ mode })} titles={modeAbout} />
            {value.mode && modeAbout[value.mode] && <span className="field-hint">{modeAbout[value.mode]}</span>}
          </div>
        )}
        <div className="field-row">
          <div className="field">
            <span className="field-label">{t("Aspect ratio")}</span>
            {ratios && ratios.length ? (
              <Chips value={value.aspect_ratio ?? ""} options={ratios} onChange={(aspect_ratio) => set({ aspect_ratio })} icon={(r) => <RatioIcon ratio={r} />} />
            ) : (
              <input value={value.aspect_ratio ?? ""} onChange={(e) => set({ aspect_ratio: e.target.value })} placeholder="16:9" />
            )}
          </div>
          {isVideo && (
            <div className="field">
              <span className="field-label">{t("Length")}</span>
              <LengthField durations={model?.durations} all={section?.models.flatMap((m) => m.durations ?? []) ?? []} value={value.duration ?? ""} onChange={(duration) => set({ duration })} />
            </div>
          )}
        </div>
      </div>
      {showChanges && (
        <Field label={t("What changed")}>
          <input value={value.changes ?? ""} onChange={(e) => set({ changes: e.target.value })} placeholder={t("One sentence on what this version changes and why")} />
        </Field>
      )}
      <Field label={t("Prompt")}>
        <textarea rows={8} value={value.prompt} onChange={(e) => set({ prompt: e.target.value })} />
      </Field>
    </>
  );
}

const blank = (presets: Preset[], tool?: string): NewVersionInput => ({ tool: tool ?? presets[0]?.tool ?? "", type: "image", model: "", prompt: "" });

export function NewSlotDialog({
  presets,
  defaultTool,
  onCreate,
  onClose,
}: {
  presets: Preset[];
  /** The tool the project's newest slot uses, so a new one starts with it. */
  defaultTool?: string;
  onCreate: (name: string, description: string, version: NewVersionInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState(() => blank(presets, defaultTool));
  return (
    <Modal title={t("New slot")} onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name, description, version);
        }}
      >
        <Field label={t("Slot name")} hint={t("This becomes the folder name, for example hero-banner.")}>
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))} />
        </Field>
        <Field label={t("What is this asset for")}>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <VersionFields value={version} onChange={setVersion} presets={presets} showChanges={false} />
        <footer className="modal-foot">
          <button className="btn btn-primary" type="submit">
            {t("Create slot")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function NewVersionDialog({ slot, presets, onCreate, onClose }: { slot: Slot; presets: Preset[]; onCreate: (version: NewVersionInput) => void; onClose: () => void }) {
  const latest = slot.versions.at(-1);
  const [version, setVersion] = useState<NewVersionInput>(() =>
    latest
      ? {
          tool: latest.meta.tool ?? "",
          type: latest.meta.type === "video" ? "video" : "image",
          model: latest.meta.model ?? "",
          mode: latest.meta.mode ?? "",
          aspect_ratio: latest.meta.aspect_ratio ?? "",
          duration: latest.meta.duration ?? "",
          resolution: latest.meta.resolution ?? "",
          prompt: latest.prompt,
          carryFrom: latest.n,
        }
      : blank(presets),
  );
  const next = (latest?.n ?? 0) + 1;
  return (
    <Modal title={<SlotTitle action={t("New version")} slot={slot.name} version={next} />} label={titleText(t("New version"), slot.name, next)} onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(version);
        }}
      >
        <VersionFields value={version} onChange={setVersion} presets={presets} showChanges={latest !== undefined} />
        {latest && latest.inputs.length > 0 && (
          <p className="field-hint">
            {latest.inputs.length === 1
              ? t("The input file of v{version} is carried over.", { version: latest.n })
              : t("The {n} input files of v{version} are carried over.", { n: latest.inputs.length, version: latest.n })}
          </p>
        )}
        <footer className="modal-foot">
          <button className="btn btn-primary" type="submit">
            {t("Save v{n}", { n: next })}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

/**
 * Copies a whole slot under a new name; the offered name counts up a -vN suffix. A Done slot can also be
 * copied without its approval, so the copy starts out open for a change request.
 */
export function CloneDialog({
  slot,
  taken,
  onClone,
  onClose,
}: {
  slot: Slot;
  taken: string[];
  onClone: (name: string, removeApproval: boolean) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(() => cloneName(slot.name, taken));
  return (
    <Modal title={<SlotTitle action={t("Clone")} slot={slot.name} />} label={titleText(t("Clone"), slot.name)} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onClone(name, false);
        }}
      >
        <Field label={t("Name of the copy")} hint={t("The whole slot is copied: prompts, results, reviews and approval. The original stays as it is.")}>
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))} onFocus={(e) => e.target.select()} />
        </Field>
        <footer className="modal-foot">
          <button className="btn btn-primary" type="submit">
            {t("Clone")}
          </button>
          {slot.approved !== null && (
            <button
              className="btn"
              type="button"
              onClick={(e) => e.currentTarget.form?.reportValidity() && onClone(name, true)}
              title={t("The copy is not approved, so you can ask for changes on it right away")}
            >
              {t("Clone and remove approval")}
            </button>
          )}
        </footer>
      </form>
    </Modal>
  );
}

export function NewProjectDialog({ projectsDir, onCreate, onClose }: { projectsDir: string; onCreate: (body: { name?: string; path?: string }) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [value, setValue] = useState("");
  return (
    <Modal title={t("Add a project")} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(mode === "new" ? { name: value } : { path: value });
        }}
      >
        <div className="segmented">
          <button type="button" className={mode === "new" ? "is-on" : ""} onClick={() => setMode("new")}>
            {t("New project")}
          </button>
          <button type="button" className={mode === "existing" ? "is-on" : ""} onClick={() => setMode("existing")}>
            {t("Existing folder")}
          </button>
        </div>
        {mode === "new" ? (
          <Field label={t("Project name")} hint={t("Created as a folder in {dir}", { dir: projectsDir })}>
            <input autoFocus required value={value} onChange={(e) => setValue(e.target.value.toLowerCase().replace(/\s+/g, "-"))} />
          </Field>
        ) : (
          <Field label={t("Full path of the folder")} hint={t("Use this for a folder inside a repo your agent works in. Slots are created directly in it.")}>
            <input autoFocus required value={value} onChange={(e) => setValue(e.target.value)} placeholder="/home/you/repo/assets" />
          </Field>
        )}
        <footer className="modal-foot">
          <button className="btn btn-primary" type="submit">
            {mode === "new" ? t("Create project") : t("Add folder")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
