import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { AppState, Preset, ProjectSummary } from "../shared/types";
import {
  UserError,
  addResults,
  addVersion,
  createSlot,
  deleteResult,
  segment,
  setApproval,
  setChangeRequest,
  setSelected,
  slotName,
  slugName,
  trashSlot,
} from "./actions";
import { afterResults, refreshInfo } from "./analysis";
import { type Config, saveConfig } from "./config";
import { writeHowTo } from "./howto";
import { inside, json, notFound, openInFileManager, serveFile } from "./http";
import { eventStream, notifyChange, refreshWatchers } from "./live";
import { type Project, findProject, isDir, listProjects } from "./projects";
import { projectScans, selfContained } from "./scans";
import { countStatuses, mediaKind, scanProject } from "./store";
import { hasNews, listening, notifyAgent, pendingApprovals, waitForNotify } from "./wake";

export interface App {
  config: Config;
  /** `config.projectsDir`, resolved. */
  projectsDir: string;
  presets: Preset[];
}

type Params = Record<string, string>;
type Handler = (req: Request, params: Params) => Response | Promise<Response>;
type Wrap = (handler: (req: Request) => Response | Promise<Response>) => (req: Request) => Promise<Response>;

export const projectsOf = (app: App) => listProjects(app.projectsDir, app.config.externalProjects);

const waitUrl = (app: App, id: string) => `http://localhost:${app.config.port}/api/projects/${encodeURIComponent(id)}/wait`;
export const howTo = (app: App, p: { id: string; path: string }) => writeHowTo(p.path, app.presets, waitUrl(app, p.id));

function versionNumber(value: string): number {
  if (!/^\d+$/.test(value)) throw new UserError(`"${value}" is not a version number.`);
  return Number(value);
}

/** Bun matches the raw path; the params are decoded here, so a malformed escape is still an error. */
function decodeParams(pattern: string, req: Request): Params {
  const raw = new URL(req.url).pathname.split("/");
  const params: Params = {};
  pattern.split("/").forEach((part, i) => {
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(raw[i] ?? "");
  });
  return params;
}

/** The API and project files, as Bun.serve routes. Every handler goes through `wrap`. */
export function apiRoutes(app: App, wrap: Wrap) {
  const { config, projectsDir, presets } = app;
  const projects = () => projectsOf(app);
  const project = (p: Params) => findProject(projects(), p.id ?? "");
  const slotOf = (p: Params) => segment(p.slot, "Slot");
  const body = async (req: Request) => (await req.json()) as Record<string, any>;
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
        const list: ProjectSummary[] = all.map((p) => ({ ...p, counts: countStatuses(slotsOf(p)), listening: listening(p.id) }));
        const state: AppState = { projects: list, presets, ffmpeg: Bun.which("ffmpeg") !== null, projectsDir };
        return json(state);
      },
    },

    "/api/events": { GET: () => eventStream() },

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
        if (!projects().some((p) => p.path === path || inside(p.path, path))) throw new UserError("That folder is not part of a project.");
        openInFileManager(isDir(path) ? path : resolve(path, ".."));
        return json({ ok: true });
      },
    },

    "/api/projects": {
      POST: async (req) => {
        const data = await body(req);
        if (typeof data.path === "string" && data.path.trim()) {
          const path = resolve(data.path.trim());
          if (!isAbsolute(data.path.trim())) throw new UserError("Enter the full path of the folder.");
          if (!isDir(path)) throw new UserError(`${path} is not an existing folder.`);
          if (path === projectsDir || inside(projectsDir, path)) throw new UserError("That folder is already inside the default projects folder.");
          if (!config.externalProjects.includes(path)) {
            config.externalProjects.push(path);
            saveConfig(config);
          }
          const added = projects().find((p) => p.path === path)!;
          howTo(app, added);
          watchAll();
          return json({ id: added.id });
        }
        const name = slugName(data.name, "Project name");
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
        return json({ slots, listening: listening(proj.id), newApprovals: pendingApprovals(proj.path, slots) });
      },
      DELETE: (_, p) => {
        const proj = project(p);
        if (!proj.external) throw new UserError("Only folders added from elsewhere can be removed from the list. Delete this project's folder by hand.");
        config.externalProjects = config.externalProjects.filter((path) => path !== proj.path);
        saveConfig(config);
        watchAll();
        notifyChange();
        return json({ ok: true });
      },
    },

    "/api/projects/:id/wait": {
      GET: async (req, p) => {
        const proj = project(p);
        const text = await waitForNotify(proj, slotsOf(proj), req.signal, notifyChange);
        return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      },
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

    "/api/projects/:id/slots/:slot": {
      DELETE: (_, p) => {
        const proj = project(p);
        trashSlot(proj.path, slotOf(p));
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
        return json({ version: addVersion(proj.path, slot, (await body(req)) as any) });
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
        deleteResult(proj.path, slot, n, segment(p.file, "File"));
        refreshInfo(proj, presets, slot, n);
        return json({ ok: true });
      },
    },

    "/api/projects/:id/slots/:slot/versions/:n/selected": {
      PUT: async (req, p) => {
        const proj = project(p);
        const slot = slotOf(p);
        const n = versionNumber(p.n ?? "");
        setSelected(proj.path, slot, n, segment((await body(req)).file, "File"));
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

    // A file inside a project: /files/<project id>/<path inside it>, each part URL-encoded.
    "/files/*": {
      GET: (req) => {
        const [id, ...rest] = new URL(req.url).pathname.split("/").slice(2).map(decodeURIComponent);
        const proj = findProject(projects(), id ?? "");
        const path = resolve(proj.path, ...rest);
        if (!inside(proj.path, path)) return new Response("Not found", { status: 404 });
        return serveFile(req, path);
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
