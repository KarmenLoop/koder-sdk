# Koder SDK

[English](README.md) | 简体中文

用 JavaScript、TypeScript 或 Python 调用 Koder：在工作目录创建会话、读取流式结果，并决定允许哪些修改与命令。

SDK 使用本机已安装的 Koder CLI 和运行时。本仓库提供 MIT 许可的 SDK 与 Python 桥接程序；KARMEN LOOP 内核单独分发，按自己的条款使用。

## 环境要求

- Node.js 22.13+；TypeScript 源码构建使用 Node 内置类型剥离能力。
- 含兼容运行时的 Koder CLI。默认先检查 `~/.koder-cli/current`，再检查相邻或随包的 CLI 副本。
- Python 客户端需要 Python 3.9+，同时仍会启动 Node 桥接进程。
- Koder 已配置模型，或显式传入模型设置，或提供自定义 provider。

用 `KODER_CLI_ROOT`，或 JavaScript 的 `cliRoot` / Python 的 `cli_root` 指定安装位置。显式路径无效会报错，不会静默换用其他副本。

从[官方页面](https://karmenloop.com/en/download.html)取得 CLI；缺少单独分发运行时的源码副本不能执行智能体任务。

## 下载与本地试用

```sh
git clone https://github.com/KarmenLoop/koder-sdk.git
cd koder-sdk
npm run build
node examples/custom-provider.mjs
```

这个例子用进程内 provider，通过真实运行时在临时目录写入并回读 `hello.txt`，最后清理。它不请求模型 API，但仍需 CLI 与内核。

Python：

```sh
python3 -m pip install ./python
python3 python/examples/custom_provider.py
```

制作 Python 分发包前先运行 `npm run build`。wheel 包含生成的 Node 桥接程序，源码目录移动或移除后仍可使用；Node 与 Koder CLI 仍需另行安装。必要时用 `KODER_NODE` 和 `KODER_SDK_SERVER` 指定 Node 与桥接路径。

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

默认模型来自 Koder 配置，或 `KODER_MODEL`、`KODER_BASE_URL`、`KODER_API_KEY`。也可传 `model: { model, baseUrl, apiKey }`。密钥放在环境变量或凭据存储中，不写入源码。

`query({ workspace, prompt, ...options })` 用于单轮。相关任务复用 session，每次等待 send 完成，再发下一轮；新话题可用 `session.reset()`。`session.messages` 提供已记录历史，provider 只收到适合其上下文预算的部分。

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

Python 参数采用 snake case，如 `read_only`、`cli_root`、`base_url`、`api_key`。run 支持 await 与 `async for`。同步调用可用 `query_sync`；现有事件循环里使用异步客户端。

## 审批与取消

修改和命令默认拒绝，可选预设或逐项检查请求的处理函数：

| 预设 | 修改 | 命令 | 提问 |
| --- | --- | --- | --- |
| `deny` | 拒绝 | 拒绝 | 取消 |
| `acceptEdits` | 允许 | 拒绝 | 取消 |
| `auto` | 允许 | 允许 | 取消 |

修改请求包含路径、前后正文与差异，命令请求包含拟执行命令。问题需要真实的选项回答，预设不会代替用户答复；SDK 拒绝登录请求。

用 `run.cancel()` 或 JavaScript `AbortSignal` 停止一轮。取消停止后续工作，已批准并落盘的改动保留。并行向同一 session 发送会报 `BUSY`，客户端关闭后发新任务会报 `CLOSED`。

## 自定义 provider

JavaScript 实现 `complete({ messages, tools, signal })`，返回 `{ text, toolCalls }`。`contextWindow` 应填写模型真实 token 容量，必须为至少 2048 的整数，运行时据此限制上下文。

Python 实现 `complete(messages, tools)`，返回 `{ "text": ..., "tool_calls": [...] }`；对象的 `context_window` 将同样的容量传给桥接层。省略时使用保守默认值，可能裁掉较早轮次。

查看 [JavaScript 例子](examples/custom-provider.mjs)、[Python 例子](python/examples/custom_provider.py)与 [TypeScript 例子](examples/typescript.ts)。样本为合成数据，不证明真实托管模型已配置或可达。

## 开发、打包与检查

```sh
npm ci
npm run typecheck
npm test
npm run test:python
```

完整 JavaScript/Python 测试需要兼容的本地 CLI 运行时。自动接口检查构建 SDK、检查类型与 CLI 发现并检查 npm 包，不代表真实模型往返已通过。

在源码目录之外验证 Python wheel：

```sh
npm run build
python3 -m pip wheel --no-deps ./python --wheel-dir wheelhouse
python3 scripts/test-python-wheel.py wheelhouse/koder_sdk-0.1.1-py3-none-any.whl
```

wheel 检查会启动其随包桥接程序，在临时目录完成已批准写入，并检查第二轮能回忆第一轮。使用本地 provider，无付费 API 请求。升级后重新构建并核对 [CHANGELOG.md](CHANGELOG.md)，回退使用已验证的旧发行版本；SDK 不代管用户工作目录或模型配置。

## 许可与支持

SDK 采用 [MIT](LICENSE)，不覆盖独立内核、模型服务或其他仓库。问题可在 [GitHub Issues](https://github.com/KarmenLoop/koder-sdk/issues) 提交，请附 Node/Python 版本和去敏例子，不要附密钥或私人文件。产品信息见[官网](https://karmenloop.com)。
