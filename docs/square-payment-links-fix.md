# Square ticket links are single-use — audit + fix plan

**Status:** investigation done, remediation NOT finished. Picking this back up on another machine.
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
time bomb — breaks after its first sale). Only #100 has been fixed.

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

## Remaining work (the decision to resume on)

Owner chose: **fix `lib/square.ts`** + **investigate a re-sync path** (NOT manual
link-pasting). But the API cannot make reusable links, so the strategy must change. Options:

- **(Recommended) Generate a fresh single-use link on demand.** Stop storing 3 static
  links. Make the `/tickets` buttons hit an API route that calls `CreatePaymentLink`
  per click and 302-redirects to the fresh link. Unlimited buyers, keeps catalog
  linkage (so `getShowPurchases` variation-ID matching still works). Downside: an extra
  Square call per checkout; needs a story for `getShowPurchases` (it already matches on
  COMPLETED payments' order line-item `catalog_object_id`, which is preserved here).
- **Semi-manual:** sync creates the catalog item only; a human makes one reusable
  Dashboard checkout link per show and pastes it (stored in `show_square_links`). This is
  literally how #100 was fixed. Reliable, but manual per show.
- **Self-hosted checkout:** build our own payment page with the Square Web Payments SDK +
  Orders API. Biggest change; full control; fully reusable + catalog-linked.

**Re-sync path caveat:** the existing "Create Square links" endpoint
(`app/api/admin/shows/[id]/square/route.ts`) is create-once — it early-returns `exists`
for shows that already have `square_item_id` (all 7 broken shows do). Regenerating links
for them needs a new/updated code path regardless of which option above is chosen.

**Testing caveat:** the Square Catalog/Checkout API has **no Sandbox** (per `lib/square.ts`
header) and `SQUARE_SYNC_ENABLED` is live-only. Verify any fix on ONE show before rolling
out to the other 6.

## Sources

- https://developer.squareup.com/docs/checkout-api/common-pitfalls (single-use vs reusable)
- https://developer.squareup.com/reference/square/checkout-api/create-payment-link
