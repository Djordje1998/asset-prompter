import { useEffect, useState } from "react";
import type { NewVersionInput, Preset, ProjectSummary, Slot, TrashItem, Version } from "../shared/types";
import { cloneName } from "../shared/names";
import { useEscape } from "./hooks";
import { Icon } from "./icons";
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
          <button className="modal-close" onClick={onClose} aria-label="Close" title="Close (Esc)">
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
    <Modal title={<SlotTitle action={project.external ? "Remove" : "Delete"} slot={project.name} />} label={`Delete ${project.name}`} onClose={onClose}>
      <div className="form">
        {project.external ? (
          <p>
            The project leaves this list. Its folder stays where it is, with every prompt and result: <code>{project.path}</code>
          </p>
        ) : (
          <p>
            The project folder, with every slot, prompt and result, moves to <code>projects/_trash</code>. Delete it there for good when you are sure.
          </p>
        )}
        {project.listening > 0 && <p className="field-hint">The agent waiting on it is told to stop.</p>}
        <footer className="modal-foot">
          <button className="btn btn-unapprove" onClick={onDelete} autoFocus>
            <Icon name="trash" size={12} />
            {project.external ? "Remove from the list" : "Delete project"}
          </button>
          <span className="prompt-count">You can undo it right after.</span>
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
        {data && data.items.length === 0 && <p className="trash-empty">Nothing in _trash.</p>}
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
                    {item.kind === "result" ? `Result of ${item.slot} v${item.version}` : TRASH_KIND[item.kind]}
                    {item.trashedAt !== null && ` · deleted ${timeAgo(item.trashedAt)}`}
                  </span>
                </span>
                {item.kind !== "other" && (
                  <button className="btn btn-small" onClick={() => onRestore(item).then(load)}>
                    <Icon name="undo" size={12} />
                    Restore
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
              Open the _trash folder
            </button>
          )}
          <span className="prompt-count">To delete for good, empty the folder by hand.</span>
        </footer>
      </div>
    </Modal>
  );
}

export function PromptDialog({ slot, version, onCopy, onClose }: { slot: Slot; version: Version; onCopy: () => void; onClose: () => void }) {
  return (
    <Modal title={<SlotTitle action="Prompt" slot={slot.name} version={version.n} />} label={titleText("Prompt", slot.name, version.n)} onClose={onClose} wide>
      <pre className="prompt-full">{version.prompt || version.raw}</pre>
      <footer className="modal-foot">
        <button className="btn btn-primary" onClick={onCopy}>
          Copy prompt
        </button>
        <span className="prompt-count">{version.prompt.length.toLocaleString()} characters</span>
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
    facts.seconds ? `${facts.seconds.toFixed(1)}s` : null,
  ].filter(Boolean);
  return (
    <div className={`overlay lightbox${strip ? " has-strip" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className={`lightbox-frame${picked ? ` is-picked is-${picked}` : ""}`}>
          {picked && <span className="lightbox-picked">✓ {picked === "agent" ? "Agent's pick" : "Selected"}</span>}
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
        <div className="lightbox-strip" role="tablist" aria-label="All results">
          {items.map((it, i) => {
            const state = pick?.of(it);
            return (
              <button
                key={it.url}
                role="tab"
                aria-selected={i === index}
                className={`lightbox-thumb${i === index ? " is-current" : ""}${state ? ` is-picked is-${state}` : ""}`}
                onClick={() => setIndex(i)}
                title={`${it.file ?? it.title}${state === "human" ? ", selected" : state === "agent" ? ", the agent's pick" : ""}${i === index ? ", showing now" : ""}`}
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
                {tag}
              </span>
            ))}
          </div>
          <span className="lightbox-meta">{[item.file, ...meta].filter(Boolean).join("  ·  ")}</span>
        </div>
        <div className="lightbox-nav">
          {items.length > 1 && (
            <>
              <button className="btn lightbox-step" onClick={() => step(-1)} aria-label="Previous" title="Previous (Left arrow)">
                <Icon name="chevron" className="flip" />
              </button>
              <span className="lightbox-count">
                {index + 1} / {items.length}
              </span>
              <button className="btn lightbox-step" onClick={() => step(1)} aria-label="Next" title="Next (Right arrow)">
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
              title={picked === "human" ? "Your pick. Click to take it back." : picked === "agent" ? "The agent's pick. Click to make it yours." : "Select this result"}
            >
              <Icon name="check" />
              {picked === "human" ? "Selected" : "Select"}
            </button>
          )}
          {onCopyImage && item.kind === "image" && (
            <button className="btn btn-primary" onClick={() => onCopyImage(item.url)}>
              <Icon name="copyimage" />
              Copy image
            </button>
          )}
          <button className="btn lightbox-close" onClick={onClose} title="Close (Esc)">
            <Icon name="x" size={12} />
            Close
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

function Choice({ value, options, onChange }: { value: string; options: string[] | undefined; onChange: (v: string) => void }) {
  if (!options || options.length === 0) return <input value={value} onChange={(e) => onChange(e.target.value)} />;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not set</option>
      {!options.includes(value) && value && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function VersionFields({ value, onChange, presets, showChanges }: { value: NewVersionInput; onChange: (v: NewVersionInput) => void; presets: Preset[]; showChanges: boolean }) {
  const set = (patch: Partial<NewVersionInput>) => onChange({ ...value, ...patch });
  const preset = presets.find((p) => p.tool === value.tool);
  const section = value.type === "video" ? preset?.video : preset?.image;
  const model = section?.models.find((m) => m.name === value.model);
  const isVideo = value.type === "video";
  return (
    <>
      <div className="field-row">
        <Field label="Tool">
          <Choice value={value.tool ?? ""} options={presets.map((p) => p.tool)} onChange={(tool) => set({ tool })} />
        </Field>
        <Field label="Type">
          <select value={value.type} onChange={(e) => set({ type: e.target.value, model: "", mode: "", duration: "", resolution: "", aspect_ratio: "" })}>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </Field>
        <Field label="Model">
          <Choice value={value.model} options={section?.models.map((m) => m.name)} onChange={(v) => set({ model: v })} />
        </Field>
      </div>
      <div className="field-row">
        {isVideo && (
          <Field label="Mode">
            <Choice value={value.mode ?? ""} options={model?.modes ?? ["frames", "ingredients"]} onChange={(mode) => set({ mode })} />
          </Field>
        )}
        <Field label="Aspect ratio">
          <Choice value={value.aspect_ratio ?? ""} options={section?.aspect_ratios} onChange={(aspect_ratio) => set({ aspect_ratio })} />
        </Field>
        {isVideo && (
          <Field label="Length">
            <Choice value={value.duration ?? ""} options={model?.durations} onChange={(duration) => set({ duration })} />
          </Field>
        )}
        {isVideo && model?.resolutions && (
          <Field label="Resolution">
            <Choice value={value.resolution ?? ""} options={model.resolutions} onChange={(resolution) => set({ resolution })} />
          </Field>
        )}
      </div>
      {showChanges && (
        <Field label="What changed">
          <input value={value.changes ?? ""} onChange={(e) => set({ changes: e.target.value })} placeholder="One sentence on what this version changes and why" />
        </Field>
      )}
      <Field label="Prompt">
        <textarea rows={8} value={value.prompt} onChange={(e) => set({ prompt: e.target.value })} />
      </Field>
    </>
  );
}

const blank = (presets: Preset[]): NewVersionInput => ({ tool: presets[0]?.tool ?? "", type: "image", model: "", prompt: "" });

export function NewSlotDialog({ presets, onCreate, onClose }: { presets: Preset[]; onCreate: (name: string, description: string, version: NewVersionInput) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState(() => blank(presets));
  return (
    <Modal title="New slot" onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name, description, version);
        }}
      >
        <Field label="Slot name" hint="This becomes the folder name, for example hero-banner.">
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))} />
        </Field>
        <Field label="What is this asset for">
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <VersionFields value={version} onChange={setVersion} presets={presets} showChanges={false} />
        <footer className="modal-foot">
          <button className="btn btn-primary" type="submit">
            Create slot
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
    <Modal title={<SlotTitle action="New version" slot={slot.name} version={next} />} label={titleText("New version", slot.name, next)} onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(version);
        }}
      >
        <VersionFields value={version} onChange={setVersion} presets={presets} showChanges={latest !== undefined} />
        {latest && latest.inputs.length > 0 && <p className="field-hint">The {latest.inputs.length} input files of v{latest.n} are carried over.</p>}
        <footer className="modal-foot">
          <button className="btn btn-primary" type="submit">
            Save v{next}
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
    <Modal title={<SlotTitle action="Clone" slot={slot.name} />} label={titleText("Clone", slot.name)} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onClone(name, false);
        }}
      >
        <Field label="Name of the copy" hint="The whole slot is copied: prompts, results, reviews and approval. The original stays as it is.">
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))} onFocus={(e) => e.target.select()} />
        </Field>
        <footer className="modal-foot">
          <button className="btn btn-primary" type="submit">
            Clone
          </button>
          {slot.approved !== null && (
            <button
              className="btn"
              type="button"
              onClick={(e) => e.currentTarget.form?.reportValidity() && onClone(name, true)}
              title="The copy is not approved, so you can ask for changes on it right away"
            >
              Clone and remove approval
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
    <Modal title="Add a project" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(mode === "new" ? { name: value } : { path: value });
        }}
      >
        <div className="segmented">
          <button type="button" className={mode === "new" ? "is-on" : ""} onClick={() => setMode("new")}>
            New project
          </button>
          <button type="button" className={mode === "existing" ? "is-on" : ""} onClick={() => setMode("existing")}>
            Existing folder
          </button>
        </div>
        {mode === "new" ? (
          <Field label="Project name" hint={`Created as a folder in ${projectsDir}`}>
            <input autoFocus required value={value} onChange={(e) => setValue(e.target.value.toLowerCase().replace(/\s+/g, "-"))} />
          </Field>
        ) : (
          <Field label="Full path of the folder" hint="Use this for a folder inside a repo your agent works in. Slots are created directly in it.">
            <input autoFocus required value={value} onChange={(e) => setValue(e.target.value)} placeholder="/home/you/repo/assets" />
          </Field>
        )}
        <footer className="modal-foot">
          <button className="btn btn-primary" type="submit">
            {mode === "new" ? "Create project" : "Add folder"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
