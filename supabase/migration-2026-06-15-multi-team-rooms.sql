-- Migration: multi-team contest rooms (2026-06-15)
-- ════════════════════════════════════════════════════
-- Turns 1v1 rooms into contests of up to 100 managers: one host creates the
-- room, everyone else joins via the share link OR a short room code, and a live
-- leaderboard ranks everyone by points. Run in Supabase Dashboard → SQL Editor.

-- ── fantasy_rooms: room code + capacity ──────────────────────────────────────
alter table public.fantasy_rooms add column if not exists room_code   text;
alter table public.fantasy_rooms add column if not exists max_players  int not null default 100;
create unique index if not exists idx_rooms_code on public.fantasy_rooms(room_code);

-- Backfill a code for existing rooms (6 chars from the uuid)
update public.fantasy_rooms
set room_code = upper(substr(replace(id::text, '-', ''), 1, 6))
where room_code is null;

-- ── fantasy_room_members: one row per participant ────────────────────────────
create table if not exists public.fantasy_room_members (
  room_id      uuid    not null references public.fantasy_rooms(id) on delete cascade,
  user_id      uuid    not null references auth.users(id) on delete cascade,
  is_host      boolean not null default false,
  total_points numeric(8,2),
  rank         int,
  joined_at    timestamptz default now(),
  primary key (room_id, user_id)
);
create index if not exists idx_members_room on public.fantasy_room_members(room_id);

alter table public.fantasy_room_members enable row level security;

-- Anyone can read membership/leaderboard (needed so the room link works)
drop policy if exists "members_read_all" on public.fantasy_room_members;
create policy "members_read_all" on public.fantasy_room_members
  for select using (true);
-- Writes happen server-side (join/create routes use the service role).

-- Backfill members from existing host_id / guest_id
insert into public.fantasy_room_members (room_id, user_id, is_host)
select id, host_id, true from public.fantasy_rooms where host_id is not null
on conflict do nothing;
insert into public.fantasy_room_members (room_id, user_id, is_host)
select id, guest_id, false from public.fantasy_rooms where guest_id is not null
on conflict do nothing;

-- ── Picks RLS: allow ANY room member (not just host/guest) ───────────────────
drop policy if exists "picks_read_participants" on public.fantasy_picks;
create policy "picks_read_participants" on public.fantasy_picks for select using (
  exists (
    select 1 from public.fantasy_room_members m
    where m.room_id = fantasy_picks.room_id and m.user_id = auth.uid()
  )
);

drop policy if exists "picks_write_own" on public.fantasy_picks;
create policy "picks_write_own" on public.fantasy_picks for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.fantasy_room_members m
    join public.fantasy_rooms r on r.id = m.room_id
    where m.room_id = fantasy_picks.room_id and m.user_id = auth.uid() and r.status = 'waiting'
  )
);

drop policy if exists "picks_update_own" on public.fantasy_picks;
create policy "picks_update_own" on public.fantasy_picks for update using (
  user_id = auth.uid()
  and exists (select 1 from public.fantasy_rooms r where r.id = room_id and r.status = 'waiting')
);

drop policy if exists "picks_delete_own" on public.fantasy_picks;
create policy "picks_delete_own" on public.fantasy_picks for delete using (
  user_id = auth.uid()
  and exists (select 1 from public.fantasy_rooms r where r.id = room_id and r.status = 'waiting')
);

-- ── Realtime: broadcast leaderboard changes to open room pages ───────────────
do $$
begin
  begin
    alter publication supabase_realtime add table public.fantasy_room_members;
  exception when duplicate_object then null;
  end;
end $$;
