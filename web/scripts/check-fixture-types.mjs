// Type-checks every valid fixture in docs/api/fixtures/ against the generated types, so the
// TypeScript side accepts exactly the messages the JSON Schemas accept.

import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.resolve(WEB, "..", "docs", "api", "fixtures");
const WORK = path.join(WEB, "node_modules", ".cache", "api-fixture-types");
const TYPE_OF = { server: "ServerMessage", client: "ClientMessage" };

let source = `import type { ClientMessage, ServerMessage } from "${path.join(WEB, "src", "api", "protocol")}";\n\n`;
let count = 0;
for (const direction of Object.keys(TYPE_OF)) {
  const dir = path.join(FIXTURES, direction, "valid");
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".json")).sort()) {
    const json = await readFile(path.join(dir, name), "utf8");
    source += `// ${direction}/valid/${name}\nexport const fixture${count++}: ${TYPE_OF[direction]} = ${json};\n`;
  }
}

await rm(WORK, { recursive: true, force: true });
await mkdir(WORK, { recursive: true });
await writeFile(path.join(WORK, "fixtures.check.ts"), source);
await writeFile(
  path.join(WORK, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, target: "ES2022", moduleResolution: "Bundler", module: "ESNext" },
    files: ["fixtures.check.ts"],
  }),
);
try {
  execFileSync(path.join(WEB, "node_modules", ".bin", "tsc"), ["-p", WORK], { stdio: "inherit" });
} catch {
  console.error("A valid fixture does not match the generated types (see errors above).");
  process.exit(1);
}
console.log(`${count} valid fixtures match the generated types.`);
