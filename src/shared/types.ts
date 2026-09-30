export type Status = "waiting_generation" | "waiting_review" | "waiting_agent" | "approved" | "empty";

export const STATUSES: Status[] = ["waiting_generation", "waiting_review", "waiting_agent", "approved", "empty"];

export type MediaKind = "image" | "video";

export interface Candidate {
  file: string;
  kind: MediaKind;
  url: string;
  path: string;
  /** Contact sheets extracted from a video (2x2 frames per second). */
  frames: string[];
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
}

export interface VersionMeta {
  tool: string | null;
  type: string | null;
  model: string | null;
  mode: string | null;
  aspect_ratio: string | null;
  outputs: string | null;
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
  candidates: Candidate[];
  selected: string | null;
  feedback: string | null;
  errors: string[];
  warnings: string[];
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
  finalPath: string | null;
  createdAt: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  external: boolean;
  counts: Record<Status, number>;
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
  outputs?: number[];
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
  outputs?: string;
  duration?: string;
  resolution?: string;
  changes?: string;
  prompt: string;
  /** Carry `inputs` and `params` over from this earlier version of the same slot. */
  carryFrom?: number;
}
