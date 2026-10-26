# Koder SDK 教程（简体中文）

[English](tutorial.en.md) · [中文](tutorial.zh-CN.md) · 返回 [README](../README.zh-CN.md)

从本仓库安装、完成首次客户端调用与流式读取，再说明如何更新。`docs/screenshots/` 仅有截图，文字步骤以本文为准。

**版本：** 0.1.1 · **对端：** [koder-cli](https://github.com/KarmenLoop/koder-cli) · [CLI 下载](https://karmenloop.com/en/download.html)

---

## 1. 前置条件

| 需要 | 说明 |
|---|---|
| Node.js | **22.13+**（`node -v`） |
| Koder CLI + 运行时 | 从[官方下载](https://karmenloop.com/en/download.html)安装。缺少独立运行时的源码树不能执行智能体任务 |
| Python（可选） | **3.9+**；客户端仍会启动 Node 桥接 |
| 模型 | Koder 已配置，或 `KODER_MODEL` / `KODER_BASE_URL` / `KODER_API_KEY`，或自定义 provider |

CLI 发现顺序：显式 `KODER_CLI_ROOT` / `cliRoot` / `cli_root` → `~/.koder-cli/current` → 相邻或随包检出。显式路径无效会报错，不会静默替换。

---

## 2. 安装（从检出）

```sh
git clone https://github.com/KarmenLoop/koder-sdk.git
cd koder-sdk
npm ci
npm run build
```

说明：

- 使用 **npm** 按锁文件安装（`npm ci`），并由 `npm run build` 生成 `dist/`。
- `package.json` 包名为 `koder-sdk`；本教程按**从 git 检出安装**书写，不假定 npmjs.com 已有发行。
- 构建后入口：`dist/index.mjs`、类型 `index.d.ts`、可选命令 `koder-sdk-server`。

### Python 包

先构建 JS（wheel 内含生成的 Node 桥接）：

```sh
python3 -m pip install ./python
```

`python/pyproject.toml`：项目名 `koder-sdk`，Python ≥ 3.9，MIT，无额外 pip 运行时依赖。可选：`KODER_NODE`、`KODER_SDK_SERVER`。

---

## 3. 不花模型费的第一次调用

验证 CLI + 内核 + 权限路径：

```sh
node examples/custom-provider.mjs
```

预期：进程内 provider → 在临时目录批准写入 `hello.txt` → 回读 → 清理。**无**托管 API 请求。

Python：

```sh
python3 python/examples/custom_provider.py
```

若报 CLI/内核发现错误，先修好 Koder 安装或设置 `KODER_CLI_ROOT`，再查 SDK。

---

## 4. 首次流式会话（JS）

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

或使用 `examples/quickstart.mjs`（需真实模型配置或 `KODER_*`）：

```sh
node examples/quickstart.mjs /path/to/project "Explain what this project does"
```

`query({ workspace, prompt, permission, … })` 返回的 `Run` 既可 `for await`，也可 `await`。

---

## 5. 首次会话（Python）

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

已有事件循环时用异步客户端；循环外可用 `query_sync`。

---

## 6. 你会用到的权限

| 目标 | 设置 |
|---|---|
| 只读探索 | `permission: "deny"` 且 `readOnly: true` / `read_only=True` |
| 允许改文件、仍禁 shell | `"acceptEdits"` |
| 允许改文件与命令（仍不自动回答选择题） | `"auto"` |
| 交互批准 | 自定义处理函数，检查 `request.kind` |

登录类请求由 SDK 拒绝。取消：`run.cancel()` 或 JS `AbortSignal`。重叠发送 → `BUSY`；已关闭 → `CLOSED`。

---

## 7. 多轮与重置

```js
const session = await koder.session();
await session.send("Summarize package.json");
await session.send("List the bin entries only");
await session.reset();
```

`session.messages` 为已记录历史；provider 只收到适合上下文预算的部分。

---

## 8. 自定义 provider 清单

1. 实现 `complete`（JS 对象参数 / Python 位置参数）。
2. 按文档形状返回 text 与 tool calls。
3. 已知容量时设置 `contextWindow` / `context_window`（≥ 2048）。
4. 接入托管模型前先跑通 `examples/custom-provider.mjs` 或 Python 对应例子。

---

## 9. 更新与校验

1. `git pull`（或取得更新标签）。
2. `npm ci && npm run build`
3. 若用 Python：重新 `pip install ./python`（或重打 wheel）。
4. 阅读 [CHANGELOG.md](../CHANGELOG.md)。
5. 冒烟：`node examples/custom-provider.mjs`；有模型时再跑 `quickstart.mjs`。

开发检查：

```sh
npm run typecheck
npm test
npm run test:python
```

源码树外验证 wheel：

```sh
npm run build
python3 -m pip wheel --no-deps ./python --wheel-dir wheelhouse
python3 scripts/test-python-wheel.py wheelhouse/koder_sdk-0.1.1-py3-none-any.whl
```

---

## 10. 排障

| 现象 | 检查 |
|---|---|
| 找不到 CLI / 内核 | 官方页安装 CLI；设置正确的 `KODER_CLI_ROOT`；确认运行时存在 |
| 显式路径被拒绝 | 修正路径——强制指定时不会回退 |
| 模型不可达 / `exitCode` 2 | 密钥、Base URL、网络；离线测试改用自定义 provider |
| Python 能 import 但桥接失败 | 重新 `npm run build`；检查 `KODER_NODE` / `KODER_SDK_SERVER` |
| 权限总是拦 | 当前是 `deny`——改预设或处理函数前属预期 |

---

## 相关

- [README](../README.zh-CN.md) — API 与常见问题
- [index.d.ts](../index.d.ts) — TypeScript 约定
- 同族：[koder-cli](https://github.com/KarmenLoop/koder-cli) · [koder-tui](https://github.com/KarmenLoop/koder-tui) · [karmenbot](https://github.com/KarmenLoop/karmenbot)
