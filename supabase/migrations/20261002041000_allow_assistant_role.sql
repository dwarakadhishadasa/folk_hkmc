alter table public.staff_profiles
  drop constraint if exists staff_profiles_role_check;
alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (role in ('Admin', 'Preacher', 'Volunteer', 'Assistant'));

alter table public.staff_memberships
  drop constraint if exists staff_memberships_role_check;
alter table public.staff_memberships
  add constraint staff_memberships_role_check
  check (role in ('Admin', 'Preacher', 'Volunteer', 'Assistant'));

alter table public.invite_log
  drop constraint if exists invite_log_invitee_role_check;
alter table public.invite_log
  add constraint invite_log_invitee_role_check
  check (invitee_role in ('Admin', 'Preacher', 'Volunteer', 'Assistant'));