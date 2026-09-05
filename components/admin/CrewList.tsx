'use client';

import { useState } from 'react';
import type { ClubMember } from '@/lib/club-members';
import { FOCUS_AREAS, type FocusAreaKey } from '@/lib/crew';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';

const STATUS_LABEL: Record<ClubMember['status'], string> = {
  invited: 'Invited',
  active: 'Active',
  disabled: 'Disabled',
};

// Invite + manage Birdhaus crew: people with a login and full admin access.
// The title is a free-text label; the focus-area checkboxes are what tailor
// each person's home dashboard.
export default function CrewList({ initialCrew }: { initialCrew: ClubMember[] }) {
  const [crew, setCrew] = useState<ClubMember[]>(initialCrew);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [focus, setFocus] = useState<FocusAreaKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Per-row title edits, keyed by member id, so typing doesn't fight the list.
  const [titleEdits, setTitleEdits] = useState<Record<number, string>>({});

  function toggleInviteFocus(key: FocusAreaKey) {
    setFocus((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/crew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, title, focusAreas: focus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Invite failed (${res.status})`);
      setCrew(data.crew ?? []);
      setNotice(`Invite sent to ${email.trim()}.`);
      setName('');
      setEmail('');
      setTitle('');
      setFocus([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setBusy(false);
    }
  }

  // Every profile save sends both title + focusAreas so a focus toggle can't
  // wipe the title and vice versa. `nextFocus`/`nextTitle` override the current
  // stored values for whichever field is changing.
  async function saveProfile(
    member: ClubMember,
    override: { title?: string; focusAreas?: FocusAreaKey[] }
  ) {
    const nextTitle = override.title ?? titleEdits[member.id] ?? member.title ?? '';
    const nextFocus = override.focusAreas ?? member.focus_areas;
    setRowBusy(member.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/crew/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'profile', title: nextTitle, focusAreas: nextFocus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't save (${res.status})`);
      setCrew(data.crew ?? []);
      setTitleEdits((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setRowBusy(null);
    }
  }

  function toggleFocus(member: ClubMember, key: FocusAreaKey) {
    const next = member.focus_areas.includes(key)
      ? member.focus_areas.filter((k) => k !== key)
      : [...member.focus_areas, key];
    saveProfile(member, { focusAreas: next });
  }

  async function rowAction(member: ClubMember, action: 'disable' | 'enable' | 'resend') {
    setRowBusy(member.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/crew/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Action failed (${res.status})`);
      setCrew(data.crew ?? []);
      if (action === 'resend') setNotice(`Invite re-sent to ${member.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setRowBusy(null);
    }
  }

  async function remove(member: ClubMember) {
    if (!confirm(`Remove ${member.name} (${member.email})? Their login is revoked.`)) return;
    setRowBusy(member.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/crew/${member.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Delete failed (${res.status})`);
      setCrew(data.crew ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={invite}
        className="space-y-3 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55">
              Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputBase}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputBase}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. VP of Sound Engineering"
            className={inputBase}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55">
            Focus areas
          </span>
          <div className="space-y-1.5">
            {FOCUS_AREAS.map((area) => (
              <label key={area.key} className="flex cursor-pointer items-start gap-2 text-sm text-[#E8E0D0]/80">
                <input
                  type="checkbox"
                  checked={focus.includes(area.key)}
                  onChange={() => toggleInviteFocus(area.key)}
                  className="mt-0.5 accent-[#c8a26a]"
                />
                <span>
                  {area.label}
                  <span className="block text-xs text-[#E8E0D0]/45">{area.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send crew invite'}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-[#7bb98a]/40 bg-[#7bb98a]/10 p-3 text-sm text-[#bfe6c8]">
          {notice}
        </div>
      )}

      {crew.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No crew yet — send the first invite above.</p>
      ) : (
        <ul className="divide-y divide-[#E8E0D0]/10">
          {crew.map((m) => {
            const editedTitle = titleEdits[m.id];
            const titleValue = editedTitle ?? m.title ?? '';
            const titleDirty = editedTitle !== undefined && editedTitle !== (m.title ?? '');
            return (
              <li key={m.id} className="space-y-2.5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{m.name}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                          m.status === 'active'
                            ? 'bg-[#7bb98a]/15 text-[#bfe6c8]'
                            : m.status === 'disabled'
                              ? 'bg-[#F5A3A3]/15 text-[#F5A3A3]'
                              : 'bg-[#E8E0D0]/10 text-[#E8E0D0]/60'
                        }`}
                      >
                        {STATUS_LABEL[m.status]}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[#E8E0D0]/50">
                      {m.email}
                      {m.last_seen_at ? ` · last seen ${formatDate(m.last_seen_at)}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    {m.status !== 'disabled' && (
                      <button
                        type="button"
                        disabled={rowBusy === m.id}
                        onClick={() => rowAction(m, 'resend')}
                        className="text-[#E8E0D0]/70 transition hover:text-[#E8E0D0] disabled:opacity-50"
                      >
                        {m.status === 'invited' ? 'Resend invite' : 'Send reset link'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={rowBusy === m.id}
                      onClick={() => rowAction(m, m.status === 'disabled' ? 'enable' : 'disable')}
                      className="text-[#E8E0D0]/70 transition hover:text-[#E8E0D0] disabled:opacity-50"
                    >
                      {m.status === 'disabled' ? 'Enable' : 'Disable'}
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy === m.id}
                      onClick={() => remove(m)}
                      className="text-[#F5A3A3]/80 transition hover:text-[#F5A3A3] disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={titleValue}
                    placeholder="Title (e.g. VP of Sound Engineering)"
                    disabled={rowBusy === m.id}
                    onChange={(e) =>
                      setTitleEdits((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                    className={`${inputBase} max-w-sm`}
                  />
                  {titleDirty && (
                    <button
                      type="button"
                      disabled={rowBusy === m.id}
                      onClick={() => saveProfile(m, { title: titleValue })}
                      className="shrink-0 rounded-md border border-[#E8E0D0]/30 px-3 py-1.5 text-xs text-[#E8E0D0]/80 transition hover:border-[#E8E0D0]/60 hover:text-[#E8E0D0] disabled:opacity-50"
                    >
                      Save title
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {FOCUS_AREAS.map((area) => (
                    <label
                      key={area.key}
                      className="flex cursor-pointer items-center gap-1.5 text-[13px] text-[#E8E0D0]/70"
                    >
                      <input
                        type="checkbox"
                        checked={m.focus_areas.includes(area.key)}
                        disabled={rowBusy === m.id}
                        onChange={() => toggleFocus(m, area.key)}
                        className="accent-[#c8a26a]"
                      />
                      {area.label}
                    </label>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
