// Real model: set KODER_MODEL, KODER_BASE_URL and KODER_API_KEY, or run `koder model add` first.
//   node examples/quickstart.mjs /path/to/project "Explain what this project does"
import { query } from "../dist/index.mjs";

const [workspace = process.cwd(), prompt = "用三句话说明这个项目是做什么的"] = process.argv.slice(2);

const run = query({
  workspace,
  prompt,
  permission: async (request) => {
    if (request.kind === "edit") {
      console.log(`\n[edit] ${request.path}\n${request.diff}`);
      return false;
    }
    if (request.kind === "command") {
      console.log(`\n[command] ${request.command}`);
      return false;
    }
    return "cancel";
  },
});

for await (const event of run) {
  if (event.type === "delta") process.stdout.write(event.text);
  if (event.type === "tool_result") console.log(`\n  ↳ ${event.name}`);
}
const result = await run;
console.log(`\n\nstatus=${result.status} tokens=${result.usage.input}+${result.usage.output}${result.error ? ` error=${result.error.message} ${result.error.detail || ""}` : ""}`);
process.exitCode = result.exitCode;
