export type Mode = "standard" | "code" | "minimal" | "plan" | "execute" | "report" | "enhance";

export interface ModelConfig {
  model: string;
  baseUrl: string;
  protocol?: "openai" | "anthropic";
  apiKey?: string;
  /** Name of an environment variable holding the key, read from `env`. */
  keyEnv?: string;
  auth?: "bearer" | "x-api-key" | "none";
  name?: string;
  contextWindow?: number;
  maxOutput?: number;
  chatPath?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

/** In-process model, e.g. your own gateway or a test double. */
export interface CustomProvider {
  name?: string;
  model?: string;
  contextWindow?: number;
  complete(request: { messages: unknown[]; tools: unknown[]; signal?: AbortSignal }): Promise<{ text: string; toolCalls: ToolCall[] }>;
}

export type PermissionRequest =
  | { kind: "edit"; id: string; path: string; before: string; after: string; diff: string }
  | { kind: "command"; id: string; command: string }
  | { kind: "question"; id: string; question: string; options: string[] };

/** Login requests appear in events only; the SDK always refuses them. */
export type LoginRequest = { kind: "login"; id: string; service: string; reason: string };

export type PermissionAnswer = boolean | number | string | "cancel" | { allow: boolean } | { choice: number | string } | { cancel: true };

export type PermissionHandler = (request: PermissionRequest) => PermissionAnswer | Promise<PermissionAnswer>;

/** deny: reject edits and commands (default). acceptEdits: allow edits only. auto: allow edits and commands. No preset answers questions. */
export type PermissionPreset = "deny" | "acceptEdits" | "auto";

export type KoderEvent =
  | { type: "delta"; text: string }
  | { type: "assistant"; text: string; toolCalls: ToolCall[] }
  | { type: "tool_result"; name: string; toolCallId: string; text: string }
  | { type: "notice"; code: string; text: string }
  | { type: "permission_request"; request: PermissionRequest | LoginRequest }
  | { type: "permission_decision"; kind: "edit" | "command" | "question" | "login"; id: string; allow?: boolean; choice?: number; option?: string; cancel?: true }
  | { type: "permission_error"; kind: PermissionRequest["kind"]; id: string; message: string }
  | { type: "cancelled"; reason: CancelReason | string }
  | { type: "result"; status: RunStatus; exitCode: 0 | 1 | 2; text: string };

export type RunStatus = "completed" | "cancelled" | "error" | "unreachable";
export type CancelReason = "aborted" | "cancelled" | "login_refused" | "too_many_pauses";

export interface RunResult {
  status: RunStatus;
  reason: CancelReason | "";
  text: string;
  /** Same meaning as the koder CLI: 0 ok, 1 cancelled or failed turn, 2 model unreachable. */
  exitCode: 0 | 1 | 2;
  threadId: string;
  error: null | { code: "API_UNREACHABLE" | "TURN_ERROR"; message: string; detail?: string };
  /** Workspace-relative paths written during this turn. */
  files: string[];
  usage: { input: number; output: number; source: string };
  events: KoderEvent[];
}

export declare class Run implements AsyncIterable<KoderEvent>, PromiseLike<RunResult> {
  result(): Promise<RunResult>;
  cancel(): Promise<void>;
  then<A = RunResult, B = never>(onFulfilled?: ((value: RunResult) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<A | B>;
  catch<B = never>(onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<RunResult | B>;
  finally(onFinally?: (() => void) | null): Promise<RunResult>;
  [Symbol.asyncIterator](): AsyncIterator<KoderEvent>;
}

export interface KoderOptions {
  /** Folder the agent may read and change. Defaults to process.cwd(). */
  workspace?: string;
  /** Model record, or a path to a provider JSON file. Omit to use KODER_* variables or the saved koder CLI model. */
  model?: ModelConfig | string;
  provider?: CustomProvider;
  mode?: Mode;
  permission?: PermissionPreset | PermissionHandler;
  lang?: "zh" | "en";
  env?: Record<string, string | undefined>;
  fetch?: typeof globalThis.fetch;
  contextRatio?: number;
  /** Location of koder-cli. Defaults to KODER_CLI_ROOT, then the sibling koder-cli folder. */
  cliRoot?: string;
}

export interface SendOptions {
  mode?: Mode;
  readOnly?: boolean;
  permission?: PermissionPreset | PermissionHandler;
  signal?: AbortSignal;
  onEvent?: (event: KoderEvent) => void;
}

export declare class Session {
  readonly id: string;
  readonly mode: Mode;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly messages: Array<{ role: string; content: string; toolCalls?: ToolCall[]; name?: string; toolCallId?: string; code?: string }>;
  send(prompt: string, options?: SendOptions): Run;
  cancel(): Promise<void>;
  reset(): Promise<void>;
}

export declare class Koder {
  readonly workspace: string;
  readonly model: { name: string; model: string; source: string; [key: string]: unknown };
  readonly closed: boolean;
  tools(): string[];
  session(options?: { mode?: Mode; readOnly?: boolean; permission?: PermissionPreset | PermissionHandler }): Promise<Session>;
  close(): Promise<void>;
}

export declare function createKoder(options?: KoderOptions): Promise<Koder>;

export declare function query(options: KoderOptions & SendOptions & { prompt: string }): Run;

export declare class KoderSdkError extends Error {
  readonly code: string;
  readonly vars?: Record<string, unknown>;
}

export declare const PERMISSION_PRESETS: Record<PermissionPreset, PermissionHandler>;
