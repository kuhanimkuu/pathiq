-- Admin dashboard, second pass: a map of everything, user and gem detail,
-- Google Routes usage and cost, bulk gem import, merging duplicate gems, and
-- suspending accounts. Every admin_* function starts with admin_guard()
-- (admin role + recent password/Google sign-in + per-admin rate limit).

-- =====================================================================
-- Suspensions
-- =====================================================================
-- The map is open to anyone (guests need no account), so "banning" someone
-- can't mean keeping them off the map. It means they can no longer
-- contribute: no gems, road reports, photos, ratings or Scout applications.

alter table public.profiles
  add column suspended_until   timestamptz,
  add column suspension_reason text check (char_length(suspension_reason) <= 500);

create function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and suspended_until > now());
$$;

revoke execute on function public.is_suspended() from public, anon;
grant execute on function public.is_suspended() to authenticated;

create function public.block_suspended_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nested, not `and`: only storage.objects rows have bucket_id.
  if tg_table_name = 'objects' then
    if new.bucket_id <> 'scout-photos' then
      return new;
    end if;
  end if;
  if auth.uid() is not null and public.is_suspended() then
    raise exception 'Your account is suspended, so you can''t add or rate places right now.' using errcode = 'PT403';
  end if;
  return new;
end;
$$;

revoke execute on function public.block_suspended_writes() from public, anon, authenticated;

create trigger gems_block_suspended before insert on public.gems
  for each row execute function public.block_suspended_writes();
create trigger road_reports_block_suspended before insert on public.road_reports
  for each row execute function public.block_suspended_writes();
create trigger scout_applications_block_suspended before insert on public.scout_applications
  for each row execute function public.block_suspended_writes();
create trigger gem_confirmations_block_suspended before insert or update on public.gem_confirmations
  for each row execute function public.block_suspended_writes();
create trigger scout_photos_block_suspended before insert on storage.objects
  for each row execute function public.block_suspended_writes();

-- p_until null = until lifted. Admins can't be suspended (demote first), and
-- nobody can suspend themselves.
create function public.admin_suspend_user(p_user_id uuid, p_until timestamptz default null, p_reason text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles;
begin
  perform public.admin_guard();
  if p_user_id = auth.uid() then
    raise exception 'You can''t suspend yourself.' using errcode = '42501';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'Pick a time in the future.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give a reason; the person sees it.' using errcode = '22023';
  end if;

  update public.profiles
  set suspended_until = coalesce(p_until, 'infinity'::timestamptz),
      suspension_reason = btrim(p_reason)
  where id = p_user_id and role <> 'admin'
  returning * into prof;

  if not found then
    raise exception 'user not found, or an admin (change their role first)' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, summary, details)
  values (auth.uid(), 'suspend', 'profiles', p_user_id::text, prof.username,
          jsonb_build_object('until', case when p_until is null then 'until lifted' else p_until::text end,
                             'reason', btrim(p_reason)));
  return prof;
end;
$$;

create function public.admin_unsuspend_user(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles;
begin
  perform public.admin_guard();

  update public.profiles
  set suspended_until = null, suspension_reason = null
  where id = p_user_id and suspended_until is not null
  returning * into prof;

  if not found then
    raise exception 'user not found or not suspended' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, summary, details)
  values (auth.uid(), 'unsuspend', 'profiles', p_user_id::text, prof.username, '{}'::jsonb);
  return prof;
end;
$$;

-- Admin-added data isn't spam: admins skip the per-user write limits (bulk
-- imports would hit "20 gems an hour" otherwise). Everyone else unchanged.
create or replace function public.enforce_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_per_hour integer := tg_argv[0]::integer;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if not public.consume_rate_limit(tg_table_name || ':' || auth.uid(), max_per_hour, interval '1 hour') then
    raise exception 'Too many % in the last hour. Please try again later.', replace(tg_table_name, '_', ' ')
      using errcode = 'PT429';
  end if;
  return new;
end;
$$;

-- admin_users gains the suspension columns (the return type changes, so it's
-- dropped and recreated).
drop function public.admin_users(text, public.user_role, boolean, text, integer, integer);

create function public.admin_users(
  p_search         text default null,
  p_role           public.user_role default null,
  p_include_guests boolean default false,
  p_sort           text default 'newest',
  p_limit          integer default 50,
  p_offset         integer default 0
)
returns table (
  id                   uuid,
  username             text,
  display_name         text,
  email                text,
  role                 public.user_role,
  is_guest             boolean,
  iq_score             smallint,
  mpesa_phone          text,
  created_at           timestamptz,
  last_sign_in_at      timestamptz,
  trips_30d            integer,
  submissions          integer,
  verified_submissions integer,
  earned_kes           integer,
  owed_kes             integer,
  suspended_until      timestamptz,
  suspension_reason    text,
  total_count          bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  q text := lower(nullif(btrim(p_search), ''));
begin
  perform public.admin_guard();

  return query
  with base as (
    select
      p.id, p.username, p.display_name, u.email::text as email, p.role,
      coalesce(u.is_anonymous, false) as is_guest,
      p.iq_score, p.mpesa_phone, p.created_at, u.last_sign_in_at,
      (select count(*)::integer from public.trips t
        where t.user_id = p.id and t.started_at > now() - interval '30 days') as trips_30d,
      ((select count(*) from public.gems g where g.created_by = p.id)
        + (select count(*) from public.road_reports r where r.reported_by = p.id))::integer as submissions,
      ((select count(*) from public.gems g where g.created_by = p.id and g.status = 'verified')
        + (select count(*) from public.road_reports r where r.reported_by = p.id and r.status = 'verified'))::integer
        as verified_submissions,
      (select coalesce(sum(e.amount_kes), 0)::integer from public.scout_earnings e where e.scout_id = p.id) as earned_kes,
      (select coalesce(sum(e.amount_kes), 0)::integer from public.scout_earnings e
        where e.scout_id = p.id and e.status = 'approved') as owed_kes,
      case when p.suspended_until > now() then p.suspended_until end as suspended_until,
      case when p.suspended_until > now() then p.suspension_reason end as suspension_reason
    from public.profiles p
    join auth.users u on u.id = p.id
    where (p_include_guests or not coalesce(u.is_anonymous, false))
      and (p_role is null or p.role = p_role)
      and (q is null
           or strpos(lower(p.username), q) > 0
           or strpos(lower(coalesce(p.display_name, '')), q) > 0
           or strpos(lower(coalesce(u.email, '')), q) > 0
           or p.id::text = q)
  )
  select b.*, count(*) over ()
  from base b
  order by
    case when p_sort = 'submissions' then b.verified_submissions end desc nulls last,
    case when p_sort = 'owed' then b.owed_kes end desc nulls last,
    case when p_sort = 'suspended' then b.suspended_until end desc nulls last,
    b.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- =====================================================================
-- Map of everything
-- =====================================================================

-- Gems and reports (any status) inside the visible box, plus where trips
-- went in the last 30 days, grouped into ~500 m cells (no single trip is
-- shown). Each list is capped so a zoomed-out map stays light.
create function public.admin_map_points(
  p_south double precision,
  p_west  double precision,
  p_north double precision,
  p_east  double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  box    geometry;
  result jsonb;
begin
  perform public.admin_guard();
  if p_south is null or p_north is null or p_west is null or p_east is null
     or p_south >= p_north or p_west >= p_east
     or p_north - p_south > 20 or p_east - p_west > 20 then
    raise exception 'Zoom in a bit further.' using errcode = '22023';
  end if;
  box := st_makeenvelope(p_west, p_south, p_east, p_north, 4326);

  select jsonb_build_object(
    'gems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'category', g.category, 'status', g.status,
        'lat', st_y(g.location::geometry), 'lng', st_x(g.location::geometry)))
      from (select * from public.gems where location::geometry && box
            order by (status = 'pending') desc, created_at desc limit 2000) g
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'type', r.type, 'severity', r.severity, 'status', r.status,
        'live', r.status = 'verified' and (r.expires_at is null or r.expires_at > now()),
        'lat', st_y(r.location::geometry), 'lng', st_x(r.location::geometry)))
      from (select * from public.road_reports
            where location::geometry && box
              and (status = 'pending' or expires_at is null or expires_at > now() - interval '30 days')
            order by (status = 'pending') desc, created_at desc limit 2000) r
    ), '[]'::jsonb),
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object('lat', c.lat, 'lng', c.lng, 'count', c.n))
      from (
        select round(st_y(t.destination::geometry)::numeric / 0.005) * 0.005 as lat,
               round(st_x(t.destination::geometry)::numeric / 0.005) * 0.005 as lng,
               count(*) as n
        from public.trips t
        where t.destination is not null
          and t.started_at > now() - interval '30 days'
          and t.destination::geometry && box
        group by 1, 2
        order by 3 desc
        limit 1000
      ) c
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- =====================================================================
-- Detail pages
-- =====================================================================

create function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
begin
  perform public.admin_guard();

  select jsonb_build_object(
    'profile', to_jsonb(p) || jsonb_build_object(
      'email', u.email,
      'is_guest', coalesce(u.is_anonymous, false),
      'last_sign_in_at', u.last_sign_in_at,
      'sign_in_with', (select coalesce(jsonb_agg(distinct i.provider), '[]'::jsonb) from auth.identities i where i.user_id = u.id),
      'suspended', p.suspended_until > now()),
    'application', (select to_jsonb(a) from public.scout_applications a where a.user_id = p.id),
    'stats', jsonb_build_object(
      'trips_total', (select count(*) from public.trips t where t.user_id = p.id),
      'trips_30d', (select count(*) from public.trips t where t.user_id = p.id and t.started_at > now() - interval '30 days'),
      'arrived_30d', (select count(*) from public.trips t where t.user_id = p.id and t.arrived and t.started_at > now() - interval '30 days'),
      'saved_gems', (select count(*) from public.saved_gems s where s.user_id = p.id),
      'ratings', (select count(*) from public.gem_confirmations c where c.user_id = p.id),
      'pinned_places', (select count(*) from public.pinned_places pp where pp.user_id = p.id),
      'earned_kes', (select coalesce(sum(e.amount_kes), 0) from public.scout_earnings e where e.scout_id = p.id),
      'owed_kes', (select coalesce(sum(e.amount_kes), 0) from public.scout_earnings e where e.scout_id = p.id and e.status = 'approved'),
      'paid_kes', (select coalesce(sum(e.amount_kes), 0) from public.scout_earnings e where e.scout_id = p.id and e.status = 'paid')),
    'submissions', coalesce((
      select jsonb_agg(s order by s.created_at desc) from (
        select 'gem' as kind, g.id, g.name as title, g.category::text as detail, g.status, g.review_note, g.created_at
          from public.gems g where g.created_by = p.id
        union all
        select 'report', r.id, r.type::text, r.severity::text, r.status, r.review_note, r.created_at
          from public.road_reports r where r.reported_by = p.id
        order by created_at desc limit 50) s
    ), '[]'::jsonb),
    'trips', coalesce((
      select jsonb_agg(t order by t.started_at desc) from (
        select t.id, t.destination_name, t.started_at, t.ended_at, t.arrived, t.distance_m, t.road_quality, t.reroutes
        from public.trips t where t.user_id = p.id order by t.started_at desc limit 20) t
    ), '[]'::jsonb),
    'earnings', coalesce((
      select jsonb_agg(e order by e.created_at desc) from (
        select e.id, e.task, e.amount_kes, e.status, e.mpesa_ref, e.created_at, e.paid_at
        from public.scout_earnings e where e.scout_id = p.id order by e.created_at desc limit 50) e
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(x order by x.id desc) from (
        select l.id, l.action, l.target_table, l.target_id, l.summary, l.details, l.created_at, a.username as admin
        from public.admin_audit_log l left join public.profiles a on a.id = l.admin_id
        where l.target_id = p.id::text or l.admin_id = p.id
           or (l.target_table in ('gems', 'road_reports', 'scout_earnings', 'scout_applications')
               and l.target_id in (
                 select g.id::text from public.gems g where g.created_by = p.id
                 union all select r.id::text from public.road_reports r where r.reported_by = p.id
                 union all select e.id::text from public.scout_earnings e where e.scout_id = p.id
                 union all select ap.id::text from public.scout_applications ap where ap.user_id = p.id))
        order by l.id desc limit 50) x
    ), '[]'::jsonb)
  ) into result
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_user_id;

  if result is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create function public.admin_gem_detail(p_gem_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
begin
  perform public.admin_guard();

  select jsonb_build_object(
    'gem', (to_jsonb(g) - 'location') || jsonb_build_object(
      'lat', st_y(g.location::geometry), 'lng', st_x(g.location::geometry),
      'creator_username', c.username, 'creator_role', c.role, 'reviewer_username', v.username),
    'stats', jsonb_build_object(
      'saves', (select count(*) from public.saved_gems s where s.gem_id = g.id),
      'confirmations', g.confirmations_count,
      'rating_avg', g.rating_avg,
      'ratings', (select coalesce(jsonb_object_agg(x.rating, x.n), '{}'::jsonb)
                  from (select rating, count(*) as n from public.gem_confirmations
                        where gem_id = g.id and rating is not null group by rating) x),
      'alerts_approaching_30d', (select count(*) from public.trip_gem_events e
                                  where e.gem_id = g.id and e.event = 'approaching' and e.occurred_at > now() - interval '30 days'),
      'alerts_passed_30d', (select count(*) from public.trip_gem_events e
                             where e.gem_id = g.id and e.event = 'passed' and e.occurred_at > now() - interval '30 days'),
      'alerts_total', (select count(*) from public.trip_gem_events e where e.gem_id = g.id)),
    'nearby', coalesce((
      select jsonb_agg(n order by n.distance_m) from (
        select o.id, o.name, o.category, o.status, round(st_distance(o.location, g.location)) as distance_m
        from public.gems o
        where o.id <> g.id and o.status <> 'rejected' and st_dwithin(o.location, g.location, 300)
        order by st_distance(o.location, g.location) limit 10) n
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(x order by x.id desc) from (
        select l.id, l.action, l.target_table, l.target_id, l.summary, l.details, l.created_at, a.username as admin
        from public.admin_audit_log l left join public.profiles a on a.id = l.admin_id
        where l.target_id = g.id::text
           or (l.target_table = 'scout_earnings' and (l.details ->> 'gem_id') = g.id::text)
        order by l.id desc limit 50) x
    ), '[]'::jsonb)
  ) into result
  from public.gems g
  left join public.profiles c on c.id = g.created_by
  left join public.profiles v on v.id = g.verified_by
  where g.id = p_gem_id;

  if result is null then
    raise exception 'gem not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

-- =====================================================================
-- Merging duplicate gems
-- =====================================================================

-- Gem pairs that are probably the same place: within p_radius_m of each other,
-- neither rejected. Closest first.
create function public.admin_duplicate_gems(p_radius_m integer default 100)
returns table (
  a_id uuid, a_name text, a_category public.gem_category, a_status public.review_status, a_created_at timestamptz,
  b_id uuid, b_name text, b_category public.gem_category, b_status public.review_status, b_created_at timestamptz,
  distance_m integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.admin_guard();
  return query
  select a.id, a.name, a.category, a.status, a.created_at,
         b.id, b.name, b.category, b.status, b.created_at,
         round(st_distance(a.location, b.location))::integer
  from public.gems a
  join public.gems b
    on a.id < b.id
   and st_dwithin(a.location, b.location, least(greatest(coalesce(p_radius_m, 100), 10), 500))
  where a.status <> 'rejected' and b.status <> 'rejected'
  order by st_distance(a.location, b.location)
  limit 200;
end;
$$;

-- Folds p_remove into p_keep: its confirmations, saves and trip alerts move
-- across (where the same person hasn't already got one on p_keep), empty
-- details on p_keep are filled from p_remove, then p_remove is deleted.
-- A Scout's earning for p_remove is kept but no longer points at a gem.
create function public.admin_merge_gems(p_keep uuid, p_remove uuid)
returns public.gems
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_gem   public.gems;
  remove_gem public.gems;
begin
  perform public.admin_guard();
  if p_keep = p_remove then
    raise exception 'Pick two different gems.' using errcode = '22023';
  end if;
  select * into keep_gem from public.gems where id = p_keep for update;
  select * into remove_gem from public.gems where id = p_remove for update;
  if keep_gem.id is null or remove_gem.id is null then
    raise exception 'gem not found' using errcode = 'P0002';
  end if;

  insert into public.gem_confirmations (gem_id, user_id, rating, created_at)
  select p_keep, user_id, rating, created_at from public.gem_confirmations where gem_id = p_remove
  on conflict (gem_id, user_id) do nothing;

  insert into public.saved_gems (user_id, gem_id, saved_at)
  select user_id, p_keep, saved_at from public.saved_gems where gem_id = p_remove
  on conflict (user_id, gem_id) do nothing;

  update public.trip_gem_events e set gem_id = p_keep
  where e.gem_id = p_remove
    and not exists (select 1 from public.trip_gem_events k
                    where k.trip_id = e.trip_id and k.gem_id = p_keep and k.event = e.event);

  update public.scout_earnings set gem_id = null where gem_id = p_remove;

  update public.gems
  set description = coalesce(description, remove_gem.description),
      address = coalesce(address, remove_gem.address),
      photo_path = coalesce(photo_path, remove_gem.photo_path),
      status = case when status = 'pending' and remove_gem.status = 'verified' then 'verified'::public.review_status else status end
  where id = p_keep
  returning * into keep_gem;

  delete from public.gems where id = p_remove;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, summary, details)
  values (auth.uid(), 'merge', 'gems', p_keep::text, keep_gem.name,
          jsonb_build_object('merged', remove_gem.name, 'merged_id', p_remove));
  return keep_gem;
end;
$$;

-- =====================================================================
-- Bulk import
-- =====================================================================

-- p_rows: [{name, category, lat, lng, description?, address?}, …], up to 500.
-- Dry run (p_commit false) checks every row; commit adds the good ones as
-- verified gems. A row is a duplicate if a gem that isn't rejected is within
-- 75 m, or one with the same name is within 300 m, or an earlier row in the
-- same file matches the same way.
create function public.admin_import_gems(p_rows jsonb, p_commit boolean default false)
returns table (row_no integer, status text, message text, gem_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r        jsonb;
  i        integer := 0;
  nm       text;
  cat      text;
  lat      double precision;
  lng      double precision;
  pt       geography;
  dup      text;
  new_id   uuid;
  accepted jsonb := '[]'::jsonb;  -- earlier good rows in this file: {name, lat, lng}
begin
  perform public.admin_guard();
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Expected a list of rows.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Import up to 500 gems at a time.' using errcode = '22023';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    i := i + 1;
    nm := btrim(r ->> 'name');
    cat := lower(btrim(r ->> 'category'));
    begin
      lat := (r ->> 'lat')::double precision;
      lng := (r ->> 'lng')::double precision;
    exception when others then
      lat := null; lng := null;
    end;

    if coalesce(nm, '') = '' or char_length(nm) > 120 then
      row_no := i; status := 'invalid'; message := 'Name is missing or longer than 120 characters'; gem_id := null;
      return next; continue;
    end if;
    if cat is null or cat not in (select unnest(enum_range(null::public.gem_category))::text) then
      row_no := i; status := 'invalid';
      message := 'Category must be one of: ' || array_to_string(enum_range(null::public.gem_category)::text[], ', ');
      gem_id := null;
      return next; continue;
    end if;
    if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
      row_no := i; status := 'invalid'; message := 'lat/lng missing or not valid numbers'; gem_id := null;
      return next; continue;
    end if;
    if char_length(coalesce(r ->> 'description', '')) > 1000 or char_length(coalesce(r ->> 'address', '')) > 200 then
      row_no := i; status := 'invalid'; message := 'Description or address too long'; gem_id := null;
      return next; continue;
    end if;

    pt := st_setsrid(st_makepoint(lng, lat), 4326)::geography;
    select g.name into dup from public.gems g
    where g.status <> 'rejected'
      and (st_dwithin(g.location, pt, 75) or (lower(g.name) = lower(nm) and st_dwithin(g.location, pt, 300)))
    order by st_distance(g.location, pt) limit 1;
    if dup is null then
      select a ->> 'name' into dup from jsonb_array_elements(accepted) a
      where st_dwithin(st_setsrid(st_makepoint((a ->> 'lng')::float8, (a ->> 'lat')::float8), 4326)::geography, pt,
                       case when lower(a ->> 'name') = lower(nm) then 300 else 75 end)
      limit 1;
      if dup is not null then dup := dup || ' (earlier in this file)'; end if;
    end if;
    if dup is not null then
      row_no := i; status := 'duplicate'; message := 'Looks like ' || dup; gem_id := null;
      return next; continue;
    end if;

    accepted := accepted || jsonb_build_array(jsonb_build_object('name', nm, 'lat', lat, 'lng', lng));
    if p_commit then
      insert into public.gems (name, category, location, description, address, status, created_by, verified_by)
      values (nm, cat::public.gem_category, pt, nullif(btrim(r ->> 'description'), ''), nullif(btrim(r ->> 'address'), ''),
              'verified', auth.uid(), auth.uid())
      returning id into new_id;
      row_no := i; status := 'added'; message := null; gem_id := new_id;
    else
      row_no := i; status := 'ok'; message := null; gem_id := null;
    end if;
    return next;
  end loop;
end;
$$;

-- =====================================================================
-- Google Routes usage and cost
-- =====================================================================

-- One row per day and outcome, counted by the routes edge function:
--   google          a billed Google Routes call
--   google_traffic  a billed call with live traffic on the line (higher rate)
--   cache           served from the 10-minute cache (free)
--   limited         refused by a per-user / per-IP / global limit
--   error           Google failed, or no route
create table public.route_usage_daily (
  day     date not null default (now() at time zone 'Africa/Nairobi')::date,
  outcome text not null check (outcome in ('google', 'google_traffic', 'cache', 'limited', 'error')),
  calls   integer not null default 0,
  primary key (day, outcome)
);

alter table public.route_usage_daily enable row level security;
revoke all on public.route_usage_daily from anon, authenticated;

create function public.record_route_usage(p_outcome text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.route_usage_daily as u (day, outcome, calls)
  values ((now() at time zone 'Africa/Nairobi')::date, p_outcome, 1)
  on conflict (day, outcome) do update set calls = u.calls + 1;
$$;

revoke execute on function public.record_route_usage(text) from public, anon, authenticated;
grant execute on function public.record_route_usage(text) to service_role;

-- Small admin-editable settings, e.g. what Google charges per 1,000 calls.
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('routes_usd_per_1000', '{"google": 5, "google_traffic": 10}'::jsonb);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

create policy "app_settings: admins read" on public.app_settings
  for select to authenticated using (public.is_admin());
create policy "app_settings: admins update" on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.app_settings from anon, authenticated;
grant select, update (value) on public.app_settings to authenticated;

create trigger app_settings_audit after insert or update or delete on public.app_settings
  for each row execute function public.audit_admin_write();

-- Daily route calls, cost estimate inputs, and who is hitting rate limits in
-- the last 24 hours (rate_limit_hits keeps about a day).
create function public.admin_usage(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  days   integer := least(greatest(coalesce(p_days, 30), 1), 180);
  result jsonb;
begin
  perform public.admin_guard();

  with span as (
    select generate_series((now() at time zone 'Africa/Nairobi')::date - (days - 1),
                           (now() at time zone 'Africa/Nairobi')::date, interval '1 day')::date as day
  ),
  hits as (
    select h.key, sum(h.hits)::integer as hits, max(h.hits)::integer as worst_window, count(*)::integer as windows
    from public.rate_limit_hits h
    where h.window_start > now() - interval '24 hours'
    group by h.key
    order by 2 desc
    limit 25
  )
  select jsonb_build_object(
    'prices', (select value from public.app_settings where key = 'routes_usd_per_1000'),
    'daily', (select jsonb_agg(jsonb_build_object(
        'day', s.day,
        'google', coalesce((select calls from public.route_usage_daily u where u.day = s.day and u.outcome = 'google'), 0),
        'google_traffic', coalesce((select calls from public.route_usage_daily u where u.day = s.day and u.outcome = 'google_traffic'), 0),
        'cache', coalesce((select calls from public.route_usage_daily u where u.day = s.day and u.outcome = 'cache'), 0),
        'limited', coalesce((select calls from public.route_usage_daily u where u.day = s.day and u.outcome = 'limited'), 0),
        'error', coalesce((select calls from public.route_usage_daily u where u.day = s.day and u.outcome = 'error'), 0)
      ) order by s.day) from span s),
    'this_month', (select coalesce(jsonb_object_agg(outcome, n), '{}'::jsonb) from (
        select outcome, sum(calls) as n from public.route_usage_daily
        where day >= date_trunc('month', now() at time zone 'Africa/Nairobi')::date
        group by outcome) m),
    'rate_limits', coalesce((select jsonb_agg(jsonb_build_object(
        'key', h.key, 'hits', h.hits, 'worst_window', h.worst_window, 'windows', h.windows,
        'username', (select p.username from public.profiles p
                     where p.id::text = substring(h.key from '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'))
      ) order by h.hits desc) from hits h), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- =====================================================================
-- Audit: settings rows are keyed by `key`
-- =====================================================================

create or replace function public.audit_admin_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o       jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n       jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r       jsonb := coalesce(n, o);
  changes jsonb := '{}'::jsonb;
  act     text;
  k       text;
begin
  if auth.uid() is null or not public.is_admin() then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k <> 'updated_at' and (o -> k) is distinct from (n -> k) then
        changes := changes || jsonb_build_object(
          k,
          case when k in ('location', 'path') then '"moved"'::jsonb
               else jsonb_build_object('from', o -> k, 'to', n -> k) end
        );
      end if;
    end loop;
    if changes = '{}'::jsonb then
      return null;
    end if;
    act := case when changes ? 'status' then 'status:' || (n ->> 'status') else 'update' end;
  else
    act := case when tg_op = 'INSERT' then 'create' else 'delete' end;
    changes := r - 'location' - 'path';
  end if;

  if tg_table_name = 'scout_earnings' and tg_op = 'UPDATE' then
    changes := changes || jsonb_build_object('task', r -> 'task')
               || case when changes ? 'amount_kes' then '{}'::jsonb else jsonb_build_object('amount_kes', r -> 'amount_kes') end;
  end if;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, summary, details)
  values (
    auth.uid(),
    act,
    tg_table_name,
    coalesce(r ->> 'id', r ->> 'task', r ->> 'key'),
    case tg_table_name
      when 'scout_earnings' then (select username from public.profiles where id = (r ->> 'scout_id')::uuid)
      when 'scout_applications' then (select username from public.profiles where id = (r ->> 'user_id')::uuid)
      else coalesce(r ->> 'name', r ->> 'type', r ->> 'task', r ->> 'key')
    end,
    changes
  );
  return null;
end;
$$;

-- =====================================================================
-- Grants
-- =====================================================================

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_suspend_user(uuid, timestamptz, text)',
    'public.admin_unsuspend_user(uuid)',
    'public.admin_users(text, public.user_role, boolean, text, integer, integer)',
    'public.admin_map_points(double precision, double precision, double precision, double precision)',
    'public.admin_user_detail(uuid)',
    'public.admin_gem_detail(uuid)',
    'public.admin_duplicate_gems(integer)',
    'public.admin_merge_gems(uuid, uuid)',
    'public.admin_import_gems(jsonb, boolean)',
    'public.admin_usage(integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
