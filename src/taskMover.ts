import { App, Notice, TFile } from "obsidian";
import { t } from "./i18n";

export interface TaskMove {
  blockRange: { startLine: number; endLine: number };
  sourceHeading: { level: number; text: string } | null;
}

interface BatchMoveOpts {
  app: App;
  sourceFile: TFile;
  targetFile: TFile;
  tasks: TaskMove[];
  sourceSnapshot?: string;
}

type MoveOpts = Omit<BatchMoveOpts, "tasks"> & TaskMove;

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

/** Move one task through the same preflight and write path as a selection. */
export async function moveTaskToNote(opts: MoveOpts): Promise<void> {
  return moveTasksToNote({ ...opts, tasks: [opts] });
}

/** Check the whole selection before writing either note. */
export async function moveTasksToNote(opts: BatchMoveOpts): Promise<void> {
  const { app, sourceFile, targetFile } = opts;
  let targetWritten = false;
  try {
    if (sourceFile.path === targetFile.path) throw new Error(t("error.sameNote"));
    if (opts.tasks.length === 0) return;
    const tasks = [...opts.tasks].sort((a, b) => a.blockRange.startLine - b.blockRange.startLine);
    const sourceContent = opts.sourceSnapshot ?? await app.vault.read(sourceFile);
    const sourceLines = sourceContent.split("\n");
    const targetCache = app.metadataCache.getFileCache(targetFile);
    const targetContent = await app.vault.read(targetFile);
    const targetLines = targetContent.split("\n");
    const headings = targetCache?.headings ?? [];
    const seen = new Set(targetLines);
    const groups: { heading: TaskMove["sourceHeading"]; blocks: string[] }[] = [];

    for (const [index, task] of tasks.entries()) {
      const { startLine, endLine } = task.blockRange;
      if (startLine < 0 || endLine < startLine || endLine >= sourceLines.length ||
          (index > 0 && startLine <= tasks[index - 1].blockRange.endLine)) {
        throw new Error(t("error.sourceChanged"));
      }
      const text = sourceLines.slice(startLine, endLine + 1).join("\n");
      const firstLine = text.split("\n")[0];
      if (!/^[-*+]\s+\[[^\]]\]/.test(firstLine)) throw new Error(t("error.sourceChanged"));
      if (seen.has(firstLine)) throw new Error(t("error.duplicateTask"));
      seen.add(firstLine);
      let group = groups.find(({ heading }) => heading?.level === task.sourceHeading?.level && heading?.text === task.sourceHeading?.text);
      if (!group) {
        group = { heading: task.sourceHeading, blocks: [] };
        groups.push(group);
      }
      group.blocks.push(text);
    }

    const insertions: { line: number; text: string }[] = [];
    const appended: typeof groups = [];
    for (const group of groups) {
      const heading = group.heading;
      const matches = heading ? headings.filter((item) => item.level === heading.level && item.heading === heading.text) : [];
      if (heading && matches.length > 1) {
        throw new Error(t("error.multipleHeadings", { heading: `${"#".repeat(heading.level)} ${heading.text}` }));
      }
      if (!matches.length) {
        appended.push(group);
        continue;
      }
      const match = matches[0];
      const next = headings.find((item) => item.position.start.line > match.position.start.line && item.level <= match.level);
      const end = next ? next.position.start.line - 1 : targetLines.length - 1;
      let lastNonEmpty = match.position.start.line;
      for (let line = lastNonEmpty; line <= end; line++) {
        if (targetLines[line]?.trim()) lastNonEmpty = line;
      }
      insertions.push({ line: lastNonEmpty + 1, text: group.blocks.join("\n") });
    }

    // Insert from the bottom so each heading retains its original line position.
    const updatedTarget = [...targetLines];
    for (const insertion of insertions.sort((a, b) => b.line - a.line)) {
      updatedTarget.splice(insertion.line, 0, ...insertion.text.split("\n"));
    }
    let targetResult = updatedTarget.join("\n");
    for (const group of appended) {
      const text = group.blocks.join("\n");
      targetResult = group.heading ? appendNewHeading(targetResult, group.heading, text) : appendToEnd(targetResult, text);
    }

    // Creation prompts and metadata indexing can leave time for the source to change.
    if (await app.vault.read(sourceFile) !== sourceContent) throw new Error(t("error.sourceChanged"));
    await app.vault.process(targetFile, (data) => {
      if (data !== targetContent) throw new Error(t("error.targetChanged"));
      return targetResult;
    });
    targetWritten = true;

    await app.vault.process(sourceFile, (data) => {
      if (data !== sourceContent) throw new Error(t("error.sourceChanged"));
      let result = data;
      for (const task of [...tasks].reverse()) {
        result = removeTaskBlock(result, task.blockRange);
      }
      return result;
    });
    new Notice(t("notice.movedTo", { name: targetFile.basename }));
  } catch (err) {
    const e = err as { message?: string };
    new Notice(targetWritten ? t("error.sourceRemovalFailed") : String(e?.message ?? err));
  }
}

function removeTaskBlock(data: string, range: TaskMove["blockRange"]): string {
  const lines = data.split("\n");
  const before = lines.slice(0, range.startLine);
  const after = lines.slice(range.endLine + 1);
  if (after.every((line) => line.trim().length === 0)) {
    while (before.length && before[before.length - 1].trim().length === 0) before.pop();
    return before.length ? before.join("\n") + (data.endsWith("\n") ? "\n" : "") : "";
  }
  return before.concat(after).join("\n");
}
