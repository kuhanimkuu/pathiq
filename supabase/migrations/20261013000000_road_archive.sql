-- Raw location samples kept up to 90 days, then turned into a permanent,
-- anonymous road archive and deleted (README "Location data and retention").
--
--   * Raw samples (location_samples) are no longer deleted by the nightly
--     speed roll-up; it marks them rolled_up instead.
--   * archive_location_samples() runs nightly. It takes every full UTC week
--     (Monday to Sunday) whose last day is at least 83 days old, so each
--     sample is between 83 and 90 days old when it goes, and:
--       - road_archive_cells: how often each ~11 m cell was driven, in which
--         direction and how fast (the shapes of roads, as many drives trace them)
--       - road_archive_turns: which way drivers left each ~110 m cell, by the
--         direction they arrived in (turns made, and turns never made)
--     Only rows where at least 5 different device-days contributed in that
--     week are kept. Device tokens, sample order and times finer than the
--     week are used during the run and never stored. Then the week's raw
--     samples are deleted, along with anything received over 90 days ago.
--   * Only the archive may be exported or backed up long term
--     (scripts/export-road-archive.mjs). Never the raw samples.

-- ── Speed roll-up: mark samples instead of deleting them ────────────────
alter table public.location_samples add column rolled_up boolean not null default false;
create index location_samples_pending_idx on public.location_samples (recorded_at) where not rolled_up;

create or replace function public.rollup_location_samples()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cutoff timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  rolled integer;
begin
  with picked as (
    update public.location_samples
       set rolled_up = true
     where not rolled_up and recorded_at < cutoff
    returning token, recorded_at, location, speed_mps, heading
  )
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
    from picked
   group by 1, 2, 3, 4, 5
  on conflict (cell_lat, cell_lng, heading_bin, hour_of_week, day) do update
     set samples      = d.samples + excluded.samples,
         speed_sum    = d.speed_sum + excluded.speed_sum,
         speed_n      = d.speed_n + excluded.speed_n,
         -- a late batch from the same token would be counted twice; the
         -- larger of the two is the safe (non-inflating) choice
         contributors = greatest(d.contributors, excluded.contributors);
  get diagnostics rolled = row_count;
  return rolled;
end;
$$;

-- ── The archive (permanent, anonymous) ──────────────────────────────────
create table public.road_archive_cells (
  week         date          not null,          -- Monday (UTC) of the week
  cell_lat     numeric(7, 4) not null,          -- snapped to 0.0001° (~11 m)
  cell_lng     numeric(8, 4) not null,
  heading_bin  smallint      not null,          -- 0..7 (45° each), -1 when unknown
  samples      integer       not null,
  speed_sum    double precision not null,       -- m/s, over samples with a speed
  speed_n      integer       not null,
  contributors integer       not null check (contributors >= 5), -- distinct device-days
  primary key (week, cell_lat, cell_lng, heading_bin)
);

create table public.road_archive_turns (
  week         date          not null,
  cell_lat     numeric(7, 3) not null,          -- the ~110 m cell the move ended in
  cell_lng     numeric(8, 3) not null,
  heading_in   smallint      not null check (heading_in between 0 and 7),
  heading_out  smallint      not null check (heading_out between 0 and 7),
  moves        integer       not null,
  contributors integer       not null check (contributors >= 5),
  primary key (week, cell_lat, cell_lng, heading_in, heading_out)
);

alter table public.road_archive_cells enable row level security;
alter table public.road_archive_turns enable row level security;
revoke all on public.road_archive_cells from anon, authenticated;
revoke all on public.road_archive_turns from anon, authenticated;

-- ── Archive, then delete ────────────────────────────────────────────────
create function public.archive_location_samples()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- Start of the week that holds "83 days ago": everything before it is in a
  -- full week whose last day is 83+ days old.
  cutoff timestamptz := date_trunc('week', (now() - interval '83 days') at time zone 'utc') at time zone 'utc';
  removed integer;
begin
  -- Speeds first, so a week that missed its nightly roll-up isn't lost.
  perform public.rollup_location_samples();

  insert into public.road_archive_cells as a
    (week, cell_lat, cell_lng, heading_bin, samples, speed_sum, speed_n, contributors)
  select date_trunc('week', recorded_at at time zone 'utc')::date,
         round(st_y(location::geometry)::numeric, 4),
         round(st_x(location::geometry)::numeric, 4),
         coalesce(((heading + 22) % 360) / 45, -1),
         count(*),
         coalesce(sum(speed_mps), 0),
         count(speed_mps),
         count(distinct token)
    from public.location_samples
   where recorded_at < cutoff
   group by 1, 2, 3, 4
  having count(distinct token) >= 5
  on conflict (week, cell_lat, cell_lng, heading_bin) do nothing;

  -- A move is two samples in a row from one device, at most 60 s and 300 m
  -- apart, both with a direction.
  insert into public.road_archive_turns as a
    (week, cell_lat, cell_lng, heading_in, heading_out, moves, contributors)
  select week, cell_lat, cell_lng, heading_in, heading_out, count(*), count(distinct token)
    from (
      select token,
             date_trunc('week', recorded_at at time zone 'utc')::date as week,
             round(st_y(location::geometry)::numeric, 3) as cell_lat,
             round(st_x(location::geometry)::numeric, 3) as cell_lng,
             ((lag(heading) over w + 22) % 360) / 45 as heading_in,
             ((heading + 22) % 360) / 45 as heading_out,
             recorded_at - lag(recorded_at) over w as gap,
             st_distance(location, lag(location) over w) as metres
        from public.location_samples
       where recorded_at < cutoff
      window w as (partition by token order by recorded_at)
    ) moves
   where heading_in is not null and heading_out is not null
     and gap <= interval '60 seconds' and metres <= 300
   group by 1, 2, 3, 4, 5
  having count(distinct token) >= 5
  on conflict (week, cell_lat, cell_lng, heading_in, heading_out) do nothing;

  delete from public.location_samples
   where recorded_at < cutoff or received_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.archive_location_samples() from public, anon, authenticated;
grant execute on function public.archive_location_samples() to service_role;

-- ── Schedule (where pg_cron is available, as on hosted Supabase) ────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pathiq-archive-location-samples', '45 0 * * *', 'select public.archive_location_samples()');
  end if;
end;
$$;

-- ── "Delete what I've shared" now covers 90 days of daily tokens ────────
create or replace function public.delete_location_samples(p_tokens uuid[])
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
  if coalesce(array_length(p_tokens, 1), 0) > 100 then
    raise exception 'Too many tokens.' using errcode = '22023';
  end if;
  delete from public.location_samples where token = any (p_tokens);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
