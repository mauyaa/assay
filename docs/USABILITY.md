# Usability validation

## 1. Internal walkthrough (done)

Run by the builder, not an independent tester. It counts as preparation, not as the independent test in section 2.

| # | Observation | Fix | Where |
|---|---|---|---|
| 1 | With the network unreachable, the app quietly switched to simulated payments, so an outage looked like a working demo | Shows "Can't reach …" with Retry, and "offline" in the header and agent panel | `Workbench.tsx` `refreshRegistry` |
| 2 | After Retry succeeded, the code panel still said "Local copy" | Source reloads when the network comes back | `Workbench.tsx` source effect |
| 3 | Wallet errors were raw extension messages, visible only as a tooltip | One plain sentence on screen: "Rejected in wallet. Nothing was sent." and so on | `adena.ts` `explainWalletError` |
| 4 | Installing Adena from "Get Adena" left the button stuck until a reload | The button re-checks when the window regains focus | `StatusBar.tsx` `Wallet` |
| 5 | A payment whose response was lost could be retried and charged twice | Each payment carries a request id; the realm refuses a repeat | `registry.gno`, `TestDuplicateRequestIsRefused` |
| 6 | There was no way to send someone straight to a result | `?pkg=…&audit=1` opens a package and audits it on arrival | `Workbench.tsx` deep links |
| 7 | On some browsers the app stopped short of the bottom of the window | The app shell is pinned to the viewport | `Workbench.tsx` |
| 8 | Comment read "a Assay audit" | Changed to "an Assay audit" | `vault_math.gno` |

**Keyboard:** Tab moves through search, then every package; Enter opens one; focus is always visible. **Phone width (375 px):** the panes stack and nothing overlaps.

## 2. Independent test (to run before submitting)

Give the tester only the live URL and this one line: *"An AI agent wants to pay for a gno.land package. Find out which package is safe."* Don't help them. Note where they hesitate.

| Task | Success means | Time | Completed unaided? | Hesitations, quotes |
|---|---|---|---|---|
| 1. Say what Assay does after 15 seconds | Describes "checks code before paying" in their own words | | | |
| 2. Find the dangerous package and the dangerous line | Opens `malicious_helper`, runs the audit, points at line 18 | | | |
| 3. Pay for the safe package | Connects Adena, runs **Audit & pay** on `vault_math`, confirms | | | |
| 4. Prove the payment happened on chain | Opens the receipt on gnoweb | | | |

Tester (name or handle): ________  Date: ________  Device and browser: ________

Fixes made after this test:

| Observation | Fix | Commit |
|---|---|---|
| | | |
