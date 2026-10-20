// Builds dist/*.mjs from src/*.ts with Node's built-in type stripper (no tsc, no dependencies).
// Type checking is a separate step: `tsc -p .` where TypeScript is available.
import fs from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const dist = path.join(root, "dist");

const emit = process.emitWarning;
process.emitWarning = (warning, ...rest) => (String(warning).includes("stripTypeScriptTypes") ? undefined : emit.call(process, warning, ...rest));

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const files = fs.readdirSync(src).filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts")).sort();
for (const file of files) {
  const code = stripTypeScriptTypes(fs.readFileSync(path.join(src, file), "utf8"), { mode: "strip" });
  const out = code.replace(/(from\s+["']\.{1,2}\/[^"']+)\.ts(["'])/g, "$1.mjs$2").replace(/^[ \t]+$/gm, "");
  if (/from\s+["'][^"']+\.ts["']/.test(out)) throw new Error(`${file}: unresolved .ts import after build`);
  fs.writeFileSync(path.join(dist, file.replace(/\.ts$/, ".mjs")), `// Generated from src/${file} by scripts/build.mjs. Edit the .ts source.\n${out}`);
}
console.log(`built ${files.length} files into dist/`);

// Ship the stdio bridge with the Python wheel so an installed package does not
// depend on the location of the original source checkout.
const pythonBridge = path.join(root, "python", "koder_sdk", "_node");
fs.mkdirSync(path.join(pythonBridge, "bin"), { recursive: true });
fs.cpSync(dist, path.join(pythonBridge, "dist"), { recursive: true });
fs.copyFileSync(path.join(root, "bin", "koder-sdk-server.mjs"), path.join(pythonBridge, "bin", "koder-sdk-server.mjs"));
fs.copyFileSync(path.join(root, "LICENSE"), path.join(pythonBridge, "LICENSE"));
