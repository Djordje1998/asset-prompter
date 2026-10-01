import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { UserError } from "./actions";

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export const notFound = (req: Request) =>
  new URL(req.url).pathname.startsWith("/api/") ? json({ error: "Not found" }, 404) : new Response("Not found", { status: 404 });

/**
 * Wraps every handler: other websites open in the same browser must not be able to reach this server,
 * a UserError becomes a 400 with its message, anything else a 500.
 */
export function guard(allowedHosts: Set<string>) {
  return <R extends Request>(handler: (req: R) => Response | Promise<Response>) =>
    async (req: R): Promise<Response> => {
      if (!allowedHosts.has(req.headers.get("host") ?? "")) return new Response("Forbidden", { status: 403 });
      const origin = req.headers.get("origin");
      if (origin && !allowedHosts.has(new URL(origin).host)) return new Response("Forbidden", { status: 403 });
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
  if (!existsSync(path) || !statSync(path).isFile()) return new Response("Not found", { status: 404 });
  const file = Bun.file(path);
  const stat = statSync(path);
  const etag = `"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  // Links carry ?t=<mtime>, so a changed file gets a new URL and the old one can stay cached.
  const versioned = new URL(req.url).searchParams.has("t");
  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Cache-Control": versioned ? "max-age=31536000, immutable" : "no-cache",
    ETag: etag,
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
