import assert from "node:assert/strict";
import test from "node:test";

import { LcuAdapter } from "../src/core/lcu/adapter.js";

class FakeClient {
  constructor(responses) {
    this.responses = responses;
    this.requests = [];
  }

  async request(endpoint, options = {}) {
    this.requests.push({ endpoint, ...options });
    if (!(endpoint in this.responses)) {
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    }
    return this.responses[endpoint];
  }
}

test("builds snapshots from authoritative pickable IDs and my-selection", async () => {
  const client = new FakeClient({
    "/lol-gameflow/v1/gameflow-phase": "ChampSelect",
    "/lol-champ-select/v1/session": {
      gameId: "game-1",
      localPlayerCellId: 3,
      myTeam: [{ cellId: 3, championId: 22, selectedSkinId: 22000 }],
    },
    "/lol-champ-select/v1/skin-carousel-skins": [
      { id: 22000, championId: 22, isBase: true },
      { id: 22001, championId: 22 },
    ],
    "/lol-champ-select/v1/skin-selector-info": {
      championId: 22,
      selectedSkinId: 22000,
      showSkinSelector: true,
      skinSelectionDisabled: false,
    },
    "/lol-champ-select/v1/pickable-skin-ids": [22000, 22001],
    "/lol-champ-select/v1/session/my-selection": { selectedSkinId: 22001 },
  });
  const adapter = new LcuAdapter(client);

  const snapshot = await adapter.getSnapshot();

  assert.equal(snapshot.selectedSkinId, 22001);
  assert.equal(snapshot.skins.find((skin) => skin.id === 22001).available, true);
});

test("sends one PATCH containing only the selected skin ID", async () => {
  const client = new FakeClient({
    "/lol-champ-select/v1/session/my-selection": null,
  });
  const adapter = new LcuAdapter(client);

  await adapter.selectSkin(22001);

  assert.deepEqual(client.requests, [{
    endpoint: "/lol-champ-select/v1/session/my-selection",
    method: "PATCH",
    body: { selectedSkinId: 22001 },
    signal: undefined,
  }]);
});
