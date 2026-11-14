import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { SiteFrame } from '@/components/night/SiteFrame';
import { SectionHeader } from '@/components/ui/SectionHeader';
import InterestForm from '@/components/rehearsal/InterestForm';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { isAdminSession } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

// The public rehearsal-space page: the pitch, photos, gear, prices, how it
// works, house rules and the "I'm interested" form. No calendar, no
// availability, no address (PRODUCT.md: the address stays private). Hidden
// (404) until switched on in Settings; signed-in admins can preview it.

export const metadata: Metadata = {
  title: 'Rehearsal space',
  description:
    'Rehearse at the Birdhaus: a DIY basement room with a backline in South Minneapolis, booked by private invitation.',
  alternates: { canonical: '/rehearsal' },
};

const DEFAULT_INTRO =
  'The Birdhaus basement doubles as a rehearsal room: a real room with a backline, in South Minneapolis.\n\nIt’s booked by invitation. Tell me about your band below, and if it’s a fit I’ll send you a link to see open times and book.';

function paragraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export default async function RehearsalPage() {
  const [s, isAdmin] = await Promise.all([getRehearsalSettings(), isAdminSession()]);
  if (!s.publicPageEnabled && !isAdmin) notFound();

  // The red facts line is free text from Settings (no prices unless Alex writes them).
  const facts = s.publicFactsLine
    .split('·')
    .map((f) => f.trim())
    .filter(Boolean);
  const rules = s.houseRules
    .split('\n')
    .map((r) => r.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
  const steps = [
    'Tell me about your band with the form below.',
    'If it’s a fit, I’ll email you a private link to book.',
    'Pick open blocks — once, or every week, every other week or monthly.',
    'I’ll confirm by email with the address.',
    ...(s.paymentsEnabled ? [`Pay per session by Venmo (${money(s.priceCents)} a block).`] : []),
  ];

  return (
    <SiteFrame stats={null}>
      <h1 className="sr-only">Rehearsal space</h1>

      {!s.publicPageEnabled && (
        <p role="status" className="border-accent-red text-accent-red text-body-3 border-2 p-3 leading-normal">
          Hidden: only signed-in admins can see this page. Turn it on in Admin → Rehearsal → Settings. The form won’t
          send until then.
        </p>
      )}

      <section aria-labelledby="space" className="flex w-full max-w-5xl flex-col gap-4">
        <SectionHeader id="space" label="Rehearsal space" rule="m" />
        <div className="text-body-2 flex max-w-3xl flex-col gap-3 leading-normal">
          {paragraphs(s.publicIntro || DEFAULT_INTRO).map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <p className="text-data-overline-11 text-accent-red flex flex-wrap gap-x-3 gap-y-1 font-bold tracking-[--spacing(0.625)] uppercase">
          {facts.map((f, i) => (
            <span key={f}>
              {i > 0 && <span aria-hidden className="text-surface-ink/40 mr-3">·</span>}
              {f}
            </span>
          ))}
        </p>
      </section>

      {s.photoUrls.length > 0 && (
        <section aria-label="Photos of the rehearsal room" className="grid w-full max-w-5xl grid-cols-1 gap-2 sm:grid-cols-2">
          {s.photoUrls.map((u, i) => (
            <div key={u} className={`relative aspect-[4/3] ${i === 0 && s.photoUrls.length > 2 ? 'sm:col-span-2 sm:aspect-[16/9]' : ''}`}>
              <Image
                src={u}
                alt={i === 0 ? 'The rehearsal room at the Birdhaus' : `The rehearsal room, photo ${i + 1}`}
                fill
                sizes={i === 0 && s.photoUrls.length > 2 ? '(min-width: 1024px) 1024px, 100vw' : '(min-width: 640px) 50vw, 100vw'}
                className="object-cover"
                priority={i === 0}
              />
            </div>
          ))}
        </section>
      )}

      <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-2">
        {s.gearOptions.length > 0 && (
          <section aria-labelledby="gear" className="flex flex-col gap-3">
            <SectionHeader id="gear" label="In the room" />
            <ul className="text-body-3 flex flex-col gap-1 leading-normal">
              {s.gearOptions.map((g) => (
                <li key={g} className="flex gap-2">
                  <span aria-hidden className="text-accent-red">■</span>
                  {g}
                </li>
              ))}
            </ul>
            <p className="text-body-3 leading-normal opacity-70">Bring your own instruments; tell us what you’ll need when you book.</p>
          </section>
        )}

        <section aria-labelledby="how" className="flex flex-col gap-3">
          <SectionHeader id="how" label="How it works" />
          <ol className="text-body-3 flex flex-col gap-2 leading-normal">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="text-data-caption-13 text-accent-red w-5 shrink-0 font-bold">{String(i + 1).padStart(2, '0')}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {rules.length > 0 && (
        <section aria-labelledby="rules" className="flex w-full max-w-5xl flex-col gap-3">
          <SectionHeader id="rules" label="House rules" />
          <ul className="text-body-3 grid gap-x-10 gap-y-1 leading-normal sm:grid-cols-2">
            {rules.map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden className="text-accent-red">■</span>
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="interest" className="flex w-full max-w-2xl flex-col gap-4">
        <SectionHeader id="interest" label="I’m interested" />
        <p className="text-body-3 leading-normal">
          Tell me a bit about your band. I read every one, and if it’s a fit I’ll send you a link to book.
        </p>
        <InterestForm />
      </section>
    </SiteFrame>
  );
}
