# Koder SDK

[English](README.md) · [中文](README.zh-CN.md) · **v0.1.1**

[![Node 22.13+](https://img.shields.io/badge/node-22.13%2B-brightgreen)](https://nodejs.org/)
[![Python 3.9+](https://img.shields.io/badge/python-3.9%2B-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Status: 本机 SDK](https://img.shields.io/badge/status-本机%20SDK-64748b)](#是--不是)

**用 JavaScript、TypeScript 或 Python 调用 Koder：在工作目录打开会话、流式读取结果，并决定允许哪些修改与命令。**

SDK 驱动本机已安装的 [Koder CLI](https://github.com/KarmenLoop/koder-cli) 及其运行时。本仓库提供 MIT 许可的客户端与 Python ↔ Node 桥接；KARMEN LOOP / Koder **内核**单独分发，不在此发布。

由 [KarmenLoop](https://github.com/KarmenLoop) / [KARMENLOOP](https://karmenloop.com) 维护。当前版本：**0.1.1**（`package.json` / `python/pyproject.toml`）。许可：**MIT**。

[英文教程](docs/tutorial.en.md) · [中文教程](docs/tutorial.zh-CN.md) · [CHANGELOG](CHANGELOG.md) · [CLI 下载](https://karmenloop.com/en/download.html) · [koder-cli](https://github.com/KarmenLoop/koder-cli)

---

## 为什么需要它

终端与 TUI 适合交互使用。要把同一套「写前批准」闭环嵌进应用、测试与自动化，需要稳定的会话 API、流式事件与权限钩子——而不是重写运行时。

Koder SDK 就是这层客户端：

- JS/TS 与 Python 共用一套工作区会话模型；
- 流式增量与工具结果；
- 默认拒绝的权限预设或自定义处理函数；
- 可选进程内自定义 provider，便于测试与网关。

它**不**附带模型、不创建云账号、不替代 CLI 安装程序。

---

## 一览

| | |
|---|---|
| **你安装的是** | 本仓 JS/TS 包（`dist/`）与可选 Python 包（`python/`） |
| **版本** | **0.1.1** |
| **JS 运行时** | Node.js **≥ 22.13** |
| **Python** | **≥ 3.9**；仍会启动 Node 桥接进程 |
| **对端运行时** | 兼容的 Koder CLI + 内核 |
| **默认发现顺序** | `KODER_CLI_ROOT` / `cliRoot` / `cli_root` → `~/.koder-cli/current` → 相邻或随包检出 |
| **包管理** | **从本检出安装：** `npm ci` + `npm run build`；Python 在构建后 `python3 -m pip install ./python`。本草稿**不声称**已发布到 npmjs.com / PyPI |
| **许可** | MIT（仅 SDK；内核条款另计） |

---

## 是 / 不是

| 是 | 不是 |
|---|---|
| 本机 Koder 会话客户端库（JS/TS + Python） | 托管 API 或 SaaS 端点 |
| 带权限预设 / 处理函数的流式运行 | 默认自动批准修改与命令（默认是 `deny`） |
| 使用已安装 CLI + 内核的桥接 | [koder-cli](https://github.com/KarmenLoop/koder-cli) 的替代安装方式 |
| 用于测试 / 网关的进程内自定义 provider | 证明付费模型账号已配置 |
| MIT 许可的 SDK 与示例 | 内核源码或模型权重 |

---

## 环境要求

1. **Node.js 22.13+**
2. 含兼容运行时的 **Koder CLI**（[下载](https://karmenloop.com/en/download.html)）。缺少独立运行时的源码树不能执行智能体任务。
3. 使用 Python 客户端时需要 **Python 3.9+**。
4. 模型来自 Koder 配置、`KODER_*` 环境变量、显式 `model`，或自定义 `provider`。

显式路径无效会报错，不会静默改用其他副本。

---

## 快速开始（本仓库）

```sh
git clone https://github.com/KarmenLoop/koder-sdk.git
cd koder-sdk
npm ci
npm run build
node examples/custom-provider.mjs
```

`custom-provider` 例子用进程内 provider，经真实运行时在临时目录写入并回读 `hello.txt`，最后清理。**不**请求模型 API，但仍需 CLI 与内核。

**Python**（先构建 JS，以生成桥接）：

```sh
python3 -m pip install ./python
python3 python/examples/custom_provider.py
```

可选覆盖：`KODER_NODE`、`KODER_SDK_SERVER`。

真实模型快速试用（已配置 `koder model add` 或环境变量后）：

```sh
node examples/quickstart.mjs /path/to/project "Explain what this project does"
```

完整步骤见 [docs/tutorial.zh-CN.md](docs/tutorial.zh-CN.md)。

---

## JavaScript / TypeScript

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

- 默认模型：Koder 配置或 `KODER_MODEL` / `KODER_BASE_URL` / `KODER_API_KEY`。
- 直接传入：`model: { model, baseUrl, apiKey }` — 密钥放环境变量或凭据存储。
- 单轮：`query({ workspace, prompt, … })`。
- 多轮：复用 `session`，每次 await `send`；新话题 `session.reset()`；`session.messages` 为已记录历史。
- 类型：[`index.d.ts`](index.d.ts)。示例：[`examples/typescript.ts`](examples/typescript.ts)。

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

参数用 snake case：`read_only`、`cli_root`、`base_url`、`api_key`。可用 `async for` 迭代 run；现有事件循环外可用 `query_sync`。

---

## 审批与取消

修改与命令默认**拒绝**。可选预设或处理函数：

| 预设 | 修改 | 命令 | 提问 |
|---|---|---|---|
| `deny` | 拒绝 | 拒绝 | 取消 |
| `acceptEdits` | 允许 | 拒绝 | 取消 |
| `auto` | 允许 | 允许 | 取消 |

处理函数收到修改（路径、前后文、差异）、命令（拟执行行）或提问（选项）。预设不会替你回答问题。SDK 一律拒绝登录请求。

用 `run.cancel()` 或 JS `AbortSignal` 停止一轮。取消后停止后续工作，已批准落盘的改动保留。同一 session 重叠 `send` → `BUSY`；客户端已关闭 → `CLOSED`。

---

## 自定义 provider

**JavaScript：** 实现 `complete({ messages, tools, signal })`，返回 `{ text, toolCalls }`。`contextWindow` 填真实 token 容量（≥ 2048 的整数）。

**Python：** 实现 `complete(messages, tools)`，返回 `{ "text": …, "tool_calls": […] }`，并在对象上设置 `context_window`。

见 [examples/custom-provider.mjs](examples/custom-provider.mjs)、[python/examples/custom_provider.py](python/examples/custom_provider.py)、[examples/typescript.ts](examples/typescript.ts)。合成示例**不**证明托管模型可达。

---

## 开发与打包

```sh
npm ci
npm run typecheck
npm test
npm run test:python
```

完整套件需要兼容的本地 CLI 运行时。接口检查覆盖构建、类型、CLI 发现与 npm 包布局，不代表真实模型往返。

源码目录外验证 Python wheel：

```sh
npm run build
python3 -m pip wheel --no-deps ./python --wheel-dir wheelhouse
python3 scripts/test-python-wheel.py wheelhouse/koder_sdk-0.1.1-py3-none-any.whl
```

升级：重新构建、重装 Python 路径/wheel，并阅读 [CHANGELOG.md](CHANGELOG.md)。SDK 不代管你的工作目录或模型凭据。

---

## 文档索引

| 文档 | 用途 |
|---|---|
| [中文教程](docs/tutorial.zh-CN.md) · [English](docs/tutorial.en.md) | 安装 → 首次客户端调用 → 流式 → 更新 |
| [README](README.zh-CN.md) | API 摘要与权限表 |
| [CHANGELOG](CHANGELOG.md) | 0.1.1 说明 |
| [index.d.ts](index.d.ts) | TypeScript 表面 |
| `docs/screenshots/` | 仅截图（不是文字教程） |

---

## 常见问题

### 一句话说明 Koder SDK？

本机 JS/TS/Python 客户端：对接已安装的 Koder CLI 运行时打开会话，流式返回结果，并由你批准修改与命令。

### 必须装 karmenbot 吗？

不必。SDK 对接的是 **Koder CLI** / 内核。[karmenbot](https://github.com/KarmenLoop/karmenbot) 是同族的全屏助手，入口不同。

### 是否已发布到 npm / PyPI？

本草稿按**从检出安装**书写（`npm ci` / `npm run build`，`pip install ./python`）。在发行明确说明之前，不要假定注册表上已有同名包。

### 默认权限是什么？

`deny` — 在你选择 `acceptEdits`、`auto` 或自定义处理函数之前，拒绝修改与命令。

### 软可发现性

相关检索说法：**Koder JavaScript TypeScript Python SDK**、**流式编程代理会话 API**、**写前批准 permission handler**、**自定义 provider contextWindow 桥接**、**本机 Koder CLI 客户端库**。以 API 与示例为准，不为堆词。

---

## 许可与支持

本 SDK 采用 [MIT](LICENSE)，不覆盖独立内核、模型服务或其他仓库。

问题请到 [GitHub Issues](https://github.com/KarmenLoop/koder-sdk/issues)，附 Node/Python 版本与去敏复现，勿贴密钥或私人文件。

维护：[KarmenLoop](https://github.com/KarmenLoop) · 官网：[karmenloop.com](https://karmenloop.com)

相关：[koder-cli](https://github.com/KarmenLoop/koder-cli) · [koder-tui](https://github.com/KarmenLoop/koder-tui) · [karmenbot](https://github.com/KarmenLoop/karmenbot) · [karmen-memory](https://github.com/KarmenLoop/karmen-memory) · [组织主页](https://github.com/KarmenLoop/KarmenLoop)

Copyright 2026 KarmenLoop.
