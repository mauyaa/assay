export type TokKind = "kw" | "type" | "str" | "com" | "num" | "fn" | "builtin" | "plain";
export interface Tok {
  k: TokKind;
  s: string;
}

const KW = new Set(
  "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var".split(" "),
);
const TYPES = new Set(
  "address realm any error string bool byte rune int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64".split(" "),
);
const BUILTIN = new Set("append cap close copy cross delete len make new panic print println recover nil true false iota".split(" "));

/** Monochrome Go/Gno tokenizer. Returns one token list per source line. */
export function highlight(src: string): Tok[][] {
  const lines: Tok[][] = [[]];
  const push = (k: TokKind, s: string) => {
    const parts = s.split("\n");
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ k, s: p });
    });
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const rest = src.slice(i);
    if (rest.startsWith("//")) {
      const end = src.indexOf("\n", i);
      const s = end < 0 ? rest : src.slice(i, end);
      push("com", s);
      i += s.length;
    } else if (rest.startsWith("/*")) {
      const end = src.indexOf("*/", i + 2);
      const s = end < 0 ? rest : src.slice(i, end + 2);
      push("com", s);
      i += s.length;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      push("str", src.slice(i, j + 1));
      i = j + 1;
    } else if (c === "`") {
      const end = src.indexOf("`", i + 1);
      const s = end < 0 ? rest : src.slice(i, end + 1);
      push("str", s);
      i += s.length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = rest.match(/^[A-Za-z_]\w*/)![0];
      const after = src.slice(i + m.length).match(/^\s*\(/);
      const k: TokKind = KW.has(m) ? "kw" : TYPES.has(m) ? "type" : BUILTIN.has(m) ? "builtin" : after ? "fn" : "plain";
      push(k, m);
      i += m.length;
    } else if (/[0-9]/.test(c)) {
      const m = rest.match(/^(0x[0-9a-fA-F_]+|[0-9][0-9_]*(\.[0-9_]+)?)/)![0];
      push("num", m);
      i += m.length;
    } else {
      const m = rest.match(/^[^A-Za-z_0-9"'`/]+|^\//)![0];
      push("plain", m);
      i += m.length;
    }
  }
  return lines;
}

/** Monochrome on purpose: in this app colour only ever means pass or fail. */
export const TOK_CLASS: Record<TokKind, string> = {
  kw: "text-ink font-medium",
  type: "text-ink",
  str: "text-ink-2",
  com: "text-ink-3",
  num: "text-ink",
  fn: "text-ink",
  builtin: "text-ink font-medium",
  plain: "text-ink",
};
