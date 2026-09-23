-- "Gems near me" for the Home dashboard: a plain radius search around the
-- driver's current position, independent of any route. This works without
-- Google Maps at all (just the browser's Geolocation API), unlike
-- gems_along_route which needs a route polyline from the Routes API.

create function public.gems_near_point(
  lat        double precision,
  lng        double precision,
  radius_m   integer default 3000,
  categories public.gem_category[] default null
)
returns table (
  id                  uuid,
  name                text,
  category            public.gem_category,
  description         text,
  lng                 double precision,
  lat                 double precision,
  rating_avg          numeric,
  confirmations_count integer,
  distance_m          double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with origin as (
    select st_setsrid(st_makepoint(lng, lat), 4326)::geography as pt
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
    st_distance(g.location, origin.pt)
  from public.gems g, origin
  where g.status = 'verified'
    and st_dwithin(g.location, origin.pt, radius_m)
    and (categories is null or g.category = any (categories))
  order by 9
$$;

grant execute on function public.gems_near_point(double precision, double precision, integer, public.gem_category[]) to anon, authenticated;
