-- Retire the Airtable-named schema objects.
--
-- Story 7.4 made `public.users` authoritative, so the Airtable bridge tables and
-- the `*_airtable_user_id` columns no longer describe anything. Renaming the
-- columns (rather than dropping them) keeps the invite and audit history that
-- lives in them.
--
-- Order matters for anyone replaying this: apply the DDL, regenerate
-- `lib/supabase/types.ts`, then rename the insert keys in `lib/invite-log.ts`
-- and `lib/authz.ts`. Doing the TypeScript side first breaks every
-- service-role insert with a PostgREST 42703 for an unknown column.

-- `alter table ... rename column` has no `if exists` form, so the guard is a
-- catalog check: only rename when the old column is present and the new name is
-- free. A re-apply is therefore a no-op rather than an error.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invite_log'
      and column_name = 'airtable_user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invite_log'
      and column_name = 'user_id'
  ) then
    alter table public.invite_log
      rename column airtable_user_id to user_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invite_log'
      and column_name = 'inviter_airtable_user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'invite_log'
      and column_name = 'inviter_user_id'
  ) then
    alter table public.invite_log
      rename column inviter_airtable_user_id to inviter_user_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_events'
      and column_name = 'actor_airtable_user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_events'
      and column_name = 'actor_user_id'
  ) then
    alter table public.audit_events
      rename column actor_airtable_user_id to actor_user_id;
  end if;
end
$$;

drop table if exists public.airtable_identities;
drop table if exists public.airtable_sync_state;
drop table if exists public.staff_profiles;
drop table if exists public.staff_memberships;
