# Assay

Audit a gno.land package from its on-chain source. Pay for it only if it passes.

**[Open the app](https://mauyaa.github.io/assay/)** · [Try the trap](https://mauyaa.github.io/assay/?pkg=gno.land/p/nym-assay001/malicious_helper&audit=1) · [Registry on Onyx](https://onyx.testnets.gno.land/r/nym-assay001/registry)

![Assay rejects malicious_helper: line 18 drains the caller to a hard-coded address](docs/img/trap-rejected.png)

## Why gno.land

Gno stores contracts as plain-text source. An agent can read the exact code it is about to pay for, with no bytecode and no trusted upload. The rules that move money live in the realm, not on a server:

- unverified packages can't be paid
- the author gets the exact fee and the caller gets the rest back, in one transaction
- a retried payment is never charged twice

## How it works

```mermaid
flowchart LR
  A[Agent or app] -- vm/qfile --> P[Package source]
  A -- audit, 11 rules --> A
  A -- ExecuteAndPay + fee --> R[r/nym-assay001/registry]
  R -- fee --> Author
  R --> Receipt
```

| | Path |
|---|---|
| Realm | [`contracts/r/nym-assay001/registry`](contracts/r/nym-assay001/registry/registry.gno) |
| Clean package | [`contracts/p/nym-assay001/vault_math`](contracts/p/nym-assay001/vault_math/vault_math.gno) |
| Trap (registered, never deployed) | [`contracts/p/nym-assay001/malicious_helper`](contracts/p/nym-assay001/malicious_helper/malicious_helper.gno) |
| Audit engine | [`packages/core/src/audit.ts`](packages/core/src/audit.ts) |
| MCP server | [`mcp-server`](mcp-server/src/index.ts) |
| App | [`web`](web/components/Workbench.tsx) |

### Realm

| Function | Who |
|---|---|
| `RegisterPackage(path, description, source, fee)` | anyone; the caller becomes the author |
| `SetVerified(path, verified, note)` | auditors |
| `AddAuditor`, `RemoveAuditor`, `TransferAdmin` | admin |
| `ExecuteAndPay(path, requestID)` with the fee attached | direct callers only |
| `Render`, `ReceiptFor` | anyone |

## Run

```bash
npm install && npm test && npm run dev
```

**Contracts** (21 tests):

```bash
cd contracts && gno test ./... -v
```

**Full flow on a local chain:** run `gnodev local` in `contracts/`, then `./scripts/local-proof.sh`. It pays once, then shows that a duplicate retry, the trap and an underpayment are all refused.

**MCP server:** `npm run mcp`. Add it to any MCP client as a stdio server: `node mcp-server/bin/assay-mcp.mjs`.

| Tool | |
|---|---|
| `list_gno_packages` | registered packages, fees, calls |
| `fetch_and_audit_gno_source` | source from chain, verdict, findings by line |
| `execute_verified_package` | audits, then pays through gnokey |

## Deploy

```bash
./scripts/deploy-onyx.sh <gnokey-key>
```

The script registers the namespace, deploys, registers both packages, verifies `vault_math` and makes one paid call. It skips any step already on chain.

## Status

| | |
|---|---|
| Contracts, audit, MCP, app | Working and tested |
| Onyx | Live: [registry](https://onyx.testnets.gno.land/r/nym-assay001/registry), [vault_math](https://onyx.testnets.gno.land/p/nym-assay001/vault_math). Transactions in [`docs/deployment.json`](docs/deployment.json) |
| Trap package | Registered as source only, never deployed |
| Audit | Static rules, not formal verification |

[Demo script](docs/DEMO.md) · [Usability](docs/USABILITY.md) · Apache-2.0
