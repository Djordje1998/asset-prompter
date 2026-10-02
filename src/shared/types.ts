export type Status = "waiting_input" | "waiting_generation" | "waiting_review" | "waiting_agent" | "approved" | "empty";

export const STATUSES: Status[] = ["waiting_input", "waiting_generation", "waiting_review", "waiting_agent", "approved", "empty"];

export type MediaKind = "image" | "video";

export interface MediaInfo {
  width: number | null;
  height: number | null;
  /** Seconds; null for still images. */
  duration: number | null;
  audio: boolean;
}

export interface Result {
  file: string;
  kind: MediaKind;
  url: string;
  path: string;
  /** Contact sheets extracted from a video (2x2 frames per second). */
  frames: string[];
  /** Null when ffprobe is not installed. */
  info: MediaInfo | null;
  /** File size in bytes. */
  bytes: number;
}

export type Verdict = "approve" | "revise";

/** The agent's review of a version, from vN.review.md. */
export interface Review {
  verdict: Verdict | null;
  /** The result the agent recommends when there are several. */
  pick: string | null;
  text: string;
  errors: string[];
  at: number;
}

export interface ResolvedInput {
  role: string | null;
  /** What the agent wrote: a slot name or a path. */
  source: string;
  fromSlot: boolean;
  kind: MediaKind | null;
  url: string | null;
  path: string | null;
  /** Why there is nothing to show yet. */
  missing: string | null;
  /** For a slot input: the version the file comes from, and whether that version is approved. */
  sourceVersion: number | null;
  sourceApproved: boolean;
}

export interface VersionMeta {
  tool: string | null;
  type: string | null;
  model: string | null;
  mode: string | null;
  aspect_ratio: string | null;
  duration: string | null;
  resolution: string | null;
  changes: string | null;
  params: Record<string, string>;
}

export interface Version {
  n: number;
  raw: string;
  prompt: string;
  meta: VersionMeta;
  inputs: ResolvedInput[];
  results: Result[];
  /** The chosen result: the human's pick, else the agent's, else the only one. */
  selected: string | null;
  selectedBy: "human" | "agent" | null;
  changeRequest: string | null;
  changeRequestAt: number;
  review: Review | null;
  errors: string[];
  warnings: string[];
  /** Results that do not match the version file: wrong length, aspect ratio or type. */
  resultWarnings: string[];
  /** The same differences worded for the human in the app. */
  resultNotes: string[];
  path: string;
  dir: string;
}

export interface Slot {
  name: string;
  description: string | null;
  path: string;
  status: Status;
  /** Ascending by version number. */
  versions: Version[];
  approved: number | null;
  /** Slots whose approval this one waits for before it can be generated. */
  waitingFor: string[];
  finalPath: string | null;
  /** Files the agent derived from the final asset (crops, sizes, formats, edits), from <slot>/exports/. */
  variants: Result[];
  /** Problems with the slot folder itself, such as a name agents were told not to use. */
  warnings: string[];
  createdAt: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  external: boolean;
  counts: Record<Status, number>;
  /** Agents waiting on this project's /wait for Notify agent. */
  listening: number;
}

export interface PresetModel {
  name: string;
  modes?: string[];
  durations?: string[];
  resolutions?: string[];
  max_inputs?: number;
}

export interface PresetSection {
  models: PresetModel[];
  aspect_ratios?: string[];
}

export interface Preset {
  tool: string;
  name: string;
  prompt_limit: number | null;
  image?: PresetSection;
  video?: PresetSection;
  notes: string;
}

export interface AppState {
  projects: ProjectSummary[];
  presets: Preset[];
  ffmpeg: boolean;
  projectsDir: string;
}

export interface NewVersionInput {
  tool?: string;
  type: string;
  model: string;
  mode?: string;
  aspect_ratio?: string;
  duration?: string;
  resolution?: string;
  changes?: string;
  prompt: string;
  /** Carry `inputs` and `params` over from this earlier version of the same slot. */
  carryFrom?: number;
}
