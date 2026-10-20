// Line-delimited JSON bridge so other languages can drive the SDK over stdio.
// stdout carries protocol frames only; anything else goes to stderr.
import readline from "node:readline";
import { format } from "node:util";
import type { CustomProvider, KoderEvent, PermissionHandler, PermissionPreset } from "../index.d.ts";
import { KoderSdkError } from "./errors.ts";
import { type Koder, type Session, createKoder } from "./koder.ts";

export const PROTOCOL_VERSION = 1;
export const SDK_VERSION = "0.1.1";

type Json = Record<string, any>;
type Handler = (params: Json, id: number | string) => Promise<unknown> | unknown;

interface ServerIO {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  log?: NodeJS.WritableStream;
}

// "client" means: ask the bridge client for every decision.
type PermissionSetting = PermissionPreset | "client" | undefined;

export function startServer({ input = process.stdin, output = process.stdout, log = process.stderr }: ServerIO = {}): Promise<void> {
  const koders = new Map<string, { koder: Koder; permission: PermissionSetting }>();
  const sessions = new Map<string, { session: Session; koderId: string; permission: PermissionSetting }>();
  const outgoing = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let counter = 0;
  let closed = false;
  const nextId = (prefix: string) => `${prefix}${++counter}`;

  const write = (frame: Json) => {
    if (!closed) output.write(`${JSON.stringify(frame)}\n`);
  };
  const notify = (method: string, params: Json) => write({ method, params });

  const ask = (method: string, params: Json): Promise<any> => {
    if (closed) return Promise.reject(new KoderSdkError("BRIDGE_CLOSED", "bridge client disconnected"));
    const id = nextId("s");
    return new Promise((resolve, reject) => {
      outgoing.set(id, { resolve, reject });
      write({ id, method, params });
    });
  };

  const checkPermission = (value: unknown): PermissionSetting => {
    if (value === undefined || value === null) return undefined;
    if (value === "client" || value === "deny" || value === "acceptEdits" || value === "auto") return value;
    throw new KoderSdkError("BAD_PERMISSION", "permission must be one of: deny, acceptEdits, auto, client");
  };

  const handlerFor = (setting: PermissionSetting, runId: number | string): PermissionPreset | PermissionHandler | undefined =>
    setting === "client" ? (request) => ask("permission.request", { runId, request }) : setting;

  const koderEntry = (id: unknown) => {
    const entry = koders.get(String(id));
    if (!entry) throw new KoderSdkError("UNKNOWN_KODER", `no Koder with id ${id}`);
    return entry;
  };
  const sessionEntry = (id: unknown) => {
    const entry = sessions.get(String(id));
    if (!entry) throw new KoderSdkError("UNKNOWN_SESSION", `no session with id ${id}`);
    return entry;
  };

  const methods: Record<string, Handler> = {
    initialize: () => ({ protocol: PROTOCOL_VERSION, version: SDK_VERSION, node: process.versions.node }),

    async "koder.create"(params) {
      const permission = checkPermission(params.permission);
      const koderId = nextId("k");
      let provider: CustomProvider | undefined;
      if (params.provider === "client") {
        provider = {
          name: params.providerName || "client",
          model: params.providerModel || "client",
          contextWindow: params.contextWindow,
          async complete({ messages, tools }) {
            const reply = await ask("provider.complete", { koderId, messages, tools });
            return { text: String(reply?.text ?? ""), toolCalls: Array.isArray(reply?.toolCalls) ? reply.toolCalls : [] };
          },
        };
      }
      const koder = await createKoder({
        workspace: params.workspace,
        model: params.model,
        provider,
        mode: params.mode,
        permission: permission === "client" ? undefined : permission,
        lang: params.lang,
        env: params.env || undefined,
        contextRatio: params.contextRatio,
        cliRoot: params.cliRoot,
      });
      koders.set(koderId, { koder, permission });
      return { koderId, workspace: koder.workspace, model: koder.model, tools: koder.tools() };
    },

    async "koder.close"(params) {
      const id = String(params.koderId);
      const entry = koders.get(id);
      if (!entry) return { closed: false };
      koders.delete(id);
      for (const [sessionId, value] of sessions) if (value.koderId === id) sessions.delete(sessionId);
      await entry.koder.close();
      return { closed: true };
    },

    async "session.create"(params) {
      const entry = koderEntry(params.koderId);
      const permission = params.permission === undefined ? entry.permission : checkPermission(params.permission);
      const session = await entry.koder.session({ mode: params.mode, readOnly: Boolean(params.readOnly) });
      const sessionId = nextId("x");
      sessions.set(sessionId, { session, koderId: String(params.koderId), permission });
      return { sessionId, threadId: session.id, mode: session.mode, readOnly: session.readOnly };
    },

    async "session.send"(params, id) {
      const entry = sessionEntry(params.sessionId);
      const setting = params.permission === undefined ? entry.permission : checkPermission(params.permission);
      const run = entry.session.send(params.prompt, {
        mode: params.mode,
        readOnly: params.readOnly,
        permission: handlerFor(setting, id),
        onEvent: (event: KoderEvent) => notify("run.event", { runId: id, event }),
      });
      const { events, ...result } = await run.result();
      return result;
    },

    async "session.cancel"(params) {
      await sessionEntry(params.sessionId).session.cancel();
      return {};
    },

    async "session.reset"(params) {
      const { session } = sessionEntry(params.sessionId);
      await session.reset();
      return { threadId: session.id };
    },

    "session.messages"(params) {
      return { messages: sessionEntry(params.sessionId).session.messages };
    },
  };

  const respondError = (id: unknown, error: any) => {
    const code = error instanceof KoderSdkError || typeof error?.code === "string" ? error.code : "INTERNAL";
    write({ id: id ?? null, error: { code, message: error?.message || String(error) } });
  };

  const onFrame = (line: string) => {
    if (!line.trim()) return;
    let frame: Json;
    try {
      frame = JSON.parse(line);
    } catch {
      respondError(null, new KoderSdkError("PARSE_ERROR", "frame is not valid JSON"));
      return;
    }
    if (!frame || typeof frame !== "object") return respondError(null, new KoderSdkError("BAD_FRAME", "frame must be an object"));
    if (typeof frame.method !== "string" && frame.id !== undefined) {
      const waiter = outgoing.get(String(frame.id));
      if (!waiter) return;
      outgoing.delete(String(frame.id));
      if (frame.error) waiter.reject(new KoderSdkError(frame.error.code || "CLIENT_ERROR", frame.error.message || "client error"));
      else waiter.resolve(frame.result);
      return;
    }
    const method = methods[frame.method];
    if (!method || !Object.hasOwn(methods, frame.method)) return respondError(frame.id, new KoderSdkError("UNKNOWN_METHOD", `unknown method ${frame.method}`));
    Promise.resolve()
      .then(() => method(frame.params || {}, frame.id))
      .then((result) => write({ id: frame.id, result: result ?? {} }), (error) => respondError(frame.id, error));
  };

  console.log = console.info = console.debug = (...args: unknown[]) => void log.write(`${format(...args)}\n`);

  return new Promise((resolve) => {
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    lines.on("line", onFrame);
    lines.on("close", async () => {
      for (const waiter of outgoing.values()) waiter.reject(new KoderSdkError("BRIDGE_CLOSED", "bridge client disconnected"));
      outgoing.clear();
      await Promise.allSettled([...koders.values()].map((entry) => entry.koder.close()));
      closed = true;
      resolve();
    });
  });
}
