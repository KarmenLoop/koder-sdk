import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cleanEnv, tmp } from "./helpers.mjs";

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "koder-sdk-server.mjs");

// Minimal bridge client: answers server requests through `onRequest`, records every stdout line.
function bridge(onRequest = () => ({})) {
  const child = spawn(process.execPath, [BIN], { stdio: ["pipe", "pipe", "pipe"] });
  const raw = [];
  const events = [];
  const waiting = new Map();
  let next = 0;
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  readline.createInterface({ input: child.stdout }).on("line", async (line) => {
    raw.push(line);
    const frame = JSON.parse(line);
    if (frame.method === "run.event") return events.push(frame.params);
    if (frame.method) {
      try {
        child.stdin.write(`${JSON.stringify({ id: frame.id, result: await onRequest(frame.method, frame.params) })}\n`);
      } catch (error) {
        child.stdin.write(`${JSON.stringify({ id: frame.id, error: { code: "X", message: error.message } })}\n`);
      }
      return;
    }
    const waiter = waiting.get(frame.id);
    waiting.delete(frame.id);
    waiter?.(frame);
  });
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  return {
    child,
    raw,
    events,
    stderr: () => stderr,
    exited,
    send(line) {
      child.stdin.write(`${line}\n`);
    },
    call(method, params = {}) {
      const id = ++next;
      return new Promise((resolve) => {
        waiting.set(id, resolve);
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      });
    },
    async close() {
      child.stdin.end();
      return exited;
    },
  };
}

const create = (b, extra = {}) => b.call("koder.create", { workspace: tmp(), provider: "client", env: cleanEnv(), ...extra });

test("initialize reports protocol and versions", async () => {
  const b = bridge();
  const reply = await b.call("initialize");
  assert.equal(reply.result.protocol, 1);
  assert.match(reply.result.node, /^\d+\./);
  assert.equal(await b.close(), 0);
});

test("client provider and client permission round-trip; stdout carries only frames", async () => {
  let step = 0;
  const asked = [];
  const b = bridge((method, params) => {
    if (method === "provider.complete") {
      step += 1;
      return step === 1 ? { text: "", toolCalls: [{ id: "c1", name: "write_file", arguments: { path: "a.txt", content: "hi\n" } }] } : { text: "done", toolCalls: [] };
    }
    if (method === "permission.request") {
      asked.push(params);
      return true;
    }
    throw new Error(`unexpected ${method}`);
  });
  const created = await create(b, { permission: "client" });
  assert.ok(created.result.koderId);
  assert.ok(created.result.tools.includes("write_file"));
  const session = await b.call("session.create", { koderId: created.result.koderId });
  const reply = await b.call("session.send", { sessionId: session.result.sessionId, prompt: "write" });
  assert.equal(reply.result.status, "completed");
  assert.deepEqual(reply.result.files, ["a.txt"]);
  assert.equal(reply.result.events, undefined);
  assert.equal(fs.readFileSync(path.join(created.result.workspace, "a.txt"), "utf8"), "hi\n");
  assert.equal(asked.length, 1);
  assert.equal(asked[0].request.kind, "edit");
  assert.equal(asked[0].runId, reply.id);
  assert.deepEqual(b.events.map((item) => item.event.type), ["assistant", "permission_request", "permission_decision", "tool_result", "assistant", "result"]);
  assert.ok(b.events.every((item) => item.runId === reply.id));
  await b.close();
  for (const line of b.raw) assert.doesNotThrow(() => JSON.parse(line));
});

test("permission defaults to deny when the client gives none", async () => {
  let step = 0;
  const b = bridge((method) => {
    if (method === "permission.request") throw new Error("must not be asked");
    step += 1;
    return step === 1 ? { toolCalls: [{ id: "c1", name: "write_file", arguments: { path: "a.txt", content: "x" } }] } : { text: "ok" };
  });
  const created = await create(b);
  const session = await b.call("session.create", { koderId: created.result.koderId });
  const reply = await b.call("session.send", { sessionId: session.result.sessionId, prompt: "write" });
  assert.equal(fs.existsSync(path.join(created.result.workspace, "a.txt")), false);
  assert.deepEqual(reply.result.files, []);
  await b.close();
});

test("a client error answering permission cancels the turn without writing", async () => {
  const b = bridge((method) => {
    if (method === "permission.request") throw new Error("client broke");
    return { toolCalls: [{ id: "c1", name: "write_file", arguments: { path: "a.txt", content: "x" } }] };
  });
  const created = await create(b, { permission: "client" });
  const session = await b.call("session.create", { koderId: created.result.koderId });
  const reply = await b.call("session.send", { sessionId: session.result.sessionId, prompt: "write" });
  assert.equal(reply.result.status, "cancelled");
  assert.equal(fs.existsSync(path.join(created.result.workspace, "a.txt")), false);
  assert.ok(b.events.some((item) => item.event.type === "permission_error"));
  await b.close();
});

test("errors carry stable codes", async () => {
  const b = bridge();
  assert.equal((await b.call("nope")).error.code, "UNKNOWN_METHOD");
  assert.equal((await b.call("toString")).error.code, "UNKNOWN_METHOD");
  assert.equal((await b.call("session.send", { sessionId: "missing", prompt: "x" })).error.code, "UNKNOWN_SESSION");
  assert.equal((await create(b, { provider: undefined })).error.code, "MODEL_MISSING");
  assert.equal((await create(b, { permission: "yolo" })).error.code, "BAD_PERMISSION");
  b.send("{not json");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(b.raw.some((line) => JSON.parse(line).error?.code === "PARSE_ERROR"));
  await b.close();
});

test("client disconnect while a permission is pending: process exits and nothing is written", async () => {
  let created;
  const b = bridge((method) => {
    if (method === "permission.request") return new Promise(() => {});
    return { toolCalls: [{ id: "c1", name: "write_file", arguments: { path: "late.txt", content: "x" } }] };
  });
  created = await create(b, { permission: "client" });
  const session = await b.call("session.create", { koderId: created.result.koderId });
  b.call("session.send", { sessionId: session.result.sessionId, prompt: "write" });
  while (!b.events.some((item) => item.event.type === "permission_request")) await new Promise((resolve) => setTimeout(resolve, 10));
  const code = await b.close();
  assert.equal(code, 0);
  assert.equal(fs.existsSync(path.join(created.result.workspace, "late.txt")), false);
});
