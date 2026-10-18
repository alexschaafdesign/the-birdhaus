# Staging: next.thebirdhaus.org

The `future-2027` branch, deployed by Vercel as a Preview, on its own domain,
reading **staging-2027**: a Neon branch copied from prod. It's for testing the
2027 redesign against real shows, bands and archive before launch.

It holds real people's data (RSVP emails, accounts, ticket buyers). Vercel
Authentication stays on, and nothing on it may reach a real person or a real
payment.

## The staging switch (`lib/staging.ts`)

- `isStaging(host?)` is true when `BH_STAGING=1`, or the deploy's branch is
  `future-2027`, or the request host starts with `next.`.
- `outboundAllowed(host?)` is true **only** on a production deploy
  (`VERCEL_ENV=production`) that isn't staging. Staging, every other preview and
  local dev all come out false. A missing flag blocks; it never permits.

When outbound isn't allowed:

| What | Where | Behaviour |
|---|---|---|
| All Resend email (RSVP, blast, advance, tickets, timesheet, alerts, accounts) | `lib/email.ts` `getResendClient()` | Logged (`[staging] blocked email subject=… recipients=N`), not sent. With `BH_STAGING_EMAIL_TO` set, each message goes to that one address instead; cc, bcc and reply-to are dropped, and the subject is tagged. |
| Inbound reply forwarding | same | Never forwarded, test address or not |
| Square checkout | `app/shows/[id]/checkout/route.ts` | "Checkout disabled" page (503). Neither a minted link nor the stored-link fallback. |
| Square writes (catalog, links, flyers) | `lib/square.ts` | `isSquareSyncEnabled()` is false; `squareFetch` refuses anything but GET |
| Mailchimp opt-in | `lib/mailchimp.ts` | Logged, not upserted |
| Twin Scene band create/update | `lib/twinscene.ts` | Throws; show saves fall back to a Birdhaus-only band, as they do when Twin Scene is down |
| Contact form | `app/contact/` | Posts to `/api/staging/outbox` (logs field lengths), not the Apps Script |
| R2 uploads | `lib/r2.ts` | Same shared bucket, filenames tagged `folder/staging-<time>-<hex>.ext` |
| Indexing | `next.config.ts`, `app/robots.ts` | `X-Robots-Tag: noindex, nofollow` on every response; robots.txt disallows `/` |
| Footer | `components/night/SiteFrame.tsx` | A STAGING mark (staging only, not other previews) |

Blocked-action logs carry counts and labels only, never addresses or bodies.

Not affected: Square and Resend webhooks are registered to the production URL
and can't reach staging; Vercel runs crons on production deployments only, and
`CRON_SECRET` is Production-scoped, so the cron routes return 500 on previews.

`GET /api/admin/staging/db-host` returns the DB endpoint id and database name.
It 404s anywhere that isn't staging (checked before the session) and is
staff-only on staging.

## Vercel env (Preview, branch `future-2027` only)

A branch-scoped Preview variable overrides the general Preview one of the same
name for that branch only. Every other preview keeps the dev database.

```bash
vercel env add NAME preview future-2027
```

| Name | Value from |
|---|---|
| `BH_STAGING` | `1` |
| `BH_STAGING_EMAIL_TO` | your test inbox (optional; unset = log only) |
| `NEXT_PUBLIC_SITE_URL` | `https://next.thebirdhaus.org` |
| `SQUARE_SYNC_ENABLED` | `false` |
| `SQUARE_ACCESS_TOKEN`, `MAILCHIMP_API_KEY`, `TWIN_SCENE_API_KEY` | any dummy string (backstop behind the code guards) |
| `ADMIN_SESSION_SECRET` | a new random value (`openssl rand -hex 32`), so staging signs its own sessions |
| `DATABASE_URL` | staging-2027's **pooled** connection string. **Set this last.** |

## Refresh (re-copy prod)

Run from the repo root. The shell's `DATABASE_URL` (dev) is never used.

1. Delete and re-create the branch from prod:
   ```bash
   neon branches delete staging-2027 --project-id summer-forest-54623278 --org-id org-nameless-math-39737153
   neon branches create --project-id summer-forest-54623278 --org-id org-nameless-math-39737153 --name staging-2027 --parent production
   ```
2. Write the pooled string to `.env.staging.local` (gitignored) without printing it:
   ```bash
   printf 'DATABASE_URL=%s\n' "$(neon connection-string staging-2027 --project-id summer-forest-54623278 --org-id org-nameless-math-39737153 --pooled)" > .env.staging.local
   ```
3. Note the endpoint id (`ep-…`) for the branch:
   ```bash
   neon branches get staging-2027 --project-id summer-forest-54623278 --org-id org-nameless-math-39737153
   ```
4. Check prod's migration list, dry-run, apply, check prod again:
   ```bash
   node scripts/staging-migrate.mjs --prod-migrations
   node scripts/staging-migrate.mjs --expect-endpoint ep-…
   node scripts/staging-migrate.mjs --expect-endpoint ep-… --apply
   node scripts/staging-migrate.mjs --prod-migrations
   ```
   The two prod lines must match (count, last id, sha256).
5. A re-created branch gets a new endpoint, so the connection string changes.
   Update the branch-scoped `DATABASE_URL` in Vercel and redeploy `future-2027`.

Once the 2027 migrations are on prod, the refresh is just steps 1–3 and 5:
nothing will be pending.

## Cleanup

- R2: delete objects whose key matches `*/staging-*`.
- Neon: delete `staging-2027` after launch.
- Vercel: remove the `future-2027` branch-scoped variables and the
  `next.thebirdhaus.org` domain.
