const assert = require("node:assert/strict");
const { test } = require("node:test");
const { load } = require("./helpers/load.cjs");
const { getSelectedTaskLines, getTaskMoves } = load("src/taskCache.ts", {});
const item = (line, parent = -1, end = line) => ({ task: " ", parent, position: { start: { line }, end: { line: end } } });
const range = (from, to, ch = 0) => ({ anchor: { line: from, ch: 0 }, head: { line: to, ch } });
const cache = {
  headings: [{ heading: "Tasks", level: 2, position: { start: { line: 0 } } }],
  listItems: [item(1), item(2), item(3), item(4), item(6)],
};

test("forward and backward selections exclude the next line when ending at column zero", () => {
  assert.deepEqual(getSelectedTaskLines(cache, [range(1, 4)]), [1, 2, 3]);
  assert.deepEqual(getSelectedTaskLines(cache, [range(4, 1)]), [1, 2, 3]);
});

test("multiple selections and carets select distinct task lines", () => {
  assert.deepEqual(getSelectedTaskLines(cache, [range(2, 2), range(6, 6), range(2, 3)]), [2, 6]);
});

test("selected parents include their descendants once", () => {
  const nested = { ...cache, listItems: [item(1), item(2, 1), item(3, 2), item(4, 1), item(6)] };
  const moves = getTaskMoves(nested, [3, 2, 1, 4, 6, 1]);
  assert.deepEqual(moves.map(({ blockRange }) => blockRange), [{ startLine: 1, endLine: 4 }, { startLine: 6, endLine: 6 }]);
});
