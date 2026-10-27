// Generates web/src/api/*.ts from the contract in docs/api/.
//
//   npm run api:gen     rewrite the generated files
//   npm run api:check   fail if the generated files differ from what the schemas give
//
// Never edit the generated files by hand: change docs/api/ and run api:gen.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "json-schema-to-typescript";
import openapiTS, { astToString } from "openapi-typescript";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = path.resolve(WEB, "..", "docs", "api");
const SCHEMA = path.join(API, "schema");
const OUT = path.join(WEB, "src", "api");

const HEADER = (source) =>
  `// GENERATED from ${source} by web/scripts/gen-api-types.mjs. Do not edit by hand:\n` +
  `// change the contract in docs/api/ and run \`npm run api:gen\` in web/.\n\n`;

async function protocolTypes() {
  // One root that points at both unions, so every shared type is declared exactly once.
  const root = {
    title: "Protocol",
    description: "Every WebSocket message, by direction. See docs/api/ws-protocol.md.",
    type: "object",
    properties: {
      server: { $ref: "./server-message.schema.json" },
      client: { $ref: "./client-message.schema.json" },
    },
    required: ["server", "client"],
    additionalProperties: false,
  };
  const ts = await compile(root, "Protocol", {
    cwd: SCHEMA,
    bannerComment: "",
    additionalProperties: false,
    strictIndexSignatures: true,
    unreachableDefinitions: false,
    format: true,
    // Plain arrays instead of a union of every tuple length up to maxItems.
    maxItems: -1,
  });
  return HEADER("docs/api/schema/") + ts;
}

async function restTypes() {
  const ast = await openapiTS(new URL(`file://${path.join(API, "openapi.yaml")}`));
  return HEADER("docs/api/openapi.yaml") + astToString(ast);
}

const outputs = {
  "protocol.ts": await protocolTypes(),
  "rest.ts": await restTypes(),
};

const check = process.argv.includes("--check");
let stale = [];
for (const [name, content] of Object.entries(outputs)) {
  const file = path.join(OUT, name);
  if (check) {
    const current = await readFile(file, "utf8").catch(() => null);
    if (current !== content) stale.push(`web/src/api/${name}`);
  } else {
    await writeFile(file, content);
    console.log(`wrote web/src/api/${name}`);
  }
}
if (stale.length) {
  console.error(
    `Generated types are out of date with docs/api/: ${stale.join(", ")}\n` +
      "Run `npm run api:gen` in web/ and commit the result.",
  );
  process.exit(1);
}
if (check) console.log("Generated types match docs/api/.");
