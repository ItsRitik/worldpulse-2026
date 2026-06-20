-- Migration: create match_player_points (2026-06-11)
-- ════════════════════════════════════════════════════
-- The live scoring engine (/api/scoring/match/[matchId]) upserts one row per
-- player per tick into this table, but it was never created in the live DB —
-- every tick currently logs "Could not find the table 'public.match_player_points'".
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query).

create table if not exists match_player_points (
  id            bigserial primary key,
  match_id      text        not null,          -- API-Football fixture id (as text)
  api_player_id integer     not null,
  player_name   text        not null,
  team_tla      text        not null,
  position      text        not null,          -- G / D / M / F (raw from API)
  base_points   numeric(8,2) not null default 0,
  events        jsonb       not null default '[]',  -- ScoringEvent[] breakdown
  match_minute  integer,
  match_status  text,                          -- 'NS' | '1H' | 'HT' | '2H' | 'FT' …
  updated_at    timestamptz default now(),
  unique (match_id, api_player_id)             -- upsert conflict target
);

create index if not exists idx_mpp_match on match_player_points(match_id);

alter table match_player_points enable row level security;

-- Read-only for everyone (used for per-player point breakdowns in the UI);
-- only the service-role scoring engine writes.
drop policy if exists "mpp_read_all" on match_player_points;
create policy "mpp_read_all"
  on match_player_points for select
  using (true);
