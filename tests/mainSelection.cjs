const assert = require("node:assert/strict");
const { test } = require("node:test");
const moment = require("moment");
const { load } = require("./helpers/load.cjs");
const taskCache = load("src/taskCache.ts", {});
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function setup() {
  const commands = [];
  const moves = [];
  const file = { path: "source.md" };
  const target = { path: "target.md" };
  const view = {
    file,
    editor: { listSelections: () => [{ anchor: { line: 1, ch: 0 }, head: { line: 4, ch: 0 } }] },
  };
  const cache = {
    listItems: [1, 2, 3, 5].map((line) => ({ task: " ", parent: -1, position: { start: { line }, end: { line } } })),
  };
  class Plugin {
    addCommand(command) { commands.push(command); }
    addSettingTab() {}
    register() {}
    registerEvent() {}
  }
  const DailyTaskMover = load("main.ts", {
    obsidian: {
      Plugin, MarkdownView: class {}, Platform: { isMobile: true },
      Notice: class { constructor(message) { throw new Error(message); } },
      debounce: (fn) => Object.assign(fn, { cancel() {} }),
    },
    "./src/settings": {},
    "./src/settingsTab": { DailyTaskMoverSettingTab: class {} },
    "./src/taskCache": taskCache,
    "./src/dailyNoteUtils": {
      getCurrentDailyDate: () => moment("2026-10-10"),
      getOrCreateDailyNote: async () => target,
    },
    "./src/taskMover": { moveTasksToNote: async (options) => moves.push(options) },
    "./src/taskLineIcon": {},
    "./src/i18n": { t: (key) => key, setLanguage() {} },
  }).default;
  const plugin = new DailyTaskMover();
  plugin.app = {
    workspace: { onLayoutReady() {}, on() {}, getActiveViewOfType: () => view },
    vault: { on() {}, read: async () => "## Tasks\n- [ ] A\n- [ ] B\n- [ ] C\n\n- [ ] D" },
    metadataCache: { on() {}, getFileCache: () => cache },
  };
  plugin.loadSettings = async () => {
    plugin.settings = { enablePreviousDay: true, enableNextDay: true, leftClickAction: "next" };
  };
  await plugin.onload();
  return { plugin, commands, moves };
}

test("the move command sends every selected task to the batch mover", async () => {
  const h = await setup();
  const command = h.commands.find(({ id }) => id === "move-to-next-day");
  assert.equal(command.checkCallback(true), true);
  command.checkCallback(false);
  await flush();
  assert.deepEqual(h.moves[0].tasks.map(({ blockRange }) => blockRange.startLine), [1, 2, 3]);
  assert.ok(h.moves[0].sourceSnapshot.includes("- [ ] A"));
});

test("an icon within the selection moves the selection, while an outside icon moves only itself", async () => {
  const h = await setup();
  h.plugin.handleIconClick(2, { type: "click" });
  await flush();
  assert.deepEqual(h.moves[0].tasks.map(({ blockRange }) => blockRange.startLine), [1, 2, 3]);
  h.plugin.handleIconClick(5, { type: "click" });
  await flush();
  assert.deepEqual(h.moves[1].tasks.map(({ blockRange }) => blockRange.startLine), [5]);
});
