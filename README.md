# Tapster landing page

## Start

```bash
npm run dev
```

Åbn `http://localhost:5173` i browseren.

Landing er på `/`, og playlisten ligger på `/playlist`.

## Playwright UI smoke test

Installer dependencies:

```bash
npm install
```

Kør screenshot-smoke-test (mobil viewport):

```bash
npm run test:e2e
```

Krav: Google Chrome installeret i `/Applications/Google Chrome.app`.

Screenshots gemmes i:

`artifacts/screenshots/`

Åbn Playwright UI runner:

```bash
npm run test:e2e:ui
```

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

create unique index if not exists profiles_display_name_unique_idx
on profiles (lower(btrim(display_name)))
where display_name is not null and btrim(display_name) <> '';

create table if not exists credit_payments (
  payment_intent_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_ore int not null,
  credits int not null,
  created_at timestamptz default now()
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

alter table credit_payments enable row level security;
create policy "service role manages credit payments"
on credit_payments
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
```

## Stripe setup (Custom payment flow)

1. Opret disse env vars i Supabase Functions:
`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `TAPSTER_SERVICE_ROLE_KEY`

2. Deploy functions:

```bash
supabase functions deploy stripe-create-payment-intent
supabase functions deploy stripe-webhook
```

3. I Stripe Dashboard:
- Brug `Custom payment flow`
- Opret webhook mod `https://xwafqfjhbiuogfjnlzln.supabase.co/functions/v1/stripe-webhook`
- Lyt på event: `payment_intent.succeeded`

4. Apple Pay:
- Verificér dit domæne i Stripe (Payment Method Domains), ellers vises Apple Pay ikke stabilt.
