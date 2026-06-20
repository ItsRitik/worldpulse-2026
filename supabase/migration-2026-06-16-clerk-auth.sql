-- Migration: move identity from Supabase Auth to Clerk (2026-06-16)
-- ════════════════════════════════════════════════════════════════════
-- Auth is now Clerk. Clerk user ids are TEXT (e.g. "user_2ab…"), not UUIDs,
-- and there's no auth.users row. So:
--   1. drop the Supabase-auth signup trigger
--   2. DROP all RLS policies (they reference the id columns we're changing)
--   3. drop every FK to auth.users
--   4. convert id columns to text
--   5. recreate RLS as public-read (writes go through Clerk-authenticated API
--      routes using the service role, which bypasses RLS)
--
-- Safe to re-run. Run in Supabase Dashboard → SQL Editor.

-- ── 1. Drop the old auth signup trigger/function ─────────────────────────────
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- ── 2. Drop ALL policies on the affected tables (must happen before ALTER) ────
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('user_profiles','fantasy_rooms','fantasy_picks','fantasy_live_state','fantasy_room_members')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- ── 3. Drop FKs to auth.users ────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select c.conname, t.relname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_class f on f.oid = c.confrelid
    join pg_namespace fn on fn.oid = f.relnamespace
    where c.contype = 'f' and fn.nspname = 'auth' and f.relname = 'users'
      and t.relname in ('user_profiles','fantasy_rooms','fantasy_picks','fantasy_room_members')
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;

-- ── 4. Convert identity columns to text (idempotent: skip if already text) ────
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema='public' and table_name='user_profiles' and column_name='id') <> 'text' then
    alter table public.user_profiles       alter column id        type text using id::text;
    alter table public.fantasy_rooms        alter column host_id   type text using host_id::text;
    alter table public.fantasy_rooms        alter column guest_id  type text using guest_id::text;
    alter table public.fantasy_rooms        alter column winner_id type text using winner_id::text;
    alter table public.fantasy_picks        alter column user_id   type text using user_id::text;
    alter table public.fantasy_room_members alter column user_id   type text using user_id::text;
  end if;
end $$;

-- ── 5. Recreate RLS — public read, writes via service role only ──────────────
do $$
declare tbl text;
begin
  foreach tbl in array array['user_profiles','fantasy_rooms','fantasy_picks','fantasy_live_state','fantasy_room_members'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_read_all', tbl);
    execute format('create policy %I on public.%I for select using (true)', tbl || '_read_all', tbl);
  end loop;
end $$;
