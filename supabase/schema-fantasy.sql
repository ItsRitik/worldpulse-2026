-- WorldPulse 2026 — Match-Wise 1v1 Fantasy Schema
-- ─────────────────────────────────────────────────────────────────────────────
-- REGENERATED 2026-06-11 to match the LIVE database (verified via REST).
-- The previous version of this file had drifted: it used host_user_id /
-- guest_user_id and a players-table FK on picks, while the live DB (and all
-- app code) uses host_id / guest_id and inline player snapshots on picks.
--
-- This file is the reference for a fresh setup. For the live project, only
-- run migration-2026-06-11-match-player-points.sql (adds the missing table).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enums ─────────────────────────────────────────────────────────────────────
create type room_status   as enum ('waiting','locked','live','finished','cancelled');
create type pick_role     as enum ('captain','vice_captain','player');
create type position_type as enum ('GK','DEF','MID','FWD');

-- ── fantasy_rooms ─────────────────────────────────────────────────────────────
-- One room = one 1v1 contest for a specific match.
-- match_id: API-Football fixture id (numeric string) or TEST_xxx in test mode.
-- Joinable via share link (/fantasy/room/<uuid> — UUID is unguessable).
create table fantasy_rooms (
  id              uuid primary key default gen_random_uuid(),
  match_id        text        not null,
  match_label     text        not null,          -- "Brazil vs Argentina"
  home_team_tla   char(3)     not null,
  away_team_tla   char(3)     not null,
  kickoff_at      timestamptz not null,
  lock_at         timestamptz not null,          -- client sets = kickoff_at
  host_id         uuid        not null references auth.users(id) on delete cascade,
  guest_id        uuid        references auth.users(id) on delete set null,
  status          room_status not null default 'waiting',
  host_points     numeric(8,2),
  guest_points    numeric(8,2),
  winner_id       uuid        references auth.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_rooms_match    on fantasy_rooms(match_id);
create index idx_rooms_host     on fantasy_rooms(host_id);
create index idx_rooms_guest    on fantasy_rooms(guest_id);
create index idx_rooms_status   on fantasy_rooms(status);

create trigger rooms_updated_at before update on fantasy_rooms
  for each row execute function touch_updated_at();

alter table fantasy_rooms enable row level security;

-- Anyone can read a room by id (needed so the invite link works)
create policy "rooms_read_by_id"
  on fantasy_rooms for select
  using (true);

create policy "rooms_insert_host"
  on fantasy_rooms for insert
  with check (host_id = auth.uid());

-- Host or guest can update; guest joining is done server-side (service role)
create policy "rooms_update_participants"
  on fantasy_rooms for update
  using (host_id = auth.uid() or guest_id = auth.uid());

-- ── fantasy_picks ─────────────────────────────────────────────────────────────
-- Each user's 11-player selection for a room. Player data is SNAPSHOTTED inline
-- (no players table) — the scoring engine joins on api_player_id.
create table fantasy_picks (
  id             bigserial primary key,
  room_id        uuid          not null references fantasy_rooms(id) on delete cascade,
  user_id        uuid          not null references auth.users(id) on delete cascade,
  api_player_id  integer       not null,
  player_name    text          not null,
  player_short   text          not null,
  team_tla       char(3)       not null,
  position       position_type not null,
  jersey_number  integer,
  price          numeric(5,1)  not null default 6.5,
  role           pick_role     not null default 'player',
  base_points    numeric(8,2),           -- filled once scored
  multiplier     numeric(3,1),           -- 2.0 | 1.5 | 1.0
  total_points   numeric(8,2),
  created_at     timestamptz   default now(),
  updated_at     timestamptz   default now(),
  unique(room_id, user_id, api_player_id)
);

create index idx_picks_room on fantasy_picks(room_id);
create index idx_picks_user on fantasy_picks(user_id);

create trigger picks_updated_at before update on fantasy_picks
  for each row execute function touch_updated_at();

alter table fantasy_picks enable row level security;

-- Participants can read all picks in their room (live scoring view)
create policy "picks_read_participants"
  on fantasy_picks for select
  using (
    exists (
      select 1 from fantasy_rooms r
      where r.id = room_id
        and (r.host_id = auth.uid() or r.guest_id = auth.uid())
    )
  );

-- Write own picks only, and only while the room is still 'waiting'
-- (the scoring cron flips waiting → locked at kickoff)
create policy "picks_write_own"
  on fantasy_picks for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from fantasy_rooms r
      where r.id = room_id
        and r.status = 'waiting'
        and (r.host_id = auth.uid() or r.guest_id = auth.uid())
    )
  );

create policy "picks_update_own"
  on fantasy_picks for update
  using (
    user_id = auth.uid()
    and exists (
      select 1 from fantasy_rooms r
      where r.id = room_id and r.status = 'waiting'
    )
  );

create policy "picks_delete_own"
  on fantasy_picks for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from fantasy_rooms r
      where r.id = room_id and r.status = 'waiting'
    )
  );

-- ── fantasy_live_state ────────────────────────────────────────────────────────
-- One row per room, upserted by the scoring engine every cron tick.
-- Supabase Realtime on this table drives the live score widget —
-- remember to add it to the supabase_realtime publication.
create table fantasy_live_state (
  room_id         uuid primary key references fantasy_rooms(id) on delete cascade,
  match_minute    integer,
  match_status    text,
  home_score      integer default 0,
  away_score      integer default 0,
  host_points     numeric(8,2)  default 0,
  guest_points    numeric(8,2)  default 0,
  last_event      jsonb,
  events          jsonb not null default '[]',
  updated_at      timestamptz   default now()
);

alter table fantasy_live_state enable row level security;

create policy "live_read_all"
  on fantasy_live_state for select
  using (true);
-- Only the service-role scoring engine writes — no client write policy.

-- ── match_player_points ───────────────────────────────────────────────────────
-- Per-player point breakdown per match, upserted every scoring tick.
-- See migration-2026-06-11-match-player-points.sql for the standalone migration.
create table match_player_points (
  id            bigserial primary key,
  match_id      text        not null,
  api_player_id integer     not null,
  player_name   text        not null,
  team_tla      text        not null,
  position      text        not null,
  base_points   numeric(8,2) not null default 0,
  events        jsonb       not null default '[]',
  match_minute  integer,
  match_status  text,
  updated_at    timestamptz default now(),
  unique (match_id, api_player_id)
);

create index idx_mpp_match on match_player_points(match_id);

alter table match_player_points enable row level security;

create policy "mpp_read_all"
  on match_player_points for select
  using (true);
