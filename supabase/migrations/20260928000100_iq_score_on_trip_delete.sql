-- Removing a trip from History should update the IQ Score straight away, not
-- only when the next trip ends.

create function public.refresh_iq_score_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set iq_score = public.compute_iq_score(old.user_id)
   where id = old.user_id;
  return old;
end;
$$;

revoke execute on function public.refresh_iq_score_after_delete() from public, anon, authenticated;

create trigger trips_refresh_iq_score_on_delete
  after delete on public.trips
  for each row
  when (old.ended_at is not null)
  execute function public.refresh_iq_score_after_delete();
