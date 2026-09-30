import { useEffect, useState } from "react";
import type { NewVersionInput, Preset, Slot, Version } from "../shared/types";
import type { LightboxItem } from "./SlotCard";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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

export function Lightbox({ items, start, onClose }: { items: LightboxItem[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const item = items[index]!;
  const step = (d: number) => setIndex((i) => (i + d + items.length) % items.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="overlay lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-stage" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {item.kind === "video" ? <video key={item.url} src={item.url} controls autoPlay loop /> : <img key={item.url} src={item.url} alt="" />}
      </div>
      <footer className="lightbox-bar">
        {items.length > 1 && (
          <button className="btn" onClick={() => step(-1)}>
            Previous
          </button>
        )}
        <span className="lightbox-caption">
          {item.caption}
          {items.length > 1 && ` (${index + 1} of ${items.length})`}
        </span>
        {items.length > 1 && (
          <button className="btn" onClick={() => step(1)}>
            Next
          </button>
        )}
        <button className="btn" onClick={onClose}>
          Close
        </button>
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
            <Choice value={value.mode ?? ""} options={model?.modes ?? ["text", "frames", "ingredients"]} onChange={(mode) => set({ mode })} />
          </Field>
        )}
        <Field label="Aspect ratio">
          <Choice value={value.aspect_ratio ?? ""} options={section?.aspect_ratios} onChange={(aspect_ratio) => set({ aspect_ratio })} />
        </Field>
        <Field label="Outputs">
          <Choice value={value.outputs ?? ""} options={section?.outputs?.map(String)} onChange={(outputs) => set({ outputs })} />
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
          outputs: latest.meta.outputs ?? "",
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
