import { LcuHttpError, SelectionError } from "../errors.js";
import { sameSelectionContext } from "./snapshot.js";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function targetFromSnapshot(snapshot, skinId) {
  return snapshot.skins.find((skin) => skin.id === skinId) ?? null;
}

function isDefinitiveClientRejection(error) {
  return error instanceof LcuHttpError
    && error.statusCode >= 400
    && error.statusCode < 500
    && ![408, 409, 425, 429].includes(error.statusCode);
}

export class SkinSelectionService {
  constructor(adapter, { verificationDelaysMs = [0, 150, 250, 400, 600], sleep = delay } = {}) {
    this.adapter = adapter;
    this.verificationDelaysMs = verificationDelaysMs;
    this.sleep = sleep;
    this.inFlight = null;
  }

  async apply(skinId, { expectedChampionId } = {}) {
    const parsedSkinId = Number(skinId);
    if (!Number.isInteger(parsedSkinId) || parsedSkinId < 0) {
      throw new SelectionError("INVALID_SKIN_ID", "Skin ID must be a non-negative integer.");
    }
    if (this.inFlight) {
      throw new SelectionError("WRITE_IN_PROGRESS", "Another skin selection is still in progress.");
    }

    const operation = this.#applyOnce(parsedSkinId, { expectedChampionId });
    this.inFlight = operation;
    try {
      return await operation;
    } finally {
      if (this.inFlight === operation) {
        this.inFlight = null;
      }
    }
  }

  async #applyOnce(skinId, { expectedChampionId }) {
    const initial = await this.adapter.getSnapshot();
    if (!initial.active || initial.championId === null) {
      throw new SelectionError("NOT_IN_CHAMP_SELECT", "The client is not in an actionable champion select session.");
    }
    if (!initial.writeEnabled) {
      throw new SelectionError(
        "SKIN_SELECTION_DISABLED",
        `The League client disabled skin selection (${initial.writeBlockReason ?? "unknown reason"}).`,
      );
    }
    if (expectedChampionId !== undefined && Number(expectedChampionId) !== initial.championId) {
      throw new SelectionError("CHAMPION_CHANGED", "The selected champion no longer matches the expected champion.");
    }

    const initialTarget = targetFromSnapshot(initial, skinId);
    if (!initialTarget?.available) {
      throw new SelectionError("SKIN_NOT_AVAILABLE", "The client did not explicitly mark this skin as available.");
    }

    const beforeSend = await this.adapter.getSnapshot();
    if (!sameSelectionContext(initial, beforeSend)) {
      throw new SelectionError("SESSION_CHANGED", "Champion select changed before the request could be sent.");
    }
    if (!beforeSend.writeEnabled) {
      throw new SelectionError(
        "SKIN_SELECTION_DISABLED",
        `The League client disabled skin selection (${beforeSend.writeBlockReason ?? "unknown reason"}).`,
      );
    }
    if (!targetFromSnapshot(beforeSend, skinId)?.available) {
      throw new SelectionError("SKIN_NOT_AVAILABLE", "The skin is no longer available in the current session.");
    }

    let sendError = null;
    try {
      await this.adapter.selectSkin(skinId);
    } catch (error) {
      sendError = error;
    }

    const delays = isDefinitiveClientRejection(sendError)
      ? [0]
      : this.verificationDelaysMs;
    let lastReadError = null;

    for (const waitMs of delays) {
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }
      try {
        const verified = await this.adapter.getSnapshot();
        if (!sameSelectionContext(beforeSend, verified)) {
          return { status: "stale", skinId, reason: "selection-context-changed" };
        }
        if (verified.selectedSkinId === skinId) {
          return { status: "success", skinId, championId: verified.championId };
        }
      } catch (error) {
        lastReadError = error;
      }
    }

    if (isDefinitiveClientRejection(sendError)) {
      return { status: "failed", skinId, reason: `http-${sendError.statusCode}` };
    }
    return {
      status: "unknown",
      skinId,
      reason: sendError ? "send-result-unknown" : lastReadError ? "verification-unavailable" : "not-observed",
    };
  }
}
