import assert from "node:assert/strict";
import test from "node:test";

import { describeCredentialSource, parseLockfile, parseUxLog } from "../src/core/lcu/discovery.js";

test("parseLockfile reads a standard LCU lockfile", () => {
  const credentials = parseLockfile("LeagueClient:1234:4567:temporary-secret:https", {
    sourcePath: "C:\\League\\lockfile",
    installDir: "C:\\League",
  });

  assert.equal(credentials.port, 4567);
  assert.equal(credentials.token, "temporary-secret");
  assert.equal(credentials.protocol, "https");
  assert.equal(credentials.processId, 1234);
  assert.equal(credentials.sourceKind, "lockfile");
});

test("parseLockfile ignores an empty Tencent placeholder", () => {
  assert.equal(parseLockfile(""), null);
  assert.equal(parseLockfile("not:a:valid:lockfile"), null);
});

test("parseUxLog reads Tencent command-line flags", () => {
  const content = [
    "000000.000| OKAY| Command line arguments:",
    "--region=TENCENT --remoting-auth-token=short-lived-token",
    "--app-port=11017 --app-pid=32324",
  ].join(" ");

  const credentials = parseUxLog(content, {
    sourcePath: "G:\\LeagueClient\\current.log",
    installDir: "G:\\LeagueClient",
  });

  assert.equal(credentials.port, 11017);
  assert.equal(credentials.token, "short-lived-token");
  assert.equal(credentials.processId, 32324);
  assert.equal(credentials.sourceKind, "tencent-ux-log");
});

test("credential description excludes the token", () => {
  const credentials = parseLockfile("LeagueClient:1:1234:do-not-expose:https");
  const description = describeCredentialSource(credentials);

  assert.equal(Object.hasOwn(description, "token"), false);
  assert.doesNotMatch(JSON.stringify(description), /do-not-expose/);
});
