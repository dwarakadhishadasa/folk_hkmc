-- The record's `Books read` picker needs every value present in the caller's
-- scoped contacts. Reading that through PostgREST meant paging the whole
-- `contacts` table, selecting one array column, on every record open — one
-- round trip per 1000 contacts before the record could render.
--
-- This resolves the same set in a single query. `security invoker` keeps the
-- contacts RLS policy as the boundary: the caller sees distinct values from the
-- rows they may already read, exactly as the paged read did.

create or replace function public.contact_books_read_options(p_program_id text)
returns text[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(distinct book), '{}'::text[])
  from public.contacts c
  cross join lateral unnest(c.books_read) as book
  where c.program_id = p_program_id
    and book is not null
    and btrim(book) <> '';
$$;

revoke all on function public.contact_books_read_options(text) from public;
revoke all on function public.contact_books_read_options(text) from anon;
grant execute on function public.contact_books_read_options(text) to authenticated;
