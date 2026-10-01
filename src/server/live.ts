import { type FSWatcher, watch } from "node:fs";
import { isDir } from "./projects";
import { projectScans } from "./scans";

// Live updates: the page keeps an event stream open and reloads its data when a project folder changes.

const clients = new Set<ReadableStreamDefaultController<string>>();
let pending: Timer | null = null;

export function notifyChange(): void {
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

export function eventStream(): Response {
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

/** A comment now and then, so idle streams are not closed along the way. */
export function startPings(): void {
  setInterval(() => {
    for (const client of clients) {
      try {
        client.enqueue(": ping\n\n");
      } catch {
        clients.delete(client);
      }
    }
  }, 25_000);
}

const watchers = new Map<string, FSWatcher>();

/** Watches the default projects folder and every added one; call again when the list changes. */
export function refreshWatchers(projectsDir: string, externalProjects: string[]): void {
  const wanted = new Set([projectsDir, ...externalProjects.filter(isDir)]);
  for (const [path, watcher] of watchers) {
    if (!wanted.has(path)) {
      watcher.close();
      watchers.delete(path);
      // Changes made while it is unwatched would be missed, e.g. a folder removed from the list and added back.
      projectScans.watching(path, false);
    }
  }
  for (const path of wanted) {
    if (watchers.has(path)) continue;
    try {
      // The kept scan is dropped before the page is told, so the reload it triggers sees the change.
      const watcher = watch(path, { recursive: true }, (_event, filename) => {
        projectScans.changed(path, filename === null ? null : String(filename));
        notifyChange();
      });
      watcher.on("error", (e) => {
        // Without a watcher nothing would drop its projects' scans, so they are no longer kept.
        projectScans.watching(path, false);
        console.warn(`Stopped watching ${path}: ${e}`);
      });
      watchers.set(path, watcher);
      projectScans.watching(path, true);
    } catch (e) {
      console.warn(`Cannot watch ${path}; the page will not update live for it. ${e}`);
    }
  }
}
