import type { ShowHubData } from '@/lib/show-hub';
import type { ShowAdvanceState } from '@/lib/advance';
import { inputCatalogItem, OTHER_INPUT_KEY } from '@/lib/input-catalog';
import { normalizeScheduleTime } from '@/lib/schedule-time';
import type { InputItem } from '@/lib/inputs';
import HubPortal from '@/components/hub/HubPortal';
import HubInfo from '@/components/hub/HubInfo';
import HubFlyer from '@/components/hub/HubFlyer';
import {
  HubAdminBar,
  HubAdminScheduleEdit,
  HubAdminPayEdit,
} from '@/components/hub/HubAdmin';

// The full show-hub page body, shared by two mounts:
//   • /hub/<token>            — the public band/crew view (wrapped in its own
//     full-screen <main>).
//   • /admin/shows/<id>/portal — the admin "Portal" tab, rendered inside the
//     admin workspace so the nav + show tabs stay put.
// Admin visitors (isAdmin) get the same page plus inline controls (invite,
// editing, recipients); adminState is only passed — and its components only
// rendered — behind a server-side session check upstream.
export default function ShowHubView({
  data,
  token,
  isAdmin,
  adminState,
}: {
  data: ShowHubData;
  token: string;
  isAdmin: boolean;
  adminState: ShowAdvanceState | null;
}) {
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {adminState && <HubAdminBar state={adminState} />}
      {/* Header + day-of essentials (incl. the RSVP count) span the full width
          as the dashboard's masthead; everything else drops into the split below. */}
      <Header data={data} />
      <QuickFacts data={data} />
      {/* "The show | From you" split: left column is the read-only rundown
          (schedule, pay, venue), right column is everything we want back from
          the band (advance form, message board, input needs) — so tasks and
          reference each have a stable home on desktop.

          On mobile the wrappers collapse via `contents`, making every card a
          direct flex item so `order-*` restores the one-column priority order:
          schedule → submit → inputs → pay → venue. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
        {/* THE SHOW — read-only show details. */}
        <div className="contents lg:block lg:space-y-6">
          <ColumnLabel>The show</ColumnLabel>
          {(data.schedule.length > 0 || data.soundcheckNotes || adminState) && (
            <div className="order-1">
              <ScheduleSection data={data} adminState={adminState} />
            </div>
          )}
          <div className="order-4">
            <PaySection data={data} adminState={adminState} />
          </div>
          <div className="order-5">
            <HubInfo
              introHtml={data.infoIntroHtml}
              sections={data.infoSections}
              isAdmin={isAdmin}
            />
          </div>
        </div>
        {/* FROM YOU — the things we need back from the lineup. */}
        <div className="contents lg:block lg:space-y-6">
          <ColumnLabel>From you</ColumnLabel>
          <div className="order-2">
            <HubPortal
              token={token}
              bands={data.inputsByBand}
              schedule={data.schedule}
              initialMessages={data.messages}
              isAdmin={isAdmin}
              adminShowId={adminState?.showId ?? null}
            />
          </div>
          {data.inputsByBand.some((b) => b.items.length > 0) && (
            <div className="order-3">
              <InputsSection data={data} />
            </div>
          )}
        </div>
      </div>
      <footer className="text-center text-data-caption-13 text-surface-ink/60 pt-4">
        the BIRDHAUS · show details for the lineup &amp; crew
      </footer>
    </div>
  );
}

function formatDate(date: string | null): string | null {
  if (!date) return null;
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function itemLabel(item: InputItem): string {
  if (item.itemType === OTHER_INPUT_KEY) return item.customLabel?.trim() || 'Other';
  return inputCatalogItem(item.itemType).label;
}

// Desktop-only column heading for the "The show | From you" split. Hidden on
// mobile, where the columns interleave back into one prioritized stack and a
// stray label would sit next to cards from the other column.
function ColumnLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="hidden lg:block text-data-label-10-small uppercase tracking-[0.2em] text-accent-red font-bold">
      {children}
    </p>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-surface-ink bg-surface-paper p-5 space-y-3">
      <h2 className="text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase">{title}</h2>
      {children}
    </section>
  );
}

// A collapsible row (pure HTML <details> — works with no JS) used for the
// venue-info accordion, the pay fine print, and the per-band input lists.
function Expandable({
  summary,
  children,
  tone = 'row',
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  tone?: 'row' | 'inline';
}) {
  return (
    <details className={`group ${tone === 'row' ? 'py-1' : ''}`}>
      <summary className="cursor-pointer select-none list-none flex items-center justify-between gap-3 py-2 text-body-3 text-surface-ink/80 hover:text-accent-red">
        <span className="font-bold">{summary}</span>
        <span
          aria-hidden
          className="text-accent-red text-data-caption-13 transition-transform group-open:rotate-90"
        >
          ▸
        </span>
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

// Day-of essentials, pinned right under the header so nobody digs through the
// venue rundown for the address or WiFi. Parsed (best-effort) from the editable
// info text — a chip whose fact wasn't found simply doesn't render.
function QuickFacts({ data }: { data: ShowHubData }) {
  const { address, phone, wifi } = data.quickFacts;
  const facts: Array<{ label: string; value: string; href?: string }> = [];
  if (address) {
    facts.push({
      label: 'Address',
      value: address,
      href: `https://maps.google.com/?q=${encodeURIComponent(address)}`,
    });
  }
  if (phone) {
    facts.push({
      label: 'Day-of · text or call',
      value: phone,
      href: `sms:${phone.replace(/\D/g, '')}`,
    });
  }
  if (wifi) facts.push({ label: 'WiFi', value: wifi });
  if (facts.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {facts.map((f) => {
        const inner = (
          <>
            <div className="text-data-label-10-small uppercase tracking-[0.12em] text-accent-red font-bold">
              {f.label}
            </div>
            <div className="text-body-3 text-surface-ink/80 leading-snug">{f.value}</div>
          </>
        );
        const cls =
          ' border border-surface-ink/20 bg-surface-paper px-3.5 py-2.5 space-y-0.5';
        return f.href ? (
          <a
            key={f.label}
            href={f.href}
            target={f.href.startsWith('http') ? '_blank' : undefined}
            rel={f.href.startsWith('http') ? 'noopener noreferrer' : undefined}
            className={`${cls} hover:border-accent-red transition-colors`}
          >
            {inner}
          </a>
        ) : (
          <div key={f.label} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function Header({ data }: { data: ShowHubData }) {
  const { show, soundEngineerName } = data;
  const date = formatDate(show.date);
  return (
    // Flyer rides along as a click-to-enlarge thumbnail on the left instead of
    // a full-width image in its own row — it's reference material here, not
    // the promo. min-w-0 lets the title wrap instead of pushing the row wide.
    <header className="flex items-start gap-5">
      {show.flyer && <HubFlyer src={show.flyer} alt={`${show.title} flyer`} />}
      <div className="min-w-0 space-y-4">
        <div className="text-data-label-10-small uppercase tracking-[0.2em] text-accent-red font-bold">
          the birdhaus
        </div>
        <h1 className="text-header-2 font-bold leading-tight">{show.title}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-body-3 text-surface-ink/80">
          {date && <span>{date}</span>}
          {show.doorsTime && <span>Doors {show.doorsTime}</span>}
          {show.showTime && <span>Music {show.showTime}</span>}
        </div>
        {soundEngineerName && (
          <p className="text-body-3 text-surface-ink/60">Sound: {soundEngineerName}</p>
        )}
        {/* RSVPs + tickets as one unit: the live headcount (party sizes
            summed, so +1s count) as the headline chip, with the public RSVP
            link alongside. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-baseline gap-1.5 border border-surface-ink bg-surface-paper-shade px-3.5 py-1 text-surface-ink">
            <span className="text-header-4 font-bold tabular-nums text-surface-ink">
              {data.rsvp.expected}
            </span>
            <span className="text-body-3 font-bold">
              RSVP{data.rsvp.expected === 1 ? '' : 's'}
            </span>
          </span>
          {show.ticketUrl && (
            <a
              href={show.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-body-3 text-accent-red underline underline-offset-4 transition-colors hover:text-surface-ink"
            >
              Ticket / RSVP page →
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

function ScheduleSection({
  data,
  adminState,
}: {
  data: ShowHubData;
  adminState: ShowAdvanceState | null;
}) {
  return (
    <Card title="Schedule">
      {/* The time column is max-content so it sizes to the longest time and a
          range like "9:45–10:30pm" never wraps; `contents` lets the li spans
          participate in the shared grid while keeping list semantics. */}
      <ul className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
        {data.schedule.map((row, i) => {
          // Fill in missing minutes ("7pm" → "7:00pm") so rows saved before
          // the editor kept :00 still read as full clock times.
          const time = normalizeScheduleTime(row.time.trim());
          const label = row.label.trim();
          return (
            <li key={i} className="contents text-body-3">
              <span className="whitespace-nowrap font-bold tabular-nums text-body-3 text-surface-ink">
                {time}
              </span>
              <span className="text-body-3 text-surface-ink/80">{label}</span>
            </li>
          );
        })}
      </ul>
      {data.soundcheckNotes && (
        <div className="border-l-4 border-surface-ink bg-surface-paper-shade px-4 py-3 text-body-3 text-surface-ink/80 whitespace-pre-wrap">
          {data.soundcheckNotes}
        </div>
      )}
      {data.schedule.length === 0 && !data.soundcheckNotes && adminState && (
        <p className="text-body-3 text-surface-ink/60">No schedule yet.</p>
      )}
      {adminState && <HubAdminScheduleEdit state={adminState} />}
    </Card>
  );
}

function InputsSection({ data }: { data: ShowHubData }) {
  const bandsWithItems = data.inputsByBand.filter((b) => b.items.length > 0);
  return (
    <Card title="Input needs">
      {bandsWithItems.length > 0 && (
        <div className="divide-y divide-surface-ink/20">
          {bandsWithItems.map((band) => (
            <Expandable
              key={band.bandId}
              summary={
                <>
                  {band.name}{' '}
                  <span className="text-surface-ink/60 font-normal">
                    · {band.items.length} item{band.items.length === 1 ? '' : 's'}
                  </span>
                </>
              }
            >
              <ul className="space-y-0.5">
                {band.items.map((item, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-body-3 text-surface-ink/80">
                    <span className="w-7 text-right font-bold tabular-nums">{item.quantity}×</span>
                    <span>
                      {itemLabel(item)}
                      {item.note && <span className="text-surface-ink/60"> — {item.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Expandable>
          ))}
        </div>
      )}
    </Card>
  );
}

function PaySection({
  data,
  adminState,
}: {
  data: ShowHubData;
  adminState: ShowAdvanceState | null;
}) {
  const { introHtml, detailsHtml, askHtml } = data.pay;
  return (
    <Card title="Pay / door deal">
      <div
        className="hub-prose text-body-3 text-surface-ink/80 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: introHtml }}
      />
      {detailsHtml && (
        <div className="border-t border-surface-ink/20">
          <Expandable summary="Payout examples & the fine print">
            <div
              className="hub-prose text-body-3 text-surface-ink/80 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: detailsHtml }}
            />
          </Expandable>
        </div>
      )}
      {askHtml && (
        <div
          className="hub-prose border-l-4 border-accent-red bg-surface-paper-shade px-4 py-3 text-body-3 text-surface-ink/80 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: askHtml }}
        />
      )}
      {adminState && <HubAdminPayEdit state={adminState} />}
    </Card>
  );
}

