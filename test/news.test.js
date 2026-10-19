import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const nativeSnapshot = JSON.parse(readFileSync(new URL("./fixtures/news-data.json", import.meta.url), "utf8"));

function compile(relativePath) {
  return ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function evaluate(code, imports) {
  const exports = {};
  const require = (name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  };
  new Function("exports", "require", "window", code)(exports, require, { setTimeout });
  return exports;
}

const demoData = evaluate(compile("../ui/src/data/mock.ts"), {});
const serviceCode = compile("../ui/src/services/mock.ts");

function service(invoke) {
  return evaluate(serviceCode, {
    "@tauri-apps/api/core": { invoke },
    "../data/mock": demoData,
  });
}

test("news accepts the Rust IPC contract with metadata, null rates and combos intact", async () => {
  const { getNewsData } = service(async (command) => {
    assert.equal(command, "get_news_data");
    return structuredClone(nativeSnapshot);
  });
  assert.deepEqual(await getNewsData(true), nativeSnapshot);
});

test("news shares concurrent native requests, isolates callers and refreshes on demand", async () => {
  let calls = 0;
  const { getNewsData } = service(async () => {
    calls += 1;
    return structuredClone(nativeSnapshot);
  });
  const [first, second] = await Promise.all([getNewsData(true), getNewsData(true)]);
  assert.equal(calls, 1);
  first.meta.warnings.push("local change");
  first.champions[0].name = "local change";
  assert.deepEqual(second, nativeSnapshot);
  assert.deepEqual(await getNewsData(true), nativeSnapshot);
  assert.equal(calls, 1);
  assert.deepEqual(await getNewsData(true, true), nativeSnapshot);
  assert.equal(calls, 2);
});

test("legacy flat IPC metadata is rejected before it can corrupt page state and can be retried", async () => {
  let calls = 0;
  const { meta, ...lists } = nativeSnapshot;
  const { getNewsData } = service(async () => ++calls === 1
    ? { ...lists, ...meta }
    : structuredClone(nativeSnapshot));
  await assert.rejects(getNewsData(true), /游戏资讯数据格式不兼容/);
  assert.deepEqual(await getNewsData(true), nativeSnapshot);
  assert.equal(calls, 2);
});

test("news recovers after a rejected native request without caching the error", async () => {
  let calls = 0;
  const { getNewsData } = service(async () => {
    if (++calls === 1) throw new Error("connection failed");
    return structuredClone(nativeSnapshot);
  });
  await assert.rejects(getNewsData(true), /connection failed/);
  assert.deepEqual(await getNewsData(true), nativeSnapshot);
});

test("unavailable native news keeps warnings and does not fall back to demo statistics", async () => {
  const unavailable = {
    champions: [], augments: [], combos: [],
    meta: { ...nativeSnapshot.meta, patch: null, statsSource: null, source: "unavailable", warnings: ["网络请求失败"] },
  };
  const { getNewsData } = service(async () => unavailable);
  assert.deepEqual(await getNewsData(true), unavailable);
});

test("browser preview remains explicitly marked as demo and never invokes native commands", async () => {
  const { getNewsData } = service(async () => assert.fail("Unexpected native command"));
  const result = await getNewsData();
  assert.equal(result.meta.source, "demo");
  assert.ok(result.champions.length > 0);
  assert.ok(result.augments.length > 0);
});
