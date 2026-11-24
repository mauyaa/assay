import { ONYX, type NetworkConfig } from "./config";
import type { ChainStatus, RegistryPackage, SourceFile } from "./types";

type AbciResult = { ok: true; data: string } | { ok: false; error: string };

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64(s: string): string {
  const bytes = enc.encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
}

/**
 * Minimal gno.land RPC client: tm2 JSON-RPC `abci_query` against the vm
 * module (qfile, qrender) plus `status`. Works in browsers and Node 20+.
 */
export class GnoClient {
  private id = 0;
  constructor(
    readonly net: NetworkConfig = ONYX,
    private readonly timeoutMs = 15_000,
  ) {}

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.net.rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
      const json = (await res.json()) as { result?: T; error?: { message?: string; data?: string } };
      if (json.error) throw new Error(`RPC ${method}: ${json.error.message ?? ""} ${json.error.data ?? ""}`.trim());
      return json.result as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async abci(path: string, data: string): Promise<AbciResult> {
    const r = await this.call<{
      response: { ResponseBase: { Error: unknown; Data: string | null; Log?: string } };
    }>("abci_query", { path, data: toBase64(data) });
    const base = r.response.ResponseBase;
    if (base.Error) {
      const type = (base.Error as { "@type"?: string })["@type"] ?? "error";
      const log = (base.Log ?? "").split("\n").find((l) => l.trim() && !l.startsWith("--=")) ?? "";
      return { ok: false, error: `${type} ${log}`.trim() };
    }
    return { ok: true, data: base.Data ? fromBase64(base.Data) : "" };
  }

  async status(): Promise<ChainStatus> {
    const r = await this.call<{
      node_info: { network: string };
      sync_info: { latest_block_height: string; latest_block_time: string };
    }>("status", {});
    return {
      chainId: r.node_info.network,
      height: Number(r.sync_info.latest_block_height),
      blockTime: r.sync_info.latest_block_time,
    };
  }

  /** File names in a package, or null if the package is not on chain. */
  async listFiles(pkgPath: string): Promise<string[] | null> {
    const r = await this.abci("vm/qfile", pkgPath);
    if (!r.ok) return null;
    return r.data.split("\n").map((s) => s.trim()).filter(Boolean);
  }

  async fetchFile(pkgPath: string, file: string): Promise<string | null> {
    const r = await this.abci("vm/qfile", `${pkgPath}/${file}`);
    return r.ok ? r.data : null;
  }

  /** All .gno files (and gnomod.toml) of a package exactly as stored on chain. */
  async fetchPackage(pkgPath: string): Promise<SourceFile[] | null> {
    const names = await this.listFiles(pkgPath);
    if (!names) return null;
    const wanted = names.filter((n) => n.endsWith(".gno") || n === "gnomod.toml");
    const bodies = await Promise.all(wanted.map((n) => this.fetchFile(pkgPath, n)));
    return wanted.map((name, i) => ({ name, body: bodies[i] ?? "" }));
  }

  /** Calls Render(path) on a realm. Null if the realm does not exist. */
  async render(realmPath: string, path = ""): Promise<string | null> {
    const r = await this.abci("vm/qrender", `${realmPath}:${path}`);
    return r.ok ? r.data : null;
  }

  /** Registered packages from the deployed Assay registry, or null if it is not deployed. */
  async registryPackages(): Promise<RegistryPackage[] | null> {
    const raw = await this.render(this.net.registryPath, "api/packages");
    if (raw === null) return null;
    const list = JSON.parse(raw) as Omit<RegistryPackage, "listing">[];
    return list.map((p) => ({ ...p, listing: "registry" as const }));
  }

  async registryPackage(pkgPath: string): Promise<RegistryPackage | null> {
    const raw = await this.render(this.net.registryPath, `api/package/${pkgPath}`);
    if (raw === null || raw === "null") return null;
    return { ...(JSON.parse(raw) as Omit<RegistryPackage, "listing">), listing: "registry" };
  }
}
