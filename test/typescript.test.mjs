import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("TypeScript source runs unbuilt on Node and matches the dist behaviour", () => {
  const run = spawnSync(process.execPath, [path.join(root, "examples", "typescript.ts")], { cwd: root, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /events=assistant,permission_request,permission_decision,tool_result,assistant,result/);
  assert.match(run.stdout, /status=completed files=notes\.md content="# typed\\n"/);
});
