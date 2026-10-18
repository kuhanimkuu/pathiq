-- PathIQ AI briefings (the `briefing` edge function, which calls Claude) are
-- counted in the same daily usage table as routes and places, so the admin
-- Usage panel can show them and estimate the bill. Safe to re-run.

alter table public.route_usage_daily drop constraint if exists route_usage_daily_outcome_check;
alter table public.route_usage_daily add constraint route_usage_daily_outcome_check
  check (outcome in (
    'google', 'google_traffic', 'cache', 'limited', 'error',
    'places', 'places_cache', 'places_limited', 'places_error',
    'ai_briefing', 'ai_briefing_limited', 'ai_briefing_error'
  ));

-- Roughly what 1,000 briefings cost on Claude Opus 5.5 at low effort
-- (~1.5K tokens in, ~0.5K out each). An estimate; admins can edit it.
update public.app_settings
set value = value || '{"ai_briefing": 16}'::jsonb
where key = 'routes_usd_per_1000' and not value ? 'ai_briefing';
