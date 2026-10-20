import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SiteFrame } from '@/components/night/SiteFrame';
import { outboundAllowed } from '@/lib/staging';
import { ContactForm } from './ContactForm';

// About/Contact (2027): what the venue is and the message form. Open dates are
// private: the booking dashboard's "mark available" dates show only in the
// admin preview on Home, never on a public page.

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
        <p className="text-body-3 leading-normal">
          Send us a message and we&apos;ll get back to you as soon as possible! note: I&apos;m just
          one dude doing this as an unpaid labor of love so your patience is appreciated :D
        </p>
        <ContactForm logOnly={logOnly} />
      </section>
    </SiteFrame>
  );
}
