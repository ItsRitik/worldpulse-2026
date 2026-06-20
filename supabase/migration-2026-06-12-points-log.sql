-- Migration: match_points_log (2026-06-12)
-- ═══════════════════════════════════════════
-- Append-only log of every points assignment, written by the scoring engine
-- each tick as a DELTA vs what was already logged. This fixes two bugs:
--   1. wrong minutes — entries were re-stamped with the latest tick minute
--   2. accumulating totals — "3 interceptions +12" instead of three +4 entries
--
-- Run in Supabase Dashboard → SQL Editor.

create table if not exists match_points_log (
  id            bigserial primary key,
  match_id      text         not null,   -- API-Football fixture id
  api_player_id integer      not null,
  player_name   text         not null,
  team_tla      text         not null,
  minute        integer      not null,   -- when the points were assigned
  event_type    text         not null,   -- goal | assist | tackle_won | …
  points        numeric(6,2) not null,   -- the delta awarded in THIS entry only
  label         text         not null,   -- human-readable, e.g. "Interception"
  created_at    timestamptz  default now()
);

create index if not exists idx_mpl_match  on match_points_log(match_id);
create index if not exists idx_mpl_player on match_points_log(match_id, api_player_id);

alter table match_points_log enable row level security;

drop policy if exists "mpl_read_all" on match_points_log;
create policy "mpl_read_all"
  on match_points_log for select
  using (true);
-- Only the service-role scoring engine writes.
