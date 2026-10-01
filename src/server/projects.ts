import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { UserError } from "./actions";

// The project registry: every folder in the default projects folder, then the ones added from elsewhere.
// Read from disk on every call, so a folder made by hand shows up without a restart.

export interface Project {
  id: string;
  name: string;
  path: string;
  external: boolean;
}

export const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

export function listProjects(projectsDir: string, externalProjects: string[]): Project[] {
  const projects: Project[] = [];
  for (const entry of new Bun.Glob("*").scanSync({ cwd: projectsDir, onlyFiles: false })) {
    if (entry.startsWith("_") || entry.startsWith(".") || !isDir(join(projectsDir, entry))) continue;
    projects.push({ id: entry, name: entry, path: join(projectsDir, entry), external: false });
  }
  projects.sort((a, b) => a.name.localeCompare(b.name));
  for (const path of externalProjects) {
    if (!isDir(path)) continue;
    const name = basename(path);
    const id = projects.some((p) => p.id === name) ? `${name}-${Bun.hash(path).toString(36).slice(0, 5)}` : name;
    projects.push({ id, name, path, external: true });
  }
  return projects;
}

export function findProject(projects: Project[], id: string): Project {
  const project = projects.find((p) => p.id === id);
  if (!project) throw new UserError(`Project "${id}" does not exist.`);
  return project;
}
