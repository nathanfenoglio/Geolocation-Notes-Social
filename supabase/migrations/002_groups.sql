-- Geo Notes: shareable user groups (live-linked)
-- Run this in the Supabase Dashboard: SQL Editor -> New query -> paste -> Run
-- IMPORTANT: click in the editor WITHOUT selecting any text, so the WHOLE
-- script runs (the editor executes only the selection when text is selected).
-- This script is idempotent: it is safe to run multiple times.

-- ============ Tables ============

create table if not exists public.user_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.user_group_members (
  group_id uuid not null references public.user_groups(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, member_id)
);

create index if not exists user_group_members_member_idx on public.user_group_members (member_id);

-- Notes shared with a whole group (live link: current membership controls access)
create table if not exists public.note_group_shares (
  note_id uuid not null references public.notes(id) on delete cascade,
  group_id uuid not null references public.user_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, group_id)
);

create index if not exists note_group_shares_group_idx on public.note_group_shares (group_id);

-- ============ Helper functions ============

-- True when the caller owns the group or is a member of it.
create or replace function public.is_group_member(g_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from user_groups g where g.id = g_id and g.owner_id = auth.uid()
  ) or exists (
    select 1 from user_group_members m where m.group_id = g_id and m.member_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(g_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from user_groups g where g.id = g_id and g.owner_id = auth.uid()
  );
$$;

-- Replace note visibility check: 'shared' notes are now visible via direct
-- shares OR via membership (or ownership) of any group the note is shared with.
-- The existing notes/note_media/storage policies all call this function, so
-- they pick up group-based access automatically.
create or replace function public.can_view_note(n_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from notes n
    where n.id = n_id
      and (
        n.visibility = 'public'
        or n.author_id = auth.uid()
        or (
          n.visibility = 'shared'
          and (
            exists (
              select 1 from note_shares s
              where s.note_id = n.id and s.shared_with = auth.uid()
            )
            or exists (
              select 1
              from note_group_shares gs
              join user_groups g on g.id = gs.group_id
              where gs.note_id = n.id
                and (
                  g.owner_id = auth.uid()
                  or exists (
                    select 1 from user_group_members m
                    where m.group_id = gs.group_id and m.member_id = auth.uid()
                  )
                )
            )
          )
        )
      )
  );
$$;

-- ============ Row Level Security ============

alter table public.user_groups enable row level security;
alter table public.user_group_members enable row level security;
alter table public.note_group_shares enable row level security;

-- Groups: visible to owner and members; only the owner can create/rename/delete
drop policy if exists "user_groups_select" on public.user_groups;
create policy "user_groups_select" on public.user_groups
  for select using (public.is_group_member(id));

drop policy if exists "user_groups_insert" on public.user_groups;
create policy "user_groups_insert" on public.user_groups
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "user_groups_update" on public.user_groups;
create policy "user_groups_update" on public.user_groups
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "user_groups_delete" on public.user_groups;
create policy "user_groups_delete" on public.user_groups
  for delete to authenticated
  using (owner_id = auth.uid());

-- Group members: readable by owner and members; only the owner manages membership
drop policy if exists "user_group_members_select" on public.user_group_members;
create policy "user_group_members_select" on public.user_group_members
  for select using (public.is_group_member(group_id));

drop policy if exists "user_group_members_insert" on public.user_group_members;
create policy "user_group_members_insert" on public.user_group_members
  for insert to authenticated
  with check (public.is_group_owner(group_id));

drop policy if exists "user_group_members_delete" on public.user_group_members;
create policy "user_group_members_delete" on public.user_group_members
  for delete to authenticated
  using (public.is_group_owner(group_id));

-- Note group shares: managed by the note author, who must also be part of the
-- group (prevents sharing into groups the author cannot see); readable by the
-- author and by anyone in the group.
drop policy if exists "note_group_shares_select" on public.note_group_shares;
create policy "note_group_shares_select" on public.note_group_shares
  for select using (
    public.is_note_author(note_id) or public.is_group_member(group_id)
  );

drop policy if exists "note_group_shares_insert" on public.note_group_shares;
create policy "note_group_shares_insert" on public.note_group_shares
  for insert to authenticated
  with check (
    public.is_note_author(note_id) and public.is_group_member(group_id)
  );

drop policy if exists "note_group_shares_delete" on public.note_group_shares;
create policy "note_group_shares_delete" on public.note_group_shares
  for delete to authenticated
  using (public.is_note_author(note_id));
