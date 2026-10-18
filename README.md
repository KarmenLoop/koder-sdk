# Koder

Koder does the work on your computer. You name a task. It reads the project, shows the change, and waits. Nothing is written, and no command runs, until you say yes.

Built by KARMEN. You bring the model account. Koder does not sell you one, and this release does not ship a model inside the box.

[karmenloop.com](https://karmenloop.com) · [Download](https://karmenloop.com/download.html) · [CLI source](https://github.com/KarmenLoop/koder-cli) · [info@karmenloop.com](mailto:info@karmenloop.com)

Download · [Quick start](#quick-start) · [Model](#3-connect-a-model) · [Chat apps](#7-connect-a-chat-app) · [Editors](#8-use-it-inside-an-editor) · [SDK](#9-call-koder-from-your-own-code)

**License.** The SDK in this repository is [MIT](LICENSE). The KARMEN LOOP kernel is not in this repository, is not published, and is not under that license. Installing from the site runs the kernel. It does not give you the kernel source.

## What Koder is

Koder is one product with three places to stand and one way to call it from code.

| You want | Open |
| --- | --- |
| A window, with the task, the diff, and the yes/no | Koder for desktop, from the [download page](https://karmenloop.com/download.html) |
| The whole terminal | `koder-tui` |
| One command, a script, or CI | `koder` |
| Your own TypeScript, JavaScript, or Python | This repository |

They share the model you configure and the language you pick. Set it once.

The desktop app, the TUI, and the CLI are the product people install. This repository is the SDK: the same run, called from your program. The kernel underneath, KARMEN LOOP, stays on our side.

## The brand

KARMEN is the name on the work. Koder is the product you install and talk to. KARMEN LOOP is the kernel those installers run.

We publish the CLI source and this SDK. We do not publish the kernel. Copyright © KARMEN / Koder. All rights reserved on the kernel. If you need the product, install it. If you need to call it, use the SDK. If you need the kernel source, that is not on offer here.

Site: [karmenloop.com](https://karmenloop.com). Mail: [info@karmenloop.com](mailto:info@karmenloop.com).

## What it can do

- **Talk in the project.** `koder` in a folder. The task stays in that folder.
- **One shot.** `koder run` for edits and commands. `koder ask` when you only want an answer.
- **Review, fix, test.** `koder review` on a diff. `koder fix` reruns your check. `koder test` writes tests in the style the repo already uses.
- **A flow.** `koder flow` chains steps from JSON. `koder ci init` adds a GitHub Actions workflow.
- **Chat apps.** Feishu, Lark, WeCom, WeChat, DingTalk, Telegram, Slack, Discord, WhatsApp. Strangers get a pairing code. Edits still wait for a yes.
- **Editors.** Zed, Neovim, and Emacs, through `koder acp`.
- **Your code.** `query()` or a session, in JavaScript or Python, with the same permission rules.

## What it looks like

The first `koder` opens setup. If no model is configured, that row says so.

![Koder setup on first launch](docs/screenshots/cli-start-dark.jpg)

`koder run` prints the diff before it writes. Red is gone. Green is new. `y` writes the file. Any other key leaves it alone.

![Confirming one edit](docs/screenshots/cli-diff-dark.jpg)

`koder help review` is the full page for that command. Same shape for the others: `koder help <command>`.

![Help for review](docs/screenshots/cli-review-dark.jpg)

`koder-tui` fills the screen. Version, folder, model, and mode on top. The conversation in the middle. The input at the bottom.

![Koder TUI after open](docs/screenshots/tui-home-dark.jpg)

An edit in the TUI opens a diff. `y` accepts. `n` or Esc rejects.

![Confirming an edit in the TUI](docs/screenshots/tui-diff-dark.jpg)

After a clean install, the terminal looks like this.

![Install finished](docs/screenshots/cli-install-dark.jpg)

Those two edit shots were taken against a scripted local endpoint, not a live model bill. The screens are Koder CLI 0.2.0 and Koder TUI 0.1.0.

## Quick start

Do these in order. Stop at the first step that fails and fix that one. Skipping ahead is how people end up with a model that "works" and a product that never answers.

You need a terminal, a network connection for the installer and for whatever model you pick, and a folder you are allowed to edit. macOS 11 or later, a current Linux, WSL, or Windows 10 or 11. Windows 7 and 8 cannot run it. Node.js 22 is the floor. The installer downloads Node.js 22 from nodejs.org when it is missing, checks the SHA-256, then unpacks it. The Koder package is checked the same way. No admin account. No invite code.

### 1. Install the CLI

macOS, Linux, or WSL. Paste this and press Return.

```bash
curl -fsSL https://karmenloop.com/install/koder-cli.sh | bash
```

Windows PowerShell:

```powershell
irm https://karmenloop.com/install/koder-cli.ps1 | iex
```

Command Prompt on Windows, if that is what you have open:

```bat
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://karmenloop.com/install/koder-cli.ps1 | iex"
```

The scripts themselves:

- <https://karmenloop.com/install/koder-cli.sh>
- <https://karmenloop.com/install/koder-cli.ps1>
- <https://karmenloop.com/install/koder-cli.cmd>

On a Mac or Linux the files land in `~/.koder-cli` and the `koder` command lands in `~/.local/bin`. On Windows they land in `%LOCALAPPDATA%\koder-cli`. If a new terminal says `koder: command not found`, the shell has not picked up `~/.local/bin` yet. Open a new terminal, or add that directory to your `PATH`, then try again.

Check that the command is real:

```bash
koder version
koder about
```

`koder about` prints the site and the updates page. Later, `koder update` pulls a newer build. `koder uninstall` removes the CLI. `koder uninstall --purge` also deletes the settings.

The installer opens setup when it finishes. If you closed that screen, run:

```bash
koder setup
```

### 2. Walk through setup once

`koder setup` is a full-screen menu. Arrow keys or Tab move. Enter picks. Esc goes back. A number jumps. Typing filters a list. If your terminal reports the mouse, a click selects and the wheel scrolls. Each change is saved when you make it. You do not have a separate Save button.

Set these before you try a real task:

1. Language. English or Chinese. `koder lang en` does the same thing from the prompt.
2. Theme, if you care. `koder theme dark`, `koder theme light`, or `koder theme auto`. Auto reads `COLORFGBG` and falls back to dark. The colors are the site colors: dark stage `#12141c`, light stage `#e4e1d8`.
3. Model. This is the next section. Do not leave setup until a model is selected and a key is stored, unless you are on a local model that needs no key.

Inside a later chat, `/setup` opens the same menu. The first `koder` with no model opens it for you.

The TUI is a second install. Do it after the model works, not before.

```bash
curl -fsSL https://karmenloop.com/install/koder-tui.sh | bash
```

```powershell
irm https://karmenloop.com/install/koder-tui.ps1 | iex
```

Scripts: <https://karmenloop.com/install/koder-tui.sh> · <https://karmenloop.com/install/koder-tui.ps1> · <https://karmenloop.com/install/koder-tui.cmd>

### 3. Connect a model

Koder talks to a model you already have. The bill goes to that provider. We do not proxy the key and we do not add a markup.

Prefer an environment variable. The file then stores the variable name. A key you paste is stored in plain text in `~/.koder-cli/provider.json` (mode `600`). On Windows that file is under `%LOCALAPPDATA%\koder-cli\provider.json`.

See every preset Koder knows:

```bash
koder model presets
```

There are 31. The ids you will actually type include `deepseek`, `kimi`, `qwen`, `claude`, `chatgpt`, `gemini`, `grok`, `mistral`, `openrouter`, `groq`, `local`, and `custom`. `koder model presets` is the list that matters on your machine. Do not guess an id.

**DeepSeek, the example people copy.** Put the key in the environment first. Then tell Koder the name of that variable.

macOS or Linux, in `~/.zshrc` or `~/.bashrc` if you want it next time too:

```bash
export DEEPSEEK_API_KEY="the-key-from-the-deepseek-console"
koder model set --preset deepseek --key-env DEEPSEEK_API_KEY
```

Windows PowerShell, for this window:

```powershell
$env:DEEPSEEK_API_KEY = "the-key-from-the-deepseek-console"
koder model set --preset deepseek --key-env DEEPSEEK_API_KEY
```

To keep it on Windows, set a user environment variable named `DEEPSEEK_API_KEY` in System Properties, open a new terminal, and run the `koder model set` line again.

**Other presets, same shape.** Swap the preset id and the variable name.

```bash
export OPENAI_API_KEY="sk-..."
koder model set --preset chatgpt --key-env OPENAI_API_KEY

export ANTHROPIC_API_KEY="sk-ant-..."
koder model set --preset claude --key-env ANTHROPIC_API_KEY
```

**A model on this machine, through Ollama.** Start Ollama first, pull the model you named, then:

```bash
koder model set --preset local --model qwen3:8b
```

Change `qwen3:8b` to a model `ollama list` actually shows. A local preset still needs the server listening. If `koder` says it cannot reach the API, the usual cause is Ollama not running, not a missing key.

**A provider that is not in the list.** You need three facts from their docs: the model id, the base URL, and whether the API is OpenAI-shaped or Anthropic-shaped.

```bash
export MY_MODEL_KEY="the-key"
koder model set \
  --model their-model-id \
  --base-url https://api.example.com/v1 \
  --protocol openai \
  --key-env MY_MODEL_KEY
```

Use `--protocol anthropic` when their docs say so. Anthropic-style keys are sent as `x-api-key`. OpenAI-style keys are sent as `Authorization: Bearer`.

**CI, without a file.** The process environment is enough:

```bash
export KODER_MODEL="their-model-id"
export KODER_BASE_URL="https://api.example.com/v1"
export KODER_API_KEY="the-ci-secret"
```

**More than one model.** `koder model add review --preset claude --key-env ANTHROPIC_API_KEY` stores a named model. `koder model list` shows them. `koder model use review` makes one the default. `koder model show` prints the current one with the key masked. `koder model remove review` deletes a named model. `koder model clear` removes the default configuration.

**Context window.** If answers get cut off, set the window the provider documents, not a number you hope is fine.

```bash
koder model context --context-window 1048576 --max-output 8192
```

That keeps the current model and key. It only changes the limits.

**Prove the key before you blame the product.**

```bash
koder model show
koder doctor
koder model test
```

`koder doctor` checks the local setup and does not spend tokens. `koder doctor --api` and `koder model test` send a small request. That can cost a few tokens. If the result is HTTP 401, the key is wrong, unset in this terminal, or for a different provider than the preset. If it is a network error, read the host name in the message. That is the machine Koder tried. Fix DNS, the VPN, or the base URL. Do not rerun the whole installer.

You are ready for real work when `koder model test` returns text, not an error.

### 4. Do one real task

```bash
cd /path/to/a/project/you/can/edit
koder run "Add a one-line comment at the top of README.md that says draft"
```

Read the diff. Type `y` and press Return to write it. Type anything else to refuse. Open the file. If you typed `y`, the line is there. If you refused, the file is unchanged.

That is the product working. Everything after this is optional.

A few rules that surprise people:

- With no `--yes`, and no terminal to ask you, edits and commands are refused. Scripts do not get a free pass.
- `--yes` accepts file edits and shell commands. It does not pick a multiple-choice answer for you. It does not type a password. Login prompts are cancelled.
- `--json` prints one JSON object per line. Exit code `0` finished. `1` was cancelled or the task failed. `2` never really started: bad arguments, or no model.

```bash
koder run --yes --json "Add the install steps to the README"
```

### 5. The commands you will actually use

In the folder:

```bash
koder
```

Type the task. Enter sends. `/help` lists commands. `/setup` opens settings. `/lang en` switches language. `/exit` or Ctrl+D quits.

Without staying in the chat:

```bash
koder ask "Which file starts the login flow?"
koder review --base origin/main --format markdown --out review.md
koder fix --check "npm test"
koder test src/price.js --check "npm test"
```

`koder ask` does not propose edits or commands. `review` reads the diff, the tree, rule files such as `AGENTS.md`, and recent commits, then writes each note with a file, a line, a severity, and a suggested change. `fix` runs your check, hands Koder the failure, and runs the check again until it passes or the attempts run out. The default is 3. `test` drafts tests in the style already in the repo, then runs the check you named.

A longer tutorial, with no model bill, lives in the product:

```bash
koder learn
```

That builds a practice project in a temp folder and walks you through diffs, approvals, review, fix, flows, chat apps, and editors. Enter goes forward, `b` goes back, `q` quits. Progress is saved. `koder learn --print` prints the text. `koder learn --print --os powershell` (or `cmd`, `mac`, `linux`) prints the edition for that system.

Flows and CI, when you want them:

```bash
koder flow init pr-gate
koder ci init
```

`koder ci init` writes `.github/workflows/koder.yml`. A pull request is reviewed when it opens or updates. A comment of `/koder review` or `/koder fix` runs that action. Comments that change the repo are accepted only from people with write access.

Flags you will type more than once:

| Flag | What it does |
| --- | --- |
| `-w`, `--workspace` | Folder to work in. Default is the current directory. |
| `-y`, `--yes` | Accept file edits and commands. |
| `--json` | One JSON event per line. |
| `--mode` | `standard`, `code`, `minimal`, `plan`, `execute`, `report`, or `enhance`. |
| `--lang` | `zh` or `en` for this run only. |
| `--no-color` | Plain text. |

`koder help` and `koder help <command>` print the rest.

### 6. The full-screen terminal

Only after `koder model test` succeeds:

```bash
cd /path/to/project
koder-tui
```

Enter sends. Ctrl+J is a newline. `/` opens the command list: `/help`, `/learn`, `/lang`, `/mode`, `/yes`, `/model`, `/sidebar`, `/about`, `/exit`. Esc stops the current turn. Edits you already accepted stay on disk. The TUI reads the same model as `koder setup`. If it says it cannot reach the API, go back to section 3. Do not reinstall the TUI.

### 7. Connect a chat app

Skip this if you only want the terminal. Come back when you want Feishu, Lark, WeCom, WeChat, DingTalk, Telegram, Slack, Discord, or WhatsApp to reach the same Koder.

The model from section 3 is required. A chat app with no working model connects and then has nothing to say.

One command per app:

```bash
koder gateway setup feishu
```

Replace `feishu` with `wecom`, `weixin`, `dingtalk`, `telegram`, `slack`, `discord`, or `whatsapp`. Aliases that also work: `lark` for Feishu, `wechat` for WeChat, `wework` for WeCom, `tg` for Telegram. With no name, `koder gateway setup` lets you pick.

Koder asks for the credentials that app's console gives you, checks them online, and saves them under the Koder config directory. WeChat can be a QR scan instead of a pasted token. Feishu, WeCom, DingTalk, Slack, and Discord keep a long connection. You do not open a port on your router for those. WhatsApp's cloud API is the exception: it calls a local port, which you expose with a tunnel you control.

What you will be asked for:

| App | Command | What to paste |
| --- | --- | --- |
| Feishu or Lark | `koder gateway setup feishu` | App ID, App Secret. Domain is `feishu` or `lark`. Default is Feishu. |
| WeCom | `koder gateway setup wecom` | Bot ID, Secret. |
| WeChat | `koder gateway setup weixin` | Scan the QR, or paste Bot account ID and Bot Token. User ID is optional. |
| DingTalk | `koder gateway setup dingtalk` | Client ID (AppKey), Client Secret (AppSecret). |
| Telegram | `koder gateway setup telegram` | Bot token from BotFather. |
| Slack | `koder gateway setup slack` | App token (`xapp-`) and bot token (`xoxb-`). |
| Discord | `koder gateway setup discord` | Bot token. |
| WhatsApp | `koder gateway setup whatsapp` | Phone number ID, access token, a verify token you invent, optional app secret, local port (default `8788`). Then tunnel that port. |

Create the bot in that product's own console first. Koder does not create the Feishu app or the Slack app for you. Turn on the permissions that console requires for receiving messages. If setup says the credentials failed, the id or secret is wrong, or the app is not published. Fix it there. Do not invent a second config file.

Useful follow-ups:

```bash
koder gateway doctor feishu
koder gateway start --background
koder gateway status
koder gateway stop
koder gateway list
```

`doctor` checks the saved credentials and the connection. `start --background` keeps receiving after you close the window. `--foreground` stays in this terminal, which is the right choice while you are still debugging. `--no-start` saves and checks without receiving.

**People you do not know.** A stranger who messages the bot gets a pairing code. They cannot use Koder until you approve it on the machine:

```bash
koder gateway pair K7Q2MX
```

Use the code they were shown. You can tighten who is allowed:

```bash
koder gateway policy feishu --dm pairing --group allow
```

**Edits from chat.** A file change or a command still asks. In the chat, answer yes to allow it. A refused change is not written. Pairing does not turn that off.

`koder gateway help` prints the policy and diagnostic flags.

### 8. Use it inside an editor

Zed, Neovim, and Emacs talk to `koder acp`. You do not reconfigure the model for the editor. The editor starts the same `koder` you already set up.

Print the snippet for the editor you use:

```bash
koder editor zed
koder editor nvim
koder editor emacs
```

On Windows, add the system so the paths match:

```bash
koder editor zed --os powershell
```

`--os` is `powershell`, `cmd`, `mac`, or `linux`.

Paste the printed config into that editor's settings, reload the editor, and open the folder you want. Approve diffs in the editor the same way you would in the terminal. If the editor cannot find `koder`, the `PATH` in the editor's environment is not the `PATH` in your terminal. Fix that in the editor, then try again.

`koder acp` itself is the protocol session. Editors start it. You rarely type it.

### 9. Call Koder from your own code

Do this last. The CLI model test should already succeed. The SDK drives that same CLI.

This repository is the SDK. Node.js 22.13 or newer. Python 3.9 or newer only if you want Python.

```bash
git clone https://github.com/KarmenLoop/koder-sdk.git
cd koder-sdk
npm run build
```

Python, from that same checkout:

```bash
pip install ./python
```

`KODER_NODE` picks the Node binary. `KODER_SDK_SERVER` picks `bin/koder-sdk-server.mjs` if it is not next to the Python package. `KODER_CLI_ROOT` picks a CLI checkout when the installed `koder` is not the one you want.

JavaScript, one shot:

```js
import { query } from "koder-sdk";

const result = await query({
  workspace: "/path/to/project",
  prompt: "Fix the empty dereference in src/app.js",
  permission: "acceptEdits",
});

console.log(result.status, result.text, result.files);
```

Stream the same call:

```js
for await (const event of query({ workspace, prompt })) {
  if (event.type === "delta") process.stdout.write(event.text);
}
```

`status` is `completed`, `cancelled`, `error`, or `unreachable`. `exitCode` matches the CLI: `0` done, `1` cancelled or failed, `2` could not start. `files` is what this turn wrote.

Several turns:

```js
import { createKoder } from "koder-sdk";

const koder = await createKoder({
  workspace: "/path/to/project",
  permission(request) {
    if (request.kind === "edit") return request.path.startsWith("src/");
    if (request.kind === "command") return request.command.startsWith("npm test");
    return "cancel";
  },
});

const session = await koder.session({ mode: "code" });
await session.send("Read the project layout");
await session.send("Add tests for utils");
await koder.close();
```

One session, one turn at a time. A second `send` while the first is running throws `BUSY`. `session.cancel()`, or an `AbortSignal`, stops the turn. `session.reset()` starts a fresh conversation. `session.messages` is the history. `koder.session({ readOnly: true })` does not offer tools that change files.

Python:

```python
import asyncio
from koder_sdk import Koder, query

async def main():
    result = await query(
        "Fix the empty dereference in src/app.py",
        "/path/to/project",
        permission="acceptEdits",
    )
    print(result.status, result.text, result.files)

    async with await Koder.create(
        "/path/to/project",
        permission=lambda request: request["kind"] == "edit",
    ) as koder:
        session = await koder.session(mode="code")
        await session.send("Read the project layout")
        await session.send("Add tests for utils")

asyncio.run(main())
```

No event loop: `query_sync(prompt, workspace, ...)`. Permission functions and a custom `provider` can be plain or `async`. Model fields accept `base_url` or `baseUrl`.

The model is chosen in this order: a `provider` object with `complete()`, a `model` object or a path to provider JSON, `KODER_MODEL` plus `KODER_BASE_URL` and `KODER_API_KEY`, then whatever `koder model` saved. None of those yields `MODEL_MISSING`.

Permission, same rules as the terminal:

| `kind` | You see | You may return |
| --- | --- | --- |
| `edit` | `path`, `before`, `after`, `diff` | `true`, `false`, or `{ allow }` |
| `command` | `command` | `true`, `false`, or `{ allow }` |
| `question` | `question`, `options` | an index, the option text, or `{ choice }` |

`"cancel"` or `{ cancel: true }` stops the turn. Presets: `"deny"` (default), `"acceptEdits"`, `"auto"` for edits and commands. A preset never answers a question. A thrown error, a nonsense answer, or an option that is not in the list is a no. Login and password requests are refused and never handed to your function.

Other codes: `BAD_WORKSPACE`, `BAD_MODE`, `BAD_PERMISSION`, `BAD_PROVIDER`, `BAD_PROMPT`, `BUSY`, `CLOSED`, `CLI_NOT_FOUND`. Python also uses `NODE_NOT_FOUND`, `SERVER_NOT_FOUND`, `SERVER_NOT_BUILT`, and `BRIDGE_CLOSED`.

Another language can speak to `node bin/koder-sdk-server.mjs`. One JSON object per line. stdout is protocol only. Close stdin and the process exits. Methods: `initialize`, `koder.create`, `koder.close`, `session.create`, `session.send`, `session.cancel`, `session.reset`, `session.messages`. Events arrive as `run.event`. Set `permission` or `provider` to `"client"` and the server asks you with `permission.request` and `provider.complete`. An error or a dropped connection is a refusal.

Examples in this repo: `examples/quickstart.mjs`, `examples/typescript.ts`, `examples/custom-provider.mjs`, `python/examples/quickstart.py`, `python/examples/custom_provider.py`.

## When it does not work

| What you see | What it usually is |
| --- | --- |
| `koder: command not found` | Install finished, `PATH` did not. New terminal, or add `~/.local/bin`. |
| Setup says no model | Section 3 was skipped. `koder model set` again. |
| HTTP 401 | Wrong key, empty variable in this shell, or the key belongs to another provider. |
| Cannot reach the API | VPN, DNS, Ollama not running, or a bad `--base-url`. Read the host in the error. |
| It refuses every edit | No TTY and no `--yes`. Expected. |
| Chat app connects, then silence | Model test was never green, or the gateway is stopped. `koder gateway status`, then `koder model test`. |
| A stranger cannot talk to the bot | They need `koder gateway pair` with their code. |
| Editor cannot see `koder` | The editor has a different `PATH`. |

`koder doctor` is the first command. `koder doctor --api` is the second, and it can spend a few tokens.

## License

The SDK in this repository is MIT. See [LICENSE](LICENSE).

The KARMEN LOOP kernel is not in this repository, is not published, and is not MIT. Copyright © KARMEN / Koder. All rights reserved. The CLI source lives separately at [KarmenLoop/koder-cli](https://github.com/KarmenLoop/koder-cli) under that repository's license. Downloading an installer from [karmenloop.com](https://karmenloop.com/download.html) does not grant the kernel source.

## Contact

[GitHub issues on this repo](https://github.com/KarmenLoop/koder-sdk/issues) for the SDK. [info@karmenloop.com](mailto:info@karmenloop.com) for the product. [karmenloop.com](https://karmenloop.com).
