-- In-app notification preferences (no push)
-- Run in Supabase Dashboard: SQL Editor -> New query -> paste entire file -> Run

alter table public.profiles
  add column if not exists notifications_seen_at timestamptz,
  add column if not exists notify_public boolean not null default true;

-- Opt-out mutes: absent row means notifications are enabled for that group/peer
create table if not exists public.notification_mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('group', 'peer')),
  target_id uuid not null,
  primary key (user_id, kind, target_id)
);

create index if not exists notification_mutes_user_idx
  on public.notification_mutes (user_id);

alter table public.notification_mutes enable row level security;

drop policy if exists "notification_mutes_select" on public.notification_mutes;
create policy "notification_mutes_select" on public.notification_mutes
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_mutes_insert" on public.notification_mutes;
create policy "notification_mutes_insert" on public.notification_mutes
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_mutes_delete" on public.notification_mutes;
create policy "notification_mutes_delete" on public.notification_mutes
  for delete to authenticated
  using (user_id = auth.uid());

-- Allow users to update their own notification preference columns
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
