// Runs offline straight from TypeScript source on Node ≥ 22.18:  node examples/typescript.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CustomProvider, KoderEvent, PermissionHandler, RunResult } from "../index.d.ts";
import { createKoder } from "../src/index.ts";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "koder-sdk-ts-"));

let step = 0;
const provider: CustomProvider = {
  name: "demo",
  model: "demo",
  async complete() {
    step += 1;
    if (step === 1) return { text: "", toolCalls: [{ id: "c1", name: "write_file", arguments: { path: "notes.md", content: "# typed\n" } }] };
    return { text: "notes.md is ready.", toolCalls: [] };
  },
};

const permission: PermissionHandler = (request) => {
  switch (request.kind) {
    case "edit":
      return request.path.endsWith(".md");
    case "command":
      return false;
    case "question":
      return { choice: 0 };
  }
};

const koder = await createKoder({ workspace, provider, permission, mode: "code" });
const session = await koder.session();
const run = session.send("write notes.md");
const kinds: KoderEvent["type"][] = [];
for await (const event of run) kinds.push(event.type);
const result: RunResult = await run;
await koder.close();

console.log(`events=${kinds.join(",")}`);
console.log(`status=${result.status} files=${result.files.join(",")} content=${JSON.stringify(fs.readFileSync(path.join(workspace, "notes.md"), "utf8"))}`);
fs.rmSync(workspace, { recursive: true, force: true });
