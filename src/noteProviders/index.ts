import { obsidianDailyNotesProvider } from "./obsidian-daily-notes";
import { obsidianJournalsProvider } from "./obsidian-journals";
import type { NoteProviderDefinition } from "./types";

/** Automatic selection uses the first available provider, for the whole vault.
 * Add integrations here in preference order; the settings list uses this registry too.
 */
export const noteProviders: readonly NoteProviderDefinition[] = [
  obsidianJournalsProvider,
  obsidianDailyNotesProvider,
];
