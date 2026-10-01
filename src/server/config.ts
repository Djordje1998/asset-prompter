import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const APP_ROOT = resolve(import.meta.dir, "../..");
export const CONFIG_PATH = process.env.ASSET_PROMPTER_CONFIG ?? join(APP_ROOT, "config.json");

export interface Config {
  port: number;
  /** Default home of projects; relative paths are resolved against the app folder. */
  projectsDir: string;
  /** Project folders that live elsewhere, e.g. inside a repo an agent works in. */
  externalProjects: string[];
  openBrowser: boolean;
}

const DEFAULTS: Config = { port: 4777, projectsDir: "projects", externalProjects: [], openBrowser: true };

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULTS);
    return { ...DEFAULTS };
  }
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_PATH, "utf8")) };
  } catch (e) {
    throw new Error(`${CONFIG_PATH} is not valid JSON: ${(e as Error).message}`);
  }
}

export function saveConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}
