const en = {
  "provider.active": "Currently using {provider}.",
  "provider.disabledOption": "{provider} (disabled)",
  "provider.unsupportedOption": "{provider} (unsupported version)",
  "provider.selectedDisabled": "{provider} is disabled. Your selection is preserved. Enable the plugin and its note feature, or choose Automatic in Daily Task Mover settings.",
  "provider.selectedUnsupported": "{provider} has an unsupported version. Your selection is preserved. Install a compatible version, or choose Automatic in Daily Task Mover settings.",
  "provider.unavailableOption": "{provider} (unavailable)",
  "provider.noneAvailable": "No note provider is available. Enable Journals 3.x, Daily Notes, or Periodic Notes with daily notes enabled.",
  "provider.selectedUnavailable": "{provider} is not installed or is no longer supported by Daily Task Mover. Your selection is preserved. Install a supported provider, or choose Automatic in Daily Task Mover settings.",
  "provider.auto": "Automatic",
  "settings.noteProvider": "Note provider",
  "settings.noteProviderDesc": "Automatic uses Journals (3.0 or later) when available, otherwise Daily Notes. Choose a provider to override this; only one provider is used.",
  "command.moveToPreviousDay": "Move task to previous period",
  "command.moveToNextDay": "Move task to next period",
  "menu.moveToPreviousDay": "Move to previous period",
  "menu.moveToNextDay": "Move to next period",
  "notice.notDailyNote": "Current note is not a daily note or journal entry",
  "notice.subtaskNotMovable":
    "Subtasks cannot be moved individually; move the top-level task",
  "notice.movedTo": "Moved to {name}",
  "notice.failedCreateDailyNote": "Failed to get or create the destination note",
  "notice.providerUnavailable": "The note provider changed or is no longer available; try the move again",
  "error.multipleHeadings":
    "Multiple '{heading}' headings found in the target note; please handle manually",
  "error.duplicateTask": "The target note already contains this task",
  "title.moveTask": "Move task",
  "settings.language": "Language",
  "settings.languageDesc":
    "Manually select the interface language. When set to 'Auto', follows the Obsidian interface language.",
  "language.auto": "Auto",
  "language.en": "English",
  "language.zh-cn": "Chinese (Simplified)",
  "settings.leftClickAction": "Left click action",
  "settings.leftClickActionDesc":
    "Action performed when left-clicking the task icon at the end of a line.",
  "settings.rightClickAction": "Right click action",
  "settings.rightClickActionDesc":
    "Action performed when right-clicking the task icon at the end of a line.",
  "clickAction.popup": "Popup menu",
  "clickAction.prev": "Move to previous period",
  "clickAction.next": "Move to next period",
  "clickAction.none": "No action",
  "settings.enablePreviousDay": "Enable previous period",
  "settings.enablePreviousDayDesc":
    "Show the 'Move to previous period' option in the popup menu. Editable only when the left or right click action is 'Popup menu'.",
  "settings.enableNextDay": "Enable next period",
  "settings.enableNextDayDesc":
    "Show the 'Move to next period' option in the popup menu. Editable only when the left or right click action is 'Popup menu'.",
};

export default en;
