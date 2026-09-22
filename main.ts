import {
  MarkdownView,
  MarkdownPostProcessorContext,
  Menu,
  Notice,
  Platform,
  Plugin,
  TFile,
  debounce,
  setIcon,
} from "obsidian";
import type { Editor } from "obsidian";
import type { EditorView } from "@codemirror/view";
import {
  DailyTaskMoverSettings,
  DEFAULT_SETTINGS,
  ClickAction,
} from "./src/settings";
import { DailyTaskMoverSettingTab } from "./src/settingsTab";
import {
  deriveSourceHeading,
  getTaskAtLine,
  getTaskBlockRange,
} from "./src/taskCache";
import { DailyNoteProvider } from "./src/dailyNoteProvider";
import { isNoteCreationCancelled } from "./src/noteProviders/types";
import { moveTaskToNote } from "./src/taskMover";
import { buildTaskIconField, refreshTaskIconsEffect } from "./src/taskLineIcon";
import { t, setLanguage } from "./src/i18n";

export default class DailyTaskMoverPlugin extends Plugin {
  declare settings: DailyTaskMoverSettings;
  private dailyNotes!: DailyNoteProvider;
  private warnedUnavailableProvider: string | null = null;
  private refreshDailyNotes = debounce(() => this.refreshTaskIcons(), 50, true);

  /**
   * 防抖触发预览全量重渲染（trailing）。
   * 分屏场景下 metadataCache 'changed' 会连续触发，避免每次都全量重渲染预览。
   */
  private rerenderPreview = debounce((view: MarkdownView) => {
    if (view.getMode() === "preview" && view.previewMode) {
      view.previewMode.rerender(true);
    }
  }, 300, true);

  async onload(): Promise<void> {
    await this.loadSettings();
    setLanguage(this.settings.language);
    this.dailyNotes = new DailyNoteProvider(
      this.app,
      () => this.settings.noteProvider,
      () => this.refreshDailyNotes()
    );
    this.register(() => {
      this.dailyNotes.dispose();
      this.refreshDailyNotes.cancel();
    });
    this.app.workspace.onLayoutReady(() => {
      const status = this.getNoteProviderStatus();
      if (!status.available && status.selection !== "auto") {
        this.warnedUnavailableProvider = status.selection;
        new Notice(status.message);
      }
      this.refreshDailyNotes();
    });
    this.registerEvent(this.app.workspace.on("layout-change", () => this.refreshDailyNotes()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshDailyNotes()));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      this.dailyNotes.invalidate(file);
      this.refreshDailyNotes();
    }));
    this.registerEvent(this.app.vault.on("rename", (file) => {
      if (file instanceof TFile) this.dailyNotes.invalidate(file);
      this.refreshDailyNotes();
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file instanceof TFile) this.dailyNotes.invalidate(file);
      this.refreshDailyNotes();
    }));

    this.addSettingTab(new DailyTaskMoverSettingTab(this.app, this));

    this.addCommand({
      id: "move-to-previous-day",
      name: t("command.moveToPreviousDay"),
      checkCallback: (checking: boolean) => {
        if (!this.settings.enablePreviousDay) return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return;
        const date = this.dailyNotes.getDate(view.file);
        if (!date) return;
        const cache = this.app.metadataCache.getFileCache(view.file);
        if (!cache) return;
        const line = view.editor.getCursor().line;
        const taskItem = getTaskAtLine(cache, line);
        if (!taskItem) return;
        if (checking) return true;
        void this.doMove("prev", view.file, line);
      },
    });

    this.addCommand({
      id: "move-to-next-day",
      name: t("command.moveToNextDay"),
      checkCallback: (checking: boolean) => {
        if (!this.settings.enableNextDay) return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return;
        const date = this.dailyNotes.getDate(view.file);
        if (!date) return;
        const cache = this.app.metadataCache.getFileCache(view.file);
        if (!cache) return;
        const line = view.editor.getCursor().line;
        const taskItem = getTaskAtLine(cache, line);
        if (!taskItem) return;
        if (checking) return true;
        void this.doMove("next", view.file, line);
      },
    });

    // 桌面端：编辑模式 + 阅读模式行内 hover 图标
    // 移动端无 hover，不注册图标（命令仍可通过命令面板触发）
    if (!Platform.isMobile) {
      this.registerEditorExtension(
        buildTaskIconField(
          (line, evt) => this.handleIconClick(line, evt),
          () => this.isDailyNoteActive() && this.hasActiveIconAction()
        )
      );

      this.registerMarkdownPostProcessor((el, ctx) => {
        this.processReadingModeTasks(el, ctx);
      });

      // 阅读模式：缓存更新后重新渲染，确保新添加的 task 能显示图标
      // 场景：编辑模式添加 task → 切换阅读模式 → post processor 先于 cache 更新执行 → 图标缺失
      this.registerEvent(
        this.app.metadataCache.on("changed", (file) => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (
            view &&
            view.getMode() === "preview" &&
            view.file === file &&
            this.dailyNotes.getDate(file) &&
            this.hasActiveIconAction()
          ) {
            this.rerenderPreview(view);
          }
        })
      );
    }
  }

  onunload(): void {
    // 所有事件通过 registerEvent / registerEditorExtension / registerMarkdownPostProcessor 自动清理
    this.rerenderPreview.cancel();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<DailyTaskMoverSettings>
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 当前 active MarkdownView 的文件是否为日记笔记。 */
  private isDailyNoteActive(): boolean {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return !!view?.file && !!this.dailyNotes.getDate(view.file);
  }

  /** 左键或右键至少配置了一个非 none 动作时，才显示行内图标。 */
  private hasActiveIconAction(): boolean {
    return (
      this.settings.leftClickAction !== "none" ||
      this.settings.rightClickAction !== "none"
    );
  }

  /**
   * 设置变更后刷新所有 markdown 视图的图标（由 SettingTab.hide 触发）。
   * 编辑模式：dispatch StateEffect 让 StateField 重算 decorations；
   * 阅读模式：rerender 重跑 post processor（hasActiveIconAction 已变化）。
   */
  refreshTaskIcons(): void {
    const status = this.getNoteProviderStatus();
    if (status.available || status.selection === "auto") {
      this.warnedUnavailableProvider = null;
    } else if (this.app.workspace.layoutReady && this.warnedUnavailableProvider !== status.selection) {
      this.warnedUnavailableProvider = status.selection;
      new Notice(status.message);
    }
    // Warm asynchronous lookups on mobile too, before command availability is checked.
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file) this.dailyNotes.getDate(view.file);
    }
    if (Platform.isMobile) return;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      if (view.getMode() === "preview") {
        view.previewMode?.rerender(true);
      } else {
        // editor.cm 未在官方类型中声明，运行时始终存在（CM6 编辑器）
        const cm = (view.editor as Editor & { cm?: EditorView }).cm;
        cm?.dispatch({ effects: refreshTaskIconsEffect.of(null) });
      }
    }
  }

  getNoteProviderStatus() {
    return this.dailyNotes.getStatus();
  }

  /** 编辑模式图标点击：从 active view 解析文件后分发动作。 */
  private handleIconClick(line: number, evt: MouseEvent): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return;
    this.dispatchIconClick(view.file, line, evt);
  }

  /**
   * 图标点击分发：根据事件类型（左键/右键）取对应动作执行。
   * file 由调用方传入（阅读模式用闭包中的 ctx 文件，避免分屏时 active view 错位）。
   */
  private dispatchIconClick(file: TFile, line: number, evt: MouseEvent): void {
    if (!this.dailyNotes.getDate(file)) return;
    const action =
      evt.type === "contextmenu"
        ? this.settings.rightClickAction
        : this.settings.leftClickAction;
    this.handleIconAction(action, file, line, evt);
  }

  /** 按配置动作分发：popup 弹菜单，prev/next 直接移动，none 忽略。 */
  private handleIconAction(
    action: ClickAction,
    file: TFile,
    taskLine: number,
    evt: MouseEvent
  ): void {
    switch (action) {
      case "popup":
        this.openTaskMenu(file, taskLine, evt);
        break;
      case "prev":
        void this.doMove("prev", file, taskLine);
        break;
      case "next":
        void this.doMove("next", file, taskLine);
        break;
      case "none":
        break;
    }
  }

  /** 弹出前一天/后一天菜单。菜单始终显示所有启用的方向，不随左右键绑定移除。 */
  private openTaskMenu(file: TFile, taskLine: number, evt: MouseEvent): void {
    const showPrev = this.settings.enablePreviousDay;
    const showNext = this.settings.enableNextDay;
    if (!showPrev && !showNext) return;
    const menu = new Menu();
    if (showPrev) {
      menu.addItem((item) => {
        item.setTitle(t("menu.moveToPreviousDay"));
        item.setIcon("arrow-left");
        item.onClick(() => {
          void this.doMove("prev", file, taskLine);
        });
      });
    }
    if (showNext) {
      menu.addItem((item) => {
        item.setTitle(t("menu.moveToNextDay"));
        item.setIcon("arrow-right");
        item.onClick(() => {
          void this.doMove("next", file, taskLine);
        });
      });
    }
    menu.showAtMouseEvent(evt);
  }

  /**
   * 移动指定行的任务块到前一天/后一天日记。
   * 不依赖 editor 光标，由调用方传入 file + taskLine（编辑模式图标 / 阅读模式图标 / 命令均走此入口）。
   */
  private async doMove(
    direction: "prev" | "next",
    file: TFile,
    taskLine: number
  ): Promise<void> {
    try {
      const context = await this.dailyNotes.resolve(file);
      if (!context) {
        new Notice(t("notice.notDailyNote"));
        return;
      }

      const date = context.date;
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) return;
      const taskItem = getTaskAtLine(cache, taskLine);
      if (!taskItem) return;
      // 兜底：子 task 不允许单独移动（图标层已过滤，命令入口在此拦截）
      if (taskItem.parent >= 0) {
        new Notice(t("notice.subtaskNotMovable"));
        return;
      }

      const blockRange = getTaskBlockRange(cache, taskItem);
      const sourceHeading = deriveSourceHeading(
        cache,
        taskItem.position.start.line
      );

      const targetDate =
        direction === "prev"
          ? date.clone().subtract(1, "day")
          : context.endDate.clone().add(1, "day");

      const targetFile = await context.getOrCreate(targetDate);

      await moveTaskToNote({
        app: this.app,
        sourceFile: file,
        blockRange,
        sourceHeading,
        targetFile,
      });
    } catch (err) {
      if (isNoteCreationCancelled(err)) return;
      const e = err as { message?: string };
      new Notice(String(e?.message ?? err));
    }
  }

  /**
   * 阅读模式：为渲染后的 li.task-list-item 注入行内图标。
   * 用 ctx.getSectionInfo(el) 拿到当前渲染块的源码行范围，
   * 在该范围内按源码顺序取 task，与 DOM 顺序一一对应（嵌套列表也成立）。
   */
  private processReadingModeTasks(
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void {
    const tfile = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(tfile instanceof TFile)) return;
    if (!this.dailyNotes.getDate(tfile)) return;
    if (!this.hasActiveIconAction()) return;

    const cache = this.app.metadataCache.getFileCache(tfile);
    if (!cache?.listItems) return;

    const info = ctx.getSectionInfo(el);
    if (!info) return;
    const sectionStart = info.lineStart;
    const sectionEnd = info.lineEnd;

    const sectionTasks = cache.listItems.filter(
      (i) =>
        i.task !== undefined &&
        i.position.start.line >= sectionStart &&
        i.position.start.line <= sectionEnd
    );
    if (sectionTasks.length === 0) return;

    const taskEls = el.findAll("li.task-list-item");
    if (taskEls.length === 0) return;

    const count = Math.min(taskEls.length, sectionTasks.length);
    for (let i = 0; i < count; i++) {
      const taskEl = taskEls[i];
      const taskItem = sectionTasks[i];
      // 仅顶层 task 显示图标（parent < 0 表示无父列表项）
      if (taskItem.parent >= 0) continue;
      const taskLine = taskItem.position.start.line;
      // 空 task（`- [ ] ` 后无内容）不显示图标。
      // 只统计嵌套子列表之前的直接文本（getText() 会包含子项文本，导致空父项误判）
      let directText = "";
      for (const node of Array.from(taskEl.childNodes)) {
        // 跨窗口安全的 instanceof 检查（popout 窗口中 DOM 类来自不同 window）
        if (
          node.instanceOf(HTMLElement) &&
          (node.tagName === "UL" || node.tagName === "OL")
        ) {
          break;
        }
        directText += node.textContent ?? "";
      }
      if (directText.trim().length === 0) continue;
      if (taskEl.querySelector(":scope > .dtm-task-icon")) continue;

      const icon = createSpan();
      icon.className = "dtm-task-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.setAttribute("title", t("title.moveTask"));
      setIcon(icon, "arrow-left-right");
      icon.addEventListener("click", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.dispatchIconClick(tfile, taskLine, e);
      });
      icon.addEventListener("contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.dispatchIconClick(tfile, taskLine, e);
      });
      // 行尾插入：嵌套 task 时插到子 ul 之前（task 文本末尾），否则 append 到 li 末尾
      const nestedUl = taskEl.querySelector(":scope > ul, :scope > ol");
      if (nestedUl) {
        nestedUl.before(icon);
      } else {
        taskEl.append(icon);
      }
    }
  }
}
