import { createContext, useContext } from "react";
import type { ProjectSummary, Slot, Version } from "../shared/types";

export interface LightboxItem {
  url: string;
  kind: "image" | "video";
  caption: string;
}

/** What every card needs from the app: the open project, and the ways to change it or open a dialog. */
export interface Ctx {
  project: ProjectSummary;
  /** Runs a change, reports the outcome in the toast and reloads the feed. */
  act: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
  toast: (message: string, isError?: boolean) => void;
  openLightbox: (items: LightboxItem[], index: number) => void;
  openPrompt: (slot: Slot, version: Version) => void;
  openNewVersion: (slot: Slot) => void;
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
