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
create table if not exists bars (
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
  cover text,
  spotify_web_url text,
  spotify_app_url text
);

-- RLS policies (example)
alter table bars enable row level security;
alter table requests enable row level security;

create policy "public read bars" on bars for select using (true);
create policy "user insert bars" on bars for insert with check (auth.uid() = owner_id);

create policy "public read requests" on requests for select using (true);
create policy "public insert requests" on requests for insert with check (true);
create policy "public update requests" on requests for update using (true) with check (true);
create policy "public delete requests" on requests for delete using (true);
```
