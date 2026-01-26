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
```
