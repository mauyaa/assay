# Demo

Record on Onyx with Adena connected. Under 3 minutes, real transactions only.

| Time | Show |
|---|---|
| 0:00 | `malicious_helper`, line 18 in red: "This helper drains its caller. Assay catches it before any money moves." |
| 0:15 | **Audit & pay 250 ugnot** → Rejected, 0 ugnot spent |
| 0:45 | `vault_math` → **Audit & pay 1,000 ugnot** → approve in Adena → receipt |
| 1:30 | Open the receipt on gnoweb, then the leaderboard |
| 2:00 | Retry the same request in the terminal → refused as a duplicate |
| 2:30 | MCP `fetch_and_audit_gno_source` → AS001 on line 18 |
