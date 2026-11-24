"use client";

import { isBlocking, shortAddr, type AuditReport, type Finding, type Origin, type RegistryPackage } from "@assay/core";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlight, TOK_CLASS } from "@/lib/highlight";
import { NET } from "@/lib/network";
import { ArrowUpRight } from "./icons";
import { splitPath } from "./RegistryPane";
import type { LoadedSource } from "./Workbench";

export type RenderTab = "leaderboard" | "package" | "receipts";

export function SourcePane(props: {
  pkgPath: string;
  row: RegistryPackage | null;
  source: LoadedSource | null;
  loading: boolean;
  activeFile: string;
  onFile: (f: string) => void;
  audit: AuditReport | null;
  focus: { file: string; line: number } | null;
  view: "source" | "render";
  onView: (v: "source" | "render") => void;
  renderTab: RenderTab;
  onRenderTab: (t: RenderTab) => void;
  renderSource: (tab: RenderTab) => Promise<{ md: string; origin: Origin; query: string }>;
  renderNonce: number;
  onNavigate: (t: { pkg?: string; tab?: RenderTab }) => void;
}) {
  const { source, audit, view, row } = props;
  const file = source?.files.find((f) => f.name === props.activeFile) ?? source?.files[0];
  const current = audit && source?.pkgPath === props.pkgPath ? audit : null;
  const findings = useMemo(() => (current ? current.findings.filter((f) => f.file === file?.name) : []), [current, file?.name]);

  const { ns, name } = splitPath(props.pkgPath);

  return (
    <section className="flex min-h-[70vh] min-w-0 flex-col border-b border-line lg:min-h-0 lg:border-r lg:border-b-0">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[880px] px-6 pt-6 pb-16 sm:px-8">
          {/* Title */}
          <p className="font-mono text-[13px] text-ink-3">gno.land/{ns}</p>
          <h1 className="mt-2 text-[30px] leading-tight font-semibold tracking-[-0.02em] text-ink">{name}</h1>
          {row?.description && <p className="mt-2 text-[16px] text-ink-2">{row.description}</p>}

          <Meta row={row} audit={current} />

          {/* Tabs */}
          <div className="mt-8 flex items-center gap-8 border-b border-line" role="tablist">
            {(["source", "render"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => props.onView(v)}
                className={`-mb-px border-b-2 pb-2.5 text-[12px] font-medium tracking-[0.08em] uppercase transition-colors ${
                  view === v ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
                }`}
              >
                {v === "source" ? "Raw .gno source" : "gnoweb Render()"}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {view === "source" ? (
              props.loading && !source ? (
                <p className="text-[14px] text-ink-3">Loading…</p>
              ) : !source || !file ? (
                <p className="text-[14px] text-ink-3">No source</p>
              ) : (
                <CodePanel
                  files={source.files.map((f) => f.name)}
                  active={file.name}
                  onFile={props.onFile}
                  origin={source.origin}
                  body={file.body}
                  findings={findings}
                  focusLine={props.focus?.file === file.name ? props.focus.line : null}
                />
              )
            ) : (
              <RenderView {...props} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Meta({ row, audit }: { row: RegistryPackage | null; audit: AuditReport | null }) {
  const items: React.ReactNode[] = [];
  if (audit) {
    items.push(
      audit.verdict === "PASS" ? (
        <span key="a" className="font-medium text-ok">Passed</span>
      ) : (
        <span key="a" className="font-medium text-bad">Failed</span>
      ),
    );
  } else if (row?.listing === "registry") {
    items.push(
      <span key="a" className={row.verified ? "font-medium text-ok" : "text-ink-2"}>
        {row.verified ? "Verified" : "Unverified"}
      </span>,
    );
  }
  if (row?.listing === "registry") {
    items.push(<span key="f">{row.feePerCall.toLocaleString("en-US")} ugnot</span>);
    items.push(<span key="c">{row.totalCalls === 1 ? "1 call" : `${row.totalCalls} calls`}</span>);
    items.push(
      <span key="u" title={row.author}>
        <span className="font-mono text-[13px]">{shortAddr(row.author)}</span>
      </span>,
    );
  } else if (row) {
    items.push(<span key="s">Unregistered</span>);
  }
  if (!items.length) return null;
  return (
    <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-2">
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-line">·</span>}
          {it}
        </Fragment>
      ))}
    </p>
  );
}

function CodePanel(props: {
  files: string[];
  active: string;
  onFile: (f: string) => void;
  origin: Origin;
  body: string;
  findings: Finding[];
  focusLine: number | null;
}) {
  const lines = useMemo(() => highlight(props.body), [props.body]);
  const byLine = useMemo(() => {
    const m = new Map<number, Finding[]>();
    for (const f of props.findings) m.set(f.line, [...(m.get(f.line) ?? []), f]);
    return m;
  }, [props.findings]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!props.focusLine) return;
    ref.current?.querySelector(`[data-line="${props.focusLine}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [props.focusLine, props.body]);

  const originText =
    props.origin === "onyx" ? "On chain" : props.origin === "registry" ? "On chain · registry copy" : props.origin === "bundled" ? "Local copy" : "Simulated";

  return (
    <div ref={ref} className="overflow-hidden border border-line bg-raised">
      <div className="flex items-stretch justify-between gap-4 border-b border-line pr-4">
        <div className="flex overflow-x-auto">
          {props.files.map((f) => (
            <button
              key={f}
              onClick={() => props.onFile(f)}
              className={`shrink-0 border-r border-line px-4 py-2 font-mono text-[12px] transition-colors ${
                f === props.active ? "bg-bg text-ink" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="self-center shrink-0 text-[11px] font-medium tracking-[0.08em] text-ink-3 uppercase">{originText}</span>
      </div>

      <div className="overflow-x-auto py-3 font-mono text-[13px] leading-[1.75]">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((toks, i) => {
              const n = i + 1;
              const fs = byLine.get(n);
              const blocking = fs?.filter(isBlocking) ?? [];
              const bad = blocking.length > 0;
              const focused = props.focusLine === n;
              const callout = focused && fs ? (blocking[0] ?? fs[0]) : null;
              return (
                <Fragment key={n}>
                  <tr data-line={n} className={bad ? "bg-bad-wash" : focused ? "bg-accent-wash" : undefined}>
                    <td
                      className={`w-px border-l-2 pr-4 pl-3 text-right align-top tabular-nums select-none ${
                        bad ? "border-bad text-bad" : "border-transparent text-ink-3/70"
                      }`}
                    >
                      {n}
                    </td>
                    <td className="pr-6 break-words whitespace-pre-wrap">
                      {toks.length === 0
                        ? " "
                        : toks.map((t, j) => (
                            <span key={j} className={TOK_CLASS[t.k]}>
                              {t.s}
                            </span>
                          ))}
                    </td>
                  </tr>
                  {callout && (
                    <tr className={bad ? "bg-bad-wash" : "bg-accent-wash"}>
                      <td className={`border-l-2 ${bad ? "border-bad" : "border-transparent"}`} />
                      <td className="pr-6 pb-2">
                        <div className={`rise inline-block border bg-raised px-3 py-1.5 font-sans text-[13px] leading-snug whitespace-normal ${bad ? "border-bad/20" : "border-line"}`}>
                          <span className={`font-medium ${bad ? "text-bad" : "text-ink"}`} title={callout.message}>
                            {callout.title}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RenderView(props: {
  pkgPath: string;
  row: RegistryPackage | null;
  renderTab: RenderTab;
  onRenderTab: (t: RenderTab) => void;
  renderSource: (tab: RenderTab) => Promise<{ md: string; origin: Origin; query: string }>;
  renderNonce: number;
  onNavigate: (t: { pkg?: string; tab?: RenderTab }) => void;
}) {
  const [out, setOut] = useState<{ md: string; origin: Origin; query: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { renderTab, renderSource, renderNonce } = props;

  useEffect(() => {
    let alive = true;
    setErr(null);
    renderSource(renderTab)
      .then((o) => alive && setOut(o))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [renderTab, renderSource, renderNonce]);

  const sampleRealm = props.row?.listing === "sample" && props.pkgPath.includes("/r/");
  const tabs: { id: RenderTab; label: string }[] = [
    { id: "leaderboard", label: "Leaderboard" },
    { id: "package", label: sampleRealm ? "Realm" : "Package" },
    { id: "receipts", label: "Receipts" },
  ];
  const live = out?.origin === "onyx";
  const href = live ? `${NET.gnoweb}/${out.query.replace(/^gno\.land\//, "")}` : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex border border-line">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => props.onRenderTab(t.id)}
              className={`border-l border-line px-3 py-1.5 text-[12px] first:border-l-0 transition-colors ${
                t.id === renderTab ? "bg-raised text-ink" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] text-accent hover:underline">
            gnoweb <ArrowUpRight />
          </a>
        ) : (
          out && <span className="text-[13px] text-ink-3">Simulated</span>
        )}
      </div>

      {err && <p className="text-[14px] text-bad">{err}</p>}
      {out && (
        <div className="doc rise" key={`${renderTab}-${renderNonce}-${props.pkgPath}`}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                const m = href?.match(/^\/r\/nym-assay001\/registry:(pkg\/(.+)|receipts?(?:\/\d+)?)$/);
                if (m && !live) {
                  return (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        props.onNavigate(m[2] ? { pkg: m[2] } : { tab: "receipts" });
                      }}
                    >
                      {children}
                    </a>
                  );
                }
                return (
                  <a href={href?.startsWith("/") ? `${NET.gnoweb}${href}` : href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {out.md}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
