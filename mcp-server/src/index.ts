import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GnoClient } from "@assay/core";
import { z } from "zod";
import { executeVerified, fetchAndAudit, listPackages, networkFromEnv } from "./tools";

const net = networkFromEnv();
const client = new GnoClient(net);

const server = new McpServer(
  { name: "assay", version: "0.1.0" },
  {
    instructions:
      "Assay lets you inspect gno.land packages before paying to run them. Gno stores contracts as plain-text source on chain, " +
      "so always call fetch_and_audit_gno_source and read the findings before execute_verified_package. Never execute a package whose audit verdict is FAIL.",
  },
);

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const fail = (err: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
});

server.registerTool(
  "list_gno_packages",
  {
    title: "List Assay packages",
    description:
      `Lists packages registered in ${net.registryPath} on ${net.chainId}: path, author, fee per call (ugnot), call count, earnings and audit status. ` +
      "If the registry is not deployed yet, returns the bundled demo catalog and says so.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => {
    try {
      return json(await listPackages(client));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "fetch_and_audit_gno_source",
  {
    title: "Fetch and audit Gno source",
    description:
      "Pulls the plain-text .gno source of a package straight from chain (vm/qfile), runs the Assay static security rules " +
      "(coin drains to hard-coded addresses, pure packages requesting realm handles, banker use, unguarded OriginSend, unbounded loops, mint/burn, cross-realm calls) " +
      "and returns a JSON report with exact file and line numbers, a PASS/FAIL verdict and a source hash. Also checks the registered source matches the deployed code.",
    inputSchema: {
      pkgPath: z.string().regex(/^gno\.land\/[pr]\/[a-z0-9/_.-]+$/, "a gno.land/p/... or gno.land/r/... path").describe("e.g. gno.land/p/nym-assay001/vault_math"),
      includeSource: z.boolean().optional().describe("Include line-numbered source in the result so you can read it yourself (default true)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ pkgPath, includeSource }) => {
    try {
      return json(await fetchAndAudit(client, pkgPath, includeSource ?? true));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "execute_verified_package",
  {
    title: "Pay for and execute a verified package",
    description:
      `Re-audits the package, and only if the verdict is PASS, the registry lists it as verified, and the fee is within maxFeeUgnot, ` +
      `broadcasts MsgCall ${net.registryPath}.ExecuteAndPay with the fee attached via gnokey. The realm forwards the fee to the author and writes a receipt atomically. ` +
      "Without GNOKEY_NAME configured (or with dryRun) it returns the exact gnokey command instead of signing.",
    inputSchema: {
      pkgPath: z.string().regex(/^gno\.land\/[pr]\/[a-z0-9/_.-]+$/),
      maxFeeUgnot: z.number().int().nonnegative().optional().describe("Refuse if the package charges more than this"),
      dryRun: z.boolean().optional().describe("Prepare but do not broadcast"),
      gasWanted: z.number().int().positive().optional(),
      gasFeeUgnot: z.number().int().positive().optional(),
      requestID: z.string().min(1).max(64).optional().describe("Reuse the same id when retrying so you are never charged twice"),
    },
    annotations: { destructiveHint: true, openWorldHint: true },
  },
  async (args) => {
    try {
      return json(await executeVerified(client, args));
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
console.error(`assay MCP server ready · ${net.chainId} · ${net.rpc} · registry ${net.registryPath}`);
