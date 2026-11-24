"use client";

import type { AuditReport, RegistryPackage } from "@assay/core";
import { useMemo, useState } from "react";
import { NETWORK_NAME } from "@/lib/network";
import { Plus, Search } from "./icons";
import type { RegistryMode } from "./Workbench";

/**
 * A dot only appears when there is something to say:
 * green for verified or passed, red for failed. Unreviewed shows nothing.
 */
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
    <aside className="flex flex-col border-b border-line bg-subtle lg:min-h-0 lg:border-r lg:border-b-0">
      <div className="px-3 pt-6 pb-2">
        <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-raised px-3 text-ink-3 focus-within:border-ink-3 focus-within:text-ink-2">
          <Search />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search packages"
            className="w-full bg-transparent text-[14px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
        </label>
      </div>

      <nav className="px-3 pb-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {props.mode === "offline" && (
          <div className="px-3 pt-6">
            <p className="text-[14px] text-ink">Can’t reach {NETWORK_NAME}</p>
            <button onClick={props.onRetry} className="mt-2 text-[14px] font-medium text-accent hover:underline">
              Retry
            </button>
          </div>
        )}
        <Group title="Registry" aside="ugnot" rows={registered} {...shared} />
        <Group title={`On ${NETWORK_NAME}`} rows={others} {...shared} />
        {filtered.length === 0 && <p className="px-3 pt-6 text-[14px] text-ink-3">No results</p>}
      </nav>

      <div className="border-t border-line p-3">
        <button
          onClick={props.onPublish}
          className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-[14px] text-ink-2 transition-colors hover:bg-muted hover:text-ink"
        >
          <Plus /> Publish
        </button>
      </div>
    </aside>
  );
}

function Group(props: {
  title: string;
  aside?: string;
  rows: RegistryPackage[];
  selected: string;
  audits: Record<string, AuditReport>;
  onSelect: (path: string) => void;
}) {
  if (props.rows.length === 0) return null;
  return (
    <section className="pt-6">
      <h2 className="flex items-baseline justify-between px-3 pb-2 text-[12px] text-ink-3">
        <span className="font-medium">{props.title}</span>
        {props.aside && <span>{props.aside}</span>}
      </h2>
      <ul className="space-y-px">
        {props.rows.map((r) => {
          const active = r.path === props.selected;
          const { name } = splitPath(r.path);
          return (
            <li key={r.path}>
              <button
                onClick={() => props.onSelect(r.path)}
                aria-current={active ? "page" : undefined}
                className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                  active ? "bg-raised shadow-[0_0_0_1px_var(--color-border),var(--shadow-sm)]" : "hover:bg-muted"
                }`}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2" title={r.path}>
                  <span className={`truncate text-[14px] leading-5 text-ink ${active ? "font-medium" : ""}`}>{name}</span>
                  <StatusDot row={r} audit={props.audits[r.path]} />
                </span>
                {r.listing === "registry" && (
                  <span className="shrink-0 text-[14px] leading-5 text-ink-2 tabular-nums">{r.feePerCall.toLocaleString("en-US")}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
