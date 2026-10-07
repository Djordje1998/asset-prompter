import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowed, serveFile } from "../src/server/http";

const hosts = new Set(["127.0.0.1:4777", "localhost:4777"]);
const request = (headers: Record<string, string>, method = "GET") =>
  new Request("http://127.0.0.1:4777/api/projects/demo/wait", { method, headers: { host: "127.0.0.1:4777", ...headers } });

test("the page, a typed address and an agent's curl get through", () => {
  expect(allowed(request({ "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" }), hosts)).toBe(true);
  expect(allowed(request({ origin: "http://127.0.0.1:4777", "sec-fetch-site": "same-origin" }, "POST"), hosts)).toBe(true);
  expect(allowed(request({ "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }), hosts)).toBe(true);
  expect(allowed(request({}), hosts)).toBe(true);
});

test("another host, another origin or an origin of null is refused", () => {
  expect(allowed(request({ host: "evil.example:4777" }), hosts)).toBe(false);
  expect(allowed(request({ origin: "http://evil.example" }, "POST"), hosts)).toBe(false);
  expect(allowed(request({ origin: "null" }, "POST"), hosts)).toBe(false);
});

test("another site may link to the app, but not load from it or frame it", () => {
  const from = (mode: string, dest: string, method = "GET") => request({ "sec-fetch-site": "cross-site", "sec-fetch-mode": mode, "sec-fetch-dest": dest }, method);
  expect(allowed(from("navigate", "document"), hosts)).toBe(true);
  // An <img> pointed at /wait would otherwise sit there as a listening agent and take its briefing.
  expect(allowed(from("no-cors", "image"), hosts)).toBe(false);
  expect(allowed(from("navigate", "iframe"), hosts)).toBe(false);
  expect(allowed(request({ "sec-fetch-site": "same-site", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" }), hosts)).toBe(false);
});

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "asset-prompter-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("a project file is served sandboxed, so an SVG or HTML opened on its own runs no script as the app", async () => {
  const path = join(dir, "logo.svg");
  writeFileSync(path, `<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/projects")</script></svg>`);
  for (const headers of [{}, { range: "bytes=0-9" }] as Record<string, string>[]) {
    const res = serveFile(new Request("http://127.0.0.1:4777/files/p/logo.svg", { headers }), path);
    expect(res.headers.get("content-security-policy")).toBe("sandbox");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  }
});
