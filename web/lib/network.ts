import { GnoClient, ONYX, type NetworkConfig } from "@assay/core";

export const NET: NetworkConfig = {
  ...ONYX,
  rpc: process.env.NEXT_PUBLIC_GNO_RPC ?? ONYX.rpc,
  chainId: process.env.NEXT_PUBLIC_GNO_CHAIN_ID ?? ONYX.chainId,
  gnoweb: process.env.NEXT_PUBLIC_GNO_WEB ?? ONYX.gnoweb,
  registryPath: process.env.NEXT_PUBLIC_ASSAY_REGISTRY ?? ONYX.registryPath,
};

export const client = new GnoClient(NET);

/** Caller used by the simulated runner when no wallet is connected. */
export const SIM_CALLER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

/** Human name for the connected network. */
export const NETWORK_NAME =
  NET.chainId === "onyx-1" ? "Onyx" : NET.chainId === "dev" ? "Local" : NET.chainId;
