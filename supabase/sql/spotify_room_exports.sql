-- Room-level Spotify export memory for Tapster

create table if not exists public.spotify_room_exports (
  room_id text primary key references public.playlists(code) on delete cascade,
  spotify_playlist_id text not null,
  spotify_playlist_url text,
  spotify_playlist_uri text,
  spotify_playlist_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spotify_room_export_tracks (
  room_id text not null references public.playlists(code) on delete cascade,
  track_uri text not null,
  exported_at timestamptz not null default now(),
  primary key (room_id, track_uri)
);

create index if not exists spotify_room_export_tracks_room_idx
  on public.spotify_room_export_tracks (room_id);
