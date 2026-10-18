// Generated from src/permission.ts by scripts/build.mjs. Edit the .ts source.
                                                                                                              
import { KoderSdkError } from "./errors.mjs";

                        
                                                    
             
                
                  
                 
                   
                    
                     
                   
                  
 

                                                                                     

                                                                                
                                                                  

// Presets mirror the CLI: nothing is written or run unless the caller says so,
// and no preset ever answers a question on the user's behalf.
export const PRESETS                                              = {
  deny: () => false,
  acceptEdits: (request) => request.kind === "edit",
  auto: (request) => request.kind === "edit" || request.kind === "command",
};

export function resolvePermission(value         )                    {
  if (value === undefined || value === null) return PRESETS.deny;
  if (typeof value === "function") return value                     ;
  if (typeof value === "string" && Object.hasOwn(PRESETS, value)) return PRESETS[value                    ];
  throw new KoderSdkError("BAD_PERMISSION", `permission must be a function or one of: ${Object.keys(PRESETS).join(", ")}`);
}

export function renderDiff(rows           , before        )         {
  return rows
    .filter((row) => !(before === "" && row.type === "del" && row.text === ""))
    .map((row) => (row.type === "add" ? `+${row.text}` : row.type === "del" ? `-${row.text}` : row.type === "note" ? `@@ ${row.text}` : ` ${row.text}`))
    .join("\n");
}

export function toRequest(pause       , diff                )                           {
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
export function toDecision(request                   , answer                            )              {
  const value = answer       ;
  if (value === "cancel" || value?.cancel === true) return { cancel: true };
  if (request.kind === "question") {
    let pick = value && typeof value === "object" ? value.choice : value;
    if (typeof pick === "string") pick = request.options.indexOf(pick);
    return Number.isInteger(pick) && pick >= 0 && pick < request.options.length ? { index: pick } : { cancel: true };
  }
  const allow = typeof value === "boolean" ? value : value && typeof value === "object" ? value.allow === true : false;
  return { accept: allow };
}
