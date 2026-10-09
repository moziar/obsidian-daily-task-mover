import { StateField, Range, EditorState, StateEffect } from "@codemirror/state";
import {
  EditorView,
  WidgetType,
  Decoration,
  DecorationSet,
} from "@codemirror/view";
import { setIcon } from "obsidian";
import { t } from "./i18n";

/**
 * 匹配 task 行：`- [ ]` / `- [x]` / `* [X]` 等，捕获前导缩进。
 */
const TASK_LINE_REGEX = /^(\s*)[-*+]\s+\[[ xX]\]/;

/**
 * 外部状态变化（如点击动作设置变更）时，通知编辑器重算图标 decorations。
 * dispatch 该 effect 会触发 StateField.update 重新执行 buildDecorations。
 */
export const refreshTaskIconsEffect = StateEffect.define<null>();

/**
 * 判断 task 行是否为"空 task"：`- [ ] ` 后没有实际内容。
 * 场景：输入一个 task 后顺手敲回车可能出现仅 `- [ ]` 的空行，
 * 这类空 task 不显示移动图标（尚未填写内容，无需移动）。
 */
export function isBlankTaskLine(lineText: string): boolean {
  const match = TASK_LINE_REGEX.exec(lineText);
  if (!match) return false;
  return lineText.slice(match[0].length).trim().length === 0;
}

/**
 * 行内 hover 图标的 widget：点击触发 onClick(line, evt)，
 * 由插件层弹出 Menu。ignoreEvent 返回 true 以阻止点击移动光标。
 */
class TaskIconWidget extends WidgetType {
  constructor(
    readonly line: number,
    readonly onClick: (line: number, evt: MouseEvent) => void
  ) {
    super();
  }

  eq(other: TaskIconWidget): boolean {
    return other.line === this.line;
  }

  toDOM(): HTMLElement {
    const span = createSpan();
    span.className = "dtm-task-icon";
    span.setAttribute("aria-hidden", "true");
    span.setAttribute("title", t("title.moveTask"));
    setIcon(span, "arrow-left-right");
    span.addEventListener("click", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.onClick(this.line, e);
    });
    span.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.onClick(this.line, e);
    });
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildDecorations(
  state: EditorState,
  onClick: (line: number, evt: MouseEvent) => void
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  // 光标所在行不显示图标：用户正在输入时隐藏，光标移走后恢复
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  for (let i = 1; i <= state.doc.lines; i++) {
    if (i === cursorLine) continue;
    const line = state.doc.line(i);
    const match = TASK_LINE_REGEX.exec(line.text);
    if (match) {
      // 空 task（`- [ ] ` 后无内容）不显示图标
      if (isBlankTaskLine(line.text)) continue;
      // cache 的 listItems 行号是 0-based，这里存 0-based line
      const widget = new TaskIconWidget(i - 1, onClick);
      // 行尾插入。side 取 1e6 而非 1：行尾 wikilink 等其他插件的 widget 与本图标
      // 位置相同（line.to），CM6 对同位置 widget 按 side 排序（大者靠后），
      // side: 1 会因扩展注册顺序把本图标挤到链接图标之前，与 Reading Mode 的
      // li.append(icon)（恒排最后）不一致。勿用 2e8，那是 CM6 内部 block widget 边界值。
      decorations.push(
        Decoration.widget({ widget, side: 1e6 }).range(line.to)
      );
    }
  }
  return Decoration.set(decorations, true);
}

/**
 * 构造编辑模式的行内图标扩展。
 * isEnabled 控制是否生成图标（仅日记笔记中显示）。
 * 切换文件时 EditorState 重建、create 重新跑，isEnabled 重新判断。
 */
export function buildTaskIconField(
  onClick: (line: number, evt: MouseEvent) => void,
  isEnabled: () => boolean
): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create(state: EditorState): DecorationSet {
      return isEnabled() ? buildDecorations(state, onClick) : Decoration.none;
    },
    update(value: DecorationSet, tr): DecorationSet {
      if (
        tr.docChanged ||
        tr.selection !== undefined ||
        tr.effects.some((e) => e.is(refreshTaskIconsEffect))
      ) {
        return isEnabled()
          ? buildDecorations(tr.state, onClick)
          : Decoration.none;
      }
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
