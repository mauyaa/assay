export interface NetworkConfig {
  chainId: string;
  rpc: string;
  gnoweb: string;
  registryPath: string;
  denom: string;
}

/** Onyx (test17), the current gno.land testnet. */
export const ONYX: NetworkConfig = {
  chainId: "onyx-1",
  rpc: "https://rpc.onyx.testnets.gno.land",
  gnoweb: "https://onyx.testnets.gno.land",
  registryPath: "gno.land/r/nym-assay001/registry",
  denom: "ugnot",
};

export const DEMO_PACKAGES = {
  clean: "gno.land/p/nym-assay001/vault_math",
  trap: "gno.land/p/nym-assay001/malicious_helper",
} as const;

/** Real packages already on Onyx, listed so the auditor can be pointed at live chain code. */
export const CHAIN_SAMPLES = [
  "gno.land/p/nt/avl/v0",
  "gno.land/p/nt/ufmt/v0",
  "gno.land/r/gnoland/wugnot",
] as const;

/** gnoweb URL for a package path, optionally with a Render() path. */
export function gnowebUrl(net: NetworkConfig, pkgPath: string, renderPath?: string): string {
  const p = pkgPath.replace(/^gno\.land/, "");
  return `${net.gnoweb}${p}${renderPath !== undefined ? ":" + renderPath : ""}`;
}

export function shortAddr(a: string): string {
  return a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a;
}

export function formatUgnot(n: number): string {
  return `${n.toLocaleString("en-US")} ugnot`;
}
