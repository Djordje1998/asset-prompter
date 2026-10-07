import { type Stats, statSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { UserError } from "./actions";

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export const notFound = (req: Request) =>
  new URL(req.url).pathname.startsWith("/api/") ? json({ error: "Not found" }, 404) : new Response("Not found", { status: 404 });

const hostOf = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    // "null", sent by sandboxed frames and file:// pages, is no address at all.
    return null;
  }
};

/**
 * Whether a request may come from where it does. The Host header shuts out DNS rebinding, the Origin header
 * other sites' fetches and form posts. A page elsewhere can still load an image or open a GET without an
 * Origin, e.g. to /wait, which would answer it in place of the agent; browsers say where those come from in
 * Sec-Fetch-Site, so from another site only a plain navigation to a page is let through, such as a link to
 * the app. Agents' curl and other tools send none of these headers.
 */
export function allowed(req: Request, allowedHosts: Set<string>): boolean {
  if (!allowedHosts.has(req.headers.get("host") ?? "")) return false;
  const origin = req.headers.get("origin");
  if (origin !== null && !allowedHosts.has(hostOf(origin) ?? "")) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site === null || site === "same-origin" || site === "none") return true;
  return req.method === "GET" && req.headers.get("sec-fetch-mode") === "navigate" && req.headers.get("sec-fetch-dest") === "document";
}

/**
 * Wraps every handler: other websites open in the same browser must not be able to reach this server,
 * a UserError becomes a 400 with its message, anything else a 500.
 */
export function guard(allowedHosts: Set<string>) {
  return <R extends Request>(handler: (req: R) => Response | Promise<Response>) =>
    async (req: R): Promise<Response> => {
      if (!allowed(req, allowedHosts)) return new Response("Forbidden", { status: 403 });
      try {
        return await handler(req);
      } catch (e) {
        if (e instanceof UserError) return json({ error: e.message }, 400);
        console.error(e);
        return json({ error: (e as Error).message }, 500);
      }
    };
}

export function serveFile(req: Request, path: string): Response {
  // One stat per request: every image and video on the page comes through here.
  let stat: Stats;
  try {
    stat = statSync(path);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("Not found", { status: 404 });
  const file = Bun.file(path);
  const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  // Links carry ?t=<mtime>, so a changed file gets a new URL and the old one can stay cached.
  const versioned = new URL(req.url).searchParams.has("t");
  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Cache-Control": versioned ? "max-age=31536000, immutable" : "no-cache",
    ETag: etag,
    // Project files are written by agents and generators. Opened on their own, an SVG or HTML file would run
    // its scripts as this app, able to call the API; sandboxed it only shows. <img> and <video> ignore this.
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff",
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
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

export function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function openInFileManager(path: string): void {
  const cmd = process.platform === "win32" ? ["explorer", path] : process.platform === "darwin" ? ["open", path] : ["xdg-open", path];
  Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
}
