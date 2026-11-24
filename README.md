# Assay

**Audit a gno.land package from its on-chain source, then pay for it only if it passes.**

Assay is a package registry and payment escrow on gno.land, plus an AI-agent toolkit (an MCP server and a web workbench). An agent reads a package's plain-text Gno source straight from the chain, checks it against 11 security rules, and pays the author's per-call fee in GNOT only if the audit passes and an auditor has verified the package on chain. Every payment settles atomically in one transaction and leaves a receipt.

| | |
|---|---|
| Network | gno.land Onyx testnet, chain id `onyx-1` |
| Realm | `gno.land/r/nym-assay001/registry` |
| Demo packages | `gno.land/p/nym-assay001/vault_math` (clean), `gno.land/p/nym-assay001/malicious_helper` (trap, registered only) |
| License | Apache-2.0 |

**Live app:** https://mauyaa.github.io/assay/ · **Trap Test in one click:** https://mauyaa.github.io/assay/?pkg=gno.land/p/nym-assay001/malicious_helper&audit=1

![The agent rejects malicious_helper: line 18 sends the caller's coins to a hard-coded address](docs/img/trap-rejected.png)

> **Status, plainly.** Everything below is built and tested, and the full flow runs with real transactions on a local gno chain ([proof](#reproduce-the-core-flow-on-a-local-chain)). **The Onyx deployment is not done yet.** It needs the project's key and namespace, and the [deployment record](#onyx-deployment-record) is filled in only after it happens. See [Truthful status](#truthful-status).

---

<table><tr>
<td><img src="docs/img/clean-passed.png" alt="vault_math passes the audit"></td>
<td><img src="docs/img/dark.png" alt="Dark mode follows the device setting"></td>
</tr><tr><td>Clean package: audit passed</td><td>Dark mode follows the device</td></tr></table>

## The problem

**Who:** a developer whose AI agent calls third-party gno.land packages, for example a treasury bot that uses someone else's yield-math library.

**The pain:** before an agent can safely use or pay for a package, someone has to read the code. Today that is a person reading source by hand for every package and every new version, or the agent trusting it blindly. A malicious "helper" only needs one hidden line to drain the realm that calls it. The trap in this repo does exactly that, on line 18 of [`malicious_helper.gno`](contracts/p/nym-assay001/malicious_helper/malicious_helper.gno).

**The workaround and its cost:** manual review doesn't scale to agents that pick packages at runtime. Paying package authors per call has no shared, verifiable record: it happens off-chain or not at all.

**The promise, in one sentence:** *Assay checks the code before any money moves.*

## Why this has to be on gno.land

| What must be trusted | Why a normal backend can't provide it | What Gno provides |
|---|---|---|
| The audited code is the code that runs | On EVM chains, deployed code is bytecode, and readable source is a separate, trusted upload | gno.land stores packages as plain-text source. Assay audits the bytes the chain itself serves (`vm/qfile`) |
| "Only verified packages get paid" | A server can be changed or lie about its own rules | The rule lives in the realm: `ExecuteAndPay` reverts unless the package is verified on chain |
| Payment, payout and receipt happen together | Separate payment and logging steps can partly fail | One transaction: fee to the author, any extra refunded, receipt written, or the whole transaction reverts |
| A retry is never charged twice | Retry handling sits outside the money path | The realm records each (caller, request id) and refuses a repeat |
| Nobody else spends your deposit | A proxy can forward your payment | `runtime.AssertOriginCall()` refuses any intermediary realm |

**Alternatives:**
- **Reading the code by hand:** accurate, but it doesn't scale and isn't recorded.
- **EVM static analysers such as Slither:** they need verified source uploaded off-chain.
- **API marketplaces:** they bill off-chain with no on-chain receipt or rule enforcement.

Assay's advantage comes from the chain itself: source, rules, money and receipts all live in one place anyone can query.

## Architecture

```mermaid
flowchart LR
  subgraph Client
    UI["Web workbench<br/>(Next.js)"]
    MCP["MCP server<br/>(for AI agents)"]
    AUD["Audit engine<br/>11 static rules<br/>(packages/core)"]
  end
  W["Adena wallet<br/>or gnokey"]
  subgraph gno.land
    PKG["Packages<br/>plain-text .gno"]
    REG["Realm: r/nym-assay001/registry<br/>packages · auditors · receipts"]
    BANK["Native banker<br/>ugnot"]
  end

  UI -- "read: vm/qfile, vm/qrender" --> PKG
  UI -- "read: Render(api/...)" --> REG
  MCP -- "same reads" --> PKG
  UI --> AUD
  MCP --> AUD
  UI -- "sign MsgCall" --> W
  MCP -- "sign MsgCall" --> W
  W -- "ExecuteAndPay(pkg, requestID)<br/>+ fee in ugnot" --> REG
  REG -- "pay author, refund extra" --> BANK
```

**Boundaries:**
- **Off-chain, deterministic and advisory:** the audit. It decides whether the client is willing to sign.
- **On-chain, authoritative:** registration, verification, payment rules and receipts.
- **No server holds keys or state.** The web app is static and reads the chain directly over public RPC.

## The contract

[`contracts/r/nym-assay001/registry/registry.gno`](contracts/r/nym-assay001/registry/registry.gno)

### Who can do what

| Function | Caller | Effect |
|---|---|---|
| `RegisterPackage(path, description, source, fee)` | anyone | Lists a package; the caller becomes author and payee. Re-registering your own package updates it and clears verification |
| `SetVerified(path, verified, note)` | auditors only | Records the audit verdict |
| `AddAuditor` / `RemoveAuditor` / `TransferAdmin` | admin only | Manages auditors; the deployer is the first admin and auditor |
| `ExecuteAndPay(path, requestID)` + `-send` fee | direct user call only | Pays the author, refunds any extra, writes a receipt, returns its id |
| `ReceiptFor(caller, requestID)` | read | Lets a client that lost a response check whether a request settled |
| `Render(path)` | read | Leaderboard, package inspector, receipts, and JSON at `api/packages` |

### Invariants (each one is tested)

1. A package that isn't verified can never be paid.
2. The author receives exactly `feePerCall`, the caller gets back exactly `sent − fee`, and the escrow keeps nothing.
3. Any failed check reverts the whole transaction: no partial payment, no counter change.
4. The same `(caller, requestID)` settles at most once. The same id from another caller is a separate request.
5. Only the caller who made the deposit can spend it (`AssertOriginCall`).
6. Only `ugnot` is accepted.
7. Changed source loses verification and must be re-audited.
8. An author's listing can't be taken over by anyone else.

### Inputs refused

- path not under `gno.land/p/` or `gno.land/r/`, longer than 256 bytes, or containing other characters
- fee outside 0 to 1,000,000,000 ugnot
- description over 280 bytes, source over 64 KiB
- request id empty or over 64 bytes
- unknown package

## Tests

**Contracts:** 21 tests, covering normal, edge, unauthorized, repeated and boundary cases.

```bash
cd contracts && gno test ./... -v
```

```
--- PASS: TestSimpleYield
--- PASS: TestCompoundYield
--- PASS: TestShares
--- PASS: TestAPY
--- PASS: TestGuards
ok      ./p/nym-assay001/vault_math
--- PASS: TestRegisterPackage                 registration, ownership, invalid input
--- PASS: TestReRegisterClearsVerification    changed source must be re-audited
--- PASS: TestOnlyAuditorsCanVerify           unauthorized verify and admin calls
--- PASS: TestExecuteRefusesUnverifiedPackage the trap can't be paid
--- PASS: TestExecuteRejectsInsufficientFee   999 < 1000 refused, nothing paid
--- PASS: TestExecuteAndPaySettlesAtomically  exact fee to author, refund, receipt
--- PASS: TestRejectsNonOriginCall            an intermediary can't spend a deposit
--- PASS: TestDuplicateRequestIsRefused       a retry is never charged twice
--- PASS: TestRequestIDBounds                 0, 64 and 65 byte ids
--- PASS: TestRepeatedCallsAccounting         3 calls, 3 receipts, escrow keeps 0
--- PASS: TestZeroFeePackage                  free package: full refund
--- PASS: TestRegistrationBoundaries          max fee, description, source, path ±1
--- PASS: TestAdminLifecycle                  add and remove auditor, transfer admin
--- PASS: TestRejectsForeignDenom             only ugnot accepted
--- PASS: TestRender                          leaderboard, inspector, receipt, JSON
--- PASS: TestJSONEscaping
ok      ./r/nym-assay001/registry
```

**Audit engine, simulator and live chain read:**

```bash
npm test
```

This includes the trap failing with a critical finding at line 18, `vault_math` passing, loop and `OriginSend` detection, and a live fetch and audit of `gno.land/r/gnoland/wugnot` from Onyx. Set `OFFLINE=1` to skip the live test.

## Run it

You need Node 20+ (tested on 26). For the contracts you also need Go and the gno toolchain:

```bash
git clone https://github.com/gnolang/gno.git ~/gno && cd ~/gno && make install
```

Then, from the project root:

```bash
npm install
```

```bash
npm run typecheck && npm test
```

```bash
npm run dev
```

Open http://localhost:3000. Configuration templates are in [`web/.env.example`](web/.env.example) and [`mcp-server/.env.example`](mcp-server/.env.example).

If the registry isn't deployed on the configured network, the app says **Simulated** in the agent panel and runs payments through [`simulator.ts`](packages/core/src/simulator.ts), a mirror of the realm's rules. If the network is unreachable, it says **offline** and offers Retry; it never quietly simulates instead.

### Reproduce the core flow on a local chain

Terminal 1 starts a local chain with the contracts deployed:

```bash
cd contracts && gnodev local -empty-blocks
```

Terminal 2 runs the full flow with real transactions:

```bash
./scripts/local-proof.sh
```

Expected output (heights and hashes vary):

```
== 1. Register vault_math at 1,000 ugnot per call
   HEIGHT:     123
   TX HASH:    QuIEXr36YD0rzNSK/LsJ2pwfGonZVjY7Tu48PaIha+I=
== 2. Register malicious_helper (stays unverified)
== 3. Auditor verifies vault_math
== 4. Pay for one call (request proof-1795506677)
   HEIGHT:     129
== 5. Retry the same request: must not charge twice
   refused: assay: duplicate request; already settled as receipt #3
== 6. Pay the unverified trap: must be refused
   refused: assay: package is not audit-verified; execution refused
== 7. Underpay: must be refused
   refused: assay: insufficient fee: sent 999ugnot, required 1000ugnot
== 8. Leaderboard, as rendered by the realm
   | 1 | gno.land/p/nym-assay001/vault_math | g1jg8mtu…sqf5 | 1000 | 3 | 3000 | ● verified |
All checks passed.
```

To use the web app against this chain, set `NEXT_PUBLIC_GNO_RPC=http://127.0.0.1:26657` and `NEXT_PUBLIC_GNO_CHAIN_ID=dev`.

### MCP server (for AI agents)

```bash
npm run mcp
```

Register it with any MCP client as a stdio server. Most clients take a JSON entry like this:

```json
{
  "mcpServers": {
    "assay": {
      "command": "node",
      "args": ["/absolute/path/to/assay/mcp-server/bin/assay-mcp.mjs"]
    }
  }
}
```

| Tool | Does |
|---|---|
| `list_gno_packages` | Registered packages with fee, calls, earnings and verification |
| `fetch_and_audit_gno_source` | Reads the source from chain and returns a JSON report: verdict, score, findings with file and line, SHA-256, and whether the registered source matches the deployed code |
| `execute_verified_package` | Re-audits, checks the package is verified and the fee is within `maxFeeUgnot`, then broadcasts `ExecuteAndPay` through gnokey. Without `GNOKEY_NAME`, it returns the exact command and signs nothing. Pass the same `requestID` when retrying |

End-to-end check, which spawns the server and calls every tool:

```bash
npm run smoke -w @assay/mcp-server
```

### Audit rules

[`packages/core/src/audit.ts`](packages/core/src/audit.ts). Any critical or high finding fails the audit.

| ID | Severity | Catches |
|---|---|---|
| AS001 | critical | `SendCoins` to a hard-coded address, directly or through a `const` |
| AS002 | critical in /p, medium in /r | `IssueCoin`, `RemoveCoin`, `BankerTypeRealmIssue` |
| AS003 | high | a /p package importing `chain/banker` |
| AS004 | high | an exported /p function taking a `realm` handle (it can spend from the caller) |
| AS005 | high | `BankerTypeRealmSend` in a /p package |
| AS006 | high in /p, medium in /r | hard-coded `g1…` address |
| AS007 | medium | `chain/runtime/unsafe` import |
| AS008 | medium | `for {}` with no break, return or panic |
| AS009 | high | `OriginSend()` without `AssertOriginCall()` |
| AS010 | low | calls into other realms |
| AS011 | info | a realm paying out to a computed recipient |

## Deploy to Onyx

1. **Create a key.** Write down the seed phrase; nobody else should see it.
   ```bash
   gnokey add assay-deployer
   ```
2. **Fund it** at https://faucet.gno.land (choose Onyx).
3. **Register the namespace** (free; the name must look like `nym-<letters><3 digits>`):
   ```bash
   gnokey maketx call -pkgpath gno.land/r/sys/namereg/v0 -func Register -args nym-assay001 -gas-fee 1000000ugnot -gas-wanted 20000000 -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 assay-deployer
   ```
4. **Deploy** the clean package, then the realm. Do not deploy `malicious_helper`: it is a working drain.
   ```bash
   gnokey maketx addpkg -pkgpath gno.land/p/nym-assay001/vault_math -pkgdir ./contracts/p/nym-assay001/vault_math -gas-fee 10000000ugnot -gas-wanted 80000000 -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 assay-deployer
   ```
   ```bash
   gnokey maketx addpkg -pkgpath gno.land/r/nym-assay001/registry -pkgdir ./contracts/r/nym-assay001/registry -gas-fee 10000000ugnot -gas-wanted 80000000 -broadcast -chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443 assay-deployer
   ```
   If the node asks for a storage deposit, add `-max-deposit 10000000ugnot`.
5. **Register and verify**: steps 1–4 of [`scripts/local-proof.sh`](scripts/local-proof.sh), with `-chainid onyx-1 -remote https://rpc.onyx.testnets.gno.land:443` and your key.

### Onyx deployment record

Filled in after deployment. Every value must open in a private browser window.

| Item | Value |
|---|---|
| Deployer address | _pending_ |
| Namespace registration tx | _pending_ |
| `vault_math` deploy tx | _pending_ |
| `registry` deploy tx | _pending_ |
| First `ExecuteAndPay` tx and receipt | _pending_ |
| Source revision (git commit) | _pending_ |
| Live leaderboard | https://onyx.testnets.gno.land/r/nym-assay001/registry (live after deployment) |

## Trace every claim

| Claim | Source | Test | Chain evidence |
|---|---|---|---|
| Unverified packages can't be paid | `registry.gno` `ExecuteAndPay` | `TestExecuteRefusesUnverifiedPackage` | `local-proof.sh` step 6 |
| Exact fee to author, refund, escrow keeps 0 | `registry.gno` `ExecuteAndPay` | `TestExecuteAndPaySettlesAtomically`, `TestRepeatedCallsAccounting` | `local-proof.sh` step 4, leaderboard |
| A retry is never charged twice | `registry.gno` `requests` | `TestDuplicateRequestIsRefused` | `local-proof.sh` step 5 |
| An intermediary can't spend a deposit | `registry.gno` `AssertOriginCall` | `TestRejectsNonOriginCall` | — |
| Only auditors verify, only the admin manages | `registry.gno` `SetVerified`, `assertAdmin` | `TestOnlyAuditorsCanVerify`, `TestAdminLifecycle` | — |
| The trap is caught on line 18 | `audit.ts` AS001 | `audit.test.ts` "trap package fails…" | MCP smoke: `AS001 critical malicious_helper.gno:18` |
| Audits read real chain source | `rpc.ts` `fetchPackage` | `audit.test.ts` "live Onyx…" (wugnot) | `vm/qfile` on onyx-1 |
| The UI never passes an outage off as a demo | `Workbench.tsx` `refreshRegistry` | manual: chain stopped → "offline" + Retry | — |

## Truthful status

| Capability | Status |
|---|---|
| Registry realm, escrow, receipts, idempotency | **Working.** 21 Gno tests pass; full flow proven on a local gno chain |
| Onyx deployment | **Pending.** Needs the project key and namespace (see [Deploy](#deploy-to-onyx)) |
| Static audit engine (11 rules) | **Working.** A heuristic safety check, not formal verification; it can miss obfuscated code |
| MCP server | **Working.** Real broadcast proven on the local chain through gnokey |
| Web app, Adena signing | **Working with a stand-in wallet.** Connect and reject tested. A wallet that never answers times out after 2 minutes (handled in code, not exercised in tests). A real Adena payment on Onyx is pending deployment |
| Simulation mode | Used only when the registry isn't deployed, and labelled **Simulated** |
| `malicious_helper` | Demo trap. Registered as source only, **never deployed** |
| LLM code review | **Not included.** The AI agent is the MCP client; Assay supplies the facts it reasons over |

## Security notes

- No secrets are in the repository. The only mnemonic in it (`scripts/local-proof.sh`) is gnodev's public development account, which only funds local chains.
- `malicious_helper` is a real drain, there to prove the auditor catches it. Never deploy it or pass it a realm you care about.
- The audit is a safety net, not a guarantee. On chain, verification is set by auditors you trust.

## More

- [Demo script](docs/DEMO.md): a 3-minute walkthrough on Onyx
- [Usability](docs/USABILITY.md): internal walkthrough findings and fixes, plus the protocol for an independent test
- Deep links: `?pkg=<path>` opens a package; add `&audit=1` to audit it on arrival

## Project layout

```
contracts/      Gno: registry realm, vault_math, malicious_helper (+ tests)
packages/core/  TypeScript: RPC client, audit engine, simulator (+ tests)
mcp-server/     MCP server for AI agents
web/            Next.js workbench
scripts/        local-proof.sh, sync-sources.mjs
```

## License

Apache-2.0. See [LICENSE](LICENSE).
