select
  u.id            as user_id,
  u.email,
  u.role,
  dc.id           as caller_id,
  dc.display_name,
  dc.is_active,
  dc.program_id
from public.users u
left join public.dialer_callers dc
  on dc.user_id = u.id
 and dc.program_id = u.program_id
where u.program_id = 'folk'
order by u.email;