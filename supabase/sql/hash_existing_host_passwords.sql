-- One-time migration: convert existing plaintext DJ passwords to SHA-256 hashes.
-- New playlists are already stored as hashes by app code after this patch.

create extension if not exists pgcrypto;

update public.playlists
set host_password = 'sha256$' || encode(digest(host_password, 'sha256'), 'hex')
where coalesce(host_password, '') <> ''
  and host_password not like 'sha256$%';
