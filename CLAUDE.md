# Cross-project architecture

This repo is one of three sibling projects (the-birdhaus, twinscene, crawlspace)
that share band and show data. Before touching anything that talks to Twin
Scene's bands API, the local `bands` overlay table, or the shows pipeline, read
[`../twinscene/ARCHITECTURE.md`](../twinscene/ARCHITECTURE.md) — it covers how
the three repos divide ownership and why.

@docs/db-safety.md

## Square

Never manually resend pre-081 `payment.updated` events for MULTI-ITEM orders
from the Square Developer Dashboard. Migration 081 moved ticket_purchases
uniqueness from per-payment to per-(payment, variation); a redelivered legacy
event keeps the old full-amount row AND adds per-line rows for the other
matched lines, double-counting that payment's revenue in settlements.
Single-item redeliveries no-op safely.
