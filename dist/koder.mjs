// Generated from src/koder.ts by scripts/build.mjs. Edit the .ts source.
import fs from "node:fs";
import path from "node:path";

import {                 loadCli } from "./cli.mjs";
import { KoderSdkError, fromCliError } from "./errors.mjs";
import {                                            resolvePermission, toDecision, toRequest } from "./permission.mjs";
import { Run } from "./run.mjs";



















const REASONS                               = { "turn.cancelled": "cancelled", "turn.secretCancelled": "login_refused", "turn.tooMany": "too_many_pauses" };
const KIND = { change: "edit", approval: "command", choice: "question", secret: "login" }         ;

// Fetch callbacks can update this state while runPrompt is awaited.
function diagnosticFailure(diag             ) {
  return diag.state.last;
}

function checkWorkspace(value                    )         {
  const workspace = path.resolve(value || process.cwd());
  let stat                  = null;
  try {
    stat = fs.statSync(workspace);
  } catch {}
  if (!stat?.isDirectory()) throw new KoderSdkError("BAD_WORKSPACE", `workspace is not a directory: ${workspace}`);
  return workspace;
}

// Same order as the koder command when nothing is passed: KODER_* variables, then the saved CLI model.
function chooseModel(cli           , { model, provider, env }                                                                       ) {
  if (provider) {
    if (typeof provider.complete !== "function") throw new KoderSdkError("BAD_PROVIDER", "provider must have a complete() method");
    if (provider.contextWindow !== undefined && (!Number.isSafeInteger(provider.contextWindow) || provider.contextWindow < 2048)) {
      throw new KoderSdkError("BAD_PROVIDER", "provider.contextWindow must be an integer of at least 2048 tokens");
    }
    return { record: null, override: provider, info: { name: provider.name || provider.model || "custom", model: provider.model || "", source: "provider" } };
  }
  let found                                                             = null;
  if (typeof model === "string") found = cli.resolveProvider({ file: model, env });
  else if (model && typeof model === "object") found = { record: cli.normalizeRecord(model, env), source: "options" };
  else found = cli.resolveProvider({ env });
  if (!found) throw new KoderSdkError("MODEL_MISSING", "No model configured. Pass `model`, set KODER_MODEL and KODER_BASE_URL, or run `koder model add`.");
  return { record: found.record, override: null, info: { ...cli.publicRecord(found.record), source: found.source }              };
}

function checkMode(cli           , mode         )                   {
  if (mode !== undefined && !cli.MODES.includes(mode          )) throw new KoderSdkError("BAD_MODE", `unknown mode "${mode}". Available: ${cli.MODES.join(", ")}`);
  return mode                    ;
}

export async function createKoder(options               = {})                 {
  const env      = options.env || process.env;
  let cli           ;
  try {
    cli = await loadCli({ cliRoot: options.cliRoot, env });
  } catch (error) {
    throw fromCliError(error);
  }
  const t = cli.createT(cli.resolveLang({ flag: options.lang, env }));
  try {
    const workspace = checkWorkspace(options.workspace);
    const defaultMode = checkMode(cli, options.mode) || "standard";
    const defaultPermission = resolvePermission(options.permission);
    const chosen = chooseModel(cli, { model: options.model, provider: options.provider, env });
    const diag = cli.diagnosticFetch(options.fetch || globalThis.fetch);
    const harness = await cli.openAgent({ workspace, record: chosen.record, providerOverride: chosen.override, fetchImpl: diag.fetch, contextRatio: options.contextRatio ?? 0.75, env });
    if (chosen.override?.contextWindow !== undefined) {
      // The harness reads its context budget from the selected provider record,
      // including when complete() is supplied by the SDK caller.
      const id = "sdk-custom-provider";
      await harness.store.saveProviders([{ id, name: chosen.info.name, model: chosen.info.model, contextWindow: chosen.override.contextWindow }]);
      await harness.store.saveSettings({ providerId: id });
    }
    const { unifiedDiff } = await cli.importKernel(path.join("harness", "diff.mjs"), env);
    const watch = cli.watcher(harness);
    return new Koder({ cli, t, env, workspace, harness, watch, diag, diff: unifiedDiff, model: chosen.info, defaultMode, defaultPermission });
  } catch (error) {
    throw fromCliError(error, t);
  }
}

export class Koder {
  #ctx     ;
  #sessions = new Set         ();
  #closed = false;

  constructor(ctx     ) {
    this.#ctx = ctx;
  }

  get workspace()         {
    return this.#ctx.workspace;
  }

  get model()            {
    return { ...this.#ctx.model };
  }

  get closed()          {
    return this.#closed;
  }

  tools()           {
    return this.#ctx.harness.toolCatalog().map((tool     ) => tool.name || tool.function?.name).filter(Boolean);
  }

  async session({ mode, readOnly = false, permission }                                                                                         = {})                   {
    if (this.#closed) throw new KoderSdkError("CLOSED", "this Koder instance is closed");
    const ctx = this.#ctx;
    const chosen = checkMode(ctx.cli, mode) || ctx.defaultMode;
    const handler = permission === undefined ? ctx.defaultPermission : resolvePermission(permission);
    const thread = await ctx.cli.openThread(ctx.harness, { mode: chosen, interaction: readOnly ? "ask" : "agent" });
    const session = new Session(ctx, { thread, mode: chosen, readOnly, permission: handler, isClosed: () => this.#closed });
    this.#sessions.add(session);
    return session;
  }

  async close()                {
    if (this.#closed) return;
    this.#closed = true;
    await Promise.allSettled([...this.#sessions].map((session) => (session.busy ? session.cancel() : null)));
    this.#sessions.clear();
  }
}

export class Session {
  #ctx     ;
  #thread     ;
  #mode      ;
  #readOnly         ;
  #permission                   ;
  #isClosed               ;
  #active                                        = null;

  constructor(ctx     , { thread, mode, readOnly, permission, isClosed }                                                                                                        ) {
    this.#ctx = ctx;
    this.#thread = thread;
    this.#mode = mode;
    this.#readOnly = readOnly;
    this.#permission = permission;
    this.#isClosed = isClosed;
  }

  get id()         {
    return this.#thread.id;
  }

  get mode()       {
    return this.#mode;
  }

  get readOnly()          {
    return this.#readOnly;
  }

  get busy()          {
    return this.#active !== null;
  }

  get messages() {
    const current = this.#ctx.harness.store.getThread(this.#thread.id) || this.#thread;
    return current.messages.map((message     ) => {
      const out                          = { role: message.role, content: message.display ?? message.content ?? "" };
      if (message.toolCalls?.length) out.toolCalls = message.toolCalls.map((call     ) => ({ id: call.id, name: call.name, arguments: call.arguments }));
      if (message.role === "tool") Object.assign(out, { name: message.name || "", toolCallId: message.toolCallId || "" });
      if (message.code) out.code = message.code;
      return out;
    });
  }

  cancel()                {
    return this.#active ? this.#active.abort() : Promise.resolve();
  }

  async reset()                {
    if (this.busy) throw new KoderSdkError("BUSY", "a turn is still running in this session");
    this.#thread = await this.#ctx.cli.openThread(this.#ctx.harness, { mode: this.#mode, interaction: this.#readOnly ? "ask" : "agent" });
  }

  send(prompt        , options              = {})      {
    const ctx = this.#ctx;
    if (this.#isClosed()) throw new KoderSdkError("CLOSED", "this Koder instance is closed");
    if (typeof prompt !== "string" || !prompt.trim()) throw new KoderSdkError("BAD_PROMPT", "prompt must be a non-empty string");
    if (this.busy) throw new KoderSdkError("BUSY", "a turn is still running in this session; await it or call cancel() first");
    const mode = checkMode(ctx.cli, options.mode) || this.#mode;
    const readOnly = options.readOnly ?? this.#readOnly;
    const handler = options.permission === undefined ? this.#permission : resolvePermission(options.permission);
    const thread = this.#thread;
    const { signal, onEvent } = options;

    let aborted = false;
    let waitingOnHandler = false;
    const abortWaiters = new Set            ();
    const abort = ()                => {
      if (aborted) return Promise.resolve();
      aborted = true;
      for (const wake of abortWaiters) wake();
      return waitingOnHandler ? Promise.resolve() : ctx.harness.cancel(thread.id).then(() => {}, () => {});
    };
    this.#active = { abort };

    const requests = new Map                                                 ();
    const requestFor = (pause       )                                          => {
      if (!requests.has(pause.id)) {
        requests.set(pause.id, pause.kind === "secret" ? { kind: "login", id: pause.id, service: pause.service || "", reason: pause.reason || "" } : toRequest(pause, ctx.diff));
      }
      return requests.get(pause.id) ?? null;
    };

    const translate = (event     )                    => {
      if (event.type === "pause") return { type: "permission_request", request: requestFor(event.pause)  };
      if (event.type === "decision") {
        const pause        = event.pause;
        const decision = event.decision;
        const base = { type: "permission_decision"         , kind: KIND[pause.kind], id: pause.id };
        if (decision.cancel) return { ...base, cancel: true };
        if (pause.kind === "choice") return { ...base, choice: decision.index, option: pause.options?.[decision.index] };
        return { ...base, allow: Boolean(decision.accept) };
      }
      if (event.type === "cancelled") return { type: "cancelled", reason: REASONS[event.reason] || event.reason };
      return ctx.cli.jsonEvent(event)                     ;
    };

    return new Run(async (push) => {
      const events               = [];
      const emit = (event            ) => {
        events.push(event);
        push(event);
        try {
          onEvent?.(event);
        } catch {}
      };

      // A throwing or hanging handler must never let an edit or command through.
      const decide = async (pause       )                       => {
        if (pause.kind === "secret" || aborted) return { cancel: true };
        const request = requestFor(pause)                            ;
        if (!request) return { cancel: true };
        waitingOnHandler = true;
        try {
          const answer = await Promise.race([
            Promise.resolve().then(() => handler(request)),
            new Promise          ((resolve) => abortWaiters.add(() => resolve("cancel"))),
          ]);
          return toDecision(request, answer);
        } catch (error     ) {
          emit({ type: "permission_error", kind: request.kind, id: request.id, message: error?.message || String(error) });
          return { cancel: true };
        } finally {
          waitingOnHandler = false;
          abortWaiters.clear();
        }
      };

      const onAbort = () => void abort();
      if (signal?.aborted) aborted = true;
      signal?.addEventListener("abort", onAbort, { once: true });
      const before = (ctx.harness.store.getThread(thread.id) || thread).artifacts.length;
      try {
        if (aborted) {
          const result            = { status: "cancelled", reason: "aborted", text: "", exitCode: 1, threadId: thread.id, error: null, files: [], usage: { input: 0, output: 0, source: "none" }, events };
          emit({ type: "result", status: result.status, exitCode: result.exitCode, text: "" });
          return result;
        }
        ctx.diag.state.last = null;
        let outcome     ;
        try {
          outcome = await ctx.cli.runPrompt({
            harness: ctx.harness,
            watch: ctx.watch,
            thread,
            text: prompt,
            mode,
            interaction: readOnly ? "ask" : "agent",
            decide,
            onEvent: (event         ) => {
              const value = translate(event);
              if (value) emit(value);
            },
          });
        } catch (error) {
          throw fromCliError(error, ctx.t);
        }
        const current = outcome.thread || ctx.harness.store.getThread(thread.id) || thread;
        const unreachable = ctx.cli.unreachable(current);
        const last = diagnosticFailure(ctx.diag);
        const status                      = aborted ? "cancelled" : unreachable ? "unreachable" : outcome.cancelled ? "cancelled" : current.status === "error" ? "error" : "completed";
        let error                     = null;
        if (unreachable) {
          error = { code: "API_UNREACHABLE", message: ctx.t("model.missing"), detail: last ? `${last.status ? `HTTP ${last.status}` : last.error}${last.host ? ` · ${last.host}` : ""}` : "" };
        } else if (current.status === "error") {
          error = { code: "TURN_ERROR", message: String(current.error || "") };
        }
        const result            = {
          status,
          reason: aborted ? "aborted" : REASONS[outcome.reason] || outcome.reason || "",
          text: outcome.text || "",
          exitCode: aborted ? 1 : ctx.cli.exitCode(outcome),
          threadId: current.id,
          error,
          files: (current.artifacts || []).slice(before).map((item                  ) => item.path),
          usage: { input: current.usage?.prompt || 0, output: current.usage?.completion || 0, source: current.usage?.source || "none" },
          events,
        };
        emit({ type: "result", status: result.status, exitCode: result.exitCode, text: result.text });
        return result;
      } finally {
        signal?.removeEventListener("abort", onAbort);
        this.#active = null;
      }
    }, { cancel: abort });
  }
}

// One-shot helper: open, run one prompt, close. Iterate for events or await for the result.
export function query({ prompt, mode, readOnly, permission, signal, onEvent, ...options }                                                 )      {
  const controller = new AbortController();
  const forward = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", forward, { once: true });
  return new Run(async (push) => {
    const koder = await createKoder({ ...options, mode, permission });
    try {
      const session = await koder.session({ readOnly });
      const run = session.send(prompt, { signal: controller.signal, onEvent });
      for await (const event of run) push(event);
      return await run.result();
    } finally {
      signal?.removeEventListener("abort", forward);
      await koder.close();
    }
  }, { cancel: async () => controller.abort() });
}
