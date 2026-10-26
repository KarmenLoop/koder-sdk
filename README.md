# Koder SDK

[English](README.md) · [中文](README.zh-CN.md) · **v0.1.1**

[![Node 22.13+](https://img.shields.io/badge/node-22.13%2B-brightgreen)](https://nodejs.org/)
[![Python 3.9+](https://img.shields.io/badge/python-3.9%2B-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Status: local SDK](https://img.shields.io/badge/status-local%20SDK-64748b)](#is--is-not)

**Call Koder from JavaScript, TypeScript, or Python: open a session in a workspace, stream events, and decide which edits and commands to allow.**

The SDK drives your **installed** [Koder CLI](https://github.com/KarmenLoop/koder-cli) and its runtime. This repository is the MIT-licensed client plus a Python ↔ Node bridge. The KARMEN LOOP / Koder **kernel** is distributed separately and is not published here.

Built and maintained by [KarmenLoop](https://github.com/KarmenLoop) / [KARMENLOOP](https://karmenloop.com). Current package version: **0.1.1** (`package.json` / `python/pyproject.toml`). License: **MIT**.

[Tutorial (EN)](docs/tutorial.en.md) · [中文教程](docs/tutorial.zh-CN.md) · [CHANGELOG](CHANGELOG.md) · [CLI download](https://karmenloop.com/en/download.html) · [koder-cli](https://github.com/KarmenLoop/koder-cli)

---

## Why this exists

Terminal and TUI entry points are enough for interactive use. Embedding the same approve-before-write loop inside apps, tests, and automation needs a stable session API with streaming and permission hooks—without re-implementing the runtime.

Koder SDK is that client surface:

- one workspace session API across JS/TS and Python;
- streaming deltas and tool results;
- deny-by-default permissions with presets or custom handlers;
- optional in-process custom providers for tests and gateways.

It does **not** ship a model, create cloud accounts, or replace the CLI installer.

---

## Snapshot

| | |
|---|---|
| **What you install** | This repo’s JS/TS package (`dist/`) and optional Python package (`python/`) |
| **Version** | **0.1.1** |
| **JS runtime** | Node.js **≥ 22.13** (build uses Node’s type stripper) |
| **Python** | **≥ 3.9**; still starts a Node bridge process |
| **Peer runtime** | Compatible Koder CLI + kernel (see CLI discovery below) |
| **Default discovery** | `KODER_CLI_ROOT` / `cliRoot` / `cli_root` → else `~/.koder-cli/current` → adjacent/vendored checkout |
| **Package managers** | **From this checkout:** `npm ci` + `npm run build`; Python `python3 -m pip install ./python` after build. **Not** claimed as a published npmjs.com / PyPI release in this draft |
| **License** | MIT (SDK only; kernel terms separate) |

---

## Is / Is not

| Is | Is not |
|---|---|
| Local client library for Koder sessions (JS/TS + Python) | A hosted API or SaaS endpoint |
| Streaming runs with permission presets / handlers | Automatic approval of edits and commands (default is `deny`) |
| Bridge that uses your installed CLI + kernel | A substitute for installing [koder-cli](https://github.com/KarmenLoop/koder-cli) |
| Custom in-process providers for tests / gateways | Proof that a paid model account is configured |
| MIT-licensed SDK sources and examples | Kernel source or model weights |

---

## Requirements

1. **Node.js 22.13+**
2. **Koder CLI** with a compatible runtime ([download](https://karmenloop.com/en/download.html)). A CLI source tree without the separately distributed runtime cannot execute agent tasks.
3. **Python 3.9+** only if you use the Python client.
4. A model via Koder config, `KODER_MODEL` / `KODER_BASE_URL` / `KODER_API_KEY`, explicit `model: { … }`, or a custom `provider`.

Invalid explicit `cliRoot` / `cli_root` / `KODER_CLI_ROOT` is reported—never silently replaced.

---

## Quick start (from this repository)

```sh
git clone https://github.com/KarmenLoop/koder-sdk.git
cd koder-sdk
npm ci
npm run build
node examples/custom-provider.mjs
```

The custom-provider example uses an in-process provider, writes `hello.txt` through the real execution runtime in a temporary workspace, reads it back, and cleans up. It makes **no** model API request. It still needs the CLI and kernel.

**Python** (build JS first so the wheel/bridge is generated):

```sh
python3 -m pip install ./python
python3 python/examples/custom_provider.py
```

Overrides when needed: `KODER_NODE`, `KODER_SDK_SERVER`.

Real-model quickstart (after `koder model add` or env vars):

```sh
node examples/quickstart.mjs /path/to/project "Explain what this project does"
```

Full walkthrough: [docs/tutorial.en.md](docs/tutorial.en.md).

---

## JavaScript / TypeScript

```js
import { createKoder } from "./dist/index.mjs";
// After packaging from this checkout you may import "koder-sdk" instead.

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

- Default model: Koder config or `KODER_MODEL`, `KODER_BASE_URL`, `KODER_API_KEY`.
- Direct model: `model: { model, baseUrl, apiKey }` — keep keys in env / credential stores.
- Single turn: `query({ workspace, prompt, … })`.
- Multi-turn: reuse `session`, await each `send`, `session.reset()` for a new conversation; `session.messages` is recorded history (provider sees what fits its context budget).
- Types: [`index.d.ts`](index.d.ts). Examples: [`examples/typescript.ts`](examples/typescript.ts).

---

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

Snake case options: `read_only`, `cli_root`, `base_url`, `api_key`. Iterate a run with `async for`, or use `query_sync` outside an existing event loop.

---

## Approvals and cancellation

Edits and commands default to **denied**. Choose a preset or a handler:

| Preset | Edits | Commands | Questions |
|---|---|---|---|
| `deny` | Denied | Denied | Cancelled |
| `acceptEdits` | Allowed | Denied | Cancelled |
| `auto` | Allowed | Allowed | Cancelled |

Handlers receive edit (path, before/after, diff), command (proposed line), or question (options). Presets never answer questions for you. Login requests are always refused by the SDK.

Stop a turn with `run.cancel()` or a JS `AbortSignal`. Cancellation stops further work; already accepted disk changes remain. Overlapping `send` on one session → `BUSY`. Closed client → `CLOSED`.

---

## Custom providers

**JavaScript:** implement `complete({ messages, tools, signal })` → `{ text, toolCalls }`. Set `contextWindow` to a real token capacity (integer ≥ 2048).

**Python:** implement `complete(messages, tools)` → `{ "text": …, "tool_calls": […] }` and `context_window` on the provider object.

See [examples/custom-provider.mjs](examples/custom-provider.mjs), [python/examples/custom_provider.py](python/examples/custom_provider.py), [examples/typescript.ts](examples/typescript.ts). Synthetic examples do **not** prove a hosted model is reachable.

---

## Development and packaging

```sh
npm ci
npm run typecheck
npm test
npm run test:python
```

Full suites need a compatible local CLI runtime. Interface checks build, typecheck, probe CLI discovery, and inspect the npm package layout—they do not claim a live model round-trip.

Python wheel outside the checkout:

```sh
npm run build
python3 -m pip wheel --no-deps ./python --wheel-dir wheelhouse
python3 scripts/test-python-wheel.py wheelhouse/koder_sdk-0.1.1-py3-none-any.whl
```

The wheel check starts its bundled bridge, performs an approved write in a temp workspace, and verifies a second turn can recall the first—local provider, no paid API.

Upgrade: rebuild, reinstall the Python path/wheel, and read [CHANGELOG.md](CHANGELOG.md). The SDK does not manage your workspace or model credentials for you.

---

## Documentation map

| Doc | Use it when you need… |
|---|---|
| [Tutorial EN](docs/tutorial.en.md) · [中文](docs/tutorial.zh-CN.md) | Install → first client call → streaming → update |
| [README](README.md) | API snapshots and permission table |
| [CHANGELOG](CHANGELOG.md) | 0.1.1 notes |
| [index.d.ts](index.d.ts) | TypeScript surface |
| `docs/screenshots/` | Visual captures only (not a prose guide) |

---

## FAQ

### What is Koder SDK, in one sentence?

A local JS/TS/Python client that opens Koder sessions against your installed CLI runtime, streams results, and lets you approve edits and commands.

### Do I need karmenbot?

No. The SDK talks to **Koder CLI** / kernel. [karmenbot](https://github.com/KarmenLoop/karmenbot) is a separate full-screen assistant in the same product family.

### Is this on npm or PyPI?

This draft documents **install-from-checkout** (`npm ci` / `npm run build`, `pip install ./python`). Do not assume a registry package exists until a release explicitly says so.

### What is the default permission?

`deny` — edits and commands rejected until you choose `acceptEdits`, `auto`, or a custom handler.

### Soft discoverability

Phrases that match this repo: **Koder JavaScript TypeScript Python SDK**, **streaming coding agent session API**, **approve before edit permission handler**, **custom provider contextWindow bridge**, **local Koder CLI client library**. Substance lives in the API and examples—not keyword density.

---

## License and support

[MIT](LICENSE) for this SDK. It does not cover the separately distributed kernel, model services, or other repositories.

Issues: [GitHub Issues](https://github.com/KarmenLoop/koder-sdk/issues) — include Node/Python versions and a sanitized repro. Never paste API keys or private workspace files.

Maintainer: [KarmenLoop](https://github.com/KarmenLoop) · Site: [karmenloop.com](https://karmenloop.com)

Related: [koder-cli](https://github.com/KarmenLoop/koder-cli) · [koder-tui](https://github.com/KarmenLoop/koder-tui) · [karmenbot](https://github.com/KarmenLoop/karmenbot) · [karmen-memory](https://github.com/KarmenLoop/karmen-memory) · [org home](https://github.com/KarmenLoop/KarmenLoop)

Copyright 2026 KarmenLoop.
