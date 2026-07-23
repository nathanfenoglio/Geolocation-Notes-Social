-- Fix user_groups SELECT policy so INSERT ... RETURNING works.
-- Cause: the old policy called is_group_member(id), which re-queries
-- user_groups and cannot see the row being inserted. PostgREST then
-- reports "new row violates row-level security policy" even though
-- the INSERT WITH CHECK already passed.
--
-- Run in Supabase SQL Editor: paste, click WITHOUT selecting text, then Run.
-- Safe to re-run.

drop policy if exists "user_groups_select" on public.user_groups;

create policy "user_groups_select" on public.user_groups
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.user_group_members m
      where m.group_id = id and m.member_id = auth.uid()
    )
  );
