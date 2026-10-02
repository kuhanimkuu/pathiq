-- Sign in with Google.
--
-- New profiles from Google get the person's Google name as their display
-- name (Google puts it in the user metadata as full_name / name). Usernames
-- are unique and Google doesn't provide one, so Google sign-ups get the same
-- user_<id> fallback as before; they can change it on their profile.
--
-- Guests who link Google keep their existing profile; the app fills in an
-- empty display name from Google then (AuthProvider.jsx).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(nullif(meta ->> 'username', ''), 'user_' || left(new.id::text, 8)),
    left(coalesce(
      nullif(btrim(meta ->> 'username'), ''),
      nullif(btrim(meta ->> 'full_name'), ''),
      nullif(btrim(meta ->> 'name'), '')
    ), 60)
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
