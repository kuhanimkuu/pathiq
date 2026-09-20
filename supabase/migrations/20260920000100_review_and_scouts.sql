-- PathIQ Navigators: Scout applications, the admin review workflow and payouts.
--
-- Scouts submit pending gems and road reports. Admins approve or reject them
-- through the functions below, which also create the Scout's earning at the
-- rate in task_rates. Clients call these with supabase.rpc(...).

-- =====================================================================
-- M-Pesa number on the profile
-- =====================================================================

-- Kenyan mobile numbers in 254XXXXXXXXX format, for example 254712345678.
alter table public.profiles
  add column mpesa_phone text check (mpesa_phone ~ '^254[17][0-9]{8}$');

grant update (mpesa_phone) on public.profiles to authenticated;

-- =====================================================================
-- Scout applications
-- =====================================================================

-- One application per user. status reuses review_status: 'verified' means approved.
create table public.scout_applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.profiles (id) on delete cascade,
  area        text not null,
  motivation  text,
  mpesa_phone text not null check (mpesa_phone ~ '^254[17][0-9]{8}$'),
  status      public.review_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.scout_applications enable row level security;

create policy "scout_applications: read own or admin" on public.scout_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "scout_applications: apply once as a driver" on public.scout_applications
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and not public.is_scout());

-- Reviews go through review_scout_application(), so there is no update policy.

-- =====================================================================
-- One earning per gem or report
-- =====================================================================

create unique index scout_earnings_gem_uniq
  on public.scout_earnings (gem_id) where gem_id is not null;
create unique index scout_earnings_road_report_uniq
  on public.scout_earnings (road_report_id) where road_report_id is not null;

-- =====================================================================
-- How long a verified road report stays relevant
-- =====================================================================

create function public.road_report_ttl(t public.road_report_type)
returns interval
language sql
immutable
as $$
  select case t
    when 'pothole'      then interval '180 days'
    when 'surface'      then interval '365 days'
    when 'construction' then interval '90 days'
    when 'flooding'     then interval '3 days'
    when 'incident'     then interval '1 day'
  end;
$$;

-- =====================================================================
-- Admin review functions
-- =====================================================================

create function public.review_scout_application(p_application_id uuid, p_approve boolean)
returns public.scout_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  app public.scout_applications;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  update public.scout_applications
  set status = case when p_approve then 'verified'::public.review_status else 'rejected'::public.review_status end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_application_id and status = 'pending'
  returning * into app;

  if not found then
    raise exception 'application not found or already reviewed' using errcode = 'P0002';
  end if;

  if p_approve then
    update public.profiles
    set role = 'scout', mpesa_phone = app.mpesa_phone
    where id = app.user_id and role = 'driver';
  end if;

  return app;
end;
$$;

-- Approve or reject a pending gem. Approving a gem a Scout submitted creates
-- an approved earning at the task's rate.
create function public.review_gem(
  p_gem_id  uuid,
  p_approve boolean,
  p_task    public.earning_task default 'gem_discovery'
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
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  update public.gems
  set status = case when p_approve then 'verified'::public.review_status else 'rejected'::public.review_status end,
      verified_by = auth.uid()
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

-- Approve or reject a pending road report. Approving sets its expiry from its
-- type and creates the Scout's earning.
create function public.review_road_report(
  p_report_id uuid,
  p_approve   boolean,
  p_task      public.earning_task default 'road_report'
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
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  update public.road_reports
  set status = case when p_approve then 'verified'::public.review_status else 'rejected'::public.review_status end,
      reviewed_by = auth.uid(),
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

-- Record that an approved earning was paid out through M-Pesa.
create function public.mark_earning_paid(p_earning_id uuid, p_mpesa_ref text)
returns public.scout_earnings
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.scout_earnings;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if coalesce(trim(p_mpesa_ref), '') = '' then
    raise exception 'an M-Pesa reference is required' using errcode = '22023';
  end if;

  update public.scout_earnings
  set status = 'paid', paid_at = now(), mpesa_ref = trim(p_mpesa_ref)
  where id = p_earning_id and status = 'approved'
  returning * into e;

  if not found then
    raise exception 'earning not found or not awaiting payment' using errcode = 'P0002';
  end if;

  return e;
end;
$$;

-- Only signed-in users can call these, and each checks for admin itself.
revoke execute on function public.review_scout_application(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.review_gem(uuid, boolean, public.earning_task) from public, anon, authenticated;
revoke execute on function public.review_road_report(uuid, boolean, public.earning_task) from public, anon, authenticated;
revoke execute on function public.mark_earning_paid(uuid, text) from public, anon, authenticated;

grant execute on function public.review_scout_application(uuid, boolean) to authenticated;
grant execute on function public.review_gem(uuid, boolean, public.earning_task) to authenticated;
grant execute on function public.review_road_report(uuid, boolean, public.earning_task) to authenticated;
grant execute on function public.mark_earning_paid(uuid, text) to authenticated;
