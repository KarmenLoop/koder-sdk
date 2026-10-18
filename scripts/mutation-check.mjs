// Plants one known defect at a time, rebuilds, and confirms at least one test suite fails for each.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MUTANTS = [
  ["default preset allows everything", "src/permission.ts", "deny: () => false", "deny: () => true"],
  ["throwing handler lets the edit through", "src/koder.ts", "return { cancel: true };\n        } finally {", "return { accept: true };\n        } finally {"],
  ["question answered with true picks option 0", "src/permission.ts", "Number.isInteger(pick) && pick >= 0", "(pick === true ? (pick = 0, true) : Number.isInteger(pick)) && pick >= 0"],
  ["abort does not release a pending handler", "src/koder.ts", "for (const wake of abortWaiters) wake();", ""],
  ["login requests reach the handler", "src/koder.ts", 'if (pause.kind === "secret" || aborted) return { cancel: true };', "if (aborted) return { cancel: true };"],
  ["readOnly ignored", "src/koder.ts", 'interaction: readOnly ? "ask" : "agent",\n            decide', 'interaction: "agent",\n            decide'],
  ["overlapping sends allowed", "src/koder.ts", 'if (this.busy) throw new KoderSdkError("BUSY", "a turn is still running in this session; await it', 'if (false) throw new KoderSdkError("BUSY", "a turn is still running in this session; await it'],
  ["bridge: client permission silently becomes auto", "src/server.ts", 'setting === "client" ? (request) => ask("permission.request", { runId, request }) : setting', 'setting === "client" ? "auto" : setting'],
  ["bridge: unknown method falls through to prototype", "src/server.ts", "if (!method || !Object.hasOwn(methods, frame.method))", "if (!method)"],
  ["python: no permission means auto", "python/koder_sdk/client.py", 'if value is None:\n        return "deny"', 'if value is None:\n        return "auto"'],
  ["python: handler exception answered as allow", "python/koder_sdk/_bridge.py", 'reply = {"id": frame["id"], "error": {"code": getattr(error, "code", "CLIENT_ERROR"), "message": str(error)}}', 'reply = {"id": frame["id"], "result": True}'],
];

const SUITES = [
  ["node", [process.execPath, ["--test", "--test-timeout=20000", "test/sdk.test.mjs", "test/server.test.mjs"], { cwd: root }]],
  ["python", ["python3", ["-m", "unittest", "discover", "-s", "tests"], { cwd: path.join(root, "python") }]],
];

const build = () => {
  const run = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root, encoding: "utf8" });
  return run.status === 0;
};

let failures = 0;
for (const [name, file, from, to] of MUTANTS) {
  const target = path.join(root, file);
  const original = fs.readFileSync(target, "utf8");
  if (!original.includes(from)) {
    console.log(`SETUP_ERROR ${name}: pattern not found in ${file}`);
    failures += 1;
    continue;
  }
  fs.writeFileSync(target, original.replace(from, to));
  try {
    const failed = [];
    if (!build()) failed.push("build");
    else {
      for (const [suite, [command, args, options]] of SUITES) {
        const run = spawnSync(command, args, { ...options, encoding: "utf8", timeout: 60_000 });
        if (run.status !== 0) failed.push(`${suite}:${run.status ?? "timeout"}`);
      }
    }
    console.log(`${failed.length ? "CAUGHT" : "MISSED"} ${name}${failed.length ? ` (${failed.join(", ")})` : ""}`);
    if (!failed.length) failures += 1;
  } finally {
    fs.writeFileSync(target, original);
  }
}
if (!build()) {
  console.log("REBUILD_FAILED after restoring sources");
  failures += 1;
}
process.exitCode = failures ? 1 : 0;
