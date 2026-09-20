-- PathIQ Navigators: initial schema
-- Users, Hidden Gems, road reports, Scout earnings, trips, and the spatial
-- queries used by the suggestion engine and the route intelligence engine.

-- =====================================================================
-- Extensions and enums
-- =====================================================================

create extension if not exists postgis with schema extensions;

create type public.user_role as enum ('driver', 'scout', 'admin');
create type public.user_plan as enum ('free', 'paid');
create type public.gem_category as enum ('attractions', 'hotels', 'food', 'scenic', 'fuel', 'facilities');
create type public.review_status as enum ('pending', 'verified', 'rejected');
create type public.road_report_type as enum ('pothole', 'flooding', 'construction', 'surface', 'incident');
create type public.earning_task as enum ('road_report', 'place_verification', 'gem_discovery', 'flood_survey');
create type public.earning_status as enum ('pending', 'approved', 'paid');
create type public.route_option as enum ('recommended', 'fastest', 'best_road');
create type public.gem_event_type as enum ('approaching', 'passed');

-- =====================================================================
-- Helpers
-- =====================================================================

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- Profiles
-- =====================================================================

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text not null unique check (char_length(username) between 3 and 30),
  display_name     text,
  role             public.user_role not null default 'driver',
  plan             public.user_plan not null default 'free',
  iq_score         smallint check (iq_score between 0 and 100),
  notifications_on boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role checks are security definer so policies on profiles and other tables
-- can call them without recursing into profiles' own RLS.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create function public.is_scout()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('scout', 'admin'));
$$;

-- Every new auth user gets a profile. The sign-up form passes the username as
-- user metadata: supabase.auth.signUp({ email, password, options: { data: { username } } })
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), 'user_' || left(new.id::text, 8)),
    nullif(new.raw_user_meta_data ->> 'username', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Users may only edit these columns. role, plan and iq_score are changed by
-- admins or the service role, never by the client.
revoke update on public.profiles from authenticated;
grant update (username, display_name, notifications_on) on public.profiles to authenticated;

-- =====================================================================
-- Hidden Gems
-- =====================================================================

create table public.gems (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text,
  category            public.gem_category not null,
  location            geography(Point, 4326) not null,
  address             text,
  status              public.review_status not null default 'pending',
  rating_avg          numeric(2, 1),
  rating_count        integer not null default 0,
  confirmations_count integer not null default 0,
  created_by          uuid references public.profiles (id) on delete set null,
  verified_by         uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index gems_location_idx on public.gems using gist (location);
create index gems_verified_category_idx on public.gems (category) where status = 'verified';

create trigger gems_set_updated_at
  before update on public.gems
  for each row execute function public.set_updated_at();

alter table public.gems enable row level security;

create policy "gems: read verified, own or admin" on public.gems
  for select to authenticated
  using (status = 'verified' or created_by = auth.uid() or public.is_admin());

create policy "gems: scouts submit pending, admins add any" on public.gems
  for insert to authenticated
  with check (
    public.is_admin()
    or (created_by = auth.uid() and status = 'pending' and public.is_scout())
  );

create policy "gems: admin update" on public.gems
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "gems: admin delete" on public.gems
  for delete to authenticated
  using (public.is_admin());

-- Community confirmations, with an optional 1-5 rating.
create table public.gem_confirmations (
  gem_id     uuid not null references public.gems (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  rating     smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (gem_id, user_id)
);

create function public.refresh_gem_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.gem_id, old.gem_id);
begin
  update public.gems
  set confirmations_count = (select count(*) from public.gem_confirmations where gem_id = target),
      rating_count        = (select count(rating) from public.gem_confirmations where gem_id = target),
      rating_avg          = (select round(avg(rating), 1) from public.gem_confirmations where gem_id = target)
  where id = target;
  return null;
end;
$$;

create trigger gem_confirmations_refresh_stats
  after insert or update or delete on public.gem_confirmations
  for each row execute function public.refresh_gem_stats();

revoke execute on function public.refresh_gem_stats() from public, anon, authenticated;

alter table public.gem_confirmations enable row level security;

create policy "gem_confirmations: manage own" on public.gem_confirmations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Gems a driver saved ("just passed" suggestions, trip planning).
create table public.saved_gems (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  gem_id   uuid not null references public.gems (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, gem_id)
);

alter table public.saved_gems enable row level security;

create policy "saved_gems: manage own" on public.saved_gems
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- Road reports (feed the route intelligence engine)
-- =====================================================================

create table public.road_reports (
  id          uuid primary key default gen_random_uuid(),
  type        public.road_report_type not null,
  severity    smallint not null check (severity between 1 and 5),
  confidence  numeric(3, 2) check (confidence between 0 and 1),
  location    geography(Point, 4326) not null,
  path        geography(LineString, 4326),  -- optional: the affected stretch of road
  description text,
  photo_path  text,                          -- object path in the scout-photos bucket
  status      public.review_status not null default 'pending',
  reported_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz,                   -- null = no fixed expiry, the engine decays by age
  created_at  timestamptz not null default now()
);

create index road_reports_location_idx on public.road_reports using gist (location);
create index road_reports_verified_idx on public.road_reports (type) where status = 'verified';

alter table public.road_reports enable row level security;

create policy "road_reports: read verified, own or admin" on public.road_reports
  for select to authenticated
  using (
    (status = 'verified' and (expires_at is null or expires_at > now()))
    or reported_by = auth.uid()
    or public.is_admin()
  );

create policy "road_reports: scouts submit pending, admins add any" on public.road_reports
  for insert to authenticated
  with check (
    public.is_admin()
    or (reported_by = auth.uid() and status = 'pending' and public.is_scout())
  );

create policy "road_reports: admin update" on public.road_reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "road_reports: admin delete" on public.road_reports
  for delete to authenticated
  using (public.is_admin());

-- =====================================================================
-- Scout earnings (M-Pesa payouts are made by an admin or edge function)
-- =====================================================================

create table public.task_rates (
  task       public.earning_task primary key,
  amount_kes integer not null check (amount_kes > 0)
);

insert into public.task_rates (task, amount_kes) values
  ('road_report', 150),
  ('place_verification', 200),
  ('gem_discovery', 350),
  ('flood_survey', 500);

alter table public.task_rates enable row level security;

create policy "task_rates: read" on public.task_rates
  for select to authenticated using (true);

create policy "task_rates: admin manage" on public.task_rates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table public.scout_earnings (
  id             uuid primary key default gen_random_uuid(),
  scout_id       uuid not null references public.profiles (id) on delete cascade,
  task           public.earning_task not null,
  amount_kes     integer not null check (amount_kes > 0),
  status         public.earning_status not null default 'pending',
  road_report_id uuid references public.road_reports (id) on delete set null,
  gem_id         uuid references public.gems (id) on delete set null,
  mpesa_ref      text,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz
);

create index scout_earnings_scout_idx on public.scout_earnings (scout_id, created_at desc);

alter table public.scout_earnings enable row level security;

create policy "scout_earnings: read own or admin" on public.scout_earnings
  for select to authenticated
  using (scout_id = auth.uid() or public.is_admin());

create policy "scout_earnings: admin manage" on public.scout_earnings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =====================================================================
-- Trips
-- =====================================================================

-- Start, end and summary only. The full GPS trace is deliberately not stored.
create table public.trips (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  origin_name      text,
  destination_name text,
  origin           geography(Point, 4326),
  destination      geography(Point, 4326),
  route_option     public.route_option,
  distance_m       integer,
  duration_s       integer,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz
);

create index trips_user_idx on public.trips (user_id, started_at desc);

alter table public.trips enable row level security;

create policy "trips: manage own" on public.trips
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Which gems were suggested on a trip. Used to enforce once-per-trip and,
-- later, to learn what a driver acts on.
create table public.trip_gem_events (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  gem_id      uuid not null references public.gems (id) on delete cascade,
  event       public.gem_event_type not null,
  occurred_at timestamptz not null default now(),
  unique (trip_id, gem_id, event)
);

alter table public.trip_gem_events enable row level security;

create policy "trip_gem_events: manage own" on public.trip_gem_events
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- =====================================================================
-- Route cache (server only)
-- =====================================================================

-- Written and read by the route edge function with the service role.
-- RLS is on with no policies, so the client cannot touch it.
create table public.route_cache (
  key        text primary key,
  response   jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index route_cache_expires_idx on public.route_cache (expires_at);

alter table public.route_cache enable row level security;

revoke all on public.route_cache from anon, authenticated;

-- =====================================================================
-- Spatial queries for the engines
-- =====================================================================

-- route_wkt is a WGS84 LINESTRING in lng/lat order, for example
-- 'LINESTRING(36.82 -1.29, 36.80 -1.27)'. The client decodes Google's encoded
-- polyline into this form.

-- Suggestion engine: verified gems inside a corridor around the route, in
-- driving order. route_fraction (0 to 1) is the gem's position along the route.
create function public.gems_along_route(
  route_wkt  text,
  corridor_m integer default 500,
  categories public.gem_category[] default null
)
returns table (
  id                   uuid,
  name                 text,
  category             public.gem_category,
  description          text,
  lng                  double precision,
  lat                  double precision,
  rating_avg           numeric,
  confirmations_count  integer,
  distance_from_route_m double precision,
  route_fraction       double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with r as (
    select st_geomfromtext(route_wkt, 4326) as line
  )
  select
    g.id,
    g.name,
    g.category,
    g.description,
    st_x(g.location::geometry),
    st_y(g.location::geometry),
    g.rating_avg,
    g.confirmations_count,
    st_distance(g.location, r.line::geography),
    st_linelocatepoint(r.line, g.location::geometry)
  from public.gems g, r
  where g.status = 'verified'
    and st_dwithin(g.location, r.line::geography, corridor_m)
    and (categories is null or g.category = any (categories))
  order by 10
$$;

-- Route intelligence engine: verified, unexpired road reports near a route.
create function public.road_reports_along_route(
  route_wkt  text,
  corridor_m integer default 50
)
returns table (
  id                    uuid,
  type                  public.road_report_type,
  severity              smallint,
  confidence            numeric,
  lng                   double precision,
  lat                   double precision,
  created_at            timestamptz,
  distance_from_route_m double precision,
  route_fraction        double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with r as (
    select st_geomfromtext(route_wkt, 4326) as line
  )
  select
    rr.id,
    rr.type,
    rr.severity,
    rr.confidence,
    st_x(rr.location::geometry),
    st_y(rr.location::geometry),
    rr.created_at,
    st_distance(rr.location, r.line::geography),
    st_linelocatepoint(r.line, rr.location::geometry)
  from public.road_reports rr, r
  where rr.status = 'verified'
    and (rr.expires_at is null or rr.expires_at > now())
    and st_dwithin(rr.location, r.line::geography, corridor_m)
  order by 9
$$;

-- =====================================================================
-- Storage: Scout photos
-- =====================================================================

-- Private bucket. Files live under <user id>/<file name>.
insert into storage.buckets (id, name, public)
values ('scout-photos', 'scout-photos', false)
on conflict (id) do nothing;

create policy "scout-photos: scouts upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'scout-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_scout()
  );

create policy "scout-photos: read own or admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'scout-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
