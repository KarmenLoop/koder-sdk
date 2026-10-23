# Koder SDK

English | [简体中文](README.zh-CN.md)

Use Koder from JavaScript, TypeScript, or Python. Open a session in a workspace, stream the result, and decide which edits and commands to allow.

The SDK uses your installed Koder CLI and its runtime. This repository contains the MIT-licensed SDK and Python bridge; the KARMEN LOOP kernel is distributed separately under its own terms.

## Requirements

- Node.js 22.13 or later. Building the TypeScript source uses Node's built-in type stripper.
- A compatible Koder CLI installation with its runtime. The SDK first checks `~/.koder-cli/current`, then an adjacent or vendored CLI checkout.
- Python 3.9 or later for the Python client. Python still starts a Node bridge process.
- A model configured in Koder, explicit model settings, or your own provider implementation.

Set `KODER_CLI_ROOT` or pass `cliRoot` in JavaScript / `cli_root` in Python to choose a specific CLI installation. An invalid explicit path is reported rather than silently replaced by another copy.

Get the CLI from the [official download page](https://karmenloop.com/en/download.html). A source checkout without its separately distributed runtime cannot execute agent tasks.

## Try it locally

```sh
git clone https://github.com/KarmenLoop/koder-sdk.git
cd koder-sdk
npm run build
node examples/custom-provider.mjs
```

The example uses an in-process provider, writes `hello.txt` in a temporary workspace through the real execution runtime, reads it back, and cleans up. It makes no model API request. It still requires the CLI and kernel.

For Python:

```sh
python3 -m pip install ./python
python3 python/examples/custom_provider.py
```

Run `npm run build` before building a Python distribution. The wheel includes the generated Node bridge, so it can run after the source checkout has been moved or removed. Node and the Koder CLI remain separate requirements. `KODER_NODE` and `KODER_SDK_SERVER` override the Node executable and bridge path when needed.

## JavaScript and TypeScript

```js
import { createKoder } from "./dist/index.mjs";

const koder = await createKoder({
  workspace: process.cwd(),
  permission: "deny",
});

try {
  const session = await koder.session({ readOnly: true });
  const run = session.send("Explain the main entry point in this project.");
  for await (const event of run) {
    if (event.type === "delta") process.stdout.write(event.text);
  }
  const result = await run;
  console.log(result.status, result.files);
} finally {
  await koder.close();
}
```

The default model comes from Koder's configuration or `KODER_MODEL`, `KODER_BASE_URL`, and `KODER_API_KEY`. To supply one directly, pass `model: { model, baseUrl, apiKey }`. Keep keys in your environment or credential store rather than source files.

`query({ workspace, prompt, ...options })` is the single-turn form. Reuse a session for related turns, await each send, and call `session.reset()` when you want a new conversation. `session.messages` exposes the recorded history. The provider receives the portion that fits its configured context budget.

## Python

```python
import asyncio
from koder_sdk import Koder

async def main():
    async with await Koder.create(workspace=".", permission="deny") as koder:
        session = await koder.session(read_only=True)
        result = await session.send("Explain the main entry point.")
        print(result.status, result.text)

asyncio.run(main())
```

Python options use snake case, including `read_only`, `cli_root`, and model fields such as `base_url` and `api_key`. A run can be awaited or iterated with `async for`. `query_sync` is available for synchronous callers; use the async client inside an existing event loop.

## Approvals and cancellation

Edits and commands are denied by default. Choose a preset or provide a handler that examines each request:

| Preset | Edits | Commands | Questions |
| --- | --- | --- | --- |
| `deny` | Denied | Denied | Cancelled |
| `acceptEdits` | Allowed | Denied | Cancelled |
| `auto` | Allowed | Allowed | Cancelled |

An edit request contains the path, before and after text, and diff. A command request contains the proposed command. A question needs an actual option answer; a preset does not answer for the user. Login requests are refused by the SDK.

Use `run.cancel()` or a JavaScript `AbortSignal` to stop a turn. Cancellation stops further work and leaves already accepted changes on disk. A session rejects an overlapping send with `BUSY`; a closed client rejects new work with `CLOSED`.

## Custom providers

In JavaScript, implement `complete({ messages, tools, signal })` and return `{ text, toolCalls }`. Set `contextWindow` to the model's actual capacity, in tokens. It must be an integer of at least 2048. The SDK uses this value for the runtime's context budget.

In Python, implement `complete(messages, tools)` and return `{ "text": ..., "tool_calls": [...] }`. Set `context_window` on the provider object to pass the same capacity through the bridge. Omitting the capacity retains the runtime's conservative default, which can trim earlier turns.

See [the JavaScript example](examples/custom-provider.mjs), [the Python example](python/examples/custom_provider.py), and [the TypeScript example](examples/typescript.ts). Examples use synthetic data; they do not prove that a hosted model is configured or reachable.

## Development and packaging

```sh
npm ci
npm run typecheck
npm test
npm run test:python
```

The full JavaScript and Python suites require a compatible local CLI runtime. Automated interface checks build the SDK, type-check it, test CLI discovery, and inspect the npm package. They do not claim a live model round trip.

To test a Python wheel outside the checkout:

```sh
npm run build
python3 -m pip wheel --no-deps ./python --wheel-dir wheelhouse
python3 scripts/test-python-wheel.py wheelhouse/koder_sdk-0.1.1-py3-none-any.whl
```

The wheel check starts its bundled bridge, performs an approved file write in a temporary workspace, and verifies a second turn can recall the first. It uses a local provider and makes no paid API request.

## License and support

The SDK is [MIT licensed](LICENSE). That license does not cover the separately distributed KARMEN LOOP kernel, model services, or other repositories.

Report reproducible SDK issues in [GitHub Issues](https://github.com/KarmenLoop/koder-sdk/issues), with the Node/Python versions and a sanitized example. Do not include API keys or private workspace content. Product information is at [karmenloop.com](https://karmenloop.com).
