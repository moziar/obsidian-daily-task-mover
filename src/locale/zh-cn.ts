const zhCN = {
  "provider.active": "当前使用 {provider}。",
  "provider.disabledOption": "{provider}（已禁用）",
  "provider.unsupportedOption": "{provider}（版本不受支持）",
  "provider.selectedDisabled": "{provider} 已禁用，已保留您的选择。请启用插件及其笔记功能，或在 Daily Task Mover 设置中选择“自动”。",
  "provider.selectedUnsupported": "{provider} 的版本不受支持，已保留您的选择。请安装兼容版本，或在 Daily Task Mover 设置中选择“自动”。",
  "provider.unavailableOption": "{provider}（不可用）",
  "provider.noneAvailable": "没有可用的笔记提供插件。请启用 Journals 3.x、Daily Notes，或启用 Periodic Notes 的每日笔记功能。",
  "provider.selectedUnavailable": "{provider} 未安装或已不受 Daily Task Mover 支持，已保留您的选择。请安装受支持的插件，或在设置中选择“自动”。",
  "provider.auto": "自动",
  "settings.noteProvider": "笔记提供插件",
  "settings.noteProviderDesc": "自动模式优先使用 Journals（3.0 或更高版本），否则使用 Daily Notes。也可手动指定插件；始终只使用一个插件。",
  "command.moveToPreviousDay": "移动任务到上一周期",
  "command.moveToNextDay": "移动任务到下一周期",
  "menu.moveToPreviousDay": "移动到上一周期",
  "menu.moveToNextDay": "移动到下一周期",
  "notice.notDailyNote": "当前笔记不是每日笔记或 Journals 条目",
  "notice.subtaskNotMovable": "子任务不可单独移动，请移动顶层任务",
  "notice.movedTo": "已移动到 {name}",
  "notice.failedCreateDailyNote": "获取或创建目标笔记失败",
  "notice.providerUnavailable": "笔记提供插件已更改或不可用，请重试移动任务",
  "error.multipleHeadings":
    "目标笔记中存在多个『{heading}』标题，请手动处理",
  "error.duplicateTask": "目标笔记已包含该任务",
  "title.moveTask": "移动任务",
  "settings.language": "语言",
  "settings.languageDesc":
    "手动选择界面语言。选择“自动”时跟随 Obsidian 界面语言。",
  "language.auto": "自动",
  "language.en": "英文",
  "language.zh-cn": "简体中文",
  "settings.leftClickAction": "左键点击动作",
  "settings.leftClickActionDesc":
    "左键点击 task 行尾图标时执行的动作。",
  "settings.rightClickAction": "右键点击动作",
  "settings.rightClickActionDesc":
    "右键点击 task 行尾图标时执行的动作。",
  "clickAction.popup": "弹出菜单",
  "clickAction.prev": "移动到上一周期",
  "clickAction.next": "移动到下一周期",
  "clickAction.none": "无动作",
  "settings.enablePreviousDay": "启用上一周期",
  "settings.enablePreviousDayDesc":
    "在弹出菜单中显示“移动到上一周期”选项。仅当左键或右键点击动作为“弹出菜单”时可修改。",
  "settings.enableNextDay": "启用下一周期",
  "settings.enableNextDayDesc":
    "在弹出菜单中显示“移动到下一周期”选项。仅当左键或右键点击动作为“弹出菜单”时可修改。",
};

export default zhCN;
