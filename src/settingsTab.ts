import { App, PluginSettingTab, Setting } from "obsidian";
import type DailyTaskMoverPlugin from "../main";
import type { ClickAction, Language } from "./settings";
import { noteProviders } from "./noteProviders";
import { t, setLanguage } from "./i18n";

export class DailyTaskMoverSettingTab extends PluginSettingTab {
  plugin: DailyTaskMoverPlugin;
  icon: string = 'arrow-left-right';
  constructor(app: App, plugin: DailyTaskMoverPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /**
   * 设置窗口关闭时刷新编辑器/预览图标：
   * 左右键动作全为 none 时图标隐藏，恢复任一动作时图标重新显示。
   */
  hide(): void {
    this.plugin.refreshTaskIcons();
  }

  private renderNoteProvider(setting: Setting): void {
    setting.addDropdown((dropdown) => {
      dropdown.addOption("auto", t("provider.auto"));
      for (const provider of noteProviders) {
        dropdown.addOption(provider.id, provider.label);
      }
      const refreshAvailability = () => {
        for (const provider of noteProviders) {
          const option = Array.from(dropdown.selectEl.options).find((option) => option.value === provider.id);
          if (!option) continue;
          const state = provider.getState(this.app);
          option.disabled = state !== "available";
          option.textContent = state === "available" ? provider.label
            : t(state === "disabled" ? "provider.disabledOption"
              : state === "unsupported" ? "provider.unsupportedOption"
                : "provider.unavailableOption", { provider: provider.label });
        }
        const status = this.plugin.getNoteProviderStatus();
        setting.setDesc(`${t("settings.noteProviderDesc")} ${status.message}`);
      };
      refreshAvailability();
      dropdown.selectEl.addEventListener("focus", refreshAvailability);
      dropdown
        .setValue(this.plugin.settings.noteProvider)
        .onChange(async (value) => {
          this.plugin.settings.noteProvider = value;
          await this.plugin.saveSettings();
          this.plugin.refreshTaskIcons();
          refreshAvailability();
        });
    });
  }

  // ── 1.13.0+: 声明式 API ──────────────────────────────────────────
  // 框架在 1.13.0+ 优先调用此方法；返回非空数组时跳过 display()。
  // control 类型自动绑定 plugin.settings[key]，自动保存 + refreshDomState。
  getSettingDefinitions() {
    const clickActionOptions: Record<ClickAction, string> = {
      popup: t("clickAction.popup"),
      prev: t("clickAction.prev"),
      next: t("clickAction.next"),
      none: t("clickAction.none"),
    };
    const languageOptions: Record<Language, string> = {
      auto: t("language.auto"),
      en: t("language.en"),
      "zh-cn": t("language.zh-cn"),
    };
    // 仅当左键或右键动作为"弹出菜单"时，方向开关才有意义（作用于 popup 菜单项）。
    const isPopupActive = () =>
      this.plugin.settings.leftClickAction === "popup" ||
      this.plugin.settings.rightClickAction === "popup";

    return [
      {
        name: t("settings.noteProvider"),
        desc: t("settings.noteProviderDesc"),
        render: (setting: Setting) => this.renderNoteProvider(setting),
      },
      {
        name: t("settings.language"),
        desc: t("settings.languageDesc"),
        render: (setting: Setting) => {
          setting.addDropdown((dd) => {
            for (const key of Object.keys(languageOptions) as Language[]) {
              dd.addOption(key, languageOptions[key]);
            }
            dd.setValue(this.plugin.settings.language).onChange(
              async (val) => {
                this.plugin.settings.language = val as Language;
                await this.plugin.saveSettings();
                setLanguage(this.plugin.settings.language);
                // update() is 1.13.0+; safe here because getSettingDefinitions() only runs on 1.13.0+
                this["update"]();
              }
            );
          });
        },
      },
      {
        name: t("settings.leftClickAction"),
        desc: t("settings.leftClickActionDesc"),
        control: {
          type: "dropdown" as const,
          key: "leftClickAction",
          options: clickActionOptions,
        },
      },
      {
        name: t("settings.rightClickAction"),
        desc: t("settings.rightClickActionDesc"),
        control: {
          type: "dropdown" as const,
          key: "rightClickAction",
          options: clickActionOptions,
        },
      },
      {
        name: t("settings.enablePreviousDay"),
        desc: t("settings.enablePreviousDayDesc"),
        control: {
          type: "toggle" as const,
          key: "enablePreviousDay",
          disabled: () => !isPopupActive(),
        },
      },
      {
        name: t("settings.enableNextDay"),
        desc: t("settings.enableNextDayDesc"),
        control: {
          type: "toggle" as const,
          key: "enableNextDay",
          disabled: () => !isPopupActive(),
        },
      },
    ];
  }

  // ── < 1.13.0: 命令式 fallback ─────────────────────────────────────
  // 框架在旧版本调用此方法；新版本在 getSettingDefinitions() 返回非空时跳过。
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.renderNoteProvider(new Setting(containerEl)
      .setName(t("settings.noteProvider"))
      .setDesc(t("settings.noteProviderDesc")));

    // 每次渲染时即时取当前语言，避免切换语言后标签停留在旧语言
    const clickActionLabels: Record<ClickAction, string> = {
      popup: t("clickAction.popup"),
      prev: t("clickAction.prev"),
      next: t("clickAction.next"),
      none: t("clickAction.none"),
    };
    const languageLabels: Record<Language, string> = {
      auto: t("language.auto"),
      en: t("language.en"),
      "zh-cn": t("language.zh-cn"),
    };

    new Setting(containerEl)
      .setName(t("settings.language"))
      .setDesc(t("settings.languageDesc"))
      .addDropdown((dd) => {
        for (const key of Object.keys(languageLabels) as Language[]) {
          dd.addOption(key, languageLabels[key]);
        }
        dd.setValue(this.plugin.settings.language).onChange(async (val) => {
          this.plugin.settings.language = val as Language;
          await this.plugin.saveSettings();
          setLanguage(this.plugin.settings.language);
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(t("settings.leftClickAction"))
      .setDesc(t("settings.leftClickActionDesc"))
      .addDropdown((dd) => {
        for (const key of Object.keys(clickActionLabels) as ClickAction[]) {
          dd.addOption(key, clickActionLabels[key]);
        }
        dd.setValue(this.plugin.settings.leftClickAction).onChange(
          async (val) => {
            this.plugin.settings.leftClickAction = val as ClickAction;
            await this.plugin.saveSettings();
            this.display();
          }
        );
      });

    new Setting(containerEl)
      .setName(t("settings.rightClickAction"))
      .setDesc(t("settings.rightClickActionDesc"))
      .addDropdown((dd) => {
        for (const key of Object.keys(clickActionLabels) as ClickAction[]) {
          dd.addOption(key, clickActionLabels[key]);
        }
        dd.setValue(this.plugin.settings.rightClickAction).onChange(
          async (val) => {
            this.plugin.settings.rightClickAction = val as ClickAction;
            await this.plugin.saveSettings();
            this.display();
          }
        );
      });

    // 仅当左键或右键动作为"弹出菜单"时，方向开关才有意义（作用于 popup 菜单项）。
    const popupActive =
      this.plugin.settings.leftClickAction === "popup" ||
      this.plugin.settings.rightClickAction === "popup";

    new Setting(containerEl)
      .setName(t("settings.enablePreviousDay"))
      .setDesc(t("settings.enablePreviousDayDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.enablePreviousDay)
          .setDisabled(!popupActive)
          .onChange(async (val) => {
            this.plugin.settings.enablePreviousDay = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.enableNextDay"))
      .setDesc(t("settings.enableNextDayDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.enableNextDay)
          .setDisabled(!popupActive)
          .onChange(async (val) => {
            this.plugin.settings.enableNextDay = val;
            await this.plugin.saveSettings();
          });
      });
  }
}
