import { createContext, useContext } from "react";
import type { Preset, Slot, Version } from "../shared/types";

export interface LightboxItem {
  url: string;
  kind: "image" | "video";
  /** What it is: the slot name, or for an input file its path. */
  title: string;
  version?: number;
  /** Short labels such as Approved, Selected or Start frame. */
  tags?: string[];
  /** The file name, shown with its size and type. */
  file?: string;
  /** One of several results of a version: the viewer can select it. */
  pickable?: boolean;
}

/** What the toast says after a change: the words, and the exact text it was about, such as what was copied. */
export interface Notice {
  message: string;
  /** Shown under the message, in full or cut after two lines: a copied path, prompt or file name. */
  detail?: string;
}

/** What every card needs from the app: the open project, and the ways to change it or open a dialog. */
export interface Ctx {
  /** Only the id: the project's summary changes with every slot, and the cards would all render again with it. */
  projectId: string;
  /** The installed tool presets: what each generator offers, and its logo. */
  presets: Preset[];
  /** Runs a change, reports the outcome in the toast and reloads the feed. */
  act: (fn: () => Promise<unknown>, done?: string | Notice) => Promise<void>;
  toast: (message: string, isError?: boolean) => void;
  /** Runs a removal that answers with an undo token, and offers Undo (and Ctrl+Z) in the toast for a few seconds. */
  undoable: (fn: () => Promise<{ undo: string }>, done: string, undone: string) => Promise<void>;
  openLightbox: (items: LightboxItem[], index: number) => void;
  openPrompt: (slot: Slot, version: Version) => void;
  openNewVersion: (slot: Slot) => void;
  /** Asks for a name and copies the whole slot under it. */
  openClone: (slot: Slot) => void;
  /** Shows the files the agent derived from the slot's final asset. */
  openVariants: (slot: Slot) => void;
  /** The version a paste lands in: the one under the pointer. */
  setPasteTarget: (target: { slot: string; n: number } | null) => void;
  upload: (slot: string, n: number, files: File[]) => void;
}

/** Null until a project is open; cards only render once there is one. */
export const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp is used outside an open project");
  return ctx;
}
