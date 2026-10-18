import { invoke } from "@tauri-apps/api/core";
import { demoAugments, demoAssistantLogs, demoChampions } from "../data/mock";
import type { AssistantLog, AugmentStat, ChampionStat, NewsData } from "../data/types";

const pause = (milliseconds = 120): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

let nativeNewsData: Promise<NewsData> | null = null;

function demoNewsData(): NewsData {
  return {
    champions: structuredClone(demoChampions),
    augments: structuredClone(demoAugments),
    combos: [],
    meta: {
      patch: null,
      updatedAtMs: Date.now(),
      officialSource: "演示数据",
      statsSource: "演示数据",
      warnings: [],
      source: "demo",
    },
  };
}

export async function getNewsData(native = false, force = false): Promise<NewsData> {
  if (!native) {
    await pause();
    return demoNewsData();
  }
  if (force) nativeNewsData = null;
  if (!nativeNewsData) {
    nativeNewsData = invoke<NewsData>("get_news_data").catch((error) => {
      nativeNewsData = null;
      throw error;
    });
  }
  return structuredClone(await nativeNewsData);
}

export async function getChampionStats(native = false): Promise<ChampionStat[]> {
  return structuredClone((await getNewsData(native)).champions);
}

export async function getAugmentStats(native = false): Promise<AugmentStat[]> {
  return structuredClone((await getNewsData(native)).augments);
}

export async function getAssistantLogs(): Promise<AssistantLog[]> {
  await pause();
  return structuredClone(demoAssistantLogs);
}
