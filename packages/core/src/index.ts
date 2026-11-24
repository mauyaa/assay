export * from "./types";
export * from "./config";
export * from "./rpc";
export * from "./audit";
export * from "./simulator";
export { BUNDLED_SOURCES } from "./bundled-sources";

import { BUNDLED_SOURCES } from "./bundled-sources";
import type { GnoClient } from "./rpc";
import type { Origin, SourceFile } from "./types";

/**
 * Finds a package's source, preferring the chain:
 *   1. the deployed package itself (vm/qfile)            origin "onyx"
 *   2. the source registered in the registry, on chain    origin "registry"
 *   3. the copy bundled from contracts/                   origin "bundled"
 * The origin is always shown, so a local copy never passes as chain data.
 */
export async function loadSource(
  client: GnoClient,
  pkgPath: string,
): Promise<{ files: SourceFile[]; origin: Origin } | null> {
  try {
    const onChain = await client.fetchPackage(pkgPath);
    if (onChain && onChain.length > 0) return { files: onChain, origin: "onyx" };
  } catch {
    // network failure: fall through
  }
  try {
    const reg = await client.registryPackage(pkgPath);
    if (reg?.sourceCode) {
      return { files: [{ name: `${pkgPath.split("/").pop()}.gno`, body: reg.sourceCode }], origin: "registry" };
    }
  } catch {
    // registry unreachable or not deployed: fall through
  }
  const bundled = BUNDLED_SOURCES[pkgPath];
  return bundled ? { files: bundled, origin: "bundled" } : null;
}

/** The file a reader most likely wants: the largest non-test, non-doc .gno file. */
export function mainFile(files: SourceFile[]): SourceFile | undefined {
  const code = files.filter((f) => f.name.endsWith(".gno") && !/_(file)?test\.gno$/.test(f.name));
  const pool = code.filter((f) => f.name !== "doc.gno");
  return (pool.length ? pool : code).reduce<SourceFile | undefined>((best, f) => (!best || f.body.length > best.body.length ? f : best), undefined);
}
