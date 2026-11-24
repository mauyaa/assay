"use client";

import {
  auditPackage,
  BUNDLED_SOURCES,
  CHAIN_SAMPLES,
  DEMO_PACKAGES,
  gnowebUrl,
  isBlocking,
  loadSource,
  mainFile,
  shortAddr,
  SimulatedRegistry,
  type AuditReport,
  type ChainStatus,
  type ExecutionReceipt,
  type Origin,
  type RegistryPackage,
  type SourceFile,
} from "@assay/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adenaCall, connectAdena, explainWalletError, hasAdena, withTimeout, type WalletAccount } from "@/lib/adena";
import { client, NET, SIM_CALLER } from "@/lib/network";
import { AgentPane, type AgentRun, type AgentStep } from "./AgentPane";
import { PublishModal, type PublishInput } from "./PublishModal";
import { RegistryPane } from "./RegistryPane";
import { SourcePane, type RenderTab } from "./SourcePane";
import { StatusBar } from "./StatusBar";

export type RegistryMode = "loading" | "live" | "simulated" | "offline";

export interface LoadedSource {
  pkgPath: string;
  files: SourceFile[];
  origin: Origin;
}

const sampleRow = (path: string): RegistryPackage => ({
  path,
  author: "",
  description: "",
  feePerCall: 0,
  totalCalls: 0,
  totalEarned: 0,
  verified: false,
  auditNote: "",
  registeredAt: 0,
  listing: "sample",
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function Workbench() {
  const sim = useRef(new SimulatedRegistry());
  const [mode, setMode] = useState<RegistryMode>("loading");
  const [status, setStatus] = useState<ChainStatus | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<RegistryPackage[]>([]);
  const [selected, setSelected] = useState<string>(DEMO_PACKAGES.clean);
  const [source, setSource] = useState<LoadedSource | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [activeFile, setActiveFile] = useState("");
  const [view, setView] = useState<"source" | "render">("source");
  const [renderTab, setRenderTab] = useState<RenderTab>("leaderboard");
  const [audits, setAudits] = useState<Record<string, AuditReport>>({});
  const [focus, setFocus] = useState<{ file: string; line: number } | null>(null);
  const [wallet, setWallet] = useState<WalletAccount | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [running, setRunning] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);

  const rows = useMemo(() => [...registry, ...CHAIN_SAMPLES.map(sampleRow)], [registry]);
  const selectedRow = rows.find((r) => r.path === selected) ?? null;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await client.status();
        if (alive) {
          setStatus(s);
          setChainError(null);
        }
      } catch (e) {
        if (alive) setChainError(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const refreshRegistry = useCallback(async () => {
    try {
      const live = await client.registryPackages();
      if (live) {
        setMode("live");
        setRegistry(live);
        return;
      }
    } catch {
      // Never pass an outage off as a working demo.
      setMode("offline");
      setRegistry([]);
      return;
    }
    // Reachable, registry not deployed: run the labelled simulation.
    setMode("simulated");
    setRegistry(sim.current.list());
  }, []);

  useEffect(() => {
    refreshRegistry();
  }, [refreshRegistry]);

  // Deep links: ?pkg=<path> opens a package, &audit=1 audits it on arrival.
  const pendingAudit = useRef(false);
  const linkRead = useRef(false);
  useEffect(() => {
    if (linkRead.current) return; // dev mode runs effects twice
    linkRead.current = true;
    const q = new URLSearchParams(window.location.search);
    const pkg = q.get("pkg");
    if (pkg && /^gno\.land\/[pr]\/[a-z0-9/_.-]+$/.test(pkg)) setSelected(pkg);
    pendingAudit.current = q.get("audit") === "1";
  }, []);

  const select = (pkg: string) => {
    setSelected(pkg);
    const url = new URL(window.location.href);
    url.searchParams.set("pkg", pkg);
    url.searchParams.delete("audit");
    window.history.replaceState(null, "", url);
  };

  const fetchSource = useCallback(
    async (pkgPath: string): Promise<LoadedSource | null> => {
      const loaded = await loadSource(client, pkgPath);
      if (loaded) return { pkgPath, ...loaded };
      const row = registry.find((r) => r.path === pkgPath);
      if (row?.sourceCode) {
        return { pkgPath, files: [{ name: `${pkgPath.split("/").pop()}.gno`, body: row.sourceCode }], origin: mode === "live" ? "onyx" : "simulated" };
      }
      return null;
    },
    [registry, mode],
  );

  useEffect(() => {
    let alive = true;
    setSourceLoading(true);
    setFocus(null);
    fetchSource(selected).then((s) => {
      if (!alive) return;
      setSource(s);
      setSourceLoading(false);
      setActiveFile((s && mainFile(s.files)?.name) ?? s?.files[0]?.name ?? "");
    });
    return () => {
      alive = false;
    };
    // Refetch on selection or reconnect, not on counter updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, mode]);

  const connect = async () => {
    setWalletError(null);
    if (!hasAdena()) {
      setWalletError("Adena is not installed.");
      return;
    }
    try {
      setWallet(await withTimeout(connectAdena(NET.chainId, NET.rpc), 60_000));
    } catch (e) {
      setWalletError(explainWalletError(e, NET.chainId));
    }
  };

  const runAgent = async (execute: boolean) => {
    if (running) return;
    const pkgPath = selected;
    const row = selectedRow;
    const fee = row?.listing === "registry" ? row.feePerCall : 0;
    const steps: AgentStep[] = [
      { title: "Read", status: "idle" },
      { title: "Audit", status: "idle" },
      { title: "Pay", status: "idle" },
      { title: "Receipt", status: "idle" },
    ];
    setRun({ pkgPath, execute, steps });
    setRunning(true);
    setView("source");
    setFocus(null);

    const step = (i: number, patch: Partial<AgentStep>) =>
      setRun((r) => (r ? { ...r, steps: r.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : r));
    const stop = (from: number, why: string) => {
      for (let i = from; i < 4; i++) step(i, { status: "skipped", result: i === from ? why : undefined });
    };

    try {
      step(0, { status: "running", cmd: `vm/qfile ${pkgPath}` });
      const [src] = await Promise.all([fetchSource(pkgPath), sleep(450)]);
      if (!src) {
        step(0, { status: "failed", result: "No source" });
        stop(1, "");
        return;
      }
      setSource(src);
      const main = mainFile(src.files);
      if (main) setActiveFile(main.name);
      const lines = src.files.reduce((n, f) => n + f.body.split("\n").length, 0);
      step(0, {
        status: "done",
        result: `${lines} lines · ${src.origin === "onyx" || src.origin === "registry" ? "on chain" : "local copy"}`,
      });

      step(1, { status: "running", cmd: `11 rules · ${lines} lines` });
      const [report] = await Promise.all([auditPackage(pkgPath, src.files), sleep(650)]);
      setAudits((a) => ({ ...a, [pkgPath]: report }));
      setRun((r) => (r ? { ...r, report } : r));
      const blocking = report.findings.filter(isBlocking);
      if (blocking[0]) {
        setActiveFile(blocking[0].file);
        setFocus({ file: blocking[0].file, line: blocking[0].line });
      }
      step(1, {
        status: report.verdict === "PASS" ? "done" : "failed",
        cmd: `sha256 ${report.sourceHash.slice(0, 16)}`,
        result: report.verdict === "PASS" ? (report.findings.length ? `Passed · ${plural(report.findings.length, "note")}` : "Passed") : "Rejected",
      });
      if (!execute) return;

      await sleep(250);
      if (report.verdict !== "PASS") return stop(2, "Blocked · 0 ugnot spent");
      if (!row || row.listing !== "registry") return stop(2, "No fee");
      if (!row.verified) return stop(2, "Blocked · unverified");

      // One id per payment, so a retry can't be charged twice.
      const requestID = crypto.randomUUID();
      step(2, { status: "running", cmd: `${NET.registryPath}.ExecuteAndPay · send ${fee}ugnot` });
      let receipt: ExecutionReceipt;
      let receiptHref: string | undefined;
      if (mode === "live") {
        if (!wallet) {
          step(2, { status: "skipped", result: "Connect a wallet" });
          return stop(3, "");
        }
        step(2, { result: "Confirm in Adena…" });
        const res = await withTimeout(adenaCall({ caller: wallet.address, pkgPath: NET.registryPath, func: "ExecuteAndPay", args: [pkgPath, requestID], sendUgnot: fee }));
        const latest = (await client.render(NET.registryPath, "receipts").catch(() => null)) ?? "";
        receipt = {
          id: Number(latest.match(/\[#(\d+)\]/)?.[1] ?? 0),
          pkgPath,
          caller: wallet.address,
          author: row.author,
          fee,
          refund: 0,
          height: res.height ?? status?.height ?? 0,
          txHash: res.hash,
          origin: "onyx",
        };
        receiptHref = gnowebUrl(NET, NET.registryPath, receipt.id ? `receipt/${receipt.id}` : "receipts");
        await refreshRegistry();
      } else {
        await sleep(500);
        receipt = await sim.current.executeAndPay(wallet?.address ?? SIM_CALLER, pkgPath, fee, status?.height ?? 0, requestID);
        setRegistry(sim.current.list());
      }
      step(2, { status: "done", result: `${fee.toLocaleString("en-US")} ugnot` });

      step(3, { status: "done" });
      setRun((r) => (r ? { ...r, receipt, receiptHref } : r));
      setRenderNonce((n) => n + 1);
    } catch (e) {
      const msg = explainWalletError(e, NET.chainId);
      setRun((r) => {
        if (!r) return r;
        const i = r.steps.findIndex((s) => s.status === "running");
        return { ...r, steps: r.steps.map((s, j) => (j === i ? { ...s, status: "failed", result: msg } : s)) };
      });
    } finally {
      setRunning(false);
    }
  };

  // Run a deep-linked audit once registry and source have loaded.
  useEffect(() => {
    if (!pendingAudit.current || mode === "loading" || sourceLoading || source?.pkgPath !== selected) return;
    pendingAudit.current = false;
    runAgent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, source, sourceLoading, selected]);

  const publish = async (p: PublishInput): Promise<string | null> => {
    try {
      if (mode === "live") {
        if (!wallet) return "Connect a wallet to register on chain.";
        await withTimeout(
          adenaCall({
            caller: wallet.address,
            pkgPath: NET.registryPath,
            func: "RegisterPackage",
            args: [p.path, p.description, p.sourceCode, String(p.feePerCall)],
            sendUgnot: 0,
          }),
        );
        await refreshRegistry();
      } else {
        sim.current.register(wallet?.address ?? SIM_CALLER, p, status?.height ?? 0);
        setRegistry(sim.current.list());
      }
      setPublishOpen(false);
      select(p.path);
      setRenderNonce((n) => n + 1);
      return null;
    } catch (e) {
      return explainWalletError(e, NET.chainId);
    }
  };

  const renderSource = useCallback(
    async (tab: RenderTab): Promise<{ md: string; origin: Origin; query: string }> => {
      if (tab === "package" && selectedRow?.listing === "sample" && selected.includes("/r/")) {
        return { md: (await client.render(selected, "")) ?? "404", origin: "onyx", query: `${selected}:` };
      }
      const path = tab === "leaderboard" ? "" : tab === "receipts" ? "receipts" : `pkg/${selected}`;
      if (mode === "live") {
        return { md: (await client.render(NET.registryPath, path)) ?? "404", origin: "onyx", query: `${NET.registryPath}:${path}` };
      }
      return { md: sim.current.render(path), origin: "simulated", query: `${NET.registryPath}:${path}` };
    },
    [mode, selected, selectedRow],
  );

  return (
    <div className="fixed inset-0 flex min-h-0 flex-col bg-bg text-ink">
      <StatusBar status={status} chainError={chainError} mode={mode} wallet={wallet} walletError={walletError} onConnect={connect} />
      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[272px_minmax(0,1fr)_352px] lg:overflow-hidden">
        <RegistryPane
          rows={rows}
          mode={mode}
          selected={selected}
          audits={audits}
          onSelect={(p) => {
            select(p);
            setView("source");
          }}
          onPublish={() => setPublishOpen(true)}
          onRetry={refreshRegistry}
        />
        <SourcePane
          pkgPath={selected}
          row={selectedRow}
          source={source}
          loading={sourceLoading}
          activeFile={activeFile}
          onFile={setActiveFile}
          audit={audits[selected] ?? null}
          focus={focus}
          view={view}
          onView={setView}
          renderTab={renderTab}
          onRenderTab={setRenderTab}
          renderSource={renderSource}
          renderNonce={renderNonce}
          onNavigate={(t) => {
            if (t.pkg) {
              select(t.pkg);
              setRenderTab("package");
            }
            if (t.tab) setRenderTab(t.tab);
          }}
        />
        <AgentPane
          pkgPath={selected}
          row={selectedRow}
          mode={mode}
          wallet={wallet}
          run={run}
          running={running}
          onRun={runAgent}
          onFocus={(f) => {
            setView("source");
            setActiveFile(f.file);
            setFocus({ ...f });
          }}
        />
      </main>
      {publishOpen && (
        <PublishModal mode={mode} wallet={wallet} bundledPaths={Object.keys(BUNDLED_SOURCES)} onClose={() => setPublishOpen(false)} onSubmit={publish} />
      )}
    </div>
  );
}
