export * from "./types";
export * from "./config";
export * from "./rpc";
export * from "./audit";
export * from "./simulator";
export { BUNDLED_SOURCES } from "./bundled-sources";

import { BUNDLED_SOURCES } from "./bundled-sources";
import type { GnoClient } from "./rpc";
import type { Origin, SourceFile } from "./types";

/** Source from the chain, then the registry's on-chain copy, then the local bundle. */
export async function loadSource(
  client: GnoClient,
  pkgPath: string,
): Promise<{ files: SourceFile[]; origin: Origin } | null> {
  try {
    const onChain = await client.fetchPackage(pkgPath);
    if (onChain && onChain.length > 0) return { files: onChain, origin: "onyx" };
  } catch {
  }
  try {
    const reg = await client.registryPackage(pkgPath);
    if (reg?.sourceCode) {
      return { files: [{ name: `${pkgPath.split("/").pop()}.gno`, body: reg.sourceCode }], origin: "registry" };
    }
  } catch {
  }
  const bundled = BUNDLED_SOURCES[pkgPath];
  return bundled ? { files: bundled, origin: "bundled" } : null;
}

/** The largest non-test, non-doc .gno file. */
export function mainFile(files: SourceFile[]): SourceFile | undefined {
  const code = files.filter((f) => f.name.endsWith(".gno") && !/_(file)?test\.gno$/.test(f.name));
  const pool = code.filter((f) => f.name !== "doc.gno");
  return (pool.length ? pool : code).reduce<SourceFile | undefined>((best, f) => (!best || f.body.length > best.body.length ? f : best), undefined);
}
