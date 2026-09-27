-- The landing page's live map (src/pages/marketing/sections/HeroMap.jsx) is
-- seen by visitors with no session at all, and gems / road_reports are only
-- readable by signed-in users (guests included). Rather than open those tables
-- to anon, which would also expose who submitted what, this returns just what
-- the map draws: verified gems and live verified reports around Nairobi, with
-- no submitter, description or photo. No parameters, so it can't be pointed
-- elsewhere, and the result is capped.

create function public.public_map_points()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with nairobi as (
    select st_setsrid(st_makepoint(36.8167, -1.2833), 4326)::geography as pt
  )
  select jsonb_build_object(
    'gems', coalesce((
      select jsonb_agg(g order by g.distance_m)
      from (
        select gm.id, gm.name, gm.category,
               st_x(gm.location::geometry) as lng,
               st_y(gm.location::geometry) as lat,
               st_distance(gm.location, n.pt) as distance_m
        from public.gems gm, nairobi n
        where gm.status = 'verified'
          and st_dwithin(gm.location, n.pt, 25000)
        order by 6
        limit 300
      ) g
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(r order by r.distance_m)
      from (
        select rr.id, rr.type, rr.severity,
               st_x(rr.location::geometry) as lng,
               st_y(rr.location::geometry) as lat,
               st_distance(rr.location, n.pt) as distance_m
        from public.road_reports rr, nairobi n
        where rr.status = 'verified'
          and (rr.expires_at is null or rr.expires_at > now())
          and st_dwithin(rr.location, n.pt, 25000)
        order by 6
        limit 300
      ) r
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.public_map_points() from public;
grant execute on function public.public_map_points() to anon, authenticated;
