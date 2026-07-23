-- Geo Notes initial schema
-- Run this in the Supabase Dashboard: SQL Editor -> New query -> paste -> Run

-- ============ Enums ============

create type public.note_visibility as enum ('private', 'shared', 'public');
create type public.media_type as enum ('image', 'video', 'audio');

-- ============ Tables ============

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  title text not null default '',
  body text not null default '',
  visibility public.note_visibility not null default 'private',
  -- The date the note pertains to (user selectable, e.g. a photo from a previous year)
  note_date date not null default current_date,
  -- When the note was actually left / last edited
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_lat_idx on public.notes (lat);
create index notes_lng_idx on public.notes (lng);
create index notes_author_idx on public.notes (author_id);

create table public.note_shares (
  note_id uuid not null references public.notes(id) on delete cascade,
  shared_with uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, shared_with)
);

create index note_shares_user_idx on public.note_shares (shared_with);

create table public.note_media (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  storage_path text not null,
  media_type public.media_type not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index note_media_note_idx on public.note_media (note_id);

-- ============ Triggers ============

-- Auto-create a profile row when a user signs up.
-- Username comes from auth metadata; falls back to a generated name on conflict.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
begin
  uname := nullif(trim(new.raw_user_meta_data->>'username'), '');
  if uname is null or uname !~ '^[a-zA-Z0-9_]{3,24}$' then
    uname := 'user_' || substr(new.id::text, 1, 8);
  end if;
  if exists (select 1 from public.profiles where username = uname) then
    uname := substr(uname, 1, 19) || '_' || substr(md5(new.id::text), 1, 4);
  end if;
  insert into public.profiles (id, username) values (new.id, uname);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ============ Helper functions (security definer avoids RLS recursion) ============

create or replace function public.is_note_author(n_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from notes where id = n_id and author_id = auth.uid()
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
          and exists (
            select 1 from note_shares s
            where s.note_id = n.id and s.shared_with = auth.uid()
          )
        )
      )
  );
$$;

-- ============ Row Level Security ============

alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.note_shares enable row level security;
alter table public.note_media enable row level security;

-- Profiles: readable by everyone (needed for usernames on public notes and share lookup)
create policy "profiles_select" on public.profiles
  for select using (true);

-- Notes
create policy "notes_select" on public.notes
  for select using (
    visibility = 'public'
    or author_id = auth.uid()
    or (visibility = 'shared' and public.can_view_note(id))
  );

create policy "notes_insert" on public.notes
  for insert to authenticated
  with check (author_id = auth.uid());

create policy "notes_update" on public.notes
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "notes_delete" on public.notes
  for delete to authenticated
  using (author_id = auth.uid());

-- Note shares: visible to the recipient and the note author; managed by the author
create policy "note_shares_select" on public.note_shares
  for select using (
    shared_with = auth.uid() or public.is_note_author(note_id)
  );

create policy "note_shares_insert" on public.note_shares
  for insert to authenticated
  with check (public.is_note_author(note_id));

create policy "note_shares_delete" on public.note_shares
  for delete to authenticated
  using (public.is_note_author(note_id));

-- Note media: readable if the note is viewable; managed by the author
create policy "note_media_select" on public.note_media
  for select using (public.can_view_note(note_id));

create policy "note_media_insert" on public.note_media
  for insert to authenticated
  with check (public.is_note_author(note_id));

create policy "note_media_delete" on public.note_media
  for delete to authenticated
  using (public.is_note_author(note_id));

-- ============ Storage ============

-- Private bucket for note media; files served via signed URLs.
-- Path convention: {author_user_id}/{note_id}/{filename}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-media',
  'note-media',
  false,
  52428800, -- 50 MB per file
  array['image/*', 'video/*', 'audio/*']
)
on conflict (id) do nothing;

create policy "note_media_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "note_media_storage_select" on storage.objects
  for select using (
    bucket_id = 'note-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_view_note(((storage.foldername(name))[2])::uuid)
    )
  );

create policy "note_media_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
