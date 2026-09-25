-- Rate-limit errors as HTTP 429 instead of 500: PostgREST maps SQLSTATE
-- 'PT<status>' straight to that HTTP status.

create or replace function public.enforce_write_rate_limit()
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
      using errcode = 'PT429';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_photo_upload_rate_limit()
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
    raise exception 'Too many photo uploads in the last hour. Please try again later.' using errcode = 'PT429';
  end if;
  return new;
end;
$$;
