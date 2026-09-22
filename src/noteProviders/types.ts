import type { App, TFile, moment } from "obsidian";

export interface NoteContext {
  date: moment.Moment;
  endDate: moment.Moment;
  getOrCreate(date: moment.Moment): Promise<TFile>;
}

export interface NoteProviderSession {
  /** Changes when the underlying plugin is reloaded. */
  identity: object;
  resolve(file: TFile): NoteContext | null | Promise<NoteContext | null>;
  subscribe?(changed: () => void): () => void;
}

export type NoteProviderState = "available" | "unavailable" | "disabled" | "unsupported";

export interface NoteProviderDefinition {
  id: string;
  label: string;
  getState(app: App): NoteProviderState;
  connect(app: App): NoteProviderSession | null;
}

export function isNoteCreationCancelled(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "aborted";
}
