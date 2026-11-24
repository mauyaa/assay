import type { SourceFile } from "./types";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  rule: string;
  severity: Severity;
  title: string;
  message: string;
  file: string;
  line: number;
  snippet: string;
}

export interface AuditReport {
  pkgPath: string;
  kind: "package" | "realm";
  verdict: "PASS" | "FAIL";
  score: number;
  summary: string;
  findings: Finding[];
  files: { name: string; lines: number; sha256: string; scanned: boolean }[];
  sourceHash: string;
  linesScanned: number;
  rules: { id: string; title: string }[];
  auditedAt: string;
}

export const RULES = [
  { id: "AS001", title: "Coin transfer to a hard-coded address" },
  { id: "AS002", title: "Coin minting or burning" },
  { id: "AS003", title: "Pure package imports chain/banker" },
  { id: "AS004", title: "Pure package asks for the caller's realm handle" },
  { id: "AS005", title: "Pure package builds a realm-send banker" },
  { id: "AS006", title: "Hard-coded g1 address" },
  { id: "AS007", title: "Uses chain/runtime/unsafe" },
  { id: "AS008", title: "Unbounded loop" },
  { id: "AS009", title: "OriginSend without AssertOriginCall" },
  { id: "AS010", title: "Calls into other realms" },
  { id: "AS011", title: "Realm pays out coins" },
] as const;

const WEIGHT: Record<Severity, number> = { critical: 60, high: 25, medium: 8, low: 2, info: 0 };
const ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const BECH32 = "[qpzry9x8gf2tvdw0s3jn54khce6mua7l]";
const ADDR_LITERAL = new RegExp(`"(g1${BECH32}{38})"`);
const ADDR_LITERAL_G = new RegExp(`"(g1${BECH32}{38})"`, "g");

interface Lexed {
  /** Source with comments blanked; string literals intact. */
  code: string[];
  /** Source with comments and string contents blanked (quotes kept). */
  bare: string[];
}

/** Blanks comments and string bodies, keeping line and column positions. */
export function lex(src: string): Lexed {
  let code = "";
  let bare = "";
  type St = "n" | "line" | "block" | "dq" | "raw" | "rune";
  let st: St = "n";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    const keep = (ch: string, bareCh = ch) => {
      code += ch;
      bare += bareCh;
    };
    const blank = () => keep(c === "\n" ? "\n" : " ");
    switch (st) {
      case "n":
        if (c === "/" && n === "/") { st = "line"; blank(); }
        else if (c === "/" && n === "*") { st = "block"; blank(); }
        else if (c === '"') { st = "dq"; keep(c); }
        else if (c === "`") { st = "raw"; keep(c); }
        else if (c === "'") { st = "rune"; keep(c); }
        else keep(c);
        break;
      case "line":
        if (c === "\n") { st = "n"; keep("\n"); } else blank();
        break;
      case "block":
        if (c === "*" && n === "/") { blank(); i++; keep(" "); st = "n"; } else blank();
        break;
      case "dq":
      case "rune": {
        const end = st === "dq" ? '"' : "'";
        if (c === "\\" && n !== undefined) { keep(c, " "); keep(n, " "); i++; }
        else if (c === end) { keep(c); st = "n"; }
        else if (c === "\n") { keep("\n"); st = "n"; }
        else keep(c, " ");
        break;
      }
      case "raw":
        if (c === "`") { keep(c); st = "n"; }
        else keep(c, c === "\n" ? "\n" : " ");
        break;
    }
  }
  return { code: code.split("\n"), bare: bare.split("\n") };
}

/** Splits a call's argument list at top-level commas. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Arguments of the call whose "(" is at `from`, across lines. */
function callArgs(lines: string[], lineIdx: number, from: number): string {
  let depth = 0;
  let out = "";
  for (let l = lineIdx; l < Math.min(lines.length, lineIdx + 12); l++) {
    const text = l === lineIdx ? lines[l].slice(from) : lines[l];
    for (const ch of text) {
      if (ch === "(") { depth++; if (depth === 1) continue; }
      if (ch === ")") { depth--; if (depth === 0) return out; }
      if (depth >= 1) out += ch;
    }
    out += " ";
  }
  return out;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const isTestFile = (name: string) => name.endsWith("_test.gno") || name.endsWith("_filetest.gno");

/** Audits a package's source. Any critical or high finding fails it. */
export async function auditPackage(pkgPath: string, files: SourceFile[]): Promise<AuditReport> {
  const kind: AuditReport["kind"] = pkgPath.includes("/r/") ? "realm" : "package";
  const isPure = kind === "package";
  const findings: Finding[] = [];
  let linesScanned = 0;

  const add = (f: Omit<Finding, "title">) => {
    const title = RULES.find((r) => r.id === f.rule)?.title ?? f.rule;
    findings.push({ ...f, title, snippet: f.snippet.trim() });
  };

  for (const file of files) {
    if (!file.name.endsWith(".gno") || isTestFile(file.name)) continue;
    const raw = file.body.split("\n");
    const { code, bare } = lex(file.body);
    linesScanned += raw.length;
    const at = (i: number) => ({ file: file.name, line: i + 1, snippet: raw[i] ?? "" });

    // Names bound to address literals, e.g. const sink = "g1...".
    const addrIdents = new Set<string>();
    const bindRe = new RegExp(`\\b([A-Za-z_]\\w*)\\s*(?:address\\s*)?(?::=|=)\\s*(?:address\\s*\\(\\s*)?"g1${BECH32}{38}"`);
    for (const line of code) {
      const m = line.match(bindRe);
      if (m) addrIdents.add(m[1]);
    }
    const isHardcoded = (expr: string) => {
      const e = expr.trim();
      if (ADDR_LITERAL.test(e)) return true;
      const inner = e.match(/^address\s*\(\s*([A-Za-z_]\w*)\s*\)$/);
      if (inner && addrIdents.has(inner[1])) return true;
      return addrIdents.has(e);
    };

    const usesOriginSend = bare.some((l) => /\bOriginSend\s*\(/.test(l));
    const assertsOrigin = bare.some((l) => /\bAssertOriginCall\s*\(/.test(l));

    for (let i = 0; i < raw.length; i++) {
      const c = code[i] ?? "";
      const b = bare[i] ?? "";

      const imp = c.match(/^\s*(?:import\s+)?(?:[A-Za-z_]\w*\s+)?"([^"]+)"\s*$/);
      if (imp) {
        const path = imp[1];
        if (path === "chain/banker" && isPure) {
          add({ rule: "AS003", severity: "high", ...at(i),
            message: "A stateless /p/ library has no legitimate reason to move coins, but this one imports the banker." });
        }
        if (path === "chain/runtime/unsafe") {
          add({ rule: "AS007", severity: "medium", ...at(i),
            message: "Reads origin-level context (OriginCaller/OriginSend). Safe only behind runtime.AssertOriginCall()." });
        }
        if (path.startsWith("gno.land/r/")) {
          add({ rule: "AS010", severity: "low", ...at(i),
            message: `Calls into realm ${path}; its state can change as a side effect of this package.` });
        }
      }

      if (isPure) {
        const fn = c.match(/^\s*func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)\s*\(([^)]*)\)/);
        if (fn && /\brealm\b/.test(fn[2])) {
          add({ rule: "AS004", severity: "high", ...at(i),
            message: `${fn[1]}() takes the caller's realm. That handle lets the library spend the caller realm's coins.` });
        }
      }

      if (/\bBankerTypeRealmSend\b/.test(b) && isPure) {
        add({ rule: "AS005", severity: "high", ...at(i),
          message: "Builds a banker that sends from whatever realm was passed in." });
      }

      if (/\b(IssueCoin|RemoveCoin)\s*\(|\bBankerTypeRealmIssue\b/.test(b)) {
        add({ rule: "AS002", severity: isPure ? "critical" : "medium", ...at(i),
          message: isPure ? "A library minting or burning coins on the caller's behalf." : "Realm mints or burns coins; check who can trigger it." });
      }

      const send = b.search(/\.SendCoins\s*\(/);
      if (send >= 0) {
        const args = splitArgs(callArgs(code, i, c.indexOf("(", send)));
        const to = args[1] ?? "";
        if (isHardcoded(to)) {
          add({ rule: "AS001", severity: "critical", ...at(i),
            message: `Sends coins to a fixed address (${to}). Every call drains funds to that wallet.` });
        } else if (kind === "realm") {
          add({ rule: "AS011", severity: "info", ...at(i),
            message: `Realm pays out to ${to || "a computed recipient"}. Expected for escrows and wrappers.` });
        }
      }

      ADDR_LITERAL_G.lastIndex = 0;
      if (ADDR_LITERAL_G.test(c) && !findings.some((f) => f.file === file.name && f.line === i + 1 && f.rule === "AS001")) {
        add({ rule: "AS006", severity: isPure ? "high" : "medium", ...at(i),
          message: "Hard-coded wallet address. In a library this usually marks a fee sink or drain target." });
      }

      const loopAt = b.search(/\bfor\s*\{/);
      if (loopAt >= 0) {
        let depth = 0;
        let body = "";
        let closed = false;
        for (let j = i; j < bare.length && !closed; j++) {
          const seg = j === i ? bare[j].slice(loopAt) : bare[j];
          for (const ch of seg) {
            if (ch === "{") depth++;
            else if (ch === "}" && --depth === 0) { closed = true; break; }
            body += ch;
          }
          body += "\n";
        }
        if (!/\b(break|return|panic|goto)\b/.test(body)) {
          add({ rule: "AS008", severity: "medium", ...at(i),
            message: "Loop has no break, return or panic. A call can burn its whole gas budget." });
        }
      }

      if (usesOriginSend && !assertsOrigin && /\bOriginSend\s*\(/.test(b)) {
        add({ rule: "AS009", severity: "high", ...at(i),
          message: "OriginSend() is trusted without runtime.AssertOriginCall(); an intermediary realm can spend the user's deposit." });
      }
    }
  }

  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);

  const fileMeta = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      lines: f.body.split("\n").length,
      sha256: await sha256(f.body),
      scanned: f.name.endsWith(".gno") && !isTestFile(f.name),
    })),
  );
  const sourceHash = await sha256(
    [...files].sort((a, b) => a.name.localeCompare(b.name)).map((f) => `${f.name}\n${f.body}`).join("\n\0\n"),
  );

  const blocking = findings.filter((f) => f.severity === "critical" || f.severity === "high");
  const score = Math.max(0, 100 - findings.reduce((s, f) => s + WEIGHT[f.severity], 0));
  const verdict = blocking.length === 0 ? "PASS" : "FAIL";
  const counts = (["critical", "high", "medium", "low"] as Severity[])
    .map((s) => [s, findings.filter((f) => f.severity === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(", ");
  const summary =
    verdict === "FAIL"
      ? `Rejected: ${counts}. First blocking issue: ${blocking[0].title} at ${blocking[0].file}:${blocking[0].line}.`
      : counts
        ? `Passed with notes: ${counts}.`
        : "Passed: no findings.";

  return {
    pkgPath,
    kind,
    verdict,
    score,
    summary,
    findings,
    files: fileMeta,
    sourceHash,
    linesScanned,
    rules: RULES.map((r) => ({ id: r.id, title: r.title })),
    auditedAt: new Date().toISOString(),
  };
}

export function isBlocking(f: Finding): boolean {
  return f.severity === "critical" || f.severity === "high";
}
