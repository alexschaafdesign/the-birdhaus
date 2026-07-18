# Cross-project architecture

This repo is one of three sibling projects (the-birdhaus, twinscene, crawlspace)
that share band and show data. Before touching anything that talks to Twin
Scene's bands API, the local `bands` overlay table, or the shows pipeline, read
[`../twinscene/ARCHITECTURE.md`](../twinscene/ARCHITECTURE.md) — it covers how
the three repos divide ownership and why.

@docs/db-safety.md
