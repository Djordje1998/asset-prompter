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

export function wakeMessage(project: { name: string; path: string }, slots: Slot[]): string {
  return [
    `Notify agent in project ${project.name} (${project.path}). Paths below are relative to it.`,
    "",
    ...agentTurn(slots),
    "",
    "Act on these slots only. Report one short line per slot in the chat, then start waiting again with the same command.",
    "",
  ].join("\n");
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
  if (notifyPending.has(project.id) && agentTurn(slots).length) {
    notifyPending.delete(project.id);
    return Promise.resolve(wakeMessage(project, slots));
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

/** Wakes every agent waiting on the project. False when none is: the next /wait then answers at once. */
export function notifyAgent(project: Project, slots: Slot[]): boolean {
  const set = waiters.get(project.id);
  if (!set?.size) {
    notifyPending.add(project.id);
    return false;
  }
  const message = wakeMessage(project, slots);
  for (const wake of [...set]) wake(message);
  return true;
}
