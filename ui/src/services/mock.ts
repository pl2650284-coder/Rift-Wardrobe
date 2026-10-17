import { demoAugments, demoAssistantLogs, demoChampions } from "../data/mock";
import type { AssistantLog, AugmentStat, ChampionStat } from "../data/types";

const pause = (milliseconds = 120): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function getChampionStats(): Promise<ChampionStat[]> {
  await pause();
  return structuredClone(demoChampions);
}

export async function getAugmentStats(): Promise<AugmentStat[]> {
  await pause();
  return structuredClone(demoAugments);
}

export async function getAssistantLogs(): Promise<AssistantLog[]> {
  await pause();
  return structuredClone(demoAssistantLogs);
}
