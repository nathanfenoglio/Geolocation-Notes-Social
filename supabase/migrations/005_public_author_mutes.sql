-- Allow muting individual authors for public-note notifications
-- Run in Supabase Dashboard: SQL Editor -> New query -> paste entire file -> Run

alter table public.notification_mutes
  drop constraint if exists notification_mutes_kind_check;

alter table public.notification_mutes
  add constraint notification_mutes_kind_check
  check (kind in ('group', 'peer', 'public_author'));
