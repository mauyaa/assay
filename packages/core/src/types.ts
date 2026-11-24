export interface SourceFile {
  name: string;
  body: string;
}

/** Where a piece of data came from. Shown to the user so nothing simulated passes as on-chain. */
export type Origin = "onyx" | "registry" | "bundled" | "simulated";

export interface RegistryPackage {
  path: string;
  author: string;
  description: string;
  feePerCall: number;
  totalCalls: number;
  totalEarned: number;
  verified: boolean;
  auditNote: string;
  registeredAt: number;
  sourceCode?: string;
  /** "registry": listed in Assay (live or simulated). "sample": real on-chain package, not registered. */
  listing: "registry" | "sample";
}

export interface ExecutionReceipt {
  id: number;
  pkgPath: string;
  caller: string;
  author: string;
  fee: number;
  refund: number;
  height: number;
  txHash: string;
  origin: Origin;
}

export interface ChainStatus {
  chainId: string;
  height: number;
  blockTime: string;
}
