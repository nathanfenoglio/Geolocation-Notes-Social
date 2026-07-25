-- Flat replies and multi-emoji reactions on notes
-- Run in Supabase Dashboard: SQL Editor -> New query -> paste entire file -> Run

-- ============ note_replies ============

create table if not exists public.note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists note_replies_note_created_idx
  on public.note_replies (note_id, created_at);

alter table public.note_replies enable row level security;

drop policy if exists "note_replies_select" on public.note_replies;
create policy "note_replies_select" on public.note_replies
  for select
  using (public.can_view_note(note_id));

drop policy if exists "note_replies_insert" on public.note_replies;
create policy "note_replies_insert" on public.note_replies
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.can_view_note(note_id)
  );

drop policy if exists "note_replies_delete" on public.note_replies;
create policy "note_replies_delete" on public.note_replies
  for delete to authenticated
  using (author_id = auth.uid());

-- ============ note_reactions ============

create table if not exists public.note_reactions (
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (note_id, user_id, emoji)
);

create index if not exists note_reactions_note_idx
  on public.note_reactions (note_id);

alter table public.note_reactions enable row level security;

drop policy if exists "note_reactions_select" on public.note_reactions;
create policy "note_reactions_select" on public.note_reactions
  for select
  using (public.can_view_note(note_id));

drop policy if exists "note_reactions_insert" on public.note_reactions;
create policy "note_reactions_insert" on public.note_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_view_note(note_id)
  );

drop policy if exists "note_reactions_delete" on public.note_reactions;
create policy "note_reactions_delete" on public.note_reactions
  for delete to authenticated
  using (user_id = auth.uid());
