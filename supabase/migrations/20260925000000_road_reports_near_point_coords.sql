-- road_reports_near_point didn't return coordinates, so the map had nowhere
-- to put incident markers. Same function, plus lng/lat. The return type
-- changes, so it has to be dropped and recreated rather than replaced.

drop function public.road_reports_near_point(double precision, double precision, integer);

create function public.road_reports_near_point(
  lat      double precision,
  lng      double precision,
  radius_m integer default 5000
)
returns table (
  id          uuid,
  type        public.road_report_type,
  severity    smallint,
  description text,
  created_at  timestamptz,
  distance_m  double precision,
  lng         double precision,
  lat         double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(st_makepoint(road_reports_near_point.lng, road_reports_near_point.lat), 4326)::geography as pt
  )
  select
    rr.id,
    rr.type,
    rr.severity,
    rr.description,
    rr.created_at,
    st_distance(rr.location, origin.pt),
    st_x(rr.location::geometry),
    st_y(rr.location::geometry)
  from public.road_reports rr, origin
  where rr.status = 'verified'
    and (rr.expires_at is null or rr.expires_at > now())
    and st_dwithin(rr.location, origin.pt, radius_m)
  order by 6
$$;

grant execute on function public.road_reports_near_point(double precision, double precision, integer) to anon, authenticated;
