import type { App, TFile, moment } from "obsidian";
import { noteProviders } from "./noteProviders";
import type { NoteContext, NoteProviderDefinition, NoteProviderSession } from "./noteProviders/types";
import { t } from "./i18n";

/** Select one provider and bridge asynchronous lookups to editor/command checks. */
export class DailyNoteProvider {
  private session: NoteProviderSession | null = null;
  private providerId: string | null = null;
  private cache = new Map<TFile, moment.Moment | null>();
  private pending = new Map<TFile, object>();
  private unsubscribe?: () => void;
  private disposed = false;

  constructor(
    private app: App,
    private selectedProvider: () => string,
    private changed: () => void,
    private providers: readonly NoteProviderDefinition[] = noteProviders
  ) {}

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.invalidate();
  }

  invalidate(file?: TFile): void {
    if (file) {
      this.cache.delete(file);
      this.pending.delete(file);
    } else {
      this.cache.clear();
      this.pending.clear();
    }
  }

  getStatus() {
    const session = this.currentSession();
    const selection = this.selectedProvider();
    const id = this.providerId ?? selection;
    const provider = this.providers.find((provider) => provider.id === id);
    const label = provider?.label ?? id;
    const state = session ? "available" : provider?.getState(this.app) ?? "unavailable";
    const message = session ? t("provider.active", { provider: label })
      : selection === "auto" ? t("provider.noneAvailable")
        : state === "disabled" ? t("provider.selectedDisabled", { provider: label })
          : state === "unsupported" ? t("provider.selectedUnsupported", { provider: label })
            : t("provider.selectedUnavailable", { provider: label });
    return { available: session !== null, label, selection, state, message };
  }

  private currentSession(): NoteProviderSession | null {
    if (this.disposed) return null;
    const selected = this.selectedProvider();
    let session: NoteProviderSession | null = null;
    let id: string | null = null;
    for (const provider of this.providers) {
      if (selected !== "auto" && selected !== provider.id) continue;
      session = provider.connect(this.app);
      if (session) {
        id = provider.id;
        break;
      }
    }
    if (id !== this.providerId || session?.identity !== this.session?.identity) {
      this.unsubscribe?.();
      this.session = session;
      this.providerId = id;
      this.invalidate();
      this.unsubscribe = session?.subscribe?.(() => {
        this.invalidate();
        this.changed();
      });
    }
    return this.session;
  }

  getDate(file: TFile): moment.Moment | null {
    const session = this.currentSession();
    if (!session) return null;
    // Synchronous providers keep command availability immediate.
    if (this.cache.has(file)) return this.cache.get(file)?.clone() ?? null;
    if (this.pending.has(file)) return null;
    const result = session.resolve(file);
    if (!(result instanceof Promise)) return result?.date.clone() ?? null;
    const request = {};
    this.pending.set(file, request);
    void result.then(
      (context) => {
        if (this.currentSession() !== session || this.pending.get(file) !== request) return;
        this.pending.delete(file);
        this.cache.set(file, context?.date ?? null);
        this.changed();
      },
      (error: unknown) => {
        if (this.currentSession() !== session || this.pending.get(file) !== request) return;
        this.pending.delete(file);
        this.cache.set(file, null);
        console.error("Daily Task Mover: note lookup failed", error);
        this.changed();
      }
    );
    return null;
  }

  /** Resolve afresh before moving; the UI cache never selects a destination. */
  async resolve(file: TFile): Promise<NoteContext | null> {
    const session = this.currentSession();
    if (!session) {
      const status = this.getStatus();
      throw new Error(status.message);
    }
    const context = await session.resolve(file);
    if (!context || this.currentSession() !== session) return null;
    return {
      ...context,
      getOrCreate: async (date) => {
        if (this.currentSession() !== session) {
          throw new Error(t("notice.providerUnavailable"));
        }
        return context.getOrCreate(date);
      },
    };
  }
}
