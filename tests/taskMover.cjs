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

test("moving a nested task retains its children and leaves its parent and siblings", async () => {
  const h = setup("## Tasks\n- [ ] Parent\n  - [ ] Move me\n    - [ ] Child\n  - [ ] Sibling\n", "## Tasks\n", tasksHeading);
  await mover.moveTaskToNote({ ...h, blockRange: { startLine: 2, endLine: 3 }, sourceHeading: { level: 2, text: "Tasks" } });
  assert.equal(h.contents.get(h.sourceFile), "## Tasks\n- [ ] Parent\n  - [ ] Sibling\n");
  assert.equal(h.contents.get(h.targetFile), "## Tasks\n- [ ] Move me\n  - [ ] Child\n");
});

test("unindenting handles tabs and retains nested continuation text", () => {
  assert.equal(mover.unindentTaskBlock("\t- [ ] Task\n\t\t- Child\n\t  Details"), "- [ ] Task\n\t- Child\n  Details");
  assert.equal(mover.unindentTaskBlock("  - [ ] Task\n\t- Child"), "- [ ] Task\n  - Child");
});

