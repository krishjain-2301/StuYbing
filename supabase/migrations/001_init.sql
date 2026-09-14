-- StuYbing initial schema
-- Run in Supabase SQL Editor (or via supabase db push)

create extension if not exists pgcrypto;

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Rooms
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  name text not null,
  description text,
  is_private boolean not null default true,
  password_hash text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists rooms_owner_id_idx on public.rooms (owner_id);
create index if not exists rooms_room_code_idx on public.rooms (room_code);

-- Room members
create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);

create index if not exists room_members_user_id_idx on public.room_members (user_id);
create index if not exists room_members_room_id_idx on public.room_members (room_id);

-- Study sessions (server-timed)
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  last_heartbeat_at timestamptz default now(),
  constraint study_sessions_duration_check check (
    duration_seconds is null or duration_seconds >= 0
  )
);

create index if not exists study_sessions_room_id_idx on public.study_sessions (room_id);
create index if not exists study_sessions_user_id_idx on public.study_sessions (user_id);
create index if not exists study_sessions_started_at_idx on public.study_sessions (started_at);
create unique index if not exists study_sessions_one_active_per_user
  on public.study_sessions (user_id)
  where ended_at is null;

-- Tasks
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  completed boolean not null default false,
  deadline timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tasks_user_room_idx on public.tasks (user_id, room_id);

-- Room chat
create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists room_messages_room_created_idx
  on public.room_messages (room_id, created_at);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  base_username := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'student'
  );
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]', '', 'g');
  if base_username = '' then
    base_username := 'student';
  end if;
  base_username := left(base_username, 24);
  final_username := base_username;

  while exists (select 1 from public.profiles where username = final_username) loop
    suffix := suffix + 1;
    final_username := left(base_username, 20) || suffix::text;
  end loop;

  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    final_username,
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: is member of room
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = p_room_id
      and user_id = auth.uid()
  );
$$;

-- Helper: generate unique room code
create or replace function public.generate_unique_room_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where room_code = code);
  end loop;
  return code;
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.study_sessions enable row level security;
alter table public.tasks enable row level security;
alter table public.room_messages enable row level security;

-- Profiles policies
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Safe join helpers (do not expose password_hash to clients)
create or replace function public.get_room_join_info(p_code text)
returns table (
  id uuid,
  room_code text,
  name text,
  requires_password boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.room_code,
    r.name,
    (r.password_hash is not null) as requires_password
  from public.rooms r
  where upper(r.room_code) = upper(p_code)
  limit 1;
$$;

create or replace function public.join_room_with_code(p_code text, p_password text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.rooms%rowtype;
  computed_hash text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into r
  from public.rooms
  where upper(room_code) = upper(p_code)
  limit 1;

  if not found then
    raise exception 'Room not found';
  end if;

  if r.password_hash is not null then
    if p_password is null or length(trim(p_password)) = 0 then
      raise exception 'Password required';
    end if;
    computed_hash := encode(digest(convert_to(p_password, 'UTF8'), 'sha256'), 'hex');
    if computed_hash <> r.password_hash then
      raise exception 'Incorrect room password';
    end if;
  end if;

  insert into public.room_members (room_id, user_id)
  values (r.id, auth.uid())
  on conflict (room_id, user_id) do nothing;

  return r.id;
end;
$$;

grant execute on function public.get_room_join_info(text) to authenticated;
grant execute on function public.join_room_with_code(text, text) to authenticated;
grant execute on function public.generate_unique_room_code() to authenticated;

-- Rooms policies
drop policy if exists "Members can view rooms" on public.rooms;
create policy "Members can view rooms"
  on public.rooms for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_room_member(id)
    or is_private = false
  );

drop policy if exists "Authenticated users can create rooms" on public.rooms;
create policy "Authenticated users can create rooms"
  on public.rooms for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Owners can update rooms" on public.rooms;
create policy "Owners can update rooms"
  on public.rooms for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Owners can delete rooms" on public.rooms;
create policy "Owners can delete rooms"
  on public.rooms for delete
  to authenticated
  using (owner_id = auth.uid());

-- Room members policies
drop policy if exists "Members can view room members" on public.room_members;
create policy "Members can view room members"
  on public.room_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_room_member(room_id)
  );

drop policy if exists "Users can join rooms" on public.room_members;
create policy "Users can join rooms"
  on public.room_members for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can leave rooms" on public.room_members;
create policy "Users can leave rooms"
  on public.room_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.rooms r
      where r.id = room_id and r.owner_id = auth.uid()
    )
  );

-- Study sessions policies
drop policy if exists "Members can view room sessions" on public.study_sessions;
create policy "Members can view room sessions"
  on public.study_sessions for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_room_member(room_id)
  );

drop policy if exists "Users can start own sessions" on public.study_sessions;
create policy "Users can start own sessions"
  on public.study_sessions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_room_member(room_id)
  );

drop policy if exists "Users can update own sessions" on public.study_sessions;
create policy "Users can update own sessions"
  on public.study_sessions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Tasks policies
drop policy if exists "Users can view own tasks" on public.tasks;
create policy "Users can view own tasks"
  on public.tasks for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own tasks" on public.tasks;
create policy "Users can insert own tasks"
  on public.tasks for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_room_member(room_id)
  );

drop policy if exists "Users can update own tasks" on public.tasks;
create policy "Users can update own tasks"
  on public.tasks for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own tasks" on public.tasks;
create policy "Users can delete own tasks"
  on public.tasks for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Members can read room chat" on public.room_messages;
create policy "Members can read room chat"
  on public.room_messages for select
  to authenticated
  using (public.is_room_member(room_id));

drop policy if exists "Members can send room chat" on public.room_messages;
create policy "Members can send room chat"
  on public.room_messages for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_room_member(room_id)
  );

-- Realtime (ignore if already added)
do $$
begin
  begin
    alter publication supabase_realtime add table public.study_sessions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.room_members;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.room_messages;
  exception when duplicate_object then null;
  end;
end $$;
