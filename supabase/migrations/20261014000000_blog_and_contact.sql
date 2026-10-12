-- Company pages: the blog (written by admins in the dashboard) and the
-- contact form's inbox.
--
--   blog_posts        anyone reads published posts; only admins write
--   blog-images       public bucket for cover and inline images; admins upload
--   contact_messages  written only through submit_contact_message (rate
--                     limited per IP and overall); only admins read
--
-- Admin writes are logged in admin_audit_log, as everywhere else.

-- =====================================================================
-- Blog
-- =====================================================================

create table public.blog_posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique
               check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title        text not null check (char_length(title) between 1 and 160),
  excerpt      text check (char_length(excerpt) <= 300),
  body         text not null default '' check (char_length(body) <= 100000), -- Markdown
  cover_path   text check (char_length(cover_path) <= 300),                  -- object in blog-images
  author_id    uuid references public.profiles (id) on delete set null default auth.uid(),
  author_name  text check (char_length(author_name) <= 80),                  -- shown on the post
  status       text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index blog_posts_published_idx on public.blog_posts (published_at desc) where status = 'published';

-- Keeps updated_at current, and stamps published_at the first time a post
-- goes live (an admin can still set it to schedule or backdate).
create function public.blog_posts_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger blog_posts_touch before insert or update on public.blog_posts
  for each row execute function public.blog_posts_touch();

alter table public.blog_posts enable row level security;

create policy "blog_posts: anyone reads published" on public.blog_posts
  for select to anon
  using (status = 'published' and published_at <= now());
create policy "blog_posts: read published, admins read all" on public.blog_posts
  for select to authenticated
  using ((status = 'published' and published_at <= now()) or public.is_admin());
create policy "blog_posts: admins insert" on public.blog_posts
  for insert to authenticated with check (public.is_admin());
create policy "blog_posts: admins update" on public.blog_posts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "blog_posts: admins delete" on public.blog_posts
  for delete to authenticated using (public.is_admin());

revoke all on public.blog_posts from anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

-- =====================================================================
-- Blog images (public bucket)
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-images', 'blog-images', true, 5 * 1024 * 1024,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "blog-images: admins upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blog-images' and public.is_admin());
create policy "blog-images: admins update" on storage.objects
  for update to authenticated
  using (bucket_id = 'blog-images' and public.is_admin());
create policy "blog-images: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog-images' and public.is_admin());

-- =====================================================================
-- Contact messages
-- =====================================================================

create table public.contact_messages (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 100),
  email      text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  topic      text not null check (topic in ('general', 'support', 'press', 'careers', 'partnerships', 'privacy')),
  message    text not null check (char_length(message) between 10 and 5000),
  user_id    uuid references public.profiles (id) on delete set null, -- when sent while signed in
  status     text not null default 'new' check (status in ('new', 'done')),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index contact_messages_created_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

create policy "contact_messages: admins read" on public.contact_messages
  for select to authenticated using (public.is_admin());
create policy "contact_messages: admins update" on public.contact_messages
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "contact_messages: admins delete" on public.contact_messages
  for delete to authenticated using (public.is_admin());

revoke all on public.contact_messages from anon, authenticated;
grant select, delete on public.contact_messages to authenticated;
grant update (status, handled_at) on public.contact_messages to authenticated;

-- The contact form. Open to everyone (visitors aren't signed in), so it's
-- limited per IP address and across the whole site.
create function public.submit_contact_message(p_name text, p_email text, p_topic text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- First address in X-Forwarded-For is the visitor's, as Supabase's proxy sets it.
  ip text := coalesce(
    nullif(trim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)), ''),
    'unknown');
begin
  -- Counted under a hash of the address, so rate_limit_hits (swept after a
  -- day) never holds the address itself.
  if not public.consume_rate_limit('contact:' || md5('pathiq-contact:' || ip), 5, interval '1 hour')
     or not public.consume_rate_limit('contact:all', 200, interval '1 hour') then
    raise exception 'Too many messages in the last hour. Please try again later.' using errcode = 'PT429';
  end if;
  insert into public.contact_messages (name, email, topic, message, user_id)
  values (trim(p_name), lower(trim(p_email)), p_topic, trim(p_message), auth.uid());
end;
$$;

revoke execute on function public.submit_contact_message(text, text, text, text) from public;
grant execute on function public.submit_contact_message(text, text, text, text) to anon, authenticated;

-- =====================================================================
-- Audit log
-- =====================================================================

-- Blog posts: what changed, by name (not the post body, which can be long).
-- Contact messages: marked done or deleted (not the message itself).
create function public.audit_company_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o       jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n       jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r       jsonb := coalesce(n, o);
  changed jsonb := '[]'::jsonb;
  act     text;
  k       text;
begin
  if auth.uid() is null or not public.is_admin() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at', 'handled_at') and (o -> k) is distinct from (n -> k) then
        changed := changed || to_jsonb(k);
      end if;
    end loop;
    if changed = '[]'::jsonb then
      return null;
    end if;
    act := case when changed ? 'status' then 'status:' || (n ->> 'status') else 'update' end;
  else
    act := case when tg_op = 'INSERT' then 'create' else 'delete' end;
  end if;
  insert into public.admin_audit_log (admin_id, action, target_table, target_id, summary, details)
  values (
    auth.uid(), act, tg_table_name, r ->> 'id',
    case tg_table_name when 'blog_posts' then r ->> 'title' else (r ->> 'topic') || ' from ' || (r ->> 'email') end,
    case when tg_op = 'UPDATE' then jsonb_build_object('changed', changed) else '{}'::jsonb end
  );
  return null;
end;
$$;

revoke execute on function public.audit_company_write() from public, anon, authenticated;

create trigger blog_posts_audit after insert or update or delete on public.blog_posts
  for each row execute function public.audit_company_write();
create trigger contact_messages_audit after update or delete on public.contact_messages
  for each row execute function public.audit_company_write();

-- =====================================================================
-- Retention: handled messages are deleted after a year
-- =====================================================================

create function public.delete_old_contact_messages()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.contact_messages
     where status = 'done' and coalesce(handled_at, created_at) < now() - interval '365 days'
    returning 1
  )
  select count(*)::integer from gone;
$$;

revoke execute on function public.delete_old_contact_messages() from public, anon, authenticated;
grant execute on function public.delete_old_contact_messages() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pathiq-delete-old-contact-messages', '30 1 * * *', 'select public.delete_old_contact_messages()');
  end if;
end;
$$;
