-- Trip history for the History tab: the caller's trips, newest first, with
-- the destination as lat/lng (for "Go again") and how many Hidden Gems they
-- were alerted to on each. SECURITY INVOKER: RLS on trips and trip_gem_events
-- limits it to the caller's own rows. Paged with p_before (a started_at).

create function public.my_trip_history(p_limit integer default 30, p_before timestamptz default null)
returns table (
  id               uuid,
  destination_name text,
  lat              double precision,
  lng              double precision,
  route_option     public.route_option,
  distance_m       integer,
  duration_s       integer,
  road_quality     smallint,
  reroutes         smallint,
  arrived          boolean,
  started_at       timestamptz,
  ended_at         timestamptz,
  gems_alerted     integer
)
language sql
stable
set search_path = public, extensions
as $$
  select
    t.id,
    t.destination_name,
    st_y(t.destination::geometry),
    st_x(t.destination::geometry),
    t.route_option,
    t.distance_m,
    t.duration_s,
    t.road_quality,
    t.reroutes,
    t.arrived,
    t.started_at,
    t.ended_at,
    (select count(distinct e.gem_id)::integer from public.trip_gem_events e where e.trip_id = t.id)
  from public.trips t
  where t.user_id = auth.uid()
    and (p_before is null or t.started_at < p_before)
  order by t.started_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

revoke execute on function public.my_trip_history(integer, timestamptz) from public, anon;
grant execute on function public.my_trip_history(integer, timestamptz) to authenticated;
