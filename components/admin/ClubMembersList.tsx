'use client';

import { useState } from 'react';
import type { ClubMember } from '@/lib/club-members';
import { ALL_ROLES, type ClubRole } from '@/lib/club-roles';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';

const STATUS_LABEL: Record<ClubMember['status'], string> = {
  invited: 'Invited',
  active: 'Active',
  disabled: 'Disabled',
};

const ROLE_LABEL: Record<ClubRole, string> = {
  song_club: 'Song Club',
  crew: 'Crew',
  staff: 'Staff (admin)',
  band: 'Yellow Ostrich',
};

// Invite + manage Song Club portal members. Inviting sends the set-password
// email immediately; "Resend invite" re-keys the link (also works as a manual
// password reset for a locked-out member).
export default function ClubMembersList({ initialMembers }: { initialMembers: ClubMember[] }) {
  const [members, setMembers] = useState<ClubMember[]>(initialMembers);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<ClubRole[]>(['song_club']);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function toggleInviteRole(role: ClubRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/song-club/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, roles: roles.length ? roles : ['song_club'] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Invite failed (${res.status})`);
      setMembers(data.members ?? []);
      setNotice(`Invite sent to ${email.trim()}.`);
      setName('');
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleRole(member: ClubMember, role: ClubRole) {
    const next = member.roles.includes(role)
      ? member.roles.filter((r) => r !== role)
      : [...member.roles, role];
    setRowBusy(member.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/song-club/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'roles', roles: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't update roles (${res.status})`);
      setMembers(data.members ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update roles");
    } finally {
      setRowBusy(null);
    }
  }

  async function rowAction(member: ClubMember, action: 'disable' | 'enable' | 'resend') {
    setRowBusy(member.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/song-club/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Action failed (${res.status})`);
      setMembers(data.members ?? []);
      if (action === 'resend') setNotice(`Invite re-sent to ${member.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setRowBusy(null);
    }
  }

  async function remove(member: ClubMember) {
    if (!confirm(`Remove ${member.name} (${member.email})? Their posts go with them.`)) return;
    setRowBusy(member.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/song-club/members/${member.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Delete failed (${res.status})`);
      setMembers(data.members ?? []);
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55">
            Access:
          </span>
          {ALL_ROLES.map((role) => (
            <label key={role} className="flex cursor-pointer items-center gap-1.5 text-sm text-[#E8E0D0]/80">
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggleInviteRole(role)}
                className="accent-[#c8a26a]"
              />
              {ROLE_LABEL[role]}
            </label>
          ))}
        </div>
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

      {members.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No members yet — send the first invite above.</p>
      ) : (
        <ul className="divide-y divide-[#E8E0D0]/10">
          {members.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-4 py-3">
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
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {ALL_ROLES.map((role) => (
                    <label
                      key={role}
                      className="flex cursor-pointer items-center gap-1 text-[11px] text-[#E8E0D0]/60"
                    >
                      <input
                        type="checkbox"
                        checked={m.roles.includes(role)}
                        disabled={rowBusy === m.id}
                        onChange={() => toggleRole(m, role)}
                        className="accent-[#c8a26a]"
                      />
                      {ROLE_LABEL[role]}
                    </label>
                  ))}
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
            </li>
          ))}
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
