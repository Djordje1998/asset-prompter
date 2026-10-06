import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import index from "../web/index.html";
import { backfill } from "./analysis";
import { APP_ROOT, CONFIG_PATH, loadConfig } from "./config";
import { guard, notFound } from "./http";
import { refreshWatchers, startPings } from "./live";
import { loadPresets } from "./preset";
import { type App, apiRoutes, howTo, projectsOf } from "./routes";
import { fileLog, useBriefingLog } from "./wake";

const config = loadConfig();
const projectsDir = resolve(APP_ROOT, config.projectsDir);
mkdirSync(projectsDir, { recursive: true });
const presetsDir = join(APP_ROOT, "presets");
const app: App = { config, projectsDir, presets: loadPresets(presetsDir), presetsDir };
// Next to config.json, so a second instance with its own config keeps its own record.
useBriefingLog(fileLog(join(dirname(CONFIG_PATH), "briefings.json")));

const HOST = "127.0.0.1";
const guarded = guard(new Set([`${HOST}:${config.port}`, `localhost:${config.port}`]));

const server = Bun.serve({
  hostname: HOST,
  port: config.port,
  idleTimeout: 0,
  maxRequestBodySize: 4 * 1024 ** 3,
  development: process.env.NODE_ENV === "development",
  routes: { "/": index, ...apiRoutes(app, guarded) },
  // Anything no route matched, including a known path with another method.
  fetch: guarded(notFound),
});

for (const project of projectsOf(app)) howTo(app, project);
refreshWatchers(projectsDir, config.externalProjects);
backfill(() => projectsOf(app), app.presets);
startPings();

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
