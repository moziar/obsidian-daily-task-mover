const assert = require("node:assert/strict");
const { test } = require("node:test");
const state = require("@codemirror/state");
const view = require("@codemirror/view");
const { load } = require("./helpers/load.cjs");
const icons = load("src/taskLineIcon.ts", {
  "@codemirror/state": state,
  "@codemirror/view": view,
  obsidian: { setIcon() {} },
  "./i18n": { t: (key) => key },
});

test("a text selection keeps move icons on its cursor line", () => {
  const field = icons.buildTaskIconField(() => {}, () => true);
  const doc = "- [ ] A\n- [ ] B";
  const editor = state.EditorState.create({ doc, selection: { anchor: 0, head: doc.length }, extensions: [field] });
  assert.equal(editor.field(field).size, 2);
});
