// Generated from src/cli.ts by scripts/build.mjs. Edit the .ts source.
// The only file that reaches into koder-cli. The SDK shares its engine wrapper,
// model configuration and event format, so SDK runs behave like `koder --json`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { KoderSdkError } from "./errors.mjs";
























const here = path.dirname(fileURLToPath(import.meta.url));
const MARKER = path.join("src", "agent.mjs");

// An explicit location is never silently replaced by a fallback copy.
export function findCliRoot({ cliRoot, env = process.env }                                  = {})         {
  const explicit = cliRoot || env.KODER_CLI_ROOT;
  const home = env.HOME || env.USERPROFILE || os.homedir();
  const candidates = explicit ? [explicit] : [
    path.join(home, ".koder-cli", "current"),
    path.resolve(here, "..", "..", "koder-cli"),
    path.resolve(here, "..", "vendor", "koder-cli"),
  ];
  for (const candidate of candidates) {
    const root = path.resolve(candidate);
    if (fs.existsSync(path.join(root, MARKER))) return root;
  }
  throw new KoderSdkError("CLI_NOT_FOUND", `koder-cli not found. Tried: ${candidates.join(", ")}. Set KODER_CLI_ROOT or pass cliRoot.`);
}

const cache = new Map                            ();

export function loadCli(options                                  = {})                     {
  const root = findCliRoot(options);
  let pending = cache.get(root);
  if (!pending) {
    const load = (file        ) => import(pathToFileURL(path.join(root, "src", file)).href);
    pending = (async () => {
      const [agent, turn, provider, format, i18n, config, session] = await Promise.all(
        ["agent.mjs", "turn.mjs", "provider.mjs", "format.mjs", "i18n.mjs", "config.mjs", "session.mjs"].map(load),
      );
      return {
        root,
        importKernel: agent.importKernel,
        openAgent: agent.openAgent,
        openThread: agent.openThread,
        watcher: agent.watcher,
        diagnosticFetch: turn.diagnosticFetch,
        runPrompt: turn.runPrompt,
        exitCode: turn.exitCode,
        unreachable: turn.unreachable,
        normalizeRecord: provider.normalizeRecord,
        resolveProvider: provider.resolveProvider,
        publicRecord: provider.publicRecord,
        jsonEvent: format.jsonEvent,
        createT: i18n.createT,
        normalizeLang: i18n.normalizeLang,
        resolveLang: config.resolveLang,
        MODES: session.MODES,
      };
    })().catch((error) => {
      cache.delete(root);
      throw error;
    });
    cache.set(root, pending);
  }
  return pending;
}
