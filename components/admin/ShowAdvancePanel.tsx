'use client';

import { useState } from 'react';
import Link from 'next/link';
import type {
  ShowAdvanceState,
  SavedAdvanceVars,
  AdvanceThreadMessage,
  AdvanceAttachment,
} from '@/lib/advance';
import { htmlToText, splitReplyQuote } from '@/lib/reply-text';

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

export default function ShowAdvancePanel({
  initial,
}: {
  initial: ShowAdvanceState;
}) {
  const [state, setState] = useState(initial);
  const [vars, setVars] = useState<SavedAdvanceVars>(initial.vars);
  const [savedVars, setSavedVars] = useState<SavedAdvanceVars>(initial.vars);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const dirty = JSON.stringify(vars) !== JSON.stringify(savedVars);
  const withEmail = state.recipients.filter((r) => r.email);
  const missingEmail = state.recipients.filter((r) => !r.email);
  const canSend = withEmail.length > 0;

  function setVar(key: keyof SavedAdvanceVars, value: string) {
    setVars((v) => ({ ...v, [key]: value }));
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/shows/${state.showId}/advance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `Save failed (${res.status})`);
      }
      const next = (await res.json()) as ShowAdvanceState;
      setState(next);
      setVars(next.vars);
      setSavedVars(next.vars);
      setNotice('Draft saved — preview updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shows/${state.showId}/advance`);
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      const next = (await res.json()) as ShowAdvanceState;
      setState(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  async function sendReply() {
    if (!replyBody.trim()) return;
    setReplying(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/shows/${state.showId}/advance/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyBody }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? `Reply failed (${res.status})`);
      if (d.state) setState(d.state as ShowAdvanceState);
      setReplyBody('');
      setNotice(`Reply sent to ${d.sentCount} band${d.sentCount === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reply failed');
    } finally {
      setReplying(false);
    }
  }

  async function send() {
    const n = withEmail.length;
    const skip = missingEmail.length
      ? `\n\n${missingEmail.length} band(s) without an email will be skipped: ${missingEmail
          .map((r) => r.name)
          .join(', ')}.`
      : '';
    if (
      !confirm(
        `Send the advance to ${n} band${n === 1 ? '' : 's'}${
          state.status === 'sent' ? ' again' : ''
        }?${skip}`
      )
    ) {
      return;
    }
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/shows/${state.showId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? `Send failed (${res.status})`);
      if (d.state) {
        setState(d.state as ShowAdvanceState);
        setVars((d.state as ShowAdvanceState).vars);
        setSavedVars((d.state as ShowAdvanceState).vars);
      }
      setNotice(
        `Sent to ${d.sentCount} band${d.sentCount === 1 ? '' : 's'}.` +
          (d.skipped?.length ? ` Skipped (no email): ${d.skipped.join(', ')}.` : '')
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Advance email</h2>
          {state.status === 'sent' ? (
            <span className="text-xs rounded-full border border-green-400/40 bg-green-400/10 text-green-300 px-2.5 py-0.5">
              Sent{state.sentAt ? ` · ${new Date(state.sentAt).toLocaleDateString()}` : ''}
            </span>
          ) : state.status === 'draft' ? (
            <span className="text-xs rounded-full border border-[#E8E0D0]/30 text-[#E8E0D0]/60 px-2.5 py-0.5">
              Draft
            </span>
          ) : (
            <span className="text-xs rounded-full border border-[#E8E0D0]/20 text-[#E8E0D0]/40 px-2.5 py-0.5">
              Not started
            </span>
          )}
        </div>
        <Link
          href="/admin/settings"
          className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline"
        >
          Edit boilerplate template →
        </Link>
      </div>

      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2">
          {error}
        </div>
      )}
      {notice && (
        <div className="border border-green-400/40 bg-green-400/10 text-green-200 text-sm rounded px-4 py-2">
          {notice}
        </div>
      )}

      {/* Recipients */}
      <div className="border border-[#E8E0D0]/15 rounded-lg p-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">
          Recipients ({withEmail.length} of {state.recipients.length} with an email)
        </p>
        <ul className="space-y-1 text-sm">
          {state.recipients.map((r) => (
            <li key={r.bandId} className="flex items-center gap-2">
              <span className="text-[#E8E0D0]">{r.name}</span>
              {r.email ? (
                <span className="text-[#E8E0D0]/50">{r.email}</span>
              ) : (
                <Link
                  href={`/admin/bands/${r.bandId}`}
                  className="text-amber-300/90 hover:text-amber-200 underline"
                >
                  no email — add one
                </Link>
              )}
            </li>
          ))}
          {state.recipients.length === 0 && (
            <li className="text-[#E8E0D0]/40">No bands on this show yet.</li>
          )}
        </ul>
      </div>

      {/* Per-show fields */}
      <div className="space-y-4">
        <Field label="Intro line">
          <input
            value={vars.intro}
            onChange={(e) => setVar('intro', e.target.value)}
            placeholder="Looking forward to this show woohoo!"
            className={`${inputClass} w-full`}
          />
        </Field>

        <Field
          label="Sound engineer"
          hint={
            state.show.soundEngineerName
              ? `Defaults to ${state.show.soundEngineerName} (confirmed on this show)`
              : 'No confirmed engineer on this show yet'
          }
        >
          <input
            value={vars.sound_engineer}
            onChange={(e) => setVar('sound_engineer', e.target.value)}
            placeholder={state.show.soundEngineerName || 'Name'}
            className={`${inputClass} w-full`}
          />
        </Field>

        <Field label="Schedule" hint="Load-in / soundcheck / doors / set times. Markdown ok.">
          <textarea
            value={vars.schedule}
            onChange={(e) => setVar('schedule', e.target.value)}
            rows={8}
            placeholder={'5:30 pm — load in\n7:00 pm — doors\n7:30 pm — Band A'}
            className={`${inputClass} w-full font-mono text-[13px] resize-y`}
          />
        </Field>

        <Field
          label="Soundcheck notes"
          hint="Optional — the extra note about linechecks / order (was highlighted in blue)."
        >
          <textarea
            value={vars.soundcheck_notes}
            onChange={(e) => setVar('soundcheck_notes', e.target.value)}
            rows={3}
            className={`${inputClass} w-full resize-y`}
          />
        </Field>

        <div className="text-xs text-[#E8E0D0]/40 border border-[#E8E0D0]/10 rounded p-3 space-y-0.5">
          <p>Auto-filled from the show:</p>
          <p>
            <span className="text-[#E8E0D0]/60">Lineup:</span>{' '}
            {state.recipients.map((r) => r.name).join(', ') || '—'}
          </p>
          <p>
            <span className="text-[#E8E0D0]/60">Date:</span> {state.show.date ?? '—'}
          </p>
          <p>
            <span className="text-[#E8E0D0]/60">Show link:</span> /shows/{state.show.slug}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={saveDraft}
          disabled={saving || !dirty}
          className="border border-[#E8E0D0]/40 rounded px-4 py-2 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save draft & refresh preview'}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={sending || !canSend}
          className="bg-[#E8E0D0] text-[#2A2420] border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 transition-colors disabled:opacity-50"
        >
          {sending
            ? 'Sending…'
            : state.status === 'sent'
              ? 'Resend to lineup'
              : 'Send to lineup'}
        </button>
        {!canSend && (
          <span className="text-xs text-amber-300/80">
            Add a contact email to at least one band to send.
          </span>
        )}
        {dirty && (
          <span className="text-xs text-[#E8E0D0]/40">
            Unsaved edits — save to update the preview below.
          </span>
        )}
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">
          Preview{dirty ? ' (reflects last saved draft)' : ''}
        </p>
        <div className="rounded-lg border border-[#E8E0D0]/15 overflow-hidden">
          <div className="border-b border-[#E8E0D0]/10 px-4 py-2 text-sm text-[#E8E0D0]/70">
            <span className="text-[#E8E0D0]/40">Subject:</span> {state.preview.subject}
          </div>
          <div
            className="bg-[#f6f2e9] text-[#2A2420] px-6 py-5 text-sm leading-relaxed advance-preview"
            dangerouslySetInnerHTML={{ __html: state.preview.html }}
          />
        </div>
      </div>

      {/* Thread */}
      {state.status === 'sent' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">
              Thread ({state.messages.length})
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline disabled:opacity-40"
            >
              {refreshing ? 'Refreshing…' : 'Refresh for new replies'}
            </button>
          </div>

          <ul className="space-y-3">
            {state.messages.map((m) => {
              const recipient = state.recipients.find((r) => r.bandId === m.bandId);
              const who =
                m.direction === 'outbound'
                  ? 'You → lineup'
                  : recipient
                    ? `${recipient.name} replied`
                    : m.fromEmail ?? 'Reply';
              return <ThreadMessageItem key={m.id} message={m} who={who} />;
            })}
            {state.messages.length === 0 && (
              <li className="text-sm text-[#E8E0D0]/40">No messages yet.</li>
            )}
          </ul>

          {/* Reply on the thread */}
          <div className="space-y-2 border-t border-[#E8E0D0]/10 pt-3">
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/60">
              Reply to the lineup
            </label>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={4}
              placeholder="Sounds good — see you Saturday!"
              className={`${inputClass} w-full resize-y`}
            />
            <button
              type="button"
              onClick={sendReply}
              disabled={replying || !replyBody.trim()}
              className="border border-[#E8E0D0]/40 rounded px-4 py-2 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40"
            >
              {replying ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadMessageItem({
  message,
  who,
}: {
  message: AdvanceThreadMessage;
  who: string;
}) {
  const [showQuote, setShowQuote] = useState(false);
  // Prefer the text/plain part; fall back to a text rendering of the HTML part
  // (rendered as text, never injected as HTML — the sender is external). Then
  // peel off the quoted advance so the new message reads clean.
  const raw = message.bodyText ?? (message.bodyHtml ? htmlToText(message.bodyHtml) : null);
  const { body, quoted } = raw ? splitReplyQuote(raw) : { body: '', quoted: '' };

  return (
    <li
      className={`rounded-lg border px-4 py-3 text-sm ${
        message.direction === 'inbound'
          ? 'border-[#E8E0D0]/25 bg-[#E8E0D0]/[0.04]'
          : 'border-[#E8E0D0]/15'
      }`}
    >
      <div className="flex items-center justify-between text-xs text-[#E8E0D0]/50">
        <span className={message.direction === 'inbound' ? 'text-[#E8E0D0]/80' : ''}>
          {who}
        </span>
        <span>{new Date(message.createdAt).toLocaleString()}</span>
      </div>
      {body ? (
        <div className="mt-1.5 whitespace-pre-wrap text-[#E8E0D0]/75">{body}</div>
      ) : (
        <div className="mt-1.5 text-[#E8E0D0]/40 italic">
          {quoted ? '(no new text above the quoted message)' : '(no message content)'}
        </div>
      )}
      {message.attachments.length > 0 && (
        <div className="mt-3 space-y-2">
          {message.attachments.map((a) => (
            <AttachmentItem key={a.id} attachment={a} />
          ))}
        </div>
      )}
      {quoted && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowQuote((v) => !v)}
            className="text-xs text-[#E8E0D0]/45 hover:text-[#E8E0D0]/80 underline"
          >
            {showQuote ? 'Hide quoted text' : 'Show quoted text'}
          </button>
          {showQuote && (
            <div className="mt-1.5 whitespace-pre-wrap border-l-2 border-[#E8E0D0]/15 pl-3 text-xs text-[#E8E0D0]/40">
              {quoted}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function AttachmentItem({ attachment }: { attachment: AdvanceAttachment }) {
  const [open, setOpen] = useState(false);
  const type = attachment.contentType ?? '';
  const isPdf = type === 'application/pdf';
  const isImage = type.startsWith('image/');
  const previewable = isPdf || isImage;
  const name = attachment.filename || (isPdf ? 'attachment.pdf' : 'attachment');
  const meta = [isPdf ? 'PDF' : type || 'file', formatBytes(attachment.sizeBytes)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03]">
      <div className="flex items-center gap-2 px-3 py-2">
        <span aria-hidden className="text-[#E8E0D0]/60">
          {isPdf ? '📄' : isImage ? '🖼️' : '📎'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-[#E8E0D0]/90">{name}</div>
          {meta && <div className="text-xs text-[#E8E0D0]/40">{meta}</div>}
        </div>
        {previewable && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline shrink-0"
          >
            {open ? 'Hide' : 'Preview'}
          </button>
        )}
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline shrink-0"
        >
          Open ↗
        </a>
      </div>
      {open && previewable && (
        <div className="border-t border-[#E8E0D0]/10 bg-white/[0.02] p-2">
          {isPdf ? (
            <iframe
              src={attachment.url}
              title={name}
              className="h-[70vh] w-full rounded bg-white"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attachment.url}
              alt={name}
              className="max-h-[70vh] w-auto max-w-full rounded"
            />
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/60">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-[#E8E0D0]/35">{hint}</p>}
    </div>
  );
}
