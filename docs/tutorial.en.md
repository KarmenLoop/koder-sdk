# Koder SDK tutorial (English)

[English](tutorial.en.md) · [中文](tutorial.zh-CN.md) · back to [README](../README.md)

Install from this repository, make a first client call, stream events, then update. Screenshots under `docs/screenshots/` are visual only—this file is the prose guide.

**Version:** 0.1.1 · **Peers:** [koder-cli](https://github.com/KarmenLoop/koder-cli) · [CLI download](https://karmenloop.com/en/download.html)

---

## 1. Prerequisites

| Need | Detail |
|---|---|
| Node.js | **22.13+** (`node -v`) |
| Koder CLI + runtime | Install from the [official download](https://karmenloop.com/en/download.html). Confirm the CLI answers (e.g. `koder --version` or your installed binary name). A source checkout **without** the separately distributed runtime cannot run agent tasks. |
| Python (optional) | **3.9+** for `koder_sdk`; the client still starts a Node bridge |
| Model | Configured in Koder, or `KODER_MODEL` + `KODER_BASE_URL` + `KODER_API_KEY`, or a custom provider |

CLI discovery order: explicit `KODER_CLI_ROOT` / `cliRoot` / `cli_root` → `~/.koder-cli/current` → adjacent or vendored checkout. An invalid **explicit** path errors out; it is not silently replaced.

---

## 2. Install (from checkout)

```sh
git clone https://github.com/KarmenLoop/koder-sdk.git
cd koder-sdk
npm ci
npm run build
```

What this uses:

- **npm** — lockfile install (`npm ci`) and the repo `build` script (`scripts/build.mjs`) producing `dist/`.
- Package name in `package.json` is `koder-sdk`; this tutorial installs **from the git checkout**, not from a claimed npmjs.com release.
- Entry points after build: `dist/index.mjs`, types in `index.d.ts`, optional bin `koder-sdk-server`.

### Python package

Build JS first (wheel embeds the generated Node bridge):

```sh
python3 -m pip install ./python
```

`python/pyproject.toml` names the project `koder-sdk`, requires Python ≥ 3.9, MIT, no runtime pip dependencies beyond the bridge files. Optional overrides: `KODER_NODE`, `KODER_SDK_SERVER`.

---

## 3. First call without a paid model

Proves CLI + kernel + permission path:

```sh
node examples/custom-provider.mjs
```

Expected shape: in-process provider → approved write of `hello.txt` in a temp workspace → read-back → cleanup. **No** hosted API request.

Python twin:

```sh
python3 python/examples/custom_provider.py
```

If this fails with CLI/kernel discovery errors, fix the Koder install or set `KODER_CLI_ROOT` before debugging the SDK.

---

## 4. First streaming session (JS)

```js
import { createKoder } from "../dist/index.mjs";

const koder = await createKoder({
  workspace: process.cwd(),
  permission: "deny",
});

try {
  const session = await koder.session({ readOnly: true });
  const run = session.send("Explain the main entry point in this project.");
  for await (const event of run) {
    if (event.type === "delta") process.stdout.write(event.text);
    if (event.type === "tool_result") console.log("\n↳", event.name);
  }
  const result = await run;
  console.log("\n", result.status, result.exitCode, result.files);
} finally {
  await koder.close();
}
```

Or the one-shot helper (see `examples/quickstart.mjs`):

```sh
# Requires a real model via koder config or KODER_* env vars
node examples/quickstart.mjs /path/to/project "Explain what this project does"
```

`query({ workspace, prompt, permission, … })` returns a `Run` that is both async-iterable and thenable.

---

## 5. First session (Python)

```python
import asyncio
from koder_sdk import Koder

async def main():
    async with await Koder.create(workspace=".", permission="deny") as koder:
        session = await koder.session(read_only=True)
        run = session.send("Explain the main entry point.")
        async for event in run:
            # mirror JS streaming if your build exposes events the same way
            pass
        result = await run
        print(result.status, result.text)

asyncio.run(main())
```

Minimal await-only form (from README):

```python
result = await session.send("Explain the main entry point.")
print(result.status, result.text)
```

Use `query_sync` only when you are not already inside an event loop.

---

## 6. Permissions you will actually use

| Goal | Setting |
|---|---|
| Read-only exploration | `permission: "deny"` + `readOnly: true` / `read_only=True` |
| Allow file edits, still block shell | `"acceptEdits"` |
| Allow edits and commands (still no auto-answers to questions) | `"auto"` |
| Interactive approve | Custom handler inspecting `request.kind` (`edit` / `command` / `question`) |

Login-shaped requests are refused by the SDK. Cancel with `run.cancel()` or `AbortSignal` (JS). Overlapping sends → `BUSY`; closed client → `CLOSED`.

---

## 7. Multi-turn and reset

```js
const session = await koder.session();
await session.send("Summarize package.json");
await session.send("List the bin entries only");
await session.reset(); // clear conversation for a new topic
```

`session.messages` holds recorded history; the provider receives the slice that fits `contextWindow` / runtime budget.

---

## 8. Custom provider checklist

1. Implement `complete` (JS object form / Python positional form).
2. Return text + tool calls in the documented shape.
3. Set `contextWindow` / `context_window` to a real capacity (≥ 2048) when you know it.
4. Run `examples/custom-provider.mjs` or the Python twin before wiring a hosted model.

---

## 9. Update and verify

1. `git pull` (or fetch a newer tag when published).
2. `npm ci && npm run build`
3. Reinstall Python if you use it: `python3 -m pip install ./python` (or rebuild the wheel).
4. Read [CHANGELOG.md](../CHANGELOG.md) for 0.1.x behavior notes.
5. Smoke: `node examples/custom-provider.mjs` and, if you use models, `node examples/quickstart.mjs …`.

Dev checks:

```sh
npm run typecheck
npm test
npm run test:python
```

Wheel outside the tree:

```sh
npm run build
python3 -m pip wheel --no-deps ./python --wheel-dir wheelhouse
python3 scripts/test-python-wheel.py wheelhouse/koder_sdk-0.1.1-py3-none-any.whl
```

---

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| Cannot find CLI / kernel | Install CLI from the official page; set `KODER_CLI_ROOT` to the real install; verify runtime present |
| Explicit path rejected | Fix the path—SDK will not fall back when you forced one |
| Model unreachable / `exitCode` 2 | Vendor key, base URL, network; or use custom provider for offline tests |
| Python import works but bridge fails | Rebuild with `npm run build`; set `KODER_NODE` / `KODER_SDK_SERVER` |
| Permission always blocking | You are on `deny`—expected until you change preset/handler |

---

## Related

- [README](../README.md) — API tables and FAQ
- [index.d.ts](../index.d.ts) — TypeScript contracts
- Family: [koder-cli](https://github.com/KarmenLoop/koder-cli) · [koder-tui](https://github.com/KarmenLoop/koder-tui) · [karmenbot](https://github.com/KarmenLoop/karmenbot)
