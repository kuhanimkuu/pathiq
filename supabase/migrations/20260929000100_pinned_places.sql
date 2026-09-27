-- Pinned places: spots a driver saves on the map ("Home", "Work", a
-- friend's gate, a parking spot), shown on the map and offered first in
-- search. Private to the driver, guests included (like saved gems).

create type public.pin_label as enum ('home', 'work', 'other');

create table public.pinned_places (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  label      public.pin_label not null default 'other',
  location   geography(point, 4326) not null,
  created_at timestamptz not null default now()
);

create index pinned_places_user_idx on public.pinned_places (user_id, created_at desc);
-- One Home and one Work per driver.
create unique index pinned_places_one_home_work on public.pinned_places (user_id, label)
  where label in ('home', 'work');

alter table public.pinned_places enable row level security;

create policy "pinned_places: manage own" on public.pinned_places
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Choosing a new Home (or Work) turns the old one into a plain pin, so the
-- driver never hits the unique index. Runs as the caller: RLS still applies.
-- Also caps how many pins one driver can keep.
create function public.pinned_places_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.pinned_places where user_id = new.user_id) >= 100 then
    raise exception 'You can pin up to 100 places. Remove one to pin another.' using errcode = 'P0001';
  end if;
  if new.label in ('home', 'work') then
    update public.pinned_places
       set label = 'other'
     where user_id = new.user_id and label = new.label and id <> new.id;
  end if;
  return new;
end;
$$;

create trigger pinned_places_before_write
  before insert or update of label on public.pinned_places
  for each row execute function public.pinned_places_before_write();

-- Same per-user write limit as the other client tables (rate_limits migration).
create trigger pinned_places_rate_limit
  before insert on public.pinned_places
  for each row execute function public.enforce_write_rate_limit('60');

-- The driver's pins with plain coordinates, Home and Work first.
create function public.my_pinned_places()
returns table (
  id         uuid,
  name       text,
  label      public.pin_label,
  lat        double precision,
  lng        double precision,
  created_at timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  select p.id, p.name, p.label, st_y(p.location::geometry), st_x(p.location::geometry), p.created_at
  from public.pinned_places p
  where p.user_id = auth.uid()
  order by (p.label = 'home') desc, (p.label = 'work') desc, p.created_at desc
$$;

revoke execute on function public.my_pinned_places() from public, anon;
grant execute on function public.my_pinned_places() to authenticated;
