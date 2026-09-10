'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SoundEngineerNameInput, { type SoundEngineerMatch } from './SoundEngineerNameInput';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';
const buttonClass =
  'border border-[#E8E0D0]/40 rounded px-3 py-1.5 text-xs hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40';

export interface CrewBand {
  bandId: number;
  name: string;
  email: string | null;
  payoutHandle: string | null;
  photo: string | null;
  excluded: boolean;
}

export interface CrewEngineer {
  id: number;
  name: string;
  status: 'confirmed' | 'asked' | 'declined';
  email: string | null;
  payoutHandle: string | null;
  photo: string | null;
}

export interface CrewRegistryEntry {
  id: number;
  name: string;
  email: string | null;
  payoutHandle: string | null;
  photo: string | null;
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E8E0D0]/10 text-sm font-semibold text-[#E8E0D0]/50">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.02] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-[0.12em] text-[#c8a26a] font-semibold">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-[#E8E0D0]/40">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// A person's contact + payout, saved to their own profile (bands / sound_engineers
// / door_persons / photographers) via the given PATCH endpoint. Only changed
// fields are sent, so an untouched blank never clears the other value. Self-contained:
// shows its own inline "Saved ✓" / error next to the row, and advances its saved
// baseline in state so the confirmation isn't wiped by a re-render.
function ContactRow({
  name,
  photo,
  endpoint,
  email: initialEmail,
  payout: initialPayout,
  badge,
  onRemove,
}: {
  name: string;
  photo: string | null;
  endpoint: string;
  email: string | null;
  payout: string | null;
  badge?: React.ReactNode;
  // When provided, renders a Remove control (used for the engineer roster).
  onRemove?: () => void;
}) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [payout, setPayout] = useState(initialPayout ?? '');
  // The saved baseline lives in state (not props) so a successful save can advance
  // it without a remount — that keeps the inline "Saved ✓" visible instead of
  // being wiped by a re-render.
  const [baseEmail, setBaseEmail] = useState(initialEmail ?? '');
  const [basePayout, setBasePayout] = useState(initialPayout ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailDirty = email.trim() !== baseEmail;
  const payoutDirty = payout.trim() !== basePayout;
  const dirty = emailDirty || payoutDirty;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload: { contactEmail?: string; paymentMethod?: string } = {};
      if (emailDirty) payload.contactEmail = email;
      if (payoutDirty) payload.paymentMethod = payout;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `Save failed (${res.status})`);
      }
      const trimmedEmail = email.trim();
      const trimmedPayout = payout.trim();
      setEmail(trimmedEmail);
      setPayout(trimmedPayout);
      setBaseEmail(trimmedEmail);
      setBasePayout(trimmedPayout);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-lg bg-black/10 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={name} photo={photo} />
        <div className="min-w-[8rem] flex-1 basis-40">
          <span className="text-sm text-[#E8E0D0]">{name}</span>
          {badge && <span className="ml-2 align-middle">{badge}</span>}
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contact email"
          className={`${inputClass} min-w-[13rem] flex-1`}
          aria-label={`${name} contact email`}
        />
        <input
          value={payout}
          onChange={(e) => setPayout(e.target.value)}
          placeholder="Payout handle (Venmo)"
          className={`${inputClass} min-w-[11rem] flex-1`}
          aria-label={`${name} payout handle`}
        />
        {saved && <span className="text-xs text-emerald-300 whitespace-nowrap">Saved ✓</span>}
        <button type="button" onClick={save} disabled={saving || !dirty} className={buttonClass}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-red-400/70 hover:text-red-400 px-1"
            aria-label={`Remove ${name}`}
          >
            Remove
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
    </li>
  );
}

const ENGINEER_STATUSES: CrewEngineer['status'][] = ['asked', 'confirmed', 'declined'];

// Live roster + status editor for a show's sound engineers, replacing the old
// section on the Details form. Status/remove save optimistically; adding an
// engineer refreshes so the new row hydrates (photo + any saved contact info).
// The whole set is PUT on every change (the shows route replaces it wholesale and
// keeps shows.sound_engineer_name — the confirmed engineer — in sync).
function CrewEngineers({
  showId,
  engineers: propEngineers,
}: {
  showId: number;
  engineers: CrewEngineer[];
}) {
  const router = useRouter();
  const [engineers, setEngineers] = useState<CrewEngineer[]>(propEngineers);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the server whenever its list changes (e.g. after an add's refresh
  // brings the new engineer in fully hydrated). Status/remove don't refresh, so
  // this doesn't clobber their optimistic edits.
  const propKey = propEngineers.map((e) => `${e.id}:${e.status}`).join('|');
  useEffect(() => {
    setEngineers(propEngineers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propKey]);

  function toPayload(list: Array<{ id: number | null; name: string; status: CrewEngineer['status'] }>) {
    return list.map((e) => ({ soundEngineerId: e.id, name: e.name, status: e.status }));
  }

  async function put(
    payload: Array<{ id: number | null; name: string; status: CrewEngineer['status'] }>,
    optimistic: CrewEngineer[] | null,
    refresh: boolean
  ) {
    const prev = engineers;
    if (optimistic) setEngineers(optimistic);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shows/${showId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soundEngineers: toPayload(payload) }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      if (refresh) router.refresh();
    } catch (e) {
      if (optimistic) setEngineers(prev);
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function changeStatus(id: number, status: CrewEngineer['status']) {
    // Only one confirmed engineer per show — promoting one demotes any other.
    const next = engineers.map((e) =>
      e.id === id
        ? { ...e, status }
        : status === 'confirmed' && e.status === 'confirmed'
          ? { ...e, status: 'asked' as const }
          : e
    );
    put(next, next, false);
  }

  function removeEngineer(id: number) {
    const next = engineers.filter((e) => e.id !== id);
    put(next, next, false);
  }

  // Add an engineer — an existing one (id from the typeahead) or a brand-new name
  // (id null; the shows route resolves/creates it). Refreshes so the new row
  // hydrates from the server.
  function addEngineer(entry: { id: number | null; name: string }) {
    const name = entry.name.trim();
    if (!name) return;
    setDraftName('');
    if (
      (entry.id != null && engineers.some((e) => e.id === entry.id)) ||
      engineers.some((e) => e.name.trim().toLowerCase() === name.toLowerCase())
    ) {
      return;
    }
    const payload = [
      ...engineers.map((e) => ({ id: e.id as number | null, name: e.name, status: e.status })),
      { id: entry.id, name, status: 'asked' as const },
    ];
    put(payload, null, true);
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-red-300">{error}</p>
      )}
      {engineers.length > 0 ? (
        <ul className="space-y-2">
          {engineers.map((e) => (
            <ContactRow
              key={e.id}
              name={e.name}
              photo={e.photo}
              endpoint={`/api/admin/sound-engineers/${e.id}`}
              email={e.email}
              payout={e.payoutHandle}
              badge={
                <select
                  value={e.status}
                  onChange={(ev) => changeStatus(e.id, ev.target.value as CrewEngineer['status'])}
                  disabled={saving}
                  aria-label={`${e.name} status`}
                  className={`${inputClass} py-0.5 text-xs capitalize disabled:opacity-50`}
                >
                  {ENGINEER_STATUSES.map((s) => (
                    <option key={s} value={s} className="text-[#2A2420] capitalize">
                      {s}
                    </option>
                  ))}
                </select>
              }
              onRemove={() => removeEngineer(e.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#E8E0D0]/40">
          No sound engineers yet — add whoever you&apos;ve reached out to and mark one confirmed.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <SoundEngineerNameInput
          value={draftName}
          onChange={setDraftName}
          onSelect={(m: SoundEngineerMatch) => addEngineer({ id: m.id, name: m.name })}
          placeholder="Add an engineer — pick or type a new name…"
          className={`${inputClass} w-full sm:max-w-sm`}
        />
        <button
          type="button"
          onClick={() => addEngineer({ id: null, name: draftName })}
          disabled={saving || !draftName.trim()}
          className={buttonClass}
        >
          + Add
        </button>
        {saving && <span className="text-xs text-[#E8E0D0]/50">Saving…</span>}
      </div>
    </div>
  );
}

export default function ShowCrewPanel({
  showId,
  bands,
  engineers,
  doorPersons,
  assignedDoorName,
  photographers,
  assignedPhotographerId,
}: {
  showId: number;
  bands: CrewBand[];
  engineers: CrewEngineer[];
  doorPersons: CrewRegistryEntry[];
  assignedDoorName: string;
  photographers: CrewRegistryEntry[];
  assignedPhotographerId: number | null;
}) {
  const router = useRouter();

  // --- Door person assignment (free text on the show; matched to a roster row) ---
  const [doorName, setDoorName] = useState(assignedDoorName);
  const [savingDoor, setSavingDoor] = useState(false);
  const [doorSaved, setDoorSaved] = useState(false);
  const [doorError, setDoorError] = useState<string | null>(null);
  const doorMatch = doorPersons.find(
    (d) => d.name.trim().toLowerCase() === doorName.trim().toLowerCase()
  );

  async function assignDoor(name: string) {
    setDoorName(name);
    setSavingDoor(true);
    setDoorError(null);
    setDoorSaved(false);
    try {
      const res = await fetch(`/api/admin/shows/${showId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doorPersonName: name }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setDoorSaved(true);
      setTimeout(() => setDoorSaved(false), 2000);
      // Refresh so the matched roster row's contact fields load below.
      router.refresh();
    } catch (e) {
      setDoorError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingDoor(false);
    }
  }

  // --- Photographer assignment (shows.photographer_id) ---
  const [savingPhotographer, setSavingPhotographer] = useState(false);
  const [photographerSaved, setPhotographerSaved] = useState(false);
  const [photographerError, setPhotographerError] = useState<string | null>(null);
  const assignedPhotographer =
    photographers.find((p) => p.id === assignedPhotographerId) ?? null;

  async function assignPhotographer(id: number | null) {
    setSavingPhotographer(true);
    setPhotographerError(null);
    setPhotographerSaved(false);
    try {
      const res = await fetch(`/api/admin/shows/${showId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // The route treats a non-number as "clear the assignment".
        body: JSON.stringify({ assignedPhotographerId: id ?? null }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setPhotographerSaved(true);
      setTimeout(() => setPhotographerSaved(false), 2000);
      // Refresh so the assigned photographer's contact fields load below.
      router.refresh();
    } catch (e) {
      setPhotographerError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingPhotographer(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#E8E0D0]/50 max-w-2xl">
        Everyone you contact or pay for this show. Email and payout handle save to each
        person&apos;s profile — the same values used on the settlement and every future show.
        Each row saves on its own.
      </p>

      <Section title="Bands" subtitle="Lineup for this show. Saves to the band profile.">
        {bands.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/40">No bands on this show yet — add them on Details.</p>
        ) : (
          <ul className="space-y-2">
            {bands.map((b) => (
              <ContactRow
                key={b.bandId}
                name={b.name}
                photo={b.photo}
                endpoint={`/api/admin/bands/${b.bandId}`}
                email={b.email}
                payout={b.payoutHandle}
                badge={
                  b.excluded ? (
                    <span className="rounded-full border border-[#E8E0D0]/25 px-1.5 text-[10px] text-[#E8E0D0]/45">
                      excluded from payout
                    </span>
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Sound engineers"
        subtitle="Everyone you've asked, and who's confirmed. At most one can be confirmed — picking a new one steps the others back to asked."
        action={
          <Link href="/admin/crew" className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline">
            Manage roster →
          </Link>
        }
      >
        <CrewEngineers showId={showId} engineers={engineers} />
      </Section>

      <Section
        title="Door person"
        subtitle="Working the door. Assignment saves to this show; pre-fills the settlement payee."
        action={
          <Link href="/admin/crew" className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline">
            Manage roster →
          </Link>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={doorMatch ? doorMatch.name : doorName}
              onChange={(e) => assignDoor(e.target.value)}
              disabled={savingDoor}
              className={`${inputClass} w-full sm:max-w-sm disabled:opacity-50`}
              aria-label="Assign door person"
            >
              <option value="" className="text-[#2A2420]">Unassigned</option>
              {doorName && !doorMatch && (
                <option value={doorName} className="text-[#2A2420]">{doorName}</option>
              )}
              {doorPersons.map((d) => (
                <option key={d.id} value={d.name} className="text-[#2A2420]">
                  {d.name}
                </option>
              ))}
            </select>
            {savingDoor && <span className="text-xs text-[#E8E0D0]/50">Saving…</span>}
            {doorSaved && <span className="text-xs text-emerald-300">Saved ✓</span>}
            {doorError && <span className="text-xs text-red-300">{doorError}</span>}
          </div>
          {doorMatch ? (
            <ul>
              <ContactRow
                key={doorMatch.id}
                name={doorMatch.name}
                photo={doorMatch.photo}
                endpoint={`/api/admin/door-persons/${doorMatch.id}`}
                email={doorMatch.email}
                payout={doorMatch.payoutHandle}
              />
            </ul>
          ) : doorName ? (
            <p className="text-xs text-[#E8E0D0]/40">
              &ldquo;{doorName}&rdquo; isn&apos;t in the roster, so there&apos;s no profile to hold their
              contact info. Add them under{' '}
              <Link href="/admin/crew" className="underline hover:text-[#E8E0D0]">
                Crew → Door people
              </Link>
              .
            </p>
          ) : null}
        </div>
      </Section>

      <Section
        title="Photographer"
        subtitle="Booked to shoot this show — shows up in their crew Queue. Assignment saves to this show."
        action={
          <Link href="/admin/crew" className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline">
            Manage roster →
          </Link>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={assignedPhotographerId ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                assignPhotographer(v === '' ? null : Number(v));
              }}
              disabled={savingPhotographer}
              className={`${inputClass} w-full sm:max-w-sm disabled:opacity-50`}
              aria-label="Assign photographer"
            >
              <option value="" className="text-[#2A2420]">Unassigned</option>
              {photographers.map((p) => (
                <option key={p.id} value={p.id} className="text-[#2A2420]">
                  {p.name}
                </option>
              ))}
            </select>
            {savingPhotographer && <span className="text-xs text-[#E8E0D0]/50">Saving…</span>}
            {photographerSaved && <span className="text-xs text-emerald-300">Saved ✓</span>}
            {photographerError && <span className="text-xs text-red-300">{photographerError}</span>}
          </div>
          {assignedPhotographer && (
            <ul>
              <ContactRow
                key={assignedPhotographer.id}
                name={assignedPhotographer.name}
                photo={assignedPhotographer.photo}
                endpoint={`/api/admin/photographers/${assignedPhotographer.id}`}
                email={assignedPhotographer.email}
                payout={assignedPhotographer.payoutHandle}
              />
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}
