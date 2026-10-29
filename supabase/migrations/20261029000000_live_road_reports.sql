-- Live road reports from drivers, scored by trust.
--
-- Until now every road report came from a Scout and was checked by hand. This
-- lets any driver report what they see (an accident, a jam, a closed road…)
-- from the navigation screen, and decides by itself when enough trusted
-- evidence has piled up to show it to everyone as live:
--
--   * Each report or "still there?" answer is a signal, weighted by who sent
--     it (reporter_weight): signed-in accounts count more than guests, Scouts
--     and long-standing, frequent drivers more than brand-new ones, and
--     people whose past reports held up more than people whose didn't.
--   * Reports of the same thing close together are merged into one, so many
--     drivers reporting it adds up instead of making duplicates.
--   * Google's live traffic on a route counts too (apply_traffic_evidence,
--     called by the routes function): a jam where drivers report one backs
--     them up; free-flowing traffic where someone reported a jam counts
--     against it.
--   * Every signal fades with time, at a rate set by the kind of report (a
--     jam is old news in half an hour, a pothole in months).
--   * The sum becomes a 0-1 score. At LIVE_SCORE a report goes live (status
--     verified, shown on the map, used in route scoring); a live one stays
--     live until it fades or is voted away below END_SCORE.
--   * Each report carries review_at, when it would fade out if nobody says
--     anything more. A cron job re-scores reports at that point and ends the
--     ones that have run their course, and expires_at is kept just after it,
--     so a report disappears on time even if the job doesn't run.
--
-- Scout reports keep their manual review. A "not there anymore" vote on a
-- live Scout report can still end it early.
--
-- Comparisons with the new report types are made as text so this file can
-- run in one transaction (SQL editor) right after adding the enum values.
-- Safe to re-run.

-- ── New kinds of report ───────────────────────────────────────────────
alter type public.road_report_type add value if not exists 'traffic';  -- heavy traffic / jam
alter type public.road_report_type add value if not exists 'closure';  -- road closed
alter type public.road_report_type add value if not exists 'hazard';   -- object, breakdown or animal on the road

-- How long a verified Scout/admin report stays up (admin_save_road_report,
-- review_road_report), now covering the new types.
create or replace function public.road_report_ttl(t public.road_report_type)
returns interval
language sql
immutable
as $$
  select case t::text
    when 'pothole'      then interval '180 days'
    when 'surface'      then interval '365 days'
    when 'construction' then interval '90 days'
    when 'flooding'     then interval '3 days'
    when 'incident'     then interval '1 day'
    when 'traffic'      then interval '2 hours'
    when 'closure'      then interval '2 days'
    when 'hazard'       then interval '6 hours'
    else interval '1 day'
  end;
$$;

-- ── Report lifecycle columns ──────────────────────────────────────────
-- source:         'scout' (Scout/admin, reviewed by hand) or 'crowd' (drivers, scored)
-- live_score:     the latest 0-1 score (also copied to confidence for route scoring)
-- ever_live:      went live at some point (for reporters' track records)
-- last_signal_at: the newest supporting signal; route scoring ages the report from here
-- review_at:      when it's re-scored next if nothing else happens
-- ended_at:       finished: faded, voted away, or never confirmed
alter table public.road_reports
  add column if not exists source         text not null default 'scout',
  add column if not exists live_score     numeric(4, 3),
  add column if not exists ever_live      boolean not null default false,
  add column if not exists last_signal_at timestamptz,
  add column if not exists review_at      timestamptz,
  add column if not exists ended_at       timestamptz;

alter table public.road_reports drop constraint if exists road_reports_source_check;
alter table public.road_reports add constraint road_reports_source_check check (source in ('scout', 'crowd'));

create index if not exists road_reports_review_idx on public.road_reports (review_at)
  where ended_at is null and review_at is not null;
create index if not exists road_reports_crowd_open_idx on public.road_reports using gist (location)
  where source = 'crowd' and ended_at is null;

-- Drivers can't insert road_reports directly (the insert policy is Scouts and
-- admins only); they go through submit_road_report below.

-- ── Signals ───────────────────────────────────────────────────────────
-- One row per driver per report (their latest say: reported it, confirmed it,
-- or said it's gone), plus evidence rows from Google traffic. `weight` is
-- signed: positive supports the report, negative counts against it.
create table if not exists public.road_report_signals (
  id         bigint generated always as identity primary key,
  report_id  uuid not null references public.road_reports (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('report', 'confirm', 'deny', 'evidence')),
  source     text not null default 'driver' check (source in ('driver', 'google_traffic')),
  weight     numeric(5, 3) not null check (weight between -5 and 5),
  created_at timestamptz not null default now(),
  check ((source = 'driver') = (user_id is not null))
);

create unique index if not exists road_report_signals_one_per_driver
  on public.road_report_signals (report_id, user_id) where user_id is not null;
create index if not exists road_report_signals_report_idx
  on public.road_report_signals (report_id, created_at desc);

-- Server-only: RLS on with no policies, no grants. Only the functions below touch it.
alter table public.road_report_signals enable row level security;
revoke all on public.road_report_signals from anon, authenticated;

-- How each driver's reports have held up: `good` when a report they backed
-- went live with someone else agreeing (or a report they said was gone
-- ended), `bad` when a report they made was voted away without ever being
-- confirmed. Kept apart from profiles so nobody can edit their own.
create table if not exists public.reporter_reputation (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  good       integer not null default 0 check (good >= 0),
  bad        integer not null default 0 check (bad >= 0),
  updated_at timestamptz not null default now()
);
alter table public.reporter_reputation enable row level security;
revoke all on public.reporter_reputation from anon, authenticated;

-- ── Tuning ────────────────────────────────────────────────────────────
-- How fast a signal about each kind of report fades: its weight halves
-- every this many hours.
create or replace function public.report_half_life_h(t public.road_report_type)
returns double precision
language sql
immutable
as $$
  select case t::text
    when 'traffic'      then 0.5
    when 'incident'     then 1
    when 'hazard'       then 1
    when 'closure'      then 4
    when 'flooding'     then 8
    when 'construction' then 72
    when 'pothole'      then 720
    when 'surface'      then 720
    else 2
  end::double precision;
$$;

-- How close two reports of the same kind must be to be the same thing, in
-- metres: a jam is a long stretch, a pothole is a spot.
create or replace function public.report_merge_radius_m(t public.road_report_type)
returns double precision
language sql
immutable
as $$
  select case t::text
    when 'traffic'  then 300
    when 'closure'  then 200
    when 'flooding' then 150
    when 'incident' then 120
    when 'hazard'   then 100
    else 60
  end::double precision;
$$;

-- What a report says about the road when the driver doesn't pick a severity.
create or replace function public.report_default_severity(t public.road_report_type)
returns smallint
language sql
immutable
as $$
  select case t::text
    when 'closure'  then 5
    when 'incident' then 4
    when 'flooding' then 4
    else 3
  end::smallint;
$$;

-- ── Who's reporting ───────────────────────────────────────────────────
-- How much one signal from this person counts, 0-3:
--   base         guest 0.4 · signed in 1.0 · Scout 1.4 · admin 2.0
--   + tenure     up to +0.3 for an account three months old or more
--   + activity   up to +0.4 for frequent driving (completed trips, last 90 days)
--   × track      0.4-1.5 from how their past reports held up (1.0 with no history)
-- Guests are capped at 0.6 whatever their history: a new guest account is
-- free to make, so several of them still don't add up to much. Suspended: 0.
create or replace function public.reporter_weight(p_user uuid)
returns double precision
language sql
stable
security definer
set search_path = public
as $$
  with person as (
    select coalesce(au.is_anonymous, false) as guest, au.created_at, p.role, p.suspended_until
    from auth.users au join public.profiles p on p.id = au.id
    where au.id = p_user
  ),
  activity as (
    select count(*) as trips
    from public.trips t
    where t.user_id = p_user and t.started_at > now() - interval '90 days' and public.trip_counts(t)
  ),
  track as (
    select coalesce(max(r.good), 0) as good, coalesce(max(r.bad), 0) as bad
    from public.reporter_reputation r where r.user_id = p_user
  ),
  raw as (
    select
      person.guest,
      person.suspended_until,
      (case when person.role = 'admin' then 2.0
            when person.role = 'scout' then 1.4
            when person.guest then 0.4
            else 1.0 end
       + least(0.3, extract(epoch from now() - person.created_at) / 86400.0 / 300.0)
       + least(0.4, activity.trips * 0.02))
      * greatest(0.4, least(1.5, 2.0 * (track.good + 2) / (track.good + track.bad + 4.0))) as w
    from person, activity, track
  )
  select coalesce((
    select case
      when suspended_until > now() then 0
      when guest then least(0.6, w)
      else least(3.0, w)
    end
    from raw
  ), 0)::double precision;
$$;

revoke execute on function public.reporter_weight(uuid) from public, anon, authenticated;

create or replace function public.bump_reputation(p_users uuid[], p_good integer, p_bad integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.reporter_reputation (user_id, good, bad)
  select u, p_good, p_bad from unnest(p_users) u where u is not null
  on conflict (user_id) do update
    set good = public.reporter_reputation.good + excluded.good,
        bad = public.reporter_reputation.bad + excluded.bad,
        updated_at = now();
$$;

revoke execute on function public.bump_reputation(uuid[], integer, integer) from public, anon, authenticated;

-- ── Scoring ───────────────────────────────────────────────────────────
-- Re-scores one report from its signals and moves it along its lifecycle:
--
--   support  = Σ positive weights, each halved every half-life since it was sent
--   against  = Σ negative weights, likewise, counted 1.25× (someone who drove
--              past and saw nothing is strong evidence)
--   score    = 1 − e^(−(support − against) / 1.5)
--
-- So one trusted, frequent, signed-in driver (weight ~2) is enough on their
-- own (0.74); a new signed-in account (1.0) needs one more driver or Google's
-- traffic to agree; a guest (0.4) needs several others.
--
-- A Scout report (already checked by hand) starts from a support of 3, fading
-- the same way, so a few "not there anymore" votes can end it.
create or replace function public.recompute_road_report(p_id uuid)
returns public.road_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  live_score constant double precision := 0.55; -- a candidate goes live at this
  end_score  constant double precision := 0.30; -- a live report ends below this
  drop_score constant double precision := 0.15; -- a candidate is dropped below this
  k          constant double precision := 1.5;
  r          public.road_reports;
  h          double precision;
  support    double precision;
  against    double precision;
  net        double precision;
  score      double precision;
  newest     timestamptz;
  sources    integer;
  is_live    boolean;
  floor_s    double precision;
  hours_left double precision;
  backers    uuid[];
begin
  select * into r from public.road_reports where id = p_id for update;
  if not found or r.ended_at is not null or r.status = 'rejected' then
    return r;
  end if;

  h := public.report_half_life_h(r.type);
  select
    coalesce(sum(s.weight * power(0.5, extract(epoch from now() - s.created_at) / 3600.0 / h)) filter (where s.weight > 0), 0),
    coalesce(sum(-s.weight * power(0.5, extract(epoch from now() - s.created_at) / 3600.0 / h)) filter (where s.weight < 0), 0),
    max(s.created_at) filter (where s.weight > 0),
    count(distinct coalesce(s.user_id::text, s.source)) filter (where s.weight > 0)
  into support, against, newest, sources
  from public.road_report_signals s
  where s.report_id = p_id;

  if r.source = 'scout' then
    support := support + 3.0 * power(0.5, extract(epoch from now() - r.created_at) / 3600.0 / h);
  end if;

  net := support - 1.25 * against;
  score := 1 - exp(-greatest(0, net) / k);
  is_live := r.status = 'verified';

  -- Going live.
  if not is_live and score >= live_score then
    is_live := true;
    -- Backed by more than one source: everyone who backed it called it right.
    if sources >= 2 and not r.ever_live then
      select array_agg(user_id) into backers from public.road_report_signals
      where report_id = p_id and user_id is not null and weight > 0;
      perform public.bump_reputation(backers, 1, 0);
    end if;
    update public.road_reports
    set status = 'verified', ever_live = true
    where id = p_id;
  -- Ending: a live one faded or was voted away, or a candidate never caught on.
  elsif (is_live and score < end_score) or (not is_live and score < drop_score) then
    if against > 0 then
      -- Said it's gone, and it ended: they were right.
      select array_agg(user_id) into backers from public.road_report_signals
      where report_id = p_id and user_id is not null and weight < 0;
      perform public.bump_reputation(backers, 1, 0);
      -- Reported, never confirmed, and others said there was nothing there.
      if not r.ever_live then
        select array_agg(user_id) into backers from public.road_report_signals
        where report_id = p_id and user_id is not null and kind = 'report';
        perform public.bump_reputation(backers, 0, 1);
      end if;
    end if;
    update public.road_reports
    set ended_at = now(),
        expires_at = least(coalesce(expires_at, now()), now()),
        live_score = round(score::numeric, 3),
        confidence = round(score::numeric, 2),
        review_at = null,
        status = case when is_live then 'verified'::public.review_status else 'rejected'::public.review_status end,
        review_note = case when is_live then review_note else 'Not confirmed by other drivers' end
    where id = p_id
    returning * into r;
    return r;
  end if;

  -- Still going: when would it fade out if nobody says anything more? Then
  -- look again. net·0.5^(t/h) falls below the floor at t = h·log2(net/floor).
  floor_s := -k * ln(1 - case when is_live then end_score else drop_score end);
  hours_left := case when net > floor_s then h * ln(net / floor_s) / ln(2) else 0 end;
  hours_left := least(greatest(hours_left, 5 / 60.0), h * 8);

  update public.road_reports
  set live_score = round(score::numeric, 3),
      confidence = round(score::numeric, 2),
      last_signal_at = coalesce(newest, last_signal_at, created_at),
      review_at = now() + make_interval(secs => hours_left * 3600),
      -- A crowd report disappears shortly after its review time even if the
      -- review job never runs; a Scout report keeps its own expiry, or less.
      expires_at = case
        when r.source = 'crowd' then now() + make_interval(secs => hours_left * 3600) + interval '15 minutes'
        else least(coalesce(r.expires_at, 'infinity'::timestamptz), now() + make_interval(secs => hours_left * 3600) + interval '15 minutes')
      end
  where id = p_id
  returning * into r;
  return r;
end;
$$;

revoke execute on function public.recompute_road_report(uuid) from public, anon, authenticated;

-- ── What drivers call ─────────────────────────────────────────────────
create or replace function public.report_guard()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to report.' using errcode = '42501';
  end if;
  if public.is_suspended() then
    raise exception 'Your account is suspended, so you can''t report right now.' using errcode = 'PT403';
  end if;
  return auth.uid();
end;
$$;

revoke execute on function public.report_guard() from public, anon, authenticated;

-- A driver reports something where they are. If the same kind of thing is
-- already reported close by, their report counts towards that one instead of
-- making another. Returns { id, merged, live, score }.
create or replace function public.submit_road_report(
  p_type     text,
  p_lat      double precision,
  p_lng      double precision,
  p_severity integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid      uuid := public.report_guard();
  t        public.road_report_type;
  pt       geography;
  existing uuid;
  w        double precision;
  r        public.road_reports;
begin
  if p_type is null or p_type not in ('incident', 'traffic', 'closure', 'hazard', 'flooding', 'pothole', 'construction', 'surface') then
    raise exception 'Unknown report type.' using errcode = '22023';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'That location isn''t valid.' using errcode = '22023';
  end if;
  if p_severity is not null and p_severity not between 1 and 5 then
    raise exception 'Severity is 1 to 5.' using errcode = '22023';
  end if;
  if not public.consume_rate_limit('road_report_signals:' || uid, 20, interval '1 hour') then
    raise exception 'Too many reports in the last hour. Please try again later.' using errcode = 'P0429';
  end if;

  t := p_type::public.road_report_type;
  pt := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  w := public.reporter_weight(uid);

  -- The same thing, still open, nearby: a live report (crowd or Scout) or a
  -- crowd candidate.
  select rr.id into existing
  from public.road_reports rr
  where rr.type = t
    and rr.ended_at is null
    and ((rr.status = 'verified' and (rr.expires_at is null or rr.expires_at > now()))
         or (rr.status = 'pending' and rr.source = 'crowd'))
    and st_dwithin(rr.location, pt, public.report_merge_radius_m(t))
  order by rr.location <-> pt
  limit 1;

  if existing is null then
    insert into public.road_reports (type, severity, location, status, source, reported_by, last_signal_at)
    values (t, coalesce(p_severity, public.report_default_severity(t)), pt, 'pending', 'crowd', uid, now())
    returning id into existing;
    insert into public.road_report_signals (report_id, user_id, kind, weight)
    values (existing, uid, 'report', w);
  else
    -- Their latest say counts once: reporting again refreshes it.
    insert into public.road_report_signals (report_id, user_id, kind, weight)
    values (existing, uid, 'confirm', w)
    on conflict (report_id, user_id) where user_id is not null
    do update set kind = case when public.road_report_signals.kind = 'report' then 'report' else 'confirm' end,
                  weight = excluded.weight,
                  created_at = now();
  end if;

  r := public.recompute_road_report(existing);
  return jsonb_build_object(
    'id', r.id,
    'merged', r.reported_by is distinct from uid,
    'live', r.status = 'verified' and r.ended_at is null,
    'score', r.live_score
  );
end;
$$;

revoke execute on function public.submit_road_report(text, double precision, double precision, integer) from public, anon;
grant execute on function public.submit_road_report(text, double precision, double precision, integer) to authenticated;

-- "Still there?" — yes or no from a driver passing a report (live, or a crowd
-- candidate waiting for confirmation). Returns { id, live, ended, score }.
create or replace function public.vote_road_report(p_id uuid, p_still_there boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := public.report_guard();
  r   public.road_reports;
  w   double precision;
begin
  if p_still_there is null then
    raise exception 'Say whether it''s still there.' using errcode = '22023';
  end if;
  select * into r from public.road_reports where id = p_id;
  if not found
     or r.ended_at is not null
     or not ((r.status = 'verified' and (r.expires_at is null or r.expires_at > now()))
             or (r.status = 'pending' and r.source = 'crowd')) then
    raise exception 'That report has already ended.' using errcode = 'P0002';
  end if;
  if not public.consume_rate_limit('road_report_votes:' || uid, 60, interval '1 hour') then
    raise exception 'Too many answers in the last hour. Please try again later.' using errcode = 'P0429';
  end if;

  w := public.reporter_weight(uid);
  insert into public.road_report_signals (report_id, user_id, kind, weight)
  values (p_id, uid, case when p_still_there then 'confirm' else 'deny' end, case when p_still_there then w else -w end)
  on conflict (report_id, user_id) where user_id is not null
  do update set kind = case when p_still_there and public.road_report_signals.kind = 'report' then 'report'
                            else excluded.kind end,
                weight = excluded.weight,
                created_at = now();

  r := public.recompute_road_report(p_id);
  return jsonb_build_object(
    'id', r.id,
    'live', r.status = 'verified' and r.ended_at is null,
    'ended', r.ended_at is not null,
    'score', r.live_score
  );
end;
$$;

revoke execute on function public.vote_road_report(uuid, boolean) from public, anon;
grant execute on function public.vote_road_report(uuid, boolean) to authenticated;

-- What the report sheet shows about one live report: where it came from, how
-- sure PathIQ is, how many drivers backed it or said it's gone, and the
-- caller's own answer. Never who reported it.
create or replace function public.road_report_status(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id,
    'source', r.source,
    'score', r.live_score,
    'live', r.status = 'verified' and r.ended_at is null and (r.expires_at is null or r.expires_at > now()),
    'confirmations', (select count(*) from public.road_report_signals s where s.report_id = r.id and s.user_id is not null and s.weight > 0),
    'denials', (select count(*) from public.road_report_signals s where s.report_id = r.id and s.user_id is not null and s.weight < 0),
    'google_traffic', exists (select 1 from public.road_report_signals s
                              where s.report_id = r.id and s.source = 'google_traffic' and s.weight > 0
                                and s.created_at > now() - interval '30 minutes'),
    'last_signal_at', coalesce(r.last_signal_at, r.created_at),
    'review_at', r.review_at,
    'my_vote', (select case when s.weight > 0 then 'yes' else 'no' end
                from public.road_report_signals s where s.report_id = r.id and s.user_id = auth.uid())
  )
  from public.road_reports r
  where r.id = p_id
    and auth.uid() is not null
    and ((r.status = 'verified' and r.ended_at is null and (r.expires_at is null or r.expires_at > now()))
         or (r.status = 'pending' and r.source = 'crowd' and r.ended_at is null));
$$;

revoke execute on function public.road_report_status(uuid) from public, anon;
grant execute on function public.road_report_status(uuid) to authenticated;

-- Open reports along a route that the driver could say something about as
-- they pass: live ones that change (not potholes) and crowd candidates still
-- waiting for someone to confirm them. Leaves out ones they've answered.
create or replace function public.reports_to_confirm_along_route(route_wkt text, corridor_m integer default 60)
returns table (
  id             uuid,
  type           public.road_report_type,
  severity       smallint,
  live           boolean,
  lng            double precision,
  lat            double precision,
  route_fraction double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with line as (select st_geomfromtext(route_wkt, 4326) as g)
  select
    rr.id, rr.type, rr.severity,
    rr.status = 'verified',
    st_x(rr.location::geometry), st_y(rr.location::geometry),
    st_linelocatepoint(line.g, rr.location::geometry)
  from public.road_reports rr, line
  where auth.uid() is not null
    and rr.ended_at is null
    and ((rr.status = 'verified' and (rr.expires_at is null or rr.expires_at > now())
          and rr.type::text not in ('pothole', 'surface'))
         or (rr.status = 'pending' and rr.source = 'crowd'))
    and st_dwithin(rr.location, line.g::geography, least(greatest(corridor_m, 10), 200))
    and not exists (select 1 from public.road_report_signals s where s.report_id = rr.id and s.user_id = auth.uid())
  order by 7
  limit 50;
$$;

revoke execute on function public.reports_to_confirm_along_route(text, integer) from public, anon;
grant execute on function public.reports_to_confirm_along_route(text, integer) to authenticated;

-- ── Google's live traffic as evidence ─────────────────────────────────
-- Called by the routes function (service role) with a route it just got
-- from Google, as WKT: the whole line, and its slow and jammed stretches
-- (null when there are none). For open crowd reports of things that slow
-- traffic down, close to that route:
--   on a jammed stretch  +1.0      on a slow stretch  +0.6
--   on a free-flowing stretch, for a "heavy traffic" report: −0.6
-- (free-flowing traffic doesn't rule out a crash on the verge, so other
-- kinds aren't marked down). At most one reading per report per 10 minutes,
-- however many drivers ask for routes past it. Returns how many it touched.
create or replace function public.apply_traffic_evidence(
  p_route_wkt text,
  p_slow_wkt  text default null,
  p_jam_wkt   text default null
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  route geography := st_geomfromtext(p_route_wkt, 4326)::geography;
  slow  geography := case when p_slow_wkt is null then null else st_geomfromtext(p_slow_wkt, 4326)::geography end;
  jam   geography := case when p_jam_wkt is null then null else st_geomfromtext(p_jam_wkt, 4326)::geography end;
  rec   record;
  w     double precision;
  n     integer := 0;
begin
  for rec in
    select rr.id, rr.type, rr.location
    from public.road_reports rr
    where rr.source = 'crowd'
      and rr.ended_at is null
      and rr.status in ('pending', 'verified')
      and rr.type::text in ('traffic', 'incident', 'closure', 'hazard', 'flooding')
      and st_dwithin(rr.location, route, 60)
      and not exists (select 1 from public.road_report_signals s
                      where s.report_id = rr.id and s.source = 'google_traffic'
                        and s.created_at > now() - interval '10 minutes')
    limit 100
  loop
    w := case
      when jam is not null and st_dwithin(rec.location, jam, 75) then 1.0
      when slow is not null and st_dwithin(rec.location, slow, 75) then 0.6
      when rec.type::text = 'traffic' then -0.6
      else null
    end;
    continue when w is null;
    insert into public.road_report_signals (report_id, user_id, kind, source, weight)
    values (rec.id, null, 'evidence', 'google_traffic', w);
    perform public.recompute_road_report(rec.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.apply_traffic_evidence(text, text, text) from public, anon, authenticated;
grant execute on function public.apply_traffic_evidence(text, text, text) to service_role;

-- ── Automatic review ──────────────────────────────────────────────────
-- Re-scores every open report whose review time has come: ends the ones
-- nobody has backed up since, and pushes the rest's review further out.
create or replace function public.review_live_road_reports()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  n   integer := 0;
begin
  for rid in
    select id from public.road_reports
    where ended_at is null and review_at is not null and review_at <= now()
    order by review_at
    limit 1000
  loop
    perform public.recompute_road_report(rid);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.review_live_road_reports() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('pathiq-review-live-road-reports', '*/5 * * * *', 'select public.review_live_road_reports()');
  end if;
end;
$$;

-- ── Route scoring ages a crowd report from its last confirmation ──────
create or replace function public.road_reports_along_route(
  route_wkt  text,
  corridor_m integer default 50
)
returns table (
  id                    uuid,
  type                  public.road_report_type,
  severity              smallint,
  confidence            numeric,
  lng                   double precision,
  lat                   double precision,
  created_at            timestamptz,
  distance_from_route_m double precision,
  route_fraction        double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with r as (
    select st_geomfromtext(route_wkt, 4326) as line
  )
  select
    rr.id,
    rr.type,
    rr.severity,
    rr.confidence,
    st_x(rr.location::geometry),
    st_y(rr.location::geometry),
    coalesce(rr.last_signal_at, rr.created_at),
    st_distance(rr.location, r.line::geography),
    st_linelocatepoint(r.line, rr.location::geometry)
  from public.road_reports rr, r
  where rr.status = 'verified'
    and rr.ended_at is null
    and (rr.expires_at is null or rr.expires_at > now())
    and st_dwithin(rr.location, r.line::geography, corridor_m)
  order by 9
$$;

-- ── Admin: crowd candidates aren't a review queue ─────────────────────
-- They confirm or drop themselves within hours, so the admin queue and its
-- count only list Scout submissions. Live crowd reports still show (and can
-- be edited or cleared) like any other.
create or replace function public.admin_road_reports(
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
    and not (r.source = 'crowd' and r.status in ('pending', 'rejected'))
  order by
    case when p_status = 'pending' then r.created_at end asc,
    r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- review_road_report only acts on pending Scout submissions, not candidates.
-- (A crowd candidate's id isn't in the admin queue, but be explicit.)
create or replace function public.block_crowd_review()
returns trigger
language plpgsql
as $$
begin
  if old.source = 'crowd' and old.status = 'pending' and new.status <> old.status
     and new.reviewed_by is not null and new.reviewed_by is distinct from old.reviewed_by then
    raise exception 'Driver reports confirm themselves; edit it once it''s live.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists road_reports_block_crowd_review on public.road_reports;
create trigger road_reports_block_crowd_review
  before update on public.road_reports
  for each row execute function public.block_crowd_review();

-- The overview's pending count, likewise (otherwise as in 20261002000000).
create or replace function public.admin_overview()
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
    'pending_reports', (select count(*) from public.road_reports where status = 'pending' and source <> 'crowd'),
    'pending_applications', (select count(*) from public.scout_applications where status = 'pending'),
    'oldest_pending_at', (select min(created_at) from (
        select created_at from public.gems where status = 'pending'
        union all select created_at from public.road_reports where status = 'pending' and source <> 'crowd'
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
