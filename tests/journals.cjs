const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const moment = require("moment");

// Compile the real plugin code, substituting only Obsidian and plugin boundaries.
function load(relativePath, mocks) {
  const filename = path.join(__dirname, "..", relativePath);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  };
  new Function("require", "module", "exports", output)(localRequire, module, module.exports);
  return module.exports;
}

function setup({ journal = "Work", date = "2026-09-22", endDate = date, daily = null } = {}) {
  const source = { path: "Renamed entry.md" };
  const destination = { path: "destination.md" };
  const calls = [];
  const handlers = new Map();
  let selected = "journals";
  let updates = 0;
  let lookups = 0;
  const note = journal ? { journal, date, endDate, file: source, path: source.path } : null;
  const api = {
    apiVersion: 1,
    journalOf: async () => { lookups++; return note; },
    ensureNote: async (selector, target) => {
      calls.push([selector, target]);
      return { note: { file: destination }, created: true };
    },
    on: (event, handler) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
  };
  const app = { plugins: { plugins: { journals: { api } } } };
  const obsidian = {
    App: class {}, TFile: class {}, moment, Plugin: class {},
    Notice: class { constructor(message) { calls.push(["notice", message]); } },
    debounce: (fn) => Object.assign(fn, { cancel() {} }),
  };
  const providerTypes = load("src/noteProviders/types.ts", {});
  const journalsModule = load("src/noteProviders/obsidian-journals.ts", {
    obsidian,
    "obsidian-journals-api": { getJournalsApi: () => app.plugins.plugins.journals?.api ?? null },
    "../i18n": { t: (key) => key },
    "./types": providerTypes,
  });
  const dailyModule = load("src/noteProviders/obsidian-daily-notes.ts", {
    "obsidian-daily-notes-interface": { appHasDailyNotesPluginLoaded: () => !!daily },
    "../dailyNoteUtils": {
      getCurrentDailyDate: () => daily ? moment(daily) : null,
      getOrCreateDailyNote: async (target) => {
        calls.push(["daily", target.format("YYYY-MM-DD")]);
        return destination;
      },
    },
  });
  const providers = [journalsModule.obsidianJournalsProvider, dailyModule.obsidianDailyNotesProvider];
  const providerModule = load("src/dailyNoteProvider.ts", {
    "./noteProviders": { noteProviders: providers },
    "./i18n": { t: (key) => key },
  });
  const provider = new providerModule.DailyNoteProvider(app, () => selected, () => updates++);
  const Plugin = load("main.ts", {
    obsidian,
    "./src/settings": {}, "./src/settingsTab": {},
    "./src/taskCache": {
      getTaskAtLine: () => ({ parent: -1, position: { start: { line: 0 } } }),
      getTaskBlockRange: () => ({ startLine: 0, endLine: 1 }),
      deriveSourceHeading: () => ({ text: "Work", level: 2 }),
    },
    "./src/dailyNoteProvider": providerModule,
    "./src/noteProviders/types": providerTypes,
    "./src/taskMover": { moveTaskToNote: async (options) => calls.push(["move", options]) },
    "./src/taskLineIcon": {},
    "./src/i18n": { t: (key) => key },
  }).default;
  const plugin = new Plugin();
  plugin.app = { ...app, metadataCache: { getFileCache: () => ({}) } };
  plugin.dailyNotes = provider;
  return {
    api, app, source, destination, calls, provider, handlers, note, providerModule, providers,
    move: (direction) => plugin.doMove(direction, source, 0),
    updates: () => updates, lookups: () => lookups,
    select: (value) => { selected = value; },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

for (const [period, date, endDate, previous, next] of [
  ["daily", "2026-12-31", "2026-12-31", "2026-12-30", "2027-01-01"],
  ["weekly", "2025-12-29", "2026-01-04", "2025-12-28", "2026-01-05"],
  ["monthly", "2024-02-01", "2024-02-29", "2024-01-31", "2024-03-01"],
  ["quarterly", "2026-10-01", "2026-12-31", "2026-09-30", "2027-01-01"],
  ["yearly", "2026-01-01", "2026-12-31", "2025-12-31", "2027-01-01"],
  ["custom", "2026-09-03", "2026-09-12", "2026-09-02", "2026-09-13"],
]) {
  test(`${period} moves ask Journals for the adjacent period in the same journal`, async () => {
    const h = setup({ date, endDate });
    await h.move("prev");
    await h.move("next");
    assert.deepEqual(h.calls.filter(([type]) => type === "Work"), [["Work", previous], ["Work", next]]);
    const moves = h.calls.filter(([type]) => type === "move");
    assert.equal(moves.length, 2);
    assert.equal(moves[0][1].sourceFile, h.source);
    assert.equal(moves[0][1].targetFile, h.destination);
    assert.deepEqual(moves[0][1].blockRange, { startLine: 0, endLine: 1 });
  });
}

test("selecting Journals ignores Daily Notes even when the filename matches", async () => {
  const h = setup({ journal: "Personal", daily: "2020-01-01" });
  await h.move("next");
  assert.deepEqual(h.calls[0], ["Personal", "2026-09-23"]);
});

test("selecting Daily Notes ignores Journals whether installed or absent", async () => {
  for (const enabled of [true, false]) {
    const h = setup({ journal: null, daily: "2026-09-22" });
    h.select("daily-notes");
    if (!enabled) delete h.app.plugins.plugins.journals;
    await h.move("next");
    assert.deepEqual(h.calls[0], ["daily", "2026-09-23"]);
  }
});

test("ordinary notes and invalid journal dates cannot be moved", async () => {
  for (const config of [{ journal: null }, { date: "not-a-date" }, { endDate: "2020-01-01" }]) {
    const h = setup(config);
    await h.move("next");
    assert.deepEqual(h.calls, [["notice", "notice.notDailyNote"]]);
  }
});

test("Journals never falls back to Daily Notes for an unconnected note or unavailable plugin", async () => {
  for (const enabled of [true, false]) {
    const h = setup({ journal: null, daily: "2026-09-22" });
    if (!enabled) delete h.app.plugins.plugins.journals;
    await h.move("next");
    assert.deepEqual(h.calls, [["notice", enabled ? "notice.notDailyNote" : "provider.selectedUnavailable"]]);
  }
});

test("switching provider clears journal state and does not reuse the previous destination", async () => {
  const h = setup({ daily: "2020-01-01" });
  const context = await h.provider.resolve(h.source);
  h.provider.getDate(h.source);
  await flush();
  h.select("daily-notes");
  assert.equal(h.provider.getDate(h.source).format("YYYY-MM-DD"), "2020-01-01");
  assert.equal(h.handlers.size, 0);
  await assert.rejects(context.getOrCreate(moment()), /providerUnavailable/);
  h.select("journals");
  assert.equal(h.provider.getDate(h.source), null);
  await flush();
  assert.equal(h.provider.getDate(h.source).format("YYYY-MM-DD"), "2026-09-22");
});

test("cancelled creation never moves the source task or displays an error", async () => {
  const h = setup();
  h.api.ensureNote = async () => { throw { code: "aborted" }; };
  await h.move("next");
  assert.deepEqual(h.calls, []);
});

test("creation failures never move the task", async (t) => {
  t.mock.method(console, "error", () => {});
  const h = setup();
  h.api.ensureNote = async () => { throw { code: "outside-timeline" }; };
  await h.move("next");
  assert.deepEqual(h.calls, [["notice", "notice.failedCreateDailyNote"]]);
});

test("async UI lookup is deduplicated and journal events invalidate it", async () => {
  const h = setup();
  assert.equal(h.provider.getDate(h.source), null);
  assert.equal(h.provider.getDate(h.source), null);
  await flush();
  assert.equal(h.lookups(), 1);
  assert.equal(h.updates(), 1);
  assert.equal(h.provider.getDate(h.source).format("YYYY-MM-DD"), "2026-09-22");
  h.note.date = "2026-09-23";
  h.note.endDate = "2026-09-23";
  h.handlers.get("noteAdded")();
  h.provider.getDate(h.source);
  await flush();
  assert.equal(h.provider.getDate(h.source).format("YYYY-MM-DD"), "2026-09-23");
});

test("invalidated pending lookups cannot restore stale UI state", async () => {
  const h = setup();
  let complete;
  h.api.journalOf = () => new Promise((resolve) => { complete = resolve; });
  h.provider.getDate(h.source);
  h.provider.invalidate(h.source);
  complete(h.note);
  await flush();
  assert.equal(h.updates(), 0);
});

test("plugin reload invalidates the cache and prevents use of an old destination context", async () => {
  const h = setup();
  const context = await h.provider.resolve(h.source);
  h.provider.getDate(h.source);
  await flush();
  h.app.plugins.plugins.journals.api = { ...h.api, journalOf: async () => null };
  assert.equal(h.provider.getDate(h.source), null);
  await flush();
  assert.equal(h.provider.getDate(h.source), null);
  await assert.rejects(context.getOrCreate(moment()), /providerUnavailable/);
});

test("disposing removes subscriptions and ignores in-flight lookups", async () => {
  const h = setup();
  h.provider.getDate(h.source);
  h.provider.dispose();
  await flush();
  assert.equal(h.handlers.size, 0);
  assert.equal(h.updates(), 0);
  assert.equal(h.provider.getDate(h.source), null);
});


test("automatic selection prefers Journals globally and falls back only when unavailable", async () => {
  const h = setup({ daily: "2020-01-01" });
  h.select("auto");
  await h.move("next");
  assert.deepEqual(h.calls[0], ["Work", "2026-09-23"]);
  h.api.journalOf = async () => null;
  h.calls.length = 0;
  await h.move("next");
  assert.deepEqual(h.calls, [["notice", "notice.notDailyNote"]]);
  delete h.app.plugins.plugins.journals;
  h.calls.length = 0;
  await h.move("next");
  assert.deepEqual(h.calls[0], ["daily", "2020-01-02"]);
});

test("automatic selection supports a new adapter without changing the resolver", async () => {
  const h = setup({ daily: "2020-01-01" });
  delete h.app.plugins.plugins.journals;
  const identity = {};
  h.providers.unshift({
    id: "third-provider", label: "Third provider", getState: () => "available",
    connect: () => ({ identity, resolve: () => ({
      date: moment("2026-06-01"), endDate: moment("2026-06-30"),
      getOrCreate: async (date) => { h.calls.push(["third", date.format("YYYY-MM-DD")]); return h.destination; },
    }) }),
  });
  h.select("auto");
  await h.move("next");
  assert.deepEqual(h.calls[0], ["third", "2026-07-01"]);
  h.select("daily-notes");
  h.calls.length = 0;
  await h.move("next");
  assert.deepEqual(h.calls[0], ["daily", "2020-01-02"]);
});


test("an explicit provider selection survives disable and re-enable without falling back", async () => {
  const h = setup({ daily: "2020-01-01" });
  const context = await h.provider.resolve(h.source);
  delete h.app.plugins.plugins.journals;
  assert.deepEqual(h.provider.getStatus(), { available: false, label: "Journals", selection: "journals", state: "unavailable", message: "provider.selectedUnavailable" });
  assert.equal(h.provider.getDate(h.source), null);
  await assert.rejects(h.provider.resolve(h.source), /provider.selectedUnavailable/);
  await assert.rejects(context.getOrCreate(moment()), /providerUnavailable/);
  assert.deepEqual(h.calls, []);
  h.app.plugins.plugins.journals = { api: h.api };
  assert.deepEqual(h.provider.getStatus(), { available: true, label: "Journals", selection: "journals", state: "available", message: "provider.active" });
  await h.move("next");
  assert.deepEqual(h.calls[0], ["Work", "2026-09-23"]);
});

test("an incompatible Journals API is unavailable, and automatic mode can use another provider", async () => {
  const h = setup({ daily: "2020-01-01" });
  h.api.apiVersion = 2;
  await assert.rejects(h.provider.resolve(h.source), /provider.selectedUnsupported/);
  h.select("auto");
  await h.move("next");
  assert.deepEqual(h.calls[0], ["daily", "2020-01-02"]);
});

test("automatic selection without any available provider reports a dependency problem", async () => {
  const h = setup();
  delete h.app.plugins.plugins.journals;
  h.select("auto");
  await assert.rejects(h.provider.resolve(h.source), /provider.noneAvailable/);
});


test("Journals distinguishes absent, disabled, incompatible and ready installations", async () => {
  const h = setup();
  const adapter = h.providers[0];
  delete h.app.plugins.plugins.journals;
  assert.equal(adapter.getState(h.app), "unavailable");
  h.app.plugins.manifests = { journals: { version: "3.5.1" } };
  assert.equal(adapter.getState(h.app), "disabled");
  assert.equal(h.provider.getStatus().message, "provider.selectedDisabled");
  await assert.rejects(h.provider.resolve(h.source), /provider.selectedDisabled/);
  h.app.plugins.plugins.journals = {};
  assert.equal(adapter.getState(h.app), "unsupported");
  assert.equal(h.provider.getStatus().message, "provider.selectedUnsupported");
  h.app.plugins.plugins.journals.api = h.api;
  assert.equal(adapter.getState(h.app), "available");
  await h.move("next");
  assert.deepEqual(h.calls[0], ["Work", "2026-09-23"]);
});

test("the bundled Daily Notes capability is disabled rather than unavailable", () => {
  const h = setup();
  h.select("daily-notes");
  assert.equal(h.providers[1].getState(h.app), "disabled");
  assert.equal(h.provider.getStatus().message, "provider.selectedDisabled");
  const enabled = setup({ daily: "2026-09-22" });
  assert.equal(enabled.providers[1].getState(enabled.app), "available");
});
