import { App, Notice, TFile } from "obsidian";
import { t } from "./i18n";

interface MoveOpts {
  app: App;
  sourceFile: TFile;
  blockRange: { startLine: number; endLine: number };
  sourceHeading: { level: number; text: string } | null;
  targetFile: TFile;
}

/** Remove the task's base indentation, keeping relative indentation within the block. */
export function unindentTaskBlock(text: string): string {
  const width = (indent: string) => Array.from(indent).reduce(
    (column, character) => character === "\t" ? column + 4 - column % 4 : column + 1,
    0
  );
  const base = width(/^[ \t]*/.exec(text)?.[0] ?? "");
  return text.split("\n").map((line) => {
    let column = 0;
    let offset = 0;
    while (offset < line.length && column < base && /[ \t]/.test(line[offset])) {
      column = line[offset++] === "\t" ? column + 4 - column % 4 : column + 1;
    }
    return " ".repeat(Math.max(0, column - base)) + line.slice(offset);
  }).join("\n");
}

/**
 * 追加文本到目标末尾，确保前面有空行分隔。
 * 保留原文件的末尾换行状态：原本没有结尾换行就不补（零副作用，
 * 删除时依据当前末尾状态即可反推原状态，往返逐字节还原）。
 */
function appendToEnd(data: string, blockText: string): string {
  if (data.length === 0) {
    return blockText + "\n";
  }
  const endsWithNewline = data.endsWith("\n");
  let result = data;
  if (!result.endsWith("\n")) result += "\n";
  if (!result.endsWith("\n\n")) result += "\n";
  result += blockText;
  if (endsWithNewline) result += "\n";
  return result;
}

/** 在目标末尾追加新标题 + 任务块。同样保留末尾换行状态（零副作用）。 */
function appendNewHeading(
  data: string,
  heading: { level: number; text: string },
  blockText: string
): string {
  const hashes = "#".repeat(heading.level);
  const headingLine = `${hashes} ${heading.text}`;
  if (data.length === 0) {
    return `${headingLine}\n\n${blockText}\n`;
  }
  const endsWithNewline = data.endsWith("\n");
  let result = data;
  if (!result.endsWith("\n")) result += "\n";
  if (!result.endsWith("\n\n")) result += "\n";
  result += `${headingLine}\n\n${blockText}`;
  if (endsWithNewline) result += "\n";
  return result;
}

/**
 * 将光标所在任务块从源笔记移动到目标笔记。
 * 冲突/错误通过 Notice 提示，不向上抛出。
 */
export async function moveTaskToNote(opts: MoveOpts): Promise<void> {
  const { app, sourceFile, blockRange, sourceHeading, targetFile } = opts;
  try {
    // 统一从 vault 读取源文件内容，避免编辑器/vault 不同步
    const sourceContent = await app.vault.read(sourceFile);
    const sourceLines = sourceContent.split("\n");
    // 提取块文本（含全部子项）
    const blockText = unindentTaskBlock(sourceLines
      .slice(blockRange.startLine, blockRange.endLine + 1)
      .join("\n"));
    const firstLine = blockText.split("\n")[0] ?? "";

    const targetContent = await app.vault.read(targetFile);
    const targetLines = targetContent.split("\n");

    // ---- 冲突检测（修改前）----
    if (sourceHeading) {
      const targetCache = app.metadataCache.getFileCache(targetFile);
      const matches = (targetCache?.headings ?? []).filter(
        (h) => h.level === sourceHeading.level && h.heading === sourceHeading.text
      );
      if (matches.length > 1) {
        const hashes = "#".repeat(sourceHeading.level);
        throw new Error(
          t("error.multipleHeadings", {
            heading: `${hashes} ${sourceHeading.text}`,
          })
        );
      }
    }
    if (firstLine.length > 0 && targetLines.includes(firstLine)) {
      throw new Error(t("error.duplicateTask"));
    }

    // ---- 计算目标标题段范围（基于 metadataCache）----
    let targetHeadingLine: number | null = null;
    let sectionEndLine = Number.MAX_SAFE_INTEGER;
    if (sourceHeading) {
      const targetCache = app.metadataCache.getFileCache(targetFile);
      const headings = targetCache?.headings ?? [];
      const match = headings.find(
        (h) => h.level === sourceHeading.level && h.heading === sourceHeading.text
      );
      if (match) {
        targetHeadingLine = match.position.start.line;
        for (const h of headings) {
          if (
            h.position.start.line > targetHeadingLine &&
            h.level <= sourceHeading.level
          ) {
            sectionEndLine = h.position.start.line - 1;
            break;
          }
        }
      }
    }

    // ---- 插入到目标笔记（原子操作）----
    await app.vault.process(targetFile, (data: string) => {
      const lines = data.split("\n");

      if (sourceHeading === null) {
        return appendToEnd(data, blockText);
      }

      if (targetHeadingLine !== null && targetHeadingLine < lines.length) {
        const upper = Math.min(sectionEndLine, lines.length - 1);
        let lastNonEmpty = targetHeadingLine;
        for (let i = targetHeadingLine; i <= upper; i++) {
          if (lines[i].trim().length > 0) {
            lastNonEmpty = i;
          }
        }
        lines.splice(lastNonEmpty + 1, 0, ...blockText.split("\n"));
        return lines.join("\n");
      }

      // 目标无该标题 → 末尾新建标题 + 任务
      return appendNewHeading(data, sourceHeading, blockText);
    });

    // ---- 从源笔记删除任务块（原子操作）----
    await app.vault.process(sourceFile, (data: string) => {
      const lines = data.split("\n");
      const before = lines.slice(0, blockRange.startLine);
      const after = lines.slice(blockRange.endLine + 1);

      // 块是文件最后一段内容：连带清掉块前由插入逻辑补的分隔空行；
      // 末尾换行保留文件当前状态——原本没有就不补（零副作用）
      const isLastContent = after.every((line) => line.trim().length === 0);
      if (isLastContent) {
        const remaining = before.slice();
        while (
          remaining.length > 0 &&
          remaining[remaining.length - 1].trim().length === 0
        ) {
          remaining.pop();
        }
        if (remaining.length === 0) return "";
        return remaining.join("\n") + (data.endsWith("\n") ? "\n" : "");
      }

      // 块在文件中间：直接拼接前后行，不改动其他空行与末尾换行状态
      return before.concat(after).join("\n");
    });

    new Notice(t("notice.movedTo", { name: targetFile.basename }));
  } catch (err) {
    const e = err as { message?: string };
    new Notice(String(e?.message ?? err));
  }
}
