"use client";

import { shortAddr, type AuditReport, type RegistryPackage } from "@assay/core";
import { useMemo, useState } from "react";
import { NETWORK_NAME } from "@/lib/network";
import { Plus, Search } from "./icons";
import type { RegistryMode } from "./Workbench";

/** 6px: green verified or passed, red failed, nothing when unreviewed. */
export function StatusDot({ row, audit }: { row: RegistryPackage; audit?: AuditReport }) {
  if (audit?.verdict === "FAIL") return <span title="Failed audit" className="size-1.5 shrink-0 rounded-full bg-bad" />;
  if (row.verified || audit?.verdict === "PASS")
    return <span title={row.verified ? "Verified" : "Passed audit"} className="size-1.5 shrink-0 rounded-full bg-ok" />;
  return null;
}

/** Splits gno.land/p/nt/avl/v0 into namespace "p/nt/" and name "avl/v0". */
export function splitPath(path: string): { ns: string; name: string } {
  const parts = path.replace(/^gno\.land\//, "").split("/");
  const keep = /^v\d+$/.test(parts[parts.length - 1]) ? 2 : 1;
  return { ns: parts.slice(0, -keep).join("/") + "/", name: parts.slice(-keep).join("/") };
}

export function RegistryPane(props: {
  rows: RegistryPackage[];
  mode: RegistryMode;
  selected: string;
  audits: Record<string, AuditReport>;
  onSelect: (path: string) => void;
  onPublish: () => void;
  onRetry: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? props.rows.filter((r) => r.path.includes(s) || r.description.toLowerCase().includes(s)) : props.rows;
  }, [q, props.rows]);

  const registered = filtered.filter((r) => r.listing === "registry");
  const others = filtered.filter((r) => r.listing === "sample");
  const shared = { selected: props.selected, audits: props.audits, onSelect: props.onSelect };

  return (
    <aside className="flex flex-col border-b border-line lg:min-h-0 lg:border-r lg:border-b-0">
      <label className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-6 text-ink-3 focus-within:text-ink">
        <Search />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search packages"
          aria-label="Search packages"
          className="w-full bg-transparent text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
        />
      </label>

      <nav className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {props.mode === "offline" && (
          <div className="border-b border-line px-6 py-5">
            <p className="text-[13px] text-ink">Can’t reach {NETWORK_NAME}</p>
            <button onClick={props.onRetry} className="mt-1 text-[13px] font-medium text-accent hover:underline">
              Retry
            </button>
          </div>
        )}
        <Group title="Registry" rows={registered} start={1} fees {...shared} />
        <Group title={NETWORK_NAME} rows={others} start={registered.length + 1} {...shared} />
        {filtered.length === 0 && <p className="px-6 py-5 text-[13px] text-ink-3">No results</p>}
      </nav>

      <button
        onClick={props.onPublish}
        className="flex h-11 shrink-0 items-center gap-2 border-t border-line px-6 text-[12px] font-medium tracking-[0.08em] text-ink-2 uppercase transition-colors hover:bg-raised hover:text-ink"
      >
        <Plus /> Publish
      </button>
    </aside>
  );
}

function Group(props: {
  title: string;
  rows: RegistryPackage[];
  start: number;
  fees?: boolean;
  selected: string;
  audits: Record<string, AuditReport>;
  onSelect: (path: string) => void;
}) {
  if (props.rows.length === 0) return null;
  return (
    <section>
      <h2 className="grid grid-cols-[2.25rem_1fr_auto] items-end border-b border-line px-6 pt-5 pb-2 text-[11px] font-medium tracking-[0.08em] text-ink-3 uppercase">
        <span>№</span>
        <span>{props.title}</span>
        {props.fees && <span>ugnot</span>}
      </h2>
      <ul>
        {props.rows.map((r, i) => {
          const active = r.path === props.selected;
          const { name } = splitPath(r.path);
          return (
            <li key={r.path}>
              <button
                onClick={() => props.onSelect(r.path)}
                aria-current={active ? "page" : undefined}
                title={r.path}
                className={`grid w-full grid-cols-[2.25rem_1fr_auto] items-start border-b border-l-2 border-b-line py-3 pr-6 pl-[22px] text-left transition-colors ${
                  active ? "border-l-action bg-raised" : "border-l-transparent hover:bg-raised"
                }`}
              >
                <span className={`font-mono text-[12px] leading-5 tabular-nums ${active ? "text-ink" : "text-ink-3"}`}>
                  {String(props.start + i).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className={`truncate text-[14px] leading-5 text-ink ${active ? "font-semibold" : ""}`}>{name}</span>
                    <StatusDot row={r} audit={props.audits[r.path]} />
                  </span>
                  {r.author && <span className="block truncate font-mono text-[12px] leading-5 text-ink-2">{shortAddr(r.author)}</span>}
                </span>
                {props.fees && (
                  <span className="font-mono text-[13px] leading-5 text-ink tabular-nums">{r.feePerCall.toLocaleString("en-US")}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
