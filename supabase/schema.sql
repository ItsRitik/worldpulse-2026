-- WorldPulse 2026 — Clean Schema
-- Run AFTER drop-all.sql
-- Only stores what we actually own: users + fantasy history.
-- All player/match/lineup data comes from football-data.org API at runtime.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Shared trigger: auto-update updated_at ────────────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ── Enums ─────────────────────────────────────────────────────────────────────
create type position_type as enum ('GK', 'DEF', 'MID', 'FWD');
create type pick_role     as enum ('captain', 'vice_captain', 'player');
create type room_status   as enum ('waiting', 'locked', 'live', 'finished', 'cancelled');

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 1: user_profiles
-- Extends auth.users with display preferences.
-- fav_team_tla stored here for future personalised news/score emails.
-- ─────────────────────────────────────────────────────────────────────────────
create table user_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  fav_team_tla    char(3),          -- e.g. 'BRA' — for future push/email alerts
  phone           text,             -- optional, for future SMS alerts
  avatar_url      text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute function touch_updated_at();

-- Auto-create a profile row whenever a new user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into user_profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

alter table user_profiles enable row level security;

create policy "profiles_read_own"
  on user_profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on user_profiles for update
  using (id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 2: fantasy_rooms
-- One room = one 1v1 contest for one specific match.
-- Match details cached inline so history works without an API call.
-- ─────────────────────────────────────────────────────────────────────────────
create table fantasy_rooms (
  id               uuid primary key default gen_random_uuid(),
  -- Match info (from API, cached for history display)
  match_id         text        not null,   -- football-data.org fixture id
  match_label      text        not null,   -- "Brazil vs Argentina"
  home_team_tla    char(3)     not null,
  away_team_tla    char(3)     not null,
  kickoff_at       timestamptz not null,
  lock_at          timestamptz not null,   -- kickoff - 1h
  -- Participants
  host_id          uuid        not null references auth.users(id) on delete cascade,
  guest_id         uuid        references auth.users(id) on delete set null,
  -- State
  status           room_status not null default 'waiting',
  -- Results (filled after match by scoring engine)
  host_points      numeric(8,2),
  guest_points     numeric(8,2),
  winner_id        uuid        references auth.users(id),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index idx_rooms_host   on fantasy_rooms(host_id);
create index idx_rooms_guest  on fantasy_rooms(guest_id);
create index idx_rooms_match  on fantasy_rooms(match_id);
create index idx_rooms_status on fantasy_rooms(status);

create trigger rooms_updated_at
  before update on fantasy_rooms
  for each row execute function touch_updated_at();

alter table fantasy_rooms enable row level security;

-- Anyone can read a room by UUID (needed for invite link)
create policy "rooms_select_all"
  on fantasy_rooms for select
  using (true);

create policy "rooms_insert_host"
  on fantasy_rooms for insert
  with check (host_id = auth.uid());

create policy "rooms_update_participants"
  on fantasy_rooms for update
  using (host_id = auth.uid() or guest_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 3: fantasy_picks
-- Each user's 11 picks for a room. Player data stored inline —
-- no FK to a players table, so history is self-contained.
-- ─────────────────────────────────────────────────────────────────────────────
create table fantasy_picks (
  id              bigserial primary key,
  room_id         uuid          not null references fantasy_rooms(id) on delete cascade,
  user_id         uuid          not null references auth.users(id) on delete cascade,
  -- Player snapshot at pick time (from API)
  api_player_id   integer       not null,
  player_name     text          not null,
  player_short    text          not null,   -- last name / short name for display
  team_tla        char(3)       not null,
  position        position_type not null,
  jersey_number   integer,
  price           numeric(5,1)  not null,
  -- Role
  role            pick_role     not null default 'player',
  -- Points (null until match ends)
  base_points     numeric(8,2),
  multiplier      numeric(3,1),            -- 2.0 / 1.5 / 1.0
  total_points    numeric(8,2),            -- base * multiplier
  created_at      timestamptz   default now(),
  updated_at      timestamptz   default now(),
  unique(room_id, user_id, api_player_id)
);

create index idx_picks_room      on fantasy_picks(room_id);
create index idx_picks_user      on fantasy_picks(user_id);
create index idx_picks_room_user on fantasy_picks(room_id, user_id);

create trigger picks_updated_at
  before update on fantasy_picks
  for each row execute function touch_updated_at();

alter table fantasy_picks enable row level security;

create policy "picks_select_participants"
  on fantasy_picks for select
  using (
    exists (
      select 1 from fantasy_rooms r
      where r.id = room_id
        and (r.host_id = auth.uid() or r.guest_id = auth.uid())
    )
  );

create policy "picks_insert_own"
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

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 4: fantasy_live_state
-- One row per room, updated ~60s by the scoring engine during a live match.
-- Clients subscribe via Supabase Realtime — no polling needed.
-- ─────────────────────────────────────────────────────────────────────────────
create table fantasy_live_state (
  room_id         uuid primary key references fantasy_rooms(id) on delete cascade,
  match_minute    integer,
  match_status    text,            -- 'IN_PLAY' | 'PAUSED' | 'FINISHED'
  home_score      integer   default 0,
  away_score      integer   default 0,
  host_points     numeric(8,2) default 0,
  guest_points    numeric(8,2) default 0,
  last_event      jsonb,           -- { player_name, event_type, minute, points }
  events          jsonb not null default '[]',
  updated_at      timestamptz default now()
);

alter table fantasy_live_state enable row level security;

create policy "live_select_all"
  on fantasy_live_state for select
  using (true);

-- Only service role (scoring engine) can write — no client insert policy

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER: validate_picks
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function validate_picks(p_room_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_count    integer;
  v_budget   numeric;
  v_captains integer;
  v_vcs      integer;
  v_max_team integer;
begin
  select
    count(*),
    sum(price),
    count(*) filter (where role = 'captain'),
    count(*) filter (where role = 'vice_captain')
  into v_count, v_budget, v_captains, v_vcs
  from fantasy_picks
  where room_id = p_room_id and user_id = p_user_id;

  if v_count <> 11 then
    return jsonb_build_object('valid', false, 'error', format('Need 11 players, have %s', v_count));
  end if;
  if v_budget > 100 then
    return jsonb_build_object('valid', false, 'error', format('Over budget: %s / 100', v_budget));
  end if;
  if v_captains <> 1 then
    return jsonb_build_object('valid', false, 'error', 'Must set exactly 1 captain');
  end if;
  if v_vcs <> 1 then
    return jsonb_build_object('valid', false, 'error', 'Must set exactly 1 vice-captain');
  end if;

  select max(cnt) into v_max_team
  from (
    select team_tla, count(*) cnt
    from fantasy_picks
    where room_id = p_room_id and user_id = p_user_id
    group by team_tla
  ) t;

  if v_max_team > 7 then
    return jsonb_build_object('valid', false, 'error', 'Max 7 players from one team');
  end if;

  return jsonb_build_object('valid', true);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- REALTIME — enable CDC on the two tables clients subscribe to
-- Works on all Supabase plans including free.
-- ─────────────────────────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- match_player_points
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per (match, player). Written by the scoring engine every ~10 min.
-- All rooms using the same match fan-out from this table — no duplicate API calls.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists match_player_points (
  match_id        text        not null,  -- API-Football fixture id (as text)
  api_player_id   integer     not null,
  player_name     text        not null,
  team_tla        text        not null,
  position        text        not null,  -- GK/DEF/MID/FWD

  -- Running totals (overwritten each tick)
  base_points     numeric     not null default 0,

  -- Breakdown stored as JSONB so the UI can show "Goal +5, Yellow -1 …"
  events          jsonb       not null default '[]'::jsonb,
  -- e.g. [{"type":"goal","minute":23,"points":5},{"type":"yellow_card","minute":67,"points":-1}]

  -- Match state snapshot at last update
  match_minute    integer,
  match_status    text,        -- 'IN_PLAY' | 'PAUSED' | 'HT' | 'FINISHED'

  updated_at      timestamptz not null default now(),

  primary key (match_id, api_player_id)
);

-- Index so fan-out can quickly find all player rows for a match
create index if not exists idx_mpp_match_id on match_player_points (match_id);

-- RLS — service-role writes; authenticated users read
alter table match_player_points enable row level security;

create policy "Public read match_player_points"
  on match_player_points for select
  using (true);

-- Only service role (server) can insert/update
create policy "Service role write match_player_points"
  on match_player_points for all
  using (auth.role() = 'service_role');

alter publication supabase_realtime add table fantasy_live_state;
alter publication supabase_realtime add table fantasy_rooms;
alter publication supabase_realtime add table fantasy_picks;
alter publication supabase_realtime add table match_player_points;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables: user_profiles · fantasy_rooms · fantasy_picks · fantasy_live_state
-- ─────────────────────────────────────────────────────────────────────────────
select 'WorldPulse 2026 schema ready ✓' as status;
