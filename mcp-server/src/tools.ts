import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  auditPackage,
  BUNDLED_SOURCES,
  CHAIN_SAMPLES,
  GnoClient,
  gnowebUrl,
  isBlocking,
  loadSource,
  ONYX,
  seedPackages,
  type AuditReport,
  type NetworkConfig,
  type RegistryPackage,
} from "@assay/core";

export function networkFromEnv(env = process.env): NetworkConfig {
  return {
    ...ONYX,
    chainId: env.GNO_CHAIN_ID ?? ONYX.chainId,
    rpc: env.GNO_RPC ?? ONYX.rpc,
    gnoweb: env.GNO_WEB ?? ONYX.gnoweb,
    registryPath: env.ASSAY_REGISTRY ?? ONYX.registryPath,
  };
}

export async function listPackages(client: GnoClient) {
  const live = await client.registryPackages().catch(() => null);
  if (live) {
    return {
      source: "chain" as const,
      registry: client.net.registryPath,
      chainId: client.net.chainId,
      packages: live,
      gnoweb: gnowebUrl(client.net, client.net.registryPath, ""),
    };
  }
  return {
    source: "bundled-demo" as const,
    registry: client.net.registryPath,
    chainId: client.net.chainId,
    note: `${client.net.registryPath} is not deployed on ${client.net.chainId}; showing the demo catalog bundled with Assay. Deploy the realm (see README) to list live registrations.`,
    packages: seedPackages().map(({ sourceCode: _s, ...p }) => p),
    chainSamples: CHAIN_SAMPLES.map((path) => ({
      path,
      note: "Real package on chain, not registered in Assay. Can be audited, not executed.",
    })),
  };
}

export interface AuditResult {
  pkgPath: string;
  sourceOrigin: "onyx" | "registry" | "bundled";
  report: AuditReport;
  registry: RegistryPackage | null;
  integrity: { checked: boolean; matches?: boolean; note: string };
  blockingFindings: AuditReport["findings"];
  files: { name: string; body: string }[];
}

export async function fetchAndAudit(client: GnoClient, pkgPath: string, includeSource: boolean): Promise<AuditResult> {
  const src = await loadSource(client, pkgPath);
  if (!src) {
    throw new Error(`${pkgPath} is not on ${client.net.chainId} and has no bundled copy. Check the path (gno.land/p/... or gno.land/r/...).`);
  }
  const report = await auditPackage(pkgPath, src.files);
  const registry = await client.registryPackage(pkgPath).catch(() => null);

  // A registered source that differs from the deployed code is a false listing.
  let integrity: AuditResult["integrity"] = { checked: false, note: "Package is not registered on chain; nothing to compare." };
  if (registry?.sourceCode && src.origin === "onyx") {
    const norm = (s: string) => s.replace(/\r\n/g, "\n").trim();
    const matches = src.files.some((f) => norm(f.body) === norm(registry.sourceCode!));
    integrity = {
      checked: true,
      matches,
      note: matches
        ? "Registered source matches a file deployed on chain."
        : "Registered source does NOT match any deployed file. Treat the listing as untrusted.",
    };
  }

  return {
    pkgPath,
    sourceOrigin: src.origin === "onyx" || src.origin === "registry" ? src.origin : "bundled",
    report,
    registry,
    integrity,
    blockingFindings: report.findings.filter(isBlocking),
    files: includeSource ? src.files.map((f) => ({ name: f.name, body: numbered(f.body) })) : [],
  };
}

function numbered(body: string): string {
  const lines = body.split("\n");
  const w = String(lines.length).length;
  return lines.map((l, i) => `${String(i + 1).padStart(w)} │ ${l}`).join("\n");
}

export interface ExecuteOptions {
  pkgPath: string;
  maxFeeUgnot?: number;
  dryRun?: boolean;
  gasWanted?: number;
  gasFeeUgnot?: number;
  requestID?: string;
}

export async function executeVerified(client: GnoClient, opts: ExecuteOptions, env = process.env) {
  const audit = await fetchAndAudit(client, opts.pkgPath, false);

  if (audit.report.verdict !== "PASS") {
    return {
      status: "ABORTED" as const,
      reason: "Audit failed. Nothing was signed and no GNOT was spent.",
      spentUgnot: 0,
      verdict: audit.report.verdict,
      summary: audit.report.summary,
      blockingFindings: audit.blockingFindings,
    };
  }
  if (audit.integrity.checked && !audit.integrity.matches) {
    return { status: "ABORTED" as const, reason: audit.integrity.note, spentUgnot: 0 };
  }

  const reg = audit.registry;
  if (!reg) {
    return {
      status: "ABORTED" as const,
      reason: `${opts.pkgPath} is not registered in ${client.net.registryPath} on ${client.net.chainId} (or the registry is not deployed). ExecuteAndPay would revert. Register it first.`,
      spentUgnot: 0,
      audit: audit.report.summary,
    };
  }
  if (!reg.verified) {
    return {
      status: "ABORTED" as const,
      reason: "The registry has not marked this package verified; the realm refuses unverified execution. Ask an auditor to call SetVerified.",
      spentUgnot: 0,
      audit: audit.report.summary,
    };
  }
  if (opts.maxFeeUgnot !== undefined && reg.feePerCall > opts.maxFeeUgnot) {
    return {
      status: "ABORTED" as const,
      reason: `Fee ${reg.feePerCall}ugnot exceeds the caller's limit of ${opts.maxFeeUgnot}ugnot.`,
      spentUgnot: 0,
    };
  }

  // Reuse the caller's id on retries so the realm refuses a second charge.
  const requestID = opts.requestID ?? randomUUID();
  const keyName = env.GNOKEY_NAME;
  const args = [
    "maketx", "call",
    "-pkgpath", client.net.registryPath,
    "-func", "ExecuteAndPay",
    "-args", opts.pkgPath,
    "-args", requestID,
    "-send", `${reg.feePerCall}ugnot`,
    "-gas-fee", `${opts.gasFeeUgnot ?? 1_000_000}ugnot`,
    "-gas-wanted", String(opts.gasWanted ?? 10_000_000),
    "-broadcast",
    "-chainid", client.net.chainId,
    "-remote", rpcRemote(client.net.rpc),
  ];
  if (env.GNOKEY_HOME) args.push("-home", env.GNOKEY_HOME);

  if (opts.dryRun || !keyName) {
    return {
      status: "READY_TO_SIGN" as const,
      reason: opts.dryRun
        ? "Dry run requested; nothing was broadcast."
        : "GNOKEY_NAME is not set, so the server cannot sign. Run the command below, or set GNOKEY_NAME/GNOKEY_PASSWORD and call again.",
      spentUgnot: 0,
      feeUgnot: reg.feePerCall,
      author: reg.author,
      requestID,
      audit: audit.report.summary,
      command: ["gnokey", ...args, keyName ?? "<your-key-name>"].map(shellQuote).join(" "),
    };
  }

  const usePassword = env.GNOKEY_PASSWORD !== undefined;
  if (usePassword) args.push("-insecure-password-stdin");
  args.push(keyName);
  const out = await run(env.GNOKEY_BIN ?? "gnokey", args, usePassword ? `${env.GNOKEY_PASSWORD}\n` : undefined);

  const txHash = out.stdout.match(/TX HASH:\s*(\S+)/)?.[1];
  const height = out.stdout.match(/HEIGHT:\s*(\d+)/)?.[1];
  const receiptId = out.stdout.match(/\((\d+)\s+uint64\)/)?.[1];
  if (out.code !== 0 || !txHash) {
    return {
      status: "FAILED" as const,
      reason: "gnokey did not broadcast successfully. If the transaction was rejected, the chain reverted it and no GNOT moved.",
      exitCode: out.code,
      stdout: out.stdout.slice(-2000),
      stderr: out.stderr.slice(-2000),
    };
  }
  return {
    status: "SETTLED" as const,
    requestID,
    txHash,
    height: height ? Number(height) : undefined,
    receiptId: receiptId ? Number(receiptId) : undefined,
    feeUgnot: reg.feePerCall,
    paidTo: reg.author,
    receiptUrl: receiptId ? gnowebUrl(client.net, client.net.registryPath, `receipt/${receiptId}`) : gnowebUrl(client.net, client.net.registryPath, "receipts"),
    audit: audit.report.summary,
  };
}

function rpcRemote(rpc: string): string {
  const u = new URL(rpc);
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  return `${u.protocol}//${u.hostname}:${port}`;
}

function shellQuote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

function run(bin: string, args: string[], stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(bin, args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr || (err && !stdout ? err.message : "")) });
    });
    if (stdin !== undefined) child.stdin?.end(stdin);
  });
}

export const KNOWN_PATHS = Object.keys(BUNDLED_SOURCES);
