import type { PermissionAnswer, PermissionHandler, PermissionPreset, PermissionRequest } from "../index.d.ts";
import { KoderSdkError } from "./errors.ts";

export interface Pause {
  kind: "change" | "approval" | "choice" | "secret";
  id: string;
  path?: string;
  before?: string;
  after?: string;
  command?: string;
  question?: string;
  options?: string[];
  service?: string;
  reason?: string;
}

export type CliDecision = { cancel: true } | { accept: boolean } | { index: number };

type DiffRow = { type: "add" | "del" | "note" | "same" | string; text: string };
export type DiffFn = (before: string, after: string) => DiffRow[];

// Presets mirror the CLI: nothing is written or run unless the caller says so,
// and no preset ever answers a question on the user's behalf.
export const PRESETS: Record<PermissionPreset, PermissionHandler> = {
  deny: () => false,
  acceptEdits: (request) => request.kind === "edit",
  auto: (request) => request.kind === "edit" || request.kind === "command",
};

export function resolvePermission(value: unknown): PermissionHandler {
  if (value === undefined || value === null) return PRESETS.deny;
  if (typeof value === "function") return value as PermissionHandler;
  if (typeof value === "string" && Object.hasOwn(PRESETS, value)) return PRESETS[value as PermissionPreset];
  throw new KoderSdkError("BAD_PERMISSION", `permission must be a function or one of: ${Object.keys(PRESETS).join(", ")}`);
}

export function renderDiff(rows: DiffRow[], before: string): string {
  return rows
    .filter((row) => !(before === "" && row.type === "del" && row.text === ""))
    .map((row) => (row.type === "add" ? `+${row.text}` : row.type === "del" ? `-${row.text}` : row.type === "note" ? `@@ ${row.text}` : ` ${row.text}`))
    .join("\n");
}

export function toRequest(pause: Pause, diff?: DiffFn | null): PermissionRequest | null {
  if (pause.kind === "change") {
    const before = pause.before ?? "";
    const after = pause.after ?? "";
    return { kind: "edit", id: pause.id, path: pause.path || "", before, after, diff: diff ? renderDiff(diff(before, after), before) : "" };
  }
  if (pause.kind === "approval") return { kind: "command", id: pause.id, command: pause.command || "" };
  if (pause.kind === "choice") return { kind: "question", id: pause.id, question: pause.question || "", options: [...(pause.options || [])] };
  return null;
}

// Handlers may answer with a boolean, { allow }, an option index/text, { choice }, or { cancel: true }.
// Anything else is a rejection; koder-cli's normalizeDecision re-checks the result.
export function toDecision(request: PermissionRequest, answer: PermissionAnswer | unknown): CliDecision {
  const value = answer as any;
  if (value === "cancel" || value?.cancel === true) return { cancel: true };
  if (request.kind === "question") {
    let pick = value && typeof value === "object" ? value.choice : value;
    if (typeof pick === "string") pick = request.options.indexOf(pick);
    return Number.isInteger(pick) && pick >= 0 && pick < request.options.length ? { index: pick } : { cancel: true };
  }
  const allow = typeof value === "boolean" ? value : value && typeof value === "object" ? value.allow === true : false;
  return { accept: allow };
}
