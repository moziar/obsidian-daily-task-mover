import { appHasDailyNotesPluginLoaded } from "obsidian-daily-notes-interface";
import { getCurrentDailyDate, getOrCreateDailyNote } from "../dailyNoteUtils";
import type { NoteProviderDefinition } from "./types";

const identity = {};

export const obsidianDailyNotesProvider = {
  id: "daily-notes",
  label: "Daily / Periodic notes",
  getState() {
    // Core Daily Notes is bundled with Obsidian, so this capability is never missing.
    return appHasDailyNotesPluginLoaded() ? "available" : "disabled";
  },
  connect() {
    if (!appHasDailyNotesPluginLoaded()) return null;
    return {
      identity,
      resolve(file) {
        const date = getCurrentDailyDate(file);
        return date ? { date, endDate: date.clone(), getOrCreate: getOrCreateDailyNote } : null;
      },
    };
  },
} satisfies NoteProviderDefinition;
