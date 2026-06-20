-- WorldPulse 2026 — Drop everything and start fresh
-- Run this FIRST in Supabase SQL Editor before running schema.sql
-- ⚠ This is destructive — all data will be lost.
-- Triggers are dropped automatically via CASCADE when their tables are dropped.

-- Drop functions (cascade removes dependent triggers)
drop function if exists touch_updated_at()         cascade;
drop function if exists validate_picks(uuid, uuid)  cascade;
drop function if exists handle_new_user()           cascade;

-- Drop tables — dependents first, CASCADE handles FKs
drop table if exists fantasy_picks          cascade;
drop table if exists fantasy_live_state     cascade;
drop table if exists fantasy_rooms          cascade;
drop table if exists match_lineup_players   cascade;
drop table if exists player_matchday_points cascade;
drop table if exists team_matchday_points   cascade;
drop table if exists transfers              cascade;
drop table if exists booster_usage          cascade;
drop table if exists team_players           cascade;
drop table if exists matchdays              cascade;
drop table if exists match_events           cascade;
drop table if exists players                cascade;
drop table if exists user_teams             cascade;
drop table if exists user_profiles          cascade;

-- Drop enums
drop type if exists position_type   cascade;
drop type if exists matchday_status cascade;
drop type if exists booster_type    cascade;
drop type if exists event_type      cascade;
drop type if exists room_status     cascade;
drop type if exists pick_role       cascade;

select 'All tables and types dropped ✓' as status;
