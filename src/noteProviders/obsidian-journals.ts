import { App, moment } from "obsidian";
import { getJournalsApi } from "obsidian-journals-api";
import { isNoteCreationCancelled } from "./types";
import { t } from "../i18n";
import type { NoteProviderDefinition, NoteProviderState } from "./types";

function getState(app: App): NoteProviderState {
  // The API locator cannot distinguish an uninstalled plugin from a disabled one.
  // Keep access to Obsidian's internal plugin inventory confined to this adapter.
  const manager = (app as App & {
    plugins?: {
      manifests?: Record<string, unknown>;
      plugins?: Record<string, unknown>;
    };
  }).plugins;
  const loaded = manager?.plugins?.journals;
  if (!loaded && !manager?.manifests?.journals) return "unavailable";
  if (!loaded) return "disabled";
  const api = getJournalsApi(app);
  return api?.apiVersion === 1 ? "available" : "unsupported";
}

export const obsidianJournalsProvider = {
  id: "journals",
  label: "Journals",
  getState,
  connect(app) {
    if (getState(app) !== "available") return null;
    const api = getJournalsApi(app);
    if (!api || api.apiVersion !== 1) return null;
    return {
      identity: api,
      subscribe(changed) {
        const off = [
          api.on("journalCreated", changed), api.on("journalRenamed", changed),
          api.on("journalDeleted", changed), api.on("noteAdded", changed),
          api.on("noteRemoved", changed),
        ];
        return () => off.forEach((unsubscribe) => unsubscribe());
      },
      async resolve(file) {
        const note = await api.journalOf(file);
        if (!note) return null;
        const date = moment.utc(note.date, "YYYY-MM-DD", true).local(true);
        const endDate = moment.utc(note.endDate, "YYYY-MM-DD", true).local(true);
        if (!date.isValid() || !endDate.isValid() || endDate.isBefore(date, "day")) return null;
        return {
          date, endDate,
          async getOrCreate(targetDate) {
            try {
              const result = await api.ensureNote(note.journal, targetDate.format("YYYY-MM-DD"));
              return result.note.file;
            } catch (error) {
              if (isNoteCreationCancelled(error)) throw error;
              console.error("Daily Task Mover: journal creation failed", error);
              throw new Error(t("notice.failedCreateDailyNote"));
            }
          },
        };
      },
    };
  },
} satisfies NoteProviderDefinition;
