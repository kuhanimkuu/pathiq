-- Admin dashboard: overview numbers, user and Scout management, editing any
-- gem or road report, batch M-Pesa payouts, reject reasons, and an audit log
-- of everything an admin changes.
--
-- Every function here is security definer and starts with admin_guard(): the
-- caller must be an admin, and admin calls share a generous per-admin rate
-- limit, so even a stolen admin session can't scrape or rewrite at speed.
-- Everything an admin writes to the review tables is recorded in
-- admin_audit_log by trigger, so nothing done through the API directly
-- (rather than through these functions) escapes the log either.

-- =====================================================================
-- Admin powers need a recent password
-- =====================================================================

-- Being signed in as an admin isn't enough: admin powers also need the
-- password (or a Google sign-in, for admins who use Google) to have been
-- entered in the last hour (the dashboard asks for it again). Supabase records each sign-in method and when it was used in the
-- session's JWT `amr` claim; refreshing the token keeps the original time,
-- so only a new password sign-in renews it. This stops anyone holding an
-- admin's session (an unlocked laptop, a stolen token) from acting as admin.
create function public.admin_auth_fresh()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
    ) m
    where m ->> 'method' in ('password', 'oauth', 'totp')
      and to_timestamp((m ->> 'timestamp')::double precision) > now() - interval '1 hour'
  )
$$;

revoke execute on function public.admin_auth_fresh() from public, anon;
grant execute on function public.admin_auth_fresh() to authenticated;

-- Every RLS policy's "or admin" clause goes through is_admin(), so this also
-- covers admin reads and writes made straight against the tables.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.admin_auth_fresh()
     and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- =====================================================================
-- Guard
-- =====================================================================

create function public.admin_guard()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'admin only' using errcode = '42501';
  end if;
  -- PT401 reaches the client as HTTP 401, which the dashboard answers by
  -- asking for the password again.
  if not public.admin_auth_fresh() then
    raise exception 'Confirm your password to use the admin dashboard.' using errcode = 'PT401';
  end if;
  if not public.consume_rate_limit('admin:' || auth.uid(), 3000, interval '1 hour') then
    raise exception 'Too many admin requests in the last hour. Please try again later.' using errcode = 'PT429';
  end if;
end;
$$;

revoke execute on function public.admin_guard() from public, anon, authenticated;

-- =====================================================================
-- Reject reasons (shown to the Scout on their own submission)
-- =====================================================================

alter table public.gems add column review_note text check (char_length(review_note) <= 500);
alter table public.road_reports add column review_note text check (char_length(review_note) <= 500);
alter table public.scout_applications add column review_note text check (char_length(review_note) <= 500);

-- =====================================================================
-- Audit log
-- =====================================================================

create table public.admin_audit_log (
  id           bigint generated always as identity primary key,
  admin_id     uuid references public.profiles (id) on delete set null,
  action       text not null,   -- create, update, delete, status:<new status>, role:<new role>
  target_table text not null,
  target_id    text,
  summary      text,            -- the gem's name, report type, earning task… for the list view
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index admin_audit_log_target_idx on public.admin_audit_log (target_table, target_id);

-- Admins read it; nobody writes it from a client. Rows come only from the
-- trigger and functions below (security definer), and are never edited.
alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log: admins read" on public.admin_audit_log
  for select to authenticated
  using (public.is_admin());

revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

-- Logs any write an admin makes to a review table. Raw coordinates are left
-- out (they're binary in jsonb); a moved location shows as "moved".
create function public.audit_admin_write()
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

  -- Earnings and applications are about a person: name them, and keep what
  -- a payment was for even when only its status changed.
  if tg_table_name = 'scout_earnings' and tg_op = 'UPDATE' then
    changes := changes || jsonb_build_object('task', r -> 'task')
               || case when changes ? 'amount_kes' then '{}'::jsonb else jsonb_build_object('amount_kes', r -> 'amount_kes') end;
  end if;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, summary, details)
  values (
    auth.uid(),
    act,
    tg_table_name,
    coalesce(r ->> 'id', r ->> 'task'),
    case tg_table_name
      when 'scout_earnings' then (select username from public.profiles where id = (r ->> 'scout_id')::uuid)
      when 'scout_applications' then (select username from public.profiles where id = (r ->> 'user_id')::uuid)
      else coalesce(r ->> 'name', r ->> 'type', r ->> 'task')
    end,
    changes
  );
  return null;
end;
$$;

revoke execute on function public.audit_admin_write() from public, anon, authenticated;

create trigger gems_audit after insert or update or delete on public.gems
  for each row execute function public.audit_admin_write();
create trigger road_reports_audit after insert or update or delete on public.road_reports
  for each row execute function public.audit_admin_write();
create trigger scout_applications_audit after insert or update or delete on public.scout_applications
  for each row execute function public.audit_admin_write();
create trigger scout_earnings_audit after insert or update or delete on public.scout_earnings
  for each row execute function public.audit_admin_write();
create trigger task_rates_audit after insert or update or delete on public.task_rates
  for each row execute function public.audit_admin_write();

-- =====================================================================
-- Review functions, now with an optional note (the reject reason)
-- =====================================================================

drop function public.review_scout_application(uuid, boolean);
drop function public.review_gem(uuid, boolean, public.earning_task);
drop function public.review_road_report(uuid, boolean, public.earning_task);

create function public.review_scout_application(
  p_application_id uuid,
  p_approve        boolean,
  p_note           text default null
)
returns public.scout_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.scout_applications;
begin
  perform public.admin_guard();

  update public.scout_applications
  set status = case when p_approve then 'verified'::public.review_status else 'rejected'::public.review_status end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(btrim(p_note), '')
  where id = p_application_id and status = 'pending'
  returning * into app;

  if not found then
    raise exception 'application not found or already reviewed' using errcode = 'P0002';
  end if;

  -- Never promote an anonymous (guest) user: Scouts are paid and need a real identity.
  if p_approve then
    update public.profiles p
    set role = 'scout', mpesa_phone = app.mpesa_phone
    from auth.users u
    where p.id = app.user_id
      and p.role = 'driver'
      and u.id = p.id
      and coalesce(u.is_anonymous, false) = false;
  end if;

  return app;
end;
$$;

create function public.review_gem(
  p_gem_id  uuid,
  p_approve boolean,
  p_task    public.earning_task default 'gem_discovery',
  p_note    text default null
)
returns public.gems
language plpgsql
security definer
set search_path = public
as $$
declare
  g            public.gems;
  creator_role public.user_role;
  rate         integer;
begin
  perform public.admin_guard();

  update public.gems
  set status = case when p_approve then 'verified'::public.review_status else 'rejected'::public.review_status end,
      verified_by = auth.uid(),
      review_note = nullif(btrim(p_note), '')
  where id = p_gem_id and status = 'pending'
  returning * into g;

  if not found then
    raise exception 'gem not found or already reviewed' using errcode = 'P0002';
  end if;

  if p_approve and g.created_by is not null then
    select role into creator_role from public.profiles where id = g.created_by;
    if creator_role = 'scout' then
      select amount_kes into rate from public.task_rates where task = p_task;
      insert into public.scout_earnings (scout_id, task, amount_kes, status, gem_id)
      values (g.created_by, p_task, rate, 'approved', g.id);
    end if;
  end if;

  return g;
end;
$$;

create function public.review_road_report(
  p_report_id uuid,
  p_approve   boolean,
  p_task      public.earning_task default 'road_report',
  p_note      text default null
)
returns public.road_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  r            public.road_reports;
  creator_role public.user_role;
  rate         integer;
begin
  perform public.admin_guard();

  update public.road_reports
  set status = case when p_approve then 'verified'::public.review_status else 'rejected'::public.review_status end,
      reviewed_by = auth.uid(),
      review_note = nullif(btrim(p_note), ''),
      expires_at = case
        when p_approve and expires_at is null then now() + public.road_report_ttl(type)
        else expires_at
      end
  where id = p_report_id and status = 'pending'
  returning * into r;

  if not found then
    raise exception 'report not found or already reviewed' using errcode = 'P0002';
  end if;

  if p_approve and r.reported_by is not null then
    select role into creator_role from public.profiles where id = r.reported_by;
    if creator_role = 'scout' then
      select amount_kes into rate from public.task_rates where task = p_task;
      insert into public.scout_earnings (scout_id, task, amount_kes, status, road_report_id)
      values (r.reported_by, p_task, rate, 'approved', r.id);
    end if;
  end if;

  return r;
end;
$$;

create or replace function public.mark_earning_paid(p_earning_id uuid, p_mpesa_ref text)
returns public.scout_earnings
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.scout_earnings;
begin
  perform public.admin_guard();

  if coalesce(btrim(p_mpesa_ref), '') = '' then
    raise exception 'an M-Pesa reference is required' using errcode = '22023';
  end if;

  update public.scout_earnings
  set status = 'paid', paid_at = now(), mpesa_ref = btrim(p_mpesa_ref)
  where id = p_earning_id and status = 'approved'
  returning * into e;

  if not found then
    raise exception 'earning not found or not awaiting payment' using errcode = 'P0002';
  end if;

  return e;
end;
$$;

-- =====================================================================
-- Overview
-- =====================================================================

-- Headline numbers plus 14 days of daily activity (Nairobi days).
create function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.admin_guard();

  with days as (
    select generate_series(
      (now() at time zone 'Africa/Nairobi')::date - 13,
      (now() at time zone 'Africa/Nairobi')::date,
      interval '1 day'
    )::date as day
  )
  select jsonb_build_object(
    'users', (select count(*) from public.profiles p join auth.users u on u.id = p.id
               where not coalesce(u.is_anonymous, false)),
    'guests', (select count(*) from auth.users u where coalesce(u.is_anonymous, false)),
    'scouts', (select count(*) from public.profiles where role = 'scout'),
    'admins', (select count(*) from public.profiles where role = 'admin'),
    'new_users_7d', (select count(*) from public.profiles p join auth.users u on u.id = p.id
                      where not coalesce(u.is_anonymous, false) and p.created_at > now() - interval '7 days'),
    'trips_7d', (select count(*) from public.trips t where t.started_at > now() - interval '7 days' and public.trip_counts(t)),
    'active_drivers_7d', (select count(distinct user_id) from public.trips where started_at > now() - interval '7 days'),
    'pending_gems', (select count(*) from public.gems where status = 'pending'),
    'pending_reports', (select count(*) from public.road_reports where status = 'pending'),
    'pending_applications', (select count(*) from public.scout_applications where status = 'pending'),
    'oldest_pending_at', (select min(created_at) from (
        select created_at from public.gems where status = 'pending'
        union all select created_at from public.road_reports where status = 'pending'
        union all select created_at from public.scout_applications where status = 'pending') p),
    'verified_gems', (select count(*) from public.gems where status = 'verified'),
    'live_reports', (select count(*) from public.road_reports
                      where status = 'verified' and (expires_at is null or expires_at > now())),
    'owed_kes', (select coalesce(sum(amount_kes), 0) from public.scout_earnings where status = 'approved'),
    'owed_scouts', (select count(distinct scout_id) from public.scout_earnings where status = 'approved'),
    'paid_this_month_kes', (select coalesce(sum(amount_kes), 0) from public.scout_earnings
                             where status = 'paid'
                               and paid_at >= date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi'),
    'daily', (select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'trips', (select count(*) from public.trips t
                   where (t.started_at at time zone 'Africa/Nairobi')::date = d.day),
        'signups', (select count(*) from public.profiles p join auth.users u on u.id = p.id
                     where not coalesce(u.is_anonymous, false)
                       and (p.created_at at time zone 'Africa/Nairobi')::date = d.day),
        'submissions', (select count(*) from (
            select created_at from public.gems where created_by is not null
            union all select created_at from public.road_reports where reported_by is not null) s
           where (s.created_at at time zone 'Africa/Nairobi')::date = d.day)
      ) order by d.day) from days d)
  ) into result;

  return result;
end;
$$;

-- =====================================================================
-- Users and Scouts
-- =====================================================================

-- p_sort: 'newest' | 'submissions' (Scout leaderboard) | 'owed'
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
        where e.scout_id = p.id and e.status = 'approved') as owed_kes
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
    b.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Promote or demote. An admin can't change their own role (so the last admin
-- can't lock everyone out), and guests can't become Scouts or admins.
create function public.admin_set_role(p_user_id uuid, p_role public.user_role)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  old_role public.user_role;
  prof     public.profiles;
  guest    boolean;
begin
  perform public.admin_guard();

  if p_user_id = auth.uid() then
    raise exception 'You can''t change your own role. Ask another admin.' using errcode = '42501';
  end if;

  select p.role, coalesce(u.is_anonymous, false) into old_role, guest
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = p_user_id;

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if guest and p_role <> 'driver' then
    raise exception 'Guests can''t be made Scouts or admins. They need a real account first.' using errcode = '22023';
  end if;
  if old_role = p_role then
    select * into prof from public.profiles where id = p_user_id;
    return prof;
  end if;

  update public.profiles set role = p_role where id = p_user_id returning * into prof;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, summary, details)
  values (auth.uid(), 'role:' || p_role, 'profiles', p_user_id::text, prof.username,
          jsonb_build_object('role', jsonb_build_object('from', old_role, 'to', p_role)));

  return prof;
end;
$$;

-- =====================================================================
-- Gems and road reports: list, create, edit, hide/restore
-- =====================================================================

-- Pending gems come oldest first (a queue); everything else newest first.
-- nearby_verified counts verified gems within 150 m, to spot duplicates.
create function public.admin_gems(
  p_status   public.review_status default null,
  p_search   text default null,
  p_category public.gem_category default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns table (
  id                  uuid,
  name                text,
  description         text,
  category            public.gem_category,
  address             text,
  status              public.review_status,
  lat                 double precision,
  lng                 double precision,
  photo_path          text,
  rating_avg          numeric,
  confirmations_count integer,
  review_note         text,
  created_at          timestamptz,
  updated_at          timestamptz,
  created_by          uuid,
  creator_username    text,
  creator_role        public.user_role,
  reviewer_username   text,
  nearby_verified     integer,
  total_count         bigint
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  q text := lower(nullif(btrim(p_search), ''));
begin
  perform public.admin_guard();

  return query
  select
    g.id, g.name, g.description, g.category, g.address, g.status,
    st_y(g.location::geometry), st_x(g.location::geometry),
    g.photo_path, g.rating_avg, g.confirmations_count, g.review_note,
    g.created_at, g.updated_at, g.created_by,
    c.username, c.role, v.username,
    (select count(*)::integer from public.gems o
      where o.status = 'verified' and o.id <> g.id and st_dwithin(o.location, g.location, 150)),
    count(*) over ()
  from public.gems g
  left join public.profiles c on c.id = g.created_by
  left join public.profiles v on v.id = g.verified_by
  where (p_status is null or g.status = p_status)
    and (p_category is null or g.category = p_category)
    and (q is null
         or strpos(lower(g.name), q) > 0
         or strpos(lower(coalesce(g.description, '')), q) > 0
         or strpos(lower(coalesce(g.address, '')), q) > 0)
  order by
    case when p_status = 'pending' then g.created_at end asc,
    g.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- p_live: true = verified and unexpired, false = verified but expired.
-- nearby_live counts live reports within 100 m, to spot duplicates.
create function public.admin_road_reports(
  p_status public.review_status default null,
  p_type   public.road_report_type default null,
  p_live   boolean default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id                uuid,
  type              public.road_report_type,
  severity          smallint,
  description       text,
  status            public.review_status,
  lat               double precision,
  lng               double precision,
  photo_path        text,
  review_note       text,
  created_at        timestamptz,
  expires_at        timestamptz,
  is_live           boolean,
  reported_by       uuid,
  reporter_username text,
  reporter_role     public.user_role,
  reviewer_username text,
  nearby_live       integer,
  total_count       bigint
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.admin_guard();

  return query
  select
    r.id, r.type, r.severity, r.description, r.status,
    st_y(r.location::geometry), st_x(r.location::geometry),
    r.photo_path, r.review_note, r.created_at, r.expires_at,
    (r.status = 'verified' and (r.expires_at is null or r.expires_at > now())),
    r.reported_by, c.username, c.role, v.username,
    (select count(*)::integer from public.road_reports o
      where o.status = 'verified' and (o.expires_at is null or o.expires_at > now())
        and o.id <> r.id and st_dwithin(o.location, r.location, 100)),
    count(*) over ()
  from public.road_reports r
  left join public.profiles c on c.id = r.reported_by
  left join public.profiles v on v.id = r.reviewed_by
  where (p_status is null or r.status = p_status)
    and (p_type is null or r.type = p_type)
    and (p_live is null
         or p_live = (r.status = 'verified' and (r.expires_at is null or r.expires_at > now())))
  order by
    case when p_status = 'pending' then r.created_at end asc,
    r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.admin_check_point(p_lat double precision, p_lng double precision)
returns void
language plpgsql
immutable
as $$
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'That location isn''t valid.' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.admin_check_point(double precision, double precision) from public, anon, authenticated;

-- Create (p_id null: added straight to the map, verified) or edit a gem.
-- Status changes go through review_gem (pending) or admin_set_gem_status.
create function public.admin_save_gem(
  p_id          uuid,
  p_name        text,
  p_category    public.gem_category,
  p_lat         double precision,
  p_lng         double precision,
  p_description text default null,
  p_address     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  gem_id uuid;
  pt     geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
begin
  perform public.admin_guard();
  perform public.admin_check_point(p_lat, p_lng);

  if char_length(coalesce(btrim(p_name), '')) not between 1 and 120 then
    raise exception 'A gem needs a name (up to 120 characters).' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 1000 or char_length(coalesce(p_address, '')) > 200 then
    raise exception 'Description or address is too long.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.gems (name, category, location, description, address, status, created_by, verified_by)
    values (btrim(p_name), p_category, pt, nullif(btrim(p_description), ''), nullif(btrim(p_address), ''),
            'verified', auth.uid(), auth.uid())
    returning id into gem_id;
  else
    update public.gems
    set name = btrim(p_name),
        category = p_category,
        location = pt,
        description = nullif(btrim(p_description), ''),
        address = nullif(btrim(p_address), '')
    where id = p_id
    returning id into gem_id;
    if not found then
      raise exception 'gem not found' using errcode = 'P0002';
    end if;
  end if;

  return gem_id;
end;
$$;

-- Hide a verified gem (rejected) or put a rejected one back (verified).
-- Pending gems are reviewed with review_gem, which also pays the Scout.
create function public.admin_set_gem_status(p_id uuid, p_status public.review_status, p_note text default null)
returns public.gems
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.gems;
begin
  perform public.admin_guard();
  if p_status = 'pending' then
    raise exception 'A gem can''t be sent back to pending.' using errcode = '22023';
  end if;

  update public.gems
  set status = p_status, verified_by = auth.uid(), review_note = nullif(btrim(p_note), '')
  where id = p_id and status <> 'pending'
  returning * into g;

  if not found then
    raise exception 'gem not found, or still pending (review it instead)' using errcode = 'P0002';
  end if;
  return g;
end;
$$;

-- Create (verified, expiring by type) or edit a road report. p_expires_at
-- extends or shortens its life; to clear it now use admin_clear_road_report.
create function public.admin_save_road_report(
  p_id          uuid,
  p_type        public.road_report_type,
  p_severity    smallint,
  p_lat         double precision,
  p_lng         double precision,
  p_description text default null,
  p_expires_at  timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  report_id uuid;
  pt        geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
begin
  perform public.admin_guard();
  perform public.admin_check_point(p_lat, p_lng);

  if p_severity is null or p_severity not between 1 and 5 then
    raise exception 'Severity is 1 to 5.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'Description is too long.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.road_reports (type, severity, location, description, status, reported_by, reviewed_by, expires_at)
    values (p_type, p_severity, pt, nullif(btrim(p_description), ''), 'verified', auth.uid(), auth.uid(),
            coalesce(p_expires_at, now() + public.road_report_ttl(p_type)))
    returning id into report_id;
  else
    update public.road_reports
    set type = p_type,
        severity = p_severity,
        location = pt,
        description = nullif(btrim(p_description), ''),
        expires_at = coalesce(p_expires_at, expires_at)
    where id = p_id
    returning id into report_id;
    if not found then
      raise exception 'report not found' using errcode = 'P0002';
    end if;
  end if;

  return report_id;
end;
$$;

create function public.admin_set_report_status(p_id uuid, p_status public.review_status, p_note text default null)
returns public.road_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.road_reports;
begin
  perform public.admin_guard();
  if p_status = 'pending' then
    raise exception 'A report can''t be sent back to pending.' using errcode = '22023';
  end if;

  update public.road_reports
  set status = p_status,
      reviewed_by = auth.uid(),
      review_note = nullif(btrim(p_note), ''),
      -- restoring an already-expired report gives it a fresh lifetime
      expires_at = case
        when p_status = 'verified' and expires_at is not null and expires_at <= now()
          then now() + public.road_report_ttl(type)
        else expires_at
      end
  where id = p_id and status <> 'pending'
  returning * into r;

  if not found then
    raise exception 'report not found, or still pending (review it instead)' using errcode = 'P0002';
  end if;
  return r;
end;
$$;

-- "Road fixed": takes a verified report off the map now, by the server's clock.
create function public.admin_clear_road_report(p_id uuid)
returns public.road_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.road_reports;
begin
  perform public.admin_guard();

  update public.road_reports
  set expires_at = now(), reviewed_by = auth.uid()
  where id = p_id and status = 'verified' and (expires_at is null or expires_at > now())
  returning * into r;

  if not found then
    raise exception 'report not found or not live' using errcode = 'P0002';
  end if;
  return r;
end;
$$;

-- =====================================================================
-- Payouts
-- =====================================================================

-- What each Scout is owed, one row per Scout, with the exact earnings so the
-- payout below pays only what the admin saw.
create function public.admin_payouts()
returns table (
  scout_id     uuid,
  username     text,
  display_name text,
  mpesa_phone  text,
  earning_ids  uuid[],
  items        integer,
  total_kes    integer,
  oldest_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();

  return query
  select e.scout_id, p.username, p.display_name, p.mpesa_phone,
         array_agg(e.id order by e.created_at), count(*)::integer, sum(e.amount_kes)::integer, min(e.created_at)
  from public.scout_earnings e
  join public.profiles p on p.id = e.scout_id
  where e.status = 'approved'
  group by e.scout_id, p.username, p.display_name, p.mpesa_phone
  order by min(e.created_at);
end;
$$;

-- One M-Pesa transfer covering several of a Scout's approved earnings.
create function public.admin_pay_scout(p_scout_id uuid, p_earning_ids uuid[], p_mpesa_ref text)
returns table (items integer, total_kes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  ref text := upper(btrim(p_mpesa_ref));
begin
  perform public.admin_guard();

  if coalesce(ref, '') !~ '^[A-Z0-9]{6,20}$' then
    raise exception 'Enter the M-Pesa transaction code (letters and numbers, e.g. QJK3XYZ12A).' using errcode = '22023';
  end if;
  if coalesce(array_length(p_earning_ids, 1), 0) = 0 then
    raise exception 'Nothing selected to pay.' using errcode = '22023';
  end if;

  return query
  with paid as (
    update public.scout_earnings
    set status = 'paid', paid_at = now(), mpesa_ref = ref
    where scout_id = p_scout_id and id = any (p_earning_ids) and status = 'approved'
    returning amount_kes
  )
  select count(*)::integer, coalesce(sum(amount_kes), 0)::integer from paid;
end;
$$;

-- =====================================================================
-- Grants: nothing for anon; signed-in callers, each function checks admin.
-- =====================================================================

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.review_scout_application(uuid, boolean, text)',
    'public.review_gem(uuid, boolean, public.earning_task, text)',
    'public.review_road_report(uuid, boolean, public.earning_task, text)',
    'public.admin_overview()',
    'public.admin_users(text, public.user_role, boolean, text, integer, integer)',
    'public.admin_set_role(uuid, public.user_role)',
    'public.admin_gems(public.review_status, text, public.gem_category, integer, integer)',
    'public.admin_road_reports(public.review_status, public.road_report_type, boolean, integer, integer)',
    'public.admin_save_gem(uuid, text, public.gem_category, double precision, double precision, text, text)',
    'public.admin_set_gem_status(uuid, public.review_status, text)',
    'public.admin_save_road_report(uuid, public.road_report_type, smallint, double precision, double precision, text, timestamptz)',
    'public.admin_set_report_status(uuid, public.review_status, text)',
    'public.admin_clear_road_report(uuid)',
    'public.admin_payouts()',
    'public.admin_pay_scout(uuid, uuid[], text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
