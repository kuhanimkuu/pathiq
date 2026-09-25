-- One-tap destinations for the Routes tab: where you've navigated recently,
-- and the gems you've saved. Both are SECURITY INVOKER, so RLS on trips and
-- saved_gems already limits them to the caller's own rows.

-- Recent trip destinations, newest first, de-duplicated by name and by
-- position rounded to ~10 m.
create function public.my_recent_destinations(p_limit integer default 5)
returns table (name text, lat double precision, lng double precision, last_used timestamptz)
language sql
stable
set search_path = public, extensions
as $$
  select
    coalesce(t.destination_name, 'Dropped pin'),
    round(st_y(t.destination::geometry)::numeric, 4)::double precision,
    round(st_x(t.destination::geometry)::numeric, 4)::double precision,
    max(t.started_at)
  from public.trips t
  where t.user_id = auth.uid() and t.destination is not null
  group by 1, 2, 3
  order by 4 desc
  limit least(greatest(p_limit, 1), 20)
$$;

-- Saved gems with coordinates (the gems table stores a geography point).
create function public.my_saved_gems()
returns table (id uuid, name text, category public.gem_category, lat double precision, lng double precision)
language sql
stable
set search_path = public, extensions
as $$
  select g.id, g.name, g.category, st_y(g.location::geometry), st_x(g.location::geometry)
  from public.saved_gems s
  join public.gems g on g.id = s.gem_id
  where s.user_id = auth.uid() and g.status = 'verified'
  order by s.saved_at desc
$$;

revoke execute on function public.my_recent_destinations(integer) from public, anon;
revoke execute on function public.my_saved_gems() from public, anon;
grant execute on function public.my_recent_destinations(integer) to authenticated;
grant execute on function public.my_saved_gems() to authenticated;
