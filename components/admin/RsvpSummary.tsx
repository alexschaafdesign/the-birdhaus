'use client';

import { useState, type FormEvent } from 'react';
import type { Rsvp, RsvpSummary as RsvpSummaryData } from '@/lib/rsvps';
import { FORM } from '@/components/night/form';
import { ADMIN_TYPE, FIELD_INLINE, Swatch, buttonClassName } from './ui';

const inputClass = FIELD_INLINE;
const SMALL_BTN = `${buttonClassName('secondary', 's')} disabled:opacity-40`;
const TAG = 'text-data-caption-13 inline-flex items-center gap-1.5 border border-surface-ink px-2 py-0.5 whitespace-nowrap';
// A two-state toggle (Arrived, Paid, audience): ink fill when on.
const toggle = (on: boolean) =>
  `text-data-caption-13 border border-surface-ink px-2.5 py-1 font-bold whitespace-nowrap transition-colors cursor-pointer ${ADMIN_TYPE.focus} ${
    on ? 'bg-surface-ink text-surface-paper' : 'text-surface-ink/70 hover:bg-surface-paper-shade'
  }`;

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
  ticketLimit = null,
  doorToken = null,
  rsvps: initialRsvps,
  purchasesByEmail = {},
  unmatchedBuyers = [],
}: {
  showId: number;
  showTitle: string;
  showDate: string;
  ticketLimit?: number | null;
  doorToken?: string | null;
  purchasesByEmail?: Record<string, { totalCents: number; count: number; quantity: number }>;
  unmatchedBuyers?: { email: string; amountCents: number; quantity: number; purchasedAt: string }[];
} & RsvpSummaryData) {
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

  // Tickets a matched RSVP actually bought (0 if none), by lowercased email.
  const boughtFor = (r: Rsvp) => purchases[r.email.trim().toLowerCase()]?.quantity ?? 0;

  // Extra heads already granted via per-RSVP credits (what drives the cap on top
  // of ticket sales): for each credited RSVP, credit minus what they bought.
  const creditedExtra = rsvps.reduce(
    (sum, r) => (r.credited_tickets != null ? sum + Math.max(0, r.credited_tickets - boughtFor(r)) : sum),
    0,
  );
  // Buyers who RSVP'd for more than they bought and haven't been credited yet —
  // the ones worth reviewing.
  const uncreditedShortfall = rsvps.filter(
    (r) => r.credited_tickets == null && boughtFor(r) > 0 && r.guests > boughtFor(r),
  ).length;
  const effectiveCount = ticketCount + creditedExtra;

  const [creditBusyId, setCreditBusyId] = useState<number | null>(null);

  // Set (or clear, with null) a person's manual attendance credit.
  async function setCredit(id: number, credited: number | null) {
    const previous = rsvps;
    setCreditBusyId(id);
    setRsvps((prev) => prev.map((r) => (r.id === id ? { ...r, credited_tickets: credited } : r)));
    try {
      const res = await fetch(`/api/admin/rsvps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditedTickets: credited }),
      });
      if (!res.ok) throw new Error();
      const updated = (await res.json().catch(() => null)) as Rsvp | null;
      if (updated) setRsvps((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch {
      setRsvps(previous);
      setError('Failed to update credit — try again.');
    } finally {
      setCreditBusyId(null);
    }
  }

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
    <div className="border-surface-ink bg-surface-paper border p-4 sm:p-5">
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className={ADMIN_TYPE.heading}>RSVPs</h2>
          <span className="text-data-caption-13 text-surface-ink/60">
            {totalCount} RSVP{totalCount === 1 ? '' : 's'} · {totalGuests} guest{totalGuests === 1 ? '' : 's'}
            {arrivedCount > 0 && (
              <> · <span className="text-surface-ink">{arrivedCount} arrived</span></>
            )}
            {paidCount > 0 && (
              <> · <span className="text-surface-ink">{paidCount} paid</span></>
            )}
            {hasPurchases && (
              <>
                {' '}·{' '}
                <span className="text-surface-ink">
                  {boughtCount} buyer{boughtCount === 1 ? '' : 's'} · {ticketCount} ticket
                  {ticketCount === 1 ? '' : 's'} · {dollars(revenueCents)}
                </span>
              </>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openCompose('all')}
            disabled={uniqueEmailCount === 0}
            className={SMALL_BTN}
          >
            Email all RSVPs
          </button>
          <button
            type="button"
            onClick={() => openCompose('not-bought')}
            disabled={notBoughtCount === 0}
            className={SMALL_BTN}
          >
            Email non-buyers
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={rsvps.length === 0}
            className={SMALL_BTN}
          >
            Print door list
          </button>
          {doorToken && (
            <a
              href={`/door/${doorToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClassName('primary', 's')}
            >
              Open door check-in ↗
            </a>
          )}
        </div>
      </div>

      {(hasPurchases || ticketLimit !== null || creditedExtra > 0) && (
        <div className="bg-surface-paper-shade mb-4 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
            <h3 className={ADMIN_TYPE.overline}>Effective attendance</h3>
            <span className="text-body-3">
              <span className="font-bold text-surface-ink">{effectiveCount}</span>
              {ticketLimit !== null && (
                <span className="text-surface-ink/60"> / {ticketLimit} cap</span>
              )}
              {ticketLimit !== null && effectiveCount >= ticketLimit && (
                <span className="ml-2 text-data-caption-13 px-2 py-0.5 bg-accent-red text-surface-paper font-bold">
                  SOLD OUT
                </span>
              )}
            </span>
          </div>

          <p className="text-data-caption-13 text-surface-ink/60">
            {ticketCount} ticket{ticketCount === 1 ? '' : 's'} sold online
            {creditedExtra > 0 && (
              <>
                {' '}
                + <span className="text-surface-ink/80">{creditedExtra}</span> credited RSVP head
                {creditedExtra === 1 ? '' : 's'}
              </>
            )}{' '}
            = <span className="text-surface-ink/80">{effectiveCount}</span> expected.
            {ticketLimit !== null && ' This is what the sold-out cap counts.'}
          </p>

          {uncreditedShortfall > 0 && (
            <p className="text-data-caption-13 text-surface-ink mt-2 max-w-prose">
              {uncreditedShortfall} buyer{uncreditedShortfall === 1 ? '' : 's'} RSVP&apos;d for a
              bigger party than they bought tickets for. Use “Count as N” on their row below to count
              those extra heads toward capacity.
            </p>
          )}
        </div>
      )}

      {composing && (
        <form
          onSubmit={handleSendBlast}
          className="mb-4 border-2 border-surface-ink p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className={ADMIN_TYPE.overline}>
              Compose email
            </h3>
            <div className="flex items-center gap-1 text-data-caption-13">
              <button
                type="button"
                onClick={() => setAudience('all')}
                className={toggle(audience === 'all')}
                aria-pressed={audience === 'all'}
              >
                All ({uniqueEmailCount})
              </button>
              <button
                type="button"
                onClick={() => setAudience('not-bought')}
                className={toggle(audience === 'not-bought')}
                aria-pressed={audience === 'not-bought'}
              >
                Haven&apos;t bought ({notBoughtCount})
              </button>
            </div>
          </div>

          <p className="text-data-caption-13 text-surface-ink/60">
            Sending to{' '}
            <strong className="text-surface-ink/80">
              {audienceCount} recipient{audienceCount === 1 ? '' : 's'}
            </strong>{' '}
            (unique emails). Use <code className="text-surface-ink/80">{'{name}'}</code> in the
            message to insert each person&apos;s first name.
          </p>

          <div>
            <label className={FORM.label}>
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
            <label className={FORM.label}>
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
              className={`${buttonClassName('primary', 's')} disabled:opacity-50`}
            >
              {sending
                ? 'Sending...'
                : `Send to ${audienceCount} recipient${audienceCount === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="text-surface-ink/60 hover:text-accent-red text-body-3"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {blastResult && (
        <div className={`${FORM.notice} mb-4`}>
          <div className="text-surface-ink">
            Sent {blastResult.sent} email{blastResult.sent === 1 ? '' : 's'}
            {blastResult.audience === 'not-bought' ? ' (non-buyers)' : ''}.
          </div>
          {blastResult.invalid.length > 0 && (
            <div className="text-surface-ink/60 mt-1">
              Skipped {blastResult.invalid.length} invalid address
              {blastResult.invalid.length === 1 ? '' : 'es'}: {blastResult.invalid.join(', ')}
            </div>
          )}
          {blastResult.failed.length > 0 && (
            <div className="text-accent-red mt-1">
              Failed {blastResult.failed.length}:{' '}
              {blastResult.failed.map((f) => f.email).join(', ')}
            </div>
          )}
        </div>
      )}

      {error && (
        <div role="alert" className={`${FORM.error} border-accent-red mb-3 flex items-center justify-between gap-3 border-2 p-3`}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className={ADMIN_TYPE.link}>
            dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end mb-4 bg-surface-paper-shade p-3">
        <div className="flex-1 min-w-[140px]">
          <label className={FORM.label}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} w-full`} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className={FORM.label}>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} w-full`} />
        </div>
        <div className="w-20">
          <label className={FORM.label}>Guests</label>
          <input
            type="number"
            min={1}
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            className={`${inputClass} w-full text-center`}
          />
        </div>
        <label className="flex items-center gap-2 text-data-caption-13 text-surface-ink/60 pb-2.5 whitespace-nowrap">
          <input type="checkbox" className="accent-surface-ink size-4" checked={emailListOptIn} onChange={(e) => setEmailListOptIn(e.target.checked)} />
          Email list
        </label>
        <button
          type="submit"
          disabled={submitting}
          className={`${buttonClassName('primary', 's')} disabled:opacity-50`}
        >
          {submitting ? 'Adding...' : '+ Add RSVP'}
        </button>
      </form>

      <div className="space-y-2">
        {rsvps.map((rsvp) =>
          editingId === rsvp.id && editForm ? (
            <div
              key={rsvp.id}
              className="flex flex-wrap gap-2 items-end border-2 border-surface-ink px-4 py-3"
            >
              <div className="flex-1 min-w-[140px]">
                <label className={FORM.label}>Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className={FORM.label}>Email</label>
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="w-20">
                <label className={FORM.label}>Guests</label>
                <input
                  type="number"
                  min={1}
                  value={editForm.guests}
                  onChange={(e) => setEditForm({ ...editForm, guests: e.target.value })}
                  className={`${inputClass} w-full text-center`}
                />
              </div>
              <label className="flex items-center gap-2 text-data-caption-13 text-surface-ink/60 pb-2.5 whitespace-nowrap">
                <input
                  type="checkbox"
                  className="accent-surface-ink size-4"
                  checked={editForm.emailListOptIn}
                  onChange={(e) => setEditForm({ ...editForm, emailListOptIn: e.target.checked })}
                />
                Email list
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => saveEdit(rsvp.id)}
                  disabled={savingEdit}
                  className={`${buttonClassName('primary', 's')} disabled:opacity-50`}
                >
                  {savingEdit ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={cancelEdit} className="text-surface-ink/60 hover:text-accent-red text-body-3">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={rsvp.id}
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 border-b border-surface-ink/20 px-1 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-bold break-words">{rsvp.name}</span>
                  <span className="text-body-3 text-surface-ink/60 break-all">{rsvp.email}</span>
                  {(() => {
                    const purchase = purchases[rsvp.email.toLowerCase()];
                    return purchase ? (
                      <span className={TAG}>
                        ✓ Bought · {dollars(purchase.totalCents)}
                        {purchase.quantity > 1 ? ` · ${purchase.quantity} tickets` : ''}
                      </span>
                    ) : null;
                  })()}
                  {rsvp.credited_tickets != null && (
                    <span className={TAG}>
                      <Swatch className="bg-spectrum-violet" />
                      Counted as {rsvp.credited_tickets}
                    </span>
                  )}
                  {rsvp.email_list_opt_in && (
                    <span className={TAG}>
                      Email list
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 text-body-3 text-surface-ink/60">
                <span>
                  {rsvp.guests} guest{rsvp.guests === 1 ? '' : 's'}
                </span>
                {(() => {
                  const bought = boughtFor(rsvp);
                  // Credited: offer to undo (back to their actual purchase count).
                  if (rsvp.credited_tickets != null) {
                    return (
                      <button
                        type="button"
                        onClick={() => setCredit(rsvp.id, null)}
                        disabled={creditBusyId === rsvp.id}
                        className={SMALL_BTN}
                      >
                        Undo credit
                      </button>
                    );
                  }
                  // Bought fewer tickets than they RSVP'd for → offer to count the
                  // whole party toward capacity.
                  if (bought > 0 && rsvp.guests > bought) {
                    return (
                      <button
                        type="button"
                        onClick={() => setCredit(rsvp.id, rsvp.guests)}
                        disabled={creditBusyId === rsvp.id}
                        className={SMALL_BTN}
                        title={`They bought ${bought} but RSVP'd for ${rsvp.guests} — count as ${rsvp.guests}`}
                      >
                        Count as {rsvp.guests}
                      </button>
                    );
                  }
                  return null;
                })()}
                <button
                  type="button"
                  onClick={() => toggleFlag(rsvp.id, 'arrived', !rsvp.arrived)}
                  aria-pressed={rsvp.arrived}
                  className={toggle(rsvp.arrived)}
                >
                  {rsvp.arrived ? '✓ Arrived' : 'Arrived'}
                </button>
                <button
                  type="button"
                  onClick={() => toggleFlag(rsvp.id, 'paid', !rsvp.paid)}
                  aria-pressed={rsvp.paid}
                  className={toggle(rsvp.paid)}
                >
                  {rsvp.paid ? '✓ Paid' : 'Paid'}
                </button>
                <span className="text-data-caption-13">{formatSubmittedAt(rsvp.created_at)}</span>
                <button type="button" onClick={() => startEdit(rsvp)} className="text-surface-ink/80 hover:text-accent-red underline underline-offset-4">
                  Edit
                </button>
                <button type="button" onClick={() => handleDelete(rsvp.id)} className="text-accent-red cursor-pointer underline-offset-4 hover:underline">
                  Remove
                </button>
              </div>
            </div>
          )
        )}
        {rsvps.length === 0 && (
          <p className="text-surface-ink/60 text-body-3 py-8 text-center">No RSVPs yet.</p>
        )}
      </div>

      {unmatchedGroups.length > 0 && (
        <div className="mt-4 pt-4 border-t border-surface-ink/20">
          <h3 className={`${ADMIN_TYPE.overline} mb-2`}>
            Bought, no matching RSVP ({unmatchedGroups.length})
          </h3>
          <p className="text-data-caption-13 text-surface-ink/60 mb-3">
            Paid with an email that doesn&apos;t match any RSVP — likely a typo or a different
            address. Match them to an existing RSVP or add them to the list so they show up at the door.
          </p>
          <div className="space-y-1.5">
            {unmatchedGroups.map((g) => {
              const actionable = g.email.includes('@');
              const active = buyerAction?.email === g.email ? buyerAction : null;
              return (
                <div key={g.email} className="space-y-2">
                  <div className="flex items-center justify-between gap-4 text-body-3 text-surface-ink/60">
                    <span className="truncate">{g.email}</span>
                    <span className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-surface-ink">
                        {dollars(g.totalCents)}
                        {g.quantity > 1 ? ` · ${g.quantity} tickets` : ''}
                      </span>
                      <span className="text-data-caption-13">{formatSubmittedAt(g.latest)}</span>
                      {actionable && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setBuyerAction(active?.mode === 'match' ? null : { email: g.email, mode: 'match' });
                              setMatchRsvpId('');
                            }}
                            className="text-surface-ink/80 hover:text-accent-red underline underline-offset-4 text-data-caption-13 whitespace-nowrap"
                          >
                            Match to RSVP
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBuyerAction(active?.mode === 'add' ? null : { email: g.email, mode: 'add' });
                              setBuyerName('');
                            }}
                            className="text-surface-ink/80 hover:text-accent-red underline underline-offset-4 text-data-caption-13 whitespace-nowrap"
                          >
                            + Add as RSVP
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  {active?.mode === 'match' && (
                    <div className="flex flex-wrap items-center gap-2 pl-3 border-l border-surface-ink">
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
                        className={SMALL_BTN}
                      >
                        {buyerBusy ? 'Matching...' : 'Match'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBuyerAction(null)}
                        className="text-surface-ink/60 hover:text-accent-red text-data-caption-13"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {active?.mode === 'add' && (
                    <div className="flex flex-wrap items-center gap-2 pl-3 border-l border-surface-ink">
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
                        className={SMALL_BTN}
                      >
                        {buyerBusy
                          ? 'Adding...'
                          : `Add RSVP (${g.quantity} guest${g.quantity === 1 ? '' : 's'})`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBuyerAction(null)}
                        className="text-surface-ink/60 hover:text-accent-red text-data-caption-13"
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
