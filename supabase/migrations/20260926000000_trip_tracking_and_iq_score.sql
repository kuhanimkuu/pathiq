-- Trip tracking, driver stats and a first, deliberately simple IQ Score.
--
-- A trip row is written when navigation starts and closed (ended_at) when the
-- driver arrives or ends it. Still no GPS trace: just the summary the score
-- needs.

alter table public.trips
  add column road_quality smallint check (road_quality between 0 and 100),  -- chosen route's score at start
  add column reroutes     smallint not null default 0 check (reroutes >= 0),
  add column arrived      boolean  not null default false;

-- A trip "counts" once it's over and was either completed or driven for more
-- than a couple of minutes — so tapping Start then End by mistake doesn't
-- register as a trip, or as an abandoned one.
create function public.trip_counts(t public.trips)
returns boolean
language sql
immutable
as $$
  select t.ended_at is not null
     and (t.arrived or t.ended_at - t.started_at > interval '2 minutes')
$$;

-- IQ Score v1 — "based on the last 30 days of driving" (description.md §2.4).
-- Over the driver's counted trips in the last 30 days:
--   50%  route choice:  average road-quality score of the routes they drove
--   30%  completion:    share of trips that reached the destination
--   20%  route keeping: 100 with no reroutes, 0 at three or more, per trip
-- Null (no score yet) until there's at least one counted trip.
create function public.compute_iq_score(p_user uuid)
returns smallint
language sql
stable
set search_path = public
as $$
  select case when count(*) = 0 then null else round(
      0.5 * avg(coalesce(t.road_quality, 70))
    + 0.3 * 100 * avg(case when t.arrived then 1 else 0 end)
    + 0.2 * avg(greatest(0, 100 - t.reroutes * 100.0 / 3))
  )::smallint end
  from public.trips t
  where t.user_id = p_user
    and t.started_at > now() - interval '30 days'
    and public.trip_counts(t)
$$;

-- profiles.iq_score isn't client-writable (see the profiles column grants in
-- the init migration), so it's kept current by this trigger instead.
create function public.refresh_iq_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set iq_score = public.compute_iq_score(new.user_id)
   where id = new.user_id;
  return new;
end;
$$;

create trigger trips_refresh_iq_score
  after insert or update of ended_at, arrived, reroutes, road_quality on public.trips
  for each row
  when (new.ended_at is not null)
  execute function public.refresh_iq_score();

-- Home/Profile stat cards for the signed-in driver.
--   trips_this_month: counted trips started this calendar month (Nairobi time)
--   gems_found:       distinct gems they've saved, rated, or been alerted to on a trip
create function public.my_driver_stats()
returns table (trips_this_month integer, gems_found integer)
language sql
stable
set search_path = public
as $$
  select
    (select count(*)::integer
       from public.trips t
      where t.user_id = auth.uid()
        and public.trip_counts(t)
        and t.started_at >= date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),
    (select count(distinct gem_id)::integer from (
        select gem_id from public.saved_gems where user_id = auth.uid()
        union
        select gem_id from public.gem_confirmations where user_id = auth.uid()
        union
        select e.gem_id from public.trip_gem_events e
          join public.trips t on t.id = e.trip_id
         where t.user_id = auth.uid()
     ) found)
$$;

grant execute on function public.my_driver_stats() to authenticated;
