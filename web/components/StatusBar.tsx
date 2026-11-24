"use client";

import { shortAddr, type ChainStatus } from "@assay/core";
import { useEffect, useState } from "react";
import { hasAdena, type WalletAccount } from "@/lib/adena";
import { NET, NETWORK_NAME } from "@/lib/network";
import { ArrowUpRight, Logo } from "./icons";
import type { RegistryMode } from "./Workbench";

export function StatusBar(props: {
  status: ChainStatus | null;
  chainError: string | null;
  mode: RegistryMode;
  wallet: WalletAccount | null;
  walletError: string | null;
  onConnect: () => Promise<void>;
}) {
  const { status, chainError } = props;
  const online = !!status && !chainError;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-6">
      <p className="flex items-center gap-2.5">
        <Logo />
        <span className="text-[16px] font-semibold tracking-[-0.01em] text-ink">Assay</span>
      </p>

      <div className="flex items-center gap-4">
        <p
          className={`flex items-center gap-2 text-[13px] text-ink-3 transition-opacity ${online ? "" : "opacity-60"}`}
          title={chainError ? `Can't reach ${NET.rpc}` : `Connected to ${NET.rpc}`}
        >
          <span className="hidden text-ink-2 sm:inline">{NETWORK_NAME}</span>
          {status && <span className="font-mono tabular-nums">{status.height.toLocaleString("en-US")}</span>}
          {chainError && <span className="text-bad">offline</span>}
        </p>

        {props.walletError && !props.wallet && (
          <span role="status" className="hidden max-w-[240px] truncate text-[13px] text-bad md:inline" title={props.walletError}>
            {props.walletError}
          </span>
        )}
        <Wallet wallet={props.wallet} error={props.walletError} onConnect={props.onConnect} />
      </div>
    </header>
  );
}

// One shape for every state: 32px tall, paper white, hairline, medium weight.
// Neutral on purpose: Cobalt is kept for actions that spend or publish on chain.
const shape =
  "flex h-8 items-center gap-1.5 rounded-md border border-line bg-raised px-3 text-[14px] font-medium text-ink shadow-[var(--shadow-sm)] transition-colors hover:border-ink-3 disabled:opacity-60";

function Wallet(props: { wallet: WalletAccount | null; error: string | null; onConnect: () => Promise<void> }) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Adena injects window.adena after load, so check on the client only. Re-check
  // on focus: someone who installs it from "Get Adena" comes back to a Connect button.
  useEffect(() => {
    const check = () => setInstalled(hasAdena());
    check();
    const id = setTimeout(check, 800);
    window.addEventListener("focus", check);
    return () => {
      clearTimeout(id);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (props.wallet) {
    const address = props.wallet.address;
    return (
      <button
        title={`${address}\nClick to copy`}
        onClick={() => {
          navigator.clipboard?.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
        className={`${shape} font-mono text-[13px] font-normal`}
      >
        {copied ? <span className="font-sans text-[14px]">Copied</span> : shortAddr(address)}
      </button>
    );
  }

  if (installed === false) {
    return (
      <a href="https://www.adena.app" target="_blank" rel="noreferrer" className={shape} title="Adena is the gno.land wallet">
        Get Adena <ArrowUpRight className="text-ink-3" />
      </a>
    );
  }

  return (
    <button
      disabled={connecting || installed === null}
      title={props.error ?? "Connect your Adena wallet"}
      onClick={async () => {
        setConnecting(true);
        await props.onConnect();
        setConnecting(false);
      }}
      className={shape}
    >
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
