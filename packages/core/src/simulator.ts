import { BUNDLED_SOURCES } from "./bundled-sources";
import { DEMO_PACKAGES } from "./config";
import type { ExecutionReceipt, RegistryPackage } from "./types";

/** In-memory mirror of registry.gno for networks where it isn't deployed. Output is labelled "simulated". */

export const DEMO_AUTHORS = {
  vault: "g1w3jhxap3ta047h6lta047h6lta047h6l4mfnm7",
  trap: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
};

function mainSource(pkgPath: string): string {
  const code = (BUNDLED_SOURCES[pkgPath] ?? []).filter((f) => f.name.endsWith(".gno") && !f.name.endsWith("_test.gno"));
  return code.sort((a, b) => b.body.length - a.body.length)[0]?.body ?? "";
}

export function seedPackages(): RegistryPackage[] {
  return [
    {
      path: DEMO_PACKAGES.clean,
      author: DEMO_AUTHORS.vault,
      description: "Fixed-point yield, share and APY math for vaults. Stateless, no coin access.",
      sourceCode: mainSource(DEMO_PACKAGES.clean),
      feePerCall: 1000,
      totalCalls: 0,
      totalEarned: 0,
      verified: true,
      auditNote: "static audit passed",
      registeredAt: 0,
      listing: "registry",
    },
    {
      path: DEMO_PACKAGES.trap,
      author: DEMO_AUTHORS.trap,
      description: "Rounds fees up to the nearest 100 ugnot.",
      sourceCode: mainSource(DEMO_PACKAGES.trap),
      feePerCall: 250,
      totalCalls: 0,
      totalEarned: 0,
      verified: false,
      auditNote: "awaiting audit",
      registeredAt: 0,
      listing: "registry",
    },
  ];
}

async function simHash(payload: unknown): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export class SimulatedRegistry {
  packages = new Map<string, RegistryPackage>();
  receipts: ExecutionReceipt[] = [];
  private requests = new Map<string, number>();

  constructor(seed: RegistryPackage[] = seedPackages()) {
    for (const p of seed) this.packages.set(p.path, { ...p });
  }

  list(): RegistryPackage[] {
    return [...this.packages.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  register(caller: string, p: { path: string; description: string; sourceCode: string; feePerCall: number }, height: number) {
    if (!/^gno\.land\/[pr]\//.test(p.path)) throw new Error("assay: package path must start with gno.land/p/ or gno.land/r/");
    if (!/^[a-z0-9/_.-]+$/.test(p.path) || p.path.length > 256) throw new Error("assay: package path contains an invalid character");
    if (p.description.length > 280) throw new Error("assay: description longer than 280 bytes");
    if (p.sourceCode.length > 64 * 1024) throw new Error("assay: source longer than 65536 bytes");
    if (!Number.isInteger(p.feePerCall) || p.feePerCall < 0 || p.feePerCall > 1_000_000_000)
      throw new Error("assay: fee must be between 0 and 1000000000 ugnot");
    const existing = this.packages.get(p.path);
    if (existing) {
      if (existing.author !== caller) throw new Error(`assay: package is owned by ${existing.author}`);
      Object.assign(existing, { ...p, verified: false, auditNote: "source updated; awaiting re-audit" });
      return existing;
    }
    const meta: RegistryPackage = {
      ...p,
      author: caller,
      totalCalls: 0,
      totalEarned: 0,
      verified: false,
      auditNote: "awaiting audit",
      registeredAt: height,
      listing: "registry",
    };
    this.packages.set(p.path, meta);
    return meta;
  }

  async executeAndPay(caller: string, pkgPath: string, sentUgnot: number, height: number, requestID: string): Promise<ExecutionReceipt> {
    const meta = this.packages.get(pkgPath);
    if (!meta) throw new Error(`assay: package not registered: ${pkgPath}`);
    if (!meta.verified) throw new Error("assay: package is not audit-verified; execution refused");
    if (sentUgnot < meta.feePerCall)
      throw new Error(`assay: insufficient fee: sent ${sentUgnot}ugnot, required ${meta.feePerCall}ugnot`);
    if (requestID.length === 0 || requestID.length > 64) throw new Error("assay: request id must be 1 to 64 bytes");
    const prev = this.requests.get(`${caller}/${requestID}`);
    if (prev) throw new Error(`assay: duplicate request; already settled as receipt #${prev}`);
    meta.totalCalls++;
    meta.totalEarned += meta.feePerCall;
    const id = this.receipts.length + 1;
    const base = { id, pkgPath, caller, author: meta.author, fee: meta.feePerCall, refund: sentUgnot - meta.feePerCall, height };
    const receipt: ExecutionReceipt = { ...base, txHash: await simHash({ ...base, t: Date.now() }), origin: "simulated" };
    this.receipts.push(receipt);
    this.requests.set(`${caller}/${requestID}`, id);
    return receipt;
  }

  /** Same output as registry.gno Render(path). */
  render(path: string): string {
    if (path === "") return this.renderHome();
    if (path === "receipts") return "# Execution receipts\n\n" + this.receiptTable(20);
    if (path.startsWith("receipt/")) {
      const r = this.receipts.find((x) => String(x.id) === path.slice(8));
      if (!r) return "404";
      return `# Receipt #${r.id}\n\n- package: \`${r.pkgPath}\`\n- caller: \`${r.caller}\`\n- author: \`${r.author}\`\n- fee: ${r.fee} ugnot\n- refund: ${r.refund} ugnot\n- block height: ${r.height}\n`;
    }
    if (path.startsWith("pkg/")) {
      const m = this.packages.get(path.slice(4));
      if (!m) return "404";
      let s = `# ${md(m.path)}\n\n`;
      if (m.description) s += `${md(m.description)}\n\n`;
      s += `- author: \`${m.author}\`\n- fee per call: ${m.feePerCall} ugnot\n- calls: ${m.totalCalls}\n- earned: ${m.totalEarned} ugnot\n`;
      s += `- audit: ${label(m.verified)} — ${md(m.auditNote)}\n- registered at block: ${m.registeredAt}\n\n`;
      if (m.sourceCode) s += "## Registered source\n\n```go\n" + m.sourceCode + "\n```\n";
      return s;
    }
    return "404";
  }

  private renderHome(): string {
    const list = [...this.packages.values()].sort(
      (a, b) => b.totalEarned - a.totalEarned || b.totalCalls - a.totalCalls,
    );
    let s = "# Assay Registry\n\n";
    s += "Verifiable package registry and execution escrow. Source is stored as plain text on chain; fees settle atomically in ugnot.\n\n";
    s += `**${list.length}** packages · **${this.receipts.length}** paid executions\n\n## Leaderboard\n\n`;
    if (list.length === 0) s += "_No packages registered yet._\n\n";
    else {
      s += "| # | Package | Author | Fee (ugnot) | Calls | Earned (ugnot) | Audit |\n|---|---|---|---:|---:|---:|---|\n";
      list.forEach((m, i) => {
        s += `| ${i + 1} | [${md(m.path)}](/r/nym-assay001/registry:pkg/${m.path}) | \`${short(m.author)}\` | ${m.feePerCall} | ${m.totalCalls} | ${m.totalEarned} | ${label(m.verified)} |\n`;
      });
      s += "\n";
    }
    s += "## Recent receipts\n\n" + this.receiptTable(20);
    return s;
  }

  private receiptTable(limit: number): string {
    if (this.receipts.length === 0) return "_No executions settled yet._\n";
    let s = "| Receipt | Package | Caller | Fee (ugnot) | Height |\n|---|---|---|---:|---:|\n";
    for (const r of [...this.receipts].reverse().slice(0, limit)) {
      s += `| [#${r.id}](/r/nym-assay001/registry:receipt/${r.id}) | \`${md(r.pkgPath)}\` | \`${short(r.caller)}\` | ${r.fee} | ${r.height} |\n`;
    }
    return s;
  }
}

const label = (v: boolean) => (v ? "● verified" : "○ unverified");
const md = (s: string) => s.replaceAll("|", "\\|").replaceAll("\n", " ");
const short = (a: string) => (a.length <= 14 ? a : `${a.slice(0, 8)}…${a.slice(-4)}`);
