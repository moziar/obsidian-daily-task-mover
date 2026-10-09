global.window = globalThis;
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { load } = require("./helpers/load.cjs");

class Events {
  listeners = new Set();
  on(name, callback) {
    const ref = { name, callback };
    this.listeners.add(ref);
    return ref;
  }
  offref(ref) { this.listeners.delete(ref); }
  trigger(name, ...args) {
    for (const ref of [...this.listeners]) {
      if (ref.name === name) ref.callback(...args);
    }
  }
}

const i18n = { t: (key) => key };
const notices = [];
const mover = load("src/taskMover.ts", {
  obsidian: { Notice: class { constructor(message) { notices.push(message); } } },
  "./i18n": i18n,
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(sourceText, targetText, cache = null) {
  const sourceFile = { path: "source.md" };
  const targetFile = { path: "target.md", basename: "target" };
  const contents = new Map([[sourceFile, sourceText], [targetFile, targetText]]);
  const metadataCache = new Events();
  metadataCache.getFileCache = () => cache;
  const vault = new Events();
  vault.read = async (file) => contents.get(file);
  vault.process = async (file, fn) => contents.set(file, fn(contents.get(file)));
  return { app: { metadataCache, vault }, sourceFile, targetFile, contents };
}

const tasksHeading = { headings: [{ heading: "Tasks", level: 2, position: { start: { line: 0 } } }] };

const task = (startLine, endLine = startLine, text = "Tasks") => ({
  blockRange: { startLine, endLine }, sourceHeading: text ? { level: 2, text } : null,
});

test("a selection spanning headings moves all blocks in one write per note", async () => {
  const source = "## Work\n- [ ] A\n- [ ] Keep\n## Home\n- [ ] B\n";
  const target = "## Work\nExisting\n\n## Home\nOther\n";
  const cache = { headings: [
    { heading: "Work", level: 2, position: { start: { line: 0 } } },
    { heading: "Home", level: 2, position: { start: { line: 3 } } },
  ] };
  const h = setup(source, target, cache);
  const writes = [];
  const process = h.app.vault.process;
  h.app.vault.process = async (file, fn) => { writes.push(file); return process(file, fn); };
  await mover.moveTasksToNote({ ...h, tasks: [task(1, 1, "Work"), task(4, 4, "Home")] });
  assert.equal(h.contents.get(h.targetFile), "## Work\nExisting\n- [ ] A\n\n## Home\nOther\n- [ ] B\n");
  assert.equal(h.contents.get(h.sourceFile), "## Work\n- [ ] Keep\n## Home\n");
  assert.deepEqual(writes, [h.targetFile, h.sourceFile]);
});

test("several tasks with the same absent heading create that heading once", async () => {
  const h = setup("- [ ] A\n- [ ] B\n", "Intro\n", {});
  await mover.moveTasksToNote({ ...h, tasks: [task(0), task(1)] });
  assert.equal(h.contents.get(h.targetFile), "Intro\n\n## Tasks\n\n- [ ] A\n- [ ] B\n");
  assert.equal(h.contents.get(h.sourceFile), "");
});

test("a duplicate late in the selection prevents every selected task from moving", async () => {
  const source = "- [ ] A\n- [ ] B";
  const target = "## Tasks\n- [ ] B";
  const h = setup(source, target, tasksHeading);
  await mover.moveTasksToNote({ ...h, tasks: [task(0), task(1)] });
  assert.equal(h.contents.get(h.sourceFile), source);
  assert.equal(h.contents.get(h.targetFile), target);
  assert.equal(notices.at(-1), "error.duplicateTask");
});

test("a source edit while creating the destination aborts the selection", async () => {
  const h = setup("- [ ] Edited", "## Tasks\n", tasksHeading);
  await mover.moveTasksToNote({ ...h, sourceSnapshot: "- [ ] Original", tasks: [task(0)] });
  assert.equal(h.contents.get(h.sourceFile), "- [ ] Edited");
  assert.equal(h.contents.get(h.targetFile), "## Tasks\n");
  assert.equal(notices.at(-1), "error.sourceChanged");
});

test("concurrent destination edits abort before source removal", async () => {
  const h = setup("- [ ] A", "## Tasks", tasksHeading);
  h.app.vault.process = async (file, fn) => {
    h.contents.set(file, "## Tasks\nConcurrent edit");
    h.contents.set(file, fn(h.contents.get(file)));
  };
  await mover.moveTasksToNote({ ...h, tasks: [task(0)] });
  assert.equal(h.contents.get(h.sourceFile), "- [ ] A");
  assert.equal(h.contents.get(h.targetFile), "## Tasks\nConcurrent edit");
  assert.equal(notices.at(-1), "error.targetChanged");
});

test("a source edit after destination insertion is preserved with a partial-move warning", async () => {
  const h = setup("- [ ] A", "## Tasks", tasksHeading);
  const process = h.app.vault.process;
  h.app.vault.process = async (file, fn) => {
    if (file === h.sourceFile) h.contents.set(file, "- [ ] Edited");
    return process(file, fn);
  };
  await mover.moveTasksToNote({ ...h, tasks: [task(0)] });
  assert.equal(h.contents.get(h.sourceFile), "- [ ] Edited");
  assert.equal(h.contents.get(h.targetFile), "## Tasks\n- [ ] A");
  assert.equal(notices.at(-1), "error.sourceRemovalFailed");
});

test("moving into the source note does not change it", async () => {
  const h = setup("- [ ] A", "", {});
  await mover.moveTasksToNote({ ...h, targetFile: h.sourceFile, tasks: [task(0)] });
  assert.equal(h.contents.get(h.sourceFile), "- [ ] A");
  assert.equal(notices.at(-1), "error.sameNote");
});

