import { sql } from './db';

// Server-side data access for the editable "portal info" block — the mostly-
// static venue/logistics rundown shown on the band /hub portal. Mirrors the
// advance-template accessor (lib/advance.ts): a single default row, lazily
// seeded from the canonical Markdown below the first time it's read, then edited
// in the admin Settings screen. The seed lives in code so there's a versioned
// source of truth for the starting text (migration 045 only creates the table).

export interface PortalInfo {
  body: string;
  updatedAt: string;
}

interface PortalInfoRow {
  body: string;
  updated_at: string;
}

// Returns the single default portal-info row, seeding it from DEFAULT_PORTAL_INFO
// the first time it's read. The `where not exists` guard plus the is_default
// partial unique index (migration 045) keep this idempotent.
export async function getPortalInfo(): Promise<PortalInfo> {
  await sql`
    insert into portal_info (body, is_default)
    select ${DEFAULT_PORTAL_INFO}, true
    where not exists (select 1 from portal_info where is_default)
  `;
  const [row] = await sql<PortalInfoRow[]>`
    select body, updated_at::text as updated_at
    from portal_info
    where is_default
    limit 1
  `;
  return { body: row.body, updatedAt: row.updated_at };
}

// Updates the default portal-info body. Seeds first so an update before any read
// still has a row to write.
export async function updatePortalInfo(body: string): Promise<PortalInfo> {
  await getPortalInfo();
  const [row] = await sql<PortalInfoRow[]>`
    update portal_info
    set body = ${body}, updated_at = now()
    where is_default
    returning body, updated_at::text as updated_at
  `;
  return { body: row.body, updatedAt: row.updated_at };
}

// The seed rundown — Alex's venue/logistics boilerplate, lifted from the original
// long advance email and formatted as Markdown for the portal (## per section,
// ### for sub-parts). Schedule, pay, RSVP count, and input needs are omitted on
// purpose — each has its own portal card. Editable in the admin after seeding.
export const DEFAULT_PORTAL_INFO = `## The venue

The Birdhaus is a private, invite-only DIY house venue in south Minneapolis, near Powderhorn Park.

**3721 17th Ave S, Minneapolis MN 55407**

The house has a red roof, a "little free library" out front, a pride flag in the window, and says Birdhaus on the door.

Private venue legal disclaimer yada yada — you're attending at your own risk. The hosts are not responsible for any injury, loss, or damage to personal property. Please be respectful of the space, the people, and the neighbors.

## RSVPs & address

Please don't post the address publicly — direct people to the RSVP form at thebirdhaus.org (or the specific link for this show, up at the top) to get the location. When people fill out that form they automatically get an email with the address + other details. This helps control how the address goes out, and gives us a rough idea of turnout.

## Capacity

Capacity is 60 — if it fills up, we hold back newcomers until space opens up. At worst, people can hang out in the living room and watch the "TV wall," which shows a camera feed from the basement. It's all in the interest of safety and not letting things get uncomfortably overpacked (hitting full capacity is very rare so far).

## Accessibility & safety

The shows are in the basement (full basement, unfinished but with some sound treatment) — it's unfortunately not fully accessible: a couple steps into the house, then a full staircase down. There's a backyard for smokers, wanna-be-smokers, and anyone else to hang (preferred over the front).

I'm very conscious of making this safe — both overcrowding (above) and fire safety. I've tested the electrical draws for obvious risks, and there are multiple fire extinguishers down there. There's only one entrance/exit to the basement itself, but the staircase also goes straight to the backyard for a quick emergency exit.

I have a (water-based) haze machine that I love as if it were my own child — just let me know if you have respiratory concerns and we can skip it.

There's a main bathroom for guests on the main floor, plus a 2nd bathroom on the top level you're all welcome to use.

There's a blissed-out dog around (Bosco, on sleepy pills) who shouldn't cause trouble, but let me know any concerns.

## The cat

So uh — I do not own a cat. lol. I never thought I'd have to include this, but there have been two different shows now where an orange neighborhood cat was outside and someone assumed it was mine and let it inside (it matters because my dog is a certified Cat Hater/Hunter — I'm looking out for the cat here). So if you see a cat outside… please don't let it in. That's all folks.

## Parking & load-in

Parking is free on the street, usually easy to grab a spot right outside (please try not to block the median sidewalk across the street — it belongs to an old woman very interested in guarding her "turf").

Load in through the front — it should be unlocked, just come on in; otherwise ring the doorbell or text me.

## Entry fee / BYOB

We don't require tickets for entry (I legally can't), so the entry fee is a "Suggested Donation." People can also buy "tickets" ahead of time at the RSVP link, which is the only way to guarantee a spot. There are signs up with Venmo / credit card / Apple Pay info and a cash jar — feel free to mention this during your set in case people missed the donation signs on the way in.

It's officially BYOB — bring your own if you want. I'll also have beers for sale (under the table, don't publicize that plz :D), plus seltzers/water and light snacks. No underage drinking whatsoever — that could get the whole thing shut down.

## Sound

We'll have a sound engineer running this one (see up top) — they're great, and I'll be around for anything you need. We've got a full PA and a pretty comprehensive setup here, akin to any small music venue.

### Backline / shared gear

- **Drums** — there's a house kit I must insist everyone share, for space and time reasons — but bring your own breakables (snare/cymbals, etc.) if you'd like
- **Bass amp** — there's a house bass amp available
- **Guitar amps** — two available: Fender Blues Jr + Peavey Classic 30 (let me know if you'd like to use any of them)

### Audio/video recording

The "archival" part of the Birdhaus is important to me — I love recording full sets and posting them for posterity. I do one video for the whole set (to cut down on export time), including a multitrack audio recording that I mix afterward, plus at least one camera angle (sometimes more). I'll edit it together and send it to you + post it on the website. If you want the raw video file to edit yourself, just ask — and let me know if you'd rather not be recorded at all.

## Merch

There's a spot to sell merch on the main floor if you want — the folding table next to the larger dining table.

## Green room & WiFi

There's a room on the main floor (to the right of the bathroom) you can stash personal stuff in (keep the door shut).

WiFi is **Bosco_USI** or **Bosco-5G_USI** — password **zoomies99**.

## Day-of contact

Day of the show, text or call (rather than IG DMs) — **920 809 5713**.
`;
