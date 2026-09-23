#!/usr/bin/env node

import process from "node:process";

import { SkinSelectionService } from "./core/champ-select/selection-service.js";
import { SelectionError } from "./core/errors.js";
import { LcuAdapter } from "./core/lcu/adapter.js";
import { LcuClient } from "./core/lcu/client.js";
import { describeCredentialSource, discoverLcuCredentials } from "./core/lcu/discovery.js";

const PHASE_LABELS = {
  None: "客户端空闲",
  Lobby: "房间中",
  Matchmaking: "匹配中",
  ReadyCheck: "等待接受",
  ChampSelect: "英雄选择",
  InProgress: "游戏中",
  PreEndOfGame: "游戏即将结束",
  EndOfGame: "结算界面",
};

function printHelp() {
  console.log(`英雄联盟助手 M0 - 国服 LCU 可行性探针

用法:
  node src/cli.js doctor [--install-dir <path>]
  node src/cli.js status [--install-dir <path>]
  node src/cli.js watch [--interval <ms>] [--install-dir <path>]
  node src/cli.js skins [--install-dir <path>]
  node src/cli.js apply <skin-id> --yes [--champion <champion-id>]

命令:
  doctor  检查客户端发现、连接和只读端点
  status  显示当前游戏阶段与安全的选人摘要
  watch   低频观察进入/离开选人及英雄变化，不执行写操作
  skins   列出当前英雄的皮肤以及客户端明确返回的可用状态
  apply   写入一次皮肤选择并读取客户端状态验证；必须显式提供 --yes

安全边界:
  工具不会打印或保存 LCU Token。apply 不会自动重试写请求。
`);
}

function parseArguments(argv) {
  const options = {
    command: null,
    positionals: [],
    installDir: undefined,
    intervalMs: 1000,
    confirmed: false,
    championId: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--yes") {
      options.confirmed = true;
    } else if (argument === "--help" || argument === "-h") {
      options.command = "help";
    } else if (argument === "--install-dir") {
      options.installDir = argv[++index];
    } else if (argument.startsWith("--install-dir=")) {
      options.installDir = argument.slice("--install-dir=".length);
    } else if (argument === "--interval") {
      options.intervalMs = Number(argv[++index]);
    } else if (argument.startsWith("--interval=")) {
      options.intervalMs = Number(argument.slice("--interval=".length));
    } else if (argument === "--champion") {
      options.championId = Number(argv[++index]);
    } else if (argument.startsWith("--champion=")) {
      options.championId = Number(argument.slice("--champion=".length));
    } else if (argument.startsWith("--")) {
      throw new Error(`未知参数: ${argument}`);
    } else if (!options.command) {
      options.command = argument;
    } else {
      options.positionals.push(argument);
    }
  }

  options.command ??= "help";
  if (options.installDir === "") {
    throw new Error("--install-dir 不能为空。");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 500 || options.intervalMs > 30_000) {
    throw new Error("--interval 必须在 500 到 30000 毫秒之间。");
  }
  if (options.championId !== undefined && (!Number.isInteger(options.championId) || options.championId <= 0)) {
    throw new Error("--champion 必须是正整数。");
  }
  return options;
}

async function openAdapter(options) {
  const credentials = await discoverLcuCredentials({ installDir: options.installDir });
  const client = new LcuClient(credentials);
  return {
    adapter: new LcuAdapter(client),
    client,
    source: describeCredentialSource(credentials),
  };
}

function phaseLabel(phase) {
  return PHASE_LABELS[phase] ? `${PHASE_LABELS[phase]} (${phase})` : phase;
}

function printSnapshot(snapshot) {
  console.log(`游戏阶段: ${phaseLabel(snapshot.phase)}`);
  if (!snapshot.active) {
    console.log("选人会话: 未激活");
    return;
  }

  const availableCount = snapshot.skins.filter((skin) => skin.available).length;
  console.log("选人会话: 已激活");
  console.log(`当前英雄 ID: ${snapshot.championId ?? "尚未确定"}`);
  console.log(`当前皮肤 ID: ${snapshot.selectedSkinId ?? "尚未确定"}`);
  console.log(`皮肤写入: ${snapshot.writeEnabled ? "客户端允许" : `已禁用 (${snapshot.writeBlockReason})`}`);
  console.log(`皮肤数据: ${snapshot.skins.length} 个，其中 ${availableCount} 个明确可用`);
}

function connectionSourceLabel(source) {
  if (source.kind === "tencent-ux-log") {
    return "国服 LeagueClientUx 日志";
  }
  if (source.kind === "lockfile") {
    return "LCU lockfile";
  }
  return "环境变量";
}

async function doctor(options) {
  const connection = await openAdapter(options);
  try {
    console.log(`Node.js: ${process.version}`);
    console.log(`客户端发现: 成功 (${connectionSourceLabel(connection.source)})`);
    console.log(`本地端口: ${connection.source.port}`);
    if (connection.source.installDir) {
      console.log(`客户端目录: ${connection.source.installDir}`);
    }

    const phase = await connection.adapter.getGameflowPhase();
    await Promise.all([
      connection.adapter.getSkinCarouselSkins(),
      connection.adapter.getSkinSelectorInfo(),
    ]);
    console.log("LCU 只读连接: 成功");
    console.log(`当前阶段: ${phaseLabel(phase)}`);
    console.log("皮肤端点: 可访问；完整数据需进入英雄选择后验证");
  } finally {
    connection.client.close();
  }
}

async function status(options) {
  const connection = await openAdapter(options);
  try {
    const snapshot = await connection.adapter.getSnapshot();
    printSnapshot(snapshot);
  } finally {
    connection.client.close();
  }
}

function snapshotSignature(snapshot) {
  return JSON.stringify({
    phase: snapshot.phase,
    contextId: snapshot.contextId,
    championId: snapshot.championId,
    selectedSkinId: snapshot.selectedSkinId,
    writeEnabled: snapshot.writeEnabled,
    writeBlockReason: snapshot.writeBlockReason,
    skinCount: snapshot.skins.length,
    availableCount: snapshot.skins.filter((skin) => skin.available).length,
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function watch(options) {
  let stopped = false;
  let connection = null;
  let previousSignature = null;
  let wasDisconnected = false;

  process.once("SIGINT", () => {
    stopped = true;
    console.log("\n正在停止观察...");
  });

  console.log(`开始只读观察，校准间隔 ${options.intervalMs}ms。按 Ctrl+C 停止。`);
  while (!stopped) {
    try {
      connection ??= await openAdapter(options);
      const snapshot = await connection.adapter.getSnapshot();
      const signature = snapshotSignature(snapshot);
      if (wasDisconnected) {
        console.log(`[${new Date().toLocaleTimeString()}] 客户端已重新连接`);
        wasDisconnected = false;
      }
      if (signature !== previousSignature) {
        console.log(`\n[${new Date().toLocaleTimeString()}] 状态变化`);
        printSnapshot(snapshot);
        previousSignature = signature;
      }
    } catch {
      if (!wasDisconnected) {
        console.log(`[${new Date().toLocaleTimeString()}] 客户端不可用，等待重新发现`);
        wasDisconnected = true;
      }
      connection?.client.close();
      connection = null;
      previousSignature = null;
    }
    if (!stopped) {
      await wait(options.intervalMs);
    }
  }
  connection?.client.close();
}

async function skins(options) {
  const connection = await openAdapter(options);
  try {
    const snapshot = await connection.adapter.getSnapshot();
    printSnapshot(snapshot);
    if (!snapshot.active || snapshot.championId === null) {
      process.exitCode = 2;
      return;
    }
    if (snapshot.skins.length === 0) {
      console.log("客户端尚未返回皮肤列表。请先锁定或选中英雄后重试。");
      process.exitCode = 2;
      return;
    }

    console.log("\n状态  皮肤 ID   名称");
    for (const skin of snapshot.skins) {
      const state = skin.selected ? "当前" : skin.available ? "可用" : "锁定";
      console.log(`${state.padEnd(4)}  ${String(skin.id).padEnd(9)} ${skin.name}`);
    }
  } finally {
    connection.client.close();
  }
}

async function applySkin(options) {
  const skinId = Number(options.positionals[0]);
  if (!Number.isInteger(skinId) || skinId < 0) {
    throw new Error("apply 需要一个有效的 skin-id。");
  }
  if (!options.confirmed) {
    console.log("未执行写操作。确认目标后追加 --yes；工具仍会在发送前复核英雄和使用资格。");
    process.exitCode = 2;
    return;
  }

  const connection = await openAdapter(options);
  try {
    const service = new SkinSelectionService(connection.adapter);
    const result = await service.apply(skinId, { expectedChampionId: options.championId });
    if (result.status === "success") {
      console.log(`应用成功并已读回确认: 英雄 ${result.championId}, 皮肤 ${result.skinId}`);
      return;
    }
    if (result.status === "failed") {
      console.log(`客户端明确拒绝了皮肤 ${result.skinId}: ${result.reason}`);
    } else if (result.status === "stale") {
      console.log("选人状态已变化，旧操作结果已丢弃。");
    } else {
      console.log("请求结果未确认。工具没有自动重试，请以游戏客户端当前显示为准。");
    }
    process.exitCode = 3;
  } finally {
    connection.client.close();
  }
}

function safeErrorMessage(error) {
  if (error instanceof SelectionError) {
    return `${error.code}: ${error.message}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(--(?:remoting|riotclient)-auth-token(?:=|\s+))[^\s]+/gi, "$1<redacted>")
    .replace(/(LCU_AUTH_TOKEN\s*[=:]\s*)[^\s]+/gi, "$1<redacted>")
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic <redacted>");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  switch (options.command) {
    case "help":
      printHelp();
      break;
    case "doctor":
      await doctor(options);
      break;
    case "status":
      await status(options);
      break;
    case "watch":
      await watch(options);
      break;
    case "skins":
      await skins(options);
      break;
    case "apply":
      await applySkin(options);
      break;
    default:
      throw new Error(`未知命令: ${options.command}`);
  }
}

main().catch((error) => {
  console.error(`错误: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
