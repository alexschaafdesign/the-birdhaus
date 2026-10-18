import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getNightDateCentral } from '@/lib/shows';
import { getOpenDates } from '@/lib/available-dates';
import { broadcastDate } from '@/lib/catalogue';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SiteFrame } from '@/components/night/SiteFrame';
import { outboundAllowed } from '@/lib/staging';
import { ContactForm } from './ContactForm';

// About/Contact (2027): what the venue is, the open dates, and the message
// form. Open dates are the booking dashboard's "mark available" dates from
// tonight on (a night runs until 5am) that don't have a show yet.

export const metadata: Metadata = {
  title: 'About / Contact',
  description:
    'The Birdhaus is a DIY basement venue in South Minneapolis. See open dates and get in touch about playing.',
  alternates: { canonical: '/contact' },
};

// Open dates follow the clock and the dashboard toggle, not the deploy.
export const dynamic = 'force-dynamic';

export default async function ContactPage() {
  const openDates = await getOpenDates(getNightDateCentral());
  // Off the production site the form posts to a log-only route, not the venue's
  // Apps Script (lib/staging.ts).
  const logOnly = !outboundAllowed((await headers()).get('host'));

  return (
    <SiteFrame stats={null}>
      <h1 className="sr-only">About and contact</h1>

      <section aria-labelledby="about" className="text-body-3 flex max-w-3xl flex-col gap-3 leading-normal">
        <SectionHeader id="about" label="About" rule="none" />
        <p>
          The Birdhaus is a DIY basement venue in South Minneapolis. Donation at the door. All
          ages.
        </p>
        <p>RSVP to an event to receive the address and other details.</p>
      </section>

      <section aria-labelledby="open-dates" className="flex max-w-3xl flex-col gap-3">
        <SectionHeader id="open-dates" label="Open dates" count={openDates.length || undefined} rule="none" />
        {openDates.length === 0 ? (
          <p className="text-body-3">No open dates right now — get in touch anyway.</p>
        ) : (
          <ul className="flex flex-col">
            {openDates.map((date) => (
              <li
                key={date}
                className="text-ui-nav-item-14 border-surface-ink/20 border-b py-2 leading-[1.3] tracking-[--spacing(0.25)]"
              >
                <time dateTime={date}>{broadcastDate(date)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="contact" className="flex max-w-3xl flex-col gap-4">
        <SectionHeader id="contact" label="Contact" rule="none" />
        <p className="text-body-3 leading-normal">
          Send us a message and we&apos;ll get back to you as soon as possible! note: I&apos;m just
          one dude doing this as an unpaid labor of love so your patience is appreciated :D
        </p>
        <ContactForm logOnly={logOnly} />
      </section>
    </SiteFrame>
  );
}
