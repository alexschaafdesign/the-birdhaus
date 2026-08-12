import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getShowHubData, type ShowHubData } from '@/lib/show-hub';
import { inputCatalogItem, OTHER_INPUT_KEY } from '@/lib/input-catalog';
import type { InputItem } from '@/lib/inputs';
import HubPortal from '@/components/hub/HubPortal';

export const dynamic = 'force-dynamic';

// Token-gated and shared by link — keep it out of search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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

export default async function ShowHubPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getShowHubData(token);
  if (!data) notFound();

  return (
    <main className="min-h-screen bg-[#2A2420] text-[#E8E0D0] px-5 py-10">
      <div className="max-w-2xl mx-auto space-y-8">
        <Header data={data} />
        <HubPortal token={token} bands={data.inputsByBand} initialMessages={data.messages} />
        {data.schedule.length > 0 && <ScheduleSection data={data} />}
        {(data.inputsTotal.length > 0 || data.inputsByBand.some((b) => b.items.length > 0)) && (
          <InputsSection data={data} />
        )}
        <RsvpSection data={data} />
        <PaySection data={data} />
        <InfoSection data={data} />
        <footer className="text-center text-xs text-[#E8E0D0]/40 pt-4">
          the BIRDHAUS · show details for the lineup &amp; crew
        </footer>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-[#E8E0D0]/15 rounded-xl p-5 space-y-3">
      <h2 className="text-xs uppercase tracking-[0.12em] text-[#c8a26a] font-semibold">{title}</h2>
      {children}
    </section>
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

function ScheduleSection({ data }: { data: ShowHubData }) {
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
        <div className="space-y-3">
          {bandsWithItems.map((band) => (
            <div key={band.bandId}>
              <p className="text-sm font-medium text-[#E8E0D0]">{band.name}</p>
              <ul className="mt-1 space-y-0.5">
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
            </div>
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
      <div className="flex gap-8">
        <div>
          <div className="text-3xl font-bold">{count}</div>
          <div className="text-xs text-[#E8E0D0]/50">RSVP{count === 1 ? '' : 's'}</div>
        </div>
        <div>
          <div className="text-3xl font-bold">{expected}</div>
          <div className="text-xs text-[#E8E0D0]/50">people expected</div>
        </div>
      </div>
      <p className="text-xs text-[#E8E0D0]/40">
        RSVPs are a soft headcount, not a guarantee — turnout often shifts at the door.
      </p>
    </Card>
  );
}

function PaySection({ data }: { data: ShowHubData }) {
  return (
    <Card title="Pay / door deal">
      <div
        className="hub-prose text-sm text-[#E8E0D0]/80 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: data.payHtml }}
      />
    </Card>
  );
}

function InfoSection({ data }: { data: ShowHubData }) {
  return (
    <Card title="Venue & info">
      <div
        className="hub-prose text-sm text-[#E8E0D0]/80 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: data.infoHtml }}
      />
    </Card>
  );
}
