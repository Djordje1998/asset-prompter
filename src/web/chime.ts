import type { ProjectSummary, Status } from "../shared/types";

/**
 * When the page chimes. The chime says the agent has handed something new to the person: a prompt to generate
 * (a new slot or a new version) or a result to confirm (a new review). Never what the person did: their own
 * changes in the app, and what those cause, like a slot that was waiting for one just approved, stay silent.
 * It works per slot, from the stamps in each state, so one slot coming in while another goes out still chimes,
 * and a burst of changes, a slot flickering while its files are written, or two states arriving in the wrong
 * order chime once.
 */

/** The statuses where the person has something to do. */
const HUMAN: Status[] = ["waiting_generation", "waiting_review"];
/** How long after the person's own change ends what follows from it is taken as theirs. */
export const OWN_MS = 2000;
/** The shortest time between two chimes: several changes close together are one chime. */
export const QUIET_MS = 2500;
/** A slot chimed for is not chimed for again with the same stamp this soon, if it flickers away and back. */
export const REPEAT_MS = 60_000;

const statusOf = (stamp: string) => stamp.slice(0, stamp.indexOf(":")) as Status;

interface OwnWrite {
  /** Null for a change that is not about one project, such as an undo by token. */
  project: string | null;
  /** Null for a change to the whole project, such as restoring from its _trash. */
  slots: string[] | null;
  end: number | null;
}

/** What a request from the app changes: its project and slots, as far as its URL and body say. */
export function writeScope(url: string, body: unknown): { project: string | null; slots: string[] | null } {
  const m = /^\/api\/projects\/([^/]+)(?:\/slots(?:\/([^/]+))?)?/.exec(url);
  if (!m) return { project: null, slots: null };
  const slots: string[] = [];
  // "/slots/final" is the route that adds a finished asset; its slot is named in the form.
  if (m[2] && m[2] !== "final") slots.push(decodeURIComponent(m[2]));
  // A slot made, cloned or renamed: the new name is in the body.
  const named = body instanceof FormData ? body.get("name") : (body as { name?: unknown } | null | undefined)?.name;
  if (typeof named === "string" && named.trim()) slots.push(named.trim());
  // A project-level change with no slot named (an undo, a restore from _trash) covers the whole project.
  return { project: decodeURIComponent(m[1]!), slots: m[2] === undefined && slots.length === 0 ? null : slots };
}

export class Chime {
  private stamps: Map<string, Record<string, string>> | null = null;
  private own: OwnWrite[] = [];
  private announced = new Map<string, number>();
  private last = -Infinity;

  /** The person starts a change in the app; call what comes back once it is done, failed or not. */
  mine(url: string, body: unknown): (now?: number) => void {
    const write: OwnWrite = { ...writeScope(url, body), end: null };
    this.own.push(write);
    return (now = Date.now()) => {
      write.end = now;
    };
  }

  /** Takes the latest state; true when it is time to chime. The first state is only taken in. */
  update(projects: ProjectSummary[], now = Date.now()): boolean {
    const previous = this.stamps;
    this.stamps = new Map(projects.map((p) => [p.id, p.stamps]));
    this.own = this.own.filter((w) => w.end === null || now - w.end < OWN_MS);
    for (const [key, at] of this.announced) if (now - at >= REPEAT_MS) this.announced.delete(key);
    if (!previous) return false;

    let news = false;
    for (const project of projects) {
      const before = previous.get(project.id);
      // A project that just appeared is taken in as it is: its slots were not handed over while watched.
      if (!before) continue;
      for (const [slot, stamp] of Object.entries(project.stamps)) {
        if (!HUMAN.includes(statusOf(stamp))) continue;
        const was = before[slot];
        if (was === stamp) continue;
        // Waiting for an input until now: free because the person approved that input.
        if (was !== undefined && statusOf(was) === "waiting_input") continue;
        if (this.isOwn(project.id, slot)) continue;
        const key = `${project.id}/${slot}|${stamp}`;
        if (this.announced.has(key)) continue;
        this.announced.set(key, now);
        news = true;
      }
    }
    if (!news || now - this.last < QUIET_MS) return false;
    this.last = now;
    return true;
  }

  private isOwn(project: string, slot: string): boolean {
    return this.own.some((w) => (w.project === null || w.project === project) && (w.slots === null || w.slots.includes(slot)));
  }
}

/** The page's one chime. */
export const chime = new Chime();
