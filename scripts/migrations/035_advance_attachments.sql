-- Files bands attach to their advance replies (stage plots, input lists — usually
-- PDFs or images). Resend's inbound webhook carries only attachment metadata and
-- a short-lived signed download URL, so at receive time we re-host the bytes in
-- R2 (durable) and record a row here pointing at our own public URL.
--
-- Denormalized show_id (alongside the message_id FK) so the future "stage plot
-- summary" can pull every attachment for a show without joining through messages.
create table if not exists advance_attachments (
  id bigserial primary key,
  message_id bigint not null references advance_messages (id) on delete cascade,
  show_id bigint not null references shows (id) on delete cascade,
  filename text,
  content_type text,
  size_bytes bigint,
  -- Public R2 URL we re-hosted the file at (NOT Resend's expiring signed URL).
  url text not null,
  -- Resend's attachment id on the inbound email, for dedupe/reference.
  resend_attachment_id text,
  created_at timestamptz not null default now()
);

create index if not exists advance_attachments_message_idx
  on advance_attachments (message_id);

create index if not exists advance_attachments_show_idx
  on advance_attachments (show_id);
