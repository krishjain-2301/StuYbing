-- Room chat (run this if 001_init.sql was already applied)

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists room_messages_room_created_idx
  on public.room_messages (room_id, created_at);

alter table public.room_messages enable row level security;

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

do $$
begin
  begin
    alter publication supabase_realtime add table public.room_messages;
  exception when duplicate_object then null;
  end;
end $$;
