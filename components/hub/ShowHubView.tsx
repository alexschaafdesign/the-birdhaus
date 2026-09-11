import type { ShowHubData } from '@/lib/show-hub';
import type { ShowAdvanceState } from '@/lib/advance';
import { inputCatalogItem, OTHER_INPUT_KEY } from '@/lib/input-catalog';
import type { InputItem } from '@/lib/inputs';
import HubPortal from '@/components/hub/HubPortal';
import {
  HubAdminBar,
  HubAdminScheduleEdit,
  HubAdminPayEdit,
  HubAdminRecipients,
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
    <div className="max-w-2xl mx-auto space-y-8">
      {adminState && <HubAdminBar state={adminState} />}
      <Header data={data} />
      {/* The advance submission sits directly under the header (below the
          flyer) so bands see the thing they need to do before scanning the
          read-only show details. */}
      <HubPortal
        token={token}
        bands={data.inputsByBand}
        schedule={data.schedule}
        initialMessages={data.messages}
        isAdmin={isAdmin}
        adminShowId={adminState?.showId ?? null}
      />
      <QuickFacts data={data} />
      {(data.schedule.length > 0 || data.soundcheckNotes || adminState) && (
        <ScheduleSection data={data} adminState={adminState} />
      )}
      {(data.inputsTotal.length > 0 || data.inputsByBand.some((b) => b.items.length > 0)) && (
        <InputsSection data={data} />
      )}
      <PaySection data={data} adminState={adminState} />
      <RsvpSection data={data} />
      <InfoSection data={data} isAdmin={isAdmin} />
      {adminState && <HubAdminRecipients state={adminState} />}
      <footer className="text-center text-xs text-[#E8E0D0]/40 pt-4">
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-[#E8E0D0]/15 rounded-xl p-5 space-y-3">
      <h2 className="text-xs uppercase tracking-[0.12em] text-[#c8a26a] font-semibold">{title}</h2>
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
      <summary className="cursor-pointer select-none list-none flex items-center justify-between gap-3 py-2 text-sm text-[#E8E0D0]/85 hover:text-[#E8E0D0]">
        <span className="font-medium">{summary}</span>
        <span
          aria-hidden
          className="text-[#c8a26a]/70 text-xs transition-transform group-open:rotate-90"
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
            <div className="text-[10px] uppercase tracking-[0.12em] text-[#c8a26a]/80 font-semibold">
              {f.label}
            </div>
            <div className="text-sm text-[#E8E0D0]/90 leading-snug">{f.value}</div>
          </>
        );
        const cls =
          'rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] px-3.5 py-2.5 space-y-0.5';
        return f.href ? (
          <a
            key={f.label}
            href={f.href}
            target={f.href.startsWith('http') ? '_blank' : undefined}
            rel={f.href.startsWith('http') ? 'noopener noreferrer' : undefined}
            className={`${cls} hover:border-[#c8a26a]/50 transition-colors`}
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
  const { show, lineup, soundEngineerName } = data;
  const date = formatDate(show.date);
  return (
    <header className="space-y-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#c8a26a] font-semibold">
        the birdhaus
      </div>
      <h1 className="text-3xl font-bold leading-tight">{show.title}</h1>
      {lineup.length > 0 && <p className="text-lg text-[#E8E0D0]/80">{lineup.join(' · ')}</p>}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#E8E0D0]/70">
        {date && <span>{date}</span>}
        {show.doorsTime && <span>Doors {show.doorsTime}</span>}
        {show.showTime && <span>Music {show.showTime}</span>}
      </div>
      {soundEngineerName && (
        <p className="text-sm text-[#E8E0D0]/60">Sound: {soundEngineerName}</p>
      )}
      {show.flyer && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={show.flyer}
          alt={`${show.title} flyer`}
          className="w-full max-w-sm rounded-lg border border-[#E8E0D0]/10"
        />
      )}
      {show.ticketUrl && (
        <a
          href={show.ticketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-[#c8a26a] hover:text-[#E8E0D0] underline"
        >
          Ticket / RSVP link →
        </a>
      )}
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
      <ul className="space-y-1.5">
        {data.schedule.map((row, i) => {
          const time = row.time.trim();
          const label = row.label.trim();
          return (
            <li key={i} className="flex gap-3 text-sm">
              <span className="w-24 shrink-0 font-semibold tabular-nums text-[#E8E0D0]">
                {time}
              </span>
              <span className="text-[#E8E0D0]/85">{label}</span>
            </li>
          );
        })}
      </ul>
      {data.soundcheckNotes && (
        <div className="rounded-lg border-l-4 border-[#7ea6d9] bg-[#7ea6d9]/10 px-4 py-3 text-sm text-[#E8E0D0]/85 whitespace-pre-wrap">
          {data.soundcheckNotes}
        </div>
      )}
      {data.schedule.length === 0 && !data.soundcheckNotes && adminState && (
        <p className="text-sm text-[#E8E0D0]/40">No schedule yet.</p>
      )}
      {adminState && <HubAdminScheduleEdit state={adminState} />}
    </Card>
  );
}

function InputsSection({ data }: { data: ShowHubData }) {
  const bandsWithItems = data.inputsByBand.filter((b) => b.items.length > 0);
  return (
    <Card title="Input needs">
      {data.inputsTotal.length > 0 && (
        <div className="rounded-lg bg-[#E8E0D0]/[0.05] p-4">
          <p className="text-[11px] uppercase tracking-wide text-[#E8E0D0]/50 mb-2">
            Combined — what we need in total
          </p>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {data.inputsTotal.map((line) => (
              <li key={`${line.key}:${line.label}`} className="flex items-baseline gap-2 text-sm">
                <span className="w-7 text-right font-semibold tabular-nums">{line.quantity}×</span>
                <span className="text-[#E8E0D0]/90">{line.label}</span>
                {line.houseLabel && (
                  <span className="text-xs text-[#8fb98f]">· {line.houseLabel} avail.</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bandsWithItems.length > 0 && (
        <div className="divide-y divide-[#E8E0D0]/10">
          {bandsWithItems.map((band) => (
            <Expandable
              key={band.bandId}
              summary={
                <>
                  {band.name}{' '}
                  <span className="text-[#E8E0D0]/40 font-normal">
                    · {band.items.length} item{band.items.length === 1 ? '' : 's'}
                  </span>
                </>
              }
            >
              <ul className="space-y-0.5">
                {band.items.map((item, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-sm text-[#E8E0D0]/75">
                    <span className="w-7 text-right font-semibold tabular-nums">{item.quantity}×</span>
                    <span>
                      {itemLabel(item)}
                      {item.note && <span className="text-[#E8E0D0]/45"> — {item.note}</span>}
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

function RsvpSection({ data }: { data: ShowHubData }) {
  const { count, expected } = data.rsvp;
  return (
    <Card title="RSVPs so far">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-bold">{count}</span>
        <span className="text-sm text-[#E8E0D0]/60">RSVP{count === 1 ? '' : 's'}</span>
        <span className="text-[#E8E0D0]/25">·</span>
        <span className="text-2xl font-bold">{expected}</span>
        <span className="text-sm text-[#E8E0D0]/60">people expected</span>
      </div>
      <p className="text-xs text-[#E8E0D0]/40">
        A soft headcount, not a guarantee — turnout often shifts at the door.
      </p>
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
        className="hub-prose text-sm text-[#E8E0D0]/85 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: introHtml }}
      />
      {detailsHtml && (
        <div className="border-t border-[#E8E0D0]/10">
          <Expandable summary="Payout examples & the fine print">
            <div
              className="hub-prose text-sm text-[#E8E0D0]/75 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: detailsHtml }}
            />
          </Expandable>
        </div>
      )}
      {askHtml && (
        <div
          className="hub-prose rounded-lg border-l-4 border-[#c8a26a] bg-[#c8a26a]/10 px-4 py-3 text-sm text-[#E8E0D0]/90 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: askHtml }}
        />
      )}
      {adminState && <HubAdminPayEdit state={adminState} />}
    </Card>
  );
}

function InfoSection({ data, isAdmin }: { data: ShowHubData; isAdmin: boolean }) {
  return (
    <Card title="Venue & info">
      {data.infoIntroHtml && (
        <div
          className="hub-prose text-sm text-[#E8E0D0]/80 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: data.infoIntroHtml }}
        />
      )}
      {data.infoSections.length > 0 && (
        <div className="divide-y divide-[#E8E0D0]/10">
          {data.infoSections.map((s) => (
            <Expandable key={s.title} summary={s.title}>
              <div
                className="hub-prose text-sm text-[#E8E0D0]/75 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: s.html }}
              />
            </Expandable>
          ))}
        </div>
      )}
      {isAdmin && (
        <p className="text-xs pt-1">
          <a
            href="/admin/settings"
            className="text-[#E8E0D0]/45 hover:text-[#E8E0D0] underline"
          >
            Edit this text (admin) →
          </a>
        </p>
      )}
    </Card>
  );
}
