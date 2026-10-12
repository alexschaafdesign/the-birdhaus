# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: show-goers.** People in the Twin Cities finding out what's coming
up at the Birdhaus, deciding to go, RSVPing or buying a ticket, and coming
back afterward for photos, videos and the archive. Future design work
optimizes for them first.

Secondary (from the codebase, not ranked by the owner):

- **Crew** — Alex and the people who run shows, using the admin dashboard for
  booking, show setup, door, sound, settlements, expenses, timesheets,
  photographer assignment and the venue TV board.
- **Artists** — bands who submit to play, get advanced, get paid through
  settlements, and appear in the artist directory.
- **Photographers** — credited per photo, with public profiles at
  `/photos/[name-slug]`.

## Product Purpose

The Birdhaus is a DIY house venue and record label in Powderhorn,
Minneapolis. thebirdhaus.org is where its shows are announced and attended
(listings, RSVP, tickets), where its history lives (archive, photos, videos,
artists), and where the crew runs everything behind a show.

Success: people find a show, want to go, and get in easily; artists are paid
fairly and transparently; the crew can run a night without friction.

## Positioning

What neighboring Twin Cities venues can't truthfully claim:

- **An actual house, community-run.** DIY and neighborly, not a commercial club.
- **Artist-first money.** Paying artists well, with transparent settlements, is
  core to how the venue operates.
- **Pay-what-you-can entry.** Tickets are donation tiers / sliding scale rather
  than a fixed price.
- **Also a record label.** Releases, videos and Fresh Cuts are part of the
  identity, not a side feature.

## Operating Context

- Shows are listed publicly; attendees RSVP (Birdhaus's own RSVP system) or buy
  tickets through Square (donation-tier variations per show).
- One of three sibling projects: **Twin Scene** (twinscene.org) owns the
  canonical Twin Cities band directory and scraped shows; Birdhaus keeps a local
  overlay of bands. **Songhaus** (thesonghaus.org) is the songwriting app that
  Song Club became; Birdhaus only links to it. See
  `../twinscene/ARCHITECTURE.md`.
- Crew tools in use (from the codebase): outbound booking calendar (per-day
  title + notepad, artist wishlist, Apple Calendar feed), inbound submissions
  desk, settlements and expenses, door check-in links, sound engineer and door
  person rosters, photographer queue, timesheets, Year in Review, venue TV board.

## Capabilities and Constraints

- **The house address stays private.** It is shared only with people who RSVP
  or hold a ticket, and never shown publicly. Every public surface, feed, share
  preview and metadata field must respect this.
- Next.js App Router on Vercel; Neon Postgres owned by Birdhaus (separate from
  the Twin Scene / Crawlspace DB). DB safety rules live in `docs/db-safety.md`.
- Admin is gated on staff sessions; Square integration handles payments; money
  paths (settlements, ticket purchases) take priority over performance work.
- Terminology: the booking page calls bands **artists**; the public site and
  the directory still say bands.

## Brand Commitments

- Name: **the BIRDHAUS** (as written in `lib/site.ts`).
- Voice and visual identity: not yet confirmed as binding. The incumbent
  site's look is evidence to document, not a recorded commitment.

## Evidence on Hand

- Real show history: archive of past shows, show flyers, per-photo credited
  photography, videos, and artist profiles, all in the database and
  `content/shows`.
- No testimonials, press quotes, attendance numbers or payout figures have been
  supplied for public use. Don't invent them.

## Product Principles

1. **Show-goers first.** On public surfaces, finding a show and getting in
   beats everything else.
2. **Privacy is a feature.** The address and attendee details are protected by
   default; convenience never leaks them.
3. **Artists are paid fairly and transparently.** Money flows are exact,
   auditable and never hidden behind convenience.
4. **Pay-what-you-can stays easy.** Sliding-scale entry is the default
   framing, not a buried discount.
5. **House, not club.** Community-run and personal; label and show history are
   part of the same story.
