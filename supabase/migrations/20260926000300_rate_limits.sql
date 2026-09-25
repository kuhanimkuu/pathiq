-- Rate limiting for everything that costs money or can be spammed.
--
-- Supabase Auth already limits sign-ins per IP (config.toml [auth.rate_limit]:
-- 30 anonymous sign-ups per hour, 30 sign-in/sign-up attempts per 5 minutes).
-- This adds limits for PathIQ's own writes and for the billed `routes` edge
-- function, using fixed-window counters in Postgres: no extra infrastructure,
-- and fine at this scale.

create table public.rate_limit_hits (
  key          text        not null,  -- e.g. 'routes:user:<uuid>', 'trips:<uuid>'
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, window_start)
);

-- Server-only: RLS on with no policies, and no table grants for clients.
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

-- Counts one hit against `p_key` and returns true while the key is within
-- `p_max` hits per `p_window`. Also sweeps windows older than a day, now and
-- then, so the table stays small.
create function public.consume_rate_limit(p_key text, p_max integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  win   timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01');
  count integer;
begin
  insert into public.rate_limit_hits as r (key, window_start, hits)
  values (p_key, win, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into count;

  if random() < 0.01 then
    delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  end if;

  return count <= p_max;
end;
$$;

-- Only the edge function (service role) and the triggers below call it.
revoke execute on function public.consume_rate_limit(text, integer, interval) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, interval) to service_role;

-- Per-user limits on client writes. Generous for real use, tight enough to
-- stop scripted spam. Service-role writes (seeding, admin tools) are exempt.
--   trips          30 per hour   (a trip is one navigation session)
--   road_reports   30 per hour   (Scouts; each is reviewed by hand)
--   gems           20 per hour   (Scouts; each is reviewed by hand)
--   scout photos   40 per hour   (uploads to storage)
create function public.enforce_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_per_hour integer := tg_argv[0]::integer;
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.consume_rate_limit(tg_table_name || ':' || auth.uid(), max_per_hour, interval '1 hour') then
    raise exception 'Too many % in the last hour. Please try again later.', replace(tg_table_name, '_', ' ')
      using errcode = 'P0429';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_write_rate_limit() from public, anon, authenticated;

create trigger trips_rate_limit
  before insert on public.trips
  for each row execute function public.enforce_write_rate_limit('30');

create trigger road_reports_rate_limit
  before insert on public.road_reports
  for each row execute function public.enforce_write_rate_limit('30');

create trigger gems_rate_limit
  before insert on public.gems
  for each row execute function public.enforce_write_rate_limit('20');

-- storage.objects is Supabase-managed; limit uploads into our bucket only.
create function public.enforce_photo_upload_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bucket_id <> 'scout-photos' or auth.uid() is null then
    return new;
  end if;
  if not public.consume_rate_limit('scout-photos:' || auth.uid(), 40, interval '1 hour') then
    raise exception 'Too many photo uploads in the last hour. Please try again later.' using errcode = 'P0429';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_photo_upload_rate_limit() from public, anon, authenticated;

create trigger scout_photos_rate_limit
  before insert on storage.objects
  for each row execute function public.enforce_photo_upload_rate_limit();

-- Size and type limits on the photo bucket itself: images only, 8 MB max
-- (the app shrinks photos to ~1600px JPEG before upload; this is the backstop).
update storage.buckets
   set file_size_limit = 8 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 where id = 'scout-photos';
