-- Filely: global "total files transferred" counter
-- Run this ONCE in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Paste the CONTENTS of this file (not the filename) and click "Run".
--
-- Your stats table already exists with a uuid id and a single row, so this
-- script is safe to run as-is: it leaves the existing row/count untouched and
-- only (re)creates the increment function that the backend calls.

create extension if not exists pgcrypto;

-- 1. Ensure the stats table exists (matches the existing schema: uuid id).
create table if not exists public.stats (
  id            uuid        primary key default gen_random_uuid(),
  total_uploads bigint      not null    default 0,
  created_at    timestamptz not null    default now()
);

-- Ensure at least one row exists (no-op if you already have one).
insert into public.stats (total_uploads)
select 0
where not exists (select 1 from public.stats);

-- 2. Atomically add n to the single stats row; returns the new running total.
create or replace function public.increment_total_uploads(n integer default 1)
returns bigint
language plpgsql
as $$
declare
  target    uuid;
  new_total bigint;
begin
  -- Lock the singleton row so concurrent uploads can't lose an increment.
  select id
    into target
    from public.stats
   order by created_at asc
   limit 1
   for update;

  if target is null then
    insert into public.stats (total_uploads)
    values (greatest(n, 0))
    returning total_uploads into new_total;
  else
    update public.stats
       set total_uploads = coalesce(total_uploads, 0) + greatest(n, 0)
     where id = target
    returning total_uploads into new_total;
  end if;

  return new_total;
end;
$$;
