import { CachedMetadata, ListItemCache } from "obsidian";
import type { EditorSelection } from "obsidian";
import type { TaskMove } from "./taskMover";

/** A selection ending at column zero excludes that final line. */
export function getSelectedTaskLines(cache: CachedMetadata, selections: EditorSelection[]): number[] {
  return (cache.listItems ?? []).filter((item) => item.task !== undefined && item.parent < 0 && selections.some(({ anchor, head }) => {
    const forward = anchor.line < head.line || (anchor.line === head.line && anchor.ch <= head.ch);
    const from = forward ? anchor : head;
    const to = forward ? head : anchor;
    const lastLine = to.line > from.line && to.ch === 0 ? to.line - 1 : to.line;
    return item.position.start.line >= from.line && item.position.start.line <= lastLine;
  })).map((item) => item.position.start.line);
}

/** Selecting an ancestor includes its descendants once, in source order. */
export function getTaskMoves(cache: CachedMetadata, lines: number[]): TaskMove[] {
  const moves: TaskMove[] = [];
  for (const line of [...new Set(lines)].sort((a, b) => a - b)) {
    const item = getTaskAtLine(cache, line);
    if (!item || item.parent >= 0) continue;
    const blockRange = getTaskBlockRange(cache, item);
    if (moves.some((move) => blockRange.startLine <= move.blockRange.endLine)) continue;
    moves.push({ blockRange, sourceHeading: deriveSourceHeading(cache, line) });
  }
  return moves;
}

/**
 * 在 cache.listItems 中查找位于指定行且为任务（task 字段非 undefined）的列表项。
 */
export function getTaskAtLine(
  cache: CachedMetadata,
  line: number
): ListItemCache | null {
  if (!cache.listItems) return null;
  for (const item of cache.listItems) {
    if (
      item.position.start.line === line &&
      item.task !== undefined
    ) {
      return item;
    }
  }
  return null;
}

/**
 * 递归收集 taskItem 的全部后代列表项（基于 ListItemCache.parent）。
 * parent 字段为父项的 position.start.line；根级列表项 parent 为负数。
 */
function collectDescendants(
  cache: CachedMetadata,
  parentLine: number
): ListItemCache[] {
  if (!cache.listItems) return [];
  const result: ListItemCache[] = [];
  const queue: number[] = [parentLine];
  const visited = new Set<number>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const item of cache.listItems) {
      if (item.parent === current && item.position.start.line !== parentLine) {
        result.push(item);
        queue.push(item.position.start.line);
      }
    }
  }
  return result;
}

/**
 * 计算任务块的行范围：从任务行开始，到所有后代中最大的 position.end.line。
 * 无后代时 endLine 即任务自身的 position.end.line。
 */
export function getTaskBlockRange(
  cache: CachedMetadata,
  taskItem: ListItemCache
): { startLine: number; endLine: number } {
  const startLine = taskItem.position.start.line;
  let endLine = taskItem.position.end.line;
  const descendants = collectDescendants(cache, startLine);
  for (const d of descendants) {
    if (d.position.end.line > endLine) {
      endLine = d.position.end.line;
    }
  }
  return { startLine, endLine };
}

/**
 * 派生任务上方最近的标题：在 cache.headings 中找 position.start.line < taskLine
 * 且最大的一项。无则返回 null。
 */
export function deriveSourceHeading(
  cache: CachedMetadata,
  taskLine: number
): { level: number; text: string } | null {
  if (!cache.headings || cache.headings.length === 0) return null;
  let best: { level: number; text: string; line: number } | null = null;
  for (const h of cache.headings) {
    if (h.position.start.line < taskLine) {
      if (!best || h.position.start.line > best.line) {
        best = {
          level: h.level,
          text: h.heading,
          line: h.position.start.line,
        };
      }
    }
  }
  if (!best) return null;
  return { level: best.level, text: best.text };
}
