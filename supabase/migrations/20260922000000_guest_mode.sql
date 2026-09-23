-- Guest mode: drivers can use the app via Supabase anonymous auth
-- (supabase.auth.signInAnonymously()) without creating an account. Because it
-- issues a normal 'authenticated' session, every existing RLS policy already
-- covers guests: they can read verified gems and reports, save gems, and take
-- trips, all keyed to their anonymous auth.uid().
--
-- The one thing a guest must not do is become a Scout, since Scouts are paid
-- via M-Pesa and need a durable identity.

create function public.is_anonymous_caller()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

drop policy "scout_applications: apply once as a driver" on public.scout_applications;

create policy "scout_applications: apply once as a driver" on public.scout_applications
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and not public.is_scout()
    and not public.is_anonymous_caller()
  );

-- Belt and braces: review_scout_application already requires an admin caller,
-- but also refuse to ever promote an anonymous user to scout.
create or replace function public.review_scout_application(p_application_id uuid, p_approve boolean)
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
    update public.profiles p
    set role = 'scout', mpesa_phone = app.mpesa_phone
    from auth.users u
    where p.id = app.user_id
      and p.role = 'driver'
      and u.id = p.id
      and coalesce((u.is_anonymous), false) = false;
  end if;

  return app;
end;
$$;
