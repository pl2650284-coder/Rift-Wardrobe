import { createHash } from "node:crypto";

function integerId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveIntegerId(value) {
  const parsed = integerId(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function firstIntegerId(...values) {
  for (const value of values) {
    const parsed = integerId(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function stableSessionValue(session, localPlayerCellId) {
  return session.gameId
    ?? session.gameSessionId
    ?? session.id
    ?? session.chatDetails?.multiUserChatId
    ?? `cell:${localPlayerCellId ?? "unknown"}`;
}

function sessionFingerprint(session, localPlayerCellId) {
  return createHash("sha256")
    .update(String(stableSessionValue(session, localPlayerCellId)))
    .digest("hex")
    .slice(0, 16);
}

function explicitAvailability(rawSkin, skinId, pickableSkinIds, isBase) {
  const locked = rawSkin.disabled === true
    || rawSkin.isDisabled === true
    || rawSkin.isLocked === true;
  if (locked) {
    return "locked";
  }

  // The base skin is always usable once the champion itself is selectable.
  // Some Tencent client sessions omit it from pickable-skin-ids.
  if (isBase) {
    return "available";
  }

  if (pickableSkinIds instanceof Set && pickableSkinIds.size > 0) {
    return pickableSkinIds.has(skinId) ? "available" : "locked";
  }

  const available = rawSkin.isOwned === true
    || rawSkin.owned === true
    || rawSkin.ownership?.owned === true
    || rawSkin.isUnlocked === true
    || rawSkin.unlocked === true
    || rawSkin.isGrantedFromBoost === true
    || rawSkin.isRental === true
    || rawSkin.ownership?.rental?.rented === true;

  return available ? "available" : "unknown";
}

export function normalizeSkin(rawSkin, { championId, selectedSkinId, pickableSkinIds } = {}) {
  const id = firstIntegerId(rawSkin.id, rawSkin.skinId, rawSkin.productId);
  if (id === null) {
    return null;
  }

  const skinChampionId = firstIntegerId(rawSkin.championId, rawSkin.champion?.id);
  if (championId !== null && skinChampionId !== null && skinChampionId !== championId) {
    return null;
  }

  const resolvedChampionId = skinChampionId ?? championId;
  const isBase = rawSkin.isBase === true
    || (resolvedChampionId !== null && id === resolvedChampionId * 1000);
  let availability = explicitAvailability(rawSkin, id, pickableSkinIds, isBase);
  if (id === selectedSkinId) {
    availability = "available";
  }

  return Object.freeze({
    id,
    championId: resolvedChampionId,
    name: String(rawSkin.name ?? rawSkin.displayName ?? `Skin ${id}`),
    availability,
    available: availability === "available",
    selected: id === selectedSkinId,
    isBase,
    isChroma: rawSkin.isChroma === true || rawSkin.chromaPath != null,
    parentSkinId: firstIntegerId(rawSkin.parentSkinId),
  });
}

export function createInactiveSnapshot(phase) {
  return Object.freeze({
    active: false,
    phase,
    contextId: null,
    championId: null,
    selectedSkinId: null,
    writeEnabled: false,
    writeBlockReason: "outside-champion-select",
    skins: Object.freeze([]),
  });
}

export function createChampSelectSnapshot({
  phase,
  session,
  carouselSkins,
  selectorInfo,
  pickableSkinIds,
  mySelection,
}) {
  if (phase !== "ChampSelect" || !session || typeof session !== "object") {
    return createInactiveSnapshot(phase);
  }

  const localPlayerCellId = integerId(session.localPlayerCellId);
  const localPlayer = Array.isArray(session.myTeam)
    ? session.myTeam.find((member) => integerId(member.cellId) === localPlayerCellId)
    : null;

  const championId = [
    selectorInfo?.championId,
    selectorInfo?.selectedChampionId,
    localPlayer?.championId,
    localPlayer?.championPickIntent,
  ].map(positiveIntegerId).find((value) => value !== null) ?? null;
  const selectedSkinCandidates = [
    mySelection?.selectedSkinId,
    selectorInfo?.selectedSkinId,
    localPlayer?.selectedSkinId,
  ];
  const selectedSkinId = selectedSkinCandidates
    .map(positiveIntegerId)
    .find((value) => value !== null)
    ?? firstIntegerId(...selectedSkinCandidates);
  const fingerprint = sessionFingerprint(session, localPlayerCellId);
  const selectorDisabled = selectorInfo?.skinSelectionDisabled === true;
  const selectorHidden = selectorInfo?.showSkinSelector === false;
  const writeBlockReason = championId === null
    ? "champion-not-selected"
    : selectorDisabled
      ? "client-disabled-skin-selection"
      : selectorHidden
        ? "skin-selector-hidden"
        : null;

  const pickableSkinIdSet = Array.isArray(pickableSkinIds)
    ? new Set(pickableSkinIds.map(integerId).filter((id) => id !== null))
    : null;
  const normalizedSkins = (Array.isArray(carouselSkins) ? carouselSkins : [])
    .map((skin) => normalizeSkin(skin, {
      championId,
      selectedSkinId,
      pickableSkinIds: pickableSkinIdSet,
    }))
    .filter(Boolean);
  const uniqueSkins = [...new Map(normalizedSkins.map((skin) => [skin.id, skin])).values()]
    .sort((left, right) => left.id - right.id);

  return Object.freeze({
    active: true,
    phase,
    contextId: `${fingerprint}:${championId ?? "unknown"}`,
    championId,
    selectedSkinId,
    writeEnabled: writeBlockReason === null,
    writeBlockReason,
    skins: Object.freeze(uniqueSkins),
  });
}

export function sameSelectionContext(left, right) {
  return Boolean(
    left?.active
    && right?.active
    && left.contextId
    && left.contextId === right.contextId
    && left.championId === right.championId,
  );
}
