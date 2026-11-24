# Usability

## Fixed after an internal walkthrough

| Found | Fixed |
|---|---|
| An unreachable network looked like a working demo | Shows "offline" with Retry |
| The source still said "Local copy" after reconnecting | Reloads when the network returns |
| Raw wallet errors appeared in a tooltip | One plain sentence on screen |
| "Get Adena" stayed after installing Adena | Re-checks when the window regains focus |
| A lost response could lead to paying twice | Request ids, refused by the realm |
| No way to share a result | `?pkg=…&audit=1` deep links |

Keyboard-only use and 375 px phone width both work.

## Independent test

Give a tester the app link and nothing else: *"Which package is safe to pay for?"*

| Task | Done unaided? | Notes |
|---|---|---|
| Says what Assay does within 15 s | | |
| Finds the dangerous line | | |
| Pays for the safe package | | |
| Opens the receipt on gnoweb | | |
