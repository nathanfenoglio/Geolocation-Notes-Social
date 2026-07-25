-- Map filter prefs for public notes (separate from notification mutes)
-- Run in Supabase Dashboard: SQL Editor -> New query -> paste entire file -> Run

alter table public.profiles
  add column if not exists map_show_public boolean not null default true;

alter table public.notification_mutes
  drop constraint if exists notification_mutes_kind_check;

alter table public.notification_mutes
  add constraint notification_mutes_kind_check
  check (kind in ('group', 'peer', 'public_author', 'map_public_author'));
