/** 左键/右键点击行内图标时执行的动作。 */
export type ClickAction = "popup" | "prev" | "next" | "none";

/** 界面语言选择：auto 跟随 Obsidian 界面语言，en/zh-cn 手动指定。 */
export type Language = "auto" | "en" | "zh-cn";
// Provider IDs come from the registry, so adding an adapter needs no settings migration.
export type NoteProvider = string;

export interface DailyTaskMoverSettings {
  noteProvider: NoteProvider;
  enablePreviousDay: boolean;
  enableNextDay: boolean;
  /** 左键点击行内图标动作。 */
  leftClickAction: ClickAction;
  /** 右键点击行内图标动作。 */
  rightClickAction: ClickAction;
  /** 手动选择的界面语言。 */
  language: Language;
}

export const DEFAULT_SETTINGS: DailyTaskMoverSettings = {
  noteProvider: "auto",
  enablePreviousDay: true,
  enableNextDay: true,
  leftClickAction: "popup",
  rightClickAction: "none",
  language: "auto",
};
