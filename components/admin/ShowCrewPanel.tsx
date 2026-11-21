'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SoundEngineerNameInput, { type SoundEngineerMatch } from './SoundEngineerNameInput';
import { ADMIN_TYPE, FIELD_INLINE, buttonClassName } from './ui';

const inputClass = FIELD_INLINE;
const buttonClass = `${buttonClassName('secondary', 's')} disabled:opacity-40`;

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
    return <img src={photo} alt="" className="h-10 w-10 shrink-0 object-cover" />;
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-surface-paper text-body-3 font-bold text-surface-ink/60">
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
    <section className="border-surface-ink bg-surface-paper space-y-4 border p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={ADMIN_TYPE.overline}>{title}</h2>
          {subtitle && <p className={`mt-1 ${ADMIN_TYPE.meta}`}>{subtitle}</p>}
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
    <li className="bg-surface-paper-shade p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={name} photo={photo} />
        <div className="min-w-[8rem] flex-1 basis-40">
          <span className="text-body-3 font-bold">{name}</span>
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
        {saved && <span className="text-data-caption-13 text-surface-ink whitespace-nowrap">Saved ✓</span>}
        <button type="button" onClick={save} disabled={saving || !dirty} className={buttonClass}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-body-3 text-accent-red cursor-pointer underline-offset-4 hover:underline px-1"
            aria-label={`Remove ${name}`}
          >
            Remove
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-data-caption-13 text-accent-red">{error}</p>}
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
        <p className="text-data-caption-13 text-accent-red">{error}</p>
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
                  className={`${inputClass} capitalize disabled:opacity-50`}
                >
                  {ENGINEER_STATUSES.map((s) => (
                    <option key={s} value={s} className="capitalize">
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
        <p className="text-body-3 text-surface-ink/60">
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
        {saving && <span className="text-data-caption-13 text-surface-ink/60">Saving…</span>}
      </div>
    </div>
  );
}

// "Needs a sound engineer" (119): saves on click. Turning it on puts the show in
// the sound queue and emails whoever books sound (the shows route does that).
function NeedsEngineerToggle({ showId, initial }: { showId: number; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setOn(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shows/${showId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ needsSoundEngineer: next }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setOn(!next);
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 border-b border-surface-ink/20 pb-4">
      <label className="flex items-center gap-2 text-body-3">
        <input type="checkbox" checked={on} disabled={saving} onChange={(e) => toggle(e.target.checked)} />
        Needs a sound engineer
        {error && <span className="text-data-caption-13 text-accent-red">{error}</span>}
      </label>
      <p className="text-data-caption-13 text-surface-ink/60 mt-1 max-w-prose">
        Puts this show in the sound engineer queue and emails whoever books sound. Leave it off for
        nights you&apos;re running sound yourself.
      </p>
    </div>
  );
}

export default function ShowCrewPanel({
  showId,
  needsSoundEngineer,
  engineers,
  doorPersons,
  assignedDoorName,
  photographers,
  assignedPhotographerId,
}: {
  showId: number;
  needsSoundEngineer: boolean;
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
      <Section
        title="Sound engineers"
        subtitle="Everyone you've asked, and who's confirmed. At most one can be confirmed — picking a new one steps the others back to asked."
        action={
          <Link href="/admin/crew" className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline underline-offset-4">
            Manage roster →
          </Link>
        }
      >
        <NeedsEngineerToggle showId={showId} initial={needsSoundEngineer} />
        <CrewEngineers showId={showId} engineers={engineers} />
      </Section>

      <Section
        title="Door person"
        subtitle="Working the door. Assignment saves to this show; pre-fills the settlement payee."
        action={
          <Link href="/admin/crew" className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline underline-offset-4">
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
              <option value="">Unassigned</option>
              {doorName && !doorMatch && (
                <option value={doorName}>{doorName}</option>
              )}
              {doorPersons.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
            {savingDoor && <span className="text-data-caption-13 text-surface-ink/60">Saving…</span>}
            {doorSaved && <span className="text-data-caption-13 text-surface-ink">Saved ✓</span>}
            {doorError && <span className="text-data-caption-13 text-accent-red">{doorError}</span>}
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
            <p className="text-data-caption-13 text-surface-ink/60">
              &ldquo;{doorName}&rdquo; isn&apos;t in the roster, so there&apos;s no profile to hold their
              contact info. Add them under{' '}
              <Link href="/admin/crew" className="underline hover:text-accent-red">
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
          <Link href="/admin/crew" className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline underline-offset-4">
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
              <option value="">Unassigned</option>
              {photographers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {savingPhotographer && <span className="text-data-caption-13 text-surface-ink/60">Saving…</span>}
            {photographerSaved && <span className="text-data-caption-13 text-surface-ink">Saved ✓</span>}
            {photographerError && <span className="text-data-caption-13 text-accent-red">{photographerError}</span>}
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
