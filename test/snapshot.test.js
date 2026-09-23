import assert from "node:assert/strict";
import test from "node:test";

import {
  createChampSelectSnapshot,
  createInactiveSnapshot,
  sameSelectionContext,
} from "../src/core/champ-select/snapshot.js";

function fixture({ championId = 22, selectedSkinId = 22001, gameId = "game-1" } = {}) {
  return createChampSelectSnapshot({
    phase: "ChampSelect",
    session: {
      gameId,
      localPlayerCellId: 3,
      myTeam: [{ cellId: 3, championId, selectedSkinId }],
    },
    selectorInfo: {
      championId,
      selectedSkinId,
      showSkinSelector: true,
      skinSelectionDisabled: false,
    },
    carouselSkins: [
      { id: 22000, championId, name: "Classic", isBase: true },
      { id: 22001, championId, name: "Owned", isOwned: true },
      { id: 22002, championId, name: "Locked", isOwned: false, isLocked: true },
      { id: 99001, championId: 99, name: "Other champion", isOwned: true },
    ],
  });
}

test("creates a minimal inactive snapshot outside champion select", () => {
  const snapshot = createInactiveSnapshot("Lobby");
  assert.equal(snapshot.active, false);
  assert.equal(snapshot.phase, "Lobby");
  assert.deepEqual(snapshot.skins, []);
});

test("normalizes only the current champion skins", () => {
  const snapshot = fixture();

  assert.equal(snapshot.active, true);
  assert.equal(snapshot.championId, 22);
  assert.equal(snapshot.selectedSkinId, 22001);
  assert.equal(snapshot.writeEnabled, true);
  assert.deepEqual(snapshot.skins.map((skin) => skin.id), [22000, 22001, 22002]);
  assert.equal(snapshot.skins.find((skin) => skin.id === 22000).available, true);
  assert.equal(snapshot.skins.find((skin) => skin.id === 22001).selected, true);
  assert.equal(snapshot.skins.find((skin) => skin.id === 22002).available, false);
});

test("honors the client skin selection disabled signal", () => {
  const snapshot = createChampSelectSnapshot({
    phase: "ChampSelect",
    session: {
      gameId: "game-1",
      localPlayerCellId: 3,
      myTeam: [{ cellId: 3, championId: 22, selectedSkinId: 22000 }],
    },
    selectorInfo: {
      selectedChampionId: 22,
      selectedSkinId: 22000,
      showSkinSelector: true,
      skinSelectionDisabled: true,
    },
    carouselSkins: [{ id: 22000, championId: 22, isBase: true }],
  });

  assert.equal(snapshot.active, true);
  assert.equal(snapshot.writeEnabled, false);
  assert.equal(snapshot.writeBlockReason, "client-disabled-skin-selection");
});

test("uses pickable IDs for eligibility and my-selection for read-back", () => {
  const snapshot = createChampSelectSnapshot({
    phase: "ChampSelect",
    session: {
      gameId: "game-1",
      localPlayerCellId: 3,
      myTeam: [{ cellId: 3, championId: 22, selectedSkinId: 22000 }],
    },
    selectorInfo: {
      championId: 22,
      selectedSkinId: 22000,
      showSkinSelector: true,
      skinSelectionDisabled: false,
    },
    mySelection: { selectedSkinId: 22001 },
    pickableSkinIds: [22000, 22001],
    carouselSkins: [
      { id: 22000, championId: 22, name: "Classic", isBase: true },
      { id: 22001, championId: 22, name: "Pickable without ownership metadata" },
      { id: 22002, championId: 22, name: "Owned but not pickable", isOwned: true },
    ],
  });

  assert.equal(snapshot.selectedSkinId, 22001);
  assert.equal(snapshot.skins.find((skin) => skin.id === 22001).available, true);
  assert.equal(snapshot.skins.find((skin) => skin.id === 22002).available, false);
});

test("keeps a base skin available when pickable IDs omit it", () => {
  const snapshot = createChampSelectSnapshot({
    phase: "ChampSelect",
    session: {
      gameId: "game-1",
      localPlayerCellId: 3,
      myTeam: [{ cellId: 3, championId: 67, selectedSkinId: 67064 }],
    },
    selectorInfo: {
      championId: 67,
      selectedSkinId: 67064,
      showSkinSelector: true,
      skinSelectionDisabled: false,
    },
    pickableSkinIds: [67064],
    carouselSkins: [
      { id: 67000, championId: 67, name: "Vayne" },
      { id: 67064, championId: 67, name: "Owned", isOwned: true },
    ],
  });

  const baseSkin = snapshot.skins.find((skin) => skin.id === 67000);
  assert.equal(baseSkin.isBase, true);
  assert.equal(baseSkin.available, true);
});

test("falls back to explicit ownership when pickable IDs are temporarily empty", () => {
  const snapshot = createChampSelectSnapshot({
    phase: "ChampSelect",
    session: {
      gameId: "game-1",
      localPlayerCellId: 3,
      myTeam: [{ cellId: 3, championId: 67, selectedSkinId: 67000 }],
    },
    selectorInfo: {
      championId: 67,
      selectedSkinId: 67000,
      showSkinSelector: true,
      skinSelectionDisabled: false,
    },
    pickableSkinIds: [],
    carouselSkins: [
      { id: 67000, championId: 67, name: "Vayne" },
      { id: 67064, championId: 67, name: "Owned", ownership: { owned: true } },
      { id: 67067, championId: 67, name: "Locked", ownership: { owned: false } },
    ],
  });

  assert.equal(snapshot.skins.find((skin) => skin.id === 67064).available, true);
  assert.equal(snapshot.skins.find((skin) => skin.id === 67067).available, false);
});

test("selection context changes when the champion or session changes", () => {
  const original = fixture();
  const same = fixture();
  const changedChampion = fixture({ championId: 81, selectedSkinId: 81000 });
  const changedSession = fixture({ gameId: "game-2" });

  assert.equal(sameSelectionContext(original, same), true);
  assert.equal(sameSelectionContext(original, changedChampion), false);
  assert.equal(sameSelectionContext(original, changedSession), false);
});
