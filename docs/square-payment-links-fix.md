# Square ticket links are single-use — audit + fix plan

**Status:** FIXED in code — on-demand link minting. Ships on next prod deploy; verify one show live before trusting all 7 (see below).
**Date:** 2026-08-15

## The bug

Clicking a show's ticket link sends buyers to Square, which shows **"Your payment is
confirmed!"** (a receipt) without any payment. Reported for the Into It, Over It show
(`/shows/2026-09-06-into-it-over-it-jg-shadid/tickets`).

## Root cause

`lib/square.ts` (`syncShowToSquare`, ~line 263) creates one Square Payment Link **per
tier** in **order mode**:

```js
POST /v2/online-checkout/payment-links
body: { order: { location_id, line_items: [{ catalog_object_id: variationId, quantity: '1' }] } }
```

**API-generated payment links (`CreatePaymentLink`) are single-use only** — confirmed in
Square's own docs (see Sources). A link created with an `order` is bound to that one
order: it works for exactly ONE purchase, then permanently shows that order's
"payment confirmed" receipt to everyone. `quick_pay` mode is *also* single-use, so
switching modes does not help. **Only Square Dashboard-created links are reusable.**

Diagnostic signal: a broken link's `square.link/u/...` redirects to
`checkout.square.site/.../order/<id>` (single-use); a working reusable link redirects to
`.../checkout/<id>`.

## Audit — 7 of 8 upcoming shows broken (as of 2026-08-15)

Every show synced through `lib/square.ts` has three single-use `/order/` links (a ticking
time bomb — breaks after its first sale). At audit time only #100 had been hand-fixed;
the on-demand code fix below covers all of them at once (no per-row action needed), since
it stops using the stored links entirely.

| Show | Date | ID | Status |
|------|------|----|--------|
| WHY CRY / Victoria Carpenter / Gillweather | Aug 22 | 88 | ❌ single-use |
| Megasound | Sep 5 | 89 | ❌ single-use |
| Into It, Over It / JG Shadid | Sep 6 | 100 | ✅ FIXED |
| Modern Wildlife | Sep 11 | 97 | ❌ single-use |
| Kacie Jewel / Hill | Sep 17 | 77 | ❌ single-use |
| Ross Thorn | Sep 18 | 82 | ❌ single-use |
| Beech / Hey ATV | Sep 24 | 81 | ❌ single-use |
| Raygun Youth | Sep 25 | 79 | ❌ single-use |

Audit method: read `show_square_links` from prod, follow each `square.link` redirect,
classify by `/order/` vs `/checkout/` path. (Throwaway script lived in the session
scratchpad; regenerate if needed.)

## What's already been done

1. **#100 fixed on prod.** All three `show_square_links` rows for show 100 were pointed at
   a manually-created reusable Dashboard link `https://square.link/u/He4VhdQa` (one link,
   built-in $10/$20/$30 tier selector). Because `/tickets` is `force-dynamic`, this fixed
   the live site immediately.
2. **Tickets page UI** (`app/shows/[slug]/tickets/page.tsx`): tiers that share the same
   Square URL now collapse into a single button showing the amount range ("Tickets /
   Donate — $10–$30"). Backward-compatible: shows with 3 distinct per-tier links still
   render 3 buttons. Committed on this branch.

## The fix that shipped — on-demand single-use links

Chosen path: **generate a fresh single-use link on demand** (the recommended option).
Buyers no longer visit stored per-tier links at all — the `/tickets` buttons point at a
new route that mints a brand-new link per click.

**Key insight that made this cheap:** the 7 shows' Square **catalog items and variations
are still valid** — only the stored payment *links* were single-use. So there is **no data
migration and no re-sync**. Minting a new link from each existing variation fixes every
broken show (and keeps #100 working) with code alone.

Changes (branch `fix/square-ticket-links`):

1. **`lib/square.ts` → `createTierPaymentLink(variationId)`** — POSTs a fresh
   `CreatePaymentLink` order for one catalog variation, with a **unique
   `idempotency_key` per call** (`crypto.randomUUID()`) so each buyer gets a distinct
   single-use link. Returns `undefined` when `SQUARE_SYNC_ENABLED` is off (dev).
2. **`app/shows/[slug]/checkout/route.ts`** (new) — `GET ?tier=<amountCents>`. Resolves
   the show's catalog variation server-side from `show_square_links` (never trusts a
   variation id in the URL), mints a fresh link, and **302-redirects** to it. In dev
   (sync disabled) it falls back to the stored `url` if present.
3. **`app/shows/[slug]/tickets/page.tsx`** — buttons now link to
   `/shows/[slug]/checkout?tier=…` (plain `<a>`, not `next/link`, so the route isn't
   prefetched — a fresh link is minted only on click). Reverted the URL-collapse grouping;
   with distinct fixed-price tiers we show the three tier buttons again.

`getShowPurchases` is unaffected — it matches COMPLETED payments by order line-item
`catalog_object_id`, which the on-demand orders still carry.

**Left as-is (harmless):** `syncShowToSquare` still creates 3 static per-tier links on
first sync and stores them in `show_square_links`. In prod they're no longer the buyer's
redirect target (only a dev fallback), so they're inert. Ripping that out touches the
fragile create-once endpoint — deferred as optional cleanup.

**Verification (do this on ONE show first — no Square Sandbox, live-only):**
- Deploy; open a broken show's `/tickets`, click a tier, confirm Square shows a real
  checkout (`/checkout/<id>`, NOT `/order/<id>` receipt).
- Click the SAME tier again in a fresh session → a *different* link → still a live
  checkout. That's the single-use bug actually fixed.
- Then spot-check the other 6 shows.

## Sources

- https://developer.squareup.com/docs/checkout-api/common-pitfalls (single-use vs reusable)
- https://developer.squareup.com/reference/square/checkout-api/create-payment-link
