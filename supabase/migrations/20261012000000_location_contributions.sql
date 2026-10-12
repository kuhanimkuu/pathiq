-- Opt-in location contributions: anonymised GPS samples from navigation,
-- rolled up into road-speed statistics (PathIQ's own traffic data).
--
-- Privacy design (see the privacy policy, "Helping improve road data"):
--   * Off by default. A driver turns it on in Profile; the server records
--     when (location_sharing_at), so consent can't be backdated by a client.
--   * Samples carry no user id. Each device sends a random token that it
--     replaces every day, so a day's trips can't be linked to an account or
--     to the next day's.
--   * The app drops everything within 200 m of where a trip starts and ends
--     (homes, offices) before sending anything.
--   * Raw samples live until the nightly roll-up (at most 7 days as a
--     backstop), then only per-cell statistics remain.
--   * Statistics are only published for cells where at least 5 different
--     device-days contributed.
--   * Nothing here is readable by clients; writes go through one rate-limited
--     function that checks consent.

-- ── Consent ─────────────────────────────────────────────────────────────
alter table public.profiles add column location_sharing_at timestamptz;

-- Set by the server only (not in the profiles column grants).
create function public.set_location_sharing(p_on boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  update public.profiles
     set location_sharing_at = case when p_on then coalesce(location_sharing_at, now()) else null end
   where id = auth.uid()
  returning location_sharing_at into at;
  return at;
end;
$$;

revoke execute on function public.set_location_sharing(boolean) from public, anon;
grant execute on function public.set_location_sharing(boolean) to authenticated;

-- ── Raw samples (short-lived) ───────────────────────────────────────────
create table public.location_samples (
  id          bigint generated always as identity primary key,
  token       uuid        not null,             -- the device's token for that day; not a user id
  recorded_at timestamptz not null,
  location    extensions.geography(point, 4326) not null,
  speed_mps   real check (speed_mps between 0 and 70),
  heading     smallint check (heading between 0 and 359),
  received_at timestamptz not null default now()
);

create index location_samples_recorded_idx on public.location_samples (recorded_at);
create index location_samples_token_idx on public.location_samples (token);

alter table public.location_samples enable row level security;
revoke all on public.location_samples from anon, authenticated;

-- ── Roll-up: per ~110 m cell, direction, hour of week and day ──────────
create table public.road_speed_daily (
  cell_lat     numeric(7, 3) not null,          -- cell centre, snapped to 0.001°
  cell_lng     numeric(8, 3) not null,
  heading_bin  smallint      not null,          -- 0..7 (45° each), -1 when unknown
  hour_of_week smallint      not null check (hour_of_week between 0 and 167), -- UTC
  day          date          not null,
  samples      integer       not null,
  speed_sum    double precision not null,       -- m/s, over samples with a speed
  speed_n      integer       not null,
  contributors integer       not null,          -- distinct device tokens that day
  primary key (cell_lat, cell_lng, heading_bin, hour_of_week, day)
);

create index road_speed_daily_day_idx on public.road_speed_daily (day);

alter table public.road_speed_daily enable row level security;
revoke all on public.road_speed_daily from anon, authenticated;

-- ── Contributing ────────────────────────────────────────────────────────
-- p_samples: [{ "lat", "lng", "t" (ISO time), "speed" (m/s, optional),
-- "heading" (degrees, optional) }], at most 200 per call. Bad samples are
-- skipped, not stored. Returns how many were kept.
create function public.contribute_location_samples(p_token uuid, p_samples jsonb)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  kept integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and location_sharing_at is not null) then
    raise exception 'Location sharing is off.' using errcode = '42501';
  end if;
  if p_token is null or jsonb_typeof(p_samples) <> 'array' or jsonb_array_length(p_samples) > 200 then
    raise exception 'Send up to 200 samples with a token.' using errcode = '22023';
  end if;
  if not public.consume_rate_limit('location:' || auth.uid(), 120, interval '1 hour') then
    raise exception 'Too many location uploads in the last hour. Please try again later.' using errcode = 'PT429';
  end if;

  with parsed as (
    select (s ->> 'lat')::double precision as lat,
           (s ->> 'lng')::double precision as lng,
           (s ->> 't')::timestamptz as t,
           (s ->> 'speed')::real as speed,
           round((s ->> 'heading')::numeric)::integer as heading
      from jsonb_array_elements(p_samples) s
     where jsonb_typeof(s) = 'object'
       and jsonb_typeof(s -> 'lat') = 'number'
       and jsonb_typeof(s -> 'lng') = 'number'
       and jsonb_typeof(s -> 't') = 'string'
       and (s -> 'speed' is null or jsonb_typeof(s -> 'speed') in ('number', 'null'))
       and (s -> 'heading' is null or jsonb_typeof(s -> 'heading') in ('number', 'null'))
  )
  insert into public.location_samples (token, recorded_at, location, speed_mps, heading)
  select p_token,
         t,
         st_setsrid(st_makepoint(lng, lat), 4326)::geography,
         case when speed between 0 and 70 then speed end,
         case when heading between 0 and 359 then heading end
    from parsed
   where lat between -90 and 90
     and lng between -180 and 180
     and t between now() - interval '1 day' and now() + interval '5 minutes';
  get diagnostics kept = row_count;
  return kept;
end;
$$;

revoke execute on function public.contribute_location_samples(uuid, jsonb) from public, anon;
grant execute on function public.contribute_location_samples(uuid, jsonb) to authenticated;

-- "Delete what I've shared": the device knows its own recent tokens (it made
-- them); raw samples for those are removed. Statistics already rolled up are
-- anonymous and stay.
create function public.delete_location_samples(p_tokens uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_tokens, 1), 0) > 60 then
    raise exception 'Too many tokens.' using errcode = '22023';
  end if;
  delete from public.location_samples where token = any (p_tokens);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.delete_location_samples(uuid[]) from public, anon;
grant execute on function public.delete_location_samples(uuid[]) to authenticated;

-- ── Nightly roll-up ─────────────────────────────────────────────────────
-- Folds every sample from before today (UTC) into road_speed_daily, then
-- deletes them. Also drops anything older than 7 days whatever happened.
create function public.rollup_location_samples()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cutoff timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  rolled integer;
begin
  insert into public.road_speed_daily as d
    (cell_lat, cell_lng, heading_bin, hour_of_week, day, samples, speed_sum, speed_n, contributors)
  select round(st_y(location::geometry)::numeric, 3),
         round(st_x(location::geometry)::numeric, 3),
         coalesce(((heading + 22) % 360) / 45, -1),
         (extract(isodow from recorded_at at time zone 'utc')::integer - 1) * 24
           + extract(hour from recorded_at at time zone 'utc')::integer,
         (recorded_at at time zone 'utc')::date,
         count(*),
         coalesce(sum(speed_mps), 0),
         count(speed_mps),
         count(distinct token)
    from public.location_samples
   where recorded_at < cutoff
   group by 1, 2, 3, 4, 5
  on conflict (cell_lat, cell_lng, heading_bin, hour_of_week, day) do update
     set samples      = d.samples + excluded.samples,
         speed_sum    = d.speed_sum + excluded.speed_sum,
         speed_n      = d.speed_n + excluded.speed_n,
         -- a late batch from the same token would be counted twice; the
         -- larger of the two is the safe (non-inflating) choice
         contributors = greatest(d.contributors, excluded.contributors);

  delete from public.location_samples where recorded_at < cutoff or received_at < now() - interval '7 days';
  get diagnostics rolled = row_count;
  return rolled;
end;
$$;

revoke execute on function public.rollup_location_samples() from public, anon, authenticated;
grant execute on function public.rollup_location_samples() to service_role;

-- ── Reading the statistics ──────────────────────────────────────────────
-- Typical speed per cell and direction around a point over the last 28
-- days, only where at least 5 device-days contributed. Public: it's
-- aggregate road data, the same kind the developer API will sell.
create function public.road_speeds_near(p_lat double precision, p_lng double precision, p_radius_m integer default 2000)
returns table (lat numeric, lng numeric, heading_bin smallint, avg_speed_kmh numeric, contributors bigint)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select d.cell_lat, d.cell_lng, d.heading_bin,
         round((sum(d.speed_sum) / nullif(sum(d.speed_n), 0) * 3.6)::numeric, 1),
         sum(d.contributors)
    from public.road_speed_daily d
   where d.day >= current_date - 28
     -- cheap box on the primary key first (1° of latitude ≈ 111 km)
     and d.cell_lat between p_lat - 0.1 and p_lat + 0.1
     and st_dwithin(
           st_setsrid(st_makepoint(d.cell_lng::double precision, d.cell_lat::double precision), 4326)::geography,
           st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
           least(greatest(p_radius_m, 100), 10000))
   group by d.cell_lat, d.cell_lng, d.heading_bin
  having sum(d.contributors) >= 5 and sum(d.speed_n) > 0
   limit 2000;
$$;

revoke execute on function public.road_speeds_near(double precision, double precision, integer) from public;
grant execute on function public.road_speeds_near(double precision, double precision, integer) to anon, authenticated;

-- ── Schedule (where pg_cron is available, as on hosted Supabase) ────────
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('pathiq-rollup-location-samples', '15 0 * * *', 'select public.rollup_location_samples()');
  end if;
end;
$$;
