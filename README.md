# Tapster landing page

## Start

```bash
npm run dev
```

Åbn `http://localhost:5173` i browseren.

Landing er på `/`, og playlisten ligger på `/playlist`.

## Supabase schema

Kør følgende i Supabase SQL editor:

```sql
create table if not exists playlists (
  code text primary key,
  bar_name text not null,
  playlist_name text,
  host_password text not null,
  owner_id uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists requests (
  id text primary key,
  room_id text not null,
  requester_id uuid references auth.users(id),
  track_title text,
  artist text,
  comment text,
  status text,
  created_at timestamptz,
  played_at timestamptz,
  upvotes int default 0,
  downvotes int default 0,
  dj_pinned boolean default false,
  paid_boosts int default 0,
  paid_boosts_up int default 0,
  paid_boosts_down int default 0,
  cover text,
  spotify_web_url text,
  spotify_app_url text
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  credits int default 10,
  updated_at timestamptz default now()
);

-- RLS policies (example)
alter table playlists enable row level security;
alter table requests enable row level security;
alter table profiles enable row level security;

create policy "public read playlists" on playlists for select using (true);
create policy "user insert playlists" on playlists for insert with check (auth.uid() = owner_id);

create policy "public read requests" on requests for select using (true);
create policy "public insert requests" on requests for insert with check (true);
create policy "public update requests" on requests for update using (true) with check (true);
create policy "public delete requests" on requests for delete using (true);

create policy "users read own profile" on profiles for select using (auth.uid() = id);
create policy "users upsert own profile" on profiles for insert with check (auth.uid() = id);
create policy "users update own profile" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
```
