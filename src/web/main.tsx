import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type AppState, MAX_UPLOAD_BYTES, type ProjectSummary, type Slot, type Status, type Version } from "../shared/types";
import { AddFinalDialog, CloneDialog, DeleteProjectDialog, Lightbox, TrashDialog, Modal, SlotTitle, NewProjectDialog, NewSlotDialog, NewVersionDialog, PromptDialog } from "./Dialogs";
import doneArt from "./art/empty-done.png";
import agentArt from "./art/empty-filter-agent.png";
import approvalArt from "./art/empty-filter-approval.png";
import generatingArt from "./art/empty-filter-generating.png";
import inputArt from "./art/empty-filter-input.png";
import progressArt from "./art/empty-in-progress.png";
import { copiedKey, markPromptCopied } from "./copied";
import { AppContext, type Ctx, type LightboxItem, type Notice } from "./context";
import { DetailDialog, DoneTile, VariantsList, finalResult } from "./Done";
import { readStored, useFlip, useLeaving, writeStored } from "./hooks";
import { t } from "./i18n";
import "./sr";
import { Icon, Logo } from "./icons";
import { LanguageMenu } from "./Language";
import { chime } from "./chime";
import { CHANGED_EVENT, STATUS_LABEL, type ServerError, beep, call, copyImage, copyText, enc, fileNameOf, keepSame, onboardingMessage, slotUrl, versionUrl } from "./lib";
import { ProjectMenu } from "./ProjectMenu";
import { STATUS_ICON } from "./shared";
import { SlotCard } from "./SlotCard";
import { Tooltips } from "./Tooltip";
import { ThemeSwitch } from "./Theme";
import { Tutorial } from "./Tutorial";
import { type Tab, ViewSettings, useViewSettings } from "./ViewSettings";

type Filter = Status | "all";
/** Filters inside the In progress tab; approved slots live in the Done tab. */
const FILTERS: Filter[] = ["all", "waiting_generation", "waiting_agent", "waiting_review", "waiting_input"];

/** How long a removal can be undone from its toast. */
const UNDO_MS = 5000;

/** The open project's slots and counts, as /api/projects/:id answers, with the id they belong to. */
interface ProjectData {
  project: string;
  slots: Slot[];
  listening: number;
  newApprovals: number;
  trash: number;
}

type Dialog =
  | { kind: "project" }
  | { kind: "slot" }
  | { kind: "final" }
  | { kind: "version"; slot: Slot }
  | { kind: "clone"; slot: Slot }
  | { kind: "prompt"; slot: Slot; version: Version }
  | { kind: "lightbox"; items: LightboxItem[]; index: number }
  | { kind: "instructions" }
  | { kind: "deleteProject"; project: ProjectSummary }
  | { kind: "trash" }
  | { kind: "projectTrash" }
  | null;

/** An empty filter shows the In progress scene with one change that says why it is empty. */
const FILTER_ART: Partial<Record<Filter, string>> = {
  waiting_generation: generatingArt,
  waiting_agent: agentArt,
  waiting_review: approvalArt,
  waiting_input: inputArt,
};

/** The pixel-art pictures for empty views, made in the asset-prompter-brand project. */
function EmptyArt({ done = false, filter = "all" }: { done?: boolean; filter?: Filter }) {
  // Its height is given too, so the space is kept before the picture loads and nothing under it jumps.
  return <img className="empty-art" src={done ? doneArt : (FILTER_ART[filter] ?? progressArt)} alt="" width={240} height={done ? 163 : 167} />;
}

/** Placeholder cards or tiles in the shape of the view, shown while a project's slots load. */
function LoadingSlots({ tab, perRow }: { tab: Tab; perRow: number }) {
  if (tab === "done") {
    return (
      <div className="done-grid" style={{ "--per-row": perRow } as React.CSSProperties} aria-busy="true" aria-label={t("Loading")}>
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
        <div key={i} className="card skeleton-card" aria-busy="true" aria-label={t("Loading")}>
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
  /**
   * The last answer about a project's slots, with the project it is about: while another project's answer is
   * all there is, the open one is still loading, and its view never shows, or animates away, the other's cards.
   */
  const [loaded, setLoaded] = useState<ProjectData | null>(null);
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
  /** The tour opens by itself on the first visit in this browser, and from its button after that. */
  const [touring, setTouring] = useState(() => readStored("tutorial:seen") !== "1");
  const closeTour = () => {
    writeStored("tutorial:seen", "1");
    setTouring(false);
  };
  const [toast, setToast] = useState<{ message: string; detail?: string; isError: boolean; id: number; undo?: () => void } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pasteTarget = useRef<{ slot: string; n: number } | null>(null);
  /** The newest state request sent, and the newest whose answer was used; the same for the slots. */
  const stateSeq = useRef(0);
  const appliedSeq = useRef(0);
  const slotsSeq = useRef(0);
  const appliedSlotsSeq = useRef(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const project = state?.projects.find((p) => p.id === projectId) ?? state?.projects[0] ?? null;
  const currentId = project?.id ?? null;
  const current = loaded && loaded.project === currentId ? loaded : null;
  const slots = current?.slots ?? null;
  /** How many agents are waiting on this project's /wait, ready to be woken by Notify agent. */
  const listening = current?.listening ?? 0;
  /** Approvals the agent has not been told about; Notify agent sends them with the agent's turns. */
  const newApprovals = current?.newApprovals ?? 0;
  /** Items in the open project's _trash. */
  const trashCount = current?.trash ?? 0;

  const showToast = useCallback(
    (message: string, isError = false, undo?: () => void, detail?: string) => setToast({ message, detail, isError, id: Date.now(), undo }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.undo ? UNDO_MS : toast.isError ? 6000 : 2200);
    return () => clearTimeout(timer);
  }, [toast]);
  /** The last removal, undoable with Ctrl+Z after its toast is gone, until the next change replaces it. */
  const lastUndo = useRef<(() => void) | null>(null);
  useEffect(() => {
    const forget = () => {
      lastUndo.current = null;
      setToast((t) => (t?.undo ? null : t));
    };
    window.addEventListener(CHANGED_EVENT, forget);
    return () => window.removeEventListener(CHANGED_EVENT, forget);
  }, []);
  const runUndo = () => {
    const undo = lastUndo.current;
    lastUndo.current = null;
    setToast(null);
    undo?.();
  };
  // Ctrl+Z (Cmd+Z) undoes the last removal, unless the key is meant for a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "z" || !(e.ctrlKey || e.metaKey) || e.shiftKey) return;
      if ((e.target as HTMLElement).closest?.("input, textarea, [contenteditable]")) return;
      if (!lastUndo.current) return;
      e.preventDefault();
      runUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++stateSeq.current;
    try {
      const next = await call<AppState>("GET", "/api/state");
      // An older request answering after a newer one would put the old state back, and chime again for the change.
      if (seq < appliedSeq.current) return;
      appliedSeq.current = seq;
      if (chime.update(next.projects) && soundRef.current) beep();
      // Every change in any project reloads the state: what did not change keeps its objects, and renders nothing.
      setState((prev) => keepSame(prev, next));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  const refreshSlots = useCallback(async () => {
    if (!currentId) return;
    const seq = ++slotsSeq.current;
    try {
      const data = await call<Omit<ProjectData, "project">>("GET", `/api/projects/${enc(currentId)}`);
      // As with the state: an older answer arriving after a newer one would put old slots back.
      if (seq < appliedSlotsSeq.current) return;
      appliedSlotsSeq.current = seq;
      setLoaded((prev) => {
        if (prev?.project !== currentId) return { project: currentId, ...data };
        // Matched by name, since a new slot comes first and moves every other one down the list.
        const before = new Map(prev.slots.map((s) => [s.name, s]));
        return keepSame(prev, { project: currentId, ...data, slots: data.slots.map((s) => keepSame(before.get(s.name), s)) });
      });
    } catch (e) {
      // A project deleted a moment ago is simply gone; the next state names the one shown instead.
      if (!/^Project ".*" does not exist\.$/.test((e as ServerError).serverMessage ?? "")) showToast((e as Error).message, true);
    }
  }, [currentId, showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    refreshSlots();
  }, [refreshSlots]);

  // A file dropped beside a drop area would have the browser open it in place of the app. Drop areas take
  // their files first; anywhere else the drop is refused, and the pointer says so.
  useEffect(() => {
    const guard = (e: DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, []);

  const refreshAll = useRef(() => {});
  refreshAll.current = () => {
    refresh();
    refreshSlots();
  };
  useEffect(() => {
    const events = new EventSource("/api/events");
    // An agent writing a version, or a batch of dropped results, changes many files at once: refresh once it settles.
    let timer = 0;
    events.onmessage = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refreshAll.current(), 150);
    };
    // After a server restart the stream reconnects by itself; reload once it is back.
    events.onopen = () => refreshAll.current();
    return () => {
      window.clearTimeout(timer);
      events.close();
    };
  }, []);

  const act = useCallback(
    async (fn: () => Promise<unknown>, done?: string | Notice) => {
      try {
        await fn();
        if (typeof done === "string") showToast(done);
        else if (done) showToast(done.message, false, undefined, done.detail);
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
      const tooBig = files.find((f) => f.size > MAX_UPLOAD_BYTES);
      if (tooBig) return showToast(t("{file} is larger than 1 GB, the most one file can be.", { file: tooBig.name }), true);
      // The server holds a request in memory, so files that together pass the limit go in several requests.
      const batches: File[][] = [];
      for (const file of files) {
        const last = batches.at(-1);
        if (last && last.reduce((sum, f) => sum + f.size, 0) + file.size <= MAX_UPLOAD_BYTES) last.push(file);
        else batches.push([file]);
      }
      act(
        async () => {
          for (const batch of batches) {
            const form = new FormData();
            for (const file of batch) form.append("files", file);
            await call("POST", `${versionUrl(currentId, slot, n)}/results`, form);
          }
        },
        files.length === 1 ? t("Result added to {slot} v{n}", { slot, n }) : t("{count} results added to {slot} v{n}", { count: files.length, slot, n }),
      );
    },
    [act, currentId, showToast],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      const target = pasteTarget.current;
      if (files.length === 0 || (e.target as HTMLElement).closest?.("input, textarea")) return;
      if (!target) return showToast(t("Point at the slot the pasted file belongs to, then paste again."), true);
      e.preventDefault();
      upload(target.slot, target.n, files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload, showToast]);

  // Made again only when the project or the presets change, not on every reload, so the cards can skip rendering.
  const ctx: Ctx | null = useMemo(
    () =>
      currentId === null
        ? null
        : {
            projectId: currentId,
            presets: state?.presets ?? [],
            act,
            toast: showToast,
            undoable: (fn, done, undone) =>
              act(async () => {
                const { undo } = await fn();
                const run = () => act(() => call("POST", `/api/projects/${enc(currentId)}/undo/${enc(undo)}`), undone);
                lastUndo.current = run;
                showToast(done, false, run);
              }),
            upload,
            openLightbox: (items, index) => setDialog({ kind: "lightbox", items, index }),
            openPrompt: (slot, version) => setDialog({ kind: "prompt", slot, version }),
            openNewVersion: (slot) => setDialog({ kind: "version", slot }),
            openClone: (slot) => setDialog({ kind: "clone", slot }),
            openVariants: (slot) => setVariantsOf(slot.name),
            setPasteTarget: (target) => (pasteTarget.current = target),
          },
    [currentId, state?.presets, act, showToast, upload],
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

  // Oldest first, so the work reads top to bottom in the order it was asked for, with slots that wait for
  // another slot last; Done keeps the newest first.
  const inProgress = (slots ?? [])
    .filter((s) => s.status !== "approved")
    .sort((a, b) => Number(a.status === "waiting_input") - Number(b.status === "waiting_input") || a.number - b.number);
  const done = (slots ?? []).filter((s) => s.status === "approved");
  const visible = inProgress.filter((s) => filter === "all" || s.status === filter);
  // A card that leaves the list stays for its exit animation, so a change is seen as a card going, not swapping;
  // one that joins grows into place. Another filter is another view: it comes in whole, like another tab.
  const cardScope = `${currentId}:${tab}:${filter}`;
  const tileScope = `${currentId}:${tab}`;
  const shownCards = useLeaving(visible, (s) => s.name, cardScope);
  const shownTiles = useLeaving(done, (s) => s.name, tileScope);
  // The others slide to their new places when one joins, goes or moves.
  const feedRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  useFlip(feedRef, shownCards.map((c) => c.key), cardScope);
  useFlip(gridRef, shownTiles.map((c) => c.key), tileScope);
  // A new filter keeps the cards it shares with the old one mounted, so their rise is played here, as a tab's is.
  const lastFilter = useRef(filter);
  useLayoutEffect(() => {
    if (lastFilter.current === filter) return;
    lastFilter.current = filter;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    feedRef.current?.querySelectorAll<HTMLElement>(":scope > .card-wrap > .card").forEach((card, i) => {
      card.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], {
        duration: 500,
        delay: Math.min(i, 5) * 50,
        easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
        fill: "backwards",
      });
    });
  }, [filter]);

  if (!state) {
    if (loadError) return <main className="blank">{t("Cannot reach the app server: {error}", { error: loadError })}</main>;
    // The page's own shape while the first state loads: the bars as ghosts and two ghost cards, no words.
    return (
      <>
        <header className="topbar skeleton-bar" aria-hidden="true">
          <div className="brand">
            <Logo size={24} />
            <span className="brand-name">Asset Prompter</span>
          </div>
          <span className="skeleton skeleton-control is-wide" />
          <span className="skeleton skeleton-control" />
          <div className="topbar-right">
            <span className="skeleton skeleton-control is-small" />
            <span className="skeleton skeleton-control is-small" />
          </div>
        </header>
        <nav className="tabs" aria-hidden="true">
          <div className="tabs-inner">
            <span className="skeleton skeleton-control" />
            <span className="skeleton skeleton-control is-small" />
          </div>
        </nav>
        <main className="feed" data-width={width}>
          <LoadingSlots tab="progress" perRow={perRow} />
        </main>
      </>
    );
  }

  const count = (f: Filter) => (f === "all" ? inProgress.length : inProgress.filter((s) => s.status === f).length);
  /** What Notify agent would send: slots where it is the agent's turn, plus approvals it has not heard of. */
  const news = count("waiting_agent") + newApprovals;
  const doneItems: LightboxItem[] = done.flatMap((s) => {
    const final = finalResult(s);
    // Everything in Done is approved, so no tag says so.
    return final ? [{ url: final.url, kind: final.kind, title: s.name, version: s.approved ?? undefined, file: final.file }] : [];
  });
  const detailSlot = detail ? (slots ?? []).find((s) => s.name === detail) : undefined;
  const variantsSlot = variantsOf ? (slots ?? []).find((s) => s.name === variantsOf && s.variants.length > 0) : undefined;
  const close = () => setDialog(null);

  return (
    <AppContext.Provider value={ctx}>
      <header
        className="topbar"
        // A soft light follows the pointer across the bar, as on the landing page; mouse only, and gone when it leaves.
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
          e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.removeProperty("--mx");
          e.currentTarget.style.removeProperty("--my");
        }}
      >
        <div className="brand">
          <Logo size={24} />
          <span className="brand-name">Asset Prompter</span>
        </div>
        <ProjectMenu
          projects={state.projects}
          project={project}
          onChoose={chooseProject}
          onAdd={() => setDialog({ kind: "project" })}
          onDelete={(p) => setDialog({ kind: "deleteProject", project: p })}
          trashed={state.trashedProjects}
          onTrash={() => setDialog({ kind: "trash" })}
        />
        {project && (
          <>
            <div className="split">
              <button className="btn split-main" onClick={() => act(() => copyText(onboardingMessage(project.path)), { message: t("Instructions for the agent copied"), detail: onboardingMessage(project.path) })}>
                <Icon name="robot" />
                {t("Copy agent instructions")}
              </button>
              {/* "Read", not "View": View is the layout panel by the tabs, and one name for two things confused. */}
              <button className="btn split-side" onClick={() => setDialog({ kind: "instructions" })} title={t("Show what gets copied")}>
                {t("Read")}
              </button>
            </div>
            <button className="link link-icon" onClick={() => act(() => call("POST", "/api/open", { path: project.path }))} title={t("Open the project folder")}>
              <Icon name="folder" />
              <span className="narrow-hide">{t("Open folder")}</span>
            </button>
            <span className="folder-path narrow-hide">
              <bdi>{project.path}</bdi>
            </span>
          </>
        )}
        <div className="topbar-right">
          <LanguageMenu />
          <button className="toggle toggle-plain" onClick={() => setTouring(true)} title={t("How Asset Prompter works, step by step")} aria-haspopup="dialog">
            <Icon name="help" />
            <span className="narrow-hide">{t("Tutorial")}</span>
          </button>
          <ThemeSwitch />
          <button
            className={`toggle${sound ? " is-on" : ""}`}
            role="switch"
            aria-checked={sound}
            title={sound ? t("Sound on") : t("Sound off")}
            onClick={() => {
              writeStored("sound", sound ? "off" : "on");
              setSound(!sound);
              if (!sound) beep();
            }}
          >
            <Icon name={sound ? "speaker" : "mute"} />
            <span className="narrow-hide">{sound ? t("Sound on") : t("Sound off")}</span>
          </button>
        </div>
      </header>

      {project && (
        <nav className="tabs" data-width={width} aria-label={t("Views")}>
          <div className="tabs-inner">
          <button className={`tab${tab === "progress" ? " is-on" : ""}`} onClick={() => chooseTab("progress")}>
            <Icon name="hourglass" />
            {t("In progress")} <span className={`filter-count${inProgress.length > 0 ? " is-hot" : ""}`}>{inProgress.length}</span>
          </button>
          <button className={`tab${tab === "done" ? " is-on" : ""}`} onClick={() => chooseTab("done")}>
            <Icon name="star" />
            {t("Done")} <span className="filter-count">{done.length}</span>
          </button>
          <div className="tabs-tools">
            {/* The add button of the open tab: a slot to generate, or a finished file straight into Done. */}
            {tab === "progress" ? (
              <button className="view-button" onClick={() => setDialog({ kind: "slot" })}>
                <Icon name="plus" />
                {t("New slot")}
              </button>
            ) : (
              <button className="view-button" onClick={() => setDialog({ kind: "final" })} title={t("Add a finished image or video straight to Done, with no prompt")}>
                <Icon name="plus" />
                {t("Add finished asset")}
              </button>
            )}
            {trashCount > 0 && (
              <button className="view-button" onClick={() => setDialog({ kind: "projectTrash" })}>
                <Icon name="trash" />
                {t("Trash")} <span className="filter-count">{trashCount}</span>
              </button>
            )}
            <ViewSettings tab={tab} view={view} />
          </div>
          </div>
        </nav>
      )}

      {project && tab === "progress" && (
        <nav className="filters" data-width={width} aria-label={t("Filter slots")}>
          <div className="filters-inner">
          {FILTERS.map((f) => (
            <button key={f} className={`filter filter-${f}${filter === f ? " is-on" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? <Icon name="grid" size={12} /> : <Icon name={STATUS_ICON[f]} size={12} />}
              {f === "all" ? t("All") : t(STATUS_LABEL[f])}
              <span className="filter-count">{count(f)}</span>
            </button>
          ))}
          <div className="filters-actions">
          <div className={listening ? "split" : "notify-wrap"}>
            <button
              className={`btn notify${listening ? " is-listening split-main" : ""}`}
              disabled={news === 0}
              onClick={() =>
                act(async () => {
                  const r = await call<{ delivered: boolean }>("POST", `/api/projects/${enc(project.id)}/notify`);
                  showToast(r.delivered ? t("Agent notified") : t("The agent is not waiting right now. It gets this as soon as it starts waiting, or tell it \"done\" in the chat."), !r.delivered);
                })
              }
              title={[
                listening
                  ? t("The agent is waiting. Press to send it every slot where it is its turn, and what you approved since the last time.")
                  : t("The agent is not waiting right now. It starts waiting after its turn, once it has read the new HOW-TO-USE.md."),
                // The count on the button adds two things up; say which.
                news > 0
                  ? t("To send: {items}.", {
                      items: [
                        count("waiting_agent") > 0 && t("{n} for the agent to work on", { n: count("waiting_agent") }),
                        newApprovals > 0 && (newApprovals === 1 ? t("{n} approval to report", { n: newApprovals }) : t("{n} approvals to report", { n: newApprovals })),
                      ]
                        .filter(Boolean)
                        .join(", "),
                    })
                  : "",
              ]
                .filter(Boolean)
                .join("\n")}
            >
              <Icon name="robot" />
              {t("Notify agent")}
              {news > 0 && <span className="filter-count">{news}</span>}
            </button>
            {listening > 0 && (
              <button
                className="btn split-side"
                onClick={() => act(() => call("POST", `/api/projects/${enc(project.id)}/stop`), t("The agent stopped listening"))}
                title={t("Tell the waiting agent to stop listening. It starts again when you ask it in the chat.")}
              >
                {t("Stop")}
              </button>
            )}
          </div>
          {count("waiting_review") > 1 && (
            <button
              className="btn btn-approve"
              onClick={() =>
                act(async () => {
                  for (const s of (slots ?? []).filter((s) => s.status === "waiting_review")) {
                    await call("PUT", `${slotUrl(project.id, s.name)}/approval`, { version: s.versions.at(-1)!.n });
                  }
                }, t("{n} slots approved", { n: count("waiting_review") }))
              }
              title={t("Approve every slot the agent approved")}
            >
              {t("Approve all {n}", { n: count("waiting_review") })}
            </button>
          )}
          </div>
          </div>
        </nav>
      )}

      <main ref={feedRef} className={`feed${compact && tab === "progress" ? " is-compact" : ""}`} data-width={width}>
        {!project && (
          <div className="blank">
            <EmptyArt />
            <h1>{t("Start with a project")}</h1>
            <p>{t("A project is a folder. Your agent writes prompts into it, and you drop the generated images and videos back in.")}</p>
            <button className="btn btn-primary" onClick={() => setDialog({ kind: "project" })}>
              {t("Create project")}
            </button>
          </div>
        )}
        {project && slots && slots.length === 0 && (tab === "progress" ? shownCards : shownTiles).length === 0 && (
          <div className="blank">
            <EmptyArt />
            <h1>{t("No slots in {name} yet", { name: project.name })}</h1>
            <p>
              {t("Paste the agent instructions into your agent's chat and it will start writing prompts here. You can also write the first one yourself.")}
            </p>
            <button className="btn btn-primary" onClick={() => act(() => copyText(onboardingMessage(project.path)), { message: t("Instructions for the agent copied"), detail: onboardingMessage(project.path) })}>
              {t("Copy agent instructions")}
            </button>
            <button className="btn" onClick={() => setDialog({ kind: "slot" })}>
              {t("New slot")}
            </button>
          </div>
        )}
        {tab === "progress" && project && slots && slots.length > 0 && shownCards.length === 0 && (
          // Only once the last card has finished leaving, so the picture never lands on top of it.
          <div key={filter} className="blank blank-center">
            <EmptyArt filter={filter} />
            <p>{filter === "all" ? t("Nothing in progress. Approved assets are in Done.") : t("Nothing here, no slot is \"{status}\".", { status: t(STATUS_LABEL[filter as Status]) })}</p>
          </div>
        )}
        {project && !slots && <LoadingSlots tab={tab} perRow={perRow} />}
        {tab === "progress" &&
          ctx &&
          shownCards.map(({ key, item, leaving, entering, arrived }) => (
            <div key={key} data-flip={key} className={`card-wrap${leaving ? " is-leaving" : ""}${entering ? " is-entering" : ""}${arrived ? " is-arrived" : ""}`} aria-hidden={leaving || undefined}>
              <SlotCard slot={item} />
            </div>
          ))}
        {tab === "done" && project && slots && slots.length > 0 && shownTiles.length === 0 && (
          <div className="blank blank-center">
            <EmptyArt done />
            <p>{t("Nothing approved yet. Approved assets show up here.")}</p>
            <button className="btn" onClick={() => setDialog({ kind: "final" })}>
              <Icon name="plus" />
              {t("Add finished asset")}
            </button>
          </div>
        )}
        {tab === "done" && ctx && shownTiles.length > 0 && (
          <div ref={gridRef} className={`done-grid${compact ? " is-compact" : ""}`} style={{ "--per-row": perRow } as React.CSSProperties}>
            {shownTiles.map(({ key, item: slot, leaving, entering, arrived }) => (
              <div key={key} data-flip={key} className={`tile-wrap${leaving ? " is-leaving" : ""}${entering ? " is-entering" : ""}${arrived ? " is-arrived" : ""}`} aria-hidden={leaving || undefined}>
                <DoneTile
                  slot={slot}
                  onOpen={() => {
                    const i = doneItems.findIndex((item) => item.title === slot.name);
                    if (i >= 0) setDialog({ kind: "lightbox", items: doneItems, index: i });
                  }}
                  onDetails={() => setDetail(slot.name)}
                />
              </div>
            ))}
          </div>
        )}
        {!state.ffmpeg && project && (
          <p className="footnote">{t("ffmpeg is not installed, so videos get no frame sheets and an agent cannot review them.")}</p>
        )}
      </main>
      <footer className="foot">
        <span className="foot-brand">
          <Logo size={16} />
          Asset Prompter{" "}
          <a className="foot-version" href={`https://github.com/Djordje1998/asset-prompter/releases/tag/v${state.version}`} target="_blank" rel="noopener" title={t("This version's release notes")}>
            v{state.version}
          </a>
        </span>
        <nav className="foot-links" aria-label={t("About Asset Prompter")}>
          <a href="https://assetprompter.com" target="_blank" rel="noopener">
            {t("Website")}
          </a>
          <a href="https://github.com/Djordje1998/asset-prompter" target="_blank" rel="noopener">
            GitHub
          </a>
          {/* Each opens GitHub's form for its kind, already filled with the questions to answer. */}
          <a href="https://github.com/Djordje1998/asset-prompter/issues/new?template=bug.md" target="_blank" rel="noopener">
            {t("Report a problem")}
          </a>
          <a href="https://github.com/Djordje1998/asset-prompter/issues/new?template=feature.md" target="_blank" rel="noopener">
            {t("Suggest a feature")}
          </a>
          <button className="foot-link" onClick={() => setTouring(true)}>
            {t("Tutorial")}
          </button>
        </nav>
        <span className="foot-note">{t("Runs on this machine only. Nothing leaves it but what you paste into your generator.")}</span>
      </footer>

      {detailSlot && ctx && (
        <DetailDialog slots={done} slot={detailSlot} onShow={setDetail} onClose={() => setDetail(null)} paused={dialog !== null || variantsSlot !== undefined} />
      )}
      {variantsSlot && ctx && (
        <Modal
          title={
            <SlotTitle
              action={variantsSlot.variants.length === 1 ? t("{n} variant of", { n: variantsSlot.variants.length }) : t("{n} variants of", { n: variantsSlot.variants.length })}
              slot={variantsSlot.name}
            />
          }
          label={t("Variants of {name}", { name: variantsSlot.name })}
          onClose={() => setVariantsOf(null)}
          wide
        >
          <VariantsList slot={variantsSlot} />
        </Modal>
      )}
      {dialog?.kind === "instructions" && project && (
        <Modal title={t("Agent instructions")} onClose={close} wide>
          <pre className="prompt-full">{onboardingMessage(project.path)}</pre>
          <footer className="modal-foot">
            <button className="btn btn-primary" onClick={() => act(() => copyText(onboardingMessage(project.path)), { message: t("Instructions for the agent copied"), detail: onboardingMessage(project.path) })}>
              <Icon name="copy" />
              {t("Copy")}
            </button>
            <span className="prompt-count">{t("Paste it into a new chat with your agent.")}</span>
          </footer>
        </Modal>
      )}
      {dialog?.kind === "lightbox" && (
        <Lightbox
          items={dialog.items}
          start={dialog.index}
          onClose={close}
          onCopyImage={(url) => act(() => copyImage(url), { message: t("Image copied"), detail: fileNameOf(url) })}
          pick={{
            of: (item) => {
              if (!item.pickable) return undefined;
              const v = (slots ?? []).find((s) => s.name === item.title)?.versions.find((x) => x.n === item.version);
              if (!v) return undefined;
              return v.selected === item.file ? (v.selectedBy ?? "human") : null;
            },
            toggle: (item) => {
              if (!project || item.version === undefined) return;
              const v = (slots ?? []).find((s) => s.name === item.title)?.versions.find((x) => x.n === item.version);
              // A second click on the human's own pick takes it back; the agent's pick becomes theirs.
              const unpick = v?.selected === item.file && v?.selectedBy === "human";
              act(() => call("PUT", `${versionUrl(project.id, item.title, item.version!)}/selected`, { file: unpick ? null : item.file }));
            },
          }}
        />
      )}
      {dialog?.kind === "prompt" && (
        <PromptDialog slot={dialog.slot} version={dialog.version} onClose={close} onCopy={() =>
            act(async () => {
              await copyText(dialog.version.prompt);
              if (project) markPromptCopied(copiedKey(project.id, dialog.slot.name, dialog.version.n), dialog.version.prompt);
            }, { message: t("Prompt copied"), detail: dialog.version.prompt })
          } />
      )}
      {dialog?.kind === "deleteProject" && (
        <DeleteProjectDialog
          project={dialog.project}
          onClose={close}
          onDelete={() => {
            const gone = dialog.project;
            close();
            const next = state.projects.find((p) => p.id !== gone.id);
            if (next) chooseProject(next.id);
            act(async () => {
              const { undo } = await call<{ undo: string }>("DELETE", `/api/projects/${enc(gone.id)}`);
              const run = () =>
                act(async () => {
                  await call("POST", `/api/undo/${enc(undo)}`);
                  chooseProject(gone.id);
                }, t("{name} is back", { name: gone.name }));
              lastUndo.current = run;
              showToast(gone.external ? t("{name} removed from the list", { name: gone.name }) : t("{name} moved to projects/_trash", { name: gone.name }), false, run);
            });
          }}
        />
      )}
      {dialog?.kind === "trash" && (
        <TrashDialog
          title={t("Deleted projects")}
          url="/api/trash"
          onClose={close}
          onOpenFolder={(path) => act(() => call("POST", "/api/open", { path }))}
          onDelete={(item) => act(() => call("DELETE", "/api/trash" + `/${enc(item.entry)}`), t("{name} sent to the recycle bin", { name: item.name }))}
          onRestore={(item) =>
            act(async () => {
              const { id } = await call<{ id: string }>("POST", "/api/trash/restore", { entry: item.entry });
              chooseProject(id);
            }, t("{name} is back", { name: item.name }))
          }
        />
      )}
      {dialog?.kind === "projectTrash" && project && (
        <TrashDialog
          title={t("Trash of {name}", { name: project.name })}
          url={`/api/projects/${enc(project.id)}/trash`}
          onClose={close}
          onOpenFolder={(path) => act(() => call("POST", "/api/open", { path }))}
          onDelete={(item) => act(() => call("DELETE", `/api/projects/${enc(project.id)}/trash` + `/${enc(item.entry)}`), t("{name} sent to the recycle bin", { name: item.name }))}
          onRestore={(item) =>
            act(async () => {
              const { restored } = await call<{ restored: string }>("POST", `/api/projects/${enc(project.id)}/trash/restore`, { entry: item.entry });
              showToast(t("{name} is back", { name: restored }));
            })
          }
        />
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
            }, t("Project added"))
          }
        />
      )}
      {dialog?.kind === "slot" && project && (
        <NewSlotDialog
          presets={state.presets}
          defaultTool={(slots ?? []).flatMap((s) => s.versions.map((v) => v.meta.tool)).find((t) => t && state.presets.some((p) => p.tool === t)) ?? undefined}
          onClose={close}
          onCreate={(name, description, version) =>
            act(async () => {
              await call("POST", `/api/projects/${enc(project.id)}/slots`, { name, description, version });
              close();
            }, t("Slot {name} created", { name }))
          }
        />
      )}
      {dialog?.kind === "final" && project && (
        <AddFinalDialog
          onClose={close}
          onAdd={(form, name) =>
            act(async () => {
              await call("POST", `/api/projects/${enc(project.id)}/slots/final`, form);
              close();
            }, t("{name} added to Done", { name }))
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
              showToast(t("v{n} saved", { n }));
            })
          }
        />
      )}
      {dialog?.kind === "clone" && project && (
        <CloneDialog
          slot={dialog.slot}
          taken={(slots ?? []).map((s) => s.name)}
          onClose={close}
          onClone={(name, removeApproval) =>
            act(async () => {
              await call("POST", `${slotUrl(project.id, dialog.slot.name)}/clone`, { name });
              if (removeApproval) await call("PUT", `${slotUrl(project.id, name)}/approval`, { version: null });
              close();
            }, removeApproval ? t("{from} copied to {to}, without approval", { from: dialog.slot.name, to: name }) : t("{from} copied to {to}", { from: dialog.slot.name, to: name }))
          }
        />
      )}

      {touring && <Tutorial onClose={closeTour} />}

      {toast && (
        <div key={toast.id} className={`toast${toast.isError ? " is-error" : ""}`} role="status">
          <span className="toast-message">
            {toast.message}
            {toast.detail && (
              <span className="toast-detail" title={toast.detail}>
                {toast.detail}
              </span>
            )}
          </span>
          {toast.undo && (
            <button className="toast-undo" onClick={runUndo} title={t("Undo (Ctrl+Z)")}>
              {t("Undo")}
            </button>
          )}
          <button className="toast-close" onClick={() => setToast(null)} aria-label={t("Dismiss")}>
            <Icon name="x" size={10} />
          </button>
          {toast.undo && <span className="toast-timer" style={{ animationDuration: `${UNDO_MS}ms` }} aria-hidden="true" />}
        </div>
      )}
    </AppContext.Provider>
  );
}

/**
 * Shown inside another site's frame, the page could sit invisible under a decoy, so a click meant for the decoy
 * lands on "Delete for good" (clickjacking). The server cannot send the header that forbids framing with the
 * bundled page, so the page refuses to start there instead. A cross-origin parent throws on access: framed too.
 */
function framed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

if (!framed()) {
  createRoot(document.getElementById("root")!).render(
    <>
      <App />
      <Tooltips />
    </>,
  );
}
