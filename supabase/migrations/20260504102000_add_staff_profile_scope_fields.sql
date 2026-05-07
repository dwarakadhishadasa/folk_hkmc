alter table public.staff_profiles
  add column if not exists location_ids text[] not null default '{}'::text[],
  add column if not exists assigned_preacher_airtable_user_id text;
