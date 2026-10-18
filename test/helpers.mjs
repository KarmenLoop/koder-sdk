import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

export function tmp(prefix = "koder-sdk-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Isolated env: no saved CLI model, no KODER_* variables from the developer's shell.
export function cleanEnv(extra = {}) {
  return { PATH: process.env.PATH, HOME: process.env.HOME, KODER_CLI_HOME: tmp("koder-sdk-home-"), KODER_LANG: "en", ...extra };
}

// Scripted model: each call returns the next step; a function step receives the request.
export function scripted(steps) {
  const calls = [];
  return {
    calls,
    name: "scripted",
    model: "scripted",
    contextWindow: 64_000,
    async complete({ messages, tools }) {
      calls.push({ messages, tools });
      const step = steps[Math.min(calls.length - 1, steps.length - 1)];
      return typeof step === "function" ? step({ messages, tools, index: calls.length - 1 }) : step;
    },
  };
}

export const textStep = (text) => ({ text, toolCalls: [] });

export const toolStep = (name, args, text = "", id = `call-${name}-${Math.random().toString(36).slice(2, 8)}`) => ({ text, toolCalls: [{ id, name, arguments: args }] });

export const toolMessages = (messages) => messages.filter((message) => message.role === "tool").map((message) => String(message.content));

// OpenAI-compatible chat endpoint on 127.0.0.1.
export async function mockModel(steps, { status = 200 } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body || "{}") });
      if (status !== 200) {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "nope" } }));
        return;
      }
      const value = steps[Math.min(requests.length - 1, steps.length - 1)];
      const toolCalls = (value.toolCalls || []).map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } }));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { role: "assistant", content: value.text || "", ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: toolCalls.length ? "tool_calls" : "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 6 },
      }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
