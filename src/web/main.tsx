import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppState, Slot, Status, Version } from "../shared/types";
import { Lightbox, Modal, NewProjectDialog, NewSlotDialog, NewVersionDialog, PromptDialog } from "./Dialogs";
import doneArt from "./art/empty-done.png";
import progressArt from "./art/empty-in-progress.png";
import { copiedKey, markPromptCopied } from "./copied";
import { AppContext, type Ctx, type LightboxItem } from "./context";
import { DoneTile, VariantsList, finalResult } from "./Done";
import { readStored, writeStored } from "./hooks";
import { Icon, Logo } from "./icons";
import { STATUS_LABEL, beep, call, copyImage, copyText, enc, humanTurn, onboardingMessage, slotUrl, versionUrl } from "./lib";
import { ProjectMenu } from "./ProjectMenu";
import { STATUS_ICON } from "./shared";
import { SlotCard } from "./SlotCard";
import { type Tab, ViewSettings, useViewSettings } from "./ViewSettings";

type Filter = Status | "all";
/** Filters inside the In progress tab; approved slots live in the Done tab. */
const FILTERS: Filter[] = ["all", "waiting_generation", "waiting_agent", "waiting_review", "waiting_input"];

type Dialog =
  | { kind: "project" }
  | { kind: "slot" }
  | { kind: "version"; slot: Slot }
  | { kind: "prompt"; slot: Slot; version: Version }
  | { kind: "lightbox"; items: LightboxItem[]; index: number }
  | { kind: "instructions" }
  | null;

/** The pixel-art pictures for empty views, made in the asset-prompter-brand project. */
function EmptyArt({ done = false }: { done?: boolean }) {
  return <img className="empty-art" src={done ? doneArt : progressArt} alt="" width={240} />;
}

/** Placeholder cards or tiles in the shape of the view, shown while a project's slots load. */
function LoadingSlots({ tab, perRow }: { tab: Tab; perRow: number }) {
  if (tab === "done") {
    return (
      <div className="done-grid" style={{ "--per-row": perRow } as React.CSSProperties} aria-busy="true" aria-label="Loading">
        {Array.from({ length: perRow }, (_, i) => (
          <div key={i} className="tile skeleton-tile">
            <div className="tile-media skeleton" />
            <div className="tile-bar">
              <span className="skeleton skeleton-line" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <>
      {[0, 1].map((i) => (
        <div key={i} className="card skeleton-card" aria-busy="true" aria-label="Loading">
          <div className="card-head">
            <span className="skeleton skeleton-line" />
          </div>
          <div className="version-body">
            <div className="skeleton skeleton-media" />
            <div className="skeleton-info">
              <span className="skeleton skeleton-line is-long" />
              <span className="skeleton skeleton-line is-long" />
              <span className="skeleton skeleton-line" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [projectId, setProjectId] = useState<string | null>(readStored("project"));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  /** How many agents are waiting on this project's /wait, ready to be woken by Notify agent. */
  const [listening, setListening] = useState(0);
  /** Approvals the agent has not been told about; Notify agent sends them with the agent's turns. */
  const [newApprovals, setNewApprovals] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<Tab>(readStored("tab") === "done" ? "done" : "progress");
  const view = useViewSettings(tab);
  const { width, perRow, compact } = view;
  /** The Done slot shown in full in a dialog; kept apart from `dialog` so a lightbox can open on top of it. */
  const [detail, setDetail] = useState<string | null>(null);
  /** The slot whose variants are shown; like `detail`, kept apart so a lightbox can open on top. */
  const [variantsOf, setVariantsOf] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [sound, setSound] = useState(readStored("sound") !== "off");
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
      const pending = next.projects.reduce((sum, p) => sum + humanTurn(p.counts), 0);
      if (lastPending.current !== null && pending > lastPending.current && soundRef.current) beep();
      lastPending.current = pending;
      setState(next);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  const refreshSlots = useCallback(async () => {
    if (!currentId) return setSlots(null);
    try {
      const data = await call<{ slots: Slot[]; listening: number; newApprovals: number }>("GET", `/api/projects/${enc(currentId)}`);
      setSlots(data.slots);
      setListening(data.listening);
      setNewApprovals(data.newApprovals);
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
      act(() => call("POST", `${versionUrl(currentId, slot, n)}/results`, form), `${files.length === 1 ? "Result" : `${files.length} results`} added to ${slot} v${n}`);
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
        openVariants: (slot) => setVariantsOf(slot.name),
        setPasteTarget: (target) => (pasteTarget.current = target),
      },
    [project, act, showToast, upload],
  );

  const chooseProject = (id: string) => {
    setProjectId(id);
    writeStored("project", id);
    setFilter("all");
    setDetail(null);
  };
  const chooseTab = (t: Tab) => {
    setTab(t);
    writeStored("tab", t);
  };

  // The tab title counts what is in progress in the open project.
  const openCount = (slots ?? []).filter((s) => s.status !== "approved").length;
  useEffect(() => {
    document.title = openCount > 0 ? `(${openCount}) Asset Prompter` : "Asset Prompter";
  }, [openCount]);

  if (!state) return <main className="blank">{loadError ? `Cannot reach the app server: ${loadError}` : "Loading"}</main>;

  const inProgress = (slots ?? []).filter((s) => s.status !== "approved");
  const done = (slots ?? []).filter((s) => s.status === "approved");
  const visible = inProgress.filter((s) => filter === "all" || s.status === filter);
  const count = (f: Filter) => (f === "all" ? inProgress.length : inProgress.filter((s) => s.status === f).length);
  /** What Notify agent would send: slots where it is the agent's turn, plus approvals it has not heard of. */
  const news = count("waiting_agent") + newApprovals;
  const doneItems: LightboxItem[] = done.flatMap((s) => {
    const final = finalResult(s);
    return final ? [{ url: final.url, kind: final.kind, caption: `${s.name} v${s.approved}` }] : [];
  });
  const detailSlot = detail ? (slots ?? []).find((s) => s.name === detail) : undefined;
  const variantsSlot = variantsOf ? (slots ?? []).find((s) => s.name === variantsOf && s.variants.length > 0) : undefined;
  const close = () => setDialog(null);

  return (
    <AppContext.Provider value={ctx}>
      <header className="topbar">
        <div className="brand">
          <Logo size={24} />
          <span className="brand-name">Asset Prompter</span>
        </div>
        <ProjectMenu projects={state.projects} project={project} onChoose={chooseProject} onAdd={() => setDialog({ kind: "project" })} />
        {project && (
          <>
            <div className="split">
              <button className="btn split-main" onClick={() => act(() => copyText(onboardingMessage(project.path)), "Instructions for the agent copied")}>
                <Icon name="robot" />
                Copy agent instructions
              </button>
              <button className="btn split-side" onClick={() => setDialog({ kind: "instructions" })} title="Show what gets copied">
                View
              </button>
            </div>
            <button className="link link-icon" onClick={() => act(() => call("POST", "/api/open", { path: project.path }))} title="Open the project folder">
              <Icon name="folder" />
              <span className="narrow-hide">Open folder</span>
            </button>
          </>
        )}
        <div className="topbar-right">
          <button
            className={`toggle${sound ? " is-on" : ""}`}
            role="switch"
            aria-checked={sound}
            title={sound ? "Sound on" : "Sound off"}
            onClick={() => {
              writeStored("sound", sound ? "off" : "on");
              setSound(!sound);
              if (!sound) beep();
            }}
          >
            <Icon name={sound ? "speaker" : "mute"} />
            <span className="narrow-hide">Sound {sound ? "on" : "off"}</span>
          </button>
          {project && (
            <button className="btn btn-primary" onClick={() => setDialog({ kind: "slot" })}>
              <Icon name="plus" />
              New slot
            </button>
          )}
        </div>
      </header>

      {project && (
        <nav className="tabs" aria-label="Views">
          <button className={`tab${tab === "progress" ? " is-on" : ""}`} onClick={() => chooseTab("progress")}>
            <Icon name="hourglass" />
            In progress <span className={`filter-count${inProgress.length > 0 ? " is-hot" : ""}`}>{inProgress.length}</span>
          </button>
          <button className={`tab${tab === "done" ? " is-on" : ""}`} onClick={() => chooseTab("done")}>
            <Icon name="star" />
            Done <span className="filter-count">{done.length}</span>
          </button>
          <ViewSettings tab={tab} view={view} />
        </nav>
      )}

      {project && tab === "progress" && (
        <nav className="filters" aria-label="Filter slots">
          {FILTERS.map((f) => (
            <button key={f} className={`filter filter-${f}${filter === f ? " is-on" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? <Icon name="grid" size={12} /> : <Icon name={STATUS_ICON[f]} size={12} />}
              {f === "all" ? "All" : STATUS_LABEL[f]}
              <span className="filter-count">{count(f)}</span>
            </button>
          ))}
          <div className="filters-actions">
          <button
            className={`btn notify${listening ? " is-listening" : ""}`}
            disabled={news === 0}
            onClick={() =>
              act(async () => {
                const r = await call<{ delivered: boolean }>("POST", `/api/projects/${enc(project.id)}/notify`);
                showToast(r.delivered ? "Agent notified" : "The agent is not waiting right now. It gets this as soon as it starts waiting, or tell it \"done\" in the chat.", !r.delivered);
              })
            }
            title={
              listening
                ? "The agent is waiting. Press to send it every slot where it is its turn, and what you approved since the last time."
                : "The agent is not waiting right now. It starts waiting after its turn, once it has read the new HOW-TO-USE.md."
            }
          >
            <Icon name="robot" />
            Notify agent
            {news > 0 && <span className="filter-count">{news}</span>}
          </button>
          {count("waiting_review") > 1 && (
            <button
              className="btn btn-approve"
              onClick={() =>
                act(async () => {
                  for (const s of (slots ?? []).filter((s) => s.status === "waiting_review")) {
                    await call("PUT", `${slotUrl(project.id, s.name)}/approval`, { version: s.versions.at(-1)!.n });
                  }
                }, `${count("waiting_review")} slots approved`)
              }
              title="Approve every slot the agent approved"
            >
              Approve all {count("waiting_review")}
            </button>
          )}
          </div>
        </nav>
      )}

      <main className={`feed${compact && tab === "progress" ? " is-compact" : ""}`} data-width={width}>
        {!project && (
          <div className="blank">
            <EmptyArt />
            <h1>Start with a project</h1>
            <p>A project is a folder. Your agent writes prompts into it, and you drop the generated images and videos back in.</p>
            <button className="btn btn-primary" onClick={() => setDialog({ kind: "project" })}>
              Add a project
            </button>
          </div>
        )}
        {project && slots && slots.length === 0 && (
          <div className="blank">
            <EmptyArt />
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
        {tab === "progress" && project && slots && slots.length > 0 && visible.length === 0 && (
          <div className="blank blank-center">
            <EmptyArt />
            <p>{filter === "all" ? "Nothing in progress. Approved assets are in Done." : `Nothing here: no slot is "${STATUS_LABEL[filter as Status]}".`}</p>
          </div>
        )}
        {project && !slots && <LoadingSlots tab={tab} perRow={perRow} />}
        {tab === "progress" && ctx && visible.map((slot) => <SlotCard key={slot.name} slot={slot} />)}
        {tab === "done" && project && slots && slots.length > 0 && done.length === 0 && (
          <div className="blank blank-center">
            <EmptyArt done />
            <p>Nothing approved yet. Approved assets show up here.</p>
          </div>
        )}
        {tab === "done" && ctx && done.length > 0 && (
          <div className={`done-grid${compact ? " is-compact" : ""}`} style={{ "--per-row": perRow } as React.CSSProperties}>
            {done.map((slot) => (
              <DoneTile
                key={slot.name}
                slot={slot}
                onOpen={() => {
                  const i = doneItems.findIndex((item) => item.caption === `${slot.name} v${slot.approved}`);
                  if (i >= 0) setDialog({ kind: "lightbox", items: doneItems, index: i });
                }}
                onDetails={() => setDetail(slot.name)}
              />
            ))}
          </div>
        )}
        {!state.ffmpeg && project && (
          <p className="footnote">ffmpeg is not installed, so videos get no frame sheets and an agent cannot review them.</p>
        )}
      </main>

      {detailSlot && ctx && (
        <Modal title={detailSlot.name} onClose={() => setDetail(null)} wide>
          <div className="detail-body">
            <SlotCard slot={detailSlot} collapsible={false} />
          </div>
        </Modal>
      )}
      {variantsSlot && ctx && (
        <Modal title={`${variantsSlot.name}: ${variantsSlot.variants.length} ${variantsSlot.variants.length === 1 ? "variant" : "variants"}`} onClose={() => setVariantsOf(null)} wide>
          <VariantsList slot={variantsSlot} />
        </Modal>
      )}
      {dialog?.kind === "instructions" && project && (
        <Modal title="Agent instructions" onClose={close} wide>
          <pre className="prompt-full">{onboardingMessage(project.path)}</pre>
          <footer className="modal-foot">
            <button className="btn btn-primary" onClick={() => act(() => copyText(onboardingMessage(project.path)), "Instructions for the agent copied")}>
              <Icon name="copy" />
              Copy
            </button>
            <span className="prompt-count">Paste it into a new chat with your agent.</span>
          </footer>
        </Modal>
      )}
      {dialog?.kind === "lightbox" && (
        <Lightbox items={dialog.items} start={dialog.index} onClose={close} onCopyImage={(url) => act(() => copyImage(url), "Image copied")} />
      )}
      {dialog?.kind === "prompt" && (
        <PromptDialog slot={dialog.slot} version={dialog.version} onClose={close} onCopy={() =>
            act(async () => {
              await copyText(dialog.version.prompt);
              if (project) markPromptCopied(copiedKey(project.id, dialog.slot.name, dialog.version.n), dialog.version.prompt);
            }, "Prompt copied")
          } />
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
    </AppContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
