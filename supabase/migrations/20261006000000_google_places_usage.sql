-- Google Places (the `places` edge function) is counted in the same daily
-- usage table as routes, so the admin Usage panel can show both and estimate
-- the bill. Safe to re-run.

alter table public.route_usage_daily drop constraint if exists route_usage_daily_outcome_check;
alter table public.route_usage_daily add constraint route_usage_daily_outcome_check
  check (outcome in (
    'google', 'google_traffic', 'cache', 'limited', 'error',
    'places', 'places_cache', 'places_limited', 'places_error'
  ));

-- What Google charges per 1,000 Places searches (Text / Nearby Search with
-- rating fields). An estimate; admins can edit it on the Usage panel.
update public.app_settings
set value = value || '{"places": 35}'::jsonb
where key = 'routes_usd_per_1000' and not value ? 'places';
