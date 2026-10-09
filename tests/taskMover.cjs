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
const metadata = load("src/noteMetadata.ts", { "./i18n": i18n });
const notices = [];
const mover = load("src/taskMover.ts", {
  obsidian: { Notice: class { constructor(message) { notices.push(message); } } },
  "./i18n": i18n,
  "./noteMetadata": metadata,
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

test("a newly created destination waits for headings before inserting the task", async () => {
  const h = setup("## Tasks\n- [ ] Move me\n", "## Tasks\n\nTemplate text\n");
  const moving = mover.moveTaskToNote({ ...h, blockRange: { startLine: 1, endLine: 1 }, sourceHeading: { level: 2, text: "Tasks" } });
  await flush();
  assert.equal(h.contents.get(h.sourceFile), "## Tasks\n- [ ] Move me\n");
  assert.equal(h.contents.get(h.targetFile), "## Tasks\n\nTemplate text\n");
  h.app.metadataCache.trigger("changed", h.targetFile, h.contents.get(h.targetFile), tasksHeading);
  await moving;
  assert.equal(h.contents.get(h.targetFile), "## Tasks\n\nTemplate text\n- [ ] Move me\n");
  assert.equal(h.contents.get(h.sourceFile), "## Tasks\n");
  assert.equal(h.app.metadataCache.listeners.size, 0);
  assert.equal(h.app.vault.listeners.size, 0);
});

test("an indexed destination with no heading receives the missing heading", async () => {
  const h = setup("- [ ] Move me", "Intro\n", {});
  await mover.moveTaskToNote({ ...h, blockRange: { startLine: 0, endLine: 0 }, sourceHeading: { level: 2, text: "Tasks" } });
  assert.equal(h.contents.get(h.targetFile), "Intro\n\n## Tasks\n\n- [ ] Move me\n");
});

test("metadata timeout removes listeners and fails without writing files", async () => {
  const h = setup("source", "destination");
  await assert.rejects(metadata.readIndexedNote(h.app, async () => h.targetFile, 5), /noteNotIndexed/);
  assert.equal(h.app.metadataCache.listeners.size, 0);
  assert.equal(h.app.vault.listeners.size, 0);
  assert.equal(h.contents.get(h.sourceFile), "source");
  assert.equal(h.contents.get(h.targetFile), "destination");
});

test("deleting a destination while indexing aborts the move", async () => {
  const h = setup("- [ ] Move me", "## Tasks");
  const moving = mover.moveTaskToNote({ ...h, blockRange: { startLine: 0, endLine: 0 }, sourceHeading: { level: 2, text: "Tasks" } });
  await flush();
  h.app.vault.trigger("delete", h.targetFile);
  await moving;
  assert.equal(h.contents.get(h.sourceFile), "- [ ] Move me");
  assert.equal(notices.at(-1), "error.noteNotIndexed");
  assert.equal(h.app.metadataCache.listeners.size, 0);
});

const template = "## Overview\n\nSummary\n## Tasks\n\n## Later\n";
const completedNote = "---\njournal: Daily\n---\n" + template;
const templateCache = { headings: [
  { heading: "Overview", level: 2, position: { start: { line: 0 } } },
  { heading: "Tasks", level: 2, position: { start: { line: 3 } } },
  { heading: "Later", level: 2, position: { start: { line: 5 } } },
] };
const completedCache = { headings: templateCache.headings.map((heading) => ({
  ...heading, position: { start: { line: heading.position.start.line + 3 } },
})) };

function assertNoListeners(h) {
  assert.equal(h.app.metadataCache.listeners.size, 0);
  assert.equal(h.app.vault.listeners.size, 0);
}

for (const initialCache of [{}, templateCache]) {
  test(`creation ignores ${initialCache.headings ? "template" : "empty-note"} metadata until frontmatter is indexed`, async () => {
    const h = setup("## Tasks\n- [ ] Move me\n", "", initialCache);
    let finished = false;
    const reading = metadata.readIndexedNote(h.app, async () => {
      h.app.vault.trigger("create", h.targetFile);
      const initialContent = initialCache.headings ? template : "";
      h.app.metadataCache.trigger("changed", h.targetFile, initialContent, initialCache);
      h.contents.set(h.targetFile, completedNote);
      h.app.vault.trigger("modify", h.targetFile);
      return h.targetFile;
    }).then((result) => { finished = true; return result; });
    await flush();
    assert.equal(finished, false);
    h.app.metadataCache.trigger("changed", h.sourceFile, completedNote, completedCache);
    h.app.metadataCache.trigger("changed", h.targetFile, template, templateCache);
    await flush();
    assert.equal(finished, false);
    h.app.metadataCache.trigger("changed", h.targetFile, completedNote, completedCache);
    const targetSnapshot = await reading;
    await mover.moveTaskToNote({ ...h, blockRange: { startLine: 1, endLine: 1 }, sourceHeading: { level: 2, text: "Tasks" }, targetSnapshot });
    assert.equal(h.contents.get(h.targetFile), completedNote.replace("## Tasks\n", "## Tasks\n- [ ] Move me\n"));
    assert.equal(h.contents.get(h.sourceFile), "## Tasks\n");
    assertNoListeners(h);
  });
}

test("creation retains matching metadata emitted before the provider returns", async () => {
  const h = setup("source", "", templateCache);
  const result = await metadata.readIndexedNote(h.app, async () => {
    h.app.vault.trigger("create", h.targetFile);
    h.contents.set(h.targetFile, completedNote);
    h.app.vault.trigger("modify", h.targetFile);
    h.app.metadataCache.trigger("changed", h.targetFile, completedNote, completedCache);
    return h.targetFile;
  });
  assert.equal(result.cache, completedCache);
  assert.equal(result.content, completedNote);
  assertNoListeners(h);
});

test("provider updates to an existing destination also wait for matching metadata", async () => {
  const h = setup("source", template, templateCache);
  let finished = false;
  const reading = metadata.readIndexedNote(h.app, async () => {
    h.contents.set(h.targetFile, completedNote);
    h.app.vault.trigger("modify", h.targetFile);
    return h.targetFile;
  }).then((result) => { finished = true; return result; });
  await flush();
  assert.equal(finished, false);
  h.app.metadataCache.trigger("changed", h.targetFile, completedNote, completedCache);
  assert.equal((await reading).cache, completedCache);
  assertNoListeners(h);
});

test("stale metadata times out without accepting the old heading positions", async () => {
  const h = setup("source", completedNote, templateCache);
  await assert.rejects(metadata.readIndexedNote(h.app, async () => {
    h.app.vault.trigger("create", h.targetFile);
    h.app.metadataCache.trigger("changed", h.targetFile, template, templateCache);
    return h.targetFile;
  }, 5), /noteNotIndexed/);
  assert.equal(h.contents.get(h.sourceFile), "source");
  assert.equal(h.contents.get(h.targetFile), completedNote);
  assertNoListeners(h);
});

test("creation cancellation removes every metadata observer", async () => {
  const h = setup("source", "");
  const cancelled = new Error("cancelled");
  await assert.rejects(metadata.readIndexedNote(h.app, async () => { throw cancelled; }), (error) => error === cancelled);
  assertNoListeners(h);
});

test("concurrent destination edits abort before source removal", async () => {
  const h = setup("- [ ] A", "## Tasks", tasksHeading);
  h.app.vault.process = async (file, fn) => {
    h.contents.set(file, "## Tasks\nConcurrent edit");
    h.contents.set(file, fn(h.contents.get(file)));
  };
  await mover.moveTaskToNote({ ...h, blockRange: { startLine: 0, endLine: 0 }, sourceHeading: { level: 2, text: "Tasks" } });
  assert.equal(h.contents.get(h.sourceFile), "- [ ] A");
  assert.equal(h.contents.get(h.targetFile), "## Tasks\nConcurrent edit");
  assert.equal(notices.at(-1), "error.targetChanged");
});

