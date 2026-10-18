type Translate = (key: string, vars?: Record<string, unknown>) => string;

// Every SDK failure has a stable `code` callers can branch on; `message` is human text.
export class KoderSdkError extends Error {
  code: string;
  vars?: Record<string, unknown>;

  constructor(code: string, message?: string, { cause, vars }: { cause?: unknown; vars?: Record<string, unknown> } = {}) {
    super(message || code, cause ? { cause } : undefined);
    this.name = "KoderSdkError";
    this.code = code;
    if (vars) this.vars = vars;
  }
}

// koder-cli throws KoderError with an i18n key; turn it into readable text in the caller's language.
export function fromCliError(error: unknown, t?: Translate): KoderSdkError {
  if (error instanceof KoderSdkError) return error;
  const value = error as { key?: unknown; vars?: Record<string, unknown>; message?: string } | null;
  if (value && typeof value.key === "string") {
    return new KoderSdkError(value.key, t ? t(value.key, value.vars || {}) : value.key, { cause: error, vars: value.vars });
  }
  return new KoderSdkError("INTERNAL", value?.message || String(error), { cause: error });
}
