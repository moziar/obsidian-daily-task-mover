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

test("nested tasks receive move icons in the editor", () => {
  const field = icons.buildTaskIconField(() => {}, () => true);
  const doc = "- [ ] Parent\n  - [ ] Child\n\t\t- [ ] Grandchild\n\n";
  const editor = state.EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [field] });
  assert.equal(editor.field(field).size, 3);
});
