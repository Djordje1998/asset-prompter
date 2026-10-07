import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { AppState, Preset, ProjectSummary } from "../shared/types";
import {
  UserError,
  addFinal,
  addResults,
  addVersion,
  cloneSlot,
  createSlot,
  deleteTrashed,
  deleteResult,
  listTrash,
  newFolderName,
  restoreProject,
  restoreResult,
  restoreTrashed,
  restoreTrashedProject,
  restoreSlot,
  segment,
  setApproval,
  setChangeRequest,
  setSelected,
  slotName,
  slugName,
  trashProject,
  trashSlot,
} from "./actions";
import { afterResults, refreshInfo } from "./analysis";
import { type Config, saveConfig } from "./config";
import { thumbnail } from "./thumbs";
import { HOWTO_FILE, writeHowTo } from "./howto";
import { inside, json, notFound, openInFileManager, serveFile } from "./http";
import { version } from "../../package.json";
import { eventStream, notifyChange, refreshWatchers } from "./live";
import { findTool } from "./media";
import { logoPath } from "./preset";
import { type Project, findProject, isDir, listProjects } from "./projects";
import { projectScans, selfContained } from "./scans";
import { TRASH_DIR, countStatuses, fileUrl, mediaKind, scanProject, slotStamps } from "./store";
import { hasNews, listening, notifyAgent, pendingApprovals, stopAgents, waitForNotify } from "./wake";

export interface App {
  config: Config;
  /** `config.projectsDir`, resolved. */
  projectsDir: string;
  presets: Preset[];
  /** The folder the presets and their logos were read from. */
  presetsDir: string;
}

type Params = Record<string, string>;
type Handler = (req: Request, params: Params) => Response | Promise<Response>;
type Wrap = (handler: (req: Request) => Response | Promise<Response>) => (req: Request) => Promise<Response>;

/**
 * Undo for a removal. The page keeps only its last one, until the next change; the server keeps the most
 * recent few, in memory, so a restart ends them all.
 */
const undos = new Map<string, { project: string; run: () => void }>();
const UNDO_KEEP = 20;

function offerUndo(project: Project, run: () => void): string {
  const token = crypto.randomUUID();
  undos.set(token, { project: project.id, run });
  // A Map keeps insertion order, so the first keys are the oldest.
  for (const old of [...undos.keys()].slice(0, Math.max(0, undos.size - UNDO_KEEP))) undos.delete(old);
  return token;
}

export const projectsOf = (app: App) => listProjects(app.projectsDir, app.config.externalProjects);

const waitUrl = (app: App, id: string) => `http://localhost:${app.config.port}/api/projects/${encodeURIComponent(id)}/wait`;
export function howTo(app: App, p: { id: string; path: string }): void {
  try {
    writeHowTo(p.path, app.presets, waitUrl(app, p.id));
  } catch (e) {
    // A folder the app cannot write to (read-only, or the file locked by another program) still shows;
    // only its instructions are missing. Thrown, it took the whole project list down with it.
    console.warn(`Cannot write ${HOWTO_FILE} in ${p.path}: ${(e as Error).message}`);
  }
}

function versionNumber(value: string): number {
  if (!/^\d+$/.test(value)) throw new UserError(`"${value}" is not a version number.`);
  return Number(value);
}

/** decodeURIComponent, with a malformed escape answered as the client's mistake rather than a server error. */
function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    throw new UserError(`"${part}" is not a valid URL part.`);
  }
}

/** Bun matches the raw path; the params are decoded here, so a malformed escape is still an error. */
function decodeParams(pattern: string, req: Request): Params {
  const raw = new URL(req.url).pathname.split("/");
  const params: Params = {};
  pattern.split("/").forEach((part, i) => {
    if (part.startsWith(":")) params[part.slice(1)] = decode(raw[i] ?? "");
  });
  return params;
}

/** The API and project files, as Bun.serve routes. Every handler goes through `wrap`. */
export function apiRoutes(app: App, wrap: Wrap) {
  const { config, projectsDir, presets } = app;
  const projects = () => projectsOf(app);
  const project = (p: Params) => findProject(projects(), p.id ?? "");
  // Folders starting with _ or . are never slots (_trash, .git), so no call may act on one as if it were.
  const slotOf = (p: Params) => slugName(p.slot, "Slot");
  const body = async (req: Request): Promise<Record<string, any>> => {
    let data: unknown;
    try {
      data = await req.json();
    } catch {
      throw new UserError("The request body is not valid JSON.");
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) throw new UserError("The request body must be a JSON object.");
    return data as Record<string, any>;
  };
  const watchAll = () => refreshWatchers(projectsDir, config.externalProjects);
  const slotsOf = (p: Project) => projectScans.get(p.id, p.path, () => scanProject(p.id, p.path, presets), (slots) => selfContained(p.path, slots));
  /** After a call that may have written: the project it names, or every project when it names none. */
  const forget = (p: Params) => {
    const proj = p.id === undefined ? undefined : projects().find((q) => q.id === p.id);
    if (proj) projectScans.invalidate(proj.path);
    else projectScans.invalidateAll();
  };

  const table: Record<string, Record<string, Handler>> = {
    "/api/state": {
      GET: () => {
        const all = projects();
        projectScans.retain(all);
        // A project folder made by hand (or by an agent) gets its instructions as soon as the page notices it.
        // Checked again only after the folder changed: the text depends on presets and the port, fixed while running.
        for (const p of all) projectScans.whenNew(p.id, p.path, () => howTo(app, p));
        const list: ProjectSummary[] = all.map((p) => {
          const slots = slotsOf(p);
          return { ...p, counts: countStatuses(slots), stamps: slotStamps(slots), listening: listening(p.id) };
        });
        const trashedProjects = listTrash(join(projectsDir, TRASH_DIR), true).filter((i) => i.kind === "project").length;
        const state: AppState = { projects: list, presets, ffmpeg: findTool("ffmpeg") !== null, projectsDir, trashedProjects, version };
        return json(state);
      },
    },

    "/api/events": { GET: () => eventStream() },

    "/api/presets/:tool/logo": {
      GET: (req, p) => {
        const preset = presets.find((x) => x.tool === p.tool);
        const path = preset && logoPath(app.presetsDir, preset.tool);
        return path ? serveFile(req, path) : new Response("Not found", { status: 404 });
      },
    },

    "/api/ext-file": {
      GET: (req) => {
        const path = new URL(req.url).searchParams.get("path") ?? "";
        if (!isAbsolute(path) || !mediaKind(path)) return new Response("Not found", { status: 404 });
        return serveFile(req, path);
      },
    },

    "/api/open": {
      POST: async (req) => {
        const path = resolve(String((await body(req)).path ?? ""));
        const projectTrash = join(projectsDir, TRASH_DIR);
        if (!projects().some((p) => p.path === path || inside(p.path, path)) && path !== projectTrash && !inside(projectTrash, path))
          throw new UserError("That folder is not part of a project.");
        openInFileManager(isDir(path) ? path : resolve(path, ".."));
        return json({ ok: true });
      },
    },

    "/api/projects": {
      POST: async (req) => {
        // Only new folders in the projects folder: one elsewhere is added by hand in config.json (externalProjects).
        const data = await body(req);
        const name = newFolderName(data.name, "Project name");
        const path = join(projectsDir, name);
        if (existsSync(path)) throw new UserError(`A project named "${name}" already exists.`);
        mkdirSync(path);
        howTo(app, { id: name, path });
        return json({ id: name });
      },
    },

    "/api/projects/:id": {
      GET: (_, p) => {
        const proj = project(p);
        const slots = slotsOf(proj);
        const trash = listTrash(join(proj.path, TRASH_DIR), false).length;
        return json({ slots, listening: listening(proj.id), newApprovals: pendingApprovals(proj.path, slots), trash });
      },
      // A project of the projects folder goes to its _trash; one added from elsewhere only leaves the list,
      // and its folder stays where it is. Either way it can be undone.
      DELETE: (_, p) => {
        const proj = project(p);
        stopAgents(proj);
        let undo: () => void;
        if (proj.external) {
          config.externalProjects = config.externalProjects.filter((path) => path !== proj.path);
          undo = () => {
            if (!config.externalProjects.includes(proj.path)) config.externalProjects.push(proj.path);
            saveConfig(config);
          };
        } else {
          const trashed = trashProject(projectsDir, proj.path);
          undo = () => restoreProject(proj.path, trashed);
        }
        saveConfig(config);
        watchAll();
        notifyChange();
        return json({
          ok: true,
          undo: offerUndo(proj, () => {
            undo();
            watchAll();
          }),
        });
      },
    },

    "/api/projects/:id/wait": {
      GET: async (req, p) => {
        const proj = project(p);
        const text = await waitForNotify(proj, slotsOf(proj), req.signal, notifyChange);
        return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      },
    },

    "/api/projects/:id/stop": {
      POST: (_, p) => json({ stopped: stopAgents(project(p)) }),
    },

    "/api/projects/:id/notify": {
      POST: (_, p) => {
        const proj = project(p);
        const slots = slotsOf(proj);
        if (!hasNews(proj.path, slots)) throw new UserError("Nothing new for the agent: no slot is its turn and it has heard of every approval.");
        return json({ delivered: notifyAgent(proj, slots) });
      },
    },

    "/api/projects/:id/slots": {
      POST: async (req, p) => {
        const proj = project(p);
        const data = await body(req);
        createSlot(proj.path, slotName(data.name), String(data.description ?? ""), data.version);
        return json({ ok: true });
      },
    },

    // A finished asset, straight into Done: multipart with name, description and one file.
    "/api/projects/:id/slots/final": {
      POST: async (req, p) => {
        const proj = project(p);
        const form = await req.formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new UserError("No file was received.");
        const name = slotName(String(form.get("name") ?? ""));
        await addFinal(proj.path, name, String(form.get("description") ?? ""), file);
        return json({ ok: true });
      },
    },

    "/api/projects/:id/slots/:slot": {
      DELETE: (_, p) => {
        const proj = project(p);
        const slot = slotOf(p);
        const trashed = trashSlot(proj.path, slot);
        return json({ ok: true, undo: offerUndo(proj, () => restoreSlot(proj.path, slot, trashed)) });
      },
    },

    // Deleted projects, in projects/_trash.
    "/api/trash": {
      GET: () => json({ items: listTrash(join(projectsDir, TRASH_DIR), true), path: join(projectsDir, TRASH_DIR) }),
    },

    "/api/trash/restore": {
      POST: async (req) => {
        const name = restoreTrashedProject(projectsDir, String((await body(req)).entry ?? ""));
        watchAll();
        notifyChange();
        return json({ ok: true, id: name });
      },
    },

    // Delete for good: the entry leaves _trash for the computer's recycle bin.
    "/api/trash/:entry": {
      DELETE: async (_, p) => {
        await deleteTrashed(join(projectsDir, TRASH_DIR), p.entry ?? "");
        notifyChange();
        return json({ ok: true });
      },
    },

    // Deleted slots and results of one project, in its _trash.
    "/api/projects/:id/trash": {
      GET: (_, p) => {
        const proj = project(p);
        const dir = join(proj.path, TRASH_DIR);
        const items = listTrash(dir, false).map((i) => (i.kind === "result" ? { ...i, url: fileUrl(proj.id, proj.path, join(dir, i.entry)) } : i));
        return json({ items, path: dir });
      },
    },

    "/api/projects/:id/trash/restore": {
      POST: async (req, p) => {
        const proj = project(p);
        const restored = restoreTrashed(proj.path, String((await body(req)).entry ?? ""));
        notifyChange();
        return json({ ok: true, restored });
      },
    },

    "/api/projects/:id/trash/:entry": {
      DELETE: async (_, p) => {
        const proj = project(p);
        await deleteTrashed(join(proj.path, TRASH_DIR), p.entry ?? "");
        notifyChange();
        return json({ ok: true });
      },
    },

    // Undo for a whole project, which no longer exists to be looked up.
    "/api/undo/:token": {
      POST: (_, p) => {
        const entry = undos.get(p.token ?? "");
        if (!entry) throw new UserError("That can no longer be undone.");
        undos.delete(p.token!);
        entry.run();
        notifyChange();
        return json({ ok: true });
      },
    },

    "/api/projects/:id/undo/:token": {
      POST: (_, p) => {
        const proj = project(p);
        const entry = undos.get(p.token ?? "");
        if (!entry || entry.project !== proj.id) throw new UserError("That can no longer be undone.");
        undos.delete(p.token!);
        entry.run();
        return json({ ok: true });
      },
    },

    "/api/projects/:id/slots/:slot/clone": {
      POST: async (req, p) => {
        const proj = project(p);
        cloneSlot(proj.path, slotOf(p), slotName((await body(req)).name));
        return json({ ok: true });
      },
    },

    "/api/projects/:id/slots/:slot/approval": {
      PUT: async (req, p) => {
        const proj = project(p);
        const slot = slotOf(p);
        const { version } = await body(req);
        setApproval(proj.path, slot, version === null ? null : versionNumber(String(version)));
        return json({ ok: true });
      },
    },

    "/api/projects/:id/slots/:slot/versions": {
      POST: async (req, p) => {
        const proj = project(p);
        const slot = slotOf(p);
        const n = addVersion(proj.path, slot, (await body(req)) as any);
        // Only the human writes versions through the app; on a Done slot that is how they reopen it.
        setApproval(proj.path, slot, null);
        return json({ version: n });
      },
    },

    "/api/projects/:id/slots/:slot/versions/:n/results": {
      POST: async (req, p) => {
        const proj = project(p);
        const slot = slotOf(p);
        const n = versionNumber(p.n ?? "");
        const form = await req.formData();
        const files = form.getAll("files").filter((f): f is File => f instanceof File);
        if (files.length === 0) throw new UserError("No files were received.");
        const written = await addResults(proj.path, slot, n, files);
        // Analysis runs after the response; the watcher refreshes the page when the sheets land.
        afterResults(proj, presets, slot, n, written.filter((path) => mediaKind(path) === "video"));
        return json({ ok: true });
      },
    },

    "/api/projects/:id/slots/:slot/versions/:n/results/:file": {
      DELETE: (_, p) => {
        const proj = project(p);
        const slot = slotOf(p);
        const n = versionNumber(p.n ?? "");
        const file = segment(p.file, "File");
        const removed = deleteResult(proj.path, slot, n, file);
        refreshInfo(proj, presets, slot, n);
        const undo = offerUndo(proj, () => {
          restoreResult(proj.path, slot, n, file, removed);
          // The frame sheets went with the file; a restored video gets them made again.
          afterResults(proj, presets, slot, n, mediaKind(file) === "video" ? [join(proj.path, slot, `v${n}`, file)] : []);
        });
        return json({ ok: true, undo });
      },
    },

    "/api/projects/:id/slots/:slot/versions/:n/selected": {
      PUT: async (req, p) => {
        const proj = project(p);
        const slot = slotOf(p);
        const n = versionNumber(p.n ?? "");
        const { file } = await body(req);
        setSelected(proj.path, slot, n, file === null ? null : segment(file, "File"));
        return json({ ok: true });
      },
    },

    "/api/projects/:id/slots/:slot/versions/:n/change-request": {
      PUT: async (req, p) => {
        const proj = project(p);
        const slot = slotOf(p);
        const n = versionNumber(p.n ?? "");
        setChangeRequest(proj.path, slot, n, String((await body(req)).text ?? ""));
        refreshInfo(proj, presets, slot, n);
        return json({ ok: true });
      },
    },

    // A file inside a project: /files/<project id>/<path inside it>, each part URL-encoded. With ?thumb, an
    // image comes as its small copy when there is one (thumbs.ts), for the tiles and strips.
    "/files/*": {
      GET: async (req) => {
        const url = new URL(req.url);
        const [id, ...rest] = url.pathname.split("/").slice(2).map(decode);
        const proj = findProject(projects(), id ?? "");
        const path = resolve(proj.path, ...rest);
        if (!inside(proj.path, path)) return new Response("Not found", { status: 404 });
        const thumb = url.searchParams.has("thumb") ? await thumbnail(path) : null;
        return serveFile(req, thumb ?? path);
      },
    },
  };

  // Bun also sends HEAD to a GET handler; only the listed methods count, as before (a HEAD to /wait must not wait).
  // Every call that is not a GET drops the kept scans it may have changed, even when it failed halfway:
  // the watcher would too, but it can be late, and the page reloads as soon as the call answers.
  const handle = (pattern: string, method: string, handler: Handler) =>
    wrap(async (req) => {
      if (req.method !== method) return notFound(req);
      const params = decodeParams(pattern, req);
      try {
        return await handler(req, params);
      } finally {
        if (method !== "GET") forget(params);
      }
    });
  return Object.fromEntries(
    Object.entries(table).map(([pattern, methods]) => [
      pattern,
      Object.fromEntries(Object.entries(methods).map(([method, handler]) => [method, handle(pattern, method, handler)])),
    ]),
  );
}
