import type { App, CachedMetadata, TAbstractFile, TFile } from "obsidian";
import { t } from "./i18n";

export interface IndexedNote {
  file: TFile;
  content: string;
  cache: CachedMetadata;
}

/** Observe creation and template writes before accepting a note's heading positions. */
export async function readIndexedNote(
  app: App,
  getFile: () => Promise<TFile>,
  timeoutMs = 10000
): Promise<IndexedNote> {
  const modified = new Set<TAbstractFile>();
  const deleted = new Set<TAbstractFile>();
  const indexed = new Map<TFile, IndexedNote>();
  let wake = () => {};
  let timer: number | undefined;
  const changed = app.metadataCache.on("changed", (file, content, cache) => {
    indexed.set(file, { file, content, cache });
    wake();
  });
  const created = app.vault.on("create", (file) => modified.add(file));
  const updated = app.vault.on("modify", (file) => modified.add(file));
  const removed = app.vault.on("delete", (file) => {
    deleted.add(file);
    wake();
  });

  try {
    const file = await getFile();
    const content = await app.vault.read(file);
    return await new Promise<IndexedNote>((resolve, reject) => {
      wake = () => {
        if (deleted.has(file)) {
          reject(new Error(t("error.noteNotIndexed")));
          return;
        }
        const snapshot = indexed.get(file);
        if (snapshot) {
          // The event's text and heading positions describe the same file revision.
          if (snapshot.content === content) resolve(snapshot);
          return;
        }
        // An unchanged existing note needs no new indexing event.
        if (!modified.has(file)) {
          const cache = app.metadataCache.getFileCache(file);
          if (cache) resolve({ file, content, cache });
        }
      };
      timer = window.setTimeout(() => reject(new Error(t("error.noteNotIndexed"))), timeoutMs);
      wake();
    });
  } finally {
    window.clearTimeout(timer);
    app.metadataCache.offref(changed);
    app.vault.offref(created);
    app.vault.offref(updated);
    app.vault.offref(removed);
  }
}
