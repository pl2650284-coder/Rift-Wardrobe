import assert from "node:assert/strict";
import test from "node:test";

import { SkinSelectionService } from "../src/core/champ-select/selection-service.js";
import { LcuNetworkError, SelectionError } from "../src/core/errors.js";

function snapshot({
  contextId = "session-1:22",
  championId = 22,
  selectedSkinId = 22000,
  targetAvailable = true,
  active = true,
  writeEnabled = true,
} = {}) {
  return {
    active,
    phase: active ? "ChampSelect" : "Lobby",
    contextId: active ? contextId : null,
    championId: active ? championId : null,
    selectedSkinId: active ? selectedSkinId : null,
    writeEnabled: active && writeEnabled,
    writeBlockReason: active && !writeEnabled ? "client-disabled-skin-selection" : null,
    skins: active
      ? [{ id: 22001, available: targetAvailable, availability: targetAvailable ? "available" : "locked" }]
      : [],
  };
}

class FakeAdapter {
  constructor(snapshots, { selectError = null, selectWait = null } = {}) {
    this.snapshots = [...snapshots];
    this.lastSnapshot = snapshots.at(-1);
    this.selectError = selectError;
    this.selectWait = selectWait;
    this.writes = [];
  }

  async getSnapshot() {
    const next = this.snapshots.shift() ?? this.lastSnapshot;
    this.lastSnapshot = next;
    return next;
  }

  async selectSkin(skinId) {
    this.writes.push(skinId);
    if (this.selectWait) {
      await this.selectWait;
    }
    if (this.selectError) {
      throw this.selectError;
    }
  }
}

test("writes once and reports success only after reading the target skin", async () => {
  const adapter = new FakeAdapter([
    snapshot(),
    snapshot(),
    snapshot({ selectedSkinId: 22001 }),
  ]);
  const service = new SkinSelectionService(adapter, { verificationDelaysMs: [0] });

  const result = await service.apply(22001, { expectedChampionId: 22 });

  assert.equal(result.status, "success");
  assert.deepEqual(adapter.writes, [22001]);
});

test("never writes a skin not explicitly marked available", async () => {
  const adapter = new FakeAdapter([snapshot({ targetAvailable: false })]);
  const service = new SkinSelectionService(adapter, { verificationDelaysMs: [0] });

  await assert.rejects(
    service.apply(22001),
    (error) => error instanceof SelectionError && error.code === "SKIN_NOT_AVAILABLE",
  );
  assert.deepEqual(adapter.writes, []);
});

test("never writes when the client disables skin selection", async () => {
  const adapter = new FakeAdapter([snapshot({ writeEnabled: false })]);
  const service = new SkinSelectionService(adapter, { verificationDelaysMs: [0] });

  await assert.rejects(
    service.apply(22001),
    (error) => error instanceof SelectionError && error.code === "SKIN_SELECTION_DISABLED",
  );
  assert.deepEqual(adapter.writes, []);
});

test("cancels before sending when the champion context changes", async () => {
  const adapter = new FakeAdapter([
    snapshot(),
    snapshot({ contextId: "session-1:81", championId: 81 }),
  ]);
  const service = new SkinSelectionService(adapter, { verificationDelaysMs: [0] });

  await assert.rejects(
    service.apply(22001),
    (error) => error instanceof SelectionError && error.code === "SESSION_CHANGED",
  );
  assert.deepEqual(adapter.writes, []);
});

test("a network error is not retried, but a read-back can still confirm success", async () => {
  const adapter = new FakeAdapter(
    [snapshot(), snapshot(), snapshot({ selectedSkinId: 22001 })],
    { selectError: new LcuNetworkError("connection closed") },
  );
  const service = new SkinSelectionService(adapter, { verificationDelaysMs: [0] });

  const result = await service.apply(22001);

  assert.equal(result.status, "success");
  assert.deepEqual(adapter.writes, [22001]);
});

test("returns unknown without repeating an unconfirmed write", async () => {
  const adapter = new FakeAdapter([snapshot(), snapshot(), snapshot()]);
  const service = new SkinSelectionService(adapter, { verificationDelaysMs: [0] });

  const result = await service.apply(22001);

  assert.equal(result.status, "unknown");
  assert.deepEqual(adapter.writes, [22001]);
});

test("rejects a second write while the first is in progress", async () => {
  let releaseWrite;
  const selectWait = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  const adapter = new FakeAdapter(
    [snapshot(), snapshot(), snapshot({ selectedSkinId: 22001 })],
    { selectWait },
  );
  const service = new SkinSelectionService(adapter, { verificationDelaysMs: [0] });

  const first = service.apply(22001);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    service.apply(22001),
    (error) => error instanceof SelectionError && error.code === "WRITE_IN_PROGRESS",
  );
  releaseWrite();
  assert.equal((await first).status, "success");
  assert.deepEqual(adapter.writes, [22001]);
});
