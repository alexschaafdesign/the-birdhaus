-- Session revocation: staff/club session tokens embed the user's epoch
-- (lib/auth.ts, lib/club-auth.ts), and verification rejects tokens whose
-- epoch is stale. Bumping the epoch — on password change/reset or account
-- disable — invalidates every outstanding session for that user, which the
-- old stateless HMAC-only tokens could never do. Additive only.
alter table users add column if not exists session_epoch int not null default 1;
