import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { KoderSdkError, createKoder, query } from "../dist/index.mjs";
import { cleanEnv, mockModel, scripted, textStep, tmp, toolMessages, toolStep } from "./helpers.mjs";

const base = (provider, extra = {}) => ({ workspace: tmp(), provider, env: cleanEnv(), ...extra });

test("query: awaited result carries the final text and a result event", async () => {
  const result = await query({ prompt: "hi", ...base(scripted([textStep("hello from koder")])) });
  assert.equal(result.status, "completed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.text, "hello from koder");
  assert.deepEqual(result.files, []);
  assert.equal(result.events.at(-1).type, "result");
  assert.ok(result.events.some((event) => event.type === "assistant" && event.text === "hello from koder"));
});

test("query: iteration streams every event in order and ends with result", async () => {
  const seen = [];
  for await (const event of query({ prompt: "hi", ...base(scripted([toolStep("list_dir", { path: "." }), textStep("done")])) })) seen.push(event.type);
  assert.deepEqual(seen, ["assistant", "tool_result", "assistant", "result"]);
});

test("edits are rejected by default and nothing is written", async () => {
  const options = base(scripted([toolStep("write_file", { path: "a.txt", content: "new\n" }), textStep("not written")]));
  const result = await query({ prompt: "write", ...options });
  assert.equal(fs.existsSync(path.join(options.workspace, "a.txt")), false);
  assert.deepEqual(result.files, []);
  const decision = result.events.find((event) => event.type === "permission_decision");
  assert.deepEqual(decision, { type: "permission_decision", kind: "edit", id: decision.id, allow: false });
});

test("a permission function sees the diff and can allow the edit", async () => {
  const options = base(scripted([toolStep("write_file", { path: "out.txt", content: "hello\n" }), textStep("written")]));
  const requests = [];
  const result = await query({ prompt: "write", ...options, permission: (request) => (requests.push(request), true) });
  assert.equal(fs.readFileSync(path.join(options.workspace, "out.txt"), "utf8"), "hello\n");
  assert.deepEqual(result.files, ["out.txt"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].kind, "edit");
  assert.equal(requests[0].path, "out.txt");
  assert.match(requests[0].diff, /^\+hello$/m);
});

test("acceptEdits writes files but refuses commands", async () => {
  const workspace = tmp();
  const marker = path.join(workspace, "ran.txt");
  const provider = scripted([toolStep("shell", { command: `printf ran > ${JSON.stringify(marker)}` }), toolStep("write_file", { path: "x.txt", content: "x" }), textStep("ok")]);
  const result = await query({ prompt: "go", workspace, provider, env: cleanEnv(), permission: "acceptEdits" });
  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.readFileSync(path.join(workspace, "x.txt"), "utf8"), "x");
  assert.equal(result.status, "completed");
});

test("auto runs commands and the model sees their output", async () => {
  const provider = scripted([toolStep("shell", { command: "echo koder-sdk-ok" }), ({ messages }) => textStep(toolMessages(messages).some((text) => text.includes("koder-sdk-ok")) ? "saw output" : "no output")]);
  const result = await query({ prompt: "run", ...base(provider), permission: "auto" });
  assert.equal(result.text, "saw output");
});

test("a throwing permission handler cancels the turn without writing", async () => {
  const options = base(scripted([toolStep("write_file", { path: "boom.txt", content: "x" }), textStep("should not get here")]));
  const result = await query({ prompt: "write", ...options, permission: () => { throw new Error("handler broke"); } });
  assert.equal(fs.existsSync(path.join(options.workspace, "boom.txt")), false);
  assert.equal(result.status, "cancelled");
  assert.equal(result.reason, "cancelled");
  assert.ok(result.events.some((event) => event.type === "permission_error" && event.message === "handler broke"));
});

test("questions: the handler's option text is passed back to the model", async () => {
  const provider = scripted([toolStep("ask_user", { question: "Which?", options: ["A", "B"] }), ({ messages }) => textStep(toolMessages(messages).find((text) => text.includes("B")) || "none")]);
  let asked = null;
  const result = await query({ prompt: "pick", ...base(provider), permission: (request) => ((asked = request), "B") });
  assert.deepEqual({ kind: asked.kind, question: asked.question, options: asked.options }, { kind: "question", question: "Which?", options: ["A", "B"] });
  assert.match(result.text, /B/);
  assert.ok(result.events.some((event) => event.type === "permission_decision" && event.choice === 1 && event.option === "B"));
});

test("presets never answer questions for the user", async () => {
  const provider = scripted([toolStep("ask_user", { question: "Which?", options: ["A", "B"] }), textStep("answered?")]);
  const result = await query({ prompt: "pick", ...base(provider), permission: "auto" });
  assert.equal(result.status, "cancelled");
  assert.equal(provider.calls.length, 1);
});

for (const [label, answer] of [["out-of-range index", 7], ["boolean true", true], ["unknown option text", "C"]]) {
  test(`question answered with ${label} cancels instead of picking something`, async () => {
    const provider = scripted([toolStep("ask_user", { question: "Which?", options: ["A", "B"] }), textStep("answered?")]);
    const result = await query({ prompt: "pick", ...base(provider), permission: () => answer });
    assert.equal(result.status, "cancelled");
    assert.equal(provider.calls.length, 1);
  });
}

test("login requests are refused without consulting the handler", async () => {
  let called = false;
  const result = await query({ prompt: "login", ...base(scripted([toolStep("request_login", { service: "mail" })])), permission: () => ((called = true), true) });
  assert.equal(called, false);
  assert.equal(result.status, "cancelled");
  assert.equal(result.reason, "login_refused");
  assert.ok(result.events.some((event) => event.type === "permission_request" && event.request.kind === "login" && event.request.service === "mail"));
});

test("aborting while the handler is pending cancels and writes nothing", async () => {
  const options = base(scripted([toolStep("write_file", { path: "late.txt", content: "x" }), textStep("never")]));
  const controller = new AbortController();
  const run = query({ prompt: "write", ...options, signal: controller.signal, permission: () => new Promise(() => {}) });
  for await (const event of run) if (event.type === "permission_request") controller.abort();
  const result = await run;
  assert.equal(result.status, "cancelled");
  assert.equal(result.reason, "aborted");
  assert.equal(fs.existsSync(path.join(options.workspace, "late.txt")), false);
});

test("run.cancel() right after send does not reach the model", async () => {
  const provider = scripted([textStep("should not run")]);
  const koder = await createKoder(base(provider));
  const session = await koder.session();
  const run = session.send("hi");
  run.cancel();
  const result = await run;
  assert.equal(result.status, "cancelled");
  assert.equal(provider.calls.length, 0);
  await koder.close();
});

test("sessions keep history across turns and refuse overlapping sends", async () => {
  const provider = scripted([textStep("first"), ({ messages }) => textStep(messages.filter((m) => m.role === "user").length === 2 ? "remembers" : "forgot")]);
  const koder = await createKoder(base(provider));
  const session = await koder.session();
  const first = session.send("one");
  assert.throws(() => session.send("two"), (error) => error instanceof KoderSdkError && error.code === "BUSY");
  assert.equal((await first).text, "first");
  assert.equal((await session.send("two")).text, "remembers");
  assert.deepEqual(session.messages.filter((m) => m.role === "user").map((m) => m.content), ["one", "two"]);
  await session.reset();
  assert.equal(session.messages.length, 0);
  await koder.close();
  assert.throws(() => session.send("three"), (error) => error.code === "CLOSED");
});

test("readOnly sessions are not offered tools that change files", async () => {
  const provider = scripted([textStep("ok")]);
  const koder = await createKoder(base(provider));
  await (await koder.session({ readOnly: true })).send("look");
  await (await koder.session()).send("work");
  const names = (call) => call.tools.map((tool) => tool.name || tool.function?.name);
  assert.ok(!names(provider.calls[0]).includes("write_file"));
  assert.ok(names(provider.calls[1]).includes("write_file"));
  assert.ok(koder.tools().includes("read_file"));
  await koder.close();
});

test("onEvent receives the same events as iteration", async () => {
  const seen = [];
  const result = await query({ prompt: "hi", ...base(scripted([textStep("x")])), onEvent: (event) => seen.push(event) });
  assert.deepEqual(seen, result.events);
});

test("model config over HTTP: completed turn and usage", async () => {
  const server = await mockModel([textStep("over http")]);
  try {
    const result = await query({ prompt: "hi", workspace: tmp(), env: cleanEnv(), model: { model: "m", baseUrl: server.url, apiKey: "sk-test" } });
    assert.equal(result.text, "over http");
    assert.equal(result.usage.input, 12);
    assert.equal(server.requests[0].headers.authorization, "Bearer sk-test");
  } finally {
    await server.close();
  }
});

test("model config over HTTP: 401 is reported as unreachable with detail", async () => {
  const server = await mockModel([], { status: 401 });
  try {
    const result = await query({ prompt: "hi", workspace: tmp(), env: cleanEnv(), model: { model: "m", baseUrl: server.url, apiKey: "bad" } });
    assert.equal(result.status, "unreachable");
    assert.equal(result.exitCode, 2);
    assert.equal(result.error.code, "API_UNREACHABLE");
    assert.match(result.error.detail, /HTTP 401/);
  } finally {
    await server.close();
  }
});

test("KODER_* environment is picked up when no model is passed", async () => {
  const server = await mockModel([textStep("from env")]);
  try {
    const result = await query({ prompt: "hi", workspace: tmp(), env: cleanEnv({ KODER_MODEL: "m", KODER_BASE_URL: server.url, KODER_API_KEY: "k" }) });
    assert.equal(result.text, "from env");
  } finally {
    await server.close();
  }
});

test("configuration errors have stable codes", async () => {
  const code = async (options, expected) => {
    await assert.rejects(createKoder({ workspace: tmp(), env: cleanEnv(), provider: scripted([textStep("x")]), ...options }), (error) => error instanceof KoderSdkError && error.code === expected);
  };
  await code({ provider: undefined }, "MODEL_MISSING");
  await code({ workspace: path.join(tmp(), "missing") }, "BAD_WORKSPACE");
  await code({ mode: "turbo" }, "BAD_MODE");
  await code({ permission: "yolo" }, "BAD_PERMISSION");
  await code({ provider: {} }, "BAD_PROVIDER");
  await code({ provider: undefined, model: { model: "m", baseUrl: "ftp://x", apiKey: "k" } }, "model.badUrl");
  await code({ cliRoot: tmp(), env: cleanEnv({ KODER_CLI_ROOT: tmp() }) }, "CLI_NOT_FOUND");
});

test("query rejects with the configuration error instead of hanging", async () => {
  const run = query({ prompt: "hi", workspace: tmp(), env: cleanEnv() });
  await assert.rejects(run, (error) => error.code === "MODEL_MISSING");
  await assert.rejects(async () => { for await (const _ of run); }, (error) => error.code === "MODEL_MISSING");
});
