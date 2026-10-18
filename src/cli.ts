// The only file that reaches into koder-cli. The SDK shares its engine wrapper,
// model configuration and event format, so SDK runs behave like `koder --json`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { KoderSdkError } from "./errors.ts";

type Env = Record<string, string | undefined>;
type Fn = (...args: any[]) => any;

export interface CliModule {
  root: string;
  importKernel: (file: string, env?: Env) => Promise<any>;
  openAgent: Fn;
  openThread: Fn;
  watcher: Fn;
  diagnosticFetch: (base: typeof globalThis.fetch) => { fetch: typeof globalThis.fetch; state: { last: null | { status?: number; error?: string; host?: string } } };
  runPrompt: (options: Record<string, unknown>) => Promise<any>;
  exitCode: (outcome: unknown) => 0 | 1 | 2;
  unreachable: (thread: unknown) => boolean;
  normalizeRecord: (raw: unknown, env?: Env) => Record<string, unknown>;
  resolveProvider: (options: { file?: string; env?: Env }) => null | { record: Record<string, unknown>; source: string };
  publicRecord: (record: Record<string, unknown>) => Record<string, unknown>;
  jsonEvent: (event: unknown) => Record<string, unknown> | null;
  createT: (lang?: string) => (key: string, vars?: Record<string, unknown>) => string;
  normalizeLang: (value: unknown) => string | null;
  resolveLang: (options: { flag?: string; env?: Env }) => string;
  MODES: string[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const MARKER = path.join("src", "agent.mjs");

// An explicit location is never silently replaced by a fallback copy.
export function findCliRoot({ cliRoot, env = process.env }: { cliRoot?: string; env?: Env } = {}): string {
  const explicit = cliRoot || env.KODER_CLI_ROOT;
  const candidates = explicit ? [explicit] : [path.resolve(here, "..", "..", "koder-cli"), path.resolve(here, "..", "vendor", "koder-cli")];
  for (const candidate of candidates) {
    const root = path.resolve(candidate);
    if (fs.existsSync(path.join(root, MARKER))) return root;
  }
  throw new KoderSdkError("CLI_NOT_FOUND", `koder-cli not found. Tried: ${candidates.join(", ")}. Set KODER_CLI_ROOT or pass cliRoot.`);
}

const cache = new Map<string, Promise<CliModule>>();

export function loadCli(options: { cliRoot?: string; env?: Env } = {}): Promise<CliModule> {
  const root = findCliRoot(options);
  let pending = cache.get(root);
  if (!pending) {
    const load = (file: string) => import(pathToFileURL(path.join(root, "src", file)).href);
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
