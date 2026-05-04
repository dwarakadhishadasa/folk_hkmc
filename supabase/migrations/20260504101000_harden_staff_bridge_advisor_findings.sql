create index if not exists invite_log_inviter_supabase_user_id_idx
on public.invite_log (inviter_supabase_user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
