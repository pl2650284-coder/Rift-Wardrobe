import { LcuHttpError, LcuProtocolError } from "../errors.js";
import { createChampSelectSnapshot, createInactiveSnapshot } from "../champ-select/snapshot.js";

const GAMEFLOW_PHASE_ENDPOINT = "/lol-gameflow/v1/gameflow-phase";
const CHAMP_SELECT_SESSION_ENDPOINT = "/lol-champ-select/v1/session";
const SKIN_CAROUSEL_ENDPOINT = "/lol-champ-select/v1/skin-carousel-skins";
const SKIN_SELECTOR_INFO_ENDPOINT = "/lol-champ-select/v1/skin-selector-info";
const PICKABLE_SKIN_IDS_ENDPOINT = "/lol-champ-select/v1/pickable-skin-ids";
const MY_SELECTION_ENDPOINT = "/lol-champ-select/v1/session/my-selection";

function isNotFound(error) {
  return error instanceof LcuHttpError && error.statusCode === 404;
}

export class LcuAdapter {
  constructor(client) {
    this.client = client;
  }

  async getGameflowPhase({ signal } = {}) {
    const phase = await this.client.request(GAMEFLOW_PHASE_ENDPOINT, { signal });
    if (typeof phase !== "string") {
      throw new LcuProtocolError("LCU gameflow phase was not a string.");
    }
    return phase;
  }

  async getChampSelectSession({ signal } = {}) {
    try {
      return await this.client.request(CHAMP_SELECT_SESSION_ENDPOINT, { signal });
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async getSkinCarouselSkins({ signal } = {}) {
    try {
      const skins = await this.client.request(SKIN_CAROUSEL_ENDPOINT, { signal });
      return Array.isArray(skins) ? skins : [];
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
  }

  async getSkinSelectorInfo({ signal } = {}) {
    try {
      const info = await this.client.request(SKIN_SELECTOR_INFO_ENDPOINT, { signal });
      return info && typeof info === "object" ? info : null;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async getPickableSkinIds({ signal } = {}) {
    try {
      const skinIds = await this.client.request(PICKABLE_SKIN_IDS_ENDPOINT, { signal });
      if (!Array.isArray(skinIds)) {
        throw new LcuProtocolError("LCU pickable skin IDs were not an array.");
      }
      return skinIds;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async getMySelection({ signal } = {}) {
    try {
      const selection = await this.client.request(MY_SELECTION_ENDPOINT, { signal });
      return selection && typeof selection === "object" ? selection : null;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async getSnapshot({ signal } = {}) {
    const phase = await this.getGameflowPhase({ signal });
    if (phase !== "ChampSelect") {
      return createInactiveSnapshot(phase);
    }

    const [session, carouselSkins, selectorInfo, pickableSkinIds, mySelection] = await Promise.all([
      this.getChampSelectSession({ signal }),
      this.getSkinCarouselSkins({ signal }),
      this.getSkinSelectorInfo({ signal }),
      this.getPickableSkinIds({ signal }),
      this.getMySelection({ signal }),
    ]);

    if (!session) {
      return createInactiveSnapshot(phase);
    }
    return createChampSelectSnapshot({
      phase,
      session,
      carouselSkins,
      selectorInfo,
      pickableSkinIds,
      mySelection,
    });
  }

  async selectSkin(skinId, { signal } = {}) {
    await this.client.request(MY_SELECTION_ENDPOINT, {
      method: "PATCH",
      body: { selectedSkinId: skinId },
      signal,
    });
  }
}
