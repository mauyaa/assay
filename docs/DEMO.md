# Demo script (under 3 minutes)

Record on Onyx after deployment, never in simulation. Every transaction shown must be real, and the receipt must open on gnoweb.

**Before recording:**
- Adena on `onyx-1` with a little GNOT
- the app open at the live URL
- a second browser tab on `https://onyx.testnets.gno.land/r/nym-assay001/registry`

| Time | Show | Say |
|---|---|---|
| 0:00–0:15 | `malicious_helper` selected, line 18 highlighted red | "This 'fee-rounding helper' empties the realm that calls it. Your agent was about to pay for it. Assay checks the code before any money moves." |
| 0:15–0:40 | Click **Audit & pay 250 ugnot**. The Read step shows "on chain", then the audit is rejected | "The agent reads the plain-text source from gno.land itself. There's no bytecode and no trusted upload. Rejected. Nothing was signed, 0 ugnot spent." |
| 0:40–1:00 | Point to the red dot, the findings list, and "Blocked · 0 ugnot spent" | "Even if an agent skipped this check, the contract refuses to pay an unverified package." |
| 1:00–1:45 | Select `vault_math`, click **Audit & pay 1,000 ugnot**, approve in Adena. The Pay step completes and the receipt appears | "Clean code, verified on chain. One transaction pays the author, refunds any extra, and writes a receipt." |
| 1:45–2:15 | Open the receipt link in gnoweb, then the leaderboard | "This page is rendered by the contract itself. Calls and earnings went up by one. Anyone can check this." |
| 2:15–2:40 | Terminal: run the same payment again with the same request id; it's refused as a duplicate | "Retries can't charge twice. The contract remembers every request." |
| 2:40–3:00 | MCP tool output: `fetch_and_audit_gno_source` showing AS001 on line 18 | "Any AI agent can use the same checks through MCP. Assay: audit before you pay." |

**Discipline:**
- Readable zoom.
- One take per segment.
- No simulated receipts on screen: if the agent panel says "Simulated", stop and fix the deployment first.
