import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SiteFrame } from '@/components/night/SiteFrame';
import { outboundAllowed } from '@/lib/staging';
import { getOpenDates } from '@/lib/available-dates';
import { getNightDateCentral } from '@/lib/shows';
import { ContactForm } from './ContactForm';

// About/Contact (2027): what the venue is and the message form. The show
// request form lists the Booking calendar's open dates (marked available, no
// show, no all-day block) from tomorrow on, as suggestions bands can tick;
// they can still add any other date or range.

export const metadata: Metadata = {
  title: 'About / Contact',
  description:
    'The Birdhaus is a DIY basement venue in South Minneapolis. Get in touch about playing.',
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  // Off the production site the form posts to a log-only route, not the venue's
  // Apps Script (lib/staging.ts).
  const logOnly = !outboundAllowed((await headers()).get('host'));
  const today = getNightDateCentral();
  const openDates = (await getOpenDates(today)).filter((d) => d > today);

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

      <section aria-labelledby="contact" className="flex max-w-3xl flex-col gap-4">
        <SectionHeader id="contact" label="Contact" rule="none" />
        {/* The intro is the form's child so it can hide once something's sent. */}
        <ContactForm logOnly={logOnly} openDates={openDates}>
          <p className="text-body-3 leading-normal">
            Pick &ldquo;Show requests&rdquo; or &ldquo;General contact&rdquo; and we&apos;ll get
            back to you as soon as possible! note: I&apos;m just one dude doing this as an unpaid
            labor of love so your patience is appreciated :D
          </p>
        </ContactForm>
      </section>
    </SiteFrame>
  );
}
