-- RLS hardening for trip tracking and Scout photos.
--
-- Trips now feed the IQ Score, so "manage own" (any insert/update/delete on
-- your own rows) is too loose: a driver could insert already-finished trips,
-- backdate them, or rewrite a closed trip. Now:
--   * a trip can only be inserted open (no end time, not arrived, no reroutes),
--     and its start time is always the server's now()
--   * only ended_at, arrived and reroutes can be updated; ended_at is stamped
--     by the server, reroutes can only go up, and a closed trip is frozen
--   * deleting your own trips stays allowed (your data, your call)
-- Still self-reported, and documented as such: road_quality at start, and
-- whether you arrived. Verifying those needs server-side trip tracking.

drop policy "trips: manage own" on public.trips;

create policy "trips: read own" on public.trips
  for select to authenticated
  using (user_id = auth.uid());

create policy "trips: start own, open" on public.trips
  for insert to authenticated
  with check (user_id = auth.uid() and ended_at is null and not arrived and reroutes = 0);

create policy "trips: update own" on public.trips
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "trips: delete own" on public.trips
  for delete to authenticated
  using (user_id = auth.uid());

revoke update on public.trips from authenticated;
grant update (ended_at, arrived, reroutes) on public.trips to authenticated;

create function public.trips_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.started_at := now();
    return new;
  end if;

  if old.ended_at is not null then
    raise exception 'trip % has already ended', old.id using errcode = 'check_violation';
  end if;
  if new.reroutes < old.reroutes then
    raise exception 'reroutes can only increase' using errcode = 'check_violation';
  end if;
  if new.arrived and new.ended_at is null then
    raise exception 'a trip is marked arrived only when it ends' using errcode = 'check_violation';
  end if;
  if new.ended_at is not null then
    new.ended_at := now();
  end if;
  return new;
end;
$$;

create trigger trips_guard
  before insert or update on public.trips
  for each row execute function public.trips_guard();

-- Gem events only while the trip is still running, so "gems found" can't be
-- padded after the fact. No updates: an event either happened or it didn't.
drop policy "trip_gem_events: manage own" on public.trip_gem_events;

create policy "trip_gem_events: read own" on public.trip_gem_events
  for select to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

create policy "trip_gem_events: add to own open trip" on public.trip_gem_events
  for insert to authenticated
  with check (exists (
    select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid() and t.ended_at is null
  ));

create policy "trip_gem_events: delete own" on public.trip_gem_events
  for delete to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- Function grants: Postgres gives EXECUTE to PUBLIC by default. Match the
-- earlier migrations — nothing callable by anon, and trigger/internal
-- functions not callable by clients at all.
revoke execute on function public.refresh_iq_score() from public, anon, authenticated;
revoke execute on function public.trips_guard() from public, anon, authenticated;
revoke execute on function public.compute_iq_score(uuid) from public, anon, authenticated;
revoke execute on function public.my_driver_stats() from public, anon;
grant execute on function public.my_driver_stats() to authenticated;

-- A report or gem may only reference a photo in the submitter's own folder
-- of scout-photos (the storage policy already limits uploads to that folder).
-- Checked on insert only, and not as a CHECK constraint: those re-run on every
-- update, where auth.uid() is the admin reviewing the row, not the submitter.
create function public.check_photo_path_is_own()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.photo_path is not null
     and auth.uid() is not null  -- service role / seeding
     and new.photo_path not like auth.uid()::text || '/%' then
    raise exception 'photo must be one you uploaded' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_photo_path_is_own() from public, anon, authenticated;

create trigger road_reports_photo_own
  before insert on public.road_reports
  for each row execute function public.check_photo_path_is_own();

create trigger gems_photo_own
  before insert on public.gems
  for each row execute function public.check_photo_path_is_own();
