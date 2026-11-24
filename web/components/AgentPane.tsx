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
  /** One plain sentence about what happened. */
  result?: string;
  /** The exact chain call, shown small for proof. */
  cmd?: string;
}

export interface AgentRun {
  pkgPath: string;
  execute: boolean;
  steps: AgentStep[];
  report?: AuditReport;
  receipt?: ExecutionReceipt;
  receiptHref?: string;
}

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
  const fee = payable ? row!.feePerCall.toLocaleString("en-US") : "";
  // Before a run, the step titles alone show the plan.
  const preview: AgentStep[] = [
    { title: "Read", status: "idle" },
    { title: "Audit", status: "idle" },
    { title: "Pay", status: "idle" },
    { title: "Receipt", status: "idle" },
  ];
  const steps = visible ? (visible.execute ? visible.steps : visible.steps.slice(0, 2)) : payable ? preview : preview.slice(0, 2);

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
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-6">
        <h2 className="flex items-baseline justify-between text-[16px] font-semibold tracking-[-0.01em] text-ink">
          Agent
          <span className="text-[13px] font-normal tracking-normal text-ink-3" title={NET.registryPath}>
            {signer}
          </span>
        </h2>

        <div className="mt-6 flex flex-col gap-1">
          <button
            onClick={() => props.onRun(payable)}
            disabled={running}
            className="h-10 rounded-md bg-action text-[14px] font-medium text-on-action transition-colors hover:bg-action-hover disabled:opacity-50"
          >
            {running ? "Running…" : payable ? `Audit & pay ${fee} ugnot` : "Audit"}
          </button>
          {payable && (
            <button
              onClick={() => props.onRun(false)}
              disabled={running}
              className="h-8 rounded-md text-[14px] text-ink-2 transition-colors hover:bg-muted hover:text-ink disabled:opacity-50"
            >
              Audit only
            </button>
          )}
        </div>

        {steps.length > 0 && (
          <ol className="mt-8 border-t border-line pt-6" aria-live="polite" aria-label="Agent steps">
            {steps.map((s, i) => (
              <Step key={i} n={i + 1} step={s} last={i === steps.length - 1}>
                {i === 1 && visible?.report && s.status !== "running" && (
                  <Findings report={visible.report} onFocus={props.onFocus} />
                )}
                {i === 3 && visible?.receipt && <Receipt receipt={visible.receipt} href={visible.receiptHref} />}
              </Step>
            ))}
          </ol>
        )}
      </div>

    </aside>
  );
}

function Step(props: { n: number; step: AgentStep; last: boolean; children?: React.ReactNode }) {
  const { status, title, result, cmd } = props.step;
  const marker =
    status === "running" ? (
      <Spinner className="text-ink-2" />
    ) : status === "done" ? (
      <Check className="text-ok" />
    ) : status === "failed" ? (
      <Cross className="text-bad" />
    ) : (
      <span className="text-[12px] text-ink-3 tabular-nums">{props.n}</span>
    );

  return (
    <li className="relative flex gap-3 pb-6">
      {!props.last && <span className="absolute top-7 bottom-1 left-[11px] w-px bg-line" aria-hidden />}
      <span
        className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-bg ${
          status === "failed" ? "border-bad/40" : status === "done" ? "border-ok/40" : "border-line"
        }`}
      >
        {marker}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={`text-[14px] ${status === "idle" || status === "skipped" ? "text-ink-3" : "font-medium text-ink"}`}>{title}</p>
        {result && (
          <p
            className={`${status === "idle" ? "" : "rise "}mt-0.5 text-[13px] leading-snug ${
              status === "failed" ? "text-bad" : status === "skipped" || status === "idle" ? "text-ink-3" : "text-ink-2"
            }`}
          >
            {result}
          </p>
        )}
        {cmd && <span className="sr-only">{cmd}</span>}
        {props.children}
      </div>
    </li>
  );
}

function Findings({ report, onFocus }: { report: AuditReport; onFocus: (f: { file: string; line: number }) => void }) {
  if (report.findings.length === 0) return null;
  const blocking = report.findings.filter(isBlocking);
  const notes = report.findings.filter((f) => !isBlocking(f));
  return (
    <ul className="rise mt-3 space-y-1">
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
        className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-[13px] transition-colors hover:bg-muted"
      >
        <span className={`w-12 shrink-0 font-mono text-[12px] tabular-nums ${bad ? "text-bad" : "text-ink-3"}`}>L{f.line}</span>
        <span className={`min-w-0 flex-1 ${bad ? "text-ink" : "text-ink-2"}`}>{f.title}</span>
        <span className={`shrink-0 text-[12px] ${f.severity === "critical" ? "text-bad" : "text-ink-3"}`}>{f.severity}</span>
      </button>
    </li>
  );
}

function Receipt({ receipt, href }: { receipt: ExecutionReceipt; href?: string }) {
  const sim = receipt.origin === "simulated";
  return (
    <dl className="rise mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md bg-muted px-4 py-3 text-[13px]">
      <dt className="text-ink-3">Receipt</dt>
      <dd className="text-ink tabular-nums">#{receipt.id}</dd>
      <dt className="text-ink-3">Paid</dt>
      <dd className="text-ink tabular-nums">{receipt.fee.toLocaleString("en-US")} ugnot</dd>
      <dt className="text-ink-3">To</dt>
      <dd className="font-mono text-[12px] text-ink-2" title={receipt.author}>
        {shortAddr(receipt.author)}
      </dd>
      <dt className="text-ink-3">Block</dt>
      <dd className="text-ink tabular-nums">{receipt.height.toLocaleString("en-US")}</dd>
      <dt className="text-ink-3">Tx</dt>
      <dd className="min-w-0 truncate font-mono text-[12px] text-ink-2" title={receipt.txHash}>
        {receipt.txHash.slice(0, 16)}…
      </dd>
      {href && (
        <dd className="col-span-2 pt-1">
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            gnoweb <ArrowUpRight />
          </a>
        </dd>
      )}
    </dl>
  );
}
