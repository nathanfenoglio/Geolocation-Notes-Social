-- Geo Notes: repair missing group RLS policies
-- Run this if group creation fails with "violates row-level security policy".
-- Safe to re-run. In the SQL Editor: paste, click WITHOUT selecting text, then Run.

-- Helpers (needed by the policies)
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

alter table public.user_groups enable row level security;
alter table public.user_group_members enable row level security;
alter table public.note_group_shares enable row level security;

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
