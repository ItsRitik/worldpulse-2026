-- Migration: fix "Database error saving new user" (2026-06-15)
-- ════════════════════════════════════════════════════════════
-- Every signup was failing because the handle_new_user() trigger throws and
-- aborts the auth.users insert. Two root causes, both fixed here:
--   1. SECURITY DEFINER function had no `set search_path`, so on current
--      Supabase it cannot resolve `user_profiles` (unqualified) → error.
--   2. Phone-OTP signups have a NULL email, so split_part(email,...) was fragile.
--
-- Fix: schema-qualify the table, pin search_path, and wrap the insert in an
-- exception block so a profile hiccup can NEVER block authentication.
--
-- Also widens fav_team_tla so 2–4 char team codes fit.
--
-- Run in Supabase Dashboard → SQL Editor.

-- Widen fav_team_tla (was char(3); some API team codes vary)
alter table public.user_profiles
  alter column fav_team_tla type varchar(4);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    -- display_name is left NULL on purpose: onboarding makes every user choose
    -- a unique manager name. Only the optional avatar is carried over.
    insert into public.user_profiles (id, avatar_url)
    values (new.id, new.raw_user_meta_data->>'avatar_url')
    on conflict (id) do nothing;
  exception when others then
    -- Never let a profile problem abort the auth signup.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Trigger is unchanged, but recreate to be safe
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
