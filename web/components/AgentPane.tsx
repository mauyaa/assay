"use client";

import { isBlocking, shortAddr, type AuditReport, type ExecutionReceipt, type Finding, type RegistryPackage } from "@assay/core";
import type { WalletAccount } from "@/lib/adena";
import { NET } from "@/lib/network";
import { ArrowUpRight, Check, Cross, Spinner } from "./icons";
import type { RegistryMode } from "./Workbench";

export type StepStatus = "idle" | "running" | "done" | "failed" | "skipped";

export interface AgentStep {
  title: string;
  status: StepStatus;
  result?: string;
  cmd?: string;
  /** Seconds since the run started, set when the step finishes. */
  t?: number;
}

export interface AgentRun {
  pkgPath: string;
  execute: boolean;
  steps: AgentStep[];
  report?: AuditReport;
  receipt?: ExecutionReceipt;
  receiptHref?: string;
}

const PLAN = ["Fetching on-chain code", "Analyzing source & permissions", "Settling GNOT escrow", "Receipt hash"];

export function AgentPane(props: {
  pkgPath: string;
  row: RegistryPackage | null;
  mode: RegistryMode;
  wallet: WalletAccount | null;
  run: AgentRun | null;
  running: boolean;
  onRun: (execute: boolean) => void;
  onFocus: (f: { file: string; line: number }) => void;
}) {
  const { row, run, running } = props;
  const payable = row?.listing === "registry";
  const visible = run && run.pkgPath === props.pkgPath ? run : null;
  const plan: AgentStep[] = PLAN.map((title) => ({ title, status: "idle" }));
  const all = visible ? visible.steps : plan;
  const steps = (visible ? visible.execute : payable) ? all : all.slice(0, 2);

  const signer =
    props.mode === "live"
      ? props.wallet
        ? shortAddr(props.wallet.address)
        : "No wallet"
      : props.mode === "offline"
        ? "Offline"
        : "Simulated";

  return (
    <aside className="flex min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-6 text-[11px] font-medium tracking-[0.08em] uppercase">
        <span className="text-ink">Agent</span>
        <span className="text-ink-3 normal-case tracking-normal font-mono text-[12px]" title={NET.registryPath}>
          {signer}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-line p-6">
          <button
            onClick={() => props.onRun(payable)}
            disabled={running}
            className="h-11 w-full bg-action text-[12px] font-semibold tracking-[0.08em] text-on-action uppercase transition-colors hover:bg-action-hover disabled:opacity-50"
          >
            {running ? "Running…" : payable ? "Run agent audit & execute" : "Run agent audit"}
          </button>
          {payable && (
            <p className="mt-3 text-center font-mono text-[12px] text-ink-2">
              {row!.feePerCall.toLocaleString("en-US")} ugnot · paid only if the audit passes
            </p>
          )}
        </div>

        <ol aria-live="polite" aria-label="Agent steps">
          {steps.map((s, i) => (
            <Step key={i} n={i + 1} step={s}>
              {i === 1 && visible?.report && s.status !== "running" && <Findings report={visible.report} onFocus={props.onFocus} />}
              {i === 3 && visible?.receipt && <Receipt receipt={visible.receipt} href={visible.receiptHref} />}
            </Step>
          ))}
        </ol>
      </div>
    </aside>
  );
}

function Step(props: { n: number; step: AgentStep; children?: React.ReactNode }) {
  const { status, title, result, cmd, t } = props.step;
  const mark =
    status === "running" ? (
      <Spinner className="text-ink-2" />
    ) : status === "done" ? (
      <Check className="text-ok" />
    ) : status === "failed" ? (
      <Cross className="text-bad" />
    ) : null;
  const quiet = status === "idle" || status === "skipped";

  return (
    <li className="grid grid-cols-[2rem_1fr_auto] gap-x-2 border-b border-line px-6 py-4">
      <span className={`font-mono text-[12px] leading-5 tabular-nums ${quiet ? "text-ink-3" : "text-ink"}`}>
        {String(props.n).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <p className={`flex items-center gap-2 text-[13px] leading-5 ${quiet ? "text-ink-3" : "font-medium text-ink"}`}>
          {title}
          {mark}
        </p>
        {result && (
          <p
            className={`rise mt-0.5 truncate text-[12px] leading-5 ${
              status === "failed" ? "text-bad" : quiet ? "text-ink-3" : "text-ink-2"
            } ${props.n === 4 ? "font-mono" : ""}`}
            title={result}
          >
            {result}
          </p>
        )}
        {cmd && <span className="sr-only">{cmd}</span>}
        {props.children}
      </div>
      <span className="font-mono text-[11px] leading-5 text-ink-3 tabular-nums">{t !== undefined ? `${t.toFixed(2)}s` : ""}</span>
    </li>
  );
}

function Findings({ report, onFocus }: { report: AuditReport; onFocus: (f: { file: string; line: number }) => void }) {
  if (report.findings.length === 0) return null;
  const blocking = report.findings.filter(isBlocking);
  const notes = report.findings.filter((f) => !isBlocking(f));
  return (
    <ul className="rise mt-3 border-t border-line">
      {[...blocking, ...notes].map((f, i) => (
        <FindingRow key={i} f={f} onFocus={onFocus} />
      ))}
    </ul>
  );
}

function FindingRow({ f, onFocus }: { f: Finding; onFocus: (f: { file: string; line: number }) => void }) {
  const bad = isBlocking(f);
  return (
    <li>
      <button
        onClick={() => onFocus({ file: f.file, line: f.line })}
        className="flex w-full items-baseline gap-2 border-b border-line py-1.5 text-left text-[12px] transition-colors hover:bg-raised"
      >
        <span className={`w-9 shrink-0 font-mono text-[12px] tabular-nums ${bad ? "text-bad" : "text-ink-3"}`}>L{f.line}</span>
        <span className={`min-w-0 flex-1 ${bad ? "text-ink" : "text-ink-2"}`}>{f.title}</span>
        <span className={`shrink-0 text-[11px] tracking-[0.08em] uppercase ${f.severity === "critical" ? "text-bad" : "text-ink-3"}`}>{f.severity}</span>
      </button>
    </li>
  );
}

function Receipt({ receipt, href }: { receipt: ExecutionReceipt; href?: string }) {
  return (
    <dl className="rise mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border border-line bg-raised px-4 py-3 text-[12px]">
      <dt className="text-ink-3">Receipt</dt>
      <dd className="font-mono text-ok tabular-nums">#{receipt.id}</dd>
      <dt className="text-ink-3">Paid</dt>
      <dd className="font-mono text-ink tabular-nums">
        {receipt.fee.toLocaleString("en-US")} ugnot → {shortAddr(receipt.author)}
      </dd>
      <dt className="text-ink-3">Block</dt>
      <dd className="font-mono text-ink tabular-nums">{receipt.height.toLocaleString("en-US")}</dd>
      {href && (
        <dd className="col-span-2 pt-1">
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            View on gnoweb <ArrowUpRight />
          </a>
        </dd>
      )}
    </dl>
  );
}
