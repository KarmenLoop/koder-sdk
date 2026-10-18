// Generated from src/errors.ts by scripts/build.mjs. Edit the .ts source.
                                                                         

// Every SDK failure has a stable `code` callers can branch on; `message` is human text.
export class KoderSdkError extends Error {
  code        ;
  vars                          ;

  constructor(code        , message         , { cause, vars }                                                      = {}) {
    super(message || code, cause ? { cause } : undefined);
    this.name = "KoderSdkError";
    this.code = code;
    if (vars) this.vars = vars;
  }
}

// koder-cli throws KoderError with an i18n key; turn it into readable text in the caller's language.
export function fromCliError(error         , t            )                {
  if (error instanceof KoderSdkError) return error;
  const value = error                                                                              ;
  if (value && typeof value.key === "string") {
    return new KoderSdkError(value.key, t ? t(value.key, value.vars || {}) : value.key, { cause: error, vars: value.vars });
  }
  return new KoderSdkError("INTERNAL", value?.message || String(error), { cause: error });
}
