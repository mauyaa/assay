/** Adena wallet (window.adena). https://docs.adena.app */

interface AdenaResponse<T = unknown> {
  code: number;
  status: "success" | "failure";
  type: string;
  message: string;
  data: T;
}

interface AdenaMsgCall {
  type: "/vm.m_call";
  value: { caller: string; send: string; pkg_path: string; func: string; args: string[] };
}

interface Adena {
  AddEstablish(name: string): Promise<AdenaResponse>;
  GetAccount(): Promise<AdenaResponse<{ address: string; chainId: string; coins?: string }>>;
  SwitchNetwork(chainId: string): Promise<AdenaResponse>;
  AddNetwork(n: { chainId: string; chainName: string; rpcUrl: string }): Promise<AdenaResponse>;
  DoContract(tx: { messages: AdenaMsgCall[]; gasFee: number; gasWanted: number; memo?: string }): Promise<
    AdenaResponse<{ hash?: string; height?: string | number }>
  >;
}

declare global {
  interface Window {
    adena?: Adena;
  }
}

export interface WalletAccount {
  address: string;
  chainId: string;
}

export const hasAdena = () => typeof window !== "undefined" && !!window.adena;

export async function connectAdena(chainId: string, rpcUrl: string): Promise<WalletAccount> {
  const adena = window.adena;
  if (!adena) throw new Error("Adena wallet not found");
  const est = await adena.AddEstablish("Assay");
  if (est.status !== "success" && est.type !== "ALREADY_CONNECTED") throw new Error(est.message || "Connection rejected");
  let acct = await adena.GetAccount();
  if (acct.status !== "success") throw new Error(acct.message || "Could not read account");
  if (acct.data.chainId !== chainId) {
    let sw = await adena.SwitchNetwork(chainId);
    if (sw.status !== "success") {
      await adena.AddNetwork({ chainId, chainName: "Gno.land Onyx", rpcUrl });
      sw = await adena.SwitchNetwork(chainId);
      if (sw.status !== "success") throw new Error(`Switch Adena to ${chainId} and retry`);
    }
    acct = await adena.GetAccount();
  }
  return { address: acct.data.address, chainId: acct.data.chainId };
}

export async function adenaCall(p: {
  caller: string;
  pkgPath: string;
  func: string;
  args: string[];
  sendUgnot: number;
}): Promise<{ hash: string; height?: number }> {
  const adena = window.adena;
  if (!adena) throw new Error("Adena wallet not found");
  const res = await adena.DoContract({
    messages: [
      {
        type: "/vm.m_call",
        value: {
          caller: p.caller,
          send: p.sendUgnot > 0 ? `${p.sendUgnot}ugnot` : "",
          pkg_path: p.pkgPath,
          func: p.func,
          args: p.args,
        },
      },
    ],
    gasFee: 1_000_000,
    gasWanted: 10_000_000,
    memo: "assay",
  });
  if (res.status !== "success" || !res.data?.hash) throw new Error(res.message || "Transaction rejected");
  return { hash: res.data.hash, height: res.data.height ? Number(res.data.height) : undefined };
}

/** Fails if the wallet never answers, e.g. a closed popup. */
export function withTimeout<T>(p: Promise<T>, ms = 120_000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("wallet timed out")), ms)),
  ]);
}

/** One short sentence for a wallet or chain error. */
export function explainWalletError(e: unknown, chainId: string): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|denied|cancel|declin/i.test(m)) return "Rejected in wallet. Nothing was sent.";
  if (/insufficient|not enough|balance/i.test(m)) return "Not enough GNOT in this wallet.";
  if (/timed out|timeout/i.test(m)) return "No answer from the wallet. Retrying is safe.";
  if (/switch|network|chain/i.test(m)) return `Switch Adena to ${chainId}.`;
  if (/not found/i.test(m)) return "Adena is not installed.";
  return m.replace(/^assay: /, "");
}
