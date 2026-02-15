-- Enforce globally unique usernames (case-insensitive).
-- Run this in Supabase SQL Editor.

-- Check duplicates before creating the unique index.
-- If this returns rows, resolve those duplicates first.
select lower(btrim(display_name)) as normalized_username, count(*) as users
from public.profiles
where display_name is not null
  and btrim(display_name) <> ''
group by lower(btrim(display_name))
having count(*) > 1;

-- Unique index (case-insensitive, ignores null/blank values).
create unique index if not exists profiles_display_name_unique_idx
on public.profiles (lower(btrim(display_name)))
where display_name is not null
  and btrim(display_name) <> '';
