import { execFile } from "node:child_process";
import { open, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { DiscoveryError } from "../errors.js";

const execFileAsync = promisify(execFile);
const MAX_LOG_PREFIX_BYTES = 128 * 1024;

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return port;
}

function makeCredentials({ port, token, protocol = "https", processId, sourceKind, sourcePath, installDir }) {
  if (!port || typeof token !== "string" || token.length === 0) {
    return null;
  }

  return Object.freeze({
    port,
    token,
    protocol: protocol === "http" ? "http" : "https",
    processId: Number.isInteger(processId) ? processId : null,
    sourceKind,
    sourcePath,
    installDir,
  });
}

export function parseLockfile(content, metadata = {}) {
  const value = content.trim();
  if (!value) {
    return null;
  }

  const parts = value.split(":");
  if (parts.length < 5) {
    return null;
  }

  const [processName, processIdValue, portValue, token, protocol] = parts;
  const port = parsePort(portValue);
  const processId = Number(processIdValue);
  if (!processName || !port || !token || !["http", "https"].includes(protocol)) {
    return null;
  }

  return makeCredentials({
    port,
    token,
    protocol,
    processId: Number.isInteger(processId) ? processId : null,
    sourceKind: "lockfile",
    ...metadata,
  });
}

function readFlag(text, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`--${escapedName}(?:=|\\s+)(?:"([^"]+)"|([^\\s"]+))`));
  return match?.[1] ?? match?.[2] ?? null;
}

export function parseUxLog(content, metadata = {}) {
  const port = parsePort(readFlag(content, "app-port"));
  const token = readFlag(content, "remoting-auth-token");
  const processIdValue = Number(readFlag(content, "app-pid"));
  const protocol = readFlag(content, "app-protocol") ?? "https";

  return makeCredentials({
    port,
    token,
    protocol,
    processId: Number.isInteger(processIdValue) ? processIdValue : null,
    sourceKind: "tencent-ux-log",
    ...metadata,
  });
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readPrefix(filePath) {
  const file = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(MAX_LOG_PREFIX_BYTES);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await file.close();
  }
}

async function registryInstallDirectories() {
  if (process.platform !== "win32") {
    return [];
  }

  const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$keys = @(
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\英雄联盟',
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\英雄联盟'
)
$paths = foreach ($key in $keys) {
  $item = Get-ItemProperty -LiteralPath $key
  if ($item.InstallSource) { $item.InstallSource }
  if ($item.InstallLocation) { $item.InstallLocation }
}
@($paths | Where-Object { $_ } | Sort-Object -Unique) | ConvertTo-Json -Compress
`;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", timeout: 3000, windowsHide: true },
    );
    const parsed = JSON.parse(stdout.replace(/^\uFEFF/, "").trim() || "[]");
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function expandInstallDirectory(candidate) {
  const normalized = path.resolve(candidate);
  const directories = [normalized];
  if (path.basename(normalized).toLowerCase() !== "leagueclient") {
    directories.push(path.join(normalized, "LeagueClient"));
  }
  return directories;
}

function commonInstallDirectories() {
  if (process.platform !== "win32") {
    return [];
  }

  const directories = [];
  for (const drive of ["C", "D", "E", "F", "G"]) {
    directories.push(`${drive}:\\Riot Games\\League of Legends`);
    directories.push(`${drive}:\\WeGameApps\\英雄联盟\\LeagueClient`);
  }
  return directories;
}

async function candidateInstallDirectories(explicitInstallDir, environment) {
  const rawCandidates = [
    explicitInstallDir,
    environment.LEAGUE_INSTALL_DIR,
    ...(await registryInstallDirectories()),
    ...commonInstallDirectories(),
  ].filter(Boolean);

  const unique = new Map();
  for (const candidate of rawCandidates) {
    for (const expanded of expandInstallDirectory(candidate)) {
      unique.set(expanded.toLowerCase(), expanded);
    }
  }

  const existing = [];
  for (const candidate of unique.values()) {
    if (await pathExists(candidate)) {
      existing.push(candidate);
    }
  }
  return existing;
}

async function credentialsFromLockfile(installDir) {
  const lockfilePath = path.join(installDir, "lockfile");
  try {
    const content = await readFile(lockfilePath, "utf8");
    return parseLockfile(content, {
      sourcePath: lockfilePath,
      installDir,
    });
  } catch {
    return null;
  }
}

async function credentialsFromTencentLogs(installDir) {
  let entries;
  try {
    entries = await readdir(installDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/_LeagueClientUx\.log$/i.test(entry.name)) {
      continue;
    }
    const filePath = path.join(installDir, entry.name);
    try {
      const details = await stat(filePath);
      candidates.push({ filePath, modifiedAt: details.mtimeMs });
    } catch {
      // A log can disappear while the client rotates it.
    }
  }

  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  for (const candidate of candidates.slice(0, 10)) {
    try {
      const content = await readPrefix(candidate.filePath);
      const credentials = parseUxLog(content, {
        sourcePath: candidate.filePath,
        installDir,
      });
      if (credentials) {
        return credentials;
      }
    } catch {
      // Continue to an older log when a current file is temporarily locked.
    }
  }
  return null;
}

function credentialsFromEnvironment(environment) {
  const portValue = environment.LCU_PORT;
  const token = environment.LCU_AUTH_TOKEN;
  if (!portValue && !token) {
    return null;
  }
  if (!portValue || !token) {
    throw new DiscoveryError("LCU_PORT and LCU_AUTH_TOKEN must be provided together.");
  }

  const port = parsePort(portValue);
  if (!port) {
    throw new DiscoveryError("LCU_PORT is not a valid TCP port.");
  }

  return makeCredentials({
    port,
    token,
    protocol: environment.LCU_PROTOCOL,
    sourceKind: "environment",
    sourcePath: null,
    installDir: null,
  });
}

export async function discoverLcuCredentials({ installDir, environment = process.env } = {}) {
  const environmentCredentials = credentialsFromEnvironment(environment);
  if (environmentCredentials) {
    return environmentCredentials;
  }

  const directories = await candidateInstallDirectories(installDir, environment);
  for (const directory of directories) {
    const lockfileCredentials = await credentialsFromLockfile(directory);
    if (lockfileCredentials) {
      return lockfileCredentials;
    }
  }

  for (const directory of directories) {
    const logCredentials = await credentialsFromTencentLogs(directory);
    if (logCredentials) {
      return logCredentials;
    }
  }

  throw new DiscoveryError(
    "No active LCU credentials were found. Start the CN League client, or set LEAGUE_INSTALL_DIR.",
  );
}

export function describeCredentialSource(credentials) {
  return {
    kind: credentials.sourceKind,
    installDir: credentials.installDir,
    protocol: credentials.protocol,
    port: credentials.port,
  };
}
