# Cross-project architecture

This repo is one of three sibling projects (the-birdhaus, twinscene, crawlspace)
that share band and show data. Before touching anything that talks to Twin
Scene's bands API, the local `bands` overlay table, or the shows pipeline, read
[`../twinscene/ARCHITECTURE.md`](../twinscene/ARCHITECTURE.md) — it covers how
the three repos divide ownership and why.

@docs/db-safety.md

Figma is read-only. Never call use_figma, upload_assets, or add_code_connect_map without explicit per-instance approval.

## Migrations: never alter a table read with `select *`

The app connects through Neon's pooler (the `-pooler` host), which shares
prepared statements across clients by query text. Adding or dropping a column
on a table the app reads with `select *` / `alias.*` / `returning *` changes
that statement's result type, and every pooled connection holding it fails
with `cached plan must not change result type` until the pooler's server
connections recycle — on prod, that's the live site returning 500s. Restarting
the app does not clear it. (Hit on dev 2026-10-05 by a draft of migration 094.)

Until that's fixed (explicit column lists, or statement preparation disabled
on the pooled connection — tracked in TODO.md), **no migration may alter
`shows`, `bands`, `settlements`, or `submissions`** — the tables the app
reads with `select *`, `alias.*` or `returning *` (as of 2026-10-05) — **or
any other table that gains such a read.** Put new per-show data in a new
table keyed by `show_id` (e.g. `show_rig`). Before writing any `alter table`,
check every query on that table for a star in its select list or `returning`
clause; a line grep misses multi-line SQL, so scan the whole template
literals. (`show_bands` and `song_club_events` are read with explicit
columns only, so 093/096 altering them is safe.)

## Square

Never manually resend pre-081 `payment.updated` events for MULTI-ITEM orders
from the Square Developer Dashboard. Migration 081 moved ticket_purchases
uniqueness from per-payment to per-(payment, variation); a redelivered legacy
event keeps the old full-amount row AND adds per-line rows for the other
matched lines, double-counting that payment's revenue in settlements.
Single-item redeliveries no-op safely.
