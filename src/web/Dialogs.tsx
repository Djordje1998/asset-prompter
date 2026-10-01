import { useEffect, useState } from "react";
import type { NewVersionInput, Preset, Slot, Version } from "../shared/types";
import { useEscape } from "./hooks";
import { Icon } from "./icons";
import { formatBytes } from "./lib";
import type { LightboxItem } from "./context";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="link" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function PromptDialog({ slot, version, onCopy, onClose }: { slot: Slot; version: Version; onCopy: () => void; onClose: () => void }) {
  return (
    <Modal title={`${slot.name} v${version.n} prompt`} onClose={onClose} wide>
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

export function Lightbox({
  items,
  start,
  onClose,
  onCopyImage,
}: {
  items: LightboxItem[];
  start: number;
  onClose: () => void;
  onCopyImage?: (url: string) => void;
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
  const meta = [
    facts.width && facts.height ? `${facts.width}×${facts.height}` : null,
    typeOf(item.url) || null,
    facts.bytes !== null ? formatBytes(facts.bytes) : null,
    facts.seconds ? `${facts.seconds.toFixed(1)}s` : null,
  ].filter(Boolean);
  return (
    <div className="overlay lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
      <footer className="lightbox-bar">
        <div className="lightbox-info">
          <span className="lightbox-caption">{item.caption}</span>
          <span className="lightbox-meta">{meta.join("  ·  ")}</span>
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
    <Modal title={`${slot.name}: write v${next}`} onClose={onClose} wide>
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
