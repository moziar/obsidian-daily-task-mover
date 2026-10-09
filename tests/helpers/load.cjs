const { readFileSync } = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Compile the real plugin code, substituting only the supplied dependencies.
function load(relativePath, mocks) {
  const filename = path.join(__dirname, "../..", relativePath);
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

module.exports = { load };
