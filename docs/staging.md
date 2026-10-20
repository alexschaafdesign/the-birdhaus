# Staging: next.thebirdhaus.org

The long-lived `staging` branch, deployed by Vercel as a Preview, on its own
domain, reading **staging-2027**: a Neon branch copied from prod. It's where
work is tried against real shows, bands and archive before it ships.

## Workflow

- Feature branches come off `main`.
- To stage one, merge it into `staging` (a PR into `staging`, or
  `git merge` locally and push). next.thebirdhaus.org redeploys.
- Ship it by merging the feature branch into `main` as usual.
- Now and then, bring `staging` back to `main` so it doesn't drift:
  `git checkout staging && git merge origin/main && git push`, or, when
  nothing staged is still pending, reset it (`git push --force-with-lease
  origin origin/main:staging`).
- Migrations: preview builds don't migrate. A branch with a new migration
  needs it applied to staging-2027 with `scripts/staging-migrate.mjs` (below)
  before its staged deploy reads it.

It holds real people's data (RSVP emails, accounts, ticket buyers). Vercel
Authentication stays on, and nothing on it may reach a real person or a real
payment.

## The staging switch (`lib/staging.ts`)

- `isStaging(host?)` is true when `BH_STAGING=1`, or the deploy's branch is
  `staging`, or the request host starts with `next.`.
- `outboundAllowed(host?)` is true **only** on a production deploy
  (`VERCEL_ENV=production`) that isn't staging. Staging, every other preview and
  local dev all come out false. A missing flag blocks; it never permits.

When outbound isn't allowed:

| What | Where | Behaviour |
|---|---|---|
| All Resend email (RSVP, blast, advance, tickets, timesheet, alerts, accounts) | `lib/email.ts` `getResendClient()` | Logged (`[staging] blocked email subject=… recipients=N`), not sent. With `BH_STAGING_EMAIL_TO` set, each message goes to that one address instead; cc, bcc and reply-to are dropped, and the subject is tagged. |
| Inbound reply forwarding | same | Never forwarded, test address or not |
| Square checkout | `app/shows/[id]/checkout/route.ts` | Redirects to `/shows/<id>/tickets?checkout=disabled`, which shows an "Online donations disabled on staging" banner. Neither a minted link nor the stored-link fallback. |
| Stored ticket links | `lib/staging.ts` `guardTicketUrl` | A stored `square.link` (or other Square checkout URL) becomes the show's `/checkout` path; an absolute thebirdhaus.org link becomes the same path here. Applied in `lib/shows` and the admin show page. |
| Square writes (catalog, links, flyers) | `lib/square.ts` | `isSquareSyncEnabled()` is false; `squareFetch` refuses anything but GET |
| Mailchimp opt-in | `lib/mailchimp.ts` | Logged, not upserted |
| Twin Scene band create/update | `lib/twinscene.ts` | Throws; show saves fall back to a Birdhaus-only band, as they do when Twin Scene is down |
| Contact form | `app/contact/` | Posts to `/api/staging/outbox` (logs field lengths), not the Apps Script |
| R2 uploads | `lib/r2.ts` | Same shared bucket, filenames tagged `folder/staging-<time>-<hex>.ext` |
| Indexing | `next.config.ts`, `app/robots.ts` | `X-Robots-Tag: noindex, nofollow` on every response; robots.txt disallows `/` |
| Footer | `components/night/SiteFrame.tsx` | A STAGING mark (staging only, not other previews) |
| Session cookies | `lib/auth.ts`, `lib/accounts/auth.ts`, `lib/accounts/session.ts` | Staging only: names end `_stg` and are host-only (no `Domain`). Production's names, domain and signing are unchanged. |

Blocked-action logs carry counts and labels only, never addresses or bodies.

Not affected: Square and Resend webhooks are registered to the production URL
and can't reach staging; Vercel runs crons on production deployments only, and
`CRON_SECRET` is Production-scoped, so the cron routes return 500 on previews.

`GET /api/admin/staging/db-host` returns the DB endpoint id and database name.
It 404s anywhere that isn't staging (checked before the session) and is
staff-only on staging.

## Vercel env (Preview, branch `staging` only)

A branch-scoped Preview variable overrides the general Preview one of the same
name for that branch only. Every other preview keeps the dev database and the
shared session secret.

**Order matters: set everything else, confirm it, then `DATABASE_URL` last.**
Until `DATABASE_URL` is set, the branch reads dev, so nothing real is at risk
while the rest goes in.

1. Set these (`vercel env add NAME preview staging`, value on stdin):

   | Name | Value |
   |---|---|
   | `BH_STAGING` | `1` |
   | `BH_STAGING_EMAIL_TO` | your test inbox (optional; unset = log only) |
   | `NEXT_PUBLIC_SITE_URL` | `https://next.thebirdhaus.org` |
   | `SQUARE_SYNC_ENABLED` | `false` |
   | `SQUARE_ACCESS_TOKEN`, `MAILCHIMP_API_KEY`, `TWIN_SCENE_API_KEY` | any dummy string (backstop behind the code guards) |

2. Session secret: freshly generated, piped straight in, never printed or saved:
   ```bash
   openssl rand -hex 32 | tr -d '\n' | vercel env add ADMIN_SESSION_SECRET preview staging --sensitive
   ```
   Staging then signs its own sessions: a prod cookie that reaches `next.` fails
   the signature check there, and staging's cookies are host-only
   `birdhaus_*_session_stg`, so they never reach www.

3. Confirm: `vercel env ls preview` shows each name above scoped to
   `staging`, and the general Preview `DATABASE_URL` and
   `ADMIN_SESSION_SECRET` are still there for every other branch.

4. **Last:** `DATABASE_URL`, staging-2027's **pooled** string, without printing it:
   ```bash
   neon connection-string staging-2027 --project-id summer-forest-54623278 --org-id org-nameless-math-39737153 --pooled | tr -d '\n' | vercel env add DATABASE_URL preview staging --sensitive
   ```
   Then redeploy `staging` so the build picks it up.

## Refresh (re-copy prod)

Run from the repo root. The shell's `DATABASE_URL` (dev) is never used.
staging-2027 is a child of production, so a reset re-copies prod **and keeps
the branch id and endpoint**: the connection string, `.env.staging.local` and
the Vercel variable all stay as they are.

1. Check prod's migration list, reset, and note the endpoint:
   ```bash
   node scripts/staging-migrate.mjs --prod-migrations
   neon branches reset staging-2027 --parent --project-id summer-forest-54623278 --org-id org-nameless-math-39737153
   neon branches get staging-2027 --project-id summer-forest-54623278 --org-id org-nameless-math-39737153
   ```
2. If `staging` carries migrations that aren't on prod yet, dry-run then apply
   them, and check prod again:
   ```bash
   node scripts/staging-migrate.mjs --expect-endpoint ep-…
   node scripts/staging-migrate.mjs --expect-endpoint ep-… --apply
   node scripts/staging-migrate.mjs --prod-migrations
   ```
   The two prod lines must match (count, last id, sha256).

If the branch ever has to be deleted and re-created instead, it gets a new
endpoint: rewrite `.env.staging.local`
(`printf 'DATABASE_URL=%s\n' "$(neon connection-string staging-2027 --project-id summer-forest-54623278 --org-id org-nameless-math-39737153 --pooled)" > .env.staging.local`),
replace the branch-scoped `DATABASE_URL` in Vercel (`vercel env rm DATABASE_URL
preview staging`, then step 4 of the env list above) and redeploy `staging`.

## Retiring staging (if it's ever shut down)

- R2: delete objects whose key matches `*/staging-*`.
- Neon: delete `staging-2027`.
- Vercel: remove the `staging` branch-scoped variables and the
  `next.thebirdhaus.org` domain.
