'use client';

import { useState, type FormEvent } from 'react';
import type { Rsvp, RsvpSummary as RsvpSummaryData } from '@/lib/rsvps';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

function formatSubmittedAt(createdAt: string): string {
  return new Date(createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  });
}

interface EditForm {
  name: string;
  email: string;
  guests: string;
  emailListOptIn: boolean;
}

export default function RsvpSummary({
  showId,
  showTitle,
  showDate,
  doorToken = null,
  rsvps: initialRsvps,
  purchasesByEmail = {},
  unmatchedBuyers = [],
}: {
  showId: number;
  showTitle: string;
  showDate: string;
  doorToken?: string | null;
  purchasesByEmail?: Record<string, { totalCents: number; count: number; quantity: number }>;
  unmatchedBuyers?: { email: string; amountCents: number; quantity: number; purchasedAt: string }[];
} & RsvpSummaryData) {
  const [copiedDoorLink, setCopiedDoorLink] = useState(false);

  async function copyDoorLink() {
    if (!doorToken) return;
    const url = `${window.location.origin}/door/${doorToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedDoorLink(true);
      setTimeout(() => setCopiedDoorLink(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — fall back to opening it.
      window.open(url, '_blank');
    }
  }
  const [rsvps, setRsvps] = useState<Rsvp[]>(initialRsvps);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [guests, setGuests] = useState('1');
  const [emailListOptIn, setEmailListOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [composing, setComposing] = useState(false);
  const [audience, setAudience] = useState<'all' | 'not-bought'>('all');
  const [blastSubject, setBlastSubject] = useState('');
  const [blastMessage, setBlastMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [blastResult, setBlastResult] = useState<{
    sent: number;
    failed: { email: string; error: string }[];
    recipientCount: number;
    invalid: string[];
    audience: 'all' | 'not-bought';
  } | null>(null);

  // Matched purchases and unmatched buyers live in state so the "match to RSVP" /
  // "add as RSVP" actions can move a buyer between the two without a reload.
  const [purchases, setPurchases] = useState(purchasesByEmail);
  const [unmatched, setUnmatched] = useState(unmatchedBuyers);
  const [buyerAction, setBuyerAction] = useState<{ email: string; mode: 'match' | 'add' } | null>(null);
  const [matchRsvpId, setMatchRsvpId] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerBusy, setBuyerBusy] = useState(false);

  const totalCount = rsvps.length;
  const totalGuests = rsvps.reduce((sum, r) => sum + r.guests, 0);
  const arrivedCount = rsvps.filter((r) => r.arrived).length;
  const paidCount = rsvps.filter((r) => r.paid).length;
  const uniqueEmails = new Set(
    rsvps.map((r) => r.email.trim().toLowerCase()).filter(Boolean)
  );
  const uniqueEmailCount = uniqueEmails.size;
  // purchases is keyed by lowercased RSVP email and only contains matched RSVPs.
  const notBoughtCount = [...uniqueEmails].filter((e) => !purchases[e]).length;
  const audienceCount = audience === 'not-bought' ? notBoughtCount : uniqueEmailCount;
  const boughtCount = Object.keys(purchases).length;
  const ticketCount =
    Object.values(purchases).reduce((sum, p) => sum + p.quantity, 0) +
    unmatched.reduce((sum, b) => sum + b.quantity, 0);
  const revenueCents =
    Object.values(purchases).reduce((sum, p) => sum + p.totalCents, 0) +
    unmatched.reduce((sum, b) => sum + b.amountCents, 0);
  const hasPurchases = boughtCount > 0 || unmatched.length > 0;

  // One row per buyer email (a buyer can have several separate purchases).
  const unmatchedGroups: {
    email: string;
    totalCents: number;
    quantity: number;
    count: number;
    latest: string;
  }[] = [];
  for (const b of unmatched) {
    const group = unmatchedGroups.find((g) => g.email.toLowerCase() === b.email.toLowerCase());
    if (group) {
      group.totalCents += b.amountCents;
      group.quantity += b.quantity;
      group.count += 1;
      if (b.purchasedAt > group.latest) group.latest = b.purchasedAt;
    } else {
      unmatchedGroups.push({
        email: b.email,
        totalCents: b.amountCents,
        quantity: b.quantity,
        count: 1,
        latest: b.purchasedAt,
      });
    }
  }

  // Move a just-matched buyer's purchases under the given RSVP email.
  function creditBuyer(group: (typeof unmatchedGroups)[number], rsvpEmail: string) {
    const key = rsvpEmail.trim().toLowerCase();
    setPurchases((prev) => {
      const cur = prev[key] ?? { totalCents: 0, count: 0, quantity: 0 };
      return {
        ...prev,
        [key]: {
          totalCents: cur.totalCents + group.totalCents,
          count: cur.count + group.count,
          quantity: cur.quantity + group.quantity,
        },
      };
    });
    setUnmatched((prev) => prev.filter((b) => b.email.toLowerCase() !== group.email.toLowerCase()));
    setBuyerAction(null);
    setMatchRsvpId('');
    setBuyerName('');
  }

  async function handleMatchBuyer(group: (typeof unmatchedGroups)[number]) {
    const id = Number(matchRsvpId);
    if (!id) {
      setError('Pick an RSVP to match this buyer with.');
      return;
    }
    setError(null);
    setBuyerBusy(true);
    try {
      const res = await fetch(`/api/admin/rsvps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerEmail: group.email }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to match buyer');
      const updated = body as Rsvp;
      setRsvps((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      creditBuyer(group, updated.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to match buyer');
    } finally {
      setBuyerBusy(false);
    }
  }

  async function handleAddBuyerAsRsvp(group: (typeof unmatchedGroups)[number]) {
    if (!buyerName.trim()) {
      setError('Enter a name for this buyer.');
      return;
    }
    setError(null);
    setBuyerBusy(true);
    try {
      const res = await fetch(`/api/admin/shows/${showId}/rsvps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: buyerName,
          email: group.email,
          guests: group.quantity,
          emailListOptIn: false,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to add RSVP');
      setRsvps((prev) => [body as Rsvp, ...prev]);
      creditBuyer(group, (body as Rsvp).email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add RSVP');
    } finally {
      setBuyerBusy(false);
    }
  }

  function handlePrint() {
    const sorted = [...rsvps].sort((a, b) =>
      a.name.localeCompare(b.name, 'en-US', { sensitivity: 'base' })
    );
    const prettyDate = showDate
      ? new Date(`${showDate}T00:00:00`).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

    const esc = (s: string) =>
      s.replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
      );

    const rows = sorted
      .map(
        (r) => `<tr>
          <td class="check"></td>
          <td class="name">${esc(r.name)}</td>
          <td class="guests">${r.guests}</td>
          <td class="email">${esc(r.email)}</td>
        </tr>`
      )
      .join('');

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Door list — ${esc(showTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { font-size: 13px; color: #555; margin: 0 0 16px; }
  .totals { font-size: 12px; color: #555; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; border-bottom: 2px solid #111; padding: 4px 6px; }
  td { padding: 8px 6px; border-bottom: 1px solid #ccc; font-size: 14px; vertical-align: middle; }
  td.check { width: 24px; }
  td.check::before { content: ""; display: inline-block; width: 16px; height: 16px; border: 1.5px solid #111; border-radius: 3px; }
  td.name { font-weight: 600; white-space: nowrap; }
  td.guests { width: 60px; text-align: center; }
  td.email { color: #555; font-size: 12px; }
  th.guests { text-align: center; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>${esc(showTitle)}</h1>
  ${prettyDate ? `<p class="sub">${esc(prettyDate)}</p>` : ''}
  <p class="totals">${totalCount} RSVP${totalCount === 1 ? '' : 's'} · ${totalGuests} guest${totalGuests === 1 ? '' : 's'}</p>
  <table>
    <thead>
      <tr><th></th><th>Name</th><th class="guests">Guests</th><th>Email</th></tr>
    </thead>
    <tbody>${rows || '<tr><td></td><td colspan="3">No RSVPs yet.</td></tr>'}</tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      setError('Could not open the print window — allow pop-ups and try again.');
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  function openCompose(which: 'all' | 'not-bought') {
    setAudience(which);
    setComposing(true);
    setBlastResult(null);
    setError(null);
  }

  async function handleSendBlast(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBlastResult(null);

    if (!blastSubject.trim() || !blastMessage.trim()) {
      setError('Subject and message are required');
      return;
    }
    if (audienceCount === 0) {
      setError('No recipients match this audience.');
      return;
    }

    const label =
      audience === 'not-bought'
        ? `${audienceCount} RSVP${audienceCount === 1 ? '' : 's'} who haven't bought a ticket`
        : `all ${audienceCount} RSVP${audienceCount === 1 ? '' : 's'}`;
    if (!confirm(`Send this email to ${label}? This cannot be undone.`)) return;

    setSending(true);
    try {
      const res = await fetch(`/api/admin/shows/${showId}/email-rsvps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: blastSubject, message: blastMessage, audience }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to send');
      setBlastResult(body);
      if ((body?.failed?.length ?? 0) === 0) {
        setComposing(false);
        setBlastSubject('');
        setBlastMessage('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/shows/${showId}/rsvps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          guests: Number.parseInt(guests, 10) || 1,
          emailListOptIn,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to add RSVP');
      setRsvps((prev) => [body as Rsvp, ...prev]);
      setName('');
      setEmail('');
      setGuests('1');
      setEmailListOptIn(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add RSVP');
    } finally {
      setSubmitting(false);
    }
  }

  // Optimistically flip a door-list flag (arrived / paid), rolling back on failure.
  async function toggleFlag(id: number, field: 'arrived' | 'paid', value: boolean) {
    const previous = rsvps;
    setRsvps((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    try {
      const res = await fetch(`/api/admin/rsvps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error();
      const updated = (await res.json().catch(() => null)) as Rsvp | null;
      if (updated) setRsvps((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch {
      setRsvps(previous);
      setError('Failed to update — try again.');
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this RSVP?')) return;
    const previous = rsvps;
    setRsvps((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/admin/rsvps/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setRsvps(previous);
      setError('Failed to remove — try again.');
    }
  }

  function startEdit(rsvp: Rsvp) {
    setError(null);
    setEditingId(rsvp.id);
    setEditForm({
      name: rsvp.name,
      email: rsvp.email,
      guests: String(rsvp.guests),
      emailListOptIn: rsvp.email_list_opt_in,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function saveEdit(id: number) {
    if (!editForm) return;
    setError(null);
    if (!editForm.name.trim() || !editForm.email.trim()) {
      setError('Name and email are required');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/rsvps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          guests: Number.parseInt(editForm.guests, 10) || 1,
          emailListOptIn: editForm.emailListOptIn,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to save RSVP');
      setRsvps((prev) => prev.map((r) => (r.id === id ? (body as Rsvp) : r)));
      setEditingId(null);
      setEditForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save RSVP');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#E8E0D0]/80">RSVPs</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#E8E0D0]/50">
            {totalCount} RSVP{totalCount === 1 ? '' : 's'} · {totalGuests} guest{totalGuests === 1 ? '' : 's'}
            {arrivedCount > 0 && (
              <> · <span className="text-sky-300/80">{arrivedCount} arrived</span></>
            )}
            {paidCount > 0 && (
              <> · <span className="text-green-300/80">{paidCount} paid</span></>
            )}
            {hasPurchases && (
              <>
                {' '}·{' '}
                <span className="text-amber-300/80">
                  {boughtCount} buyer{boughtCount === 1 ? '' : 's'} · {ticketCount} ticket
                  {ticketCount === 1 ? '' : 's'} · {dollars(revenueCents)}
                </span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => openCompose('all')}
            disabled={uniqueEmailCount === 0}
            className="border border-[#E8E0D0]/40 rounded px-3 py-1 text-xs hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40"
          >
            Email all RSVPs
          </button>
          <button
            type="button"
            onClick={() => openCompose('not-bought')}
            disabled={notBoughtCount === 0}
            className="border border-[#E8E0D0]/40 rounded px-3 py-1 text-xs hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40"
          >
            Email non-buyers
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={rsvps.length === 0}
            className="border border-[#E8E0D0]/40 rounded px-3 py-1 text-xs hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40"
          >
            Print door list
          </button>
          {doorToken && (
            <>
              <a
                href={`/door/${doorToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-[#c8a26a]/50 text-[#c8a26a] rounded px-3 py-1 text-xs hover:bg-[#c8a26a]/10 transition-colors"
              >
                Open door check-in ↗
              </a>
              <button
                type="button"
                onClick={copyDoorLink}
                className="border border-[#E8E0D0]/40 rounded px-3 py-1 text-xs hover:bg-[#E8E0D0]/10 transition-colors"
              >
                {copiedDoorLink ? 'Copied!' : 'Copy iPad link'}
              </button>
            </>
          )}
        </div>
      </div>

      {composing && (
        <form
          onSubmit={handleSendBlast}
          className="mb-4 border border-[#E8E0D0]/25 rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-[#E8E0D0]/80">
              Compose email
            </h3>
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setAudience('all')}
                className={`rounded px-2.5 py-1 border transition-colors ${
                  audience === 'all'
                    ? 'border-[#E8E0D0] bg-[#E8E0D0]/10'
                    : 'border-[#E8E0D0]/30 hover:bg-[#E8E0D0]/10'
                }`}
              >
                All ({uniqueEmailCount})
              </button>
              <button
                type="button"
                onClick={() => setAudience('not-bought')}
                className={`rounded px-2.5 py-1 border transition-colors ${
                  audience === 'not-bought'
                    ? 'border-[#E8E0D0] bg-[#E8E0D0]/10'
                    : 'border-[#E8E0D0]/30 hover:bg-[#E8E0D0]/10'
                }`}
              >
                Haven&apos;t bought ({notBoughtCount})
              </button>
            </div>
          </div>

          <p className="text-xs text-[#E8E0D0]/50">
            Sending to{' '}
            <strong className="text-[#E8E0D0]/80">
              {audienceCount} recipient{audienceCount === 1 ? '' : 's'}
            </strong>{' '}
            (unique emails). Use <code className="text-[#E8E0D0]/70">{'{name}'}</code> in the
            message to insert each person&apos;s first name.
          </p>

          <div>
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
              Subject
            </label>
            <input
              value={blastSubject}
              onChange={(e) => setBlastSubject(e.target.value)}
              className={`${inputClass} w-full`}
              placeholder={`Reminder: ${showTitle}`}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
              Message
            </label>
            <textarea
              value={blastMessage}
              onChange={(e) => setBlastMessage(e.target.value)}
              rows={8}
              className={`${inputClass} w-full resize-y`}
              placeholder={'Hi {name},\n\nJust a reminder that the show is this weekend...'}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={sending || audienceCount === 0}
              className="border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-50"
            >
              {sending
                ? 'Sending...'
                : `Send to ${audienceCount} recipient${audienceCount === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="text-[#E8E0D0]/60 hover:text-[#E8E0D0] text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {blastResult && (
        <div className="mb-4 border border-green-400/30 bg-green-400/5 text-sm rounded px-3 py-2">
          <div className="text-green-300">
            Sent {blastResult.sent} email{blastResult.sent === 1 ? '' : 's'}
            {blastResult.audience === 'not-bought' ? ' (non-buyers)' : ''}.
          </div>
          {blastResult.invalid.length > 0 && (
            <div className="text-[#E8E0D0]/50 mt-1">
              Skipped {blastResult.invalid.length} invalid address
              {blastResult.invalid.length === 1 ? '' : 'es'}: {blastResult.invalid.join(', ')}
            </div>
          )}
          {blastResult.failed.length > 0 && (
            <div className="text-red-300 mt-1">
              Failed {blastResult.failed.length}:{' '}
              {blastResult.failed.map((f) => f.email).join(', ')}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-3 border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-3 py-2 flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end mb-4 border border-[#E8E0D0]/10 rounded p-3">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} w-full`} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} w-full`} />
        </div>
        <div className="w-20">
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Guests</label>
          <input
            type="number"
            min={1}
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            className={`${inputClass} w-full text-center`}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-[#E8E0D0]/60 pb-1.5 whitespace-nowrap">
          <input type="checkbox" checked={emailListOptIn} onChange={(e) => setEmailListOptIn(e.target.checked)} />
          Email list
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Adding...' : '+ Add RSVP'}
        </button>
      </form>

      <div className="space-y-2">
        {rsvps.map((rsvp) =>
          editingId === rsvp.id && editForm ? (
            <div
              key={rsvp.id}
              className="flex flex-wrap gap-2 items-end border border-[#E8E0D0]/30 rounded-lg px-4 py-3"
            >
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Email</label>
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="w-20">
                <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Guests</label>
                <input
                  type="number"
                  min={1}
                  value={editForm.guests}
                  onChange={(e) => setEditForm({ ...editForm, guests: e.target.value })}
                  className={`${inputClass} w-full text-center`}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-[#E8E0D0]/60 pb-1.5 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={editForm.emailListOptIn}
                  onChange={(e) => setEditForm({ ...editForm, emailListOptIn: e.target.checked })}
                />
                Email list
              </label>
              <div className="flex items-center gap-3 pb-1.5">
                <button
                  type="button"
                  onClick={() => saveEdit(rsvp.id)}
                  disabled={savingEdit}
                  className="border border-[#E8E0D0]/40 rounded px-3 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={cancelEdit} className="text-[#E8E0D0]/60 hover:text-[#E8E0D0] text-sm">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={rsvp.id}
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 border border-[#E8E0D0]/15 rounded-lg px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold break-words">{rsvp.name}</span>
                  <span className="text-sm text-[#E8E0D0]/50 break-all">{rsvp.email}</span>
                  {(() => {
                    const purchase = purchases[rsvp.email.toLowerCase()];
                    return purchase ? (
                      <span className="text-xs px-2 py-0.5 rounded-full border border-amber-400/40 text-amber-300 whitespace-nowrap">
                        ✓ Bought · {dollars(purchase.totalCents)}
                        {purchase.quantity > 1 ? ` · ${purchase.quantity} tickets` : ''}
                      </span>
                    ) : null;
                  })()}
                  {rsvp.email_list_opt_in && (
                    <span className="text-xs px-2 py-0.5 rounded-full border border-green-400/40 text-green-300">
                      Email list
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 text-sm text-[#E8E0D0]/50">
                <span>
                  {rsvp.guests} guest{rsvp.guests === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => toggleFlag(rsvp.id, 'arrived', !rsvp.arrived)}
                  aria-pressed={rsvp.arrived}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap ${
                    rsvp.arrived
                      ? 'border-sky-400/50 bg-sky-400/10 text-sky-300'
                      : 'border-[#E8E0D0]/25 text-[#E8E0D0]/50 hover:bg-[#E8E0D0]/10'
                  }`}
                >
                  {rsvp.arrived ? '✓ Arrived' : 'Arrived'}
                </button>
                <button
                  type="button"
                  onClick={() => toggleFlag(rsvp.id, 'paid', !rsvp.paid)}
                  aria-pressed={rsvp.paid}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap ${
                    rsvp.paid
                      ? 'border-green-400/50 bg-green-400/10 text-green-300'
                      : 'border-[#E8E0D0]/25 text-[#E8E0D0]/50 hover:bg-[#E8E0D0]/10'
                  }`}
                >
                  {rsvp.paid ? '✓ Paid' : 'Paid'}
                </button>
                <span className="font-mono text-xs">{formatSubmittedAt(rsvp.created_at)}</span>
                <button type="button" onClick={() => startEdit(rsvp)} className="text-[#E8E0D0]/80 hover:text-[#E8E0D0] underline">
                  Edit
                </button>
                <button type="button" onClick={() => handleDelete(rsvp.id)} className="text-red-400/70 hover:text-red-400">
                  Remove
                </button>
              </div>
            </div>
          )
        )}
        {rsvps.length === 0 && (
          <p className="text-[#E8E0D0]/40 text-sm py-8 text-center">No RSVPs yet.</p>
        )}
      </div>

      {unmatchedGroups.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#E8E0D0]/10">
          <h3 className="text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-2">
            Bought, no matching RSVP ({unmatchedGroups.length})
          </h3>
          <p className="text-xs text-[#E8E0D0]/40 mb-3">
            Paid with an email that doesn&apos;t match any RSVP — likely a typo or a different
            address. Match them to an existing RSVP or add them to the list so they show up at the door.
          </p>
          <div className="space-y-1.5">
            {unmatchedGroups.map((g) => {
              const actionable = g.email.includes('@');
              const active = buyerAction?.email === g.email ? buyerAction : null;
              return (
                <div key={g.email} className="space-y-2">
                  <div className="flex items-center justify-between gap-4 text-sm text-[#E8E0D0]/60">
                    <span className="truncate">{g.email}</span>
                    <span className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-amber-300/80">
                        {dollars(g.totalCents)}
                        {g.quantity > 1 ? ` · ${g.quantity} tickets` : ''}
                      </span>
                      <span className="font-mono text-xs">{formatSubmittedAt(g.latest)}</span>
                      {actionable && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setBuyerAction(active?.mode === 'match' ? null : { email: g.email, mode: 'match' });
                              setMatchRsvpId('');
                            }}
                            className="text-[#E8E0D0]/80 hover:text-[#E8E0D0] underline text-xs whitespace-nowrap"
                          >
                            Match to RSVP
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBuyerAction(active?.mode === 'add' ? null : { email: g.email, mode: 'add' });
                              setBuyerName('');
                            }}
                            className="text-[#E8E0D0]/80 hover:text-[#E8E0D0] underline text-xs whitespace-nowrap"
                          >
                            + Add as RSVP
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  {active?.mode === 'match' && (
                    <div className="flex flex-wrap items-center gap-2 pl-3 border-l border-[#E8E0D0]/20">
                      <select
                        value={matchRsvpId}
                        onChange={(e) => setMatchRsvpId(e.target.value)}
                        className={`${inputClass} max-w-full`}
                      >
                        <option value="">Same person as…</option>
                        {[...rsvps]
                          .sort((a, b) => a.name.localeCompare(b.name, 'en-US', { sensitivity: 'base' }))
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} ({r.email})
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleMatchBuyer(g)}
                        disabled={buyerBusy || !matchRsvpId}
                        className="border border-[#E8E0D0]/40 rounded px-3 py-1.5 text-xs hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-50"
                      >
                        {buyerBusy ? 'Matching...' : 'Match'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBuyerAction(null)}
                        className="text-[#E8E0D0]/60 hover:text-[#E8E0D0] text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {active?.mode === 'add' && (
                    <div className="flex flex-wrap items-center gap-2 pl-3 border-l border-[#E8E0D0]/20">
                      <input
                        value={buyerName}
                        onChange={(e) => setBuyerName(e.target.value)}
                        placeholder="Name"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => handleAddBuyerAsRsvp(g)}
                        disabled={buyerBusy || !buyerName.trim()}
                        className="border border-[#E8E0D0]/40 rounded px-3 py-1.5 text-xs hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-50"
                      >
                        {buyerBusy
                          ? 'Adding...'
                          : `Add RSVP (${g.quantity} guest${g.quantity === 1 ? '' : 's'})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBuyerAction(null)}
                        className="text-[#E8E0D0]/60 hover:text-[#E8E0D0] text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
