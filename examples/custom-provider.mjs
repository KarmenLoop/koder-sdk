// Runs offline: a tiny in-process "model" writes a file, the permission handler approves it.
//   node examples/custom-provider.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createKoder } from "../dist/index.mjs";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "koder-sdk-demo-"));
let step = 0;
const provider = {
  name: "demo",
  model: "demo",
  async complete() {
    step += 1;
    if (step === 1) return { text: "I will create hello.txt.", toolCalls: [{ id: "c1", name: "write_file", arguments: { path: "hello.txt", content: "hello from koder-sdk\n" } }] };
    return { text: "hello.txt is written.", toolCalls: [] };
  },
};

const koder = await createKoder({ workspace, provider, permission: (request) => request.kind === "edit" && request.path === "hello.txt" });
const session = await koder.session();
const result = await session.send("create hello.txt", { onEvent: (event) => console.log(JSON.stringify(event)) });
await koder.close();

console.log(`status=${result.status} files=${result.files.join(",")}`);
console.log(`hello.txt: ${fs.readFileSync(path.join(workspace, "hello.txt"), "utf8").trim()}`);
fs.rmSync(workspace, { recursive: true, force: true });
