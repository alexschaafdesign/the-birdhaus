import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import {
  findShowBySlugIgnoringCase,
  getNightDateCentral,
  getShowByCatalogueId,
  getShowById,
  getTicketAvailability,
  type Show,
} from '@/lib/shows';
import { bandNames, freshCutsTag, isFreshCuts, to24h } from '@/lib/catalogue';
import { getAllBands } from '@/lib/bands';
import { getPhotosFromFolder } from '@/lib/cloudinary';
import {
  archiveTotals,
  getNights,
  lineup as nightLineup,
  neighbours,
  openSetSlug,
  otherSets,
  photoCount,
  seriesTag,
  tickOf,
  type Night,
} from '@/lib/archive';
import {
  isPrivateBooking,
  nightState,
  parseNightParam,
  queryString,
  showPhotoGallery,
  type NightState,
  type PhotoCredit,
} from '@/lib/nights';
import { isAdminSession } from '@/lib/admin-session';
import RSVPForm from '@/components/RSVPForm';
import PhotoGallery, { type GalleryPhoto } from '@/components/PhotoGallery';
import CloudinaryGallery from '@/components/CloudinaryGallery';
import AdminEditFAB from '@/components/admin/AdminEditFAB';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { buttonClassName, ButtonArrow } from '@/components/ui/Button';
import { SiteFrame, NightBand } from '@/components/night/SiteFrame';
import { AudioLink, PhotoStrip, VideoPlayer } from '@/components/night/Media';
import { SetBlock } from '@/components/night/SetBlock';
import { OpenOnHash } from '@/components/night/OpenOnHash';
import {
  countLine,
  DoorDetails,
  Lineup,
  NightCredits,
  NightHeader,
  NightNotes,
  Panel,
  PrevNext,
  StatusNotice,
  type LineupAct,
} from '@/components/night/NightParts';
import type { CloudinaryPhoto } from '@/lib/cloudinary-url';

// One page per night, /shows/BH-YYMMDD (and /shows/SAD-### for Song-a-day
// editions), from announcement through archive — a link shared before the show
// (or a flyer QR code) ends up at the recordings. The header (ID, date,
// lineup) is the same in every state; below it the page renders one state
// (lib/nights.ts):
//   upcoming   flyer, door details, RSVP/tickets, lineup with set times
//   tonight    the same, with the running order and set times up top
//   archived   sets, notes, media, photos, credits, releases, prev/next —
//              a complete page even with only a lineup
//   cancelled / postponed   a notice in place of RSVP/tickets
// Old slug URLs (any casing) 308 here; /archive/BH-… redirects in next.config.

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const parsed = parseNightParam(id);
  if (parsed.kind !== 'bh') {
    return parsed.kind === 'sad' ? { title: parsed.id, alternates: { canonical: `/shows/${parsed.id}` } } : {};
  }
  const show = await getShowByCatalogueId(parsed.id);
  if (!show) return {};
  if (isPrivateBooking(show) && !(await isAdminSession())) return {};

  const lineup = bandNames(show).filter(Boolean).join(', ');
  const prettyDate = new Date(show.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const description =
    show.description?.trim() ||
    [prettyDate, lineup && `Lineup: ${lineup}`].filter(Boolean).join(' — ') ||
    `A show at the BIRDHAUS on ${prettyDate}.`;
  const images = show.flyer ? [{ url: show.flyer, alt: `${show.title} flyer` }] : undefined;
  const url = `/shows/${show.catalogueId}`;
  const title = `${show.title} · ${show.catalogueId}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    // A cancelled night shouldn't surface in search as if it's on.
    robots: show.status === 'scheduled' ? undefined : { index: false },
    openGraph: { type: 'article', title, description, url, images },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title,
      description,
      images: show.flyer ? [show.flyer] : undefined,
    },
  };
}

export default async function NightPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id: raw }, query] = await Promise.all([params, searchParams]);
  const parsed = parseNightParam(raw);

  // Old slug URL → the night's ID (308), unless it's a private booking.
  if (parsed.kind === 'slug') {
    const found = await findShowBySlugIgnoringCase(parsed.slug);
    if (found && (!isPrivateBooking(found) || (await isAdminSession()))) {
      permanentRedirect(`/shows/${found.catalogueId}${queryString(query)}`);
    }
    notFound();
  }

  // bh-250329 / BH-250329B → BH-250329 / BH-250329b.
  if (parsed.raw !== parsed.id) {
    permanentRedirect(`/shows/${parsed.id}${queryString(query)}`);
  }

  // ?sample renders the archive fixtures (lib/archive/fixtures.ts).
  const sample = query.sample !== undefined;
  if (parsed.kind === 'sad' || sample) {
    const nights = await getNights(sample);
    const night = nights.find((n) => n.id === parsed.id);
    if (!night) notFound();
    return <ArchivedNight nights={nights} night={night} sample={sample} isAdmin={await isAdminSession()} />;
  }

  const show = await getShowByCatalogueId(parsed.id);
  if (!show) notFound();
  const isAdmin = await isAdminSession();
  const nightDate = getNightDateCentral();
  if (isPrivateBooking(show, nightDate) && !isAdmin) notFound();

  const state = nightState(show, nightDate);
  if (state === 'archived') {
    const nights = await getNights(false);
    const night = nights.find((n) => n.id === show.catalogueId);
    if (night) return <ArchivedNight nights={nights} night={night} show={show} isAdmin={isAdmin} />;
    // Not an archive night (e.g. a Song Club event adapted into a show):
    // fall through to the plain page, without tickets.
  }

  return <ShowNight show={show} state={state} isAdmin={isAdmin} flag={isPrivateBooking(show, nightDate) ? 'UNANNOUNCED' : null} />;
}

// ---- upcoming / tonight / cancelled / postponed ------------------------------

async function ShowNight({
  show,
  state,
  isAdmin,
  flag,
}: {
  show: Show;
  state: NightState;
  isAdmin: boolean;
  flag: string | null;
}) {
  const ahead = state === 'upcoming' || state === 'tonight';
  const [bands, availability, replacement] = await Promise.all([
    getAllBands(),
    ahead ? getTicketAvailability(show.id, show.ticketLimit ?? null) : null,
    state === 'postponed' && show.rescheduledTo ? getShowById(show.rescheduledTo) : null,
  ]);

  // Per-show band entries can override name/bio, but rarely do; the band's own
  // profile is where bios actually live. Fall back to it.
  const bandsById = new Map(bands.map((b) => [Number(b.id), b]));
  const acts: LineupAct[] = show.bands.map((entry) => {
    if (typeof entry === 'string') return { name: entry };
    const central = entry.bandId != null ? bandsById.get(Number(entry.bandId)) : undefined;
    return {
      name: entry.name,
      slug: central?.slug,
      setStart: entry.setStart,
      bio: entry.bio || central?.bio || undefined,
    };
  });
  // Tonight leads with the running order by set time, when times are known.
  const byTime = acts.some((a) => a.setStart)
    ? [...acts].sort((a, b) => (toMinutes(a.setStart) ?? 1e9) - (toMinutes(b.setStart) ?? 1e9))
    : acts;

  // The replacement night is linked only when it's public.
  const newDate =
    replacement && (replacement.announced || isAdmin)
      ? { id: replacement.catalogueId, date: replacement.date }
      : null;

  const fc = freshCutsTag(show.slug);
  const notice = state === 'cancelled' || state === 'postponed';

  return (
    <SiteFrame stats={null} navPath={state === 'archived' ? '/archive' : undefined}>
      {isAdmin && <AdminEditFAB href={`/admin/shows/${show.id}`} label="Edit Show" />}
      <NightHeader
        id={show.catalogueId}
        tick={isFreshCuts(show.slug) ? 'fc' : 'bh'}
        tag={fc}
        date={show.date}
        lineup={bandNames(show).join(' · ') || show.title}
        back={{ href: '/redesign/home', label: 'ALL SHOWS' }}
        flag={flag}
      />

      {state === 'tonight' && acts.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader label="Tonight" />
          <DoorDetails doorsTime={show.doorsTime} showTime={show.showTime} />
          <Lineup acts={byTime} big />
        </section>
      )}

      {notice && <StatusNotice status={state} newDate={newDate} />}

      <div className="grid items-start gap-8 lg:grid-cols-2">
        {show.flyer && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={show.flyer}
            alt={`${show.title} flyer`}
            className={`border-surface-ink h-auto w-full max-w-xl border-2 ${notice ? 'opacity-60 grayscale' : ''}`}
          />
        )}
        {ahead && (
          <div className="flex flex-col gap-6">
            {state === 'upcoming' && <DoorDetails doorsTime={show.doorsTime} showTime={show.showTime} />}
            <TicketPanel show={show} soldOut={availability?.soldOut ?? false} />
          </div>
        )}
      </div>

      {(state !== 'tonight' || acts.length === 0) && acts.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader label="Lineup" count={acts.length} />
          <Lineup acts={acts} />
        </section>
      )}

      <NightNotes description={show.description} html={show.content} />
    </SiteFrame>
  );
}

// RSVP / tickets, as on the old show page: sold out replaces the form at the
// ticket cap; a promoter's ticket link stands in when there's no RSVP form.
function TicketPanel({ show, soldOut }: { show: Show; soldOut: boolean }) {
  if (soldOut) {
    return (
      <Panel label="Sold out">
        <p className="text-body-3 leading-normal">
          Enough people have bought advance tickets (not just a free RSVP) that we&apos;re at capacity. Thanks!
        </p>
      </Panel>
    );
  }
  if (show.rsvpForm) return <RSVPForm showId={show.id} ticketUrl={show.ticketUrl} variant="2027" />;
  if (show.externalTicketUrl) {
    return (
      <Panel label="Tickets">
        <p className="text-body-3 leading-normal">Tickets for this show are handled by an outside promoter.</p>
        <a
          href={show.externalTicketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonClassName()} w-fit`}
        >
          Get tickets
          <ButtonArrow />
        </a>
      </Panel>
    );
  }
  return null;
}

// "8:30pm" → minutes, for running order by set time. Times before 6am are
// after midnight, so they sort after the evening's sets.
function toMinutes(time?: string): number | null {
  const hhmm = to24h(time)?.match(/^(\d{2}):(\d{2})$/);
  if (!hhmm) return null;
  const h = Number(hhmm[1]);
  return (h < 6 ? h + 24 : h) * 60 + Number(hhmm[2]);
}

// ---- archived -----------------------------------------------------------------

async function ArchivedNight({
  nights,
  night,
  show,
  sample = false,
  isAdmin,
}: {
  nights: Night[];
  night: Night;
  show?: Show;
  sample?: boolean;
  isAdmin: boolean;
}) {
  // Photos: the show's uploads with per-photo credits (lightbox), plus a
  // Cloudinary folder gallery — both from the old show page.
  const [gallery, folderPhotos] = await Promise.all([
    show ? showPhotoGallery(show) : Promise.resolve({ photos: [] as GalleryPhoto[], credit: null as PhotoCredit | null }),
    night.media.photoFolder ? getPhotosFromFolder(night.media.photoFolder) : Promise.resolve([] as CloudinaryPhoto[]),
  ]);
  const hasGallery = gallery.photos.length > 0 || folderPhotos.length > 0;

  // Night-level media in the ink band. With a full gallery below, night-level
  // photos live there instead of a strip here.
  const nightPhotos = hasGallery ? [] : night.media.photos ?? [];
  const nightVideos = night.media.videos ?? [];
  const nightAudio = night.media.audio ?? [];
  const hasNightMedia = nightPhotos.length > 0 || nightVideos.length > 0 || nightAudio.length > 0;

  const open = openSetSlug(night);
  const { prev, next } = neighbours(nights, night.id);
  const counts = countLine(night, show ? gallery.photos.length + folderPhotos.length : photoCount(night));
  const adminHref = night.adminHref;

  return (
    <SiteFrame stats={archiveTotals(nights)} navPath="/archive">
      {isAdmin && adminHref && <AdminEditFAB href={adminHref} label={night.kind === 'sad' ? 'Edit Event' : 'Edit Show'} />}
      <OpenOnHash />
      <NightHeader
        id={night.id}
        tick={tickOf(night)}
        tag={seriesTag(night)}
        date={night.date}
        endDate={night.endDate}
        lineup={nightLineup(night)}
        back={{ href: sample ? '/archive?sample' : '/archive', label: 'ARCHIVE' }}
      />
      {counts && (
        <p className="text-data-caption-13-bold text-accent-red -mt-6 leading-[1.4] font-bold tracking-[--spacing(0.375)]">
          {counts}
        </p>
      )}

      {(night.sets.length > 0 || hasNightMedia) && (
        <NightBand label="The night">
          {night.sets.length > 0 && (
            <div className="flex flex-col">
              <SectionHeader label="Running order" count={night.sets.length} ground="ink" rule="none" className="pb-4" />
              {night.sets.map((set) => (
                <SetBlock
                  key={set.slug}
                  night={night}
                  set={set}
                  open={set.slug === open}
                  others={otherSets(nights, night, set)}
                  sample={sample}
                />
              ))}
            </div>
          )}

          {hasNightMedia && (
            <div className="border-line-ink flex flex-col gap-6 border-t pt-6">
              <SectionHeader label="From the whole night" ground="ink" rule="none" />
              {nightVideos.map((v, i) => (
                <VideoPlayer key={v.youtube ?? i} video={v} label={`${night.id}, full night`} />
              ))}
              {nightPhotos.length > 0 && <PhotoStrip photos={nightPhotos} label={night.id} />}
              {nightAudio.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {nightAudio.map((a, i) => (
                    <li key={`${a.bandcamp}-${i}`}>
                      <AudioLink audio={a} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </NightBand>
      )}

      {gallery.photos.length > 0 && (
        <section id="photos" className="flex scroll-mt-6 flex-col gap-4">
          <SectionHeader label="Photos" count={gallery.photos.length} />
          {gallery.credit && (
            <p className="text-body-3 leading-normal">
              Photos by{' '}
              {gallery.credit.href ? (
                <a href={gallery.credit.href} className="ui-hover:text-accent-red underline">
                  {gallery.credit.name}
                </a>
              ) : (
                gallery.credit.name
              )}
            </p>
          )}
          {/* Mixed photographers: per-photo credit shows in the lightbox. */}
          <PhotoGallery photos={gallery.photos} showTitle={show?.title ?? night.id} />
        </section>
      )}

      {folderPhotos.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader label="Gallery" count={folderPhotos.length} />
          {show?.photoCredit && <p className="text-body-3 leading-normal">Photos by {show.photoCredit}</p>}
          <CloudinaryGallery photos={folderPhotos} showTitle={show?.title ?? night.id} />
        </section>
      )}

      <NightCredits night={night} />
      {show && <NightNotes description={show.description} html={show.content} />}
      <PrevNext prev={prev} next={next} />
    </SiteFrame>
  );
}
