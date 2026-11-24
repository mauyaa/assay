#!/usr/bin/env node
// Launches the TypeScript MCP server through tsx so no build step is needed.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");
const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const child = spawn(process.execPath, [tsx, entry, ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
