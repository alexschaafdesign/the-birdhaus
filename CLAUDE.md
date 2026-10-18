# Cross-project architecture

This repo is one of three sibling projects (the-birdhaus, twinscene, crawlspace)
that share band and show data. Before touching anything that talks to Twin
Scene's bands API, the local `bands` overlay table, or the shows pipeline, read
[`../twinscene/ARCHITECTURE.md`](../twinscene/ARCHITECTURE.md) — it covers how
the three repos divide ownership and why.

@docs/db-safety.md

## SQL: name your columns

No select *, alias.* or returning * in app code; the build enforces it. A migration that changes a column's type on shows, bands, settlements or submissions needs a plan for the pooler first. Ask before writing one.

## Deploys and staging

- Merging into `main` deploys **production** (and runs pending migrations on
  prod; see docs/db-safety.md).
- Never point a preview deployment at the prod database.
- `future-2027` is the 2027 release branch, staged at **next.thebirdhaus.org**.
  New 2027 work branches from it, not from `main`.

## Square

Never manually resend pre-081 `payment.updated` events for MULTI-ITEM orders
from the Square Developer Dashboard. Migration 081 moved ticket_purchases
uniqueness from per-payment to per-(payment, variation); a redelivered legacy
event keeps the old full-amount row AND adds per-line rows for the other
matched lines, double-counting that payment's revenue in settlements.
Single-item redeliveries no-op safely.

## Reports

When you finish a task or a plan that needs my decision, also save the full
report as `~/Desktop/claude-reports/YYYY-MM-DD-HHMM-<topic>.md`.
