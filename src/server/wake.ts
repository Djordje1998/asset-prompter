import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import type { Slot } from "../shared/types";
import { recordedInputs } from "./analysis";
import { describeInfo } from "./media";
import type { Project } from "./projects";

// The briefing /wait answers with when the human presses Notify agent, and the agents waiting for it.
// Kept apart from the server so it can be tested without starting one.

/** One briefing block per slot where it is the agent's turn: why, and exactly which files to open. */
export function agentTurn(slots: Slot[]): string[] {
  return slots
    .filter((s) => s.status === "waiting_agent")
    .map((s) => {
      const v = s.versions.at(-1)!;
      const at = `${s.name}/v${v.n}`;
      const lines: string[] = [];
      if (v.changeRequest) {
        lines.push(`${s.name} v${v.n}: change request. Write v${v.n + 1}.md and v${v.n}.review.md with verdict: revise.`);
        lines.push(`  The human wrote: ${v.changeRequest.trim().replace(/\s+/g, " ")}`);
      } else if (v.review?.verdict === "revise") {
        lines.push(`${s.name} v${v.n}: your review says revise but v${v.n + 1}.md is missing. Write it.`);
      } else if (v.review) {
        lines.push(`${s.name} v${v.n}: results changed after your review. Review again.`);
      } else {
        lines.push(`${s.name} v${v.n}: new results. Review them.`);
      }
      for (const c of v.results) {
        const chosen = v.selectedBy === "human" && v.selected === c.file ? ", chosen by the human" : "";
        lines.push(`  Result: ${at}/${c.file} (${describeInfo(c.kind, c.info)}${chosen})`);
      }
      if (v.results.some((c) => c.kind === "video")) lines.push(`  Frame sheets and motion numbers: ${at}/info.md`);
      for (const input of recordedInputs(v.dir)) lines.push(`  Input used: ${input}`);
      for (const w of v.resultWarnings) lines.push(`  Mismatch: ${w}`);
      lines.push(`  Your request: ${s.name}/slot.md, ${at}.md`);
      return lines.join("\n");
    });
}

// ---- approvals the agent has not heard of ------------------------------
// An approval is news for the agent: its next job is usually to use the final file. Each briefing records
// which version of each slot was approved at that moment, so the next one only reports what changed since.

/** Per project path: slot name -> the approved version the agent was last told about. */
export type Told = Record<string, number>;

export interface BriefingLog {
  get(projectPath: string): Told;
  set(projectPath: string, told: Told): void;
}

/** Kept in memory only; the server swaps in a file-backed log so a restart does not repeat old news. */
export function memoryLog(): BriefingLog {
  const all = new Map<string, Told>();
  return { get: (p) => all.get(p) ?? {}, set: (p, told) => all.set(p, told) };
}

/** A log stored as JSON at `path`. An unreadable file counts as empty: the agent then hears old approvals once more. */
export function fileLog(path: string): BriefingLog {
  let all: Record<string, Told> = {};
  try {
    all = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    all = {};
  }
  return {
    get: (p) => all[p] ?? {},
    set: (p, told) => {
      all[p] = told;
      writeFileSync(path, JSON.stringify(all, null, 2) + "\n");
    },
  };
}

let log: BriefingLog = memoryLog();
export const useBriefingLog = (next: BriefingLog) => {
  log = next;
};

/** Approved slots whose approval the agent has not been told about yet. */
export function newApprovals(slots: Slot[], told: Told): Slot[] {
  return slots.filter((s) => s.status === "approved" && s.approved !== null && told[s.name] !== s.approved);
}

/** One line per newly approved slot, with the file to use. */
export function approvalLines(slots: Slot[]): string[] {
  return slots.map((s) => {
    const final = s.finalPath ? `${s.name}/${basename(s.finalPath)}` : `${s.name}/final.<ext>`;
    const variants = s.variants.length ? ` Your variants are in ${s.name}/exports/.` : "";
    return `${s.name}: approved v${s.approved}, final. Use ${final}; write no review or version for it.${variants}`;
  });
}

const approvedNow = (slots: Slot[]): Told => Object.fromEntries(slots.filter((s) => s.status === "approved" && s.approved !== null).map((s) => [s.name, s.approved!]));

/** Whether Notify agent has anything to say for this project. */
export const hasNews = (projectPath: string, slots: Slot[]) => agentTurn(slots).length > 0 || newApprovals(slots, log.get(projectPath)).length > 0;

export const pendingApprovals = (projectPath: string, slots: Slot[]) => newApprovals(slots, log.get(projectPath)).length;

export function wakeMessage(project: { name: string; path: string }, slots: Slot[], told: Told = {}): string {
  const turn = agentTurn(slots);
  const approved = approvalLines(newApprovals(slots, told));
  const lines = [`Notify agent in project ${project.name} (${project.path}). Paths below are relative to it.`, ""];
  if (turn.length) lines.push(...turn, "");
  if (approved.length) lines.push("Approved by the human since the last briefing:", ...approved.map((l) => `  ${l}`), "");
  const next = !turn.length
    ? "Nothing in the slots needs changing. Use the approved files where they belong, report briefly in the chat, then start waiting again with the same command."
    : approved.length
      ? "Act on the slots where it is your turn, and use the approved files where they belong. Report one short line per slot in the chat, then start waiting again with the same command."
      : "Act on these slots only. Report one short line per slot in the chat, then start waiting again with the same command.";
  lines.push(next, "");
  return lines.join("\n");
}

/** The briefing to deliver now, and the approvals it reports recorded as told. */
function deliver(project: { name: string; path: string }, slots: Slot[]): string {
  const message = wakeMessage(project, slots, log.get(project.path));
  log.set(project.path, approvedNow(slots));
  return message;
}

// ---- waiting agents -----------------------------------------------------
// The agent ends its turn with a request to /wait that hangs until the human presses Notify agent.

const waiters = new Map<string, Set<(text: string) => void>>();
/** Projects where Notify was pressed while no agent was waiting; the next /wait answers at once. */
const notifyPending = new Set<string>();

export const listening = (id: string) => waiters.get(id)?.size ?? 0;

/**
 * Answers a /wait: with the briefing once Notify agent is pressed, or at once when it was pressed while
 * nobody waited. `onChange` runs whenever the number of listening agents changes.
 */
export function waitForNotify(project: Project, slots: Slot[], signal: AbortSignal, onChange: () => void): Promise<string> {
  if (notifyPending.has(project.id) && hasNews(project.path, slots)) {
    notifyPending.delete(project.id);
    return Promise.resolve(deliver(project, slots));
  }
  const set = waiters.get(project.id) ?? new Set();
  waiters.set(project.id, set);
  return new Promise<string>((done) => {
    const wake = (t: string) => {
      set.delete(wake);
      done(t);
      onChange();
    };
    set.add(wake);
    signal.addEventListener("abort", () => {
      set.delete(wake);
      onChange();
    });
    onChange();
  });
}

export const stopMessage = (project: { name: string }) =>
  `Stopped by the human in project ${project.name}. Do not start waiting again; the human will tell you in the chat when there is more to do.
`;

/** Ends every wait on the project with the stop message, and drops a Notify pressed while nobody waited. */
export function stopAgents(project: Project): number {
  notifyPending.delete(project.id);
  const set = waiters.get(project.id);
  const n = set?.size ?? 0;
  for (const wake of [...(set ?? [])]) wake(stopMessage(project));
  return n;
}

/** Wakes every agent waiting on the project. False when none is: the next /wait then answers at once. */
export function notifyAgent(project: Project, slots: Slot[]): boolean {
  const set = waiters.get(project.id);
  if (!set?.size) {
    notifyPending.add(project.id);
    return false;
  }
  const message = deliver(project, slots);
  for (const wake of [...set]) wake(message);
  return true;
}
