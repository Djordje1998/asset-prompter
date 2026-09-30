import { type FSWatcher, existsSync, mkdirSync, statSync, watch } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { AppState, ProjectSummary } from "../shared/types";
import index from "../web/index.html";
import {
  UserError,
  addCandidates,
  addVersion,
  createSlot,
  deleteCandidate,
  extractFrames,
  segment,
  setApproval,
  setFeedback,
  setSelected,
  slugName,
  trashSlot,
} from "./actions";
import { APP_ROOT, loadConfig, saveConfig } from "./config";
import { writeHowTo } from "./howto";
import { loadPresets } from "./preset";
import { countStatuses, mediaKind, scanProject } from "./store";

const config = loadConfig();
const projectsDir = resolve(APP_ROOT, config.projectsDir);
mkdirSync(projectsDir, { recursive: true });
const presets = loadPresets(join(APP_ROOT, "presets"));

interface Project {
  id: string;
  name: string;
  path: string;
  external: boolean;
}

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

function listProjects(): Project[] {
  const projects: Project[] = [];
  for (const entry of new Bun.Glob("*").scanSync({ cwd: projectsDir, onlyFiles: false })) {
    if (entry.startsWith("_") || entry.startsWith(".") || !isDir(join(projectsDir, entry))) continue;
    projects.push({ id: entry, name: entry, path: join(projectsDir, entry), external: false });
  }
  projects.sort((a, b) => a.name.localeCompare(b.name));
  for (const path of config.externalProjects) {
    if (!isDir(path)) continue;
    const name = basename(path);
    const id = projects.some((p) => p.id === name) ? `${name}-${Bun.hash(path).toString(36).slice(0, 5)}` : name;
    projects.push({ id, name, path, external: true });
  }
  return projects;
}

function findProject(id: string): Project {
  const project = listProjects().find((p) => p.id === id);
  if (!project) throw new UserError(`Project "${id}" does not exist.`);
  return project;
}

// ---- live updates -------------------------------------------------------

const clients = new Set<ReadableStreamDefaultController<string>>();
let pending: Timer | null = null;

function notifyChange(): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    for (const client of clients) {
      try {
        client.enqueue("data: change\n\n");
      } catch {
        clients.delete(client);
      }
    }
  }, 150);
}

const watchers = new Map<string, FSWatcher>();

function refreshWatchers(): void {
  const wanted = new Set([projectsDir, ...config.externalProjects.filter(isDir)]);
  for (const [path, watcher] of watchers) {
    if (!wanted.has(path)) {
      watcher.close();
      watchers.delete(path);
    }
  }
  for (const path of wanted) {
    if (watchers.has(path)) continue;
    try {
      const watcher = watch(path, { recursive: true }, notifyChange);
      watcher.on("error", (e) => console.warn(`Stopped watching ${path}: ${e}`));
      watchers.set(path, watcher);
    } catch (e) {
      console.warn(`Cannot watch ${path}; the page will not update live for it. ${e}`);
    }
  }
}

// ---- http helpers -------------------------------------------------------

const json = (data: unknown, status = 200) => Response.json(data, { status });

function serveFile(req: Request, path: string): Response {
  if (!existsSync(path) || !statSync(path).isFile()) return new Response("Not found", { status: 404 });
  const file = Bun.file(path);
  const headers: Record<string, string> = { "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!range || (range[1] === "" && range[2] === "")) return new Response(file, { headers });
  const size = file.size;
  const start = range[1] === "" ? Math.max(0, size - Number(range[2])) : Number(range[1]);
  const end = range[1] === "" || range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Type": file.type },
  });
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function openInFileManager(path: string): void {
  const cmd = process.platform === "win32" ? ["explorer", path] : process.platform === "darwin" ? ["open", path] : ["xdg-open", path];
  Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
}

function versionNumber(value: string): number {
  if (!/^\d+$/.test(value)) throw new UserError(`"${value}" is not a version number.`);
  return Number(value);
}

// ---- routes -------------------------------------------------------------

async function api(req: Request, url: URL): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean).slice(1).map(decodeURIComponent);
  const method = req.method;
  const body = async () => (await req.json()) as Record<string, any>;

  if (parts[0] === "state" && method === "GET") {
    // A project folder made by hand (or by an agent) gets its instructions as soon as the page notices it.
    for (const p of listProjects()) writeHowTo(p.path, presets);
    const projects: ProjectSummary[] = listProjects().map((p) => ({ ...p, counts: countStatuses(scanProject(p.id, p.path, presets)) }));
    const state: AppState = { projects, presets, ffmpeg: Bun.which("ffmpeg") !== null, projectsDir };
    return json(state);
  }

  if (parts[0] === "events" && method === "GET") {
    let controller!: ReadableStreamDefaultController<string>;
    const stream = new ReadableStream<string>({
      start(c) {
        controller = c;
        clients.add(c);
        c.enqueue(": connected\n\n");
      },
      cancel() {
        clients.delete(controller);
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  }

  if (parts[0] === "ext-file" && method === "GET") {
    const path = url.searchParams.get("path") ?? "";
    if (!isAbsolute(path) || !mediaKind(path)) return new Response("Not found", { status: 404 });
    return serveFile(req, path);
  }

  if (parts[0] === "open" && method === "POST") {
    const path = resolve(String((await body()).path ?? ""));
    if (!listProjects().some((p) => p.path === path || inside(p.path, path))) throw new UserError("That folder is not part of a project.");
    openInFileManager(isDir(path) ? path : resolve(path, ".."));
    return json({ ok: true });
  }

  if (parts[0] !== "projects") return json({ error: "Not found" }, 404);

  if (parts.length === 1 && method === "POST") {
    const data = await body();
    if (typeof data.path === "string" && data.path.trim()) {
      const path = resolve(data.path.trim());
      if (!isAbsolute(data.path.trim())) throw new UserError("Enter the full path of the folder.");
      if (!isDir(path)) throw new UserError(`${path} is not an existing folder.`);
      if (path === projectsDir || inside(projectsDir, path)) throw new UserError("That folder is already inside the default projects folder.");
      if (!config.externalProjects.includes(path)) {
        config.externalProjects.push(path);
        saveConfig(config);
      }
      writeHowTo(path, presets);
      refreshWatchers();
      return json({ id: listProjects().find((p) => p.path === path)!.id });
    }
    const name = slugName(data.name, "Project name");
    const path = join(projectsDir, name);
    if (existsSync(path)) throw new UserError(`A project named "${name}" already exists.`);
    mkdirSync(path);
    writeHowTo(path, presets);
    return json({ id: name });
  }

  const project = findProject(parts[1] ?? "");

  if (parts.length === 2 && method === "GET") return json({ slots: scanProject(project.id, project.path, presets) });

  if (parts.length === 2 && method === "DELETE") {
    if (!project.external) throw new UserError("Only folders added from elsewhere can be removed from the list. Delete this project's folder by hand.");
    config.externalProjects = config.externalProjects.filter((p) => p !== project.path);
    saveConfig(config);
    refreshWatchers();
    notifyChange();
    return json({ ok: true });
  }

  if (parts[2] !== "slots") return json({ error: "Not found" }, 404);

  if (parts.length === 3 && method === "POST") {
    const data = await body();
    createSlot(project.path, slugName(data.name, "Slot name"), String(data.description ?? ""), data.version);
    return json({ ok: true });
  }

  const slot = segment(parts[3], "Slot");

  if (parts.length === 4 && method === "DELETE") {
    trashSlot(project.path, slot);
    return json({ ok: true });
  }

  if (parts[4] === "approval" && method === "PUT") {
    const { version } = await body();
    setApproval(project.path, slot, version === null ? null : versionNumber(String(version)));
    return json({ ok: true });
  }

  if (parts[4] !== "versions") return json({ error: "Not found" }, 404);

  if (parts.length === 5 && method === "POST") return json({ version: addVersion(project.path, slot, (await body()) as any) });

  const n = versionNumber(parts[5] ?? "");
  const action = parts[6];

  if (action === "candidates" && parts.length === 7 && method === "POST") {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new UserError("No files were received.");
    const written = await addCandidates(project.path, slot, n, files);
    // Frame extraction runs after the response; the watcher refreshes the page when the sheets land.
    for (const path of written) if (mediaKind(path) === "video") void extractFrames(path);
    return json({ ok: true });
  }

  if (action === "candidates" && parts.length === 8 && method === "DELETE") {
    deleteCandidate(project.path, slot, n, segment(parts[7], "File"));
    return json({ ok: true });
  }

  if (action === "selected" && method === "PUT") {
    setSelected(project.path, slot, n, segment((await body()).file, "File"));
    return json({ ok: true });
  }

  if (action === "feedback" && method === "PUT") {
    setFeedback(project.path, slot, n, String((await body()).text ?? ""));
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}

const HOST = "127.0.0.1";
const allowedHosts = new Set([`${HOST}:${config.port}`, `localhost:${config.port}`]);

const server = Bun.serve({
  hostname: HOST,
  port: config.port,
  idleTimeout: 0,
  maxRequestBodySize: 4 * 1024 ** 3,
  development: process.env.NODE_ENV === "development",
  routes: { "/": index },
  async fetch(req) {
    const url = new URL(req.url);
    // Other websites open in the same browser must not be able to reach this server.
    if (!allowedHosts.has(req.headers.get("host") ?? "")) return new Response("Forbidden", { status: 403 });
    const origin = req.headers.get("origin");
    if (origin && !allowedHosts.has(new URL(origin).host)) return new Response("Forbidden", { status: 403 });

    try {
      if (url.pathname.startsWith("/api/")) return await api(req, url);
      if (url.pathname.startsWith("/files/") && req.method === "GET") {
        const [id, ...rest] = url.pathname.split("/").slice(2).map(decodeURIComponent);
        const project = findProject(id ?? "");
        const path = resolve(project.path, ...rest);
        if (!inside(project.path, path)) return new Response("Not found", { status: 404 });
        return serveFile(req, path);
      }
      return new Response("Not found", { status: 404 });
    } catch (e) {
      if (e instanceof UserError) return json({ error: e.message }, 400);
      console.error(e);
      return json({ error: (e as Error).message }, 500);
    }
  },
});

for (const project of listProjects()) writeHowTo(project.path, presets);
refreshWatchers();
setInterval(() => {
  for (const client of clients) {
    try {
      client.enqueue(": ping\n\n");
    } catch {
      clients.delete(client);
    }
  }
}, 25_000);

const address = `http://${HOST}:${server.port}`;
console.log(`Asset Prompter is running at ${address}`);
console.log(`Projects folder: ${projectsDir}`);
if (!Bun.which("ffmpeg")) console.log("ffmpeg was not found: videos will work, but no frame sheets are made for agents.");

if (config.openBrowser && !process.env.NO_OPEN) {
  const cmd = process.platform === "win32" ? ["cmd", "/c", "start", "", address] : process.platform === "darwin" ? ["open", address] : ["xdg-open", address];
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // No browser launcher available; the address is printed above.
  }
}
