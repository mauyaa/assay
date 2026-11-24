"use client";

import { auditPackage, BUNDLED_SOURCES, mainFile, type AuditReport } from "@assay/core";
import { useEffect, useRef, useState } from "react";
import type { WalletAccount } from "@/lib/adena";
import { client, NET } from "@/lib/network";
import { Cross } from "./icons";
import type { RegistryMode } from "./Workbench";

export interface PublishInput {
  path: string;
  description: string;
  sourceCode: string;
  feePerCall: number;
}

const input =
  "w-full border border-line bg-raised px-3 py-2 text-[14px] text-ink placeholder:text-ink-3 transition-colors focus:border-ink-3 focus:outline-none";

export function PublishModal(props: {
  mode: RegistryMode;
  wallet: WalletAccount | null;
  bundledPaths: string[];
  onClose: () => void;
  onSubmit: (p: PublishInput) => Promise<string | null>;
}) {
  const [path, setPath] = useState("gno.land/p/");
  const [description, setDescription] = useState("");
  const [fee, setFee] = useState("500");
  const [sourceCode, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pre, setPre] = useState<AuditReport | null>(null);
  const { onClose } = props;
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Audit what is about to be registered, as you type.
  useEffect(() => {
    if (!sourceCode.trim()) return setPre(null);
    const id = setTimeout(() => {
      const p = /^gno\.land\/[pr]\//.test(path) ? path : "gno.land/p/draft";
      auditPackage(p, [{ name: `${p.split("/").pop()}.gno`, body: sourceCode }]).then(setPre);
    }, 250);
    return () => clearTimeout(id);
  }, [sourceCode, path]);

  const pull = async () => {
    setNote("Loading…");
    const onChain = await client.fetchPackage(path).catch(() => null);
    const files = onChain ?? BUNDLED_SOURCES[path] ?? null;
    const main = files ? mainFile(files) : undefined;
    if (!main) return setNote("Not found");
    setSource(main.body);
    setNote(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await props.onSubmit({ path: path.trim(), description: description.trim(), sourceCode, feePerCall: Number(fee) });
    setBusy(false);
    if (err) setError(err);
  };


  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        className="rise flex max-h-[90dvh] w-full max-w-[600px] flex-col border border-line bg-raised"
      >
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 id="publish-title" className="text-[20px] font-semibold tracking-[-0.01em] text-ink">
              Publish
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 p-2 text-ink-3 hover:bg-muted hover:text-ink">
            <Cross />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <Field label="Path">
            <div className="flex gap-2">
              <input
                ref={first}
                required
                value={path}
                onChange={(e) => setPath(e.target.value)}
                pattern="gno\.land\/[pr]\/[a-z0-9\/_.\-]+"
                list="known-paths"
                className={`${input} font-mono text-[13px]`}
              />
              <datalist id="known-paths">
                {props.bundledPaths.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <button type="button" onClick={pull} className="shrink-0 border border-line px-3 text-[14px] text-ink hover:border-ink-3">
                Load
              </button>
            </div>
            {note && <p className="mt-1.5 text-[13px] text-ink-3">{note}</p>}
          </Field>

          <div className="grid grid-cols-[1fr_140px] gap-4">
            <Field label="Description">
              <input value={description} maxLength={280} onChange={(e) => setDescription(e.target.value)} className={input} />
            </Field>
            <Field label="Fee (ugnot)">
              <input
                required
                type="number"
                min={0}
                max={1_000_000_000}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className={`${input} text-right tabular-nums`}
              />
            </Field>
          </div>

          <Field label="Source">
            <textarea
              required
              value={sourceCode}
              onChange={(e) => setSource(e.target.value)}
              spellCheck={false}
              rows={10}
              placeholder="package mypkg"
              className={`${input} resize-y bg-muted font-mono text-[13px] leading-relaxed`}
            />
          </Field>

          {pre && (
            <p className={`text-[14px] font-medium ${pre.verdict === "PASS" ? "text-ok" : "text-bad"}`} title={pre.summary}>
              {pre.verdict === "PASS" ? "Passes audit" : "Fails audit"}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-line px-6 py-4">
          <p className="text-[13px] text-bad">{error}</p>
          <button
            type="submit"
            disabled={busy}
            className="h-10 shrink-0 bg-action px-5 text-[14px] font-medium text-on-action transition-colors hover:bg-action-hover disabled:opacity-50"
          >
            {busy ? "Publishing…" : "Publish"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[14px] font-medium text-ink">{label}</span>
        {hint && <span className="text-[13px] text-ink-3">{hint}</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
