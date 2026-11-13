'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface LeadRow {
  id: number;
  name: string;
  project: string;
  email: string;
  phone: string;
  people: number | null;
  frequency: string;
  preferredTimes: string;
  genreLinks: string;
  notes: string;
  status: 'new' | 'invited' | 'archived';
  bandId: number | null;
  created: string;
}

const tag = 'rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide';

export default function RehearsalLeads({ leads }: { leads: LeadRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ id: number; ok: boolean; text: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  async function act(id: number, action: 'invite' | 'archive' | 'restore') {
    if (action === 'invite' && !confirm('Create the band and email them their booking link?')) return;
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/rehearsal/leads/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) setMsg({ id, ok: false, text: d?.error ?? `Failed (${res.status})` });
      else if (action === 'invite')
        setMsg({ id, ok: d.emailed, text: d.emailed ? 'Invited — link emailed.' : 'Band made, but the email didn’t send. Use Email booking link on the band page.' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const visible = leads.filter((l) => showArchived || l.status !== 'archived');
  const archived = leads.filter((l) => l.status === 'archived').length;

  return (
    <div className="space-y-4">
      {visible.length === 0 && <p className="text-sm text-[#E8E0D0]/50">No leads yet.</p>}
      <ul className="space-y-3">
        {visible.map((l) => (
          <li key={l.id} className={`space-y-2 rounded-lg border border-[#E8E0D0]/15 p-4 text-sm ${l.status === 'archived' ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-semibold">{l.project || l.name}</span>
              {l.project && <span className="text-[#E8E0D0]/60">{l.name}</span>}
              <span className="text-[#E8E0D0]/40">{l.created}</span>
              <span
                className={`${tag} ${
                  l.status === 'new' ? 'bg-amber-400/15 text-amber-200' : l.status === 'invited' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-[#E8E0D0]/10 text-[#E8E0D0]/60'
                }`}
              >
                {l.status}
              </span>
              <span className="ml-auto flex items-center gap-3">
                {l.status === 'invited' && l.bandId ? (
                  <Link href={`/admin/rehearsal/bands/${l.bandId}`} className="text-xs underline text-[#E8E0D0]/70 hover:text-[#E8E0D0]">
                    Band page
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act(l.id, 'invite')}
                    className="rounded border border-[#E8E0D0] bg-[#E8E0D0] px-3 py-1 text-xs text-[#2A2420] hover:bg-[#E8E0D0]/90 disabled:opacity-40"
                  >
                    {busy === l.id ? 'Inviting…' : 'Invite'}
                  </button>
                )}
                {l.status === 'new' && (
                  <button type="button" disabled={busy !== null} onClick={() => act(l.id, 'archive')} className="text-xs text-[#E8E0D0]/60 underline">
                    Archive
                  </button>
                )}
                {l.status === 'archived' && (
                  <button type="button" disabled={busy !== null} onClick={() => act(l.id, 'restore')} className="text-xs text-[#E8E0D0]/60 underline">
                    Restore
                  </button>
                )}
              </span>
            </div>
            <p className="text-[#E8E0D0]/70">
              <a href={`mailto:${l.email}`} className="underline">{l.email}</a>
              {l.phone ? ` · ${l.phone}` : ''}
              {l.people ? ` · ${l.people} people` : ''} · {l.frequency}
            </p>
            {l.preferredTimes && <p><span className="text-[#E8E0D0]/50">Prefers:</span> {l.preferredTimes}</p>}
            {l.genreLinks && <p className="break-words"><span className="text-[#E8E0D0]/50">Genre / links:</span> {l.genreLinks}</p>}
            {l.notes && <p className="whitespace-pre-line"><span className="text-[#E8E0D0]/50">Notes:</span> {l.notes}</p>}
            {msg?.id === l.id && <p className={msg.ok ? 'text-emerald-300' : 'text-red-300'}>{msg.text}</p>}
          </li>
        ))}
      </ul>
      {archived > 0 && (
        <button type="button" onClick={() => setShowArchived(!showArchived)} className="text-xs text-[#E8E0D0]/60 underline">
          {showArchived ? 'Hide archived' : `Show archived (${archived})`}
        </button>
      )}
    </div>
  );
}
