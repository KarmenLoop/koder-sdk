import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findCliRoot } from "../dist/cli.mjs";

function installedHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "koder-sdk-discovery-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const root = path.join(home, ".koder-cli", "current");
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "agent.mjs"), "export {};\n");
  return { home, root };
}

test("find the CLI installed in the supplied home directory", (t) => {
  const { home, root } = installedHome(t);
  assert.equal(findCliRoot({ env: { HOME: home } }), root);
});

test("find the CLI under USERPROFILE when HOME is absent", (t) => {
  const { home, root } = installedHome(t);
  assert.equal(findCliRoot({ env: { USERPROFILE: home } }), root);
});

test("an invalid explicit CLI root never falls back to an installed copy", (t) => {
  const { home } = installedHome(t);
  assert.throws(() => findCliRoot({ env: { HOME: home, KODER_CLI_ROOT: path.join(home, "missing") } }), { code: "CLI_NOT_FOUND" });
});
