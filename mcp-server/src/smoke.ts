// End-to-end check: starts the MCP server over stdio, lists its tools and
// calls each one, exactly as an MCP client would.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("./index.ts", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--import", "tsx", entry],
  env: { ...process.env, GNOKEY_NAME: "" } as Record<string, string>,
  stderr: "inherit",
});
const client = new Client({ name: "assay-smoke", version: "0.0.0" });
await client.connect(transport);

const text = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const list = JSON.parse(text(await client.callTool({ name: "list_gno_packages", arguments: {} })));
console.log("list_gno_packages:", list.source, list.packages.map((p: { path: string }) => p.path));

for (const pkgPath of ["gno.land/p/nym-assay001/malicious_helper", "gno.land/p/nym-assay001/vault_math", "gno.land/r/gnoland/wugnot"]) {
  const a = JSON.parse(text(await client.callTool({ name: "fetch_and_audit_gno_source", arguments: { pkgPath, includeSource: false } })));
  const top = a.report.findings[0];
  console.log(`audit ${pkgPath}: [${a.sourceOrigin}] ${a.report.verdict} score=${a.report.score}` + (top ? ` · ${top.rule} ${top.severity} ${top.file}:${top.line}` : ""));
}

for (const pkgPath of ["gno.land/p/nym-assay001/malicious_helper", "gno.land/p/nym-assay001/vault_math"]) {
  const x = JSON.parse(text(await client.callTool({ name: "execute_verified_package", arguments: { pkgPath, dryRun: true } })));
  console.log(`execute ${pkgPath}: ${x.status} · ${x.reason}`);
}

await client.close();
