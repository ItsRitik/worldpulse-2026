-- Migration: player_prices (2026-06-16)
-- ════════════════════════════════════════
-- Dream11-style credit values per player, derived from real club-season form
-- (rating, goals, assists, minutes). The lineups route computes a price from
-- API-Football and caches it here for 24h so we fetch each player at most once
-- a day. Run in Supabase Dashboard → SQL Editor.

create table if not exists public.player_prices (
  api_player_id int primary key,
  price         numeric(4,1) not null,
  rating        numeric(4,2),
  goals         int,
  assists       int,
  minutes       int,
  updated_at    timestamptz default now()
);

alter table public.player_prices enable row level security;
drop policy if exists player_prices_read_all on public.player_prices;
create policy player_prices_read_all on public.player_prices for select using (true);
-- Written only by the server (service role) — no client write policy.
