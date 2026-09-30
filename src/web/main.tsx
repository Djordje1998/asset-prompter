import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppState, Slot, Status, Version } from "../shared/types";
import { Lightbox, NewProjectDialog, NewSlotDialog, NewVersionDialog, PromptDialog } from "./Dialogs";
import { type Ctx, type LightboxItem, SlotCard } from "./SlotCard";
import { STATUS_LABEL, beep, call, copyText, enc, onboardingMessage, slotUrl, versionUrl } from "./lib";

type Filter = Status | "all";
const FILTERS: Filter[] = ["all", "waiting_generation", "waiting_review", "waiting_agent", "approved"];

const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage; the choice then lasts for this visit only.
  }
};

type Dialog =
  | { kind: "project" }
  | { kind: "slot" }
  | { kind: "version"; slot: Slot }
  | { kind: "prompt"; slot: Slot; version: Version }
  | { kind: "lightbox"; items: LightboxItem[]; index: number }
  | null;

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [projectId, setProjectId] = useState<string | null>(stored("project"));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sound, setSound] = useState(stored("sound") !== "off");
  const [toast, setToast] = useState<{ message: string; isError: boolean; id: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pasteTarget = useRef<{ slot: string; n: number } | null>(null);
  const lastPending = useRef<number | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const project = state?.projects.find((p) => p.id === projectId) ?? state?.projects[0] ?? null;
  const currentId = project?.id ?? null;

  const showToast = useCallback((message: string, isError = false) => setToast({ message, isError, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.isError ? 6000 : 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  const refresh = useCallback(async () => {
    try {
      const next = await call<AppState>("GET", "/api/state");
      const pending = next.projects.reduce((sum, p) => sum + p.counts.waiting_generation, 0);
      if (lastPending.current !== null && pending > lastPending.current && soundRef.current) beep();
      lastPending.current = pending;
      document.title = pending > 0 ? `(${pending}) Asset Prompter` : "Asset Prompter";
      setState(next);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  const refreshSlots = useCallback(async () => {
    if (!currentId) return setSlots(null);
    try {
      setSlots((await call<{ slots: Slot[] }>("GET", `/api/projects/${enc(currentId)}`)).slots);
    } catch (e) {
      showToast((e as Error).message, true);
    }
  }, [currentId, showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    setSlots(null);
    refreshSlots();
  }, [refreshSlots]);

  const refreshAll = useRef(() => {});
  refreshAll.current = () => {
    refresh();
    refreshSlots();
  };
  useEffect(() => {
    const events = new EventSource("/api/events");
    events.onmessage = () => refreshAll.current();
    // After a server restart the stream reconnects by itself; reload once it is back.
    events.onopen = () => refreshAll.current();
    return () => events.close();
  }, []);

  const act = useCallback(
    async (fn: () => Promise<unknown>, done?: string) => {
      try {
        await fn();
        if (done) showToast(done);
        refreshAll.current();
      } catch (e) {
        showToast((e as Error).message, true);
      }
    },
    [showToast],
  );

  const upload = useCallback(
    (slot: string, n: number, files: File[]) => {
      if (!currentId || files.length === 0) return;
      const form = new FormData();
      for (const file of files) form.append("files", file);
      act(() => call("POST", `${versionUrl(currentId, slot, n)}/candidates`, form), `${files.length === 1 ? "Result" : `${files.length} results`} added to ${slot} v${n}`);
    },
    [act, currentId],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      const target = pasteTarget.current;
      if (files.length === 0 || (e.target as HTMLElement).closest?.("input, textarea")) return;
      if (!target) return showToast("Point at the slot the pasted file belongs to, then paste again.", true);
      e.preventDefault();
      upload(target.slot, target.n, files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload, showToast]);

  const ctx: Ctx | null = useMemo(
    () =>
      project && {
        project,
        act,
        toast: showToast,
        upload,
        openLightbox: (items, index) => setDialog({ kind: "lightbox", items, index }),
        openPrompt: (slot, version) => setDialog({ kind: "prompt", slot, version }),
        openNewVersion: (slot) => setDialog({ kind: "version", slot }),
        setPasteTarget: (target) => (pasteTarget.current = target),
      },
    [project, act, showToast, upload],
  );

  const chooseProject = (id: string) => {
    setProjectId(id);
    store("project", id);
    setMenuOpen(false);
    setFilter("all");
  };

  if (!state) return <main className="blank">{loadError ? `Cannot reach the app server: ${loadError}` : "Loading"}</main>;

  const visible = (slots ?? []).filter((s) => filter === "all" || s.status === filter);
  const count = (f: Filter) => (f === "all" ? (slots?.length ?? 0) : (slots ?? []).filter((s) => s.status === f).length);
  const close = () => setDialog(null);

  return (
    <>
      <header className="topbar">
        <div className="brand">Asset Prompter</div>
        <div className="workspace">
          <button className="btn workspace-button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
            <span>{project ? project.name : "No project"}</span>
            <span className="workspace-caret">{menuOpen ? "▴" : "▾"}</span>
          </button>
          {menuOpen && (
            <div className="menu">
              {state.projects.map((p) => (
                <button key={p.id} className={`menu-item${p.id === currentId ? " is-current" : ""}`} onClick={() => chooseProject(p.id)}>
                  <span className="menu-name">{p.name}</span>
                  {p.external && (
                    <span className="menu-path" title={p.path}>
                      {p.path}
                    </span>
                  )}
                  {p.counts.waiting_generation > 0 && <span className="badge">{p.counts.waiting_generation}</span>}
                </button>
              ))}
              <button
                className="menu-item menu-add"
                onClick={() => {
                  setMenuOpen(false);
                  setDialog({ kind: "project" });
                }}
              >
                Add a project
              </button>
            </div>
          )}
        </div>
        {project && (
          <>
            <button className="btn" onClick={() => act(() => copyText(onboardingMessage(project.path)), "Instructions for the agent copied")}>
              Copy agent instructions
            </button>
            <button className="link" onClick={() => act(() => call("POST", "/api/open", { path: project.path }))}>
              Open folder
            </button>
          </>
        )}
        <div className="topbar-right">
          <button
            className={`toggle${sound ? " is-on" : ""}`}
            role="switch"
            aria-checked={sound}
            onClick={() => {
              store("sound", sound ? "off" : "on");
              setSound(!sound);
              if (!sound) beep();
            }}
          >
            Sound {sound ? "on" : "off"}
          </button>
          {project && (
            <button className="btn btn-primary" onClick={() => setDialog({ kind: "slot" })}>
              New slot
            </button>
          )}
        </div>
      </header>

      {project && (
        <nav className="filters" aria-label="Filter slots">
          {FILTERS.map((f) => (
            <button key={f} className={`filter filter-${f}${filter === f ? " is-on" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : STATUS_LABEL[f]}
              <span className="filter-count">{count(f)}</span>
            </button>
          ))}
        </nav>
      )}

      <main className="feed">
        {!project && (
          <div className="blank">
            <h1>Start with a project</h1>
            <p>A project is a folder. Your agent writes prompts into it, and you drop the generated images and videos back in.</p>
            <button className="btn btn-primary" onClick={() => setDialog({ kind: "project" })}>
              Add a project
            </button>
          </div>
        )}
        {project && slots && slots.length === 0 && (
          <div className="blank">
            <h1>No slots in {project.name} yet</h1>
            <p>
              Paste the agent instructions into your agent's chat and it will start writing prompts here. You can also write the first one
              yourself.
            </p>
            <button className="btn btn-primary" onClick={() => act(() => copyText(onboardingMessage(project.path)), "Instructions for the agent copied")}>
              Copy agent instructions
            </button>
            <button className="btn" onClick={() => setDialog({ kind: "slot" })}>
              New slot
            </button>
          </div>
        )}
        {project && slots && slots.length > 0 && visible.length === 0 && (
          <div className="blank">
            <p>No slots with status "{STATUS_LABEL[filter as Status]}".</p>
          </div>
        )}
        {ctx && visible.map((slot) => <SlotCard key={slot.name} slot={slot} ctx={ctx} />)}
        {!state.ffmpeg && project && (
          <p className="footnote">ffmpeg is not installed, so videos get no frame sheets and an agent cannot review them.</p>
        )}
      </main>

      {dialog?.kind === "lightbox" && <Lightbox items={dialog.items} start={dialog.index} onClose={close} />}
      {dialog?.kind === "prompt" && (
        <PromptDialog slot={dialog.slot} version={dialog.version} onClose={close} onCopy={() => act(() => copyText(dialog.version.prompt), "Prompt copied")} />
      )}
      {dialog?.kind === "project" && (
        <NewProjectDialog
          projectsDir={state.projectsDir}
          onClose={close}
          onCreate={(body) =>
            act(async () => {
              const { id } = await call<{ id: string }>("POST", "/api/projects", body);
              chooseProject(id);
              close();
            }, "Project added")
          }
        />
      )}
      {dialog?.kind === "slot" && project && (
        <NewSlotDialog
          presets={state.presets}
          onClose={close}
          onCreate={(name, description, version) =>
            act(async () => {
              await call("POST", `/api/projects/${enc(project.id)}/slots`, { name, description, version });
              close();
            }, `Slot ${name} created`)
          }
        />
      )}
      {dialog?.kind === "version" && project && (
        <NewVersionDialog
          slot={dialog.slot}
          presets={state.presets}
          onClose={close}
          onCreate={(version) =>
            act(async () => {
              const { version: n } = await call<{ version: number }>("POST", `${slotUrl(project.id, dialog.slot.name)}/versions`, version);
              close();
              showToast(`v${n} saved`);
            })
          }
        />
      )}

      {toast && (
        <div key={toast.id} className={`toast${toast.isError ? " is-error" : ""}`} role="status">
          {toast.message}
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
